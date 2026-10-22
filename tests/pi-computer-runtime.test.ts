import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type ServerResponse } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AgentHost } from '../src/main/agent-host';
import { decodeHostMessage, type HostRun, type DecodedHostMessage } from '../src/main/agent-wire';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7N8AAAAASUVORK5CYII=';
function respond(response: ServerResponse, tool: boolean, tier: string): void {
  const item = tool ? { id: 'fc_ui', type: 'function_call', call_id: 'call_ui', name: 'computer', arguments: '{"action":"screenshot"}' }
    : { id: 'msg_ui', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Observed test UI.', annotations: [] }] };
  const events: unknown[] = [
    { type: 'response.created', response: { id: 'resp_ui', status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item: tool ? { ...item, arguments: '' } : { ...item, content: [] } },
    ...(tool ? [
      { type: 'response.function_call_arguments.delta', output_index: 0, delta: '{"action":"screenshot"}' },
      { type: 'response.function_call_arguments.done', output_index: 0, arguments: '{"action":"screenshot"}' },
    ] : [
      { type: 'response.content_part.added', item_id: item.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
      { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: 'Observed test UI.' },
      { type: 'response.output_text.done', item_id: item.id, output_index: 0, content_index: 0, text: 'Observed test UI.' },
    ]),
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: 'resp_ui', status: 'completed', service_tier: tier, output: [item],
      usage: { input_tokens: 20, output_tokens: 3, input_tokens_details: { cached_tokens: 5, cache_write_tokens: 2 }, total_tokens: 23 } } },
  ];
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  response.end(events.map(value => `data: ${JSON.stringify(value)}\n\n`).join(''));
}

test('real Pi computer-only host requests Fast, exposes no ambient SDK tools, records returned tier, and rejects cross-role resume', { timeout: 30_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'openhiatus-computer-runtime-'));
  const home = join(directory, 'home'), workspace = join(directory, 'workspace');
  await mkdir(join(home, 'skills', 'ambient-test'), { recursive: true }); await mkdir(workspace);
  await writeFile(join(home, 'skills', 'ambient-test', 'SKILL.md'), '---\nname: ambient-test\ndescription: PRIVATE_AMBIENT_SKILL_MARKER\n---\nNever load this in a computer worker.', 'utf8');
  const requests: any[] = [], packets: DecodedHostMessage[] = [];
  const server = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk;
    requests.push(JSON.parse(body)); respond(response, requests.length === 1, requests.length === 1 ? 'fast' : 'default');
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  let computerCalls = 0;
  const host = new AgentHost(raw => {
    const packet = decodeHostMessage(raw); packets.push(packet);
    if (packet.method === 'tool') {
      assert.equal(packet.params.name, 'computer'); computerCalls++;
      void host.receive({ id: packet.id, result: { success: true, contentItems: [{ type: 'inputText', text: 'Synthetic frame' },
        { type: 'inputImage', imageUrl: `data:image/png;base64,${png}`, computerView: 'overview' }] } });
    }
  });
  t.after(async () => {
    await host.abort(); server.closeAllConnections(); await new Promise<void>(done => server.close(() => done()));
    assert.equal(dirname(directory).toLowerCase(), resolve(tmpdir()).toLowerCase()); assert.ok(basename(directory).startsWith('openhiatus-computer-runtime-'));
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  const input: HostRun = { runId: randomUUID(), text: 'Inspect the synthetic UI and report.', workspace, home, dialog: false, computerOnly: true, serviceTier: 'fast',
    instructions: 'COMPUTER_ONLY_INSTRUCTION_MARKER: use only the provided computer tool.',
    model: { provider: 'openai', modelId: 'gpt-6-luna', apiKey: 'synthetic-local-test-key', api: 'openai-responses', baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1` },
    tools: [{ type: 'function', name: 'computer', description: 'Synthetic screenshots only', inputSchema: { type: 'object', properties: { action: { type: 'string' } }, required: ['action'] } }] };
  await host.receive({ id: 'run', method: 'run', params: input });
  const deadline = Date.now() + 15_000;
  while (!packets.some(packet => packet.method === 'event' && packet.params.event.type === 'completed') && Date.now() < deadline) await new Promise(done => setTimeout(done, 10));
  const completion = packets.find(packet => packet.method === 'event' && packet.params.event.type === 'completed');
  assert.ok(completion?.method === 'event' && completion.params.event.type === 'completed' && completion.params.event.status === 'completed', JSON.stringify(packets));
  assert.equal(computerCalls, 1); assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.service_tier, 'fast'); assert.deepEqual(request.tools.map((tool: any) => tool.name), ['computer']);
    assert.ok(JSON.stringify(request).includes('COMPUTER_ONLY_INSTRUCTION_MARKER')); assert.ok(!JSON.stringify(request).includes('PRIVATE_AMBIENT_SKILL_MARKER'));
  }
  assert.ok(JSON.stringify(requests[1]).includes(png));
  const diagnostics = packets.flatMap(packet => packet.method === 'event' && packet.params.event.type === 'model-request' ? [packet.params.event.request] : []);
  assert.equal(diagnostics.length, 2); assert.deepEqual(diagnostics.map(value => value.actualServiceTier), ['fast', 'default']);
  assert.ok(diagnostics.every(value => value.role === 'computer' && value.requestedServiceTier === 'fast' && value.status === 'completed' && value.elapsedMs >= 0));
  assert.deepEqual(diagnostics[1].usage && { ...diagnostics[1].usage, costUsd: undefined }, { inputTokens: 13, outputTokens: 3, cacheReadTokens: 5, cacheWriteTokens: 2, costUsd: undefined });
  const started = packets.find(packet => packet.method === 'event' && packet.params.event.type === 'started');
  assert.ok(started?.method === 'event' && started.params.event.type === 'started');
  const threadId = started.params.event.threadId;
  const reference = JSON.parse(await readFile(join(home, 'session-index', `${threadId}.json`), 'utf8'));
  assert.equal(reference.computerOnly, true);
  await host.receive({ id: 'cross-role', method: 'run', params: { ...input, runId: randomUUID(), threadId, computerOnly: false, serviceTier: undefined } });
  assert.ok(packets.some(packet => packet.method === undefined && packet.id === 'cross-role' && packet.error?.includes('gehört nicht')));
  assert.equal(requests.length, 2, 'Cross-role resume must fail before another provider request.');
});
