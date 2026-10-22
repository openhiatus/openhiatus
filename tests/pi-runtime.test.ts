import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type ServerResponse } from 'node:http';
import { mkdtemp, readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { ProviderStore, ModelClient } from '../src/main/providers.js';
import { PiAdapter } from '../src/main/pi.js';
import { createToolRegistry, defineTool } from '../src/main/modules/tools';
import { createComputerToolContribution } from '../src/main/platform/tools';
import { PacketReader, agentEnvironment, type AgentTransport, type TransportCallbacks } from '../src/main/agent-protocol.js';
import { imageContent, resourceOptions } from '../src/main/agent-host.js';
import { fakeCommandRequest, fakeHostPacket } from './support/agent-transport.js';
import type { AgentEvent, DynamicFunctionTool, DynamicToolResponse } from '../src/shared/contracts.js';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nKwAAAAASUVORK5CYII=';
async function buildTemporaryHost(t: { after(callback: () => Promise<void>): void }): Promise<string> {
  const root = resolve('.test-data'); await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, 'pi-host-')), entry = join(directory, 'agent-host.mjs');
  await build({ entryPoints: ['src/main/agent-host.ts'], bundle: true, format: 'esm', platform: 'node', target: 'node24', packages: 'external', outfile: entry });
  t.after(async () => {
    assert.equal(dirname(directory), root); assert.ok(basename(directory).startsWith('pi-host-'));
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  return entry;
}
function credentialStore() { const values = new Map<string, string>(); return { get: (key: string) => values.get(key), set: (key: string, value: string) => { values.set(key, value); }, remove: (key: string) => { values.delete(key); } }; }
function dialogToolset(port: { tools: DynamicFunctionTool[]; call(name: string, args: unknown, signal: AbortSignal): Promise<DynamicToolResponse> }) {
  return createToolRegistry([{ bind: () => ({ tools: port.tools.map(definition => defineTool({ definition, audience: 'dialog', validate: value => value,
    execute: (args, context) => port.call(definition.name, args, context.signal) })) }) }]);
}

test('provider credentials stay outside metadata; local models need no key; secrets are redacted', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'openhiatus-provider-'));
  const credentials = credentialStore(); const providers = new ProviderStore(dir, credentials);
  await providers.save({ id: 'openai', apiKey: 'secret-provider-key', models: ['gpt-5.4'] });
  assert.equal(providers.resolve('openai/gpt-5.4').apiKey, 'secret-provider-key');
  assert.ok(!(await readFile(join(dir, 'providers.json'), 'utf8')).includes('secret-provider-key'));
  assert.ok(!JSON.stringify(providers.list()).includes('secret-provider-key'));
  await providers.save({ id: 'local', baseUrl: 'http://127.0.0.1:1234/v1', models: ['test'] });
  assert.equal(providers.resolve('local/test').apiKey, 'openhiatus-local');
  await assert.rejects(providers.save({ id: 'local', baseUrl: 'https://user:password@example.com', models: ['test'] }));
  await assert.rejects(providers.save({ id: '__proto__', apiKey: 'bad' }));
  await assert.rejects(providers.remove('constructor'));
  await providers.remove('openai'); assert.equal(credentials.get('provider:openai'), undefined);
});

