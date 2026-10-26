import type { Model } from '@earendil-works/pi-ai/compat';

/** Launch-day metadata until the pinned Pi catalog includes this model.
 * Source: https://developers.openai.com/api/docs/models/gpt-6.1-terra
 * Keep account availability in ProviderStore/ChatGPTAuth; metadata grants no access.
 */
export function openAILaunchModel(id: string): Model<'openai-responses'> | undefined {
  if (id !== 'gpt-6.1-terra') return undefined;
  return {
    id, name: 'GPT-6.1 Terra', provider: 'openai', api: 'openai-responses',
    baseUrl: 'https://api.openai.com/v1', reasoning: true, input: ['text', 'image'],
    contextWindow: 1_050_000, maxTokens: 128_000,
    thinkingLevelMap: { off: 'none', minimal: null, low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
    cost: { input: 1, output: 5, cacheRead: 0.05, cacheWrite: 1.25,
      tiers: [{ inputTokensAbove: 272_000, input: 2, output: 7.5, cacheRead: 0.1, cacheWrite: 2.5 }] },
  };
}
