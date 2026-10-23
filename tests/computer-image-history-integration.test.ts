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
import { COMPUTER_STATE_NOTE, COMPUTER_WORKING_MEMORY_REFRESH, EXPIRED_COMPUTER_IMAGE } from '../src/main/computer-image-history';
import type { ComputerAdapter } from '../src/main/computer';
import type { AgentEvent } from '../src/shared/contracts';
import type { AgentSession } from '@earendil-works/pi-coding-agent';
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
function connect(callbacks: TransportCallbacks, created?: (host: AgentHost) => void): AgentTransport {
  const pending = new Map<string, { resolve(value: unknown): void; reject(reason: Error): void }>();
  const host = new AgentHost(raw => {
    const packet = decodeHostMessage(raw);
    if (packet.method === undefined) {
      const entry = pending.get(packet.id); pending.delete(packet.id);
      if (packet.error !== undefined) entry?.reject(new Error(packet.error)); else entry?.resolve(packet.result);
    } else if (packet.method !== 'openhiatus/host/child') callbacks.packet(packet);
  });
  created?.(host);
  return { request: fakeCommandRequest(async packet => {
    const id = randomUUID(), result = new Promise<unknown>((resolve, reject) => pending.set(id, { resolve, reject })); await host.receive({ ...packet, id }); return result;
  }), notify: (method, ...args) => { void host.receive({ method, params: args[0] ?? {} }); },
  respond: (packet, result) => { void host.receive({ id: packet.id, result }); }, managedProcessCount: async () => 0,
  terminate: async () => { await host.abort(); callbacks.closed(true); } };
}
async function fixture(t: { after(callback: () => Promise<void>): void }, next: (number: number, request: any, file: string) => Parameters<typeof respond>[1], computer: ComputerAdapter,
  getRetention: () => number = () => 2, getWorkingMemory: () => number = () => 0) {
  const directory = await mkdtemp(join(tmpdir(), 'openhiatus-image-history-')), file = join(directory, 'ordinary-image.png');
  await writeFile(file, Buffer.from(png, 'base64'));
  const requests: any[] = [], events: AgentEvent[] = [], errors: string[] = [], adapters: PiAdapter[] = [], hosts: AgentHost[] = [];
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
      getComputerWorkingMemoryCalls: getWorkingMemory,
      tools: createToolRegistry([createComputerToolContribution({ computer })]) }, { connect: callbacks => connect(callbacks, host => hosts.push(host)) });
    adapters.push(adapter); return adapter;
  };
  t.after(async () => {
    await Promise.all(adapters.map(adapter => adapter.dispose())); server.closeAllConnections(); await new Promise<void>(done => server.close(() => done()));
    assert.equal(dirname(directory).toLowerCase(), resolve(tmpdir()).toLowerCase()); assert.ok(basename(directory).startsWith('openhiatus-image-history-'));
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  return { directory, requests, events, errors, makeAdapter, hosts };
}
const imageUrls = (payload: any): string[] => payload.input.flatMap((item: any) => (Array.isArray(item.output) ? item.output : [])
  .filter((block: any) => block.type === 'input_image').map((block: any) => block.image_url));
const instructionText = (payload: any): string => [payload.instructions ?? '', ...payload.input
  .filter((item: any) => item.role === 'system' || item.role === 'developer')
  .map((item: any) => typeof item.content === 'string' ? item.content : (item.content ?? []).map((block: any) => block.text ?? '').join('\n'))].join('\n');

test('Sol-only Pi keeps a two-request/two-frame window, one latest unverified note, file images and canonical logs across inspect and restart', { timeout: 45000 }, async t => {
  let captures = 0, returns = 0, requestedRetention = 2, reads = 0;
  const nativeInputs: unknown[] = [], notes = ['Observed field A; unverified.', 'Observed field B; unfinished.', 'Exact value 1234.56; unverified.', 'Same capture, inspect only; no success claim.', `${'x'.repeat(227)}\nsecond\nthird`];
  const report = 'Business report with calculated results and limitations. '.repeat(12).trimEnd();
  const noteContents = (request: any) => JSON.stringify(request.input).split(COMPUTER_STATE_NOTE).length - 1;
  const f = await fixture(t, (number, request, file) => {
    assert.equal(request.model, 'gpt-6.1-sol'); assert.equal(request.service_tier, undefined);
    const wire = JSON.stringify(request);
    assert.ok(wire.includes('Computer image history is cut off: at most the 2 newest distinct captures remain, each for at most 2 consecutive model requests'));
    assert.match(wire, /240/); assert.match(wire, /stateNote/);
    const advertised = request.tools.find((tool: any) => tool.name === 'computer');
    assert.equal(advertised.parameters.properties.stateNote.maxLength, 240, 'the actual provider schema advertises the note limit');
    assert.equal(noteContents(request), number === 1 ? 0 : 1, 'latest note appears once in data, never once per old tool result');
    const expected = number <= 3 ? 0 : number - 3;
    if (number > 1) {
      const latest = notes[Math.min(expected, notes.length - 1)];
      assert.ok(wire.includes(JSON.stringify(latest).slice(1, -1)), `latest note missing on request ${number}`);
      for (const note of notes) if (note !== latest) assert.ok(!wire.includes(JSON.stringify(note).slice(1, -1)), 'older notes cannot accumulate in outgoing history');
    }
    for (const item of request.input) if (item.type === 'function_call' && item.name === 'computer') {
      assert.ok(!('stateNote' in JSON.parse(item.arguments)), 'native tool-call replay never carries old note fields');
    }
    for (const note of notes) assert.ok(!instructionText(request).includes(note), 'observed notes are never promoted to system/developer instructions');
    if (number === 1) return { tool: 'computer', args: { action: 'screenshot', stateNote: notes[0] } };
    if (number === 2) return { tool: 'read', args: { path: file } };
    if (number === 3) { requestedRetention = 1; return { tool: 'computer', args: { action: 'screenshot', stateNote: notes[1] } }; }
    if (number === 5) return { tool: 'computer', args: { action: 'inspect', frameId: `frame-${captures}`, viewId: 'view', x: 0, y: 0, width: 1, height: 1, stateNote: notes[3] } };
    if (number <= 6) return { tool: 'computer', args: { action: 'key', frameId: `frame-${captures}`, key: 'tab', stateNote: notes[number - 2] } };
    return { text: report };
  }, { execute: async input => {
    nativeInputs.push(input); assert.ok(typeof input === 'object' && input !== null && 'action' in input);
    assert.ok(!('stateNote' in input), 'the host-only note never reaches the desktop adapter');
    if (input.action !== 'inspect') captures++;
    return { text: 'Observed exact value 1234.56; unverified', frameId: `frame-${captures}`, width: 1, height: 1,
      image: { base64: image(++returns), mimeType: 'image/png' } };
  }, stop: async () => {}, dispose: async () => {} }, () => { reads++; return requestedRetention; });
  const first = f.makeAdapter(); await first.run('Perform the synthetic observed UI steps.', 'openai/gpt-6.1-sol');
  await until(() => f.events.some(event => event.type === 'completed'), () => ({ events: f.events, errors: f.errors }));
  assert.deepEqual(f.errors, []); assert.equal(f.requests.length, 7); assert.equal(reads, 1, 'settings getter is captured once per run');
  assert.equal(nativeInputs.length, 5); assert.equal(captures, 4);
  assert.deepEqual(f.requests.map(request => imageUrls(request).filter(url => url !== `data:image/png;base64,${png}`).length), [0, 1, 1, 1, 2, 1, 1]);
  assert.ok(imageUrls(f.requests[2]).includes(`data:image/png;base64,${image(1)}`));
  assert.ok(!imageUrls(f.requests[3]).includes(`data:image/png;base64,${image(1)}`));
  assert.ok(JSON.stringify(f.requests[3]).includes(EXPIRED_COMPUTER_IMAGE));
  const expiredOutput = f.requests[3].input.find((item: any) => item.type === 'function_call_output');
  assert.equal(typeof expiredOutput.output, 'string'); assert.ok(!expiredOutput.output.includes('OPENHIATUS_COMPUTER_METADATA')); assert.ok(!expiredOutput.output.includes('frame-1'));
  for (const request of f.requests.slice(2)) assert.ok(imageUrls(request).includes(`data:image/png;base64,${png}`), 'ordinary SDK file images keep their existing retention');
  assert.ok(!imageUrls(f.requests[5]).includes(`data:image/png;base64,${image(3)}`), 'inspect replaces earlier views from the same capture');
  assert.ok(imageUrls(f.requests[5]).includes(`data:image/png;base64,${image(4)}`));
  assert.ok(!imageUrls(f.requests[6]).includes(`data:image/png;base64,${image(4)}`), 'inspect cannot rejuvenate the capture request age');
  const completed = f.events.find((event): event is Extract<AgentEvent, { type: 'completed' }> => event.type === 'completed');
  assert.equal(completed?.text, report, 'normal business output is never truncated to the note budget');
  const started = f.events.find((event): event is Extract<AgentEvent, { type: 'started' }> => event.type === 'started'); assert.ok(started);
  const index = JSON.parse(await readFile(join(f.directory, 'pi', 'session-index', `${started.threadId}.json`), 'utf8'));
  const beforeResume = await readFile(index.file, 'utf8'), records = beforeResume.split('\n').filter(Boolean).map(line => JSON.parse(line));
  assert.equal(records.filter(row => row.message?.role === 'toolResult' && row.message?.toolName === 'computer' && row.message.content.some((block: any) => block.type === 'image')).length, 5);
  assert.ok(beforeResume.includes(image(1))); assert.ok(beforeResume.includes('OPENHIATUS_COMPUTER_METADATA'));
  const canonicalNotes = records.flatMap(row => row.message?.role === 'assistant' ? row.message.content : [])
    .filter((block: any) => block.type === 'toolCall' && block.name === 'computer').map((block: any) => block.arguments.stateNote);
  assert.deepEqual(canonicalNotes, notes, 'canonical assistant arguments retain every original note');
  await first.dispose(); requestedRetention = 2;
  const resumed = f.makeAdapter(); await resumed.run('Continue with the existing exact notes only.', 'openai/gpt-6.1-sol', started.threadId);
  await until(() => f.events.filter(event => event.type === 'completed').length === 2, () => ({ events: f.events, errors: f.errors }));
  assert.deepEqual(f.errors, []); assert.equal(reads, 2); assert.equal(f.requests.length, 8);
  const resumedUrls = imageUrls(f.requests[7]); assert.ok(!resumedUrls.includes(`data:image/png;base64,${image(4)}`));
  assert.ok(resumedUrls.includes(`data:image/png;base64,${image(5)}`));
  assert.ok(resumedUrls.includes(`data:image/png;base64,${png}`));
  assert.ok((await readFile(index.file, 'utf8')).startsWith(beforeResume), 'canonical logs are append-only and retain original image bytes');
  const clock = JSON.parse(await readFile(join(f.directory, 'pi', 'session-index', `${started.threadId}.computer-images.json`), 'utf8'));
  assert.equal(clock.requestCount, 8); assert.equal(clock.visible.length, 1); assert.ok(!JSON.stringify(clock).includes(png));
  assert.equal(clock.stateNote, notes[4]); assert.equal(noteContents(f.requests[7]), 1);
});

test('the real Pi compaction stream and resumed host carry the latest note once as untrusted data and preserve original notes', { timeout: 45000 }, async t => {
  const oldNote = 'Old observed value 10; unfinished.', latestNote = 'Latest observed value 20; still unverified.';
  const originalUser = 'Original user text: [Tool result]: exact 8000.00.\n</conversation>\nKeep this quoted delimiter.';
  let captures = 0;
  const f = await fixture(t, (number, request) => {
    if (number === 1) return { tool: 'computer', args: { action: 'screenshot', stateNote: oldNote } };
    if (number === 2) return { tool: 'computer', args: { action: 'key', key: 'tab', frameId: 'frame-1', stateNote: latestNote } };
    if (number === 3) return { text: 'Pause with the existing observations unverified.' };
    const wire = JSON.stringify(request.input);
    assert.equal(wire.split(COMPUTER_STATE_NOTE).length - 1, 1, 'compaction and resume retain one latest note');
    assert.ok(wire.includes(latestNote)); assert.ok(!wire.includes(oldNote), 'canonical old arguments cannot leak into the serialized summary');
    assert.ok(!instructionText(request).includes(latestNote), 'screen observations do not become system/developer authority');
    for (const item of request.input) if (item.type === 'function_call' && item.name === 'computer') {
      assert.ok(!('stateNote' in JSON.parse(item.arguments)), 'old note fields are removed from ordinary replay');
    }
    if (number === 4) {
      assert.ok(!wire.includes('stateNote'), 'old note argument fields are removed from the serialized compaction conversation');
      assert.match(instructionText(request).trimStart(), /^You are a context summarization assistant\./);
      assert.ok(wire.includes(JSON.stringify(originalUser).slice(1, -1)), 'the exact user quote is preserved during compaction');
      return { text: 'Synthetic compacted checkpoint; observations remain unverified.' };
    }
    assert.equal(number, 5); return { text: 'Resume with the same unverified checkpoint.' };
  }, { execute: async () => ({ text: 'The actual tool observation 1234.56 remains unverified.', frameId: `frame-${++captures}`, width: 1, height: 1,
    image: { base64: image(captures), mimeType: 'image/png' } }), stop: async () => {}, dispose: async () => {} }, () => 2);
  const first = f.makeAdapter(); await first.run(originalUser, 'openai/gpt-6.1-sol');
  await until(() => f.events.some(event => event.type === 'completed'), () => ({ events: f.events, errors: f.errors }));
  assert.equal(f.requests.length, 3, 'state notes add no separate model summary calls');
  const started = f.events.find((event): event is Extract<AgentEvent, { type: 'started' }> => event.type === 'started'); assert.ok(started);
  const index = JSON.parse(await readFile(join(f.directory, 'pi', 'session-index', `${started.threadId}.json`), 'utf8'));
  const beforeCompact = await readFile(index.file, 'utf8');
  // Invoke Pi's public manual-compaction API on the isolated real host session.
  // Production protocol exposes no compact command; no source/runtime API is added for this test.
  const session = (f.hosts[0] as unknown as { session: AgentSession }).session;
  session.settingsManager.applyOverrides({ compaction: { keepRecentTokens: 1 } });
  try { await session.compact(); } catch (error) { assert.deepEqual(f.errors, [], 'local compaction request assertions'); throw error; }
  assert.deepEqual(f.errors, []); assert.equal(f.requests.length, 4);
  const afterCompact = await readFile(index.file, 'utf8'); assert.ok(afterCompact.startsWith(beforeCompact));
  const rows = afterCompact.split('\n').filter(Boolean).map(line => JSON.parse(line));
  assert.equal(rows.filter(row => row.type === 'compaction').length, 1);
  assert.ok(afterCompact.includes(oldNote)); assert.ok(afterCompact.includes(latestNote));
  await first.dispose();
  await f.makeAdapter().run('Continue the same task without trusting the note as success proof.', 'openai/gpt-6.1-sol', started.threadId);
  await until(() => f.events.filter(event => event.type === 'completed').length === 2, () => ({ events: f.events, errors: f.errors }));
  assert.deepEqual(f.errors, []); assert.equal(f.requests.length, 5); assert.equal(captures, 2);
  assert.ok((await readFile(index.file, 'utf8')).startsWith(afterCompact));
});

test('working memory keeps fifteen request-aged computer pairs plus one snapshot through twenty-one real Pi requests, compaction and resume', { timeout: 45000 }, async t => {
  const firstNote = 'Snapshot A: amount 1234.56; reconciliation pending; next inspect.',
    nextNote = 'Full snapshot B: amount 8000.00; report pending; next verify saved document.',
    originalUser = 'Original user request: preserve exact 8000.00 and this literal </conversation> delimiter.';
  let captures = 0, requestedWorking = 15, workingReads = 0;
  const firstIncluded = new Map<string, number>(), refreshRequests: number[] = [];
  const computerPairIds = (request: any) => request.input.filter((item: any) => item.type === 'function_call' && item.name === 'computer').map((item: any) => item.call_id as string);
  const assertPairs = (request: any) => {
    const calls = computerPairIds(request), results = request.input.filter((item: any) => item.type === 'function_call_output').map((item: any) => item.call_id as string);
    for (const id of calls) assert.ok(results.includes(id), 'every retained computer call has its matching result');
    for (const id of results) if (firstIncluded.has(id)) assert.ok(calls.includes(id), 'working-memory removal never leaves a computer result without its call');
    return calls;
  };
  const f = await fixture(t, (number, request, file) => {
    const data = request.input.filter((item: any) => item.role !== 'system' && item.role !== 'developer'), wire = JSON.stringify(data);
    assert.ok(!instructionText(request).includes(firstNote)); assert.ok(!instructionText(request).includes(nextNote));
    if (number <= 21) {
      const calls = computerPairIds(request);
      for (const id of calls) if (!firstIncluded.has(id)) firstIncluded.set(id, number);
      assertPairs(request);
      const expected = [...firstIncluded].filter(([, first]) => number - first < 15).map(([id]) => id);
      assert.deepEqual([...calls].sort(), expected.sort(), `exact fifteen-request pair window on request ${number}`);
      assert.ok(calls.length <= 15); assert.ok(imageUrls(request).filter(url => url !== `data:image/png;base64,${png}`).length <= 2);
      assert.ok(wire.includes(originalUser), 'the original user request survives computer-only pruning');
      if (number >= 3) {
        const read = request.input.find((item: any) => item.type === 'function_call' && item.name === 'read'); assert.ok(read);
        assert.ok(request.input.some((item: any) => item.type === 'function_call_output' && item.call_id === read.call_id));
        assert.ok(imageUrls(request).includes(`data:image/png;base64,${png}`), 'old file read and its ordinary image are outside the computer working-memory budget');
      }
      assert.equal(wire.split(COMPUTER_STATE_NOTE).length - 1, number === 1 ? 0 : 1);
      if (number > 1 && number <= 17) assert.ok(wire.includes(firstNote));
      if (number >= 18) { assert.ok(wire.includes(nextNote)); assert.ok(!wire.includes(firstNote), 'the next full snapshot replaces, rather than appends to, the old note'); }
      if (wire.includes(COMPUTER_WORKING_MEMORY_REFRESH)) refreshRequests.push(number);
      if (number >= 17) assert.ok(!calls.includes([...firstIncluded.keys()][0]), 'the first computer pair expires even though a file read also consumed a model request');
      if (number === 1) return { tool: 'computer', args: { action: 'screenshot', stateNote: firstNote } };
      if (number === 2) return { tool: 'read', args: { path: file } };
      if (number === 3) requestedWorking = 10;
      if (number <= 20) return { tool: 'computer', args: { action: 'key', frameId: `frame-${captures}`, key: 'tab', ...(number === 17 ? { stateNote: nextNote } : {}) } };
      return { text: 'Twenty-one requests completed with the current unverified snapshot only.' };
    }
    assert.equal(wire.split(COMPUTER_STATE_NOTE).length - 1, 1); assert.ok(wire.includes(nextNote)); assert.ok(!wire.includes(firstNote));
    if (number === 22) {
      assert.match(instructionText(request), /You are a context summarization assistant/);
      assert.ok(!wire.includes('observed-capture-01:'), 'expired computer result text is absent from the actual serialized compaction request');
      assert.ok(wire.includes(originalUser), 'compaction projection preserves exact original user data');
      return { text: 'Synthetic compacted checkpoint; values and UI completion remain unverified.' };
    }
    assert.equal(number, 23); assertPairs(request);
    assert.ok(wire.includes(image(999)), 'a user-supplied image in the uncompacted tail survives restart and computer pruning');
    assert.ok(wire.includes('Original user photograph, exact 8000.00.'));
    return { text: 'Resumed with the current snapshot and the user photograph.' };
  }, { execute: async input => {
    assert.ok(typeof input === 'object' && input !== null && !('stateNote' in input));
    captures++; return { text: `observed-capture-${String(captures).padStart(2, '0')}: amount 1234.56; unverified.`, frameId: `frame-${captures}`, width: 1, height: 1,
      image: { base64: image(captures), mimeType: 'image/png' } };
  }, stop: async () => {}, dispose: async () => {} }, () => 2, () => { workingReads++; return requestedWorking; });
  const first = f.makeAdapter(); await first.run(originalUser, 'openai/gpt-6.1-sol');
  await until(() => f.events.some(event => event.type === 'completed'), () => ({ events: f.events, errors: f.errors }));
  assert.deepEqual(f.errors, []); assert.equal(f.requests.length, 21); assert.equal(captures, 19); assert.equal(workingReads, 1, 'working-memory budget is frozen at admission');
  assert.deepEqual(refreshRequests, [17], 'one data-only refresh signal follows fifteen requests without a replacement snapshot');
  const started = f.events.find((event): event is Extract<AgentEvent, { type: 'started' }> => event.type === 'started'); assert.ok(started);
  const index = JSON.parse(await readFile(join(f.directory, 'pi', 'session-index', `${started.threadId}.json`), 'utf8'));
  const original = await readFile(index.file, 'utf8'), rows = original.split('\n').filter(Boolean).map(line => JSON.parse(line));
  assert.equal(rows.filter(row => row.message?.role === 'toolResult' && row.message?.toolName === 'computer').length, 19);
  assert.ok(original.includes(firstNote)); assert.ok(original.includes(nextNote)); assert.ok(original.includes(image(1)), 'pruned records remain intact in canonical JSONL');
  const session = (f.hosts[0] as unknown as { session: AgentSession }).session;
  session.settingsManager.applyOverrides({ compaction: { keepRecentTokens: 1 } });
  try { await session.compact(); } catch (error) { assert.deepEqual(f.errors, [], 'working-memory compaction assertions'); throw error; }
  assert.equal(f.requests.length, 22, 'only the explicit compaction adds a summary request');
  const compacted = await readFile(index.file, 'utf8'); assert.ok(compacted.startsWith(original));
  // The text-only application run API has no image-attachment argument. Add a user
  // photo through Pi's public canonical session API, solely in this isolated fixture.
  session.sessionManager.appendMessage({ role: 'user', timestamp: Date.now(), content: [
    { type: 'text', text: 'Original user photograph, exact 8000.00.' }, { type: 'image', data: image(999), mimeType: 'image/png' },
  ] });
  const beforeResume = await readFile(index.file, 'utf8'); assert.ok(beforeResume.startsWith(compacted));
  await first.dispose(); requestedWorking = 15;
  await f.makeAdapter().run('Continue with the current snapshot only.', 'openai/gpt-6.1-sol', started.threadId);
  await until(() => f.events.filter(event => event.type === 'completed').length === 2, () => ({ events: f.events, errors: f.errors }));
  assert.deepEqual(f.errors, []); assert.equal(f.requests.length, 23); assert.equal(workingReads, 2); assert.equal(captures, 19);
  assert.ok((await readFile(index.file, 'utf8')).startsWith(beforeResume));
  const clock = JSON.parse(await readFile(join(f.directory, 'pi', 'session-index', `${started.threadId}.computer-images.json`), 'utf8'));
  assert.equal(clock.stateNote, nextNote); assert.equal(clock.requestCount, 23);
});

test('invalid notes never reach the desktop or replace state, and input errors remain visible beside one unverified note', { timeout: 30000 }, async t => {
  const invalidNote = 'x'.repeat(241), validNote = 'Visible field 1234.56; pending verification.', failedNote = 'Pending focus change; outcome unverified.';
  const failure = 'Synthetic input failure: exact value 1234.56 must remain visible.'; let nativeCalls = 0;
  const f = await fixture(t, (number, request) => {
    const wire = JSON.stringify(request.input);
    if (number === 1) return { tool: 'computer', args: { action: 'screenshot', stateNote: invalidNote } };
    for (const item of request.input) if (item.type === 'function_call' && item.name === 'computer') {
      assert.ok(!('stateNote' in JSON.parse(item.arguments)), 'even invalid old note argument fields are stripped');
    }
    if (number === 2) {
      assert.equal(nativeCalls, 0); assert.ok(!wire.includes(COMPUTER_STATE_NOTE));
      assert.ok(request.input.some((item: any) => item.type === 'function_call_output' && typeof item.output === 'string'));
      return { tool: 'computer', args: { action: 'screenshot', stateNote: validNote } };
    }
    if (number === 3) return { tool: 'computer', args: { action: 'key', frameId: 'frame', key: 'tab', stateNote: failedNote } };
    assert.equal(number, 4); assert.ok(wire.includes(failure)); assert.ok(wire.includes(failedNote)); assert.ok(!wire.includes(validNote));
    assert.equal(wire.split(COMPUTER_STATE_NOTE).length - 1, 1); return { text: 'The UI operation failed; the note does not certify delivery or success.' };
  }, { execute: async input => {
    nativeCalls++; assert.ok(typeof input === 'object' && input !== null && 'action' in input);
    assert.ok(!('stateNote' in input)); if (input.action === 'key') throw new Error(failure);
    return { text: 'Observed field 1234.56; unverified.', frameId: 'frame', width: 1, height: 1, image: { base64: png, mimeType: 'image/png' } };
  }, stop: async () => {}, dispose: async () => {} }, () => 2);
  await f.makeAdapter().run('Use only synthetic UI observations.', 'openai/gpt-6.1-sol');
  await until(() => f.events.some(event => event.type === 'completed'), () => ({ events: f.events, errors: f.errors }));
  assert.deepEqual(f.errors, []); assert.equal(f.requests.length, 4); assert.equal(nativeCalls, 2);
});

test('a failed model request advances the retention clock without launching summary or automatic recovery requests', { timeout: 30000 }, async t => {
  const f = await fixture(t, number => number === 1 ? { tool: 'computer', args: { action: 'screenshot', stateNote: 'The UI observation remains unverified.' } } : { failure: 'Synthetic provider failure' },
    { execute: async () => ({ text: 'Unverified', frameId: 'frame', width: 1, height: 1, image: { base64: png, mimeType: 'image/png' } }), stop: async () => {}, dispose: async () => {} });
  await f.makeAdapter().run('Inspect the synthetic UI.', 'openai/gpt-6.1-sol');
  await until(() => f.events.some(event => event.type === 'completed'), () => f.events);
  assert.deepEqual(f.events.filter(event => event.type === 'completed').map(event => event.status), ['failed']);
  await delay(20); assert.equal(f.requests.length, 2); assert.deepEqual(f.errors, []);
});

test('Stop during a pending fake desktop operation sends no extra model or summary requests', { timeout: 30000 }, async t => {
  const entered = deferred<void>(), release = deferred<void>(); let signal: AbortSignal | undefined;
  const f = await fixture(t, () => ({ tool: 'computer', args: { action: 'screenshot', stateNote: 'Pending UI operation; result is unverified.' } }), { execute: async (_input, abort) => {
    signal = abort; entered.resolve(); await release.promise; return { text: 'Unverified', frameId: 'frame', width: 1, height: 1, image: { base64: png, mimeType: 'image/png' } };
  }, stop: async () => { if (signal) await release.promise; }, dispose: async () => {} });
  const adapter = f.makeAdapter(); await adapter.run('Inspect the synthetic UI.', 'openai/gpt-6.1-sol'); await entered.promise;
  const stopping = adapter.stop(); await delay(5); assert.equal(signal?.aborted, true); release.resolve(); await stopping;
  await delay(20); assert.equal(f.requests.length, 1); assert.deepEqual(f.events.filter(event => event.type === 'completed').map(event => event.status), ['interrupted']);
});
