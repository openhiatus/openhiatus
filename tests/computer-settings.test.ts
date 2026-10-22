import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StateStore, defaultState } from '../src/main/storage';
import { settingsHandlers } from '../src/main/ipc/settings';
import type { IpcPorts } from '../src/main/ipc/ports';

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
