import { APP_DISPLAY_NAME } from '../shared/branding.js';
import { createHash, createPublicKey, randomBytes, randomUUID, timingSafeEqual, verify } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChatGPTConnection, ModelOption } from '../shared/contracts.js';
import type { CredentialStore } from './providers.js';

const AUTH = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const DISCOVERY = `${AUTH}/.well-known/openid-configuration`;
const AUTHORIZE = `${AUTH}/api/accounts/authorize`;
const TOKEN = `${AUTH}/api/accounts/oauth/token`;
const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const DIRECT_SCOPE = 'chatgpt.tokens.use.direct';
const CREDENTIAL = 'provider:chatgpt';
const REAUTHORIZE = new Set(['invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired', 'refresh_token_invalidated', 'refresh_token_reused']);
interface Discovery { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string; revocation_endpoint?: string; }
interface Registration {
  version: 1; hostId: string; clientId?: string; subject?: string; email?: string; issuer?: string;
  accessToken?: string; refreshToken?: string; idToken?: string; expiresAt?: number; scopes: string[]; models: ModelOption[];
}
interface Identity { sub: string; email?: string; iss: string; }
export interface ChatGPTAuthOptions {
  openBrowser(url: string): Promise<void>; onChange?(): void; fetch?: typeof fetch; now?: () => number; timeoutMs?: number;
}
class OAuthFailure extends Error { constructor(message: string, readonly code?: string, readonly status?: number) { super(message); } }
const random = (bytes = 32) => randomBytes(bytes).toString('base64url');
function equal(left: string, right: string): boolean { const a = Buffer.from(left), b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
function object(value: unknown): value is Record<string, any> { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
function short(value: unknown, max: number): value is string { return typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value); }
function trustedAuthUrl(value: unknown): string {
  if (typeof value !== 'string') throw new OAuthFailure('OpenAI hat eine unvollständige Anmeldekonfiguration geliefert.');
  const url = new URL(value);
  if (url.origin !== AUTH || url.username || url.password || url.search || url.hash) throw new OAuthFailure('OpenAI-Anmeldekonfiguration konnte nicht bestätigt werden.');
  return url.href;
}
function aborted(signal?: AbortSignal): void { if (signal?.aborted) throw new OAuthFailure('ChatGPT-Anmeldung oder Anfrage wurde abgebrochen.'); }
function waitWithSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new OAuthFailure('ChatGPT-Anfrage wurde abgebrochen.'));
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(new OAuthFailure('ChatGPT-Anfrage wurde abgebrochen.')); };
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}

/** Public-client OIDC + plan-sharing flow. Tokens and callback data remain in the main process. */
export class ChatGPTAuth {
  private readonly hostId: string;
  private record: Registration;
  private readonly request: typeof fetch;
  private readonly now: () => number;
  private readonly knownSecrets = new Set<string>();
  private error?: string;
  private signingIn?: { controller: AbortController; promise: Promise<void> };
  private refresh?: { controller: AbortController; promise: Promise<string> };
  private epoch = 0;
  private discoveryCache?: { value: Discovery; expires: number };
  private jwksCache?: { keys: Record<string, any>[]; expires: number };

