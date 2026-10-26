/** Application preferences; the SDK maps these requests to each model's capabilities. */
export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ThinkingLevel = typeof THINKING_LEVELS[number];
export const DEFAULT_THINKING_LEVEL: ThinkingLevel = 'medium';
export const THINKING_PREFERENCES = ['workThinkingLevel', 'dialogThinkingLevel', 'memoryThinkingLevel', 'computerThinkingLevel'] as const;
export type ThinkingPreference = typeof THINKING_PREFERENCES[number];
export function parseThinkingLevel(value: unknown): ThinkingLevel {
  if (typeof value !== 'string' || !THINKING_LEVELS.includes(value as ThinkingLevel)) throw new Error('Ungültige Thinking-Stufe.');
  return value as ThinkingLevel;
}
export function thinkingPreferences(value: Partial<Record<ThinkingPreference, unknown>>): Record<ThinkingPreference, ThinkingLevel> {
  return Object.fromEntries(THINKING_PREFERENCES.map(key => [key, parseThinkingLevel(value[key] === undefined ? DEFAULT_THINKING_LEVEL : value[key])])) as Record<ThinkingPreference, ThinkingLevel>;
}
