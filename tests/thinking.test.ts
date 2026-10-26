import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppController } from '../src/main/controller';
import { defaultState, StateStore } from '../src/main/storage';
import { decodeRun } from '../src/main/agent-wire';
import { decodeSnapshot } from '../src/shared/ipc';
import { thinkingPreferences, THINKING_PREFERENCES } from '../src/shared/thinking';

test('legacy preferences default to medium; distinct role and admitted-job choices survive storage and IPC', () => {
  const directory = mkdtempSync(join(tmpdir(), 'openhiatus-thinking-')), store = new StateStore(directory), legacy = defaultState();
  for (const key of THINKING_PREFERENCES) delete legacy.preferences[key];
  store.save(legacy);
  const state = store.load();
  assert.deepEqual(thinkingPreferences(state.preferences), { workThinkingLevel: 'medium', dialogThinkingLevel: 'medium', memoryThinkingLevel: 'medium', computerThinkingLevel: 'medium' });
  Object.assign(state.preferences, { workThinkingLevel: 'high', dialogThinkingLevel: 'low', memoryThinkingLevel: 'off', computerThinkingLevel: 'xhigh' });
  state.jobs = [{ id: 'job', requestId: 'request', title: 'Synthetic', prompt: 'Synthetic', status: 'completed', model: 'model', resources: [], createdAt: 'now', updatedAt: 'now', thinkingLevel: 'max',
    computer: { delegationEnabled: true, model: 'computer', fast: true, overviewScaleDivisor: 1, thinkingLevel: 'low' } }];
  store.save(state);
  const loaded = new StateStore(directory).load();
  const snapshot = decodeSnapshot({ ...loaded, connections: { agent: 'offline', account: '', speech: 'missing' }, models: [], workspace: 'synthetic', version: 'test' });
  assert.deepEqual(thinkingPreferences(snapshot.preferences), thinkingPreferences(state.preferences));
  assert.equal(snapshot.jobs?.[0].thinkingLevel, 'max'); assert.equal(snapshot.jobs?.[0].computer?.thinkingLevel, 'low');
  assert.throws(() => thinkingPreferences({ workThinkingLevel: null }));
});

test('thinking preferences validate before mutation, acknowledge storage and roll back failed writes', async () => {
  let saved = defaultState(), fail = false;
  const app = new AppController({ store: { load: () => structuredClone(saved), save: value => { if (fail) throw Error('Synthetic write failure'); saved = structuredClone(value); } },
    credentials: { get: () => undefined, set() {}, remove() {} }, workspace: 'C:\\synthetic', publish() {},
    speech: { async transcribe() { return ''; }, async synthesize() { return { base64: '', mimeType: 'audio/mpeg' }; }, async test() { return { base64: '', mimeType: 'audio/mpeg' }; } },
    agent: { async start() {}, async run() {}, async stop() {}, async dispose() {} } });
  try {
    for (const value of ['ultra', null, undefined, 3]) await assert.rejects(app.savePreferences({ dialogThinkingLevel: value as never, workThinkingLevel: 'high' }));
    assert.equal(app.snapshot().preferences.workThinkingLevel, 'medium');
    fail = true; await assert.rejects(app.savePreferences({ workThinkingLevel: 'high' }), /write failure/);
    assert.equal(app.snapshot().preferences.workThinkingLevel, 'medium');
    fail = false; await app.savePreferences({ workThinkingLevel: 'high', memoryThinkingLevel: 'low' });
    assert.equal(saved.preferences.workThinkingLevel, 'high'); assert.equal(saved.preferences.memoryThinkingLevel, 'low');
    assert.equal(saved.preferences.dialogThinkingLevel, 'medium');
  } finally { await app.dispose(); }
});

test('host wire accepts requested levels and rejects malformed thinking before starting a runtime', () => {
  const input = { runId: randomUUID(), text: 'Synthetic', home: 'home', workspace: 'work', dialog: true, tools: [], instructions: '',
    model: { provider: 'local', modelId: 'model', apiKey: 'synthetic', api: 'openai-completions' } };
  assert.equal(decodeRun(input).thinkingLevel, undefined);
  assert.equal(decodeRun({ ...input, thinkingLevel: 'high' }).thinkingLevel, 'high');
  for (const thinkingLevel of ['ultra', '', null, 10, {}]) assert.throws(() => decodeRun({ ...input, thinkingLevel }));
});
