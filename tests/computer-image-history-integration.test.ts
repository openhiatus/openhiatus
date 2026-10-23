import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type ServerResponse } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';
import { setTimeout as delay } from 'node:timers/promises';
import { AgentHost } from '../src/main/agent-host';
import { PiAdapter } from '../src/main/pi';
import { ProviderStore } from '../src/main/providers';
import { decodeHostMessage, type AgentTransport, type TransportCallbacks } from '../src/main/agent-protocol';
import { createToolRegistry } from '../src/main/modules/tools';
import { createComputerToolContribution } from '../src/main/platform/tools/computer-tools';
import { EXPIRED_COMPUTER_IMAGE } from '../src/main/computer-image-history';
import type { ComputerAdapter } from '../src/main/computer';
import type { AgentEvent } from '../src/shared/contracts';
import { fakeCommandRequest } from './support/agent-transport';

function pngChunk(type: string, bytes: Buffer): Buffer {
  const prefix = Buffer.alloc(4), checksum = Buffer.alloc(4), content = Buffer.concat([Buffer.from(type), bytes]);
  prefix.writeUInt32BE(bytes.length); checksum.writeUInt32BE(crc32(content)); return Buffer.concat([prefix, content, checksum]);
}
const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header),
  pngChunk('IDAT', deflateSync(Buffer.from([0, 10, 20, 30, 255]))), pngChunk('IEND', Buffer.alloc(0))]).toString('base64');
