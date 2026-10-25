import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { AppController } from '../src/main/controller';
import { defaultState, StateStore } from '../src/main/storage';
import { needsOnboarding, onboardingStep, parseOnboarding } from '../src/shared/onboarding';
import { decodeSnapshot } from '../src/shared/ipc';
import { snapshotFixture } from './ipc-fixtures';

function fixture(complete: (prompt: string, model: string, signal: AbortSignal) => Promise<string> = async () => 'Hallo!', acknowledged = true) {
  let saved = defaultState(); saved.preferences.fullAccessAcknowledged = acknowledged;
  saved.messages.push({ id: 'private-fixture', role: 'user', text: 'Synthetic private conversation', at: '2026-10-25T00:00:00Z' });
  let runs = 0;
  const store = { load: () => structuredClone(saved), save: (value: typeof saved) => { saved = structuredClone(value); } };
  const app = new AppController({ store, credentials: { get: () => undefined, set() {}, remove() {} },
    speech: { async transcribe() { return ''; }, async synthesize() { return { base64: '', mimeType: 'audio/wav' }; }, async test() { return { base64: '', mimeType: 'audio/wav' }; } },
    agent: { async start() {}, async run() { runs++; }, async stop() {}, async dispose() {} },
    modelClient: { complete }, workspace: 'C:\\synthetic', publish() {},
  });
  app.handle({ type: 'models', models: [{ id: 'local/test', label: 'Test' }, { id: 'local/second', label: 'Second' }] });
  app.handle({ type: 'connection', status: 'ready' });
  return { app, store, saved: () => saved, runs: () => runs };
}

test('onboarding migration leaves configured profiles alone; incomplete and deferred profiles remain resumable', () => {
  const snapshot = snapshotFixture();
  assert.equal(needsOnboarding(snapshot), true); assert.equal(onboardingStep(snapshot), 0);
  snapshot.preferences.fullAccessAcknowledged = true;
  snapshot.providers = [{ id: 'local', label: 'Local', configured: true, verified: false, models: [] }];
  assert.equal(needsOnboarding(snapshot), false);
  snapshot.preferences.onboarding = { version: 2, step: 4, status: 'later' };
  assert.equal(needsOnboarding(snapshot), true); assert.equal(onboardingStep(snapshot), 2);
  snapshot.models = [{ id: 'local/test', label: 'Test' }];
  assert.equal(onboardingStep(snapshot), 4);
  assert.equal(onboardingStep(snapshot, true), 0);
  snapshot.preferences.onboarding.status = 'complete'; assert.equal(needsOnboarding(snapshot), false);
  assert.equal(onboardingStep(snapshot), 0);
  snapshot.preferences.onboarding = parseOnboarding({ version: 1, step: 3, status: 'later' });
  assert.equal(onboardingStep(snapshot), 1);
  assert.deepEqual(parseOnboarding({ version: 1, step: 3, status: 'complete' }), { version: 2, step: 4, status: 'complete' });
});

test('progress survives disk and IPC without accepting arbitrary data', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'openhiatus-onboarding-'));
  const store = new StateStore(directory), saved = defaultState(), snapshot = snapshotFixture();
  for (const status of ['active', 'later', 'complete'] as const) {
    saved.preferences.onboarding = snapshot.preferences.onboarding = { version: 2, step: 4, status };
    store.save(saved);
    assert.deepEqual(new StateStore(directory).load().preferences.onboarding, saved.preferences.onboarding);
    assert.deepEqual(decodeSnapshot(snapshot).preferences.onboarding, saved.preferences.onboarding);
  }
  for (const value of [null, [], {}, { version: 3, step: 1, status: 'active' }, { version: 1, step: 4, status: 'active' }, { version: 2, step: 5, status: 'active' }, { version: 1, step: 1, status: 'unknown' }, { version: 2, step: 1, status: 'active', key: 'secret' }]) assert.throws(() => parseOnboarding(value));
});

