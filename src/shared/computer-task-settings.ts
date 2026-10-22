import type { ComputerTaskSettings } from './contracts';
import { computerOverviewDivisor } from './computer-views';

export function parseComputerTaskSettings(value: unknown): ComputerTaskSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ungültige Bildschirmkonfiguration.');
  const row = value as Record<string, unknown>;
  if (typeof row.delegationEnabled !== 'boolean' || typeof row.fast !== 'boolean'
    || typeof row.model !== 'string' || row.model.length > 300 || /[\r\n\0]/.test(row.model)
    || (row.delegationEnabled && !row.model.trim())) throw new Error('Ungültige Bildschirmkonfiguration.');
  return { delegationEnabled: row.delegationEnabled, model: row.model, fast: row.fast,
    overviewScaleDivisor: computerOverviewDivisor(row.overviewScaleDivisor) };
}
