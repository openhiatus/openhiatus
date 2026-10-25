import { _electron as electron, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createUiAppFixture } from './helpers/ui-app-fixture.mjs';

await mkdir('.test-data', { recursive: true }); await mkdir('artifacts', { recursive: true });
const profile = await mkdtemp(path.resolve('.test-data/i18n-'));
const fixture = process.env.OPENHIATUS_TEST_APP ? undefined : await createUiAppFixture('i18n-build');
const catalog = JSON.parse(await readFile('src/shared/locales/messages.json', 'utf8'));
const languages = ['en', 'es', 'fr', 'de', 'zh-CN', 'ja', 'pt-BR'];
const columns = ['en', 'es', 'fr', 'zh-CN', 'ja', 'pt-BR'];
const tr = (language, source) => language === 'de' ? source : catalog[source][columns.indexOf(language)];
let instance, release, dialogCalls = 0, workerCalls = 0;
const gate = new Promise(resolve => { release = resolve; });
const errors = [], userText = 'Speichern <b>日本語 & Español</b> {0}';
const server = createServer(async (request, response) => {
  try {
    let body = ''; for await (const chunk of request) body += chunk;
    const input = JSON.parse(body); let tool;
    if (input.model === 'language-dialog') { dialogCalls++; if (dialogCalls === 1) tool = 'start_task'; }
    else { assert.equal(input.model, 'language-worker'); workerCalls++; await gate; }
    if (response.destroyed) return;
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta, finish_reason = null) => response.write(`data: ${JSON.stringify({ id: 'language-check', object: 'chat.completion.chunk', model: input.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
    chunk({ role: 'assistant' });
    if (tool) {
      chunk({ tool_calls: [{ index: 0, id: 'synthetic-language-task', type: 'function', function: { name: tool,
        arguments: JSON.stringify({ requestId: 'language-task', title: userText, acknowledgement: 'Synthetic acknowledgement', resources: [path.join(profile, 'synthetic.txt')] }) } }] });
      chunk({}, 'tool_calls');
    } else { chunk({ content: 'Synthetic result — 日本語' }); chunk({}, 'stop'); }
    response.end('data: [DONE]\n\n');
  } catch (error) { errors.push(String(error)); if (!response.headersSent) response.writeHead(500); response.end('{}'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const options = { executablePath: process.env.OPENHIATUS_TEST_APP || path.resolve('node_modules/electron/dist/electron.exe'),
  args: [...(fixture ? [fixture.appDirectory] : []), `--data-dir=${profile}`], env };
try {
  instance = await electron.launch(options); let page = await instance.firstWindow();
  page.setDefaultTimeout(10000);
  const main = await instance.browserWindow(page);
  page.on('pageerror', error => errors.push(error.message));
  const nav = index => page.locator('.sidebar nav button').nth(index);
  const selector = page.locator('select[id$="-ui-language"]');
  const snapshot = () => page.evaluate(() => window.openhiatus.snapshot());
  const settleSidebar = () => expect.poll(() => page.locator('.sidebar-region').evaluate(element =>
    Math.abs(element.getBoundingClientRect().width - parseFloat(getComputedStyle(document.querySelector('.workspace-shell')).getPropertyValue('--sidebar-width'))))).toBeLessThan(1);
  const change = async language => {
    await nav(5).click(); await selector.selectOption(language);
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect.poll(async () => (await snapshot()).preferences.uiLanguage).toBe(language);
  };
  // A language can be chosen before consenting to full access.
  for (const language of languages) {
    await change(language);
    await expect(page.locator('#full-access-title')).toHaveText(tr(language, 'openHiatus arbeitet mit Vollzugriff'));
    const navigation = ['Gespräch', 'Aufgaben', 'Dienste', 'Gedächtnis', 'Skills', 'Einstellungen'];
    for (const [index, source] of navigation.entries()) await expect(nav(index)).toHaveAccessibleName(tr(language, source));
    await expect(selector.locator('option')).toHaveCount(7);
  }
  await page.evaluate(async baseUrl => {
    await window.openhiatus.acknowledgeFullAccess();
    await window.openhiatus.saveProvider({ id: 'local', baseUrl, models: ['language-dialog', 'language-worker'] });
    await window.openhiatus.savePreferences({ model: 'local/language-worker', dialogModel: 'local/language-dialog', memoryModel: 'local/language-dialog',
      memoryAutoSummarize: false, speakReplies: false, earcons: false, activityOverlayEnabled: true });
  }, `http://127.0.0.1:${server.address().port}/v1`);
  await page.locator('#anthropic-key').fill('synthetic-unsaved-value');
  await page.evaluate(text => window.openhiatus.send(text, 'language-task'), userText);
  await expect.poll(() => workerCalls).toBe(1);
  const jobId = (await snapshot()).jobs[0].id;
  await nav(0).click(); await page.locator('.composer textarea').fill(userText + ' draft');
  await nav(5).click();

  for (const language of languages) {
    await change(language);
    assert.equal((await snapshot()).jobs[0].id, jobId);
    assert.equal((await snapshot()).jobs[0].status, 'running');
    assert.equal((await snapshot()).desktopControl, 'free');
    await expect(page.locator('#anthropic-key')).toHaveValue('synthetic-unsaved-value');
    await expect(page.locator('.settings-feature h1')).toHaveText(tr(language, 'Deine Einstellungen.'));
    // The same active background task refreshes its native overlay when only language changes.
    await main.evaluate(w => w.minimize());
    let overlay;
    await expect.poll(async () => {
      overlay = instance.windows().find(candidate => candidate !== page && candidate.url().startsWith('data:'));
      return overlay ? await overlay.locator('#status').count() : 0;
    }).toBe(1);
    await expect(overlay.locator('html')).toHaveAttribute('lang', language);
    await expect(overlay.locator('#status')).toHaveText(tr(language, 'Arbeitet'));
    await main.evaluate(w => { w.restore(); w.show(); });
    for (const [index, view] of ['conversation', 'tasks', 'services', 'memory', 'skills', 'settings'].entries()) {
      await nav(index).click();
      const host = page.locator(`.${view}-view-host`); await expect(host).toBeVisible();
      if (index === 0) {
        await expect(page.locator('.composer textarea')).toHaveValue(userText + ' draft');
        assert.ok((await snapshot()).messages.some(message => message.role === 'user' && message.text === userText));
      }
      if (index === 1) await expect(host.locator('.tasks-detail').first()).toContainText(userText);
      if (index === 3) await expect(host.locator('.memory-loading')).toHaveCount(0);
      await main.evaluate(w => w.setSize(560, 720));
      await settleSidebar();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      // Overflow within the active workspace also matters; body-only checks can miss clipped labels.
      assert.equal(await host.evaluate(element => element.scrollWidth > element.clientWidth + 2), false, `${language}: ${view} overflow`);
      if (index === 5) {
        await page.locator('.settings-scroll').evaluate(element => { element.scrollTop = 0; });
        await page.screenshot({ path: `artifacts/openhiatus-language-${language}-compact.png` });
      }
      await main.evaluate(w => w.setSize(1360, 900));
      await settleSidebar();
    }
    await page.screenshot({ path: `artifacts/openhiatus-language-${language}.png` });
  }
  assert.equal(workerCalls, 1, 'language changes must not replay or cancel the task');
  release(); await expect.poll(async () => (await snapshot()).jobs[0].status, { timeout: 30000 }).toBe('completed');
  await change('en');
  await nav(3).click();
  await page.getByRole('button', { name: /SOUL\.md/ }).first().click();
  await page.locator('.memory-document').getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('#memory-document-editor').fill(userText + ' memory draft');
  for (const language of languages) {
    await change(language); await nav(3).click();
    await expect(page.locator('#memory-document-editor')).toHaveValue(userText + ' memory draft');
  }
  await change('ja');
  assert.deepEqual(errors, []);
  await instance.close(); instance = undefined;
  instance = await electron.launch(options); page = await instance.firstWindow();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  const restored = await snapshot(); assert.equal(restored.preferences.uiLanguage, 'ja');
  assert.equal(restored.jobs[0].title, userText);
  const proof = { status: 'passed', languages, checks: ['seven real UI selections before consent', 'navigation and full-access disclosure', 'six workspaces at 560px and 1360px',
    'conversation, credentials and memory drafts survive changes', 'user content preserved verbatim', 'running worker is neither replayed nor cancelled',
    'background overlay language changes without a phase change', 'preference survives restart'], limitation: 'Synthetic local provider; no cloud credentials or normal user profile.' };
  await writeFile('artifacts/openhiatus-i18n.json', JSON.stringify(proof, null, 2)); console.log(JSON.stringify(proof, null, 2));
} finally { release(); if (instance) await instance.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }

