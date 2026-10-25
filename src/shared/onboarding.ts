import type { Snapshot } from './contracts';

export interface OnboardingProgress { version: 1; step: 0 | 1 | 2 | 3; status: 'active' | 'later' | 'complete'; }
export function parseOnboarding(value: unknown): OnboardingProgress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ungültiger Einrichtungsstand.');
  const row = value as Record<string, unknown>;
  if (row.version !== 1 || ![0, 1, 2, 3].includes(row.step as number) || !['active', 'later', 'complete'].includes(row.status as string)
    || Object.keys(row).some(key => !['version', 'step', 'status'].includes(key))) throw new Error('Ungültiger Einrichtungsstand.');
  return { version: 1, step: row.step as OnboardingProgress['step'], status: row.status as OnboardingProgress['status'] };
}
export function needsOnboarding(state: Snapshot): boolean {
  const progress = state.preferences.onboarding;
  if (progress) return progress.status !== 'complete';
  // Existing configured profiles keep their usual entry point.
  return !state.preferences.fullAccessAcknowledged || !state.providers?.some(provider => provider.configured);
}
export function onboardingStep(state: Snapshot): OnboardingProgress['step'] {
  if (!state.preferences.fullAccessAcknowledged) return 0;
  if (!state.models.some(model => model.id === state.preferences.dialogModel)) return 1;
  return state.preferences.onboarding?.step ?? 1;
}
