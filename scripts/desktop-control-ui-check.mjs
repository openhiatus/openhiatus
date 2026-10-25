import { _electron as electron, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createUiAppFixture } from './helpers/ui-app-fixture.mjs';

await mkdir('.test-data', { recursive: true }); await mkdir('artifacts', { recursive: true });
const profile = await mkdtemp(path.resolve('.test-data/desktop-control-'));
const fixture = process.env.OPENHIATUS_TEST_APP ? undefined : await createUiAppFixture('desktop-control-build');
let mode = 'background', dialogCalls = 0, workerCalls = 0, screenshot, frame, clickPoint, instance;
let release; let gate; const resetGate = () => { gate = new Promise(resolve => { release = resolve; }); }; resetGate();
const errors = [];
function find(value, match) {
  if (typeof value === 'string') return match(value);
  if (value && typeof value === 'object') for (const item of Object.values(value)) { const result = find(item, match); if (result) return result; }
}
const server = createServer(async (request, response) => {
  try {
    let body = ''; for await (const chunk of request) body += chunk;
    const input = JSON.parse(body); let tool, args, content = 'Die synthetische Prüfung ist abgeschlossen.';
    if (input.model === 'control-dialog') {
      dialogCalls++;
      if (dialogCalls === 1) { tool = 'start_task'; args = { requestId: mode, title: 'Synthetische Anzeigeprüfung', acknowledgement: 'Ich prüfe die Anzeige.', resources: mode === 'background' ? [path.join(profile, 'background.txt')] : ['desktop'] }; }
    } else {
      assert.equal(input.model, 'control-worker'); workerCalls++;
      if (mode === 'background') await gate;
      else if (workerCalls === 1) { tool = 'computer'; args = { action: 'screenshot' }; }
      else if (workerCalls === 2) {
        frame = find(input.messages, text => {
          const prefix = 'OPENHIATUS_COMPUTER_METADATA_V1 ';
          const line = text.split('\n').find(line => line.startsWith(prefix)); return line ? JSON.parse(line.slice(prefix.length)) : undefined;
        });
        screenshot = find(input.messages, text => text.startsWith('data:image/png;base64,') ? text : undefined);
        assert.ok(frame && screenshot, 'real desktop capture must reach the local model');
        await gate;
        tool = 'computer'; args = { action: 'click', frameId: frame.frameId, x: clickPoint.x, y: clickPoint.y };
      } else assert.equal(workerCalls, 3);
    }
    if (response.destroyed) return;
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta, finish_reason = null) => response.write(`data: ${JSON.stringify({ id: 'control-local', object: 'chat.completion.chunk', model: input.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
    chunk({ role: 'assistant' });
    if (tool) { chunk({ tool_calls: [{ index: 0, id: `${input.model}-${dialogCalls}-${workerCalls}`, type: 'function', function: { name: tool, arguments: JSON.stringify(args) } }] }); chunk({}, 'tool_calls'); }
    else { chunk({ content }); chunk({}, 'stop'); }
    response.end('data: [DONE]\n\n');
  } catch (error) { errors.push(String(error)); if (!response.headersSent) response.writeHead(500); response.end('{}'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const options = { executablePath: process.env.OPENHIATUS_TEST_APP || path.resolve('node_modules/electron/dist/electron.exe'), args: [...(fixture ? [fixture.appDirectory] : []), `--data-dir=${profile}`], env };
try {
  instance = await electron.launch(options); const page = await instance.firstWindow(), main = await instance.browserWindow(page);
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'Verstanden, Vollzugriff bestätigen', exact: true }).click();
  await page.evaluate(async baseUrl => {
    await window.openhiatus.saveProvider({ id: 'local', baseUrl, models: ['control-dialog', 'control-worker'] });
    await window.openhiatus.savePreferences({ model: 'local/control-worker', dialogModel: 'local/control-dialog', memoryModel: 'local/control-dialog', memoryAutoSummarize: false, speakReplies: false, earcons: false, activityOverlayEnabled: false });
  }, `http://127.0.0.1:${server.address().port}/v1`);
  const snapshot = () => page.evaluate(() => window.openhiatus.snapshot());
  const overlays = () => instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(w => w.getTitle().includes('Desktopübernahme') && w.isVisible()).length);
  await page.evaluate(() => window.openhiatus.send('Synthetische Hintergrundprüfung ohne Desktop.', 'background'));
  await expect.poll(() => workerCalls).toBe(1);
  assert.equal((await snapshot()).desktopControl, 'free'); assert.equal(await overlays(), 0);
  await expect(page.locator('.desktop-control-notice')).toContainText('Hintergrundarbeit · Arbeitsplatz frei');
  await page.screenshot({ path: 'artifacts/openhiatus-background-free.png' });
  release(); await expect.poll(async () => (await snapshot()).jobs[0].status).toBe('completed');
  await expect.poll(async () => (await snapshot()).task.status).toBe('completed');

  const targetId = await instance.evaluate(async ({ BrowserWindow, screen }) => {
    const w = new BrowserWindow({ ...screen.getPrimaryDisplay().bounds, frame: false, thickFrame: false, roundedCorners: false, fullscreen: true, alwaysOnTop: true, title: 'Synthetic desktop control target', webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await w.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent('<html><head><style>body{margin:0;background:#17324f;color:white;font:24px Segoe UI}h1{margin:180px 60px 40px}button{margin:40px 60px;padding:30px;background:#f4f0e6;font:24px Segoe UI}</style></head><body><h1>Synthetischer openHiatus-Test</h1><button id="target" onclick="this.textContent=\'Agent hat geklickt\'">Nur dieses Testziel bedienen</button></body></html>')); w.show(); w.focus(); return w.id;
  });
  const target = instance.windows().find(p => p !== page && p.url().startsWith('data:'));
  assert.ok(target); const targetWindow = await instance.browserWindow(target);
  const display = await instance.evaluate(({ screen }) => { const d = screen.getPrimaryDisplay(); return { bounds: d.bounds, scale: d.scaleFactor, count: screen.getAllDisplays().length }; });
  const button = await target.locator('#target').boundingBox(); assert.ok(button);
  clickPoint = { x: Math.round((button.x + button.width / 2) * display.scale), y: Math.round((button.y + button.height / 2) * display.scale) };
  await main.evaluate(w => w.hide());
  for (const next of ['complete', 'stop']) {
    await page.evaluate(() => window.openhiatus.newConversation()); mode = next; workerCalls = 0; dialogCalls = 0; frame = undefined; screenshot = undefined; resetGate();
    await targetWindow.evaluate(w => { w.show(); w.focus(); });
    await page.evaluate(id => window.openhiatus.send('Bediene ausschließlich das synthetische Testziel.', id), next);
    await expect.poll(async () => (await snapshot()).desktopControl, { timeout: 30000 }).toBe('active');
    await expect.poll(() => workerCalls, { timeout: 30000 }).toBe(2);
    await expect.poll(overlays).toBe(display.count);
    const overlay = instance.windows().find(p => p !== page && p !== target && p.url().startsWith('data:'));
    assert.ok(overlay); const overlayWindow = await instance.browserWindow(overlay);
    await expect(overlay.locator('#title')).toHaveText('Agent steuert deinen PC'); await expect(overlay.locator('#escape')).toContainText('Esc');
    assert.equal(await overlayWindow.evaluate(w => w.isFocusable()), false);
    assert.equal(await overlayWindow.evaluate(w => w.isContentProtected()), true);
    assert.deepEqual(await overlay.evaluate(() => [typeof window.openhiatus, typeof require]), ['undefined', 'undefined']);
    const pixels = await instance.evaluate(({ nativeImage }, data) => {
      const image = nativeImage.createFromDataURL(data), size = image.getSize(), bytes = image.toBitmap();
      return [2, 10, 25].map(p => { const i = (p * size.width + p) * 4; return [...bytes.subarray(i, i + 3)]; });
    }, screenshot);
    assert.deepEqual(pixels, [[79, 50, 23], [79, 50, 23], [79, 50, 23]], 'control image must show synthetic background, without the visible amber frame');
    await overlay.screenshot({ path: 'artifacts/openhiatus-desktop-takeover.png' });
    if (next === 'complete') {
      release(); await expect(target.locator('#target')).toHaveText('Agent hat geklickt', { timeout: 30000 });
      await expect.poll(async () => (await snapshot()).jobs.at(-1).status, { timeout: 30000 }).toBe('completed');
    } else {
      await main.evaluate(w => { w.show(); w.focus(); });
      await expect(page.locator('.desktop-control-notice')).toContainText('Agent steuert deinen PC');
      await main.evaluate(w => w.setSize(560, 440));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await page.screenshot({ path: 'artifacts/openhiatus-desktop-takeover-compact.png' });
      await page.locator('.desktop-control-notice').getByRole('button', { name: /Stopp/ }).click();
      await expect.poll(async () => (await snapshot()).jobs.at(-1).status, { timeout: 30000 }).toBe('interrupted'); release();
    }
    await expect.poll(async () => (await snapshot()).desktopControl).toBe('free'); await expect.poll(overlays).toBe(0);
  }
  assert.deepEqual(errors, []);
  await targetWindow.evaluate(w => w.destroy()); await instance.close(); instance = undefined;
  instance = await electron.launch(options); const restarted = await instance.firstWindow();
  assert.equal((await restarted.evaluate(() => window.openhiatus.snapshot())).desktopControl, 'free');
  const proof = { status: 'passed', checks: ['background task without input lock', 'real dialog-to-worker computer tool', 'native input guard acknowledged before desktop use', 'mandatory overlay despite disabled background indicator', 'all display bounds', 'no overlay API or focus theft', 'visible frame excluded from actual computer capture', 'actual agent click through the passive overlay', 'reservation between model calls', 'completion and UI Stop restore free state', 'compact window', 'restart does not persist lock'], limitation: 'Escape filtering is verified by the native policy harness; this UI run uses the app Stop button.' };
  await writeFile('artifacts/openhiatus-desktop-control.json', JSON.stringify(proof, null, 2)); console.log(JSON.stringify(proof, null, 2));
} finally { release(); if (instance) await instance.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
