import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StateStore, defaultState } from '../src/main/storage';
import { settingsHandlers } from '../src/main/ipc/settings';
import type { IpcPorts } from '../src/main/ipc/ports';
import { decodeSnapshot } from '../src/shared/ipc/snapshot';
import { snapshotFixture } from './ipc-fixtures';
import { parseComputerTaskSettings } from '../src/shared/computer-task-settings';

test('overview preference migrates to full, persists experimental/custom divisors and cannot corrupt valid state', () => {
  const directory = mkdtempSync(join(tmpdir(), 'openhiatus-computer-settings-')), state = defaultState();
  delete state.preferences.computerOverviewScaleDivisor;
  writeFileSync(join(directory, 'state.json'), JSON.stringify({ version: 1, state }));
  const store = new StateStore(directory), restored = store.load();
  assert.equal(restored.preferences.computerOverviewScaleDivisor, 1);
  for (const factor of [4, 8, 16, 32, 2.5, 64, 1]) {
    restored.preferences.computerOverviewScaleDivisor = factor; store.save(restored);
    assert.equal(new StateStore(directory).load().preferences.computerOverviewScaleDivisor, factor);
  }
  const before = readFileSync(join(directory, 'state.json'), 'utf8');
  for (const factor of [0, -1, 65, NaN, Infinity, '8', null, {}]) {
    Object.assign(restored.preferences, { computerOverviewScaleDivisor: factor });
    assert.throws(() => store.save(restored));
    assert.equal(readFileSync(join(directory, 'state.json'), 'utf8'), before);
  }
});
test('settings IPC validates the optional overview preference before calling application ports', async () => {
  const called: unknown[] = [];
  const handlers = settingsHandlers({ controller: { savePreferences: async (patch: unknown) => { called.push(patch); } }, platform: {} } as unknown as IpcPorts);
  for (const factor of [1, 4, 8, 16, 32, 2.5, 64]) await handlers.savePreferences([ { computerOverviewScaleDivisor: factor } ]);
  assert.equal(called.length, 7);
  for (const factor of [0, 65, NaN, Infinity, null, '8', true]) {
    await assert.rejects(async () => handlers.savePreferences([{ computerOverviewScaleDivisor: factor }]));
  }
  assert.equal(called.length, 7);
});

test('legacy profiles keep direct computer use while the separate computer role and Fast persist', () => {
  const directory = mkdtempSync(join(tmpdir(), 'openhiatus-computer-role-')), legacy = defaultState();
  delete legacy.preferences.computerDelegationEnabled; delete legacy.preferences.computerModel; delete legacy.preferences.computerFast;
  writeFileSync(join(directory, 'state.json'), JSON.stringify({ version: 1, state: legacy }));
  const store = new StateStore(directory), restored = store.load();
  assert.equal(restored.preferences.computerDelegationEnabled, false);
  assert.equal(restored.preferences.computerModel, ''); assert.equal(restored.preferences.computerFast, true);
  Object.assign(restored.preferences, { computerDelegationEnabled: true, computerModel: 'synthetic/vision', computerFast: false });
  store.save(restored);
  assert.deepEqual(new StateStore(directory).load().preferences, restored.preferences);
  const before = readFileSync(join(directory, 'state.json'), 'utf8');
  for (const patch of [{ computerDelegationEnabled: 'true' }, { computerFast: null }, { computerModel: null }, { computerModel: 1 }, { computerModel: 'x'.repeat(301) }]) {
    assert.throws(() => store.save({ ...restored, preferences: { ...restored.preferences, ...patch } }));
    assert.equal(readFileSync(join(directory, 'state.json'), 'utf8'), before);
  }
});

test('the computer role survives validated IPC snapshots and invalid preference commands never reach the controller', async () => {
  const called: unknown[] = [];
  const handlers = settingsHandlers({ controller: { savePreferences: async (patch: unknown) => { called.push(patch); } }, platform: {} } as unknown as IpcPorts);
  const patch = { computerDelegationEnabled: true, computerModel: 'synthetic/vision', computerFast: true };
  await handlers.savePreferences([patch]); assert.deepEqual(called, [patch]);
  for (const invalid of [{ computerDelegationEnabled: 1 }, { computerFast: 'true' }, { computerModel: false }, { computerModel: 'x'.repeat(301) }]) {
    await assert.rejects(async () => handlers.savePreferences([invalid]));
  }
  assert.equal(called.length, 1);
  const snapshot = snapshotFixture(); Object.assign(snapshot.preferences, patch);
  assert.deepEqual(decodeSnapshot(snapshot).preferences, snapshot.preferences);
  assert.throws(() => decodeSnapshot({ ...snapshot, preferences: { ...snapshot.preferences, computerFast: 'true' } }));
});

