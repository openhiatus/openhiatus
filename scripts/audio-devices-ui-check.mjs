import { _electron as electron, expect } from '@playwright/test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createUiAppFixture } from './helpers/ui-app-fixture.mjs';

await mkdir('.test-data', { recursive: true });
await mkdir('artifacts', { recursive: true });
const profile = await mkdtemp(path.resolve('.test-data/audio-devices-'));
const fixture = process.env.OPENHIATUS_TEST_APP ? undefined : await createUiAppFixture('audio-devices-build');
const executablePath = process.env.OPENHIATUS_TEST_APP || path.resolve('node_modules/electron/dist/electron.exe');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const errors = [];
const original = [
  { deviceId: 'usb-mic', kind: 'audioinput', label: 'USB Studio Microphone', groupId: 'usb-group' },
  { deviceId: 'usb-speaker', kind: 'audiooutput', label: 'USB Studio Headphones', groupId: 'usb-group' },
];
const reconnected = original.map(device => ({ ...device, deviceId: device.deviceId + '-reconnected', groupId: 'new-session-group' }));
let instance;
async function launch() {
  instance = await electron.launch({ executablePath, args: [...(fixture ? [fixture.appDirectory] : []), `--data-dir=${profile}`, '--use-fake-device-for-media-stream'], env, timeout: 30000 });
  const page = await instance.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.getByRole('tab', { name: 'Sprache & Geräte', exact: true }).click();
  return page;
}
async function devices(page, values) {
  await page.evaluate(values => {
    Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', { configurable: true, value: async () => values.map(device => ({ ...device, toJSON: () => device })) });
    navigator.mediaDevices.dispatchEvent(new Event('devicechange'));
  }, values);
}
try {
  let page = await launch();
  await devices(page, original);
  const microphone = page.getByLabel('Mikrofon', { exact: true }), speaker = page.getByLabel('Lautsprecher', { exact: true });
  await expect(microphone.locator('option[value="usb-mic"]')).toBeAttached();
  await microphone.selectOption('usb-mic'); await speaker.selectOption('usb-speaker');
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).preferences.inputDeviceLabel)).toBe(original[0].label);
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).preferences.outputDeviceLabel)).toBe(original[1].label);
  await devices(page, []);
  await expect(microphone).toHaveValue('usb-mic'); await expect(speaker).toHaveValue('usb-speaker');
  await expect(microphone.locator('option:checked')).toContainText('nicht angeschlossen');
  await expect(speaker.locator('option:checked')).toContainText('nicht angeschlossen');
  await page.locator('.settings-audio-devices').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/openhiatus-audio-geraete-getrennt.png' });
  await instance.close(); instance = undefined;
  const saved = JSON.parse(await readFile(path.join(profile, 'state.json'), 'utf8')).state.preferences;
  assert.equal(saved.inputDeviceId, 'usb-mic'); assert.equal(saved.outputDeviceId, 'usb-speaker');
  assert.equal(saved.inputDeviceLabel, original[0].label); assert.equal(saved.outputDeviceLabel, original[1].label);
  page = await launch(); await devices(page, []);
  await expect(page.getByLabel('Mikrofon', { exact: true })).toHaveValue('usb-mic');
  await expect(page.getByLabel('Lautsprecher', { exact: true })).toHaveValue('usb-speaker');
  await devices(page, reconnected);
  await expect(page.getByLabel('Mikrofon', { exact: true })).toHaveValue('usb-mic-reconnected');
  await expect(page.getByLabel('Lautsprecher', { exact: true })).toHaveValue('usb-speaker-reconnected');
  const restored = await page.evaluate(() => window.openhiatus.snapshot());
  assert.deepEqual(restored.preferences, saved);
  await page.locator('.settings-audio-devices').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/openhiatus-audio-geraete-wiederverbunden.png' });
  await page.getByLabel('Mikrofon', { exact: true }).selectOption('default');
  await page.getByLabel('Lautsprecher', { exact: true }).selectOption('default');
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).preferences.inputDeviceLabel)).toBe('');
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).preferences.outputDeviceGroupId)).toBe('');
  assert.deepEqual(errors, []);
  const result = { status: 'passed', checks: ['device IDs, names and groups saved through UI and IPC', 'unplugged choices stay selected', 'restart preserves unavailable choices', 'reconnection with changed IDs and groups', 'explicit Windows default clears pinned metadata', 'no renderer errors', 'synthetic profile; no device capture or cloud requests'] };
  await writeFile('artifacts/openhiatus-audio-geraete-ui.json', JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result, null, 2));
} finally { if (instance) await instance.close(); }
