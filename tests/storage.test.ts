import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { CredentialStore, StateStore, defaultState, type CredentialCrypto } from '../src/main/storage';

function directory() { return mkdtempSync(join(tmpdir(), 'openhiatus-storage-test-')); }

test('background jobs roundtrip explicit fields, redact results, and restart never replays queued or running work', () => {
  const path = directory(); const store = new StateStore(path); const state = defaultState();
  const secret = 'sk-synthetic-provider-key-12345678901234567890';
  state.jobs = ['queued', 'running', 'completed'].map((status, index) => ({
    id: `job-${index}`, requestId: `request-${index}`, title: 'Überprüfung', prompt: 'Lies das Projekt.',
    status: status as 'queued' | 'running' | 'completed', model: 'test-model', resources: ['C:\\Projekt'],
    createdAt: '2026-10-07T12:00:00Z', updatedAt: '2026-10-07T12:00:00Z', runtimeRetained: true,
    result: `Bekannter Text ${secret}`,
  }));
  Object.assign(state.jobs[0], { credentials: secret });
  store.save(state);
  const raw = readFileSync(join(path, 'state.json'), 'utf8');
  assert.ok(!raw.includes(secret)); assert.ok(!raw.includes('credentials'));
  const restored = store.load();
  assert.deepEqual(restored.jobs!.map(job => job.status), ['interrupted', 'interrupted', 'completed']);
  assert.ok(restored.jobs!.every(job => job.runtimeRetained === false));
  assert.equal(restored.preferences.voiceConversation, true);
});

test('legacy speech profiles gain conversation mode; invalid job metadata and voice choices cannot overwrite valid state', () => {
  const path = directory(); const state = defaultState(); delete state.preferences.voiceConversation;
  writeFileSync(join(path, 'state.json'), JSON.stringify({ version: 1, state }), 'utf8');
  const store = new StateStore(path); const migrated = store.load();
  assert.equal(migrated.preferences.voiceConversation, true);
  migrated.preferences.voiceConversation = false; store.save(migrated);
  assert.equal(store.load().preferences.voiceConversation, false);
  const original = readFileSync(join(path, 'state.json'), 'utf8');
  assert.throws(() => store.save({ ...migrated, preferences: { ...migrated.preferences, voiceConversation: 'true' as unknown as boolean } }), /Sprachdialog/);
  assert.throws(() => store.save({ ...migrated, jobs: [{ id: 'bad' }] as unknown as typeof migrated.jobs }), /Hintergrundaufgabe/);
  assert.equal(readFileSync(join(path, 'state.json'), 'utf8'), original);
});

test('full access consent persists but a recovered backup requires a fresh acknowledgement', () => {
  const path = directory(); const store = new StateStore(path); const state = defaultState();
  assert.equal(state.preferences.fullAccessAcknowledged, false);
  state.preferences.fullAccessAcknowledged = true; store.save(state); store.save(state);
  assert.equal(store.load().preferences.fullAccessAcknowledged, true);
  writeFileSync(join(path, 'state.json'), '{broken', 'utf8');
  assert.equal(store.load().preferences.fullAccessAcknowledged, false);
});

test('automatic memory choice migrates explicitly, persists opt-out and rejects invalid values', () => {
  const path = directory(); const state = defaultState();
  delete state.preferences.memoryAutoSummarize;
  writeFileSync(join(path, 'state.json'), JSON.stringify({version: 1, state}), 'utf8');
  const store = new StateStore(path);
  const restored = store.load();
  assert.equal(restored.preferences.memoryAutoSummarize, true);
  restored.preferences.memoryAutoSummarize = false;
  store.save(restored);
  assert.equal(new StateStore(path).load().preferences.memoryAutoSummarize, false);
  const original = readFileSync(join(path, 'state.json'), 'utf8');
  for (const value of ['false', 0, 1, null, {}]) {
    const invalid = structuredClone(restored);
    Object.assign(invalid.preferences, {memoryAutoSummarize:value});
    assert.throws(() => store.save(invalid), /Gedächtnisverdichtung/);
  }
  assert.equal(readFileSync(join(path, 'state.json'), 'utf8'), original);
});
function crypto(): CredentialCrypto {
  // Deliberately not DPAPI: this is a contract test. Electron/Windows is tested separately.
  const secret = randomBytes(32);
  return {
    isEncryptionAvailable: () => true,
    encryptString(value) {
      const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', secret, iv);
      const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
    },
    decryptString(value) {
      const decipher = createDecipheriv('aes-256-gcm', secret, value.subarray(0, 12));
      decipher.setAuthTag(value.subarray(12, 28));
      return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8');
    },
  };
}

