import type { Snapshot } from '../shared/contracts';
import { ACTIVITY_OVERLAY_DEFAULT_SIZE } from '../shared/workspace-preferences';
import type { ActivityOverlayState } from './activity-overlay';

/** Only live work counts; a retained, completed runtime can be idle indefinitely. */
export function activityOverlayState(state: Pick<Snapshot, 'preferences' | 'task' | 'jobs' | 'summary'>): ActivityOverlayState {
  const statuses = [state.task.status, state.summary?.status, ...(state.jobs ?? []).map(job => job.status)];
  return {
    enabled: state.preferences.activityOverlayEnabled === true,
    size: state.preferences.activityOverlaySize ?? ACTIVITY_OVERLAY_DEFAULT_SIZE,
    working: statuses.some(status => status === 'running' || status === 'queued' || status === 'stopping'),
    stopping: statuses.some(status => status === 'stopping'),
  };
}