test('host framing, environment and resource loader isolate globals, preserve PNG image content', () => {
  const env = agentEnvironment('C:\\openhiatus', { PATH: 'test', OPENAI_API_KEY: 'inherited', ANTHROPIC_API_KEY: 'inherited', NODE_OPTIONS: '--import evil', PI_CODING_AGENT_DIR: 'other',
    OPENHIATUS_PROCESS_HOST: 'ambient-host.exe', OPENHIATUS_AGENT_SESSIONS_DIR: 'ambient-directory', OPENHIATUS_HANDOFF_JOB: 'ambient-job' });
  assert.equal(env.OPENAI_API_KEY, undefined); assert.equal(env.NODE_OPTIONS, undefined); assert.equal(env.PI_CODING_AGENT_DIR, 'C:\\openhiatus');
  assert.equal(env.OPENHIATUS_PROCESS_HOST, undefined); assert.equal(env.OPENHIATUS_AGENT_SESSIONS_DIR, undefined); assert.equal(env.OPENHIATUS_HANDOFF_JOB, undefined);
  assert.equal(env.ELECTRON_RUN_AS_NODE, '1');
  const largePath = agentEnvironment('home', { Path: Array.from({ length: 500 }, (_, index) => `C:\\Temp\\dotnet-${index}`).join(';'), PATH: 'C:\\Windows\\System32;C:\\Windows\\System32;C:\\Program Files\\nodejs' });
  assert.ok((largePath.PATH?.length ?? 0) <= 6000); assert.equal(largePath.Path, undefined);
  assert.ok(largePath.PATH?.includes('C:\\Program Files\\nodejs'));
  const packets: unknown[] = [], reader = new PacketReader();
  const bytes = Buffer.from('{"method":"hi","params":"Präzise Grüße"}\n');
  reader.push(bytes.subarray(0, 34), packet => packets.push(packet)); reader.push(bytes.subarray(34), packet => packets.push(packet));
  assert.deepEqual(packets, [{ method: 'hi', params: 'Präzise Grüße' }]);
  assert.throws(() => reader.push(Buffer.from('[]\n'), () => {}));
  const resources = resourceOptions({ workspace: 'work', home: 'home', instructions: 'openhiatus' });
  assert.equal(resources.noExtensions, true); assert.equal(resources.noSkills, true); assert.equal(resources.noContextFiles, true);
  const result = imageContent({ success: true, contentItems: [{ type: 'inputText', text: 'metadata' }, { type: 'inputImage', imageUrl: `data:image/png;base64,${png}` }] });
  assert.equal(result.content[1].type, 'image'); assert.equal(result.content[1].data, png);
  assert.throws(() => imageContent({ success: true, contentItems: [{ type: 'inputImage', imageUrl: 'file:///private.png' }] }));
});

test('an unreadable provider key cannot prevent startup or hide other usable providers', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'openhiatus-provider-crypto-'));
  const providers = new ProviderStore(directory, { get: name => { if (name === 'provider:openai') throw new Error('corrupted-private-ciphertext'); return name === 'provider:google' ? 'readable-key' : undefined; }, set: () => {}, remove: () => {} });
  const view = providers.list().find(provider => provider.id === 'openai')!;
  assert.equal(view.configured, false); assert.equal(view.verified, false); assert.match(view.error ?? '', /entschlüsselt/);
  assert.ok(!JSON.stringify(providers.list()).includes('corrupted-private-ciphertext'));
  assert.deepEqual(providers.secrets(), ['readable-key']);
  assert.throws(() => providers.resolve('openai/gpt-5.4'), /entschlüsselt/);
  assert.equal(providers.resolve('google/gemini-2.5-flash').apiKey, 'readable-key');
});

