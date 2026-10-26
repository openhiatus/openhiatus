import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { AgentHost } from '../src/main/agent-host';
import { decodeHostMessage, type HostRun, type DecodedHostMessage } from '../src/main/agent-wire';
import { createToolRegistry } from '../src/main/modules/tools';
import { createScreenHelpTools } from '../src/main/platform/tools/screen-help-tools';
import { ScreenHelpService } from '../src/main/platform/screen-help/service';
import type { ComputerRect } from '../src/shared/computer-views';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7N8AAAAASUVORK5CYII=';
function streamResponse(index: number, args?: Record<string, unknown>): Response {
  const argumentsText = JSON.stringify(args), text = 'Synthetic target marked.';
  const item = args ? { id: `fc_help_${index}`, type: 'function_call', call_id: `call_help_${index}`, name: 'screen_help', arguments: argumentsText }
    : { id: 'msg_help', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] };
  const events = [
    { type: 'response.created', response: { id: `resp_help_${index}`, status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item: args ? { ...item, arguments: '' } : { ...item, content: [] } },
    ...(args ? [{ type: 'response.function_call_arguments.delta', output_index: 0, delta: argumentsText }, { type: 'response.function_call_arguments.done', output_index: 0, arguments: argumentsText }]
      : [{ type: 'response.content_part.added', item_id: item.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
        { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: text }, { type: 'response.output_text.done', item_id: item.id, output_index: 0, content_index: 0, text }]),
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: `resp_help_${index}`, status: 'completed', output: [item], usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } } },
  ];
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
}

test('Terra ChatGPT dialog observes, inspects and marks through the real Pi tool path with flat-schema placeholders', { timeout: 30000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'openhiatus-help-runtime-'));
  const workspace = join(directory, 'workspace'), runId = randomUUID(); await mkdir(workspace);
  const shown: { rect: ComputerRect; color: string; label: string }[] = [], packets: DecodedHostMessage[] = [], failures: string[] = [];
  let captures = 0, requests = 0, credentials = 0;
  const help = new ScreenHelpService({
    async capture() { captures++; return { png, width: 1, height: 1, stamp: 'synthetic', displayId: 'fixture', bounds: { x: 0, y: 0, width: 1, height: 1 } }; },
    currentStamp: async () => 'synthetic', skill: async () => 'Synthetic read-only screen help.', busy: () => false, clear() {},
    async show(rect, _image, _bounds, label, color) { shown.push({ rect, color, label }); },
    processor: async () => ({ decode: (_png, size) => ({ ...size, png, data: new Uint8Array(4) }),
      overview: () => ({ base64: png, width: 1, height: 1 }), crop: () => ({ base64: png, width: 1, height: 1 }) }),
  });
  const registry = createToolRegistry([createScreenHelpTools(help)]);
  const binding = registry.bind({ runId, role: 'dialog', signal: new AbortController().signal, emit() {} });
  const fetchMock = t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    try {
    const request = new Request(input, init);
    assert.equal(request.url, 'https://api.openai.com/v1/responses', 'No other network target is allowed in the fixture.');
    assert.match(request.headers.get('authorization') ?? '', /^Bearer synthetic-help-/);
    const payload = JSON.parse(await request.text()); requests++;
    assert.equal(payload.model, 'gpt-6.1-terra');
    assert.deepEqual(payload.tools.map((tool: any) => tool.name), ['screen_help']);
    assert.deepEqual(payload.tools[0].parameters.properties.frameId.type, ['string', 'null']);
    if (requests === 1) return streamResponse(requests, { action: 'observe', resolution: 'original', frameId: '', viewId: '', x: 0, y: 0, width: 1, height: 1, label: '', color: 'red' });
    const outputs = payload.input.filter((item: any) => item.type === 'function_call_output').flatMap((item: any) => item.output);
    const metadataText = outputs.flatMap((item: any) => item?.type === 'input_text' ? item.text.split('\n') : [])
      .filter((line: string) => line.startsWith('OPENHIATUS_COMPUTER_METADATA_V2 ')).at(-1);
    if (requests <= 3) {
      assert.ok(metadataText, 'observe must return actual metadata instead of a rejected tool result');
      assert.ok(outputs.some((item: any) => item?.type === 'input_image' && item.image_url === `data:image/png;base64,${png}`));
      const frame = JSON.parse(metadataText.slice(metadataText.indexOf(' ') + 1));
      return streamResponse(requests, { action: requests === 2 ? 'inspect' : 'mark', resolution: 'original', frameId: frame.frameId,
        viewId: frame.views.at(-1).viewId, x: 0, y: 0, width: 1, height: 1, label: null, color: requests === 2 ? null : 'red' });
    }
    assert.equal(requests, 4); assert.ok(JSON.stringify(outputs).includes('marked'));
    return streamResponse(requests);
    } catch (error) { failures.push(String(error)); throw error; }
  });
  const host = new AgentHost(raw => {
    const packet = decodeHostMessage(raw); packets.push(packet);
    if (packet.method === 'credential') { credentials++; void host.receive({ id: packet.id, result: { apiKey: `synthetic-help-${credentials}` } }); }
    if (packet.method === 'tool') void binding.call(packet.params.name, packet.params.args)
      .then(result => host.receive({ id: packet.id, result }))
      .catch(error => { failures.push(String(error)); return host.receive({ id: packet.id, error: String(error) }); });
  });
  t.after(async () => {
    await host.abort(); await registry.dispose(); fetchMock.mock.restore();
    assert.equal(dirname(directory).toLowerCase(), resolve(tmpdir()).toLowerCase()); assert.ok(basename(directory).startsWith('openhiatus-help-runtime-'));
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  const input: HostRun = { runId, text: 'Mark the synthetic target.', workspace, home: join(directory, 'home'), dialog: true,
    instructions: 'Observe the synthetic screen and mark its only pixel. Do not perform input.',
    model: { provider: 'openai', modelId: 'gpt-6.1-terra', apiKey: '', authType: 'chatgpt', api: 'openai-responses', baseUrl: 'https://api.openai.com/v1' },
    tools: [...binding.definitions] };
  await host.receive({ id: 'run', method: 'run', params: input });
  const deadline = Date.now() + 15000;
  while (!packets.some(packet => packet.method === 'event' && packet.params.event.type === 'completed') && Date.now() < deadline) await new Promise(done => setTimeout(done, 10));
  const complete = packets.find(packet => packet.method === 'event' && packet.params.event.type === 'completed');
  assert.deepEqual(failures, []);
  assert.ok(complete?.method === 'event' && complete.params.event.type === 'completed' && complete.params.event.status === 'completed', JSON.stringify(packets));
  assert.deepEqual(failures, []); assert.equal(requests, 4); assert.equal(captures, 2);
  assert.deepEqual(shown, [{ rect: { x: 0, y: 0, width: 1, height: 1 }, color: 'red', label: 'Hier' }]);
});
