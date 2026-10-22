import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { PiAdapter, type PiAdapterOptions } from '../src/main/pi';
import { ProviderStore } from '../src/main/providers';
import { createToolRegistry, defineTool, type RegisteredTool, type ToolsetPort } from '../src/main/modules/tools';
import type { AgentEvent, DynamicToolResponse } from '../src/shared/contracts';
import type { AgentTransport, TransportCallbacks, HostRun } from '../src/main/agent-protocol';
import { fakeCommandRequest, fakeHostPacket } from './support/agent-transport';

const response = (text = 'done'): DynamicToolResponse => ({ success: true, contentItems: [{ type: 'inputText', text }] });
const definition = (name: string) => ({ type: 'function' as const, name, description: 'Synthetic tool', inputSchema: { type: 'object' } });
const tick = () => new Promise<void>(done => setImmediate(done));
async function fixture(t: { after(action: () => Promise<void>): void }, tools?: ToolsetPort, role?: 'worker' | 'dialog', extra: Pick<PiAdapterOptions, 'computerOnly' | 'instructions'> = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'openhiatus-pi-tools-'));
  const providers = new ProviderStore(directory, { get: () => undefined, set: () => {}, remove: () => {} });
  await providers.save({ id: 'local', models: ['test'] });
  let callbacks!: TransportCallbacks, input: HostRun | undefined, terminated = 0;
  const events: AgentEvent[] = [], replies: { id: string; result: any }[] = [];
  const transport: AgentTransport = {
    request: fakeCommandRequest(request => { if (request.method === 'run') input = request.params; return request.method === 'hello' ? { protocol: 1 } : { accepted: true }; }),
    notify: () => {}, respond: (request, result) => { replies.push({ id: request.id, result }); }, managedProcessCount: async () => 0,
    terminate: async () => { terminated++; callbacks.closed(true); },
  };
  const adapter = new PiAdapter({ executable: 'unused', processHost: 'unused', hostEntry: 'unused', workspace: directory, home: directory, providers, tools, role, ...extra, onEvent: event => { events.push(event); } },
    { connect: (value, options) => { assert.equal(options.allowHandoff, role !== 'dialog' && !extra.computerOnly); callbacks = value; return transport; } });
  t.after(async () => {
    await adapter.dispose();
    assert.equal(dirname(resolve(directory)).toLowerCase(), resolve(tmpdir()).toLowerCase());
    assert.ok(basename(directory).startsWith('openhiatus-pi-tools-'));
    await rm(directory, { recursive: true, force: true });
  });
  const packet = (value: { id?: string; method: 'tool' | 'event' | 'credential'; params?: Record<string, unknown> }) => callbacks.packet(fakeHostPacket({ ...value, params: { runId: input?.runId, ...value.params } }));
  return { adapter, events, replies, packet, get input() { return input!; }, get terminated() { return terminated; }, close: () => callbacks.closed(true) };
}

test('Pi routes any explicitly registered host tool through the frozen run binding', async t => {
  let called = 0;
  const catalog: RegisteredTool[] = [defineTool({ definition: definition('service_read'), validate: value => {
    if (value !== 'valid') throw new Error('Invalid service input'); return value;
  }, execute: async () => { called++; return response(); } })];
  const tools = createToolRegistry([{ bind: () => ({ tools: catalog }) }]), f = await fixture(t, tools);
  await f.adapter.run('Read', 'local/test'); assert.deepEqual(f.input.tools.map(tool => tool.name), ['service_read']);
  catalog.length = 0; catalog.push(defineTool({ definition: definition('added_later'), validate: value => value, execute: async () => response() }));
  f.packet({ id: 'invalid', method: 'tool', params: { toolCallId: 'invalid', name: 'service_read', args: {} } }); await tick();
  assert.equal(called, 0); assert.equal(f.replies.at(-1)?.result.success, false);
  f.packet({ id: 'late', method: 'tool', params: { toolCallId: 'late', name: 'added_later', args: {} } }); await tick();
  assert.equal(f.replies.at(-1)?.result.success, false);
  f.packet({ id: 'valid', method: 'tool', params: { toolCallId: 'valid', name: 'service_read', args: 'valid' } }); await tick();
  assert.equal(called, 1); assert.equal(f.replies.at(-1)?.result.success, true);
  f.packet({ method: 'event', params: { event: { type: 'completed', status: 'completed' } } }); await tick();
  await f.adapter.run('Next', 'local/test'); assert.deepEqual(f.input.tools.map(tool => tool.name), ['added_later']);
});

