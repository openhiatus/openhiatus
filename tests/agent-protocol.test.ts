import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { AgentHost } from '../src/main/agent-host';
import { PiAdapter } from '../src/main/pi';
import { ProviderStore } from '../src/main/providers';
import { createToolRegistry, defineTool } from '../src/main/modules/tools';
import { ProcessTransport, PacketReader, MAX_PACKET_BYTES, decodeCommandResult, decodeHostMessage, decodeParentMessage, decodeHostResult,
  decodeRun, ProtocolError, type AgentTransport, type HostRun, type HostToParent, type HostRequest } from '../src/main/agent-protocol';
import type { AgentEvent } from '../src/shared/contracts';

const run = (): HostRun => ({ runId: randomUUID(), text: 'Synthetic request', workspace: 'C:\\synthetic-workspace', home: 'C:\\synthetic-home', dialog: true,
  model: { provider: 'local', modelId: 'synthetic', apiKey: 'synthetic-key', api: 'openai-completions', baseUrl: 'http://127.0.0.1:1234/v1' },
  instructions: 'Synthetic instructions', tools: [{ type: 'function', name: 'synthetic', description: 'Synthetic tool', inputSchema: { type: 'object' } }] });
const eventPacket = (event: unknown) => ({ method: 'event', params: { runId: 'current-run', event } });

// Compile-time checks exercise the correlated API as well as the runtime decoders below.
function commandTypes(transport: AgentTransport, tool: HostRequest<'tool'>, credential: HostRequest<'credential'>): void {
  if (false) {
    const hello: Promise<{ protocol: 1 }> = transport.request('hello'); void hello;
    const accepted: Promise<{ accepted: true }> = transport.request('run', run()); void accepted;
    // @ts-expect-error run requires the full run descriptor.
    void transport.request('run', { text: 'Missing model' });
    // @ts-expect-error steer does not accept an abort parameter shape.
    void transport.request('steer', {});
    // @ts-expect-error method and result cannot be mixed across tool and credential calls.
    transport.respond(tool, { apiKey: 'wrong-result' });
    // @ts-expect-error a credential reply must not masquerade as a successful tool result.
    transport.respond(credential, { success: true, contentItems: [] });
  }
}
void commandTypes;

test('wire decoders preserve method/parameter/result correlation and keep tool arguments unknown', () => {
  const input = run();
  assert.deepEqual(decodeParentMessage({ id: 'run-1', method: 'run', params: input }), { id: 'run-1', method: 'run', params: input });
  assert.deepEqual(decodeCommandResult('hello', { protocol: 1 }), { protocol: 1 });
  assert.throws(() => decodeCommandResult('hello', { accepted: true }), ProtocolError);
  assert.throws(() => decodeCommandResult('abort', { accepted: true }), ProtocolError);
  const args = ['A tool contribution validates this value', null, 42];
  const request = decodeHostMessage({ id: 'tool-1', method: 'tool', params: { runId: input.runId, toolCallId: 'call-1', name: 'synthetic', args } });
  assert.ok(request.method === 'tool'); assert.equal(request.params.args, args);
  assert.deepEqual(decodeHostResult('credential', { apiKey: 'fresh-token' }), { apiKey: 'fresh-token' });
  assert.deepEqual(decodeHostResult('tool', { success: false, contentItems: [{ type: 'inputText', text: 'declined' }] }), { success: false, contentItems: [{ type: 'inputText', text: 'declined' }] });
  assert.throws(() => decodeHostResult('credential', { success: true, contentItems: [] }), ProtocolError);
  assert.throws(() => decodeHostResult('tool', { apiKey: 'wrong-result' }), ProtocolError);
  assert.throws(() => decodeHostResult('credential', { apiKey: 'ambiguous', error: 'failure' }), ProtocolError);
});

test('invalid command descriptors are rejected before a host can create a session or start SDK work', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'openhiatus-invalid-host-'));
  const home = join(directory, 'must-not-be-created'), workspace = join(directory, 'must-not-be-opened');
  const packets: HostToParent[] = [], host = new AgentHost(packet => packets.push(packet));
  const invalid = [
    { ...run(), model: { ...run().model, provider: 7 } }, { ...run(), dialog: 'yes' }, { ...run(), tools: [null] },
    { ...run(), tools: new Array(1) }, { ...run(), tools: [{ ...run().tools[0], inputSchema: [] }] },
    { ...run(), model: { ...run().model, apiKey: '' } }, { ...run(), threadId: '../outside' }, { ...run(), text: 'x'.repeat(1_000_001) },
  ];
  try {
    for (const params of invalid) await assert.rejects(host.receive({ id: 'invalid', method: 'run', params: { ...params, home, workspace } }), ProtocolError);
    assert.deepEqual(packets, []); await assert.rejects(stat(home)); await assert.rejects(stat(workspace));
  } finally { await host.abort(); await rm(directory, { recursive: true, force: true }); }
});

