import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type ServerResponse } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { AgentHost } from '../src/main/agent-host';
import { PiAdapter } from '../src/main/pi';
import { ProviderStore } from '../src/main/providers';
import { decodeHostMessage, type AgentTransport, type TransportCallbacks } from '../src/main/agent-protocol';
import { createToolRegistry } from '../src/main/modules/tools';
import { createDelegatedComputerToolContribution } from '../src/main/platform/tools/computer-delegation';
import type { ComputerAdapter } from '../src/main/computer';
import type { AgentEvent } from '../src/shared/contracts';
import { fakeCommandRequest } from './support/agent-transport';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7N8AAAAASUVORK5CYII=';
function deferred<Value>() { let resolve!: (value: Value) => void; const promise = new Promise<Value>(done => { resolve = done; }); return { promise, resolve }; }
async function until(predicate: () => boolean, diagnostic: () => unknown = () => ''): Promise<void> {
  const deadline = Date.now() + 15000;
  while (!predicate() && Date.now() < deadline) await delay(10);
  assert.ok(predicate(), JSON.stringify(diagnostic()));
}
type ModelStep = { tool: string; args: object } | { text: string };
function respond(response: ServerResponse, step: ModelStep, tier = 'default'): void {
  const id = randomUUID(), call = 'tool' in step, args = call ? JSON.stringify(step.args) : '';
  const item = call ? { id: `fc_${id}`, type: 'function_call', call_id: `call_${id}`, name: step.tool, arguments: args }
    : { id: `msg_${id}`, type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: step.text, annotations: [] }] };
  const events: unknown[] = [
    { type: 'response.created', response: { id: `resp_${id}`, status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item: call ? { ...item, arguments: '' } : { ...item, content: [] } },
    ...(call ? [
      { type: 'response.function_call_arguments.delta', output_index: 0, delta: args },
      { type: 'response.function_call_arguments.done', output_index: 0, arguments: args },
    ] : [
      { type: 'response.content_part.added', item_id: item.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
      { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: step.text },
      { type: 'response.output_text.done', item_id: item.id, output_index: 0, content_index: 0, text: step.text },
    ]),
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: `resp_${id}`, status: 'completed', service_tier: tier, output: [item],
      usage: { input_tokens: 20, output_tokens: 3, input_tokens_details: { cached_tokens: 5, cache_write_tokens: 2 }, total_tokens: 23 } } },
  ];
  response.writeHead(200, { 'content-type': 'text/event-stream' }); response.end(events.map(value => `data: ${JSON.stringify(value)}\n\n`).join(''));
}

/** Real Pi adapters/hosts and wire validation; only the OS process transport is in-process for this test. */
function localTransport(callbacks: TransportCallbacks, terminated: () => void): AgentTransport {
  const pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void }>();
  const host = new AgentHost(raw => {
    const packet = decodeHostMessage(raw);
    if (packet.method === undefined) {
      const waiting = pending.get(packet.id); pending.delete(packet.id);
      if (packet.error !== undefined) waiting?.reject(new Error(packet.error)); else waiting?.resolve(packet.result);
    } else if (packet.method !== 'openhiatus/host/child') callbacks.packet(packet);
  });
  return {
    request: fakeCommandRequest(async packet => {
      const id = randomUUID(), reply = new Promise<unknown>((resolve, reject) => pending.set(id, { resolve, reject }));
      await host.receive({ ...packet, id }); return reply;
    }),
    notify: (method, ...args) => { void host.receive({ method, params: args[0] ?? {} }); },
    respond: (packet, result) => { void host.receive({ id: packet.id, result }); },
    managedProcessCount: async () => 0,
    terminate: async () => { await host.abort(); terminated(); callbacks.closed(true); },
  };
}

