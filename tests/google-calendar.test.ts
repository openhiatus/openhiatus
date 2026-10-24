import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GoogleCalendarAuth, CalendarError, GOOGLE_CALENDAR_SCOPES } from '../src/main/platform/services/google-calendar-auth';
import { GoogleCalendarService } from '../src/main/platform/services/google-calendar';
import { parseCalendarEventInput } from '../src/shared/calendar';
import { ServiceBroker } from '../src/main/modules/services';
import { createToolRegistry } from '../src/main/modules/tools';
import { CredentialStore } from '../src/main/storage';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';

const client = { clientId: 'synthetic-calendar.apps.googleusercontent.com', clientSecret: 'synthetic-client-secret' };
const event = { title: 'Fokusblock', start: { dateTime: '2026-10-26T10:00:00+01:00', timeZone: 'Europe/Berlin' }, end: { dateTime: '2026-10-26T11:00:00+01:00', timeZone: 'Europe/Berlin' } };
const query = { timeMin: '2026-10-26T00:00:00Z', timeMax: '2026-10-27T00:00:00Z' };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const turn = () => new Promise<void>(resolve => setImmediate(resolve));
async function fixture(t: { after(action: () => Promise<void>): void }, options: { pending?: boolean; scope?: string; timeout?: number; holdRefresh?: () => Promise<void>; malformedWrite?: boolean } = {}) {
  const values = new Map<string, string>(), credentials = { get: (key: string) => values.get(key), set: (key: string, value: string) => { values.set(key, value); }, remove: (key: string) => { values.delete(key); } };
  let now = Date.parse('2026-10-24T10:00:00Z'), authUrl: URL | undefined, refreshes = 0, failure = 0;
  const calls: { url: string; method: string; body: any; headers: Headers }[] = [], events = new Map<string, any>();
  let refreshFailed = false, wrongStateRejected = false, changed = () => {};
  const request: typeof fetch = async (input, init) => {
    const request = new Request(input, init), url = new URL(request.url), method = request.method;
    const text = await request.text(), body = request.headers.get('content-type')?.includes('json') ? JSON.parse(text) : Object.fromEntries(new URLSearchParams(text));
    calls.push({ url: url.href, method, body, headers: request.headers });
    if (url.hostname === 'oauth2.googleapis.com' && url.pathname === '/token') {
      assert.equal(body.client_id, client.clientId); assert.equal(body.client_secret, client.clientSecret);
      if (body.grant_type === 'authorization_code') { assert.equal(body.redirect_uri, authUrl!.searchParams.get('redirect_uri')); assert.equal(createHash('sha256').update(body.code_verifier).digest('base64url'), authUrl!.searchParams.get('code_challenge')); }
      else { refreshes++; await options.holdRefresh?.(); if (refreshFailed) return response({ error: 'invalid_grant', error_description: 'must-not-copy-provider-content' }, 400); }
      return response({ token_type: 'Bearer', access_token: `synthetic-access-${refreshes}`, refresh_token: `synthetic-refresh-${refreshes}`, expires_in: 3600, scope: options.scope ?? GOOGLE_CALENDAR_SCOPES.join(' ') });
    }
    if (url.pathname === '/revoke') return response({});
    assert.equal(url.hostname, 'www.googleapis.com'); assert.ok(request.headers.get('authorization')?.startsWith('Bearer synthetic-access-'));
    if (url.pathname.endsWith('/calendarList')) return response({ items: [{ id: 'sam@synthetic.example', summary: 'Privat', accessRole: 'owner', primary: true, timeZone: 'Europe/Berlin' }, { id: 'readonly@synthetic.example', summary: 'Familie', accessRole: 'reader', timeZone: 'Europe/Berlin' }] });
    if (failure) return response({ error: { message: 'must-not-copy-provider-content synthetic-access-0' } }, failure);
    const id = decodeURIComponent(url.pathname.split('/').at(-1)!);
    if (method === 'POST') { if (events.has(body.id)) return response({}, 409); const created = { ...body, etag: '"v1"', status: 'confirmed' }; events.set(body.id, created); return response(options.malformedWrite ? {} : created); }
    if (method === 'PATCH') { assert.equal(request.headers.get('if-match'), '"v1"'); const updated = { ...events.get(id), ...body, etag: '"v2"' }; events.set(id, updated); return response(updated); }
    if (url.pathname.endsWith('/events')) return response({ items: [...events.values()], timeZone: 'Europe/Berlin' });
    return events.has(id) ? response(events.get(id)) : response({}, 404);
  };
  const auth = new GoogleCalendarAuth(credentials, { fetch: request, now: () => now, loginTimeoutMs: options.timeout ?? 5000, onChange: () => changed(), openBrowser: async value => {
    authUrl = new URL(value); assert.equal(authUrl.origin, 'https://accounts.google.com'); assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256'); assert.equal(authUrl.searchParams.get('access_type'), 'offline');
    if (options.pending) return;
    const callback = new URL(authUrl.searchParams.get('redirect_uri')!); assert.equal(callback.hostname, '127.0.0.1'); callback.searchParams.set('state', 'incorrect'); callback.searchParams.set('code', 'synthetic-code');
    wrongStateRejected = (await fetch(callback)).status === 400;
    callback.searchParams.set('state', authUrl.searchParams.get('state')!); assert.equal((await fetch(callback)).status, 200);
  } });
  t.after(() => auth.dispose()); await auth.configure(client);
  const service = new GoogleCalendarService(auth);
  return { auth, service, credentials, values, calls, events, connect: () => auth.connect(), url: () => authUrl, wrongState: () => wrongStateRejected,
    advance: () => { now += 3600000; }, refreshes: () => refreshes, failRefresh: () => { refreshFailed = true; }, fail: (status: number) => { failure = status; }, onChange: (callback: () => void) => { changed = callback; } };
}