test('host events and callback envelopes reject malformed, ambiguous and false-success messages', () => {
  for (const value of [
    eventPacket({ type: 'completed', status: 'completed', error: 'Operation failed' }),
    eventPacket({ type: 'completed', status: 'completed', error: '' }), eventPacket({ type: 'completed', status: 'other' }),
    eventPacket({ type: 'started', threadId: 7, turnId: 'turn' }), eventPacket({ type: 'connection', status: 'ready' }),
    eventPacket({ type: 'context', threadId: 'thread', usedTokens: -1 }),
    eventPacket({ type: 'usage', usage: { inputTokens: 1, outputTokens: Number.NaN, cacheReadTokens: 0, cacheWriteTokens: 0 } }),
    { id: 'tool', method: 'tool', params: { runId: 'run', toolCallId: 'call', name: 7, args: {} } },
    { id: 'credential', method: 'credential', params: { runId: null } },
    { id: 'ambiguous', method: 'credential', params: { runId: 'run' }, result: { apiKey: 'unexpected' } },
    { id: 'reply', error: 'error', result: { protocol: 1 } }, { id: '', result: { protocol: 1 } },
  ]) assert.throws(() => decodeHostMessage(value), ProtocolError);
  assert.throws(() => decodeHostResult('tool', { success: true, contentItems: new Array(1) }), ProtocolError);
  assert.throws(() => decodeHostResult('tool', { success: true, contentItems: [{ type: 'inputText', text: 'x'.repeat(2_000_001) }] }), ProtocolError);
  assert.throws(() => decodeHostResult('credential', { apiKey: 'x'.repeat(32_001) }), ProtocolError);
  assert.throws(() => decodeHostResult('credential', { apiKey: 'token\nline' }), ProtocolError);
});

test('full-size native image content keeps the existing 56-million-character base64 limit', () => {
  const base64 = 'A'.repeat(56_000_000), imageUrl = `data:image/png;base64,${base64}`;
  const decoded = decodeHostResult('tool', { success: true, contentItems: [{ type: 'inputImage', imageUrl }] });
  assert.equal(decoded.contentItems[0].type, 'inputImage');
  assert.throws(() => decodeHostResult('tool', { success: true, contentItems: [{ type: 'inputImage', imageUrl: imageUrl + 'AAAA' }] }), ProtocolError);
});

test('bounded framing preserves split UTF-8 and rejects invalid JSON values before dispatch', () => {
  const reader = new PacketReader(), packets: unknown[] = [];
  const input = Buffer.from(JSON.stringify({ id: 'hello', method: 'hello', params: { text: 'Präzise Grüße' } }) + '\r\n');
  for (const byte of input) reader.push(Buffer.from([byte]), packet => packets.push(packet));
  assert.equal(packets.length, 1); assert.deepEqual(decodeParentMessage(packets[0]), { id: 'hello', method: 'hello', params: {} });
  for (const invalid of ['null\n', '[]\n', '"string"\n', '{invalid}\n']) assert.throws(() => new PacketReader().push(Buffer.from(invalid), () => assert.fail('Malformed frame reached dispatch')));
  assert.throws(() => new PacketReader().push(Buffer.alloc(MAX_PACKET_BYTES + 1), () => assert.fail('Oversized frame reached dispatch')));
});

test('real transport rejects a malformed completion before success, tools or credential renewal can escape', { skip: process.platform !== 'win32', timeout: 20_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'openhiatus-wire-boundary-'));
  const native = join(directory, 'openhiatus-process-host.exe'), entry = join(directory, 'synthetic-host.mjs');
  execFileSync(join(process.env.WINDIR ?? 'C:\\Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'), ['/nologo', '/target:exe', `/out:${native}`, resolve('src/main/openhiatus-process-host.cs')], { windowsHide: true });
  await writeFile(entry, `import {createInterface} from 'node:readline';const send=p=>process.stdout.write(JSON.stringify(p)+'\\n');createInterface({input:process.stdin}).on('line',line=>{const p=JSON.parse(line);if(p.method==='hello')send({id:p.id,result:{protocol:1}});if(p.method==='run'){send({id:p.id,result:{accepted:true}});send({method:'event',params:{runId:p.params.runId,event:{type:'completed',status:'completed',error:'failed-work'}}});send({method:'tool',id:'must-not-run',params:{runId:p.params.runId,toolCallId:'must-not-run',name:'synthetic',args:{}}});send({method:'credential',id:'must-not-renew',params:{runId:p.params.runId}});send({method:'event',params:{runId:p.params.runId,event:{type:'completed',status:'completed'}}});}});`, 'utf8');
  const providers = new ProviderStore(directory, { get: () => undefined, set: () => {}, remove: () => {} }); await providers.save({ id: 'local', models: ['synthetic'] });
  let credentials = 0, toolCalls = 0; const original = providers.resolveForRun.bind(providers);
  providers.resolveForRun = async (model, signal) => { credentials++; return original(model, signal); };
  const events: AgentEvent[] = [];
  const runtime = new PiAdapter({ executable: process.execPath, processHost: native, hostEntry: entry, home: directory, workspace: directory, providers,
    tools: createToolRegistry([{ bind: () => ({ tools: [defineTool({ definition: run().tools[0], validate: value => value, execute: async () => { toolCalls++; return { success: true, contentItems: [] }; } })] }) }]),
    onEvent: event => events.push(event) });
  t.after(async () => { await runtime.dispose(); assert.equal(dirname(directory).toLowerCase(), resolve(tmpdir()).toLowerCase()); assert.ok(basename(directory).startsWith('openhiatus-wire-boundary-')); await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
  await runtime.run('Synthetic boundary check', 'local/synthetic');
  const deadline = Date.now() + 8000;
  while (!events.some(event => event.type === 'completed') && Date.now() < deadline) await new Promise(done => setTimeout(done, 10));
  assert.equal(events.some(event => event.type === 'completed' && event.status === 'completed'), false);
  assert.equal(events.some(event => event.type === 'completed' && event.status === 'failed'), true, JSON.stringify(events));
  assert.equal(toolCalls, 0); assert.equal(credentials, 1);
});
