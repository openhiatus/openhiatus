import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ModelClient, ProviderStore } from '../src/main/providers.js';

function events(terminal: 'completed' | 'incomplete' | 'failed' | 'interrupted'): Response {
  const item = { id: 'msg_test', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Test answer', annotations: [] }] };
  const output: unknown[] = [
    { type: 'response.created', response: { id: 'resp_test', status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } },
    { type: 'response.content_part.added', item_id: item.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
    { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: 'Test answer' },
    { type: 'response.output_text.done', item_id: item.id, output_index: 0, content_index: 0, text: 'Test answer' },
    { type: 'response.output_item.done', output_index: 0, item },
  ];
  if (terminal !== 'interrupted') output.push({ type: `response.${terminal}`, response: { id: 'resp_test', status: terminal, output: [item],
    usage: { input_tokens: 8, output_tokens: 3, total_tokens: 11 },
    ...(terminal === 'incomplete' ? { incomplete_details: { reason: 'max_output_tokens' } } : {}),
    ...(terminal === 'failed' ? { error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'Plan usage limit reached' } } : {}),
  } });
  return new Response(output.map(value => `data: ${JSON.stringify(value)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
}

test('ChatGPT inference uses public Responses, bearer auth, stream true, store false and rejects every unfinished response', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'openhiatus-chatgpt-inference-'));
  const providers = new ProviderStore(directory, { get: () => undefined, set: () => {}, remove: () => {} });
  providers.resolveForRun = async () => ({ provider: 'openai', modelId: 'account-model', apiKey: 'oauth-test-access', api: 'openai-responses',
    baseUrl: 'https://api.openai.com/v1', authType: 'chatgpt' });
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let terminal: 'completed' | 'incomplete' | 'failed' | 'interrupted' = 'completed', calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    const request = new Request(input, init);
    assert.equal(request.url, 'https://api.openai.com/v1/responses'); assert.equal(request.method, 'POST');
    assert.equal(request.headers.get('authorization'), 'Bearer oauth-test-access');
    const body = await request.json() as Record<string, unknown>;
    assert.equal(body.model, 'account-model'); assert.equal(body.stream, true); assert.equal(body.store, false);
    for (const unsupported of ['temperature', 'max_output_tokens', 'prompt_cache_key', 'prompt_cache_retention', 'tools']) assert.equal(body[unsupported], undefined, unsupported);
    return events(terminal);
  };
  const client = new ModelClient(providers), signal = new AbortController().signal;
  assert.equal(await client.complete('Hello', 'chatgpt/account-model', signal), 'Test answer');
  for (const state of ['incomplete', 'failed', 'interrupted'] as const) {
    terminal = state;
    await assert.rejects(client.complete('Hello', 'chatgpt/account-model', signal));
  }
  assert.equal(calls, 4, 'Errors must not trigger silent retries or API-key fallback.');
});