test('roundtrips German history/preferences and persists only contract fields', () => {
  const path = directory(); const store = new StateStore(path); const state = defaultState();
  state.messages.push({ id: 'one', role: 'user', at: '2026-10-05T00:00:00Z', text: 'Äpfel, Grüße, Köln – los!' });
  state.preferences.voiceId = 'Dennis';
  store.save({ ...state, connections: { apiKey: 'must-not-be-saved' } } as typeof state);
  assert.deepEqual(new StateStore(path).load(), state);
  const saved = readFileSync(join(path, 'state.json'), 'utf8');
  assert.ok(!saved.includes('must-not-be-saved'));
  assert.ok(saved.includes('Grüße'));
});

test('restart marks running and stopping tasks interrupted without replay', () => {
  for (const status of ['running', 'stopping'] as const) {
    const path = directory(); const state = defaultState();
    state.task = { id: 'request-1', status, threadId: 'thread-1', turnId: 'turn-1' };
    const store = new StateStore(path); store.save(state);
    const recovered = store.load();
    assert.equal(recovered.task.status, 'interrupted'); assert.equal(recovered.task.id, 'request-1');
    assert.equal(recovered.task.threadId, 'thread-1'); assert.match(recovered.task.error!, /nicht automatisch/);
    store.save(recovered);
    assert.equal(store.load().activity.length, 1);
  }
});

test('damaged primary restores a valid prior version and preserves its safety state', () => {
  const path = directory(); const store = new StateStore(path); const state = defaultState();
  state.task = { id: 'first', status: 'running' }; store.save(state);
  state.task.status = 'completed'; store.save(state);
  writeFileSync(join(path, 'state.json'), '{broken');
  const recovered = store.load();
  assert.equal(recovered.task.status, 'interrupted');
  assert.ok(recovered.activity.some(row => row.title.includes('Sicherung')));
  store.save(recovered);
  assert.equal(store.load().task.status, 'interrupted');
});

test('invalid state and unknown future versions are preserved, never silently overwritten', () => {
  const path = directory(); const store = new StateStore(path);
  writeFileSync(join(path, 'state.json'), '{broken');
  assert.throws(() => store.load(), /beschädigt/);
  writeFileSync(join(path, 'state.json'), JSON.stringify({ version: 99, state: defaultState() }));
  assert.throws(() => store.load(), /nicht unterstützten/);
  assert.throws(() => store.save(defaultState()), /nicht unterstützten/);
  assert.equal(JSON.parse(readFileSync(join(path, 'state.json'), 'utf8')).version, 99);
});

test('credential storage roundtrips ciphertext and removal leaves no secret history', () => {
  const path = directory(); const cryptography = crypto(); const store = new CredentialStore(path, cryptography);
  const key = Buffer.from('synthetic:key-for-test-only').toString('base64');
  assert.equal(store.get('inworld'), undefined);
  store.set('inworld', key);
  assert.equal(new CredentialStore(path, cryptography).get('inworld'), key);
  const stored = readFileSync(join(path, 'credentials.json'), 'utf8');
  assert.ok(!stored.includes(key)); assert.ok(!stored.includes('synthetic'));
  store.remove('inworld'); assert.equal(store.get('inworld'), undefined);
  assert.deepEqual(readdirSync(path), []);
});

test('credential storage fails closed without OS encryption and handles another Windows identity', () => {
  const path = directory(); let called = false;
  const unavailable: CredentialCrypto = { isEncryptionAvailable: () => false, encryptString() { called = true; return Buffer.alloc(0); }, decryptString() { return ''; } };
  assert.throws(() => new CredentialStore(path, unavailable).set('inworld', 'c3ludGhldGlj'), /nicht unverschlüsselt/);
  assert.equal(called, false); assert.deepEqual(readdirSync(path), []);
  new CredentialStore(path, crypto()).set('inworld', 'c3ludGhldGlj');
  assert.throws(() => new CredentialStore(path, crypto()).get('inworld'), /Windows-Benutzer/);
  new CredentialStore(path, unavailable).remove('inworld'); assert.deepEqual(readdirSync(path), []);
});