test('detail scale and image retention migrate independently of delegation and persist without changing legacy defaults', () => {
  const directory = mkdtempSync(join(tmpdir(), 'openhiatus-image-settings-')), state = defaultState();
  delete state.preferences.computerDetailScaleDivisor; delete state.preferences.computerImageRetentionCalls;
  const legacy = { delegationEnabled: false, model: '', fast: true, overviewScaleDivisor: 1 };
  state.jobs = [{ id: 'job', requestId: 'request', title: 'Synthetic', prompt: 'Synthetic', status: 'completed',
    createdAt: 'now', updatedAt: 'now', model: 'synthetic/model', resources: [], computer: legacy }];
  writeFileSync(join(directory, 'state.json'), JSON.stringify({ version: 1, state }));
  const store = new StateStore(directory), restored = store.load();
  assert.equal(restored.preferences.computerDetailScaleDivisor, 1);
  assert.equal(restored.preferences.computerImageRetentionCalls, 0);
  assert.deepEqual(restored.jobs![0].computer, { ...legacy, detailScaleDivisor: 1, imageRetentionCalls: 0 });
  assert.deepEqual(parseComputerTaskSettings(legacy), restored.jobs![0].computer);
  for (const factor of [1, 2, 4]) for (const calls of [0, 1, 2, 3, 4, 5, 6, 10]) {
    Object.assign(restored.preferences, { computerDetailScaleDivisor: factor, computerImageRetentionCalls: calls });
    restored.jobs![0].computer = { ...legacy, detailScaleDivisor: factor, imageRetentionCalls: calls };
    store.save(restored);
    const loaded = new StateStore(directory).load();
    assert.equal(loaded.preferences.computerDetailScaleDivisor, factor);
    assert.equal(loaded.preferences.computerImageRetentionCalls, calls);
    assert.equal(loaded.preferences.computerDelegationEnabled, false);
    assert.deepEqual(loaded.jobs![0].computer, restored.jobs![0].computer);
  }
  const before = readFileSync(join(directory, 'state.json'), 'utf8');
  for (const [key, values] of [
    ['computerDetailScaleDivisor', [0, 3, 2.5, 8, NaN, Infinity, null, '2', false]],
    ['computerImageRetentionCalls', [-1, 11, 1.5, NaN, Infinity, null, '3', false]],
  ] as const) for (const value of values) {
    const invalid = structuredClone(restored); Object.assign(invalid.preferences, { [key]: value });
    assert.throws(() => store.save(invalid));
    assert.equal(readFileSync(join(directory, 'state.json'), 'utf8'), before);
  }
});

test('image settings are validated at command, snapshot and frozen-job boundaries', async () => {
  const called: unknown[] = [];
  const handlers = settingsHandlers({ controller: { savePreferences: async (patch: unknown) => { called.push(patch); } }, platform: {} } as unknown as IpcPorts);
  const snapshot = snapshotFixture();
  for (const factor of [1, 2, 4]) for (const calls of [0, 3, 4, 10]) {
    const patch = { computerDetailScaleDivisor: factor, computerImageRetentionCalls: calls };
    await handlers.savePreferences([patch]);
    assert.deepEqual(called.at(-1), patch);
    assert.deepEqual(decodeSnapshot({ ...snapshot, preferences: { ...snapshot.preferences, ...patch } }).preferences, { ...snapshot.preferences, ...patch });
  }
  const accepted = called.length;
  for (const [preference, frozen, values] of [
    ['computerDetailScaleDivisor', 'detailScaleDivisor', [0, 3, 2.5, 8, NaN, Infinity, null, '2', false]],
    ['computerImageRetentionCalls', 'imageRetentionCalls', [-1, 11, 1.5, NaN, Infinity, null, '3', false]],
  ] as const) for (const value of values) {
    await assert.rejects(async () => handlers.savePreferences([{ [preference]: value }]));
    assert.throws(() => decodeSnapshot({ ...snapshot, preferences: { ...snapshot.preferences, [preference]: value } }));
    const computer = { delegationEnabled: false, model: '', fast: true, overviewScaleDivisor: 1, [frozen]: value };
    assert.throws(() => parseComputerTaskSettings(computer));
    assert.throws(() => decodeSnapshot({ ...snapshot, jobs: [{ id: 'job', requestId: 'request', title: 'Synthetic', prompt: 'Synthetic',
      status: 'completed', createdAt: 'now', updatedAt: 'now', model: 'synthetic/model', resources: [], computer }] }));
  }
  await assert.rejects(async () => handlers.savePreferences([{ computerDetailScaleDivisor: undefined }]));
  await assert.rejects(async () => handlers.savePreferences([{ computerImageRetentionCalls: undefined }]));
  assert.equal(called.length, accepted);
});
