import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { PiAdapter } from '../src/main/pi';
import { ProviderStore } from '../src/main/providers';
import { ServiceBroker, defineServiceOperation } from '../src/main/modules/services';
import { createToolRegistry } from '../src/main/modules/tools';
import type { AgentTransport, TransportCallbacks } from '../src/main/agent-protocol';
import { decodeHostResult } from '../src/main/agent-protocol';
import { fakeCommandRequest } from './support/agent-transport';
import type { HostRun } from '../src/main/agent-host';
import type { DynamicToolResponse } from '../src/shared/contracts';

test('worker tool requests reach two service adapters through Pi with host-bound job, run and account identity', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'openhiatus-service-runtime-'));
  const providers = new ProviderStore(directory, { get: () => undefined, set: () => {}, remove: () => {} });
  await providers.save({ id: 'local', models: ['test'] });
  const broker = new ServiceBroker(), calls: string[] = [];
  for (const provider of ['messages', 'appointments']) {
    broker.register({ provider, operations: [defineServiceOperation({ id: 'list', capability: 'read', effect: 'read',
      description: `Liest synthetische ${provider}.`, inputSchema: { type: 'object', additionalProperties: false },
      validate: input => { assert.deepEqual(input, {}); return {}; },
      execute: async (_input, context) => {
        calls.push(context.provider);
        assert.equal(context.jobId, 'persisted-job-42'); assert.equal(context.runId, run!.runId); assert.equal(context.connectionId, 'account-1');
        return { data: { text: `Grüße aus ${provider}` }, resources: [{ provider, connectionId: context.connectionId, kind: 'item', id: 'source-1' }] };
      },
    })] });
    broker.setConnection({ provider, id: 'account-1', account: 'synthetic@example.invalid', label: provider, status: 'ready', capabilities: ['read'] });
  }
  let callbacks!: TransportCallbacks, run: HostRun | undefined;
  const responses: { id: string; result: DynamicToolResponse }[] = [];
  const transport: AgentTransport = {
    request: fakeCommandRequest(request => { if (request.method === 'run') run = request.params; return request.method === 'hello' ? { protocol: 1 } : { accepted: true }; }),
    notify: () => {}, respond: (request, result) => { responses.push({ id: request.id, result: decodeHostResult('tool', result) }); }, managedProcessCount: async () => 0,
    terminate: async () => callbacks.closed(true),
  };
  const adapter = new PiAdapter({ executable: 'unused', processHost: 'unused', hostEntry: 'unused', home: directory, workspace: directory, providers,
    role: 'worker', tools: createToolRegistry([broker.createReadTools('persisted-job-42')]), onEvent: () => {} },
  { connect: value => { callbacks = value; return transport; } });
  t.after(async () => {
    await adapter.dispose(); broker.dispose();
    assert.equal(dirname(resolve(directory)).toLowerCase(), resolve(tmpdir()).toLowerCase()); assert.ok(basename(directory).startsWith('openhiatus-service-runtime-'));
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });
  await adapter.run('Lies die beiden ausdrücklich verbundenen Testdienste.', 'local/test');
  assert.equal(run!.dialog, false); assert.equal(run!.tools.length, 2);
  callbacks.packet({ id: 'foreign', method: 'tool', params: { runId: 'old-run', toolCallId: 'foreign', name: run!.tools[0].name, args: {} } });
  for (const [index, tool] of run!.tools.entries()) {
    callbacks.packet({ id: `call-${index}`, method: 'tool', params: { runId: run!.runId, toolCallId: `call-${index}`, name: tool.name, args: {} } });
  }
  const deadline = Date.now() + 3000;
  while (responses.length < 2 && Date.now() < deadline) await new Promise(done => setTimeout(done, 5));
  assert.deepEqual(calls.sort(), ['appointments', 'messages']); assert.equal(responses.length, 2);
  for (const response of responses) {
    assert.equal(response.result.success, true); assert.ok(!JSON.stringify(response.result).includes('foreign'));
    assert.match(JSON.stringify(response.result), /persisted-job-42/);
  }
  await adapter.stop();
  callbacks.packet({ id: 'late', method: 'tool', params: { runId: run!.runId, toolCallId: 'late', name: run!.tools[0].name, args: {} } });
  assert.equal(calls.length, 2); assert.equal(responses.length, 2);
});
