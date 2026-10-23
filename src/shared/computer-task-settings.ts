import type { ComputerTaskSettings } from './contracts';
import { computerDetailDivisor, computerOverviewDivisor } from './computer-views';

export const COMPUTER_IMAGE_RETENTION_CALLS = [0, 1, 2, 3, 5, 10] as const;
export function computerImageRetentionCalls(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10) throw new Error('Ungültige Bildaufbewahrung.');
  return value;
}

export function parseComputerTaskSettings(value: unknown): ComputerTaskSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ungültige Bildschirmkonfiguration.');
  const row = value as Record<string, unknown>;
  if (typeof row.delegationEnabled !== 'boolean' || typeof row.fast !== 'boolean'
    || typeof row.model !== 'string' || row.model.length > 300 || /[\r\n\0]/.test(row.model)
    || (row.delegationEnabled && !row.model.trim())) throw new Error('Ungültige Bildschirmkonfiguration.');
  return { delegationEnabled: row.delegationEnabled, model: row.model, fast: row.fast,
    overviewScaleDivisor: computerOverviewDivisor(row.overviewScaleDivisor),
    detailScaleDivisor: row.detailScaleDivisor === undefined ? 1 : computerDetailDivisor(row.detailScaleDivisor),
    imageRetentionCalls: row.imageRetentionCalls === undefined ? 0 : computerImageRetentionCalls(row.imageRetentionCalls) };
}
