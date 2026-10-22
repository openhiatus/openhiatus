import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChatGPTAuth } from '../src/main/chatgpt-auth.js';
import { ModelClient, ProviderStore, piModel } from '../src/main/providers.js';

const AUTH = 'https://auth.openai.com', API = 'https://api.openai.com/v1';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'openhiatus-test', alg: 'RS256', use: 'sig' };
function jwt(claims: Record<string, unknown>, invalidSignature = false): string {
  const encoded = [Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'openhiatus-test' })).toString('base64url'), Buffer.from(JSON.stringify(claims)).toString('base64url')].join('.');
  const signature = sign('RSA-SHA256', Buffer.from(encoded), privateKey);
  if (invalidSignature) signature[0] ^= 1;
  return `${encoded}.${signature.toString('base64url')}`;
}
function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }); }
async function fixture(options: { callback?: 'state' | 'error' | 'client' | 'none'; claims?: Record<string, unknown>; invalidSignature?: boolean; scopes?: string; tokenError?: string; discoveryOverride?: Record<string, unknown>; timeoutMs?: number; revocationFailure?: boolean } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'openhiatus-chatgpt-'));
  const values = new Map<string, string>(), writes: any[] = [];
  const credentials = { get: (key: string) => values.get(key), set: (key: string, value: string) => { values.set(key, value); writes.push(JSON.parse(value)); }, remove: (key: string) => { values.delete(key); } };
  let now = 1_800_000_000_000, calls = 0, refreshes = 0, modelCalls = 0, revocations = 0, latestUrl: URL | undefined;
  let tokenError = options.tokenError, refreshError: string | undefined, refreshDelay = 0, scopes = options.scopes ?? 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
  const requests: { url: string; init?: RequestInit }[] = [], browserUrls: URL[] = [];
  const mockFetch: typeof fetch = async (url, init) => {
    const address = String(url); requests.push({ url: address, init });
    if (address === `${AUTH}/.well-known/openid-configuration`) return json({ issuer: AUTH, authorization_endpoint: `${AUTH}/api/accounts/authorize`, token_endpoint: `${AUTH}/api/accounts/oauth/token`, jwks_uri: `${AUTH}/.well-known/jwks.json`, revocation_endpoint: `${AUTH}/api/accounts/oauth/revoke`, ...options.discoveryOverride });
    if (address === `${AUTH}/.well-known/jwks.json`) return json({ keys: [jwk] });
    if (address === `${AUTH}/api/accounts/oauth/token`) {
      const body = new URLSearchParams(String(init?.body));
      assert.equal(body.get('client_id'), 'oaiapp_openhiatus_test'); assert.equal(body.get('resource'), API); assert.equal(body.has('client_secret'), false);
      if (body.get('grant_type') === 'refresh_token') {
        refreshes++; assert.equal(body.has('scope'), false); if (refreshDelay) await new Promise(resolve => setTimeout(resolve, refreshDelay));
        if (refreshError) return json({ error: refreshError }, refreshError === 'temporarily_unavailable' ? 503 : 400);
        return json({ access_token: `access-refresh-${refreshes}`, refresh_token: `refresh-refresh-${refreshes}`, token_type: 'Bearer', expires_in: 3600 });
      }
      calls++;
      assert.equal(writes.at(-1).clientId, 'oaiapp_openhiatus_test'); // Saved before exchange, even if exchange now fails.
      assert.equal(body.get('redirect_uri'), latestUrl!.searchParams.get('redirect_uri'));
      const verifier = body.get('code_verifier')!;
      assert.equal(createHash('sha256').update(verifier).digest('base64url'), latestUrl!.searchParams.get('code_challenge'));
      assert.equal(body.get('code'), 'one-time-code');
      if (tokenError) return json({ error: tokenError }, 400);
      return json({ access_token: `access-${calls}`, refresh_token: `refresh-${calls}`, token_type: 'Bearer', expires_in: 3600, scope: scopes,
        id_token: jwt({ iss: AUTH, sub: 'subject-1', email: 'person@example.com', aud: 'oaiapp_openhiatus_test', iat: now / 1000 - 1, exp: now / 1000 + 3600, nonce: latestUrl!.searchParams.get('nonce'), ...options.claims }, options.invalidSignature) });
    }
    if (address === `${API}/models`) {
      modelCalls++; assert.match(new Headers(init?.headers).get('authorization') ?? '', /^Bearer access-/);
      return json({ models: [{ slug: 'gpt-6.1-sol', display_name: 'Work model', visibility: 'list' }, { slug: 'hidden', display_name: 'Hidden', visibility: 'hidden' }, { slug: 'gpt-6.1-sol', display_name: 'Duplicate', visibility: 'list' }, { slug: 'gpt-5.4', display_name: 'Small model', visibility: 'list' }] });
    }
    if (address === `${AUTH}/api/accounts/oauth/revoke`) {
      revocations++; const body = new URLSearchParams(String(init?.body)); assert.equal(body.get('client_id'), 'oaiapp_openhiatus_test'); assert.equal(body.get('token_type_hint'), 'refresh_token');
      if (options.revocationFailure) throw new Error('Network unavailable'); return new Response('', { status: 200 });
    }
    throw new Error('Unexpected network target');
  };
  const openBrowser = async (url: string) => {
    latestUrl = new URL(url); browserUrls.push(latestUrl);
    assert.equal(latestUrl.origin, AUTH); assert.equal(latestUrl.pathname, '/api/accounts/authorize');
    assert.equal(latestUrl.searchParams.get('resource'), API); assert.equal(latestUrl.searchParams.get('code_challenge_method'), 'S256');
    const callback = new URL(latestUrl.searchParams.get('redirect_uri')!);
    assert.equal(callback.hostname, '127.0.0.1'); assert.equal(callback.pathname, '/auth/callback');
    if (options.callback === 'none') return;
    callback.searchParams.set('state', options.callback === 'state' ? 'forged-state' : latestUrl.searchParams.get('state')!);
    if (options.callback === 'error') callback.searchParams.set('error', 'access_denied');
    else {
      callback.searchParams.set('code', 'one-time-code');
      callback.searchParams.set('client_id', options.callback === 'client' ? 'oaiapp_wrong' : 'oaiapp_openhiatus_test');
    }
    await fetch(callback); // Only the actual loopback listener is used; OpenAI is entirely mocked.
  };
  const auth = new ChatGPTAuth(directory, credentials, { fetch: mockFetch, openBrowser, now: () => now, timeoutMs: options.timeoutMs ?? 5000 });
  return { auth, directory, credentials, writes, values, requests, browserUrls, mockFetch, openBrowser,
    counts: () => ({ calls, refreshes, modelCalls, revocations }), advance: (milliseconds: number) => { now += milliseconds; },
    setTokenError: (value?: string) => { tokenError = value; }, setRefreshError: (value?: string) => { refreshError = value; }, setRefreshDelay: (value: number) => { refreshDelay = value; }, setScopes: (value: string) => { scopes = value; }, now: () => now };
}

