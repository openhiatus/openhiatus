import test from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { applyRequestedServiceTier, ModelRequestDiagnostics, safeServiceTier } from '../src/main/model-request-diagnostics';
import { hostToolNames, matchingSessionReference } from '../src/main/agent-host';
import { decodeHostMessage, decodeRun, ProtocolError } from '../src/main/agent-wire';
import type { AgentEvent } from '../src/shared/contracts';

type Diagnostic = Extract<AgentEvent, { type: 'model-request' }>['request'];
const model = { provider: 'openai', api: 'openai-responses' };
const usage = { inputTokens: 11, outputTokens: 3, cacheReadTokens: 7, cacheWriteTokens: 2 };
const tool = (name: string) => ({ type: 'function' as const, name, description: 'Synthetic tool', inputSchema: { type: 'object' } });

test('logical Fast uses compatible priority on the Responses wire and unsupported requests fail visibly', () => {
  const payload = { model: 'gpt-6-luna', stream: true, service_tier: 'auto', reasoning: { effort: 'medium' } };
  assert.equal(applyRequestedServiceTier(payload, model, 'fast'), payload);
  assert.equal(payload.service_tier, 'priority'); assert.deepEqual(payload.reasoning, { effort: 'medium' });
  const ordinary = { service_tier: 'auto' };
  applyRequestedServiceTier(ordinary, model); assert.equal(ordinary.service_tier, 'auto');
  assert.throws(() => applyRequestedServiceTier({}, { ...model, provider: 'local' }, 'fast'), /OpenAI Responses/);
  assert.throws(() => applyRequestedServiceTier({}, { ...model, api: 'openai-completions' }, 'fast'), /OpenAI Responses/);
  assert.throws(() => applyRequestedServiceTier(null, model, 'fast'), /nicht gesetzt/);
});

test('request diagnostics distinguish actual Fast, server downgrade and missing tier without copying provider content', () => {
  let now = 100;
  const diagnostics: Diagnostic[] = [], recorder = new ModelRequestDiagnostics('computer', 'fast', value => diagnostics.push(value), () => now);
  recorder.start('chatgpt/gpt-6-luna'); now = 145;
  recorder.observe({ type: 'response.completed', response: { service_tier: 'priority', secret: 'must-not-copy', output: 'private-screen' } });
  recorder.finish('completed', usage); recorder.finish('failed');
  recorder.start('chatgpt/gpt-6-luna'); now = 170;
  recorder.observe({ type: 'response.completed', response: { service_tier: 'default' } }); recorder.finish('completed');
  recorder.start('chatgpt/gpt-6-luna'); now = 180;
  recorder.observe({ type: 'response.completed', response: { service_tier: 'private-provider-string' } }); recorder.finish('failed');
  assert.deepEqual(diagnostics, [
    { role: 'computer', model: 'chatgpt/gpt-6-luna', requestedServiceTier: 'fast', actualServiceTier: 'priority', elapsedMs: 45, status: 'completed', usage },
    { role: 'computer', model: 'chatgpt/gpt-6-luna', requestedServiceTier: 'fast', actualServiceTier: 'default', elapsedMs: 25, status: 'completed' },
    { role: 'computer', model: 'chatgpt/gpt-6-luna', requestedServiceTier: 'fast', elapsedMs: 10, status: 'failed' },
  ]);
  for (const value of diagnostics) assert.deepEqual(decodeHostMessage({ method: 'event', params: { runId: 'run', event: { type: 'model-request', request: value } } }),
    { method: 'event', params: { runId: 'run', event: { type: 'model-request', request: value } } });
  assert.ok(!JSON.stringify(diagnostics).includes('private'));
  for (const value of [{}, ['fast'], null, 'private-provider-string']) assert.equal(safeServiceTier(value), undefined);
});

