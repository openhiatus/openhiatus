import type { Snapshot } from './contracts';

export interface OnboardingProgress { version: 2; step: 0 | 1 | 2 | 3 | 4; status: 'active' | 'later' | 'complete'; }
export function parseOnboarding(value: unknown): OnboardingProgress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ungültiger Einrichtungsstand.');
  const row = value as Record<string, unknown>;
  if (![1, 2].includes(row.version as number) || !(row.version === 1 ? [0, 1, 2, 3] : [0, 1, 2, 3, 4]).includes(row.step as number) || !['active', 'later', 'complete'].includes(row.status as string)
    || Object.keys(row).some(key => !['version', 'step', 'status'].includes(key))) throw new Error('Ungültiger Einrichtungsstand.');
  const step = row.version === 1 ? row.status === 'complete' ? 4 : row.step === 0 ? 0 : 1 : row.step;
  return { version: 2, step: step as OnboardingProgress['step'], status: row.status as OnboardingProgress['status'] };
}
export function needsOnboarding(state: Snapshot): boolean {
  const progress = state.preferences.onboarding;
  if (progress) return progress.status !== 'complete';
  // Existing configured profiles keep their usual entry point.
  return !state.preferences.fullAccessAcknowledged || !state.providers?.some(provider => provider.configured);
}
export function onboardingStep(state: Snapshot, fromStart = false): OnboardingProgress['step'] {
  if (fromStart || !state.preferences.fullAccessAcknowledged) return 0;
  const progress = state.preferences.onboarding;
  const step = progress?.status === 'complete' ? 0 : progress?.step ?? 1;
  if (step > 2 && !state.models.some(model => model.id === state.preferences.dialogModel)) return 2;
  return step;
}
