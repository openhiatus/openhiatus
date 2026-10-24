import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { ProviderStore, ModelClient } from '../src/main/providers';
import type { ChatGPTAuth } from '../src/main/chatgpt-auth';
import { PiAdapter } from '../src/main/pi';
import type { HostRun } from '../src/main/agent-protocol';
import { fakeCommandRequest } from './support/agent-transport';
import { baseModelSelection, fastModelSelection, modelSelectionLabel, withFastModelOptions } from '../src/shared/model-selection';

async function setup(t: { after(action: () => Promise<void>): void }) {
  const directory = await mkdtemp(join(tmpdir(), 'openhiatus-fast-selection-'));
  t.after(async () => {
    assert.equal(dirname(resolve(directory)).toLowerCase(), resolve(tmpdir()).toLowerCase());
    assert.ok(basename(directory).startsWith('openhiatus-fast-selection-'));
    await rm(directory, { recursive: true, force: true });
  });
  const keys = new Map<string, string>();
  const credentials = { get: (id: string) => keys.get(id), set: (id: string, value: string) => { keys.set(id, value); }, remove: (id: string) => { keys.delete(id); } };
  const chatgpt = { snapshot: () => ({ planUsage: true }), listModels: () => [{ id: 'chatgpt/gpt-6.1-sol', label: 'gpt-6.1-sol', provider: 'chatgpt' }],
    getAccessToken: async () => 'synthetic-oauth-token', secrets: () => [] } as unknown as ChatGPTAuth;
  const providers = new ProviderStore(directory, credentials, chatgpt);
  await providers.save({ id: 'openai', apiKey: 'synthetic-api-key', models: ['gpt-6.1-sol'] });
  await providers.save({ id: 'local', models: ['gpt-6.1-sol'] });
  return { directory, credentials, chatgpt, providers };
}

test('Fast variants are adjacent, stable, deduplicated and limited to eligible provider selections', () => {
  const models = ['chatgpt/gpt-6.1-sol', 'openai/gpt-6-luna', 'local/gpt-6.1-sol', 'openrouter/gpt-6.1-sol', 'openai/gpt-6-pro', 'openai/other'].map(id => ({ id, label: id }));
  const expanded = withFastModelOptions(models);
  assert.deepEqual(expanded.map(model => model.id), [models[0].id, fastModelSelection(models[0].id), models[1].id, fastModelSelection(models[1].id), ...models.slice(2).map(model => model.id)]);
  assert.equal(expanded[1].label, 'chatgpt/gpt-6.1-sol (fast)');
  assert.deepEqual(withFastModelOptions(expanded), expanded);
  assert.equal(baseModelSelection(expanded[1].id), models[0].id);
  assert.equal(modelSelectionLabel(expanded[1].id), 'chatgpt/gpt-6.1-sol (fast)');
});

test('provider catalog and resolution preserve the base model and credentials; forged Fast selections fail', async t => {
  const f = await setup(t);
  for (const provider of ['openai', 'chatgpt']) {
    const id = `${provider}/gpt-6.1-sol`;
    assert.deepEqual(f.providers.list().find(row => row.id === provider)!.models.map(model => model.id), [id, fastModelSelection(id)]);
    const ordinary = await f.providers.resolveForRun(id), fast = await f.providers.resolveForRun(fastModelSelection(id));
    assert.equal(ordinary.serviceTier, undefined); assert.deepEqual(fast, { ...ordinary, serviceTier: 'fast' });
    assert.equal(fast.modelId, 'gpt-6.1-sol');
  }
  assert.equal(f.providers.resolve('').serviceTier, undefined, 'existing default selection must stay ordinary');
  for (const id of ['local/gpt-6.1-sol::fast', 'openrouter/gpt-6.1-sol::fast', 'chatgpt/missing::fast', 'openai/gpt-6.1-sol::fast::fast']) assert.throws(() => f.providers.resolve(id));
  const restarted = new ProviderStore(f.directory, f.credentials, f.chatgpt);
  assert.equal(restarted.resolve('openai/gpt-6.1-sol::fast').serviceTier, 'fast');
});

test('selected Fast reaches dialog and worker descriptors without changing the remote model ID', async t => {
  const f = await setup(t);
  for (const role of ['dialog', 'worker'] as const) {
    const inputs: HostRun[] = [];
    const adapter = new PiAdapter({ executable: 'unused', processHost: 'unused', hostEntry: 'unused', home: f.directory, workspace: f.directory, providers: f.providers, role, onEvent: () => {} },
      { connect: () => ({ request: fakeCommandRequest(request => { if (request.method === 'run') inputs.push(request.params); return request.method === 'hello' ? { protocol: 1 } : { accepted: true }; }),
        notify: () => {}, respond: () => {}, terminate: async () => {}, managedProcessCount: async () => 0 }) });
    try {
      await adapter.run('Synthetic request', 'chatgpt/gpt-6.1-sol::fast');
      assert.equal(inputs[0].serviceTier, 'fast'); assert.equal(inputs[0].model.modelId, 'gpt-6.1-sol'); assert.equal(inputs[0].model.apiKey, '');
      await adapter.stop();
      await adapter.run('Ordinary request', 'chatgpt/gpt-6.1-sol');
      assert.equal(inputs[1].serviceTier, undefined);
    } finally { await adapter.dispose(); }
  }
});

function response(): Response {
  const item = { id: 'msg_fast', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Synthetic report', annotations: [] }] };
  const events = [
    { type: 'response.created', response: { id: 'resp_fast', status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
    { type: 'response.content_part.added', item_id: item.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
    { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: 'Synthetic report' },
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: 'resp_fast', status: 'completed', service_tier: 'default', output: [item], usage: { input_tokens: 8, output_tokens: 3, total_tokens: 11 } } },
  ];
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
}

test('direct memory requests send priority with the base model for ChatGPT and API; provider rejection never falls back', async t => {
  const f = await setup(t), requests: Record<string, unknown>[] = [];
  let rejected = false;
  const client = new ModelClient(f.providers, { fetch: async (input, init) => {
    const request = new Request(input, init); requests.push(await request.json() as Record<string, unknown>);
    return rejected ? new Response(JSON.stringify({ error: { message: 'Synthetic Fast rejection' } }), { status: 400 }) : response();
  } });
  for (const provider of ['chatgpt', 'openai']) {
    const base = `${provider}/gpt-6.1-sol`;
    assert.equal(await client.complete('Report', fastModelSelection(base), AbortSignal.timeout(10_000)), 'Synthetic report');
    assert.equal(requests.at(-1)!.model, 'gpt-6.1-sol'); assert.equal(requests.at(-1)!.service_tier, 'priority');
    await client.complete('Report', base, AbortSignal.timeout(10_000)); assert.equal(requests.at(-1)!.service_tier, undefined);
  }
  rejected = true;
  await assert.rejects(client.complete('Report', 'chatgpt/gpt-6.1-sol::fast', AbortSignal.timeout(10_000)), /Synthetic Fast rejection/);
  assert.equal(requests.length, 5, 'no retry using a different tier or provider');
});