test('real loopback OAuth uses State and PKCE, persists privately, restores selection and revokes on disconnect', async t => {
  const f = await fixture(t); await f.connect(); assert.equal(f.wrongState(), true);
  const state = f.auth.snapshot(); assert.equal(state.status, 'ready'); assert.equal(state.calendars.length, 2); assert.equal(state.account, 'sam@synthetic.example');
  assert.ok(!JSON.stringify(state).includes('synthetic-access')); assert.ok(!JSON.stringify(state).includes('synthetic-client-secret'));
  f.auth.select('readonly@synthetic.example');
  const restarted = new GoogleCalendarAuth(f.credentials, { openBrowser: async () => {} });
  assert.equal(restarted.snapshot().selectedCalendarId, 'readonly@synthetic.example'); await restarted.dispose();
  await f.auth.disconnect(); assert.equal(f.auth.snapshot().status, 'disconnected');
  assert.ok(f.calls.some(call => call.url.endsWith('/revoke'))); assert.ok(!f.values.get('service:google-calendar')!.includes('synthetic-refresh'));
});

test('a mistyped short client secret does not damage text through broad secret redaction', async t => {
  const f = await fixture(t); await f.auth.configure({ clientId: client.clientId, clientSecret: 'x' });
  assert.ok(!f.auth.secrets().includes('x'));
});
test('missing scopes never install an account and login cancellation closes its listener', async t => {
  const denied = await fixture(t, { scope: GOOGLE_CALENDAR_SCOPES[0] }); await assert.rejects(denied.connect(), /Freigabe|freigeben|Zugang/); assert.notEqual(denied.auth.snapshot().status, 'ready');
  const pending = await fixture(t, { pending: true }); const login = pending.connect(); void login.catch(() => {}); while (!pending.url()) await turn();
  const redirect = pending.url()!.searchParams.get('redirect_uri')!; await pending.auth.cancelLogin(); await assert.rejects(login, /abgebrochen/);
  await assert.rejects(fetch(redirect)); assert.notEqual(pending.auth.snapshot().status, 'connecting');
});
test('simultaneous expiry refreshes once and invalid grant makes reauthentication explicit without provider text', async t => {
  const f = await fixture(t); await f.connect(); f.advance(); await Promise.all([f.service.list(query, AbortSignal.timeout(5000)), f.service.list(query, AbortSignal.timeout(5000))]); assert.equal(f.refreshes(), 1);
  f.advance(); f.failRefresh(); await assert.rejects(f.service.list(query, AbortSignal.timeout(5000)), /erneut anmelden/); assert.equal(f.auth.snapshot().status, 'reauth-required'); assert.ok(!JSON.stringify(f.auth.snapshot()).includes('must-not-copy'));
});
test('create is idempotent in one task, update uses exact ETag, and conflict is never overwritten', async t => {
  const f = await fixture(t); await f.connect();
  const context = { provider: 'google_calendar', connectionId: 'google', jobId: 'job1', runId: 'run1', signal: AbortSignal.timeout(5000) };
  const first = await f.service.create({ requestId: 'focus', event }, context);
  assert.equal((await f.service.create({ requestId: 'focus', event }, context)).id, first.id); assert.equal(f.events.size, 1);
  await assert.rejects(f.service.create({ requestId: 'focus', event: { ...event, title: 'Different' } }, context), /anderen Termininhalt/);
  const updated = await f.service.update({ eventId: first.id, etag: first.etag, event: { ...event, title: 'Neuer Fokusblock' } }, context); assert.equal(updated.etag, '"v2"');
  await assert.rejects(f.service.update({ eventId: first.id, etag: first.etag, event }, context), /inzwischen/);
  assert.equal(f.calls.filter(call => call.method === 'PATCH').length, 1);
  f.auth.select('readonly@synthetic.example'); await assert.rejects(f.service.create({ requestId: 'new', event }, context), /nur lesbar/);
});