test('adapter routes run-bound steering, rejects foreign tool calls, drops stale events and aborts pending callbacks on stop', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'openhiatus-protocol-'));
  const providers = new ProviderStore(directory, credentialStore());
  await providers.save({ id: 'local', models: ['openhiatus-test'] });
  const events: AgentEvent[] = [], sent: { method: string; params: any }[] = [], replies: any[] = [];
  let callbacks!: TransportCallbacks, terminated = false, input: any, signal: AbortSignal | undefined;
  const transport: AgentTransport = {
    request: fakeCommandRequest(request => { const { method, params } = request; sent.push({ method, params }); if (method === 'hello') return { protocol: 1 }; if (method === 'run') input = params; return { accepted: true }; }),
    notify: () => {}, respond: (request, result) => { replies.push({ id: request.id, result }); }, managedProcessCount: async () => 0,
    terminate: async () => { terminated = true; callbacks.closed(true); },
  };
  const adapter = new PiAdapter({ executable: 'electron.exe', processHost: 'host.exe', hostEntry: 'agent.mjs', home: directory, workspace: directory, providers,
    onEvent: event => events.push(event), role: 'dialog', tools: dialogToolset({ tools: [{ type: 'function', name: 'status_task', description: 'status', inputSchema: { type: 'object' } }],
      call: async (_name, _args, nextSignal) => { signal = nextSignal; return await new Promise((_resolve, reject) => nextSignal.addEventListener('abort', () => reject(new Error('stopped')), { once: true })); } }),
  }, { connect: (next, hostOptions) => { assert.equal(hostOptions.allowHandoff, false, 'The dialog has no independent-launch capability.'); callbacks = next; return transport; } });
  await adapter.run('Hallo.', 'local/openhiatus-test');
  callbacks.packet({ method: 'event', params: { runId: input.runId, event: { type: 'started', threadId: 'thread', turnId: input.runId } } });
  callbacks.packet({ method: 'event', params: { runId: 'stale', event: { type: 'delta', text: 'foreign' } } });
  assert.ok(!events.some(event => event.type === 'delta'));
  await assert.rejects(adapter.run('another', 'local/openhiatus-test'));
  await assert.rejects(adapter.steer('change', 'stale'));
  await adapter.steer('change', input.runId); assert.equal(sent.at(-1)?.params.runId, input.runId);
  callbacks.packet({ id: 'bad-tool', method: 'tool', params: { runId: input.runId, toolCallId: 'bad', name: 'powershell', args: { command: 'evil' } } });
  assert.equal(replies.at(-1).result.success, false);
  callbacks.packet({ id: 'pending-tool', method: 'tool', params: { runId: input.runId, toolCallId: 'pending', name: 'status_task', args: {} } });
  assert.ok(signal); await adapter.stop(); assert.ok(signal.aborted); assert.ok(terminated);
  await new Promise(resolveTick => setImmediate(resolveTick));
  assert.equal(replies.length, 1); assert.ok(events.some(event => event.type === 'completed' && event.status === 'interrupted'));
  assert.equal(await adapter.hasManagedWork(), false); await adapter.dispose();
});

test('ChatGPT access requests stay bound to their run and model; stop cancels renewal and discards late results', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'openhiatus-oauth-host-'));
  const providers = new ProviderStore(directory, credentialStore());
  let resolves = 0, pendingSignal: AbortSignal | undefined, finish: ((value: any) => void) | undefined;
  const descriptor = { provider: 'openai', modelId: 'test', baseUrl: 'https://api.openai.com/v1', api: 'openai-responses', authType: 'chatgpt' as const };
  providers.resolveForRun = async (selection, signal) => {
    assert.equal(selection, 'chatgpt/test'); resolves++;
    if (resolves === 4) { pendingSignal = signal; return await new Promise(resolveResult => { finish = resolveResult; }); }
    return { ...descriptor, apiKey: `access-${resolves}`, ...(resolves === 3 ? { baseUrl: 'https://wrong.example/v1' } : {}) };
  };
  const replies: any[] = [];
  let callbacks!: TransportCallbacks, input: any;
  const transport: AgentTransport = {
    request: fakeCommandRequest(request => { if (request.method === 'hello') return { protocol: 1 }; if (request.method === 'run') input = request.params; return { accepted: true }; }),
    notify: () => {}, respond: (request, result) => { replies.push({ id: request.id, result }); }, managedProcessCount: async () => 0,
    terminate: async () => { callbacks.closed(true); },
  };
  const adapter = new PiAdapter({ executable: 'electron.exe', processHost: 'host.exe', hostEntry: 'agent.mjs', home: directory, workspace: directory, providers, onEvent: () => {} },
    { connect: (next, hostOptions) => { assert.equal(hostOptions.allowHandoff, true, 'Only a worker can explicitly hand over an independent window.'); callbacks = next; return transport; } });
  await adapter.run('Test', 'chatgpt/test');
  assert.equal(input.model.apiKey, '');
  callbacks.packet({ id: 'stale', method: 'credential', params: { runId: 'old' } });
  assert.equal(resolves, 1);
  callbacks.packet(fakeHostPacket({ id: 'current', method: 'credential', params: { runId: input.runId, selection: 'attacker/model' } }));
  await new Promise(resolveTick => setImmediate(resolveTick));
  assert.deepEqual(replies.pop(), { id: 'current', result: { apiKey: 'access-2' } });
  callbacks.packet({ id: 'changed', method: 'credential', params: { runId: input.runId } });
  await new Promise(resolveTick => setImmediate(resolveTick));
  assert.match(replies.pop()?.result.error, /Modellverbindung/);
  callbacks.packet({ id: 'pending', method: 'credential', params: { runId: input.runId } });
  assert.ok(pendingSignal); await adapter.stop(); assert.ok(pendingSignal.aborted);
  finish!({ ...descriptor, apiKey: 'late-secret' });
  await new Promise(resolveTick => setImmediate(resolveTick));
  assert.deepEqual(replies, []); await adapter.dispose();
});

