import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { clampThinkingLevel, getSupportedThinkingLevels } from '@earendil-works/pi-ai/compat';
import { ModelClient, ProviderStore, piModel } from '../src/main/providers';
import type { ChatGPTAuth } from '../src/main/chatgpt-auth';
import { DEFAULT_THINKING_LEVEL } from '../src/shared/thinking';

const id = 'gpt-6.1-terra';
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'openhiatus-terra-'));
  const values = new Map<string, string>();
  const credentials = { get: (key: string) => values.get(key), set: (key: string, value: string) => { values.set(key, value); }, remove: (key: string) => { values.delete(key); } };
  let visible = false;
  const chatgpt = { snapshot: () => ({ planUsage: true }), listModels: () => visible ? [{ id: `chatgpt/${id}`, label: 'GPT-6.1 Terra', provider: 'chatgpt' }] : [],
    getAccessToken: async () => 'synthetic-token', secrets: () => [] } as unknown as ChatGPTAuth;
  const providers = new ProviderStore(directory, credentials, chatgpt);
  await providers.save({ id: 'openai', apiKey: 'sk-synthetic-terra-key' });
  return { directory, credentials, providers, exposeChatGPT: () => { visible = true; } };
}

test('Terra is selectable with Fast in the default API catalog, preserving defaults and custom catalogs', async () => {
  const f = await fixture();
  const options = f.providers.list().find(provider => provider.id === 'openai')!.models;
  assert.ok(options.some(model => model.id === `openai/${id}`));
  assert.ok(options.some(model => model.id === `openai/${id}::fast`));
  assert.equal(f.providers.resolve('').modelId, 'gpt-5.4');
  assert.equal(DEFAULT_THINKING_LEVEL, 'medium');
  assert.equal(f.providers.resolve(`openai/${id}`).api, 'openai-responses');
  assert.equal(f.providers.resolve(`openai/${id}::fast`).modelId, id);
  await f.providers.save({ id: 'openai', models: ['gpt-5.4'] });
  assert.throws(() => f.providers.resolve(`openai/${id}`), /nicht eingerichtet/);
  const restarted = new ProviderStore(f.directory, f.credentials);
  assert.deepEqual(restarted.list().find(provider => provider.id === 'openai')!.models.map(model => model.id), ['openai/gpt-5.4', 'openai/gpt-5.4::fast']);
});

test('Terra metadata preserves thinking, vision and context limits without granting ChatGPT access', async () => {
  const f = await fixture();
  assert.throws(() => f.providers.resolve(`chatgpt/${id}`), /nicht verfügbar/);
  f.exposeChatGPT();
  const model = await piModel(f.providers.resolve(`openai/${id}`));
  assert.equal(model.reasoning, true); assert.deepEqual(model.input, ['text', 'image']);
  assert.equal(model.contextWindow, 1_050_000); assert.equal(model.maxTokens, 128_000);
  assert.deepEqual(getSupportedThinkingLevels(model), ['off', 'low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(clampThinkingLevel(model, 'minimal'), 'low');
  const subscription = await piModel(await f.providers.resolveForRun(`chatgpt/${id}`));
  assert.equal(subscription.api, 'openai-responses'); assert.equal(subscription.reasoning, true);
  assert.deepEqual(subscription.cost, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  const local = await piModel({ provider: 'local', modelId: id, api: 'openai-completions', apiKey: 'synthetic', baseUrl: 'http://localhost:11434/v1' });
  assert.equal(local.reasoning, false, 'a matching custom-provider name must not acquire OpenAI metadata');
});

test('Terra memory requests transmit every supported effort and Fast for both account types', async () => {
  const f = await fixture(); f.exposeChatGPT();
  const requests: any[] = [];
  const client = new ModelClient(f.providers, { fetch: async (input, init) => {
    const request = new Request(input, init); assert.equal(request.url, 'https://api.openai.com/v1/responses');
    requests.push(await request.json());
    const events = [
      { type: 'response.created', response: { id: 'resp_terra', status: 'in_progress', output: [] } },
      { type: 'response.completed', response: { id: 'resp_terra', status: 'completed', output: [], usage: { input_tokens: 1, output_tokens: 0, total_tokens: 1 } } },
    ];
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
  } });
  for (const provider of ['openai', 'chatgpt']) for (const level of ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const) for (const fast of [false, true]) {
    await client.complete('Synthetic report', `${provider}/${id}${fast ? '::fast' : ''}`, AbortSignal.timeout(10000), undefined, level);
    const payload = requests.at(-1);
    assert.equal(payload.model, id);
    assert.equal(payload.reasoning?.effort, level === 'off' ? 'none' : level === 'minimal' ? 'low' : level);
    assert.equal(payload.service_tier, fast ? 'priority' : undefined);
    assert.ok(!payload.tools?.length);
  }
});
