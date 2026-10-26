import test from 'node:test';
import assert from 'node:assert/strict';
import type { App, LaunchItems, Settings } from 'electron';
import { AUTOSTART_NAME, WindowsAutostart, autostartUnavailableReason } from '../src/main/windows-autostart';

function fixture() {
  const executable = 'C:\\Synthetic App\\openHiatus.exe', writes: Settings[] = [];
  let items: LaunchItems[] = [], deny = false, ignore = false;
  const app = {
    getLoginItemSettings(options) {
      assert.deepEqual(options, { path: executable });
      if (deny) throw Error('private native error');
      return { launchItems: items } as ReturnType<App['getLoginItemSettings']>;
    },
    setLoginItemSettings(settings) {
      if (deny) throw Error('private native error');
      writes.push(settings);
      if (!ignore) items = settings.openAtLogin ? [{ name: settings.name!, path: settings.path!, args: settings.args!, scope: 'user', enabled: settings.enabled !== false }] : [];
    },
  } satisfies Pick<App, 'getLoginItemSettings' | 'setLoginItemSettings'>;
  return { service: new WindowsAutostart({ app, executable }), app, executable, writes,
    setItems: (value: LaunchItems[]) => { items = value; }, deny: () => { deny = true; }, ignore: () => { ignore = true; } };
}

test('opening never registers; explicit enable uses only the owned executable and minimized-start argument', () => {
  const f = fixture(); assert.equal(f.service.read().enabled, false); assert.equal(f.writes.length, 0);
  assert.equal(f.service.set(true).enabled, true);
  assert.deepEqual(f.writes, [{ name: AUTOSTART_NAME, path: f.executable, args: ['--autostart'], openAtLogin: true, enabled: true }]);
  assert.equal(f.service.set(false).enabled, false); assert.equal(f.writes[1].openAtLogin, false);
});

test('Windows-disabled entries are reported without silently reenabling them; unrelated entries do not count', () => {
  const f = fixture();
  const own: LaunchItems = { name: AUTOSTART_NAME, path: f.executable.toUpperCase(), args: ['--autostart'], scope: 'user', enabled: false };
  f.setItems([own]); assert.deepEqual(f.service.read(), { available: true, enabled: false, disabledByWindows: true }); assert.deepEqual(f.writes, []);
  assert.equal(f.service.set(true).disabledByWindows, false);
  f.setItems([{ ...own, args: [], enabled: true }]); assert.equal(f.service.read().enabled, true, 'Windows may omit switches from launchItems.args');
  for (const patch of [{ name: 'Different app' }, { path: 'C:\\Old App\\openHiatus.exe' }, { scope: 'machine' as const }]) {
    f.setItems([{ ...own, enabled: true, ...patch }]); assert.equal(f.service.read().enabled, false);
  }
});

test('unavailable environments cannot read or alter the real login registration', () => {
  const f = fixture();
  for (const reason of [autostartUnavailableReason('linux', true, false), autostartUnavailableReason('win32', false, false), autostartUnavailableReason('win32', true, true)]) {
    assert.ok(reason); const service = new WindowsAutostart({ app: f.app, executable: f.executable, unavailableReason: reason });
    f.deny(); assert.equal(service.read().available, false); assert.throws(() => service.set(true)); assert.deepEqual(f.writes, []);
  }
  assert.equal(autostartUnavailableReason('win32', true, false), undefined);
});

test('native errors and unconfirmed writes never claim success or expose native details', () => {
  const f = fixture(); f.ignore(); assert.throws(() => f.service.set(true), /nicht bestätigt/);
  f.deny(); assert.throws(() => f.service.read(), /nicht gelesen/); assert.throws(() => f.service.set(true), /nicht geändert/);
  assert.throws(() => f.service.set('true' as never), /Ungültige/);
});