async function fixture(t: { after(action: () => Promise<void>): void }, onRequest: (model: string, number: number, request: any) => ModelStep,
  computer: ComputerAdapter) {
  const directory = await mkdtemp(join(tmpdir(), 'openhiatus-computer-delegation-'));
  const requests: any[] = [], events: AgentEvent[] = [], failures: string[] = [], children: PiAdapter[] = [];
  const counts = new Map<string, number>(); let terminations = 0;
  const server = createServer(async (request, response) => {
    try {
      assert.equal(request.url, '/v1/responses'); let body = ''; for await (const chunk of request) body += chunk;
      const payload = JSON.parse(body), number = (counts.get(payload.model) ?? 0) + 1; counts.set(payload.model, number); requests.push(payload);
      respond(response, onRequest(payload.model, number, payload), payload.model === 'gpt-6-luna' && number % 2 ? 'fast' : 'default');
    } catch (error) { failures.push(String(error)); response.writeHead(500); response.end('Synthetic test server assertion failed'); }
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const saved = new Map<string, string>(), providers = new ProviderStore(directory, {
    get: name => saved.get(name), set: (name, value) => { saved.set(name, value); }, remove: name => { saved.delete(name); },
  });
  await providers.save({ id: 'openai', apiKey: 'synthetic-local-provider-key', models: ['gpt-6.1-sol', 'gpt-6-luna'],
    baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1` });
  const common = { executable: 'unused', processHost: 'unused', hostEntry: 'unused', workspace: join(directory, 'workspace'), providers };
  const connect = (callbacks: TransportCallbacks) => localTransport(callbacks, () => { terminations++; });
  const tools = createToolRegistry([createDelegatedComputerToolContribution({ model: 'openai/gpt-6-luna', computer,
    createWorker: (onEvent, tools, instructions) => {
      const child = new PiAdapter({ ...common, home: join(directory, `child-${children.length}`), computerOnly: true, instructions, tools, onEvent }, { connect });
      children.push(child); return child;
    } })]);
  const parent = new PiAdapter({ ...common, home: join(directory, 'planner'), tools, onEvent: event => events.push(event) }, { connect });
  t.after(async () => {
    await parent.dispose(); await Promise.all(children.map(child => child.dispose())); server.closeAllConnections(); await new Promise<void>(done => server.close(() => done()));
    assert.equal(dirname(directory).toLowerCase(), resolve(tmpdir()).toLowerCase()); assert.ok(basename(directory).startsWith('openhiatus-computer-delegation-'));
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  return { parent, children, requests, events, failures, get terminations() { return terminations; } };
}

test('real Sol and Luna Pi hosts delegate several Fast computer turns, isolate image history, and allow explicit planner verification', { timeout: 30000 }, async t => {
  const actions: unknown[] = [];
  const computer: ComputerAdapter = { execute: async input => { actions.push(input); return { text: 'Synthetic observed field', frameId: `fake-${actions.length}`,
    width: 1, height: 1, image: { base64: png, mimeType: 'image/png' } }; }, stop: async () => {}, dispose: async () => {} };
  const f = await fixture(t, (model, number, request) => {
    if (model === 'gpt-6.1-sol') {
      assert.equal(request.service_tier, undefined);
      if (number === 1) return { tool: 'computer_task', args: { objective: 'Fill the observed field', context: 'Exact supplied value' } };
      if (number === 2) {
        assert.ok(!JSON.stringify(request).includes(png), 'worker images must not enter the planner history through the task report');
        const output = request.input.find((item: any) => item.type === 'function_call_output')?.output;
        assert.equal(typeof output, 'string', 'the delegated task returns text, without multimodal output blocks');
        const report = JSON.parse(output); assert.equal(report.verified, false); assert.equal(report.status, 'reported'); assert.equal(report.actionCount, 3);
        return { tool: 'computer', args: { action: 'screenshot', resolution: 'original' } };
      }
      assert.equal(number, 3); assert.ok(JSON.stringify(request).includes(png), 'planner sees the explicit original screenshot it requested');
      return { text: 'Verified the supplied text in the synthetic field.' };
    }
    assert.equal(model, 'gpt-6-luna'); assert.equal(request.service_tier, 'priority');
    assert.deepEqual(request.tools.map((tool: any) => tool.name), ['computer']);
    if (number === 1) return { tool: 'computer', args: { action: 'screenshot' } };
    assert.ok(JSON.stringify(request).includes(png), 'subsequent Luna turns receive the synthetic screen image');
    if (number === 2) return { tool: 'computer', args: { action: 'key', frameId: 'fake-1', key: 'tab' } };
    if (number === 3) return { tool: 'computer', args: { action: 'type', frameId: 'fake-2', text: 'Exact supplied value' } };
    assert.equal(number, 4); return { text: '{"status":"reported","summary":"The exact supplied value is visible","observations":["Field contains the supplied text"]}' };
  }, computer);
  await f.parent.run('Fill the synthetic field, then verify the result.', 'openai/gpt-6.1-sol');
  await until(() => f.events.some(event => event.type === 'completed'), () => ({ events: f.events, failures: f.failures }));
  assert.deepEqual(f.failures, []);
  const completion = f.events.filter((event): event is Extract<AgentEvent, { type: 'completed' }> => event.type === 'completed');
  assert.equal(completion.length, 1); assert.equal(completion[0].status, 'completed'); assert.equal(completion[0].text, 'Verified the supplied text in the synthetic field.');
  assert.deepEqual(actions.map(input => (input as { action: string }).action), ['screenshot', 'key', 'type', 'screenshot']);
  const diagnostics = f.events.flatMap(event => event.type === 'model-request' ? [event.request] : []);
  assert.equal(diagnostics.filter(request => request.role === 'worker').length, 3); assert.equal(diagnostics.filter(request => request.role === 'computer').length, 4);
  assert.deepEqual(diagnostics.filter(request => request.role === 'computer').map(request => request.actualServiceTier), ['fast', 'default', 'fast', 'default']);
  assert.ok(diagnostics.every(request => request.status === 'completed' && request.usage && request.usage.inputTokens === 13));
  const computerUsage = f.events.filter((event): event is Extract<AgentEvent, { type: 'computer-usage' }> => event.type === 'computer-usage');
  assert.equal(computerUsage.at(-1)?.usage.inputTokens, 52);
  const plannerUsage = f.events.filter((event): event is Extract<AgentEvent, { type: 'usage' }> => event.type === 'usage');
  assert.equal(plannerUsage.at(-1)?.usage.inputTokens, 39, 'computer usage never overwrites or double-counts planner cumulative usage');
  assert.equal(f.children.length, 1); assert.equal(await f.children[0].hasManagedWork(), false); assert.equal(await f.parent.hasManagedWork(), false);
});

test('parent Pi Stop aborts nested Luna and waits for a pending fake native input before confirming release', { timeout: 30000 }, async t => {
  const inputStarted = deferred<void>(), releaseInput = deferred<void>(); const actions: string[] = []; let nativeSignal: AbortSignal | undefined, settled = false;
  const computer: ComputerAdapter = { async execute(input, signal) {
    const action = (input as { action: string }).action; actions.push(action);
    if (action === 'key') { nativeSignal = signal; inputStarted.resolve(); await releaseInput.promise; settled = true; }
    return { text: 'Synthetic UI', frameId: 'fake-frame', width: 1, height: 1, image: { base64: png, mimeType: 'image/png' } };
  }, stop: async () => { if (nativeSignal) await releaseInput.promise; }, dispose: async () => {} };
  const f = await fixture(t, (model, number) => {
    if (model === 'gpt-6.1-sol') { assert.equal(number, 1); return { tool: 'computer_task', args: { objective: 'Navigate the observed field' } }; }
    assert.equal(model, 'gpt-6-luna');
    if (number === 1) return { tool: 'computer', args: { action: 'screenshot' } };
    assert.equal(number, 2); return { tool: 'computer', args: { action: 'key', frameId: 'fake-frame', key: 'tab' } };
  }, computer);
  await f.parent.run('Navigate the observed field.', 'openai/gpt-6.1-sol'); await inputStarted.promise;
  let released = false; const stopping = f.parent.stop().then(() => { released = true; }); await delay(20);
  assert.equal(nativeSignal?.aborted, true); assert.equal(released, false); assert.equal(settled, false);
  releaseInput.resolve(); await stopping; assert.equal(settled, true); assert.equal(await f.parent.hasManagedWork(), false);
  assert.equal(f.children.length, 1); assert.equal(await f.children[0].hasManagedWork(), false); assert.ok(f.terminations >= 2);
  assert.deepEqual(actions, ['screenshot', 'key']); assert.deepEqual(f.failures, []);
  assert.equal(f.events.filter(event => event.type === 'computer-frame').length, 1, 'late fake post-input image is suppressed after Stop');
  assert.deepEqual(f.events.filter(event => event.type === 'completed').map(event => event.status), ['interrupted']);
  await delay(20); assert.equal(f.requests.length, 3, 'no follow-up model or native calls after Stop');
});