test('progress is durable before acknowledgement and rolls back when disk persistence fails', async () => {
  const f = fixture();
  try {
    await f.app.savePreferences({ onboarding: { version: 2, step: 1, status: 'active' } });
    assert.equal(f.saved().preferences.onboarding?.step, 1);
    const save = f.store.save;
    f.store.save = () => { throw new Error('Synthetic disk failure'); };
    await assert.rejects(f.app.savePreferences({ onboarding: { version: 2, step: 4, status: 'complete' } }), /disk failure/);
    assert.equal(f.app.snapshot().preferences.onboarding?.step, 1);
    f.store.save = save;
    await assert.rejects(f.app.savePreferences({ onboarding: { version: 1, step: 9, status: 'active' } } as never));
    await new Promise(resolve => setImmediate(resolve));
  } finally { await f.app.dispose(); }
});

test('setup check sends only a fixed greeting prompt and never starts an agent or includes private context', async () => {
  const calls: string[] = [];
  const f = fixture(async (prompt, model) => { calls.push(prompt); assert.equal(model, 'local/test'); return 'Bonjour !'; });
  try {
    await f.app.savePreferences({ uiLanguage: 'fr' });
    assert.deepEqual(await f.app.checkSetup(), { model: 'local/test', answer: 'Bonjour !' });
    assert.equal(calls.length, 1); assert.match(calls[0], /language fr/);
    assert.ok(!calls[0].includes('private')); assert.equal(f.runs(), 0);
    assert.equal(f.app.snapshot().workItems?.length ?? 0, 0);
    assert.equal(f.app.snapshot().preferences.onboarding, undefined);
  } finally { await f.app.dispose(); }
});

test('stop rejects promptly even when a model ignores cancellation; late replies cannot report success', async () => {
  let release!: (text: string) => void, signal!: AbortSignal;
  const f = fixture(async (_prompt, _model, current) => { signal = current; return new Promise(resolve => { release = resolve; }); });
  try {
    const checked = f.app.checkSetup(), rejection = assert.rejects(checked, /gestoppt/);
    await assert.rejects(f.app.checkSetup(), /bereits/);
    await f.app.stop(); await rejection;
    assert.equal(signal.aborted, true); release('Late success');
    assert.equal(f.app.snapshot().preferences.onboarding, undefined);
  } finally { await f.app.dispose(); }
});

test('setup requests require consent and stop waiting after the fixed time limit', async context => {
  let calls = 0;
  const f = fixture(async () => { calls++; return new Promise(() => {}); }, false);
  try {
    await assert.rejects(f.app.checkSetup(), /Vollzugriff/); assert.equal(calls, 0);
    await f.app.acknowledgeFullAccess();
    context.mock.timers.enable({ apis: ['setTimeout'] });
    const rejected = assert.rejects(f.app.checkSetup(), /Zeitlimit/);
    context.mock.timers.tick(30_001); await rejected;
    assert.equal(calls, 1);
  } finally { context.mock.timers.reset(); await f.app.dispose(); }
});

test('empty and failed responses do not pass; changing the model invalidates a pending reply', async () => {
  const empty = fixture(async () => ' ');
  try { await assert.rejects(empty.app.checkSetup(), /keine Antwort/); } finally { await empty.app.dispose(); }
  const failed = fixture(async () => { throw Error('Synthetic authentication failure'); });
  try { await assert.rejects(failed.app.checkSetup(), /authentication failure/); } finally { await failed.app.dispose(); }
  let release!: (text: string) => void;
  const f = fixture(async () => new Promise(resolve => { release = resolve; }));
  try {
    const checked = f.app.checkSetup(), rejection = assert.rejects(checked, /nicht mehr aktuell/);
    await f.app.savePreferences({ dialogModel: 'local/second' }); release('Old model'); await rejection;
  } finally { await f.app.dispose(); }
});
