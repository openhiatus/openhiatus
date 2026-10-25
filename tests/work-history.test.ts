import test from 'node:test';
import assert from 'node:assert/strict';
import { AppController } from '../src/main/controller';
import { defaultState, StateStore, type SavedState } from '../src/main/storage';
import { WorkHistory } from '../src/main/modules/work-history';
import { workStatus, workActionTarget } from '../src/shared/work-history';
import { decodeSnapshot } from '../src/shared/ipc';
import type { AgentAdapter, AgentEvent } from '../src/shared/contracts';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
async function until(predicate: () => boolean) { for (let i = 0; i < 100 && !predicate(); i++) await tick(); assert.ok(predicate()); }
function fixture(t: any, options: { direct?: boolean; initial?: SavedState } = {}) {
  let saved = structuredClone(options.initial ?? defaultState()); saved.preferences.fullAccessAcknowledged = true;
  let app!: AppController, fail = false;
  const runs: string[] = [], workers: Array<(event: AgentEvent) => void> = [];
  const adapter = (emit: (event: AgentEvent) => void): AgentAdapter => ({
    async start() {}, async stop() {}, async dispose() {},
    async run(text) {
      assert.ok(saved.workItems?.some(item => item.status === 'running'), 'work record must be durable before agent work');
      runs.push(text); emit({ type: 'started', threadId: `thread-${runs.length}`, turnId: `turn-${runs.length}` });
    }, async steer() {},
  });
  app = new AppController({
    store: { load: () => saved, save: value => { if (fail) throw Error('Synthetic disk failure'); saved = structuredClone(value); } },
    credentials: { get: () => undefined, set() {}, remove() {} },
    speech: { async transcribe() { return ''; }, async synthesize() { return { base64: '', mimeType: '' }; }, async test() { return { base64: '', mimeType: '' }; } },
    agent: adapter(event => app.handle(event)),
    ...(options.direct ? {} : { dialogAgent: adapter(event => app.handleDialog(event)), createWorker: (emit: (event: AgentEvent) => void) => { workers.push(emit); return adapter(emit); } }),
    workspace: 'C:\\synthetic-project', publish() {},
  });
  app.handle({ type: 'models', models: [{ id: 'synthetic', label: 'Synthetic' }] });
  app.handle({ type: 'connection', status: 'ready' });
  const emit = (event: AgentEvent) => options.direct ? app.handle(event) : app.handleDialog(event);
  t.after(async () => { fail = false; await app.dispose(); });
  return { app, emit, runs, workers, saved: () => saved, fail: (value: boolean) => { fail = value; } };
}

for (const direct of [false, true]) test(`records ${direct ? 'direct work' : 'dialogue'} with tool outcomes, original evidence, new conversation and restart`, async t => {
  const f = fixture(t, { direct });
  await f.app.send('Analyse the synthetic plan', 'analysis');
  f.emit({ type: 'work-action', id: 'call-read', tool: 'read', status: 'running', target: 'C:\\synthetic-project\\plan.txt' });
  f.emit({ type: 'work-action', id: 'call-read', tool: 'read', status: 'completed' });
  f.emit({ type: 'work-action', id: 'call-shell', tool: 'bash', status: 'running', target: 'synthetic-test' });
  f.emit({ type: 'work-action', id: 'call-shell', tool: 'bash', status: 'failed' });
  f.emit({ type: 'completed', status: 'completed', text: 'The plan is analysed. The check failed; a decision remains open.' });
  await tick();
  const item = f.app.snapshot().workItems![0];
  assert.equal(item.kind, direct ? 'direct' : 'conversation');
  assert.equal(item.status, 'completed');
  assert.equal(item.requestId, 'analysis'); assert.ok(item.answerId);
  assert.match(item.result!, /decision remains open/);
  assert.deepEqual(item.actions.map(action => action.status), ['completed', 'failed']);
  await f.app.newConversation();
  assert.equal(f.app.snapshot().messages.length, 0);
  assert.deepEqual(f.app.snapshot().workItems, [item]);
  const store = new StateStore(mkdtempSync(join(tmpdir(), 'openhiatus-work-history-')));
  await f.app.dispose(); store.save(f.saved());
  const restored = fixture(t, { direct, initial: store.load() });
  assert.deepEqual(restored.app.snapshot().workItems, [item]);
  assert.deepEqual(decodeSnapshot(restored.app.snapshot()).workItems, [item]);
  assert.equal(restored.runs.length, 0);
});

