import type { Snapshot } from '../shared/contracts';
import { ACTIVITY_OVERLAY_DEFAULT_SIZE } from '../shared/workspace-preferences';
import type { ActivityOverlayState } from './activity-overlay';
import type { ActivityPresence } from '../shared/activity-presence';

/** Only live work counts; a retained, completed runtime can be idle indefinitely. */
export function activityOverlayState(state: Pick<Snapshot, 'preferences' | 'task' | 'jobs' | 'summary' | 'desktopControl'>, voice: ActivityPresence = { phase: 'idle' }): ActivityOverlayState {
  const statuses = [state.task.status, state.summary?.status, ...(state.jobs ?? []).map(job => job.status)];
  const stopping = statuses.some(status => status === 'stopping');
  const workActive = statuses.some(status => status === 'running' || status === 'queued' || status === 'stopping');
  const phase = stopping ? 'stopping' : voice.phase !== 'idle' ? voice.phase : state.task.status === 'running' ? 'thinking' : workActive ? 'working' : 'idle';
  return {
    enabled: state.preferences.activityOverlayEnabled === true && (!state.desktopControl || state.desktopControl === 'free'),
    size: state.preferences.activityOverlaySize ?? ACTIVITY_OVERLAY_DEFAULT_SIZE,
    working: workActive || voice.phase !== 'idle',
    stopping, phase,
  };
}
