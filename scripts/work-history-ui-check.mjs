import { _electron as electron, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createUiAppFixture } from './helpers/ui-app-fixture.mjs';

await mkdir('.test-data', { recursive: true }); await mkdir('artifacts', { recursive: true });
const profile = await mkdtemp(path.resolve('.test-data/work-history-'));
const fixture = process.env.OPENHIATUS_TEST_APP ? undefined : await createUiAppFixture('work-history-build');
const target = path.join(profile, 'synthetic-project.txt');
await writeFile(target, 'Synthetic project: PDF export remains open.');
let dialogCalls = 0, workerCalls = 0, instance;
const errors = [];
const server = createServer(async (request, response) => {
  try {
    let body = ''; for await (const chunk of request) body += chunk;
    const input = JSON.parse(body); let tool, args;
    if (input.model === 'history-dialog') {
      dialogCalls++;
      if (dialogCalls === 2) { tool = 'start_task'; args = { requestId: 'project-read', title: 'Projektdatei prüfen', acknowledgement: 'Ich prüfe die Projektdatei.', resources: [target] }; }
    } else {
      assert.equal(input.model, 'history-worker'); workerCalls++;
      if (workerCalls <= 2) { tool = 'read'; args = { path: workerCalls === 1 ? target : path.join(profile, 'missing-synthetic.txt') }; }
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta, finish_reason = null) => response.write(`data: ${JSON.stringify({ id: 'history-test', object: 'chat.completion.chunk', model: input.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
    chunk({ role: 'assistant' });
    if (tool) { chunk({ tool_calls: [{ index: 0, id: `history-${input.model}-${dialogCalls}-${workerCalls}`, type: 'function', function: { name: tool, arguments: JSON.stringify(args) } }] }); chunk({}, 'tool_calls'); }
    else { chunk({ content: input.model === 'history-worker' ? 'Projektdatei gelesen. Zweite Datei fehlt; PDF-Export bleibt offen.' : dialogCalls === 1 ? 'Analyse: Der nächste Schritt ist die Dateiprüfung.' : 'Die Dateiprüfung wurde übergeben.' }); chunk({}, 'stop'); }
    response.end('data: [DONE]\n\n');
  } catch (error) { errors.push(String(error)); if (!response.headersSent) response.writeHead(500); response.end('{}'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const launch = async () => {
  instance = await electron.launch({ executablePath: process.env.OPENHIATUS_TEST_APP || path.resolve('node_modules/electron/dist/electron.exe'), args: [...(fixture ? [fixture.appDirectory] : []), `--data-dir=${profile}`], env, timeout: 30000 });
  const page = await instance.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('.language-trigger')).toBeEnabled({ timeout: 30000 }); return page;
};
try {
  let page = await launch();
  await page.getByRole('button', { name: 'Verstanden, Vollzugriff bestätigen', exact: true }).click();
  await page.evaluate(async baseUrl => {
    await window.openhiatus.saveProvider({ id: 'local', baseUrl, models: ['history-dialog', 'history-worker'] });
    await window.openhiatus.savePreferences({ dialogModel: 'local/history-dialog', model: 'local/history-worker', memoryAutoSummarize: false, speakReplies: false, earcons: false });
  }, `http://127.0.0.1:${server.address().port}/v1`);
  const snapshot = () => page.evaluate(() => window.openhiatus.snapshot());
  await expect.poll(async () => (await snapshot()).connections.agent).toBe('ready');
  await page.evaluate(() => window.openhiatus.send('Analysiere das synthetische Projekt.', 'history-analysis'));
  await expect.poll(async () => (await snapshot()).task.status, { timeout: 30000 }).toBe('completed');
  await page.evaluate(() => window.openhiatus.send('Prüfe jetzt die Projektdatei.', 'history-file'));
  await expect.poll(async () => (await snapshot()).jobs?.[0]?.status, { timeout: 30000 }).toBe('completed');
  await expect.poll(async () => (await snapshot()).task.status).toBe('completed');
  const state = await snapshot();
  assert.equal(state.workItems.length, 3);
  const child = state.workItems.find(item => item.kind === 'background');
  assert.equal(child.parentId, 'request:history-file');
  assert.deepEqual(child.actions.map(action => [action.tool, action.status]), [['read', 'completed'], ['read', 'failed']]);
  assert.ok(child.actions[0].target.endsWith('synthetic-project.txt'));
  assert.equal(state.workItems.find(item => item.id === 'request:history-file').actions[0].tool, 'start_task');
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name: 'Aufgaben', exact: true }).click();
  await page.locator('[data-work-id="request:history-file"]').click();
  await page.locator('.work-history-child').click();
  await expect(page.locator('.work-action-list li')).toHaveCount(2);
  await expect(page.locator('.work-history-detail')).toContainText('PDF-Export bleibt offen');
  const main = await instance.browserWindow(page);
  const catalog = JSON.parse(await readFile('src/shared/locales/messages.json', 'utf8'));
  for (const [width, height] of [[560, 440], [1360, 900]]) {
    await main.evaluate((window, size) => window.setContentSize(size[0], size[1]), [width, height]);
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
    for (const language of ['de', 'en', 'es', 'fr', 'zh-CN', 'ja', 'pt-BR']) {
      await page.evaluate(language => window.openhiatus.savePreferences({ uiLanguage: language }), language);
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      const heading = language === 'de' ? 'Arbeitsverlauf' : catalog.Arbeitsverlauf[['en', 'es', 'fr', 'zh-CN', 'ja', 'pt-BR'].indexOf(language)];
      await expect(page.locator('.work-history h1')).toHaveText(heading);
      assert.ok(await page.locator('.work-history-panel').evaluate(element => element.scrollWidth <= element.clientWidth + 1));
    }
    await page.screenshot({ path: `artifacts/openhiatus-work-history-${width}.png` });
  }
  await page.evaluate(async () => { await window.openhiatus.savePreferences({ uiLanguage: 'de' }); await window.openhiatus.newConversation(); });
  assert.equal((await snapshot()).workItems.length, 3);
  await instance.close(); instance = undefined;
  page = await launch();
  assert.equal((await snapshot()).workItems.length, 3);
  assert.equal((await snapshot()).workItems.find(item => item.kind === 'background').actions[1].status, 'failed');
  assert.equal(dialogCalls, 3); assert.equal(workerCalls, 3); assert.deepEqual(errors, []);
  console.log('Work history UI passed: real tool outcomes, parent linkage, seven languages, compact/full layout, new conversation and restart without replay.');
} catch (error) {
  if (instance) await (await instance.firstWindow()).screenshot({ path: 'artifacts/openhiatus-work-history-failure.png' }).catch(() => {});
  throw error;
} finally { await instance?.close().catch(() => {}); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