test('generic known credential shapes are redacted from persisted activity and messages', () => {
  const path = directory(); const store = new StateStore(path); const state = defaultState();
  state.messages.push({ id: 'message', role: 'user', at: '', text: 'api_key=example-secret' });
  state.activity.push({ id: 'activity', kind: 'error', at: '', title: 'Bearer secret-for-test' });
  store.save(state);
  const content = readFileSync(join(path, 'state.json'), 'utf8');
  assert.ok(!content.includes('example-secret')); assert.ok(!content.includes('secret-for-test'));
});

test('arbitrary provider keys coexist with speech and roundtrip only as OS ciphertext', () => {
  const path = directory(); const store = new CredentialStore(path, crypto());
  store.set('inworld', 'c3ludGhldGlj'); store.set('anthropic', 'sk-ant-test'); store.set('google', 'AIza-test');
  assert.equal(store.get('anthropic'), 'sk-ant-test'); assert.equal(store.get('google'), 'AIza-test');
  const stored = readFileSync(join(path, 'credentials.json'), 'utf8');
  assert.ok(!stored.includes('sk-ant-test')); assert.ok(!stored.includes('AIza-test'));
  const unavailable: CredentialCrypto = { isEncryptionAvailable: () => false, encryptString() { throw new Error(); }, decryptString() { throw new Error(); } };
  const withoutCrypto = new CredentialStore(path, unavailable); withoutCrypto.remove('anthropic');
  assert.equal(store.get('google'), 'AIza-test'); assert.equal(store.get('inworld'), 'c3ludGhldGlj');
  assert.equal(store.get('anthropic'), undefined);
});

test('malformed provider envelopes and unsafe names fail closed without overwriting keys', () => {
  for (const content of ['{broken', JSON.stringify({ version: 99, keys: {} }), JSON.stringify({ version: 1, keys: { google: 'plaintext-invalid!' } }), JSON.stringify({ version: 1, keys: { google: null } })]) {
    const path = directory(); const store = new CredentialStore(path, crypto()); writeFileSync(join(path, 'credentials.json'), content);
    assert.throws(() => store.get('google'), /unverändert/); assert.throws(() => store.set('google', 'replacement'), /unverändert/);
    assert.equal(readFileSync(join(path, 'credentials.json'), 'utf8'), content);
  }
  const store = new CredentialStore(directory(), crypto());
  for (const name of ['__proto__', 'constructor', '../keys', '', 'version']) assert.throws(() => store.set(name, 'secret'), /Verbindung/);
});

test('provider encryption failure and invalid key data preserve all existing ciphertext', () => {
  const path = directory(); const cryptography = crypto(); const store = new CredentialStore(path, cryptography);
  store.set('inworld', 'c3ludGhldGlj'); const original = readFileSync(join(path, 'credentials.json'), 'utf8');
  for (const key of ['', 'abc\n123', 'a'.repeat(8193)]) assert.throws(() => store.set('anthropic', key), /gültigen API/);
  assert.throws(() => store.set('inworld', 'sk-test-only'), /Base64/);
  const failedCrypto = { ...cryptography, encryptString() { throw new Error('secret-provider-body'); } };
  assert.throws(() => new CredentialStore(path, failedCrypto).set('anthropic', 'sk-ant-test'), error => {
    assert.match((error as Error).message, /verschlüsselt/); assert.ok(!(error as Error).message.includes('secret-provider-body')); return true;
  });
  assert.equal(readFileSync(join(path, 'credentials.json'), 'utf8'), original);
});

test('interrupted first credential writes can be read without losing another provider', () => {
  const path = directory(); const cryptography = crypto(); const store = new CredentialStore(path, cryptography);
  writeFileSync(join(path, 'credentials.json.tmp'), JSON.stringify({ version: 1, keys: { inworld: cryptography.encryptString('c3ludGhldGlj').toString('base64') } }));
  assert.equal(store.get('inworld'), 'c3ludGhldGlj'); store.set('google', 'AIza-test');
  assert.equal(store.get('inworld'), 'c3ludGhldGlj'); assert.equal(store.get('google'), 'AIza-test');
  assert.deepEqual(readdirSync(path), ['credentials.json']);
});

