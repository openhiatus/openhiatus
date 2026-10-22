import type { ModelRequest, ModelRequestSummary, Usage } from './contracts';

export const MODEL_SERVICE_TIERS = ['auto', 'default', 'fast', 'priority', 'standard', 'flex', 'scale', 'ultrafast'] as const;
const tiers: readonly string[] = MODEL_SERVICE_TIERS;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ungültige Modellmessung.');
  return value as Record<string, unknown>;
}
function number(value: unknown, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) throw new Error('Ungültige Modellmessung.');
  return value;
}
function usage(value: unknown): Usage {
  const row = record(value);
  return { inputTokens: number(row.inputTokens), outputTokens: number(row.outputTokens), cacheReadTokens: number(row.cacheReadTokens), cacheWriteTokens: number(row.cacheWriteTokens),
    ...(row.costUsd === undefined ? {} : { costUsd: number(row.costUsd) }) };
}
function fields(row: Record<string, unknown>): Omit<ModelRequest, 'status'> {
  if (typeof row.role !== 'string' || !['dialog', 'worker', 'computer'].includes(row.role) || typeof row.model !== 'string' || !row.model.trim()
    || row.model.length > 300 || /[\r\n\0]/.test(row.model) || (row.requestedServiceTier !== undefined && row.requestedServiceTier !== 'fast')
    || (row.actualServiceTier !== undefined && (typeof row.actualServiceTier !== 'string' || !tiers.includes(row.actualServiceTier)))) throw new Error('Ungültige Modellmessung.');
  return { role: row.role as ModelRequest['role'], model: row.model, elapsedMs: number(row.elapsedMs),
    ...(row.requestedServiceTier === undefined ? {} : { requestedServiceTier: 'fast' }),
    ...(row.actualServiceTier === undefined ? {} : { actualServiceTier: row.actualServiceTier as string }),
    ...(row.usage === undefined ? {} : { usage: usage(row.usage) }) };
}
export function parseModelRequest(value: unknown): ModelRequest {
  const row = record(value);
  if (typeof row.status !== 'string' || !['completed', 'failed', 'aborted'].includes(row.status)) throw new Error('Ungültige Modellmessung.');
  return { ...fields(row), status: row.status as ModelRequest['status'] };
}
export function parseModelRequestSummaries(value: unknown): ModelRequestSummary[] {
  if (!Array.isArray(value) || value.length > 64) throw new Error('Ungültige Modellmessungen.');
  const keys = new Set<string>();
  return value.map(value => {
    const row = record(value), common = fields(row);
    const result = { ...common, requests: number(row.requests, true), completed: number(row.completed, true), failed: number(row.failed, true), aborted: number(row.aborted, true) };
    const key = JSON.stringify([result.role, result.model, result.requestedServiceTier, result.actualServiceTier]);
    if (result.requests !== result.completed + result.failed + result.aborted || keys.has(key)) throw new Error('Ungültige Modellmessungen.');
    keys.add(key); return result;
  });
}