test('real Pi worker explicitly hands off an independent synthetic window; Stop kills its normal Start-Process child', { skip: process.platform !== 'win32', timeout: 60_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'openhiatus-pi-handoff-'));
  const project = join(directory, 'Projekt mit Umlauten äöü'); await mkdir(project, { recursive: true });
  const host = join(directory, 'openhiatus-process-host.exe'), synthetic = join(directory, 'Synthetic-Window.exe');
  const managedMarker = join(project, 'managed.txt'), independentMarker = join(project, 'independent.txt'), metadata = join(project, 'handoff-environment.json');
  const compiler = join(process.env.WINDIR ?? 'C:\\Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  const source = join(directory, 'Synthetic-Window.cs');
  await writeFile(source, 'using System; using System.IO; using System.Diagnostics; using System.Threading; internal static class SyntheticWindow { static int Main(string[] args) { File.WriteAllText(args[0], Process.GetCurrentProcess().Id.ToString()); while (true) Thread.Sleep(100); } }', 'utf8');
  execFileSync(compiler, ['/nologo', '/target:exe', `/out:${host}`, resolve('src/main/openhiatus-process-host.cs')], { windowsHide: true });
  execFileSync(compiler, ['/nologo', '/target:exe', `/out:${synthetic}`, source], { windowsHide: true });
  const hostEntry = await buildTemporaryHost(t);
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const command = [
    '$ErrorActionPreference = "Stop"',
    'if (-not [IO.Path]::IsPathRooted($env:OPENHIATUS_PROCESS_HOST)) { throw "Missing absolute process host" }',
    'if (-not [IO.Path]::IsPathRooted($env:OPENHIATUS_AGENT_SESSIONS_DIR)) { throw "Missing session directory" }',
    'if (-not (Test-Path -LiteralPath $env:OPENHIATUS_AGENT_SESSIONS_DIR -PathType Container)) { throw "Session directory does not exist" }',
    `[IO.File]::WriteAllText(${quote(metadata)}, (@{host=$env:OPENHIATUS_PROCESS_HOST;sessions=$env:OPENHIATUS_AGENT_SESSIONS_DIR;job=$env:OPENHIATUS_HANDOFF_JOB;cwd=(Get-Location).Path} | ConvertTo-Json), [Text.UTF8Encoding]::new($false))`,
    `$managed = Start-Process -FilePath ${quote(synthetic)} -ArgumentList ${quote(`"${managedMarker}"`)} -PassThru -WindowStyle Hidden`,
    `& $env:OPENHIATUS_PROCESS_HOST --launch-independent --hidden -- ${quote(synthetic)} ${quote(independentMarker)}`,
    'if ($LASTEXITCODE -ne 0) { throw "Explicit handoff failed" }',
    '$readyDeadline = [DateTime]::UtcNow.AddSeconds(10)',
    `while (-not ((Test-Path -LiteralPath ${quote(managedMarker)} -PathType Leaf) -and (Test-Path -LiteralPath ${quote(independentMarker)} -PathType Leaf))) { if ([DateTime]::UtcNow -ge $readyDeadline) { throw "Synthetic process readiness timed out" }; Start-Sleep -Milliseconds 20 }`,
    'Write-Output "OPENHIATUS_HANDOFF_READY"',
  ].join('\n');
  let requests = 0;
  const toolResults: { content: unknown }[] = [];
  const server = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body); requests++;
    assert.ok(payload.tools.some((tool: any) => tool.function.name === 'powershell'));
    toolResults.push(...payload.messages.filter((message: any) => message.role === 'tool'));
    stream(response, requests === 1 ? { tool: { name: 'powershell', args: { command, timeout: 20 } } } : { text: 'Independent window handed over.' });
  });
  await new Promise<void>(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const providers = new ProviderStore(join(directory, 'data'), credentialStore());
  await providers.save({ id: 'local', models: ['handoff-test'], baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1` });
  const events: AgentEvent[] = [], home = join(directory, 'home');
  const runtime = new PiAdapter({ executable: resolve('node_modules/electron/dist/electron.exe'), processHost: host, hostEntry, home,
    workspace: project, providers, onEvent: event => events.push(event) });
  const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const ownPids = new Set<number>();
  t.after(async () => {
    await runtime.dispose().catch(() => {});
    for (const marker of [managedMarker, independentMarker]) if (existsSync(marker)) ownPids.add(Number(await readFile(marker, 'utf8')));
    for (const pid of ownPids) if (Number.isSafeInteger(pid) && pid > 0 && alive(pid)) { try { process.kill(pid); } catch {} }
    server.closeAllConnections(); await new Promise<void>(resolveClose => server.close(() => resolveClose()));
    assert.equal(dirname(resolve(directory)).toLowerCase(), resolve(tmpdir()).toLowerCase()); assert.ok(basename(directory).startsWith('openhiatus-pi-handoff-'));
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  await runtime.run('Open this independent synthetic window; retain it after openhiatus Stop.', 'local/handoff-test');
  const deadline = Date.now() + 30_000;
  while (!events.some(event => event.type === 'completed') && Date.now() < deadline) await new Promise(resolveWait => setTimeout(resolveWait, 20));
  const diagnostics = JSON.stringify({ events, toolResults });
  assert.equal(toolResults.length, 1, diagnostics);
  assert.match(JSON.stringify(toolResults[0].content), /OPENHIATUS_HANDOFF_READY/, `PowerShell did not confirm a ready handoff: ${diagnostics}`);
  assert.ok(events.some(event => event.type === 'completed' && event.status === 'completed'), diagnostics);
  assert.equal(requests, 2);
  assert.ok(existsSync(independentMarker), diagnostics); assert.ok(existsSync(managedMarker), diagnostics);
  const independentPid = Number(await readFile(independentMarker, 'utf8')), managedPid = Number(await readFile(managedMarker, 'utf8'));
  ownPids.add(independentPid); ownPids.add(managedPid);
  const inherited = JSON.parse(await readFile(metadata, 'utf8'));
  assert.equal(inherited.host, resolve(host)); assert.equal(inherited.sessions, join(resolve(home), 'agent-sessions'));
  assert.match(inherited.job, /^Local\\openhiatusWork-/); assert.equal(inherited.cwd, project);
  assert.ok(alive(independentPid)); assert.ok(alive(managedPid)); assert.equal(await runtime.hasManagedWork(), true);
  await runtime.stop();
  assert.equal(alive(managedPid), false, 'An ordinary Start-Process remains inside the managed Windows job.');
  assert.equal(alive(independentPid), true, 'Only the explicitly handed-over process outlives openhiatus Stop.');
  assert.equal(await runtime.hasManagedWork(), false);
});

function stream(response: ServerResponse, value: { text?: string; tool?: { name: string; args: unknown } }): void {
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  const chunk = (delta: any, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: 'chatcmpl-test', object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: 'openhiatus-test', choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
  chunk({ role: 'assistant' });
  if (value.tool) { chunk({ tool_calls: [{ index: 0, id: 'call-test', type: 'function', function: { name: value.tool.name, arguments: JSON.stringify(value.tool.args) } }] }); chunk({}, 'tool_calls'); }
  else { chunk({ content: value.text }); chunk({}, 'stop'); }
  response.write(`data: ${JSON.stringify({ id: 'chatcmpl-test', object: 'chat.completion.chunk', created: 1, model: 'openhiatus-test', choices: [], usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 } })}\n\n`);
  response.end('data: [DONE]\n\n');
}

test('real Pi SDK host through Windows Job Object and Electron-as-Node: write, PNG, stream, resume, dialog isolation, direct completion and stop', { skip: process.platform !== 'win32', timeout: 90_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'openhiatus-sdk-'));
  const native = join(directory, 'openhiatus-process-host.exe'), entry = join(directory, 'agent-host.mjs');
  execFileSync(join(process.env.WINDIR ?? 'C:\\Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'), ['/nologo', '/target:exe', `/out:${native}`, resolve('src/main/openhiatus-process-host.cs')], { windowsHide: true });
  // A private bundle inside .test-data resolves installed ESM dependencies without touching dist.
  const hostEntry = await buildTemporaryHost(t);
  const requests: any[] = [];
  let mode: 'worker' | 'dialog' | 'summary' | 'stop' | 'credential' | 'incomplete' | 'responses' = 'worker';
  let accessToken = 'first-managed-access';
  const bearerTokens: string[] = [];
  const server = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk;
    const data = JSON.parse(body); requests.push(data);
    if (mode === 'responses') {
      assert.ok(request.url?.endsWith('/responses')); assert.equal(data.store, false); assert.equal(data.stream, true);
      const item = { id: 'msg_context', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Kontext geprüft.', annotations: [] }] };
      const output = [
        { type: 'response.created', response: { id: 'resp_context', status: 'in_progress', output: [] } },
        { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
        { type: 'response.content_part.added', item_id: item.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
        { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: 'Kontext geprüft.' },
        { type: 'response.output_text.done', item_id: item.id, output_index: 0, content_index: 0, text: 'Kontext geprüft.' },
        { type: 'response.output_item.done', output_index: 0, item },
        { type: 'response.completed', response: { id: 'resp_context', status: 'completed', output: [item], usage: { input_tokens: 1024, output_tokens: 64, total_tokens: 1088 } } },
      ];
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.end(output.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')); return;
    }
    if (mode === 'incomplete') {
      assert.ok(request.url?.endsWith('/responses'));
      assert.equal(data.prompt_cache_key, undefined, 'ChatGPT must not send a session cache key.');
      const item = { type: 'function_call', id: 'fc_incomplete', call_id: 'call_incomplete', name: 'status_task', arguments: '{}' };
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const value of [
        { type: 'response.created', response: { id: 'resp_incomplete', status: 'in_progress', output: [] } },
        { type: 'response.output_item.added', output_index: 0, item: { ...item, arguments: '' } },
        { type: 'response.function_call_arguments.delta', output_index: 0, delta: '{}' },
        { type: 'response.function_call_arguments.done', output_index: 0, arguments: '{}' },
        { type: 'response.output_item.done', output_index: 0, item },
        { type: 'response.incomplete', response: { id: 'resp_incomplete', status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [item] } },
      ]) response.write(`data: ${JSON.stringify(value)}\n\n`);
      response.end(); return;
    }
    if (mode === 'credential') {
      bearerTokens.push(request.headers.authorization ?? '');
      if (bearerTokens.length === 1) {
        accessToken = 'rotated-managed-access';
        stream(response, { tool: { name: 'status_task', args: {} } });
      } else stream(response, { text: 'Renewed access OK' });
      return;
    }
    if (mode === 'summary') {
      assert.equal(data.tools, undefined);
      stream(response, { text: 'Summary OK' }); return;
    }
    if (mode === 'stop') { stream(response, { tool: { name: 'computer', args: { action: 'screenshot' } } }); return; }
    if (mode === 'dialog') {
      assert.deepEqual(data.tools.map((tool: any) => tool.function.name), ['status_task']);
      stream(response, { text: 'Dialog OK' }); return;
    }
    const count = requests.filter(value => value.tools?.some((tool: any) => tool.function.name === 'write')).length;
    if (count === 1) stream(response, { tool: { name: 'write', args: { path: join(directory, 'workspace', 'ergebnis.txt'), content: 'Präzise Grüße' } } });
    else if (count === 2) stream(response, { tool: { name: 'computer', args: { action: 'screenshot' } } });
    else stream(response, { text: count === 3 ? 'Datei und Bild geprüft.' : 'Sitzung fortgesetzt.' });
  });
  await new Promise<void>(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const port = (server.address() as { port: number }).port;
  const providers = new ProviderStore(join(directory, 'data'), credentialStore());
  await providers.save({ id: 'local', baseUrl: `http://127.0.0.1:${port}/v1`, models: ['openhiatus-test'] });
  let events: AgentEvent[] = [], computerCalls = 0, stopped = false;
  let sawComputer: (() => void) | undefined;
  const computer = {
    execute: async (_args: unknown, signal?: AbortSignal) => {
      computerCalls++;
      if (mode === 'stop') { sawComputer?.(); await new Promise<void>((resolveAbort, reject) => { signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }); }); }
      return { text: 'observed', frameId: 'frame-test', width: 1, height: 1, image: { base64: png, mimeType: 'image/png' as const } };
    }, stop: async () => { stopped = true; }, dispose: async () => {},
  };
  const options = { executable: resolve('node_modules/electron/dist/electron.exe'), processHost: native, hostEntry, home: join(directory, 'home'), workspace: join(directory, 'workspace'), providers,
    onEvent: (event: AgentEvent) => events.push(event) };
  const workerOptions = () => ({ ...options, tools: createToolRegistry([createComputerToolContribution({ computer })]) });
  const worker = new PiAdapter(workerOptions());
  const untilCompleted = async () => {
    const start = Date.now();
    while (!events.some(event => event.type === 'completed')) { if (Date.now() - start > 30_000) throw new Error(`No completion: ${JSON.stringify(events)}`); await new Promise(resolveWait => setTimeout(resolveWait, 20)); }
    const event = events.find(event => event.type === 'completed')!;
    assert.equal(event.type === 'completed' && event.status, 'completed', JSON.stringify(event));
  };
  let dialog: PiAdapter | undefined;
  try {
    await worker.start(); await worker.run('Schreibe eine Datei und prüfe das Bildschirmbild.', 'local/openhiatus-test'); await untilCompleted();
    assert.equal(await readFile(join(directory, 'workspace', 'ergebnis.txt'), 'utf8'), 'Präzise Grüße');
    assert.equal(computerCalls, 1); assert.ok(events.some(event => event.type === 'delta'));
    const usage = events.filter(event => event.type === 'usage').at(-1);
    assert.ok(usage?.type === 'usage'); assert.equal(usage.usage.inputTokens, 21); assert.equal(usage.usage.outputTokens, 9); assert.equal(usage.usage.costUsd, undefined);
    assert.ok(JSON.stringify(requests[2].messages).includes(`data:image/png;base64,${png}`));
    const started = events.find(event => event.type === 'started'); assert.ok(started?.type === 'started');
    const workerContext = events.find(event => event.type === 'context'); assert.ok(workerContext?.type === 'context', JSON.stringify(events));
    assert.equal(workerContext.threadId, started.threadId); assert.equal(workerContext.usedTokens, 10); assert.equal(workerContext.windowTokens, 128000);
    assert.ok(events.indexOf(workerContext) < events.findIndex(event => event.type === 'completed'), 'Context must arrive while the run is still active.');
    assert.equal(await worker.hasManagedWork(), false);
    await worker.dispose();
    events = [];
    const resumed = new PiAdapter(workerOptions());
    await resumed.run('Weiter.', 'local/openhiatus-test', started.threadId); await untilCompleted();
    assert.ok(events.some(event => event.type === 'started' && event.threadId === started.threadId));
    assert.ok(events.some(event => event.type === 'context' && event.threadId === started.threadId && event.usedTokens === 10 && event.windowTokens === 128000));
    await resumed.dispose();
    mode = 'summary'; assert.equal(await new ModelClient(providers).complete('Summarize.', 'local/openhiatus-test', new AbortController().signal), 'Summary OK');
    events = []; mode = 'dialog';
    dialog = new PiAdapter({ ...options, role: 'dialog', tools: dialogToolset({ tools: [{ type: 'function', name: 'status_task', description: 'Status', inputSchema: { type: 'object', properties: {} } }], call: async () => ({ success: true, contentItems: [{ type: 'inputText', text: 'idle' }] }) }) });
    await dialog.run('Hallo', 'local/openhiatus-test', undefined, { purpose: 'dialog' }); await untilCompleted();
    const dialogStarted = events.find(event => event.type === 'started'); assert.ok(dialogStarted?.type === 'started');
    assert.ok(events.some(event => event.type === 'context' && event.threadId === dialogStarted.threadId && event.usedTokens === 10 && event.windowTokens === 128000));
    await dialog.dispose(); dialog = undefined;
    mode = 'stop'; events = [];
    const waiting = new PiAdapter(workerOptions());
    const seen = new Promise<void>(resolveSeen => { sawComputer = resolveSeen; });
    await waiting.run('Wait', 'local/openhiatus-test'); await seen; await waiting.stop();
    assert.ok(stopped); assert.ok(events.some(event => event.type === 'completed' && event.status === 'interrupted'));
    assert.equal(await waiting.hasManagedWork(), false); await waiting.dispose();
    mode = 'credential'; events = [];
    const ordinaryResolve = providers.resolveForRun.bind(providers);
    providers.resolveForRun = async (selection, signal) => ({ ...await ordinaryResolve(selection, signal), authType: 'chatgpt', apiKey: accessToken });
    dialog = new PiAdapter({ ...options, role: 'dialog', tools: dialogToolset({ tools: [{ type: 'function', name: 'status_task', description: 'Status', inputSchema: { type: 'object', properties: {} } }],
      call: async () => ({ success: true, contentItems: [{ type: 'inputText', text: 'idle' }] }) }) });
    await dialog.run('Check renewed credentials', 'local/openhiatus-test', undefined, { purpose: 'dialog' }); await untilCompleted();
    assert.deepEqual(bearerTokens, ['Bearer first-managed-access', 'Bearer rotated-managed-access']);
    assert.ok(events.filter(event => event.type === 'usage').every(event => event.type !== 'usage' || event.usage.costUsd === undefined));
    await dialog.dispose(); dialog = undefined;
    mode = 'incomplete'; events = [];
    providers.resolveForRun = async (selection, signal) => ({ ...await ordinaryResolve(selection, signal), api: 'openai-responses', authType: 'chatgpt', apiKey: accessToken });
    let incompleteToolCalls = 0;
    dialog = new PiAdapter({ ...options, role: 'dialog', tools: dialogToolset({ tools: [{ type: 'function', name: 'status_task', description: 'Status', inputSchema: { type: 'object', properties: {} } }],
      call: async () => { incompleteToolCalls++; return { success: true, contentItems: [{ type: 'inputText', text: 'must not run' }] }; } }) });
    await dialog.run('Reject incomplete tool response', 'local/openhiatus-test', undefined, { purpose: 'dialog' });
    const completionDeadline = Date.now() + 30_000;
    while (!events.some(event => event.type === 'completed') && Date.now() < completionDeadline) await new Promise(resolveWait => setTimeout(resolveWait, 20));
    assert.ok(events.some(event => event.type === 'completed' && event.status === 'failed'), JSON.stringify(events));
    assert.equal(incompleteToolCalls, 0, 'Incomplete responses cannot authorize a tool call.');
    await dialog.dispose(); dialog = undefined;
    mode = 'responses'; events = [];
    dialog = new PiAdapter({ ...options, role: 'dialog', tools: dialogToolset({ tools: [], call: async () => { throw new Error('No dialog tool was requested.'); } }) });
    await dialog.run('Check context after a ChatGPT-shaped Responses stream', 'local/openhiatus-test', undefined, { purpose: 'dialog' }); await untilCompleted();
    const responsesStarted = events.find(event => event.type === 'started'); assert.ok(responsesStarted?.type === 'started');
    const responsesContext = events.find(event => event.type === 'context'); assert.ok(responsesContext?.type === 'context', JSON.stringify(events));
    assert.equal(responsesContext.threadId, responsesStarted.threadId); assert.equal(responsesContext.usedTokens, 1088); assert.equal(responsesContext.windowTokens, 128000);
    assert.ok(events.indexOf(responsesContext) < events.findIndex(event => event.type === 'completed'));
    await dialog.dispose(); dialog = undefined;
  } finally { await worker.dispose().catch(() => {}); await dialog?.dispose().catch(() => {}); server.closeAllConnections(); await new Promise<void>(resolveClose => server.close(() => resolveClose())); }
});