test('usage is optional in old profiles, projected, persisted and restricted to finite nonnegative values', () => {
  const path = directory(); const store = new StateStore(path); const state = defaultState();
  store.save(state); assert.equal(store.load().usage, undefined);
  state.usage = { inputTokens: 10, outputTokens: 3, cacheReadTokens: 2, cacheWriteTokens: 0, costUsd: 0.001 };
  Object.assign(state.usage, { apiKey: 'never-persist' }); store.save(state);
  assert.deepEqual(store.load().usage, { inputTokens: 10, outputTokens: 3, cacheReadTokens: 2, cacheWriteTokens: 0, costUsd: 0.001 });
  const original = readFileSync(join(path, 'state.json'), 'utf8'); assert.ok(!original.includes('never-persist'));
  for (const invalid of [-1, Number.NaN, Infinity, -Infinity, '10', null]) {
    const copy = structuredClone(state); Object.assign(copy.usage!, { inputTokens: invalid });
    assert.throws(() => store.save(copy), /Modellverbrauch/);
  }
  for (const invalid of [-0.1, Number.NaN, Infinity]) {
    const copy = structuredClone(state); copy.usage!.costUsd = invalid;
    assert.throws(() => store.save(copy), /Modellverbrauch/);
  }
  assert.equal(readFileSync(join(path, 'state.json'), 'utf8'), original);
});

test('automatic ChatGPT background consent defaults off, roundtrips explicitly and rejects coercion', () => {
  const path = directory(); const state = defaultState(); delete state.preferences.chatgptBackgroundUsage;
  writeFileSync(join(path, 'state.json'), JSON.stringify({ version: 1, state }), 'utf8');
  const store = new StateStore(path); const restored = store.load(); assert.equal(restored.preferences.chatgptBackgroundUsage, false);
  restored.preferences.chatgptBackgroundUsage = true; store.save(restored); assert.equal(store.load().preferences.chatgptBackgroundUsage, true);
  const original = readFileSync(join(path, 'state.json'), 'utf8');
  for (const invalid of ['true', 1, null, {}]) {
    const copy = structuredClone(restored); Object.assign(copy.preferences, { chatgptBackgroundUsage: invalid });
    assert.throws(() => store.save(copy), /ChatGPT/);
  }
  assert.equal(readFileSync(join(path, 'state.json'), 'utf8'), original);
  store.save(restored); writeFileSync(join(path, 'state.json'), '{broken', 'utf8');
  assert.equal(store.load().preferences.chatgptBackgroundUsage, false, 'a stale backup cannot revive withdrawn automatic usage consent');
});

test('large compact OAuth records use DPAPI storage without relaxing ordinary API key limits', () => {
  const path = directory(); const cryptography = crypto(); const store = new CredentialStore(path, cryptography);
  const record = JSON.stringify({ accessToken: 'test-access-' + 'x'.repeat(24000), refreshToken: 'test-refresh-' + 'y'.repeat(24000), account: 'test@example.invalid' });
  assert.ok(Buffer.byteLength(record) > 8192); assert.ok(Buffer.byteLength(record) < 64 * 1024);
  store.set('inworld', 'c3ludGhldGlj'); store.set('provider:chatgpt', record);
  assert.ok(readFileSync(join(path, 'credentials.json'), 'utf8').length > 64000);
  assert.equal(new CredentialStore(path, cryptography).get('provider:chatgpt'), record);
  const original = readFileSync(join(path, 'credentials.json'), 'utf8');
  assert.ok(!original.includes('test-access-')); assert.ok(!original.includes('test-refresh-'));
  for (const invalid of ['{}\n', '{"a":\n1}', '[]', 'null', 'not-json', JSON.stringify({ token: 'ü'.repeat(33000) })]) assert.throws(() => store.set('provider:chatgpt', invalid));
  assert.throws(() => store.set('provider:google', 'a'.repeat(8193)), /API-Schlüssel/);
  const unavailable = new CredentialStore(path, { ...cryptography, isEncryptionAvailable: () => false });
  assert.throws(() => unavailable.get('provider:chatgpt'), /Windows-Schlüsselschutz/);
  assert.equal(readFileSync(join(path, 'credentials.json'), 'utf8'), original);
  unavailable.remove('provider:chatgpt'); assert.equal(store.get('inworld'), 'c3ludGhldGlj');
});
