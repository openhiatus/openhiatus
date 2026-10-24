import type { ModelOption } from './contracts';

// A local selection identifier. This suffix must never become a provider model ID.
const FAST_SUFFIX = '::fast';
export function isFastModelSelection(selection: string): boolean { return selection.endsWith(FAST_SUFFIX); }
export function baseModelSelection(selection: string): string { return isFastModelSelection(selection) ? selection.slice(0, -FAST_SUFFIX.length) : selection; }
export function fastModelSelection(selection: string): string { return `${baseModelSelection(selection)}${FAST_SUFFIX}`; }
export function modelSelectionLabel(selection: string): string { return isFastModelSelection(selection) ? `${baseModelSelection(selection)} (fast)` : selection; }

/** Fast is a request mode of eligible OpenAI models, not a second remote model. */
export function supportsFastSelection(selection: string): boolean {
  const match = /^(openai|chatgpt)\/(.+)$/.exec(selection);
  return !!match && /^gpt-(?:5|6)(?:[.-]|$)/.test(match[2]) && !/(?:^|-)pro(?:-|$)/.test(match[2]) && !isFastModelSelection(selection);
}
export function withFastModelOptions(models: ModelOption[]): ModelOption[] {
  const ids = new Set(models.map(model => model.id));
  return models.flatMap(model => {
    const fastId = fastModelSelection(model.id);
    return supportsFastSelection(model.id) && !ids.has(fastId)
      ? [model, { ...model, id: fastId, label: `${model.label} (fast)` }] : [model];
  });
}
