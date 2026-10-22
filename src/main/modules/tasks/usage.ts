import type { Usage } from '../../../shared/contracts';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ungültiges Datenformat.');
  return value as Record<string, unknown>;
}
/** Accept only finite, nonnegative usage; connection data and prices never leak through projection. */
export function validateUsage(value: unknown): Usage | undefined {
  if (value === undefined) return undefined;
  const row = object(value);
  const required = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'] as const;
  if (required.some(key => typeof row[key] !== 'number' || !Number.isFinite(row[key]) || Number(row[key]) < 0)
    || (row.costUsd !== undefined && (typeof row.costUsd !== 'number' || !Number.isFinite(row.costUsd) || row.costUsd < 0))) throw new Error('Ungültiger Modellverbrauch.');
  return { inputTokens: Number(row.inputTokens), outputTokens: Number(row.outputTokens), cacheReadTokens: Number(row.cacheReadTokens), cacheWriteTokens: Number(row.cacheWriteTokens),
    ...(row.costUsd !== undefined ? { costUsd: row.costUsd as number } : {}) };
}
