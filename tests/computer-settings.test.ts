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