const image = (index: number) => Buffer.concat([Buffer.from(png, 'base64'), Buffer.from(`synthetic-${index}`)]).toString('base64');
function deferred<Value>() { let resolve!: (value: Value) => void; const promise = new Promise<Value>(done => { resolve = done; }); return { promise, resolve }; }
async function until(predicate: () => boolean, diagnostics: () => unknown): Promise<void> {
  const deadline = Date.now() + 20000; while (!predicate() && Date.now() < deadline) await delay(10); assert.ok(predicate(), JSON.stringify(diagnostics()));
}
function respond(response: ServerResponse, step: { tool: string; args: object } | { text: string } | { failure: string }): void {
  if ('failure' in step) {
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end(`data: ${JSON.stringify({ type: 'response.failed', response: { id: randomUUID(), status: 'failed', error: { code: 'synthetic_failure', message: step.failure } } })}\n\n`); return;
  }
  const id = randomUUID(), call = 'tool' in step, args = call ? JSON.stringify(step.args) : '';
  const item = call ? { id: `fc_${id}`, type: 'function_call', call_id: `call_${id}`, name: step.tool, arguments: args }
    : { id: `msg_${id}`, type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: step.text, annotations: [] }] };
  const events = [{ type: 'response.created', response: { id, status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item: call ? { ...item, arguments: '' } : { ...item, content: [] } },
    ...(call ? [{ type: 'response.function_call_arguments.delta', output_index: 0, delta: args }, { type: 'response.function_call_arguments.done', output_index: 0, arguments: args }]
      : [{ type: 'response.content_part.added', output_index: 0, item_id: item.id, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
        { type: 'response.output_text.delta', output_index: 0, item_id: item.id, content_index: 0, delta: step.text },
        { type: 'response.output_text.done', output_index: 0, item_id: item.id, content_index: 0, text: step.text }]),
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id, status: 'completed', output: [item], usage: { input_tokens: 20, output_tokens: 3, input_tokens_details: { cached_tokens: 0 }, total_tokens: 23 } } }];
  response.writeHead(200, { 'content-type': 'text/event-stream' }); response.end(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''));
}
function connect(callbacks: TransportCallbacks): AgentTransport {
  const pending = new Map<string, { resolve(value: unknown): void; reject(reason: Error): void }>();
  const host = new AgentHost(raw => {
    const packet = decodeHostMessage(raw);
    if (packet.method === undefined) {
      const entry = pending.get(packet.id); pending.delete(packet.id);
      if (packet.error !== undefined) entry?.reject(new Error(packet.error)); else entry?.resolve(packet.result);
    } else if (packet.method !== 'openhiatus/host/child') callbacks.packet(packet);
  });
  return { request: fakeCommandRequest(async packet => {
    const id = randomUUID(), result = new Promise<unknown>((resolve, reject) => pending.set(id, { resolve, reject })); await host.receive({ ...packet, id }); return result;
  }), notify: (method, ...args) => { void host.receive({ method, params: args[0] ?? {} }); },
  respond: (packet, result) => { void host.receive({ id: packet.id, result }); }, managedProcessCount: async () => 0,
  terminate: async () => { await host.abort(); callbacks.closed(true); } };
}
async function fixture(t: { after(callback: () => Promise<void>): void }, next: (number: number, request: any, file: string) => Parameters<typeof respond>[1], computer: ComputerAdapter,
  getRetention: () => number = () => 3) {
  const directory = await mkdtemp(join(tmpdir(), 'openhiatus-image-history-')), file = join(directory, 'ordinary-image.png');
  await writeFile(file, Buffer.from(png, 'base64'));
  const requests: any[] = [], events: AgentEvent[] = [], errors: string[] = [], adapters: PiAdapter[] = [];
  const server = createServer(async (request, response) => {
    try { let body = ''; for await (const chunk of request) body += chunk;
      const payload = JSON.parse(body); requests.push(payload); respond(response, next(requests.length, payload, file));
    } catch (error) { errors.push(String(error)); response.writeHead(500); response.end('Synthetic request assertion failed'); }
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const saved = new Map<string, string>(), providers = new ProviderStore(directory, { get: name => saved.get(name), set: (name, value) => { saved.set(name, value); }, remove: name => { saved.delete(name); } });
  await providers.save({ id: 'openai', models: ['gpt-6.1-sol'], apiKey: 'synthetic-local-test', baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1` });
  const makeAdapter = () => {
    const adapter = new PiAdapter({ executable: 'unused', processHost: 'unused', hostEntry: 'unused', workspace: directory, home: join(directory, 'pi'), providers,
      getComputerImageRetentionCalls: getRetention, onEvent: event => events.push(event),
      tools: createToolRegistry([createComputerToolContribution({ computer })]) }, { connect });
    adapters.push(adapter); return adapter;
  };
  t.after(async () => {
    await Promise.all(adapters.map(adapter => adapter.dispose())); server.closeAllConnections(); await new Promise<void>(done => server.close(() => done()));
    assert.equal(dirname(directory).toLowerCase(), resolve(tmpdir()).toLowerCase()); assert.ok(basename(directory).startsWith('openhiatus-image-history-'));
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  return { directory, requests, events, errors, makeAdapter };
}
const imageUrls = (payload: any): string[] => payload.input.flatMap((item: any) => (Array.isArray(item.output) ? item.output : [])
  .filter((block: any) => block.type === 'input_image').map((block: any) => block.image_url));

test('Sol-only Pi requests expire computer images after three sends, preserve file images and original logs, and retain ages across restart/resume', { timeout: 45000 }, async t => {
  let captures = 0, requestedRetention = 3, reads = 0;
  const f = await fixture(t, (number, request, file) => {
    assert.equal(request.model, 'gpt-6.1-sol'); assert.equal(request.service_tier, undefined);
    assert.ok(JSON.stringify(request).includes('Computer images remain visible for at most 3 consecutive model requests'));
    if (number === 1) return { tool: 'computer', args: { action: 'screenshot' } };
    if (number === 2) return { tool: 'read', args: { path: file } };
    if (number === 3) { requestedRetention = 1; return { tool: 'computer', args: { action: 'screenshot' } }; }
    if (number <= 6) return { tool: 'computer', args: { action: 'key', frameId: `frame-${captures}`, key: 'tab' } };
    return { text: 'Observed values remain unverified; no extra summary was requested.' };
  }, { execute: async () => ({ text: 'Observed exact value 1234.56; unverified', frameId: `frame-${++captures}`, width: 1, height: 1,
    image: { base64: image(captures), mimeType: 'image/png' } }), stop: async () => {}, dispose: async () => {} }, () => { reads++; return requestedRetention; });
  const first = f.makeAdapter(); await first.run('Perform the synthetic observed UI steps.', 'openai/gpt-6.1-sol');
  await until(() => f.events.some(event => event.type === 'completed'), () => ({ events: f.events, errors: f.errors }));
  assert.deepEqual(f.errors, []); assert.equal(f.requests.length, 7); assert.equal(reads, 1, 'settings getter is captured once per run');
  assert.deepEqual(f.requests.map(request => imageUrls(request).filter(url => url !== `data:image/png;base64,${png}`).length), [0, 1, 1, 2, 2, 3, 3]);
  assert.ok(imageUrls(f.requests[3]).includes(`data:image/png;base64,${image(1)}`));
  assert.ok(!imageUrls(f.requests[4]).includes(`data:image/png;base64,${image(1)}`));
  assert.ok(JSON.stringify(f.requests[4]).includes(EXPIRED_COMPUTER_IMAGE));
  const expiredOutput = f.requests[4].input.find((item: any) => item.type === 'function_call_output');
  assert.equal(typeof expiredOutput.output, 'string'); assert.ok(!expiredOutput.output.includes('OPENHIATUS_COMPUTER_METADATA')); assert.ok(!expiredOutput.output.includes('frame-1'));
  for (const request of f.requests.slice(2)) assert.ok(imageUrls(request).includes(`data:image/png;base64,${png}`), 'ordinary SDK file images keep their existing retention');
  const started = f.events.find((event): event is Extract<AgentEvent, { type: 'started' }> => event.type === 'started'); assert.ok(started);
  const index = JSON.parse(await readFile(join(f.directory, 'pi', 'session-index', `${started.threadId}.json`), 'utf8'));
  const beforeResume = await readFile(index.file, 'utf8'), records = beforeResume.split('\n').filter(Boolean).map(line => JSON.parse(line));
  assert.equal(records.filter(row => row.message?.role === 'toolResult' && row.message?.toolName === 'computer' && row.message.content.some((block: any) => block.type === 'image')).length, 5);
  assert.ok(beforeResume.includes(image(1))); assert.ok(beforeResume.includes('OPENHIATUS_COMPUTER_METADATA'));
  await first.dispose(); requestedRetention = 3;
  const resumed = f.makeAdapter(); await resumed.run('Continue with the existing exact notes only.', 'openai/gpt-6.1-sol', started.threadId);
  await until(() => f.events.filter(event => event.type === 'completed').length === 2, () => ({ events: f.events, errors: f.errors }));
  assert.deepEqual(f.errors, []); assert.equal(reads, 2); assert.equal(f.requests.length, 8);
  const resumedUrls = imageUrls(f.requests[7]); assert.ok(!resumedUrls.includes(`data:image/png;base64,${image(3)}`));
  assert.ok(resumedUrls.includes(`data:image/png;base64,${image(4)}`)); assert.ok(resumedUrls.includes(`data:image/png;base64,${image(5)}`));
  assert.ok(resumedUrls.includes(`data:image/png;base64,${png}`));
  assert.ok((await readFile(index.file, 'utf8')).startsWith(beforeResume), 'canonical logs are append-only and retain original image bytes');
  const clock = JSON.parse(await readFile(join(f.directory, 'pi', 'session-index', `${started.threadId}.computer-images.json`), 'utf8'));
  assert.equal(clock.requestCount, 8); assert.equal(clock.visible.length, 2); assert.ok(!JSON.stringify(clock).includes(png));
});

test('a failed model request advances the retention clock without launching summary or automatic recovery requests', { timeout: 30000 }, async t => {
  const f = await fixture(t, number => number === 1 ? { tool: 'computer', args: { action: 'screenshot' } } : { failure: 'Synthetic provider failure' },
    { execute: async () => ({ text: 'Unverified', frameId: 'frame', width: 1, height: 1, image: { base64: png, mimeType: 'image/png' } }), stop: async () => {}, dispose: async () => {} });
  await f.makeAdapter().run('Inspect the synthetic UI.', 'openai/gpt-6.1-sol');
  await until(() => f.events.some(event => event.type === 'completed'), () => f.events);
  assert.deepEqual(f.events.filter(event => event.type === 'completed').map(event => event.status), ['failed']);
  await delay(20); assert.equal(f.requests.length, 2); assert.deepEqual(f.errors, []);
});

test('Stop during a pending fake desktop operation sends no extra model or summary requests', { timeout: 30000 }, async t => {
  const entered = deferred<void>(), release = deferred<void>(); let signal: AbortSignal | undefined;
  const f = await fixture(t, () => ({ tool: 'computer', args: { action: 'screenshot' } }), { execute: async (_input, abort) => {
    signal = abort; entered.resolve(); await release.promise; return { text: 'Unverified', frameId: 'frame', width: 1, height: 1, image: { base64: png, mimeType: 'image/png' } };
  }, stop: async () => { if (signal) await release.promise; }, dispose: async () => {} });
  const adapter = f.makeAdapter(); await adapter.run('Inspect the synthetic UI.', 'openai/gpt-6.1-sol'); await entered.promise;
  const stopping = adapter.stop(); await delay(5); assert.equal(signal?.aborted, true); release.resolve(); await stopping;
  await delay(20); assert.equal(f.requests.length, 1); assert.deepEqual(f.events.filter(event => event.type === 'completed').map(event => event.status), ['interrupted']);
});