test('failed and aborted streams are recorded once, unfinished replacement cannot become a successful request', () => {
  const diagnostics: Diagnostic[] = [], recorder = new ModelRequestDiagnostics('worker', undefined, value => diagnostics.push(value), () => 0);
  recorder.finish('failed'); recorder.start('openai/gpt-6.1-sol'); recorder.start('openai/gpt-6.1-sol');
  recorder.observe({ type: 'response.incomplete', response: { service_tier: 'default' } }); recorder.finish('aborted'); recorder.finish('aborted');
  assert.deepEqual(diagnostics.map(value => value.status), ['failed', 'aborted']);
  assert.ok(diagnostics.every(value => !Object.hasOwn(value, 'requestedServiceTier')));
  recorder.start('openai/gpt-6.1-sol'); recorder.observe({ type: 'response.incomplete', response: { service_tier: 'fast' } }); recorder.finish('completed');
  assert.equal(diagnostics.at(-1)?.status, 'failed', 'An incomplete provider response cannot become a successful diagnostic.');
});

test('diagnostic wire schema rejects malformed status, tier, elapsed time and usage', () => {
  const base = { role: 'computer', model: 'openai/gpt-6-luna', requestedServiceTier: 'fast', actualServiceTier: 'fast', elapsedMs: 4, status: 'completed', usage };
  for (const patch of [{ role: ['computer'] }, { status: ['completed'] }, { actualServiceTier: ['fast'] }, { actualServiceTier: 'secret' }, { requestedServiceTier: 'priority' },
    { elapsedMs: -1 }, { elapsedMs: Infinity }, { usage: { ...usage, cacheReadTokens: -1 } }]) {
    assert.throws(() => decodeHostMessage({ method: 'event', params: { runId: 'run', event: { type: 'model-request', request: { ...base, ...patch } } } }), ProtocolError);
  }
});

test('restricted computer sessions expose only registered tools and cannot resume ordinary worker sessions', () => {
  const directory = resolve('synthetic-home', 'sessions'), workspace = resolve('synthetic-workspace');
  const input = { dialog: false, computerOnly: true, workspace, tools: [tool('computer'), tool('finish_computer_task')] };
  assert.deepEqual(hostToolNames(input), ['computer', 'finish_computer_task']);
  assert.ok(hostToolNames({ ...input, computerOnly: false }).includes('powershell'));
  for (const name of ['read', 'write', 'edit', 'powershell', 'grep', 'find', 'ls']) assert.throws(() => hostToolNames({ ...input, tools: [tool(name)] }));
  assert.throws(() => hostToolNames({ ...input, dialog: true }));
  const reference = { file: join(directory, 'synthetic.jsonl'), dialog: false, workspace, computerOnly: true };
  assert.deepEqual(matchingSessionReference(reference, input, directory), reference);
  assert.equal(matchingSessionReference({ ...reference, computerOnly: undefined }, input, directory), undefined);
  assert.equal(matchingSessionReference({ ...reference, computerOnly: false }, input, directory), undefined);
  assert.equal(matchingSessionReference(reference, { ...input, computerOnly: false }, directory), undefined);
  assert.equal(matchingSessionReference({ ...reference, file: resolve('elsewhere.jsonl') }, input, directory), undefined);
  assert.equal(matchingSessionReference({ ...reference, computerOnly: 'true' }, input, directory), undefined);
  assert.deepEqual(matchingSessionReference({ ...reference, computerOnly: undefined }, { ...input, computerOnly: false }, directory),
    { file: reference.file, dialog: false, workspace });
});

test('host descriptors accept explicit Fast for each role but reject invalid tiers and mixed roles', () => {
  const input = { runId: '00000000-0000-0000-0000-000000000001', text: 'Synthetic UI task', workspace: 'work', home: 'home',
    model: { provider: 'openai', api: 'openai-responses', modelId: 'gpt-6-luna', apiKey: 'synthetic' }, tools: [], instructions: 'Synthetic', dialog: false };
  assert.equal(decodeRun({ ...input, computerOnly: true, serviceTier: 'fast' }).serviceTier, 'fast');
  assert.equal(decodeRun({ ...input, serviceTier: 'fast' }).serviceTier, 'fast');
  assert.equal(decodeRun({ ...input, dialog: true, serviceTier: 'fast' }).serviceTier, 'fast');
  for (const patch of [{ computerOnly: true, dialog: true }, { computerOnly: 'true' }, { computerOnly: true, serviceTier: 'priority' }]) {
    assert.throws(() => decodeRun({ ...input, ...patch }), ProtocolError);
  }
});