test('official registration: PKCE + verified identity, issued client persisted before exchange, account-specific visible models', async () => {
  const f = await fixture(); await f.auth.signIn();
  assert.equal(f.browserUrls[0].searchParams.get('client_id'), 'dynamic_agent_client');
  assert.equal(f.browserUrls[0].searchParams.get('agent_name_hint'), 'openHiatus');
  const hostId = f.browserUrls[0].searchParams.get('ext_agent_host_id'); assert.match(hostId!, /^urn:uuid:/);
  assert.deepEqual(f.auth.snapshot(), { status: 'signed-in', account: 'person@example.com', planUsage: true });
  assert.deepEqual(f.auth.listModels().map(model => [model.id, model.label]), [['chatgpt/gpt-6.1-sol', 'Work model'], ['chatgpt/gpt-5.4', 'Small model']]);
  assert.equal(f.counts().modelCalls, 1);
  const saved = JSON.parse(f.values.get('provider:chatgpt')!); assert.equal(saved.subject, 'subject-1'); assert.equal(saved.hostId, hostId);
  assert.ok(!JSON.stringify(f.auth.snapshot()).includes('access-')); assert.ok(!JSON.stringify(f.auth.listModels()).includes('refresh-'));
  assert.ok(!(await readFile(join(f.directory, 'chatgpt-host.json'), 'utf8')).includes('access-'));
  const providers = new ProviderStore(f.directory, f.credentials, f.auth);
  const view = providers.list().find(provider => provider.id === 'chatgpt')!; assert.equal(view.authType, 'chatgpt'); assert.equal(view.configured, true);
  assert.equal(providers.resolve('chatgpt/gpt-6.1-sol').apiKey, '');
  const resolved = await providers.resolveForRun('chatgpt/gpt-6.1-sol');
  assert.equal(resolved.apiKey, 'access-1'); assert.equal(resolved.provider, 'openai'); assert.equal(resolved.api, 'openai-responses'); assert.equal(resolved.baseUrl, API);
  assert.equal((await piModel(resolved)).cost.input, 0); assert.ok(providers.secrets().includes(saved.idToken));
  await assert.rejects(providers.save({ id: 'chatgpt', apiKey: 'must-not-overwrite' }));
});