test('Pi has no ambient host tools and dialog role rejects accidentally attached worker operations', async t => {
  const empty = await fixture(t); await empty.adapter.run('Empty', 'local/test'); assert.deepEqual(empty.input.tools, []);
  empty.packet({ id: 'computer', method: 'tool', params: { toolCallId: 'computer', name: 'computer', args: { action: 'screenshot' } } });
  assert.equal(empty.replies.at(-1)?.result.success, false);
  const tools = createToolRegistry([{ bind: () => ({ tools: [
    defineTool({ definition: definition('service_read'), validate: value => value, execute: async () => { assert.fail('Worker tool reached dialog'); } }),
    defineTool({ definition: definition('status_task'), audience: 'dialog', validate: value => value, execute: async () => response() }),
  ] }) }]);
  const dialog = await fixture(t, tools, 'dialog'); await dialog.adapter.run('Hello', 'local/test', undefined, { purpose: 'dialog' });
  assert.equal(dialog.input.dialog, true); assert.deepEqual(dialog.input.tools.map(tool => tool.name), ['status_task']);
  dialog.packet({ id: 'worker', method: 'tool', params: { toolCallId: 'worker', name: 'service_read', args: {} } }); assert.equal(dialog.replies.at(-1)?.result.success, false);
});
test('restricted computer adapter forwards explicit Fast and instructions without enabling process handoff', async t => {
  const f = await fixture(t, undefined, 'worker', { computerOnly: true, instructions: 'Only perform the bounded UI request.' });
  await f.adapter.run('Observe', 'local/test', undefined, { serviceTier: 'fast' });
  assert.equal(f.input.computerOnly, true); assert.equal(f.input.dialog, false); assert.equal(f.input.serviceTier, 'fast');
  assert.equal(f.input.instructions.trim(), 'Only perform the bounded UI request.');
  f.packet({ method: 'event', params: { event: { type: 'model-request', request: { role: 'computer', model: 'openai/gpt-6-luna', requestedServiceTier: 'fast', actualServiceTier: 'default', elapsedMs: 10, status: 'completed' } } } });
  assert.ok(f.events.some(event => event.type === 'model-request' && event.request.actualServiceTier === 'default'));
  const worker = await fixture(t);
  await assert.rejects(worker.adapter.run('Not a computer adapter', 'local/test', undefined, { serviceTier: 'fast' }), /getrennte Computerbedienung/);
  assert.equal(Boolean(worker.input), false);
});

test('turn completion aborts admitted tool handlers and drops their late response in a later run', async t => {
  let finish!: (value: DynamicToolResponse) => void, signal: AbortSignal | undefined;
  const tools = createToolRegistry([{ bind: () => ({ tools: [defineTool({ definition: definition('service_read'), validate: value => value,
    execute: async (_args, context) => { signal = context.signal; return new Promise<DynamicToolResponse>(done => { finish = done; }); } })] }) }]);
  const f = await fixture(t, tools); await f.adapter.run('First', 'local/test');
  f.packet({ id: 'pending', method: 'tool', params: { toolCallId: 'pending', name: 'service_read', args: {} } });
  f.packet({ method: 'event', params: { event: { type: 'completed', status: 'completed' } } }); await tick(); assert.equal(signal?.aborted, true);
  await f.adapter.run('Second', 'local/test'); finish(response('stale')); await tick(); assert.deepEqual(f.replies, []);
});

test('registered worker tools cannot replace SDK builtins and rejection releases the run binding', async t => {
  let stopped = 0;
  const catalog = [defineTool({ definition: definition('read'), validate: value => value, execute: async () => response() })];
  const tools = createToolRegistry([{ bind: () => ({ tools: catalog, stop: async () => { stopped++; } }) }]);
  const f = await fixture(t, tools);
  await assert.rejects(f.adapter.run('Conflict', 'local/test'), /reserviert/);
  assert.equal(Boolean(f.input), false); assert.equal(stopped, 1); assert.equal(await f.adapter.hasManagedWork(), false);
  catalog.length = 0; await f.adapter.run('No conflict', 'local/test'); assert.deepEqual(f.input.tools, []);
});

test('unexpected host exit releases bound tools before reporting completion', async t => {
  let release!: () => void, cleaned = false;
  const cleanup = new Promise<void>(done => { release = done; });
  const tools = createToolRegistry([{ bind: () => ({ tools: [], stop: async () => { await cleanup; cleaned = true; } }) }]);
  const f = await fixture(t, tools); await f.adapter.run('Wait', 'local/test'); f.close(); await tick();
  assert.equal(f.events.some(event => event.type === 'completed'), false);
  release(); await tick(); assert.equal(cleaned, true);
  assert.deepEqual(f.events.filter(event => event.type === 'completed').map(event => event.status), ['failed']);
});

test('Pi retains failed partial binding cleanup as visible work and Stop retries it', async t => {
  let failCleanup = true, failBind = true, stopped = 0;
  const tools = createToolRegistry([
    { bind: () => ({ tools: [], stop: async () => { stopped++; if (failCleanup) throw new Error('Unconfirmed partial cleanup'); } }) },
    { bind: () => { if (failBind) throw new Error('Contribution setup failed'); return { tools: [] }; } },
  ]);
  const f = await fixture(t, tools);
  try {
    await assert.rejects(f.adapter.run('Partial', 'local/test'), /Unconfirmed partial/);
    assert.equal(await f.adapter.hasManagedWork(), true);
    await assert.rejects(f.adapter.run('Blocked', 'local/test'));
    await assert.rejects(f.adapter.stop(), /Unconfirmed partial/);
    assert.equal(f.terminated, 1, 'Host termination starts even while tool cleanup fails.');
  } finally { failCleanup = false; failBind = false; }
  await f.adapter.stop(); assert.equal(await f.adapter.hasManagedWork(), false); assert.ok(stopped >= 2);
});