test('a truncated external description cannot be written over the complete Google event', async t => {
  const f = await fixture(t); await f.connect(); const context = { provider: 'google_calendar', connectionId: 'google', jobId: 'job', runId: 'run', signal: AbortSignal.timeout(5000) };
  const created = await f.service.create({ requestId: 'long-description', event }, context);
  f.events.get(created.id).description = 'x'.repeat(9000);
  const read = await f.service.get(created.id, context.signal); assert.match(read.description!, /Beschreibung gekürzt/);
  await assert.rejects(f.service.update({ eventId: created.id, etag: created.etag, event: { ...event, description: read.description } }, context), /längere Felder/);
  assert.equal(f.calls.filter(call => call.method === 'PATCH').length, 0);
});
test('all-day ends are exclusive, invalid dates and mismatched DST offsets fail before API writes', () => {
  assert.doesNotThrow(() => parseCalendarEventInput({ title: 'Frei', start: { date: '2026-10-26' }, end: { date: '2026-10-27' } }));
  for (const value of [{ ...event, start: { dateTime: '2026-02-31T10:00:00Z' } }, { ...event, start: { dateTime: '2026-03-29T02:30:00+01:00', timeZone: 'Europe/Berlin' } }, { ...event, end: event.start }, { ...event, attendees: ['unexpected'] }]) assert.throws(() => parseCalendarEventInput(value));
});
test('provider failures and ambiguous writes keep safe meaning and do not silently retry', async t => {
  const f = await fixture(t); await f.connect(); f.fail(503);
  await assert.rejects(f.service.create({ requestId: 'failure', event }, { provider: 'google_calendar', connectionId: 'google', jobId: 'job', runId: 'run', signal: AbortSignal.timeout(5000) }), (error: unknown) => error instanceof CalendarError && error.uncertain && !error.message.includes('synthetic-access'));
  assert.equal(f.calls.filter(call => call.method === 'POST' && call.url.includes('/events')).length, 1);
});

test('an incomplete successful write reply is uncertain rather than a failed change to retry', async t => {
  const f = await fixture(t, { malformedWrite: true }); await f.connect();
  await assert.rejects(f.service.create({ requestId: 'incomplete', event }, { provider: 'google_calendar', connectionId: 'google', jobId: 'job', runId: 'run', signal: AbortSignal.timeout(5000) }), (error: unknown) => error instanceof CalendarError && error.uncertain);
  assert.equal(f.events.size, 1); assert.equal(f.calls.filter(call => call.method === 'POST' && call.url.includes('/events')).length, 1);
});
test('explicit write tools remain worker-only and are revoked after a calendar switch', async t => {
  const f = await fixture(t); await f.connect(); const broker = new ServiceBroker(); broker.register(f.service.adapter());
  const publish = () => { const selected = f.auth.selected(); broker.setConnection({ provider: 'google_calendar', id: 'google', account: 'sam@synthetic.example', label: selected.title, status: 'ready', capabilities: ['calendar.read', ...(['writer', 'owner'].includes(selected.accessRole) ? ['calendar.write'] : [])] }); };
  publish(); f.onChange(publish);
  const registry = createToolRegistry([broker.createTools('job', ['read', 'write'])]);
  const bind = (role: 'worker' | 'dialog', id: string) => registry.bind({ role, runId: id, signal: new AbortController().signal, emit: () => {} });
  const bound = bind('worker', 'run'); assert.equal(bound.definitions.length, 4); assert.equal(bind('dialog', 'dialog').definitions.length, 0);
  const list = bound.definitions.find(tool => tool.name.includes('list_events'))!;
  f.auth.select('readonly@synthetic.example'); await assert.rejects(bound.call(list.name, query));
  const fresh = bind('worker', 'next'); assert.equal(fresh.definitions.length, 2); await registry.dispose(); broker.dispose();
});

test('shutdown retains a completed refresh rotation and rejects later calendar operations', async t => {
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  const f = await fixture(t, { holdRefresh: () => held }); await f.connect(); f.advance();
  const request = f.service.list(query, AbortSignal.timeout(5000)); void request.catch(() => {});
  while (!f.refreshes()) await turn();
  let closed = false; const closing = f.auth.dispose().then(() => { closed = true; });
  await turn(); assert.equal(closed, false); release(); await closing; await request.catch(() => {});
  assert.ok(f.values.get('service:google-calendar')!.includes('synthetic-refresh-1'));
  assert.throws(() => f.auth.select('sam@synthetic.example'), /beendet/);
});

test('the credential store accepts bounded structured Google credentials and rejects invalid records', t => {
  const directory = mkdtempSync(join(tmpdir(), 'openhiatus-google-credentials-'));
  t.after(() => { assert.equal(dirname(directory).toLowerCase(), resolve(tmpdir()).toLowerCase()); assert.ok(basename(directory).startsWith('openhiatus-google-credentials-')); rmSync(directory, { recursive: true, force: true }); });
  const store = new CredentialStore(directory, { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value), decryptString: value => value.toString() });
  const record = JSON.stringify({ clientId: client.clientId, refreshToken: 'synthetic-' + 'x'.repeat(20000) });
  store.set('service:google-calendar', record); assert.equal(store.get('service:google-calendar'), record);
  for (const invalid of ['[]', 'not-json', '{}\n', JSON.stringify({ data: 'x'.repeat(65536) })]) assert.throws(() => store.set('service:google-calendar', invalid));
});
