import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { PiAdapter } from '../src/main/pi';
import { JobManager } from '../src/main/jobs';
import { ProviderStore } from '../src/main/providers';
import { DesktopCoordinator, NativeComputer, type ComputerSession } from '../src/main/computer';
import { createToolRegistry } from '../src/main/modules/tools';
import { createComputerToolContribution } from '../src/main/platform/tools';
import type { AgentTransport, TransportCallbacks } from '../src/main/agent-protocol';
import { fakeCommandRequest, fakeHostPacket } from './support/agent-transport';
import type { AgentEvent, BackgroundJob } from '../src/shared/contracts';
import type { ToolResult } from '@trycua/cua-driver';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7N8AAAAASUVORK5CYII=';
const tick = () => new Promise<void>(done => setImmediate(done));
async function until(read: () => boolean, message: string) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) { if (read()) return; await new Promise(done => setTimeout(done, 5)); }
  assert.fail(message);
}
const toolResult = (value: Partial<ToolResult>): ToolResult => ({ text: '', images: [], rawJson: '{}', degraded: false, isError: false, ...value });
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

async function fixture(t: { after(callback: () => Promise<void>): void }) {
  const directory = await mkdtemp(join(tmpdir(), 'openhiatus-turn-desktop-'));
  const providers = new ProviderStore(directory, { get: () => undefined, set: () => {}, remove: () => {} });
  await providers.save({ id: 'local', models: ['test'] });
  const coordinator = new DesktopCoordinator();
  const workers: ReturnType<typeof worker>[] = [];
  function worker() {
    const events: AgentEvent[] = [], replies: { id: string; result: unknown }[] = [];
    let callbacks!: TransportCallbacks, runId = '', terminated = 0, disposed = 0;
    let beforeDispose: (() => Promise<void>) | undefined;
    let failDispose = false;
    const session: ComputerSession = {
      screenSize: async () => toolResult({ structuredJson: '{"width":1,"height":1,"scale_factor":1}' }),
      screenshot: async () => toolResult({ images: [{ mimeType: 'image/png', dataBase64: png }],
        structuredJson: '{"platform":"windows","display":"primary","screenshot_width":1,"screenshot_height":1,"screen_width":1,"screen_height":1,"scale_factor":1}' }),
      act: async () => { throw new Error('No desktop inputs are needed for this test.'); },
      dispose: async () => { disposed++; await beforeDispose?.(); if (failDispose) throw new Error('Unconfirmed native cleanup'); },
    };
    const computer = new NativeComputer({ createSession: async () => session, desktopCoordinator: coordinator });
    const transport: AgentTransport = {
      request: fakeCommandRequest(request => { if (request.method === 'run') runId = request.params.runId; return request.method === 'hello' ? { protocol: 1 } : { accepted: true }; }),
      notify: () => {}, respond: (request, result) => { replies.push({ id: request.id, result }); },
      managedProcessCount: async () => 1, // A retained service, not the interactive turn.
      terminate: async () => { terminated++; callbacks.closed(true); },
    };
    let publish: (event: AgentEvent) => void = () => {};
    const adapter = new PiAdapter({ executable: 'unused', processHost: 'unused', hostEntry: 'unused', home: directory, workspace: directory, providers,
      tools: createToolRegistry([createComputerToolContribution({ computer })]),
      onEvent: event => { events.push(event); publish(event); } }, { connect: value => { callbacks = value; return transport; } });
    const packet = (value: { id?: string; method: 'tool' | 'event' | 'credential'; params?: Record<string, unknown> }) => callbacks.packet(fakeHostPacket({ ...value, params: { ...value.params, runId } }));
    return { adapter, events, replies, packet, set publish(value: (event: AgentEvent) => void) { publish = value; },
      get terminated() { return terminated; }, get disposed() { return disposed; },
      set beforeDispose(value: (() => Promise<void>) | undefined) { beforeDispose = value; },
      set failDispose(value: boolean) { failDispose = value; },
      async observe() {
        await until(() => Boolean(runId), 'Worker has not admitted its model turn.');
        const id = `image-${replies.length}`;
        packet({ id, method: 'tool', params: { name: 'computer', toolCallId: id, args: { action: 'screenshot' } } });
        await until(() => replies.some(reply => reply.id === id), 'The admitted worker could not acquire the desktop.');
        assert.equal((replies.find(reply => reply.id === id)!.result as { success: boolean }).success, true);
      },
      complete() { packet({ method: 'event', params: { event: { type: 'completed', status: 'completed', text: 'Done' } } }); },
    };
  }
  t.after(async () => {
    for (const value of workers) { value.failDispose = false; value.beforeDispose = undefined; await value.adapter.dispose(); }
    assert.equal(dirname(resolve(directory)).toLowerCase(), resolve(tmpdir()).toLowerCase());
    assert.ok(basename(directory).startsWith('openhiatus-turn-desktop-'));
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });
  return { create() { const value = worker(); workers.push(value); return value; } };
}

