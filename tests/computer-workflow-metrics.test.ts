import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore, defaultState } from '../src/main/storage';
import { decodeSnapshot } from '../src/shared/ipc';
import { parseModelRequest, parseModelRequestSummaries } from '../src/shared/model-requests';
import { snapshotFixture } from './ipc-fixtures';

const summary = () => ({ role: 'computer' as const, model: 'chatgpt/gpt-6-luna', requestedServiceTier: 'fast' as const, actualServiceTier: 'default',
  elapsedMs: 3456, requests: 2, completed: 1, failed: 1, aborted: 0,
  usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 50, cacheWriteTokens: 0 } });

test('desktop configuration and per-model observations persist and cross typed IPC without retaining unrelated fields', () => {
  const directory = mkdtempSync(join(tmpdir(), 'openhiatus-computer-metrics-')), store = new StateStore(directory), state = defaultState();
  state.jobs = [{ id: 'job', requestId: 'request', title: 'UI check', prompt: 'Synthetic example', status: 'completed', createdAt: 'now', updatedAt: 'now',
    model: 'chatgpt/gpt-6.1-sol', resources: ['desktop'], computer: { delegationEnabled: true, model: 'chatgpt/gpt-6-luna', fast: true, overviewScaleDivisor: 16 }, modelRequests: [summary()] }];
  Object.assign(state.jobs[0].modelRequests![0], { response: { privateText: 'must not persist' } });
  store.save(state);
  const restored = store.load(), projected = decodeSnapshot({ ...snapshotFixture(), jobs: restored.jobs });
  assert.deepEqual(projected.jobs![0].modelRequests, [summary()]);
  assert.deepEqual(projected.jobs![0].computer, state.jobs[0].computer);
  assert.ok(!readFileSync(join(directory, 'state.json'), 'utf8').includes('privateText'));
});

test('model observations reject unbounded counts, raw tier text, duplicate groups and inconsistent totals', () => {
  assert.throws(() => parseModelRequest({ ...summary(), status: 'completed', elapsedMs: -1 }));
  assert.throws(() => parseModelRequest({ ...summary(), status: 'completed', actualServiceTier: 'raw-provider-text' }));
  assert.throws(() => parseModelRequest({ ...summary(), status: ['completed'] }));
  assert.throws(() => parseModelRequest({ ...summary(), status: 'completed', role: ['computer'] }));
  assert.throws(() => parseModelRequest({ ...summary(), status: 'completed', actualServiceTier: ['fast'] }));
  assert.throws(() => parseModelRequestSummaries([{ ...summary(), completed: 100 }]));
  assert.throws(() => parseModelRequestSummaries([summary(), summary()]));
  assert.throws(() => parseModelRequestSummaries([{ ...summary(), requests: Infinity }]));
  assert.throws(() => parseModelRequestSummaries(Array.from({ length: 65 }, summary)));
  assert.equal(parseModelRequest({ ...summary(), actualServiceTier: undefined, status: 'completed' }).actualServiceTier, undefined);
});
