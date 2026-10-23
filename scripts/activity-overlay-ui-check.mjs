import { _electron as electron, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createUiAppFixture } from './helpers/ui-app-fixture.mjs';

await mkdir('.test-data', { recursive: true });
await mkdir('artifacts', { recursive: true });
const profile = await mkdtemp(path.resolve('.test-data/activity-overlay-'));
const fixture = process.env.OPENHIATUS_TEST_APP ? undefined : await createUiAppFixture('activity-overlay-build');
let release;
let requests = 0;
const gate = new Promise(resolve => { release = resolve; });
const server = createServer(async (request, response) => {
  try {
    assert.equal(request.url, '/v1/chat/completions');
    let body = ''; for await (const chunk of request) body += chunk;
    const input = JSON.parse(body); requests++;
    assert.equal(requests, 1); assert.equal(input.model, 'overlay-test');
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta, finish_reason = null) => response.write(`data: ${JSON.stringify({ id: 'overlay-local', object: 'chat.completion.chunk', model: 'overlay-test',
      choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
    chunk({ role: 'assistant' });
    await gate;
    chunk({ content: 'Die lokale Prüfung ist abgeschlossen.' }); chunk({}, 'stop');
    response.end('data: [DONE]\n\n');
  } catch (error) { response.writeHead(500); response.end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.OPENHIATUS_TEST_APP || path.resolve('node_modules/electron/dist/electron.exe');
const args = [...(fixture ? [fixture.appDirectory] : []), `--data-dir=${profile}`];
let instance;
const errors = [];
const visibleOverlay = () => instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()
  .filter(window => window.getTitle().includes('Arbeitsanzeige') && window.isVisible()).length);
try {
  instance = await electron.launch({ executablePath, args, env, timeout: 30000 });
  const page = await instance.firstWindow(), main = await instance.browserWindow(page);
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'Verstanden, Vollzugriff bestätigen', exact: true }).click();
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  assert.equal((await page.evaluate(() => window.openhiatus.snapshot())).preferences.activityOverlayEnabled, false);
  await page.evaluate(async url => {
    await window.openhiatus.saveProvider({ id: 'local', baseUrl: url, models: ['overlay-test'] });
    await window.openhiatus.savePreferences({ model: 'local/overlay-test', dialogModel: 'local/overlay-test', memoryModel: 'local/overlay-test',
      memoryAutoSummarize: false, speakReplies: false, earcons: false });
  }, baseUrl);
  const navigation = page.getByRole('navigation', { name: 'Hauptnavigation' });
  await navigation.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.getByRole('tab', { name: 'Bedienung', exact: true }).click();
  const overlayToggle = page.getByRole('checkbox', { name: /^Arbeitsanzeige im Hintergrund/ });
  await overlayToggle.click();
  await expect(overlayToggle).toBeChecked();
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).preferences.activityOverlayEnabled)).toBe(true);
  await navigation.getByRole('button', { name: 'Gespräch', exact: true }).click();
  await main.evaluate(window => { window.show(); window.focus(); });
  await expect.poll(() => main.evaluate(window => window.isFocused())).toBe(true);
  await page.getByRole('textbox', { name: 'Dein Auftrag', exact: true }).fill('Führe die lokale Anzeigeprüfung aus.');
  await page.getByRole('button', { name: 'Auftrag senden', exact: true }).click();
  await expect.poll(() => requests, { timeout: 30000 }).toBe(1);
  assert.equal(await visibleOverlay(), 0, 'foreground work must not show an overlay');
  await main.evaluate(window => window.hide());
  await expect.poll(visibleOverlay).toBe(1);
  const overlay = instance.windows().find(candidate => candidate !== page);
  assert.ok(overlay, 'background activity must create a separate surface');
  overlay.on('pageerror', error => errors.push(error.message));
  const overlayWindow = await instance.browserWindow(overlay);
  assert.deepEqual(await overlay.evaluate(() => [typeof window.openhiatus, typeof require]), ['undefined', 'undefined']);
  assert.equal(await overlayWindow.evaluate(window => window.isFocusable()), false);
  assert.equal(await overlayWindow.evaluate(window => window.isAlwaysOnTop()), true);
  assert.equal(await overlayWindow.evaluate(window => window.isFocused()), false);
  const area = await instance.evaluate(({ screen, BrowserWindow }) => screen.getDisplayMatching(BrowserWindow.getAllWindows()
    .find(window => !window.getTitle().includes('Arbeitsanzeige')).getBounds()).workArea);
  const initial = await overlayWindow.evaluate(window => window.getBounds());
  assert.equal(initial.width, 144); assert.equal(initial.height, 144);
  assert.ok(initial.x >= area.x && initial.x + initial.width <= area.x + area.width);
  assert.ok(initial.y >= area.y && initial.y + initial.height <= area.y + area.height);
  assert.ok(initial.x + initial.width >= area.x + area.width - 16, 'indicator must be at the top right');
  assert.ok(initial.y <= area.y + 16);
  const handle = overlay.getByRole('slider', { name: 'Overlay-Größe' });
  // Real DOM pointer capture in our synthetic window; no desktop driver or user application is involved.
  const grip = await handle.boundingBox(); assert.ok(grip);
  await overlay.mouse.move(grip.x + grip.width / 2, grip.y + 20);
  await overlay.mouse.down(); await overlay.mouse.move(grip.x + grip.width / 2, grip.y + 100); await overlay.mouse.up();
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).preferences.activityOverlaySize)).toBe(224);
  const resized = await overlayWindow.evaluate(window => window.getBounds());
  assert.equal(resized.width, 224); assert.equal(resized.height, 224);
  assert.equal(resized.x + resized.width, initial.x + initial.width); assert.equal(resized.y, initial.y);
  await overlay.screenshot({ path: 'artifacts/openhiatus-arbeitsanzeige.png' });
  await main.evaluate(window => { window.show(); window.focus(); });
  await expect.poll(visibleOverlay).toBe(0);
  await main.evaluate(window => window.minimize());
  await expect.poll(visibleOverlay).toBe(1);
  await page.evaluate(() => window.openhiatus.savePreferences({ activityOverlayEnabled: false }));
  await expect.poll(visibleOverlay).toBe(0);
  await page.evaluate(() => window.openhiatus.savePreferences({ activityOverlayEnabled: true }));
  await expect.poll(visibleOverlay).toBe(1);
  release();
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).task.status), { timeout: 30000 }).toBe('completed');
  await expect.poll(visibleOverlay).toBe(0);
  await instance.close(); instance = undefined;
  instance = await electron.launch({ executablePath, args, env, timeout: 30000 });
  const restarted = await instance.firstWindow();
  const preferences = await restarted.evaluate(async () => (await window.openhiatus.snapshot()).preferences);
  assert.equal(preferences.activityOverlayEnabled, true); assert.equal(preferences.activityOverlaySize, 224);
  assert.equal(await visibleOverlay(), 0); assert.equal(requests, 1);
  assert.deepEqual(errors, []);
  const evidence = { status: 'passed', profile, initial, resized, requests,
    checked: ['opt-in default and settings control', 'foreground hidden', 'background and minimized activity', 'top-right work area bounds', 'no focus theft',
      'isolated preload without app API', 'right handle pointer drag', 'fixed top-right anchor', 'disable and enable while running',
      'completion hides overlay', 'size and enabled state survive restart', 'no idle overlay or replay', 'local model only'] };
  await writeFile('artifacts/openhiatus-arbeitsanzeige-pruefung.json', JSON.stringify(evidence, null, 2), 'utf8');
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  release(); if (instance) await instance.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