test('completed jobs release interactive desktop ownership while their managed service remains retained', async t => {
  const f = await fixture(t), jobs: BackgroundJob[] = [], workers: ReturnType<typeof f.create>[] = [];
  const manager = new JobManager(jobs, {
    createWorker(onEvent) { const value = f.create(); value.publish = onEvent; workers.push(value); return value.adapter; },
    persist: () => {}, changed: () => {}, clean: text => text, onEvent: () => {}, onResult: () => {},
  });
  t.after(() => manager.stopAll());
  const enqueue = (id: string) => manager.enqueue({ requestId: id, title: id, prompt: id, model: 'local/test', resources: ['desktop'] });
  enqueue('first');
  await until(() => Boolean(workers[0]?.events.some(event => event.type === 'connection' && event.status === 'connecting')), 'First worker did not start.');
  await tick(); await workers[0].observe(); workers[0].complete();
  await until(() => jobs[0].status === 'completed', 'First job did not finish.');
  assert.equal(jobs[0].runtimeRetained, true);
  assert.equal(workers[0].terminated, 0, 'Completion must not kill the retained server.');
  assert.equal(workers[0].disposed, 1, 'Interactive session is closed at turn end.');
  enqueue('second');
  await until(() => workers.length === 2, 'Second worker did not start.');
  await tick(); await workers[1].observe(); workers[1].complete();
  await until(() => jobs[1].status === 'completed', 'Second job did not finish.');
  assert.equal(workers[0].terminated, 0);
});

test('turn completion waits for native cleanup; Stop wins the race and suppresses a late success', async t => {
  const f = await fixture(t), worker = f.create(), release = deferred();
  await worker.adapter.run('Test', 'local/test'); await worker.observe();
  worker.beforeDispose = () => release.promise;
  try {
    worker.complete(); await tick();
    assert.equal(worker.events.some(event => event.type === 'completed'), false);
    await assert.rejects(worker.adapter.run('Too early', 'local/test'));
    const stopping = worker.adapter.stop(); await tick();
    assert.equal(worker.terminated, 1, 'Process stop is issued before native cleanup settles.');
    release.resolve(); await stopping;
  } finally { release.resolve(); }
  assert.deepEqual(worker.events.filter(event => event.type === 'completed').map(event => event.status), ['interrupted']);
});

test('unconfirmed desktop release is a failed, retained runtime rather than a successful job', async t => {
  const f = await fixture(t), worker = f.create();
  await worker.adapter.run('Test', 'local/test'); await worker.observe();
  worker.failDispose = true; worker.complete();
  await until(() => worker.events.some(event => event.type === 'completed'), 'Cleanup failure was not published.');
  assert.deepEqual(worker.events.filter(event => event.type === 'completed').map(event => event.status), ['failed']);
  assert.equal(await worker.adapter.hasManagedWork(), true);
  await assert.rejects(worker.adapter.run('Do not proceed', 'local/test'));
  worker.failDispose = false; await worker.adapter.stop();
});
