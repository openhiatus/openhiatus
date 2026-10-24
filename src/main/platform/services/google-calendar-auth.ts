import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import type { CredentialStore } from '../../providers';
import { calendarText, parseGoogleCalendarClient, type CalendarEntry, type GoogleCalendarClient, type GoogleCalendarSnapshot } from '../../../shared/calendar';

const KEY = 'service:google-calendar';
export const GOOGLE_CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar.calendarlist.readonly', 'https://www.googleapis.com/auth/calendar.events'];
const API = 'https://www.googleapis.com/calendar/v3';
type RecordData = GoogleCalendarClient & { version: 1; accessToken?: string; refreshToken?: string; expiresAt?: number; calendars: CalendarEntry[]; account?: string; selectedCalendarId?: string; reauth?: boolean };
export class CalendarError extends Error { constructor(message: string, readonly status = 0, readonly uncertain = false) { super(message); } }
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const equal = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
export interface GoogleCalendarAuthOptions { openBrowser(url: string): Promise<void>; onChange?(): void; fetch?: typeof fetch; now?: () => number; loginTimeoutMs?: number; }

/** Main-process OAuth public client. Refresh tokens never enter the renderer or agent. */
export class GoogleCalendarAuth {
  private record?: RecordData;
  private error?: string;
  private disposed = false;
  private closing = false;
  private disposal?: Promise<void>;
  private epoch = 0;
  private lifetime = new AbortController();
  private authority = new AbortController();
  private login?: { abort: AbortController; promise: Promise<void> };
  private refresh?: Promise<string>;
  private readonly known = new Set<string>();
  private readonly request: typeof fetch;
  private readonly now: () => number;
  constructor(private readonly credentials: CredentialStore, private readonly options: GoogleCalendarAuthOptions) {
    this.request = options.fetch ?? fetch; this.now = options.now ?? Date.now;
    try {
      const stored = credentials.get(KEY); if (!stored) return;
      const row: unknown = JSON.parse(stored);
      if (!object(row) || row.version !== 1 || !Array.isArray(row.calendars) || row.calendars.length > 100) throw Error();
      const client = parseGoogleCalendarClient({ clientId: row.clientId, ...(row.clientSecret === undefined ? {} : { clientSecret: row.clientSecret }) });
      this.record = { version: 1, ...client, calendars: row.calendars.map(calendarEntry),
        ...(row.account ? { account: calendarText(row.account, 300, 'Google-Konto') } : {}), ...(row.selectedCalendarId ? { selectedCalendarId: calendarText(row.selectedCalendarId, 1024, 'Kalender') } : {}),
        ...(row.accessToken ? { accessToken: calendarText(row.accessToken, 16384, 'Zugangstoken') } : {}), ...(row.refreshToken ? { refreshToken: calendarText(row.refreshToken, 16384, 'Erneuerungstoken') } : {}),
        ...(typeof row.expiresAt === 'number' && Number.isFinite(row.expiresAt) ? { expiresAt: row.expiresAt } : {}), ...(row.reauth === true ? { reauth: true } : {}) };
      this.remember();
    } catch { this.error = 'Die gespeicherte Google-Verbindung kann nicht gelesen werden. Bitte die OAuth-App erneut einrichten.'; }
  }
  private remember(): void {
    // Invalid short setup placeholders must not redact every matching letter from memory.
    for (const secret of [this.record?.clientSecret, this.record?.accessToken, this.record?.refreshToken]) if (secret && secret.length >= 8) this.known.add(secret);
  }
  secrets(): string[] { return [...this.known]; }
  snapshot(): GoogleCalendarSnapshot {
    const record = this.record;
    return { configured: !!record, ...(record ? { clientId: record.clientId } : {}), status: this.login ? 'connecting' : record?.reauth ? 'reauth-required' : record?.refreshToken && record.account ? 'ready' : this.error ? 'error' : 'disconnected',
      ...(record?.account ? { account: record.account } : {}), calendars: structuredClone(record?.calendars ?? []), ...(record?.selectedCalendarId ? { selectedCalendarId: record.selectedCalendarId } : {}), ...(this.error ? { error: this.error } : {}) };
  }
  selected(): CalendarEntry {
    if (this.snapshot().status !== 'ready') throw new CalendarError('Bitte Google Kalender zuerst verbinden.');
    const calendar = this.record!.calendars.find(calendar => calendar.id === this.record!.selectedCalendarId);
    if (!calendar) throw new CalendarError('Bitte einen Kalender auswählen.');
    return structuredClone(calendar);
  }
  private save(value: RecordData): void { this.credentials.set(KEY, JSON.stringify(value)); this.record = value; this.remember(); }
  private changed(): void { this.options.onChange?.(); }
  private invalidate(): void { this.epoch++; this.lifetime.abort(); this.lifetime = new AbortController(); this.authority.abort(); this.authority = new AbortController(); }
  async configure(value: GoogleCalendarClient): Promise<GoogleCalendarSnapshot> {
    if (this.disposed || this.closing) throw new CalendarError('Die Anwendung wird beendet.');
    const client = parseGoogleCalendarClient(value), secret = client.clientSecret ?? (client.clientId === this.record?.clientId ? this.record?.clientSecret : undefined);
    if (this.record?.clientId === client.clientId && (this.record.clientSecret ?? '') === (secret ?? '')) return this.snapshot();
    await this.cancelLogin(); this.invalidate(); this.error = undefined;
    this.save({ version: 1, clientId: client.clientId, ...(secret ? { clientSecret: secret } : {}), calendars: [] }); this.changed(); return this.snapshot();
  }
  select(id: string): GoogleCalendarSnapshot {
    if (this.disposed || this.closing) throw new CalendarError('Die Anwendung wird beendet.');
    this.selected(); if (!this.record!.calendars.some(calendar => calendar.id === id)) throw new CalendarError('Dieser Kalender ist nicht verfügbar.');
    if (id !== this.record!.selectedCalendarId) { this.save({ ...this.record!, selectedCalendarId: id }); this.authority.abort(); this.authority = new AbortController(); this.changed(); }
    return this.snapshot();
  }
  async connect(): Promise<void> {
    if (this.disposed || this.closing) throw new CalendarError('Die Anwendung wird beendet.');
    if (!this.record) throw new CalendarError('Bitte zuerst eine Google-Desktop-Client-ID einrichten.');
    if (this.login) return this.login.promise;
    const login = { abort: new AbortController(), promise: Promise.resolve() };
    this.login = login; this.error = undefined; this.changed();
    const timeout = setTimeout(() => login.abort.abort('timeout'), this.options.loginTimeoutMs ?? 180000);
    login.promise = this.authorize(login.abort.signal).catch(error => {
      if (!this.disposed && login.abort.signal.reason !== 'cancelled') this.error = login.abort.signal.reason === 'timeout' ? 'Die Google-Anmeldung ist abgelaufen. Bitte erneut verbinden.' : error instanceof CalendarError ? error.message : 'Google-Anmeldung fehlgeschlagen. Bitte erneut versuchen.';
      throw new CalendarError(login.abort.signal.aborted ? 'Google-Anmeldung wurde abgebrochen.' : this.error ?? 'Google-Anmeldung fehlgeschlagen.');
    }).finally(() => { clearTimeout(timeout); if (this.login === login) this.login = undefined; this.changed(); });
    return login.promise;
  }
  async cancelLogin(): Promise<GoogleCalendarSnapshot> { const login = this.login; login?.abort.abort('cancelled'); await login?.promise.catch(() => {}); return this.snapshot(); }
  private async authorize(signal: AbortSignal): Promise<void> {
    const client = { clientId: this.record!.clientId, ...(this.record!.clientSecret ? { clientSecret: this.record!.clientSecret } : {}) }, epoch = this.epoch;
    const verifier = randomBytes(48).toString('base64url'), state = randomBytes(32).toString('base64url');
    let resolve!: (value: string) => void, reject!: (error: Error) => void;
    const code = new Promise<string>((yes, no) => { resolve = yes; reject = no; }); void code.catch(() => {});
    let redirect = '';
    const server = createServer((request, response) => {
      response.setHeader('Content-Type', 'text/plain; charset=utf-8'); response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
      let url: URL; try { if (!redirect) throw Error(); url = new URL(request.url ?? '/', redirect); } catch { response.writeHead(400); response.end('Ungültige Anmeldung.'); return; }
      if (request.method !== 'GET' || url.pathname !== '/oauth2/google' || request.headers.host !== new URL(redirect).host || url.searchParams.getAll('state').length !== 1 || !equal(url.searchParams.get('state') ?? '', state)) { response.writeHead(400); response.end('Ungültige Anmeldung.'); return; }
      if (url.searchParams.has('error')) { response.end('Die Google-Freigabe wurde abgelehnt. Du kannst dieses Fenster schließen.'); reject(new CalendarError('Die Google-Freigabe wurde abgelehnt.')); return; }
      const value = url.searchParams.get('code');
      if (!value || value.length > 8192 || url.searchParams.getAll('code').length !== 1) { response.writeHead(400); response.end('Ungültiger Anmeldecode.'); return; }
      response.end('Google-Anmeldung empfangen. Du kannst zu openHiatus zurückkehren.'); resolve(value);
    });
    const aborted = () => reject(new CalendarError('Google-Anmeldung wurde abgebrochen.'));
    signal.addEventListener('abort', aborted, { once: true });
    const timer = setTimeout(() => reject(new CalendarError('Die Google-Anmeldung ist abgelaufen. Bitte erneut verbinden.')), this.options.loginTimeoutMs ?? 180000);
    try {
      signal.throwIfAborted();
      await new Promise<void>((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); });
      const address = server.address(); if (!address || typeof address === 'string') throw new CalendarError('Die lokale Anmeldung konnte nicht gestartet werden.');
      redirect = `http://127.0.0.1:${address.port}/oauth2/google`;
      const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      for (const [key, value] of Object.entries({ client_id: client.clientId, redirect_uri: redirect, response_type: 'code', scope: GOOGLE_CALENDAR_SCOPES.join(' '), state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent' })) auth.searchParams.set(key, value);
      await waitFor(this.options.openBrowser(auth.href), signal);
      const authorizationCode = await code; signal.throwIfAborted();
      const token = await this.token({ client_id: client.clientId, ...(client.clientSecret ? { client_secret: client.clientSecret } : {}), grant_type: 'authorization_code', code: authorizationCode, code_verifier: verifier, redirect_uri: redirect }, signal);
      const scopes = typeof token.scope === 'string' ? token.scope.split(' ') : [];
      if (!GOOGLE_CALENDAR_SCOPES.every(scope => scopes.includes(scope)) || !token.refresh_token) throw new CalendarError('Bitte Kalenderliste und Terminzugriff freigeben. Google hat keinen vollständigen dauerhaften Zugang geliefert.');
      const calendars = await this.loadCalendars(token.access_token, signal), primary = calendars.find(calendar => calendar.primary);
      if (!primary) throw new CalendarError('Der primäre Google-Kalender konnte nicht bestimmt werden. Prüfe die Kalender-API und deine Freigabe.');
      if (this.disposed || epoch !== this.epoch || signal.aborted) throw new CalendarError('Google-Anmeldung wurde abgebrochen.');
      const selected = this.record?.account === primary.id && calendars.some(calendar => calendar.id === this.record?.selectedCalendarId) ? this.record.selectedCalendarId : primary.id;
      this.save({ version: 1, ...client, accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: this.now() + token.expires_in * 1000, account: primary.id, calendars, selectedCalendarId: selected });
      this.authority.abort(); this.authority = new AbortController(); this.error = undefined;
    } finally { clearTimeout(timer); signal.removeEventListener('abort', aborted); server.closeAllConnections(); await new Promise<void>(yes => server.close(() => yes())); }
  }
  private async json(url: string, init: RequestInit, signal: AbortSignal): Promise<{ status: number; value: Record<string, any> }> {
    const response = await this.request(url, { ...init, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) });
    const reader = response.body?.getReader(); let contents = '', size = 0;
    if (reader) { const decoder = new TextDecoder(); try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 1048576) throw Error('Bounded reply'); contents += decoder.decode(part.value, { stream: true }); } contents += decoder.decode(); } finally { await reader.cancel().catch(() => {}); } }
    let value: unknown; try { value = JSON.parse(contents); } catch { value = {}; }
    return { status: response.status, value: object(value) ? value : {} };
  }
  private async token(parameters: Record<string, string>, signal: AbortSignal): Promise<{ access_token: string; refresh_token?: string; expires_in: number; scope?: string }> {
    const result = await this.json('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(parameters) }, signal);
    if (result.status !== 200) throw new CalendarError(result.value.error === 'invalid_grant' ? 'Google-Zugang ist abgelaufen oder widerrufen. Bitte erneut anmelden.' : 'Google konnte den Zugang nicht bestätigen. Prüfe die Desktop-Client-ID und Kalenderfreigabe.', result.value.error === 'invalid_grant' ? 401 : result.status);
    const row = result.value;
    if (typeof row.token_type !== 'string' || row.token_type.toLowerCase() !== 'bearer' || typeof row.expires_in !== 'number' || !Number.isFinite(row.expires_in) || row.expires_in <= 0 || row.expires_in > 86400) throw new CalendarError('Google hat keinen gültigen Zugang geliefert.');
    return { access_token: calendarText(row.access_token, 16384, 'Zugangstoken'), ...(row.refresh_token ? { refresh_token: calendarText(row.refresh_token, 16384, 'Erneuerungstoken') } : {}), expires_in: row.expires_in, ...(typeof row.scope === 'string' ? { scope: row.scope } : {}) };
  }
  private async loadCalendars(token: string, signal: AbortSignal): Promise<CalendarEntry[]> {
    const calendars: CalendarEntry[] = []; let cursor = '';
    for (let page = 0; page < 10; page++) {
      const url = new URL(API + '/users/me/calendarList'); url.searchParams.set('maxResults', '100'); url.searchParams.set('minAccessRole', 'reader'); if (cursor) url.searchParams.set('pageToken', cursor);
      const response = await this.json(url.href, { headers: { Authorization: `Bearer ${token}` } }, signal);
      if (response.status !== 200 || !Array.isArray(response.value.items)) throw new CalendarError('Kalenderliste konnte nicht gelesen werden. Prüfe, ob die Google Calendar API im Projekt aktiviert ist.');
      for (const item of response.value.items) if (!item.deleted && ['reader', 'writer', 'owner'].includes(item.accessRole)) calendars.push(calendarEntry(item));
      if (calendars.length > 100) throw new CalendarError('Mehr als 100 Kalender sind noch nicht unterstützt. Bitte die Kalenderliste eingrenzen.');
      cursor = response.value.nextPageToken ? calendarText(response.value.nextPageToken, 4096, 'Fortsetzungsverweis') : ''; if (!cursor) return calendars;
    }
    throw new CalendarError('Die Kalenderliste ist zu groß.');
  }
  private async accessToken(signal: AbortSignal): Promise<string> {
    signal.throwIfAborted();
    if (!this.record?.refreshToken || this.record.reauth) throw new CalendarError('Bitte Google Kalender erneut verbinden.');
    if (this.record.accessToken && (this.record.expiresAt ?? 0) > this.now() + 60000) return this.record.accessToken;
    if (!this.refresh) {
      const epoch = this.epoch, record = this.record;
      this.refresh = this.token({ client_id: record.clientId, ...(record.clientSecret ? { client_secret: record.clientSecret } : {}), grant_type: 'refresh_token', refresh_token: record.refreshToken! }, this.lifetime.signal).then(token => {
        if (epoch !== this.epoch || this.disposed) throw new CalendarError('Google-Verbindung wurde geändert.');
        if (token.scope && !GOOGLE_CALENDAR_SCOPES.every(scope => token.scope!.split(' ').includes(scope))) throw new CalendarError('Google-Kalenderfreigabe ist nicht mehr vollständig.', 401);
        this.save({ ...this.record!, accessToken: token.access_token, refreshToken: token.refresh_token ?? this.record!.refreshToken, expiresAt: this.now() + token.expires_in * 1000 }); return token.access_token;
      }).catch(error => {
        if (epoch === this.epoch && error instanceof CalendarError && error.status === 401) { const { accessToken: _a, refreshToken: _r, expiresAt: _e, ...keep } = this.record!; this.save({ ...keep, reauth: true }); this.error = error.message; this.changed(); }
        throw error;
      }).finally(() => { this.refresh = undefined; });
    }
    return waitFor(this.refresh, signal);
  }
  async api(method: 'GET' | 'POST' | 'PATCH', path: string, body: unknown, signal: AbortSignal, extraHeaders: Record<string, string> = {}): Promise<Record<string, any>> {
    if (this.disposed || this.closing) throw new CalendarError('Die Anwendung wird beendet.');
    const combined = AbortSignal.any([signal, this.authority.signal]); let sent = false;
    try {
      const token = await this.accessToken(combined); combined.throwIfAborted(); sent = true;
      const result = await this.json(API + path, { method, headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extraHeaders }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, combined);
      combined.throwIfAborted();
      if (result.status === 401 && this.record) { const { accessToken: _a, refreshToken: _r, expiresAt: _e, ...keep } = this.record; this.save({ ...keep, reauth: true }); this.error = 'Google-Zugang wurde abgelehnt. Bitte erneut anmelden.'; this.changed(); }
      if (result.status < 200 || result.status >= 300) throw new CalendarError(result.status === 412 ? 'Der Termin wurde inzwischen geändert. Bitte neu lesen und die Änderung erneut prüfen.' : result.status === 403 ? 'Für diesen Kalender fehlen Rechte oder die Calendar API ist noch nicht aktiviert.' : result.status === 404 || result.status === 410 ? 'Dieser Termin oder Kalender ist nicht mehr verfügbar.' : result.status === 429 ? 'Google begrenzt gerade die Anfragen. Bitte später erneut versuchen.' : result.status === 401 ? 'Bitte Google Kalender erneut verbinden.' : 'Google konnte die Kalenderanfrage nicht bestätigen.', result.status, method !== 'GET' && result.status >= 500);
      return result.value;
    } catch (error) {
      if (error instanceof CalendarError) throw error;
      throw new CalendarError(method !== 'GET' && sent ? 'Die Kalenderänderung konnte nicht bestätigt werden. Sie kann bereits ausgeführt sein. Vor einem weiteren Versuch den Kalender prüfen.' : 'Die Kalenderanfrage wurde abgebrochen oder konnte nicht abgeschlossen werden.', 0, method !== 'GET' && sent);
    }
  }
  async disconnect(): Promise<GoogleCalendarSnapshot> {
    if (this.disposed || this.closing) throw new CalendarError('Die Anwendung wird beendet.');
    await this.cancelLogin(); const token = this.record?.refreshToken ?? this.record?.accessToken;
    this.invalidate(); this.error = undefined;
    if (this.record) this.save({ version: 1, clientId: this.record.clientId, ...(this.record.clientSecret ? { clientSecret: this.record.clientSecret } : {}), calendars: [] });
    this.changed();
    if (token) try { const response = await this.request('https://oauth2.googleapis.com/revoke', { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }), signal: AbortSignal.timeout(10000) }); if (response.status !== 200 && response.status !== 400) throw Error(); }
    catch { this.error = 'Lokal getrennt. Der Widerruf bei Google konnte nicht bestätigt werden; prüfe bei Bedarf die verbundenen Apps in deinem Google-Konto.'; }
    return this.snapshot();
  }
  dispose(): Promise<void> {
    return this.disposal ??= (async () => {
      this.closing = true; this.authority.abort(); await this.cancelLogin();
      // Finish a shared refresh before shutdown so a rotated refresh token is persisted.
      await this.refresh?.catch(() => {}); this.disposed = true; this.invalidate();
    })();
  }
}

function calendarEntry(value: unknown): CalendarEntry {
  if (!object(value) || !['reader', 'writer', 'owner'].includes(value.accessRole)) throw new CalendarError('Google hat keine gültige Kalenderliste geliefert.');
  const id = calendarText(value.id, 1024, 'Kalenderkennung'), title = calendarText(value.title ?? value.summary ?? id, 200, 'Kalendername'), timeZone = calendarText(value.timeZone ?? 'UTC', 100, 'Zeitzone');
  try { new Intl.DateTimeFormat('de', { timeZone }).format(); } catch { throw new CalendarError('Unbekannte Kalenderzeitzone.'); }
  return { id, title, timeZone, accessRole: value.accessRole, primary: value.primary === true };
}
function waitFor<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => { const abort = () => reject(new CalendarError('Kalenderanfrage wurde abgebrochen.')); if (signal.aborted) { abort(); return; } signal.addEventListener('abort', abort, { once: true }); promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort)); });
}