  constructor(dataDirectory: string, private readonly credentials: CredentialStore, private readonly options: ChatGPTAuthOptions) {
    this.request = options.fetch ?? fetch; this.now = options.now ?? Date.now;
    mkdirSync(dataDirectory, { recursive: true });
    const file = join(dataDirectory, 'chatgpt-host.json');
    const readHost = () => {
      const value = JSON.parse(readFileSync(file, 'utf8')).id;
      if (typeof value !== 'string' || !/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error('host');
      return value as string;
    };
    try { this.hostId = readHost(); }
    catch {
      const id = `urn:uuid:${randomUUID()}`;
      try {
        // Host metadata is not a credential. Preserve malformed content for recovery,
        // then replace it atomically; one damaged JSON file must not prevent app startup.
        if (existsSync(file)) renameSync(file, `${file}.invalid-${randomUUID()}.bak`);
        const temporary = `${file}.${randomUUID()}.tmp`;
        writeFileSync(temporary, JSON.stringify({ id }), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
        renameSync(temporary, file); this.hostId = id;
      }
      catch { this.hostId = readHost(); }
    }
    this.record = { version: 1, hostId: this.hostId, scopes: [], models: [] };
    try {
      const raw = credentials.get(CREDENTIAL);
      if (raw) {
        const saved: unknown = JSON.parse(raw);
        if (object(saved) && saved.hostId !== this.hostId) throw new OAuthFailure('Die gespeicherte ChatGPT-Verbindung gehört zu einer anderen oder beschädigten Installation. Bitte die Verbindung entfernen und erneut anmelden.');
        if (!object(saved) || saved.version !== 1 || saved.hostId !== this.hostId ||
          (saved.clientId !== undefined && (!short(saved.clientId, 512) || saved.clientId === 'dynamic_agent_client')) ||
          (saved.subject !== undefined && !short(saved.subject, 512)) || (saved.email !== undefined && !short(saved.email, 320)) ||
          (saved.issuer !== undefined && saved.issuer !== AUTH) ||
          !Array.isArray(saved.scopes) || saved.scopes.length > 100 || saved.scopes.some(scope => !short(scope, 256)) ||
          !Array.isArray(saved.models) || saved.models.length > 200 || saved.models.some(model => !object(model) || !short(model.id, 270) || !model.id.startsWith('chatgpt/') || !short(model.label, 512)) ||
          ['accessToken', 'refreshToken', 'idToken'].some(key => saved[key] !== undefined && !short(saved[key], 32_768)) ||
          (saved.expiresAt !== undefined && (!Number.isFinite(saved.expiresAt) || saved.expiresAt <= 0))) throw new Error('record');
        this.record = { version: 1, hostId: this.hostId, clientId: saved.clientId, subject: saved.subject, email: saved.email, issuer: saved.issuer,
          accessToken: saved.accessToken, refreshToken: saved.refreshToken, idToken: saved.idToken, expiresAt: saved.expiresAt,
          scopes: [...saved.scopes], models: saved.models.map(model => ({ id: model.id, label: model.label, provider: 'chatgpt' })) };
        this.remember(this.record);
      }
    } catch (error) { this.error = error instanceof OAuthFailure ? error.message : 'Die gespeicherte ChatGPT-Verbindung kann nicht gelesen werden. Bitte erneut anmelden oder die Verbindung entfernen.'; }
  }
  snapshot(): ChatGPTConnection {
    const signedIn = Boolean(this.record.accessToken && this.record.subject && (this.record.refreshToken || (this.record.expiresAt ?? 0) > this.now()));
    return { status: this.signingIn ? 'signing-in' : this.error ? 'error' : signedIn ? 'signed-in' : 'signed-out',
      ...(this.record.email || this.record.subject ? { account: this.record.email ?? this.record.subject } : {}),
      planUsage: signedIn && this.record.scopes.includes(DIRECT_SCOPE), ...(this.error ? { error: this.error } : {}) };
  }
  listModels(): ModelOption[] { return this.snapshot().planUsage ? this.record.models.map(model => ({ ...model })) : []; }
  secrets(): string[] { this.remember(this.record); return [...this.knownSecrets]; }
  private remember(value: Partial<Registration>): void { for (const key of [value.accessToken, value.refreshToken, value.idToken]) if (typeof key === 'string' && key.length <= 32_768) this.knownSecrets.add(key); }
  private changed(): void { try { this.options.onChange?.(); } catch { /* A window closing cannot invalidate credential persistence. */ } }
  private save(record: Registration): void {
    this.remember(record);
    const serialized = JSON.stringify(record);
    if (Buffer.byteLength(serialized) > 64 * 1024) throw new OAuthFailure('Die ChatGPT-Verbindung ist zu groß zum geschützten Speichern.');
    this.credentials.set(CREDENTIAL, serialized); this.record = record; this.changed();
  }
  private clearTokens(): void {
    const { accessToken, refreshToken, idToken, expiresAt, ...retained } = this.record;
    this.save({ ...retained, scopes: [], models: [] });
  }
  private safeError(error: unknown): string {
    if (error instanceof OAuthFailure) return error.message;
    return 'Die ChatGPT-Verbindung konnte nicht abgeschlossen werden. Bitte erneut versuchen.';
  }
  private async fetchJson(url: string, init: RequestInit = {}, signal?: AbortSignal): Promise<any> {
    aborted(signal);
    const response = await this.request(url, { ...init, redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000) });
    const body = await response.text();
    if (body.length > 2_000_000) throw new OAuthFailure('OpenAI hat eine zu große Antwort geliefert.');
    let data: any;
    try { data = JSON.parse(body); } catch { throw new OAuthFailure(`OpenAI-Antwort konnte nicht gelesen werden (HTTP ${response.status}).`, undefined, response.status); }
    if (!response.ok) {
      const candidate = typeof data.error === 'string' ? data.error : data.error?.code;
      const code = typeof candidate === 'string' && /^[A-Za-z0-9_.-]{1,128}$/.test(candidate) ? candidate : undefined;
      const requestId = response.headers.get('x-request-id') ?? response.headers.get('openai-request-id');
      const reference = requestId && /^[A-Za-z0-9_.-]{1,128}$/.test(requestId) ? ` Anfrage ${requestId}.` : '';
      throw new OAuthFailure(`ChatGPT-Anfrage fehlgeschlagen (HTTP ${response.status}${code ? `, ${code}` : ''}).${reference}`, code, response.status);
    }
    if (!object(data)) throw new OAuthFailure('OpenAI hat eine ungültige Antwort geliefert.');
    return data;
  }
  private async discovery(signal?: AbortSignal): Promise<Discovery> {
    if (this.discoveryCache && this.discoveryCache.expires > this.now()) return this.discoveryCache.value;
    const data = await this.fetchJson(DISCOVERY, {}, signal);
    if (data.issuer !== AUTH || data.authorization_endpoint !== AUTHORIZE || data.token_endpoint !== TOKEN) throw new OAuthFailure('OpenAI-Anmeldekonfiguration konnte nicht bestätigt werden.');
    const value: Discovery = { issuer: AUTH, authorization_endpoint: AUTHORIZE, token_endpoint: TOKEN, jwks_uri: trustedAuthUrl(data.jwks_uri),
      ...(data.revocation_endpoint ? { revocation_endpoint: trustedAuthUrl(data.revocation_endpoint) } : {}) };
    this.discoveryCache = { value, expires: this.now() + 60 * 60_000 }; return value;
  }
  private async verifyIdentity(token: string, clientId: string, nonce: string | undefined, signal?: AbortSignal): Promise<Identity> {
    const segments = token.split('.');
    if (segments.length !== 3 || token.length > 32_768 || segments.some(segment => !/^[A-Za-z0-9_-]+$/.test(segment))) throw new OAuthFailure('Das ChatGPT-ID-Token ist ungültig.');
    let header: any, claims: any;
    try { header = JSON.parse(Buffer.from(segments[0], 'base64url').toString('utf8')); claims = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8')); }
    catch { throw new OAuthFailure('Das ChatGPT-ID-Token ist ungültig.'); }
    if (!object(header) || !object(claims) || header.alg !== 'RS256' || !short(header.kid, 256) || header.crit !== undefined) throw new OAuthFailure('Die ChatGPT-ID-Token-Signatur wird nicht unterstützt.');
    const discovery = await this.discovery(signal);
    const loadKeys = async () => {
      const data = await this.fetchJson(discovery.jwks_uri, {}, signal);
      if (!Array.isArray(data.keys) || data.keys.length > 100) throw new OAuthFailure('OpenAI-Signaturschlüssel konnten nicht gelesen werden.');
      this.jwksCache = { keys: data.keys, expires: this.now() + 60 * 60_000 };
    };
    if (!this.jwksCache || this.jwksCache.expires <= this.now()) await loadKeys();
    let matches = this.jwksCache!.keys.filter(key => object(key) && key.kid === header.kid);
    if (!matches.length) { await loadKeys(); matches = this.jwksCache!.keys.filter(key => object(key) && key.kid === header.kid); }
    const jwk = matches.length === 1 ? matches[0] : undefined;
    if (!jwk || jwk.kty !== 'RSA' || (jwk.alg && jwk.alg !== 'RS256') || (jwk.use && jwk.use !== 'sig') || (jwk.key_ops && (!Array.isArray(jwk.key_ops) || !jwk.key_ops.includes('verify')))) throw new OAuthFailure('Der ChatGPT-Signaturschlüssel konnte nicht bestätigt werden.');
    try {
      const key = createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' });
      if ((key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048 || !verify('RSA-SHA256', Buffer.from(`${segments[0]}.${segments[1]}`), key, Buffer.from(segments[2], 'base64url'))) throw new Error('signature');
    } catch { throw new OAuthFailure('Die ChatGPT-ID-Token-Signatur ist ungültig.'); }
    const now = this.now() / 1000;
    const audience = typeof claims.aud === 'string' ? claims.aud === clientId : Array.isArray(claims.aud) && claims.aud.includes(clientId) && claims.aud.every(value => typeof value === 'string');
    if (claims.iss !== discovery.issuer || !audience || (claims.azp !== undefined && claims.azp !== clientId) ||
      (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== clientId) ||
      !Number.isFinite(claims.exp) || claims.exp <= now - 5 || !Number.isFinite(claims.iat) || claims.iat > now + 5 ||
      (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now + 5)) ||
      !short(claims.sub, 512) || (nonce !== undefined && (typeof claims.nonce !== 'string' || !equal(claims.nonce, nonce)))) throw new OAuthFailure('Die ChatGPT-Identität konnte nicht bestätigt werden.');
    return { sub: claims.sub, iss: claims.iss, ...(short(claims.email, 320) ? { email: claims.email } : {}) };
  }
  private async tokenRequest(body: URLSearchParams, signal?: AbortSignal): Promise<any> {
    const discovery = await this.discovery(signal);
    return this.fetchJson(discovery.token_endpoint, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' }, body }, signal);
  }
  private tokens(data: any, previous: Registration, identity?: Identity): Registration {
    if (!short(data.access_token, 32_768) || typeof data.token_type !== 'string' || data.token_type.toLowerCase() !== 'bearer' ||
      !Number.isFinite(data.expires_in) || data.expires_in <= 0 || data.expires_in > 365 * 86400 ||
      (data.refresh_token !== undefined && !short(data.refresh_token, 32_768)) ||
      (data.id_token !== undefined && !short(data.id_token, 32_768)) ||
      (data.scope !== undefined && (typeof data.scope !== 'string' || data.scope.length > 16_384))) throw new OAuthFailure('OpenAI hat unvollständige ChatGPT-Zugangsdaten geliefert.');
    const scopes = data.scope === undefined ? previous.scopes : data.scope.split(/\s+/).filter(Boolean);
    return { ...previous, ...(identity ? { subject: identity.sub, issuer: identity.iss, email: identity.email } : {}),
      accessToken: data.access_token, refreshToken: data.refresh_token ?? previous.refreshToken, idToken: data.id_token ?? previous.idToken,
      expiresAt: this.now() + data.expires_in * 1000, scopes };
  }
  signIn(): Promise<void> {
    if (this.signingIn) return this.signingIn.promise;
    this.refresh?.controller.abort(); this.epoch++;
    const controller = new AbortController();
    const operation = { controller, promise: Promise.resolve() };
    this.signingIn = operation; this.error = undefined; this.changed();
    operation.promise = this.authorize(controller.signal, this.epoch).catch(error => {
      this.error = controller.signal.aborted ? undefined : this.safeError(error); this.changed();
      throw new OAuthFailure(controller.signal.aborted ? 'ChatGPT-Anmeldung wurde abgebrochen.' : this.error!);
    }).finally(() => { if (this.signingIn === operation) this.signingIn = undefined; this.changed(); });
    return operation.promise;
  }
  private async authorize(signal: AbortSignal, epoch: number): Promise<void> {
    let server: Server | undefined, timer: NodeJS.Timeout | undefined;
    const abortController = new AbortController();
    const combined = AbortSignal.any([signal, abortController.signal]);
    try {
      timer = setTimeout(() => abortController.abort(), this.options.timeoutMs ?? 10 * 60_000);
      const discovery = await this.discovery(combined);
      const state = random(), nonce = random(), verifier = random(64);
      const previous = this.record;
      let redirectUri = '';
      let resolveCallback!: (value: { code: string; clientId: string }) => void, rejectCallback!: (error: Error) => void;
      const callback = new Promise<{ code: string; clientId: string }>((resolve, reject) => { resolveCallback = resolve; rejectCallback = reject; });
      // Observe cancellation even while the browser opener is still completing.
      void callback.catch(() => {});
      let consumed = false;
      server = createServer((request, response) => {
        const respond = (status: number, message: string) => { response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'" }); response.end(message); };
        try {
          if (request.method !== 'GET' || !request.url || request.url.length > 16_384) { respond(400, 'Ungültiger Aufruf.'); return; }
          const url = new URL(request.url, redirectUri);
          if (url.origin !== new URL(redirectUri).origin || url.pathname !== '/auth/callback' || request.headers.host !== new URL(redirectUri).host) { respond(404, 'Nicht gefunden.'); return; }
          if (consumed) { respond(409, 'Anmeldung bereits verarbeitet.'); return; }
          consumed = true;
          const values = (name: string) => url.searchParams.getAll(name);
          if (values('state').length !== 1 || !equal(values('state')[0], state)) throw new OAuthFailure('Die ChatGPT-Anmeldeantwort gehört nicht zu diesem Anmeldeversuch.');
          if (url.searchParams.has('error')) throw new OAuthFailure('Die ChatGPT-Anmeldung wurde im Browser abgelehnt oder konnte nicht abgeschlossen werden.');
          const code = values('code'), issued = values('client_id');
          if (code.length !== 1 || !short(code[0], 4096) || issued.length > 1) throw new OAuthFailure('Die ChatGPT-Anmeldeantwort ist unvollständig.');
          const clientId = issued[0] ?? previous.clientId;
          if (!short(clientId, 512) || clientId === 'dynamic_agent_client' || (previous.clientId && clientId !== previous.clientId)) throw new OAuthFailure('Die ChatGPT-Clientregistrierung konnte nicht bestätigt werden.');
          respond(200, `Du kannst dieses Fenster schließen und zu ${APP_DISPLAY_NAME} zurückkehren.`); resolveCallback({ code: code[0], clientId });
        } catch (error) { respond(400, `Die Anmeldung konnte nicht bestätigt werden. Bitte zu ${APP_DISPLAY_NAME} zurückkehren.`); rejectCallback(error as Error); }
      });
      const cancel = () => rejectCallback(new OAuthFailure('ChatGPT-Anmeldung wurde abgebrochen oder ist abgelaufen.'));
      combined.addEventListener('abort', cancel, { once: true });
      try {
        await new Promise<void>((resolveListen, rejectListen) => { server!.once('error', rejectListen); server!.listen(0, '127.0.0.1', resolveListen); });
        aborted(combined);
        const port = (server.address() as { port: number }).port;
        redirectUri = `http://127.0.0.1:${port}/auth/callback`;
        const url = new URL(discovery.authorization_endpoint);
        url.search = new URLSearchParams({ client_id: previous.clientId ?? 'dynamic_agent_client', ext_agent_host_id: this.hostId,
          ...(!previous.clientId ? { agent_name_hint: APP_DISPLAY_NAME } : {}),
          ...(previous.idToken ? { id_token_hint: previous.idToken } : {}), ...(previous.email ? { login_hint: previous.email } : {}),
          ...(previous.accessToken && !previous.scopes.includes(DIRECT_SCOPE) ? { prompt: 'consent' } : {}),
          response_type: 'code', redirect_uri: redirectUri, scope: SCOPES, resource: RESOURCE, state, nonce,
          code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        }).toString();
        await waitWithSignal(this.options.openBrowser(url.href), combined);
        const returned = await callback; aborted(combined);
        if (epoch !== this.epoch) throw new OAuthFailure('ChatGPT-Anmeldung ist nicht mehr aktiv.');
        // Retain the issued ID before exchange so invalid_grant never creates another client.
        if (!previous.clientId) this.save({ ...previous, clientId: returned.clientId });
        const data = await this.tokenRequest(new URLSearchParams({ grant_type: 'authorization_code', client_id: returned.clientId, code: returned.code,
          code_verifier: verifier, redirect_uri: redirectUri, resource: RESOURCE }), combined);
        this.remember({ accessToken: data.access_token, refreshToken: data.refresh_token, idToken: data.id_token });
        if (!short(data.id_token, 32_768)) throw new OAuthFailure('OpenAI hat kein ChatGPT-ID-Token geliefert.');
        const identity = await this.verifyIdentity(data.id_token, returned.clientId, nonce, combined);
        if (previous.subject && previous.subject !== identity.sub) throw new OAuthFailure('Das angemeldete ChatGPT-Konto stimmt nicht mit der gespeicherten Verbindung überein. Bitte diese Verbindung zuerst entfernen.');
        aborted(combined); if (epoch !== this.epoch) throw new OAuthFailure('ChatGPT-Anmeldung ist nicht mehr aktiv.');
        const next = this.tokens(data, { ...this.record, scopes: [], models: [] }, identity);
        this.error = undefined; this.save(next);
        if (next.scopes.includes(DIRECT_SCOPE)) await this.refreshModels(combined);
      } finally { combined.removeEventListener('abort', cancel); }
    } finally {
      if (timer) clearTimeout(timer);
      if (server) { server.closeAllConnections(); await new Promise<void>(resolveClose => server!.close(() => resolveClose())); }
    }
  }
  async cancelSignIn(): Promise<void> { const pending = this.signingIn; if (!pending) return; pending.controller.abort(); await pending.promise.catch(() => {}); }
  async getAccessToken(signal?: AbortSignal): Promise<string> {
    aborted(signal);
    if (!this.record.accessToken || !this.record.subject || !this.record.clientId) throw new OAuthFailure('Bitte mit ChatGPT anmelden.');
    if (!this.record.scopes.includes(DIRECT_SCOPE)) throw new OAuthFailure('Die Nutzung des ChatGPT-Plans wurde nicht freigegeben. Bitte in den Verbindungen aktivieren.');
    if ((this.record.expiresAt ?? 0) > this.now() + 60_000) return this.record.accessToken;
    if (!this.record.refreshToken) throw new OAuthFailure('Die ChatGPT-Sitzung ist abgelaufen. Bitte erneut anmelden.');
    if (!this.refresh) {
      const previous = this.record, epoch = this.epoch, controller = new AbortController();
      const operation = { controller, promise: Promise.resolve('') };
      this.refresh = operation;
      operation.promise = (async () => {
        try {
          const data = await this.tokenRequest(new URLSearchParams({ grant_type: 'refresh_token', client_id: previous.clientId!, refresh_token: previous.refreshToken!, resource: RESOURCE }), controller.signal);
          this.remember({ accessToken: data.access_token, refreshToken: data.refresh_token, idToken: data.id_token });
          const identity = data.id_token ? await this.verifyIdentity(data.id_token, previous.clientId!, undefined, controller.signal) : undefined;
          if (identity && identity.sub !== previous.subject) throw new OAuthFailure('Die erneuerte ChatGPT-Identität stimmt nicht mit der gespeicherten Verbindung überein.');
          aborted(controller.signal); if (epoch !== this.epoch || this.record.refreshToken !== previous.refreshToken) throw new OAuthFailure('Die ChatGPT-Verbindung wurde inzwischen geändert.');
          const next = this.tokens(data, previous, identity); this.error = undefined; this.save(next);
          if (!next.scopes.includes(DIRECT_SCOPE)) throw new OAuthFailure('Die Nutzung des ChatGPT-Plans ist nicht mehr freigegeben. Bitte erneut anmelden.');
          return next.accessToken!;
        } catch (error) {
          if (epoch === this.epoch && !controller.signal.aborted) {
            if (error instanceof OAuthFailure && error.code && REAUTHORIZE.has(error.code)) this.clearTokens();
            this.error = this.safeError(error); this.changed();
          }
          throw new OAuthFailure(controller.signal.aborted ? 'ChatGPT-Anfrage wurde abgebrochen.' : this.safeError(error));
        }
      })().finally(() => { if (this.refresh === operation) this.refresh = undefined; });
    }
    return waitWithSignal(this.refresh.promise, signal);
  }
  async refreshModels(signal?: AbortSignal): Promise<void> {
    const epoch = this.epoch, accessToken = await this.getAccessToken(signal);
    const data = await this.fetchJson(`${RESOURCE}/models`, { headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' } }, signal);
    if (!Array.isArray(data.models) || data.models.length > 10_000) throw new OAuthFailure('OpenAI hat keinen gültigen ChatGPT-Modellkatalog geliefert.');
    const models: ModelOption[] = [], seen = new Set<string>();
    for (const model of data.models) {
      if (!object(model) || model.visibility !== 'list') continue;
      if (!short(model.slug, 256) || !short(model.display_name, 512) || seen.has(model.slug)) continue;
      seen.add(model.slug); models.push({ id: `chatgpt/${model.slug}`, label: model.display_name, provider: 'chatgpt' });
      if (models.length >= 200) break;
    }
    aborted(signal); if (epoch !== this.epoch || this.record.accessToken !== accessToken) throw new OAuthFailure('Die ChatGPT-Verbindung wurde inzwischen geändert.');
    this.error = undefined; this.save({ ...this.record, models });
  }
  async signOut(): Promise<void> {
    await this.cancelSignIn(); this.epoch++; this.refresh?.controller.abort();
    const previous = this.record;
    let revoked = !previous.refreshToken;
    if (previous.refreshToken && previous.clientId) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const discovery = await this.discovery();
          if (!discovery.revocation_endpoint) break;
            const response = await this.request(discovery.revocation_endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
              headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: previous.refreshToken, token_type_hint: 'refresh_token', client_id: previous.clientId }) });
            if (response.status === 200) { revoked = true; break; }
            if (response.status < 500) break;
        } catch { /* Retry one network failure, then finish locally with an explicit warning. */ }
        if (attempt === 0) await new Promise(resolveDelay => setTimeout(resolveDelay, 250));
      }
    }
    this.clearTokens(); this.error = revoked ? undefined : 'Lokal abgemeldet. Die Abmeldung bei OpenAI konnte nicht bestätigt werden; du kannst die App in den ChatGPT-Einstellungen trennen.'; this.changed();
  }
  async forget(): Promise<void> {
    await this.signOut(); this.credentials.remove(CREDENTIAL);
    this.record = { version: 1, hostId: this.hostId, scopes: [], models: [] }; this.error = undefined; this.changed();
  }
}
