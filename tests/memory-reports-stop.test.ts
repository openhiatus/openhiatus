import test from 'node:test';
import assert from 'node:assert/strict';
import { AppController } from '../src/main/controller';
import { defaultState } from '../src/main/storage';
import type { MemorySnapshot, MemorySummaryInput } from '../src/shared/memory';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test('global Stop aborts memory reports immediately and report completion cannot write through pending retained-process confirmation', async t => {
  let saved = defaultState();
  saved.preferences.fullAccessAcknowledged = true; saved.preferences.memoryAutoSummarize = false;
  saved.messages = [{ id: 'user', role: 'user', text: 'Ein synthetischer Auftrag.', at: '2026-10-01T10:00:00Z' },
    { id: 'answer', role: 'assistant', text: 'Ein Programm wurde gestartet.', at: '2026-10-01T10:01:00Z' }];
  saved.task = { id: 'user', status: 'completed' };
  const writes: Array<{ kind: string; stopping: boolean }> = [];
  let stopping = false, confirmStop!: () => void, lateResult!: (text: string) => void, signal: AbortSignal | undefined, applied = 0, agentRuns = 0;
  const snapshot = (): MemorySnapshot => ({ documents: [], proposals: [], storagePath: 'synthetic-memory', sourceCount: 2, recovered: false });
  const input: MemorySummaryInput = { documentId: 'day:2026-10-01', kind: 'day', title: 'Tag 2026-10-01', baseVersion: 1, inputHash: 'one', inputDocuments: [], sourceIds: ['user'],
    records: [{ id: 'user', kind: 'source', sourceIds: ['user'], role: 'user', at: '2026-10-01T10:00:00Z', text: 'Ein synthetischer Auftrag.' }] };
  const agent = { async start() {}, async run() { agentRuns++; }, async dispose() {}, async stop() {
    stopping = true; await new Promise<void>(resolve => { confirmStop = () => { stopping = false; resolve(); }; });
  } };
  const app = new AppController({
    store: { load: () => structuredClone(saved), save: state => { writes.push({ kind: 'state', stopping }); saved = structuredClone(state); } },
    credentials: { get: () => undefined, set() {}, remove() {} },
    speech: { async transcribe() { return ''; }, async synthesize() { throw new Error('No report audio'); }, async test() { return { base64: '', mimeType: '' }; } },
    memory: { snapshot, capture() { writes.push({ kind: 'archive', stopping }); }, retrieve() { throw new Error('No retrieval needed'); }, source: () => undefined, search: () => [], rebuild: snapshot,
      edit() { throw new Error('No edits'); }, propose() { throw new Error('No proposals'); }, decide() { throw new Error('No decisions'); },
      planSummaries: () => [{ documentId: input.documentId, kind: input.kind, title: input.title, sourceCount: 1, blockedBy: [] }],
      summaryInput: () => input, applySummary() { applied++; return snapshot(); } },
    modelClient: { async complete(_prompt, _model, nextSignal) { signal = nextSignal; return new Promise<string>(resolve => { lateResult = resolve; }); } },
    agent, workspace: 'C:\\synthetic-workspace', publish() {},
  });
  t.after(async () => { agent.stop = async () => {}; await app.dispose(); });
  app.handle({ type: 'connection', status: 'ready' }); app.handle({ type: 'models', models: [{ id: 'memory-model', label: 'Memory' }] });
  await app.startMemorySummary();
  for (let i = 0; i < 20 && !signal; i++) await tick();
  assert.ok(signal); writes.length = 0;
  const stopped = app.stop(); await tick();
  assert.equal(signal.aborted, true); assert.equal(app.snapshot().summary?.status, 'interrupted');
  assert.equal(app.snapshot().task.status, 'stopping');
  app.reportError(new Error('Während Stopp sichtbare Meldung')); await tick();
  assert.equal(writes.length, 0, 'report completion must not write through the pending process confirmation');
  confirmStop(); await stopped;
  assert.ok(writes.some(write => write.kind === 'state'));
  assert.ok(writes.every(write => !write.stopping)); assert.equal(app.snapshot().task.status, 'completed');
  lateResult('{"items":[]}'); await tick();
  assert.equal(applied, 0); assert.equal(agentRuns, 0);
});