test('single-flight refresh atomically rotates tokens; logout retains registration, removes all tokens, returning signin reuses exact client and host', async () => {
  const f = await fixture(); await f.auth.signIn(); const host = f.browserUrls[0].searchParams.get('ext_agent_host_id');
  f.advance(3_550_000); f.setRefreshDelay(15);
  const tokens = await Promise.all(Array.from({ length: 8 }, () => f.auth.getAccessToken()));
  assert.deepEqual(new Set(tokens), new Set(['access-refresh-1'])); assert.equal(f.counts().refreshes, 1);
  let saved = JSON.parse(f.values.get('provider:chatgpt')!);
  assert.equal(saved.accessToken, 'access-refresh-1'); assert.equal(saved.refreshToken, 'refresh-refresh-1');
  assert.ok(f.auth.secrets().includes('access-1')); assert.ok(f.auth.secrets().includes('refresh-1'));
  assert.ok(f.auth.secrets().includes('access-refresh-1')); assert.ok(f.auth.secrets().includes('refresh-refresh-1'));
  const restored = new ChatGPTAuth(f.directory, f.credentials, { fetch: f.mockFetch, openBrowser: f.openBrowser, now: f.now });
  assert.equal(await restored.getAccessToken(), 'access-refresh-1'); assert.equal(restored.listModels().length, 2);
  await f.auth.signOut(); assert.equal(f.counts().revocations, 1);
  saved = JSON.parse(f.values.get('provider:chatgpt')!);
  assert.equal(saved.clientId, 'oaiapp_openhiatus_test'); assert.equal(saved.subject, 'subject-1');
  for (const key of ['accessToken', 'refreshToken', 'idToken', 'expiresAt']) assert.equal(saved[key], undefined);
  assert.equal(f.auth.snapshot().status, 'signed-out');
  await f.auth.signIn();
  const returned = f.browserUrls.at(-1)!;
  assert.equal(returned.searchParams.get('client_id'), 'oaiapp_openhiatus_test'); assert.equal(returned.searchParams.get('agent_name_hint'), null);
  assert.equal(returned.searchParams.get('ext_agent_host_id'), host); assert.equal(returned.searchParams.has('id_token_hint'), false);
  assert.notEqual(returned.searchParams.get('state'), f.browserUrls[0].searchParams.get('state'));
  const providers = new ProviderStore(f.directory, f.credentials, f.auth); await providers.remove('chatgpt');
  assert.equal(f.values.has('provider:chatgpt'), false);
  await f.auth.signIn(); assert.equal(f.browserUrls.at(-1)!.searchParams.get('client_id'), 'dynamic_agent_client');
  assert.equal(f.browserUrls.at(-1)!.searchParams.get('ext_agent_host_id'), host);
});

test('identity without granted plan scope stays signed in but cannot list or invoke models, explicit enable requests consent', async () => {
  const f = await fixture({ scopes: 'openid email profile offline_access resource.invoke' }); await f.auth.signIn();
  assert.equal(f.auth.snapshot().status, 'signed-in'); assert.equal(f.auth.snapshot().planUsage, false);
  assert.deepEqual(f.auth.listModels(), []); assert.equal(f.counts().modelCalls, 0);
  await assert.rejects(f.auth.getAccessToken(), /nicht freigegeben/);
  const providers = new ProviderStore(f.directory, f.credentials, f.auth);
  assert.equal(providers.list().find(provider => provider.id === 'chatgpt')!.configured, false);
  await assert.rejects(providers.resolveForRun('chatgpt/gpt-5.4'), /freigeben/);
  f.setScopes('openid chatgpt.tokens.use.direct'); await f.auth.signIn();
  assert.equal(f.browserUrls.at(-1)!.searchParams.get('prompt'), 'consent'); assert.equal(f.auth.snapshot().planUsage, true);
});

test('expired one-time code retains issued registration for a fresh authorization, without registering another client', async () => {
  const f = await fixture({ tokenError: 'invalid_grant' });
  await assert.rejects(f.auth.signIn(), /invalid_grant/);
  assert.equal(JSON.parse(f.values.get('provider:chatgpt')!).clientId, 'oaiapp_openhiatus_test');
  assert.equal(f.auth.snapshot().planUsage, false);
  f.setTokenError(undefined); await f.auth.signIn();
  assert.equal(f.browserUrls[1].searchParams.get('client_id'), 'oaiapp_openhiatus_test');
  assert.equal(f.browserUrls[1].searchParams.has('agent_name_hint'), false);
});

