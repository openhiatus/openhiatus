import type { ActivityPresence } from '../../../shared/activity-presence';
import type { AudioPhase } from './voice-session';

/** Playback outlives the model turn; it must keep the background symbol active independently. */
export function voicePresence(phase: AudioPhase, pendingSend: boolean, transcriptReady: boolean): ActivityPresence {
  if (phase === 'opening' || phase === 'recording' || phase === 'mic-test') return { phase: 'listening' };
  if (phase === 'transcribing') return { phase: 'transcribing' };
  if (phase === 'playing') return { phase: 'speaking' };
  if (phase === 'synthesizing' || pendingSend) return { phase: 'thinking' };
  return { phase: transcriptReady ? 'ready' : 'idle' };
}