test('failed first admission leaves no history, source or automatic replay', async t => {
  const f = fixture(t); await f.app.initialize();
  f.fail(true); await assert.rejects(f.app.send('Never accepted', 'rejected'), /disk failure/);
  assert.equal(f.app.snapshot().workItems?.length, 0);
  f.fail(false); await f.app.newConversation();
  assert.equal(f.saved().workItems?.length, 0); assert.equal(f.runs.length, 0);
});

test('queued requests are tracked; Stop interrupts pending actions and rejects late events', async t => {
  const f = fixture(t); await f.app.send('First request', 'first'); await f.app.send('Queued request', 'second');
  assert.deepEqual(f.app.snapshot().workItems!.map(item => item.status), ['running', 'queued']);
  f.emit({ type: 'work-action', id: 'unconfirmed', tool: 'write', status: 'running', target: 'synthetic.txt' });
  await f.app.stop();
  f.emit({ type: 'work-action', id: 'unconfirmed', tool: 'write', status: 'completed' });
  f.emit({ type: 'completed', status: 'completed', text: 'Late completion' });
  assert.deepEqual(f.app.snapshot().workItems!.map(item => item.status), ['interrupted', 'interrupted']);
  assert.equal(f.app.snapshot().workItems![0].actions[0].status, 'interrupted');
  assert.equal(f.runs.length, 1);
});

test('delegated jobs stay linked to their source and parent stays active until child completion', async t => {
  const f = fixture(t); await f.app.send('Check the project', 'parent');
  const response = await f.app.dialogTool('start_task', { requestId: 'child-request', title: 'Project check', resources: ['C:\\synthetic-project'], acknowledgement: 'I will check.' }, new AbortController().signal);
  assert.equal(response.success, true);
  await until(() => f.workers.length === 1 && f.app.snapshot().jobs![0].status === 'running');
  f.emit({ type: 'completed', status: 'completed', text: 'The check is running.' });
  let items = f.app.snapshot().workItems!, parent = items.find(item => item.id === 'request:parent')!;
  assert.equal(items.find(item => item.kind === 'background')!.parentId, parent.id);
  assert.equal(workStatus(parent, items), 'running');
  f.workers[0]({ type: 'work-action', id: 'child-call', tool: 'read', status: 'running', target: 'project.txt' });
  f.workers[0]({ type: 'work-action', id: 'child-call', tool: 'read', status: 'completed' });
  f.workers[0]({ type: 'completed', status: 'completed', text: 'Project check finished; no files changed.' });
  await until(() => f.app.snapshot().jobs![0].status === 'completed');
  items = f.app.snapshot().workItems!; parent = items.find(item => item.id === 'request:parent')!;
  assert.equal(workStatus(parent, items), 'completed');
  assert.equal(parent.actions.length, 0);
  assert.equal(items.find(item => item.kind === 'background')!.actions[0].status, 'completed');
  await f.app.newConversation(); assert.equal(f.app.snapshot().workItems!.length, 2);
});

test('crash recovery keeps uncertain actions interrupted and redacts action targets', () => {
  const history = new WorkHistory([], text => text.replaceAll('synthetic-secret', '[redacted]'));
  history.foreground([{ id: 'u', role: 'user', text: 'Do work', at: '2026-10-25T10:00:00Z' }], { id: 'u', status: 'running' }, 'direct');
  history.action('request:u', { type: 'work-action', id: 'tool', tool: 'bash', status: 'running', target: 'synthetic-secret' });
  const restored = new WorkHistory(history.snapshot()).snapshot()[0];
  assert.equal(restored.status, 'interrupted'); assert.equal(restored.actions[0].status, 'interrupted');
  assert.equal(restored.actions[0].target, '[redacted]');
  assert.equal(workActionTarget('computer', { action: 'type', text: 'private text' }), 'type');
  assert.equal(workActionTarget('write', { path: 'synthetic.txt', content: 'private content' }), 'synthetic.txt');
});