test('invalid callback state or declined consent never exchanges an authorization code', async () => {
  for (const callback of ['state', 'error'] as const) {
    const f = await fixture({ callback }); await assert.rejects(f.auth.signIn()); assert.equal(f.counts().calls, 0); assert.equal(f.auth.snapshot().planUsage, false);
  }
});

test('ID tokens reject bad signatures, nonce, issuer, audience, expired timestamps and future issuance', async () => {
  for (const scenario of [
    { invalidSignature: true }, { claims: { nonce: 'other' } }, { claims: { iss: 'https://attacker.example' } },
    { claims: { aud: 'other-client' } }, { claims: { exp: 1 } }, { claims: { iat: 9_999_999_999 } }, { claims: { sub: '' } },
  ]) {
    const f = await fixture(scenario); await assert.rejects(f.auth.signIn());
    const saved = JSON.parse(f.values.get('provider:chatgpt')!); assert.equal(saved.accessToken, undefined);
    assert.equal(f.auth.snapshot().planUsage, false);
  }
});

test('returning login rejects a different issued client and a different verified subject, preserving active credentials', async () => {
  const f = await fixture(); await f.auth.signIn();
  const original = f.values.get('provider:chatgpt');
  const otherSubject = new ChatGPTAuth(f.directory, f.credentials, { now: f.now, fetch: async (url, init) => {
    if (String(url).endsWith('/oauth/token')) {
      const data: any = await (await f.mockFetch(url, init)).json();
      const claims = JSON.parse(Buffer.from(data.id_token.split('.')[1], 'base64url').toString()); data.id_token = jwt({ ...claims, sub: 'another-account' }); return json(data);
    }
    return f.mockFetch(url, init);
  }, openBrowser: f.openBrowser });
  await assert.rejects(otherSubject.signIn(), /Konto stimmt nicht/); assert.equal(f.values.get('provider:chatgpt'), original);
  const wrongClient = new ChatGPTAuth(f.directory, f.credentials, { now: f.now, fetch: f.mockFetch, openBrowser: async url => {
    const address = new URL(url), callback = new URL(address.searchParams.get('redirect_uri')!);
    callback.searchParams.set('state', address.searchParams.get('state')!); callback.searchParams.set('code', 'one-time-code'); callback.searchParams.set('client_id', 'oaiapp_unrelated'); await fetch(callback);
  } });
  await assert.rejects(wrongClient.signIn(), /Clientregistrierung/); assert.equal(f.values.get('provider:chatgpt'), original);
});

test('transient refresh errors retain credentials; terminal refresh errors clear tokens but preserve account registration', async () => {
  const f = await fixture(); await f.auth.signIn(); f.advance(3_550_000);
  const before = f.values.get('provider:chatgpt');
  f.setRefreshError('temporarily_unavailable'); await assert.rejects(f.auth.getAccessToken(), /503/); assert.equal(f.values.get('provider:chatgpt'), before);
  f.setRefreshError('refresh_token_reused'); await assert.rejects(f.auth.getAccessToken(), /refresh_token_reused/);
  const saved = JSON.parse(f.values.get('provider:chatgpt')!); assert.equal(saved.accessToken, undefined); assert.equal(saved.refreshToken, undefined); assert.equal(saved.clientId, 'oaiapp_openhiatus_test');
});

test('cancellation and timeout close loopback listeners; unsafe discovery never opens the browser', async () => {
  const f = await fixture({ callback: 'none' });
  const pending = f.auth.signIn();
  while (!f.browserUrls.length) await new Promise(resolve => setTimeout(resolve, 2));
  const callback = f.browserUrls[0].searchParams.get('redirect_uri')!;
  const rejection = assert.rejects(pending, /abgebrochen/); await f.auth.cancelSignIn(); await rejection;
  await assert.rejects(fetch(callback)); assert.equal(f.auth.snapshot().status, 'signed-out');
  const expired = await fixture({ callback: 'none', timeoutMs: 30 }); await assert.rejects(expired.auth.signIn(), /abgebrochen|abgelaufen/);
  await assert.rejects(fetch(expired.browserUrls[0].searchParams.get('redirect_uri')!));
  const unsafe = await fixture({ discoveryOverride: { jwks_uri: 'https://attacker.example/jwks' } }); await assert.rejects(unsafe.auth.signIn()); assert.equal(unsafe.browserUrls.length, 0);
});

