export type ActivityPresencePhase = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'working' | 'speaking' | 'ready' | 'error' | 'stopping';

/** Only a fixed status crosses this channel; transcripts and reply text stay in the main window. */
export interface ActivityPresence { phase: ActivityPresencePhase; }

const phases: readonly ActivityPresencePhase[] = ['idle', 'listening', 'transcribing', 'thinking', 'working', 'speaking', 'ready', 'error', 'stopping'];
export function parseActivityPresence(value: unknown): ActivityPresence | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== 1 || !Object.hasOwn(input, 'phase') || typeof input.phase !== 'string' || !phases.includes(input.phase as ActivityPresencePhase)) return;
  return { phase: input.phase as ActivityPresencePhase };
}
