import test from 'node:test';
import assert from 'node:assert/strict';
import { activityOverlayState } from '../src/main/activity-overlay-state';
import { defaultState } from '../src/main/storage';
import type { Snapshot } from '../src/shared/contracts';

test('background activity includes dialog, queued jobs and summaries, excluding retained completed runtimes', () => {
  const state: Pick<Snapshot, 'task' | 'jobs' | 'summary' | 'preferences'> = defaultState();
  assert.deepEqual(activityOverlayState(state), { enabled: false, size: 144, working: false, stopping: false });
  state.preferences.activityOverlayEnabled = true;
  state.preferences.activityOverlaySize = 240;
  state.task.status = 'running';
  assert.deepEqual(activityOverlayState(state), { enabled: true, size: 240, working: true, stopping: false });
  state.task.status = 'completed';
  const job = { id: 'synthetic', requestId: 'synthetic', title: 'Work', prompt: '', status: 'queued' as const,
    createdAt: '', updatedAt: '', model: '', resources: [], runtimeRetained: true };
  state.jobs = [job];
  assert.equal(activityOverlayState(state).working, true);
  state.jobs![0].status = 'stopping';
  assert.equal(activityOverlayState(state).stopping, true);
  state.jobs![0].status = 'completed';
  assert.equal(activityOverlayState(state).working, false);
  assert.equal(activityOverlayState(state).stopping, false);
  state.summary = { status: 'running', mode: 'manual', model: '', calls: 1, maxCalls: 1, completed: 0, total: 1, remaining: 1 };
  assert.equal(activityOverlayState(state).working, true);
  state.summary.status = 'failed';
  assert.equal(activityOverlayState(state).working, false);
});