test('one canceled caller does not cancel another caller sharing token refresh; signout prevents late rotation writes', async () => {
  const f = await fixture(); await f.auth.signIn(); f.advance(3_550_000); f.setRefreshDelay(40);
  const controller = new AbortController(), first = f.auth.getAccessToken(controller.signal), second = f.auth.getAccessToken();
  const rejected = assert.rejects(first, /abgebrochen/); controller.abort(); await rejected;
  assert.equal(await second, 'access-refresh-1'); assert.equal(f.counts().refreshes, 1);
  f.advance(3_550_000); const refresh = f.auth.getAccessToken(); const failedRefresh = assert.rejects(refresh);
  await f.auth.signOut(); await failedRefresh;
  assert.equal(JSON.parse(f.values.get('provider:chatgpt')!).accessToken, undefined);
});

test('corrupt host metadata is backed up and recovered without breaking startup; mismatched credentials stay disabled', async () => {
  const f = await fixture(); await f.auth.signIn();
  const oldHost = JSON.parse(await readFile(join(f.directory, 'chatgpt-host.json'), 'utf8')).id;
  await writeFile(join(f.directory, 'chatgpt-host.json'), '{truncated', 'utf8');
  const restored = new ChatGPTAuth(f.directory, f.credentials, { fetch: f.mockFetch, openBrowser: f.openBrowser, now: f.now });
  const newHost = JSON.parse(await readFile(join(f.directory, 'chatgpt-host.json'), 'utf8')).id;
  assert.notEqual(newHost, oldHost); assert.match(newHost, /^urn:uuid:/);
  assert.ok((await readdir(f.directory)).some(name => name.startsWith('chatgpt-host.json.invalid-') && name.endsWith('.bak')));
  assert.equal(restored.snapshot().status, 'error'); assert.equal(restored.snapshot().planUsage, false);
  assert.match(restored.snapshot().error ?? '', /beschädigten Installation/); assert.deepEqual(restored.listModels(), []);
});

test('direct ChatGPT completion uses only public Responses, stream true/store false, and requires response.completed', async () => {
  const f = await fixture(); await f.auth.signIn();
  const providers = new ProviderStore(f.directory, f.credentials, f.auth);
  let status: 'completed' | 'incomplete' | 'failed' = 'completed';
  const client = new ModelClient(providers, { fetch: async (url, init) => {
    assert.equal(String(url), `${API}/responses`);
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer access-1');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.stream, true); assert.equal(body.store, false); assert.equal(body.tools, undefined);
    assert.equal(body.max_output_tokens, undefined); // Pi recognizes the subscription token; unsupported API fields stay out.
    const response = { id: 'resp_test', status, model: body.model,
      output: [{ type: 'message', id: 'msg_test', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Finished summary', annotations: [] }] }],
      usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 },
      ...(status === 'incomplete' ? { incomplete_details: { reason: 'max_output_tokens' } } : {}),
      ...(status === 'failed' ? { error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'Limit reached.' } } : {}) };
    const item = response.output[0];
    const events = [
      { type: 'response.created', response: { id: response.id, status: 'in_progress', output: [] } },
      { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
      { type: 'response.content_part.added', item_id: item.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
      { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: 'Finished summary' },
      { type: 'response.output_text.done', item_id: item.id, output_index: 0, content_index: 0, text: 'Finished summary' },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: `response.${status}`, response },
    ];
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
  } });
  assert.equal(await client.complete('Summarize', 'chatgpt/gpt-6.1-sol', new AbortController().signal), 'Finished summary');
  status = 'incomplete'; await assert.rejects(client.complete('Summarize', 'chatgpt/gpt-6.1-sol', new AbortController().signal), /unvollständig|vollständig/);
  status = 'failed'; await assert.rejects(client.complete('Summarize', 'chatgpt/gpt-6.1-sol', new AbortController().signal), /subscription_sharing_usage_limit_exceeded/);
  assert.equal(f.auth.snapshot().planUsage, true); assert.equal(f.counts().calls, 1);
});

test('signout retries an unavailable revocation once, clears local tokens and reports unconfirmed remote revocation', async () => {
  const f = await fixture({ revocationFailure: true }); await f.auth.signIn(); await f.auth.signOut();
  assert.equal(f.counts().revocations, 2); assert.equal(f.auth.snapshot().planUsage, false);
  assert.match(f.auth.snapshot().error ?? '', /Abmeldung bei OpenAI konnte nicht bestätigt/);
  const saved = JSON.parse(f.values.get('provider:chatgpt')!); assert.equal(saved.refreshToken, undefined); assert.equal(saved.clientId, 'oaiapp_openhiatus_test');
});
