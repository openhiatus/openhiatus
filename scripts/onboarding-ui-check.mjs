import { _electron as electron, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createUiAppFixture } from './helpers/ui-app-fixture.mjs';

await mkdir('.test-data', { recursive: true }); await mkdir('artifacts', { recursive: true });
const profile = process.env.OPENHIATUS_TEST_PROFILE ? path.resolve(process.env.OPENHIATUS_TEST_PROFILE) : await mkdtemp(path.resolve('.test-data/onboarding-'));
if (!profile.startsWith(path.resolve('.test-data') + path.sep)) throw Error('Onboarding tests require a profile inside .test-data.');
const fixture = process.env.OPENHIATUS_TEST_APP ? undefined : await createUiAppFixture('onboarding-build');
let calls = 0, instance, delayed;
const errors = [];
const server = createServer(async (request, response) => {
  try {
    let body = ''; for await (const chunk of request) body += chunk;
    const input = JSON.parse(body); calls++;
    assert.equal(input.model, 'setup-test'); assert.equal(input.messages.length, 1);
    assert.ok(!input.tools?.length); assert.match(JSON.stringify(input.messages), /connection check/);
    if (calls === 1) { response.writeHead(401, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: { message: 'Synthetic account failure' } })); return; }
    const reply = () => {
      if (response.destroyed) return;
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const [delta, finish_reason] of [[{ role: 'assistant', content: 'Hallo! Wie kann ich dir helfen?' }, null], [{}, 'stop']]) {
        response.write(`data: ${JSON.stringify({ id: 'setup-test', object: 'chat.completion.chunk', model: input.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
      }
      response.end('data: [DONE]\n\n');
    };
    if (calls === 2) delayed = reply; else reply();
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
  const snapshot = () => page.evaluate(() => window.openhiatus.snapshot());
  await page.evaluate(() => window.openhiatus.savePreferences({ uiLanguage: 'de', memoryAutoSummarize: false, speakReplies: false, earcons: false }));
  let setup = page.locator('.onboarding-view');
  await expect(setup).toBeVisible();
  await expect(setup.getByRole('button', { name: 'Weiter', exact: true })).toBeDisabled();
  const main = await instance.browserWindow(page);
  const catalog = JSON.parse(await readFile('src/shared/locales/messages.json', 'utf8'));
  async function checkStep(title) {
    const window = await instance.browserWindow(page);
    for (const [width, height] of [[560, 440], [1360, 900]]) {
      await window.evaluate((window, size) => window.setContentSize(...size), [width, height]);
      for (const language of ['de', 'en', 'es', 'fr', 'zh-CN', 'ja', 'pt-BR']) {
        await page.evaluate(language => window.openhiatus.savePreferences({ uiLanguage: language }), language);
        await expect(page.locator('html')).toHaveAttribute('lang', language);
        await expect(setup.locator('h1')).toHaveText(language === 'de' ? title : catalog[title][['en', 'es', 'fr', 'zh-CN', 'ja', 'pt-BR'].indexOf(language)]);
        assert.ok(await setup.locator('.onboarding-scroll').evaluate(element => element.scrollWidth <= element.clientWidth + 1));
        assert.ok(await setup.locator('.onboarding-actions').evaluate(element => element.getBoundingClientRect().bottom <= innerHeight));
      }
    }
    await page.evaluate(() => window.openhiatus.savePreferences({ uiLanguage: 'de' }));
  }
  for (const [width, height] of [[560, 440], [1360, 900]]) {
    await main.evaluate((window, size) => window.setContentSize(...size), [width, height]);
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
    for (const language of ['de', 'en', 'es', 'fr', 'zh-CN', 'ja', 'pt-BR']) {
      await setup.getByRole('combobox', { name: 'Language · 语言', exact: true }).selectOption(language);
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      const heading = language === 'de' ? 'Willkommen bei openHiatus' : catalog['Willkommen bei openHiatus'][['en', 'es', 'fr', 'zh-CN', 'ja', 'pt-BR'].indexOf(language)];
      await expect(setup.locator('h1')).toHaveText(heading);
      assert.ok(await setup.evaluate(element => element.scrollWidth <= element.clientWidth + 1));
      assert.ok(await setup.locator('.onboarding-actions').evaluate(element => { const rect = element.getBoundingClientRect(); return rect.top >= 0 && rect.bottom <= innerHeight; }));
    }
    await setup.getByRole('combobox', { name: 'Language · 语言', exact: true }).selectOption('de');
    await page.screenshot({ path: `artifacts/openhiatus-onboarding-${width}.png` });
  }
  assert.equal(calls, 0);
  await setup.getByRole('button', { name: 'Verstanden, Vollzugriff bestätigen', exact: true }).click();
  await setup.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(setup.locator('h1')).toHaveText('Konto verbinden');
  await expect(setup.locator('h1')).toBeFocused();
  await checkStep('Konto verbinden');
  await setup.getByRole('button', { name: 'Später fortsetzen', exact: true }).click();
  await expect(setup).toHaveCount(0);
  await instance.close(); instance = undefined;
  page = await launch(); setup = page.locator('.onboarding-view');
  await expect(setup).toHaveCount(0);
  await page.getByRole('button', { name: 'Einrichtung fortsetzen', exact: true }).click();
  await expect(setup.locator('h1')).toHaveText('Konto verbinden');
  await setup.getByText('Anderen Anbieter oder lokalen Server verwenden', { exact: true }).click();
  await setup.locator('#setup-provider').selectOption('local');
  await setup.locator('#setup-local-url').fill(`http://127.0.0.1:${server.address().port}/v1`);
  await setup.locator('#setup-local-models').fill('setup-test');
  await setup.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(setup.getByRole('button', { name: 'Weiter', exact: true })).toBeEnabled();
  await setup.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(setup.locator('h1')).toHaveText('Sprechen oder schreiben');
  await setup.getByText('Mikrofon und Stimme einrichten (optional)', { exact: true }).click();
  await checkStep('Sprechen oder schreiben');
  assert.equal((await snapshot()).connections.speech, 'missing'); assert.equal(calls, 0);
  await instance.close(); instance = undefined;
  page = await launch(); setup = page.locator('.onboarding-view');
  await expect(setup.locator('h1')).toHaveText('Sprechen oder schreiben');
  await setup.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(setup.locator('h1')).toHaveText('Die erste Antwort');
  await checkStep('Die erste Antwort');
  const finish = () => setup.getByRole('button', { name: 'Einrichtung abschließen', exact: true });
  const check = () => setup.getByRole('button', { name: 'Erste Antwort testen', exact: true });
  await expect(finish()).toBeDisabled(); await check().click();
  await expect(setup.locator('.onboarding-error')).toBeVisible({ timeout: 15000 }); await expect(finish()).toBeDisabled();
  await check().click(); await expect.poll(() => calls).toBe(2);
  await page.keyboard.press('Escape');
  await expect(setup.locator('.onboarding-error')).toBeVisible();
  delayed(); await expect(finish()).toBeDisabled(); await expect(setup.locator('.onboarding-success')).toHaveCount(0);
  await check().click();
  await expect(setup.locator('.onboarding-success')).toContainText('Hallo!', { timeout: 15000 });
  await page.screenshot({ path: 'artifacts/openhiatus-onboarding-complete.png' });
  await finish().click(); await expect(setup).toHaveCount(0);
  assert.equal((await snapshot()).preferences.onboarding.status, 'complete');
  assert.equal((await snapshot()).workItems?.length ?? 0, 0);
  await instance.close(); instance = undefined;
  page = await launch(); setup = page.locator('.onboarding-view');
  await expect(setup).toHaveCount(0); assert.equal((await snapshot()).preferences.onboarding.status, 'complete');
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.getByRole('button', { name: 'Schritt für Schritt einrichten', exact: true }).click();
  await expect(setup).toBeVisible(); await expect(finish()).toBeDisabled();
  await instance.close(); instance = undefined;
  const statePath = path.join(profile, 'state.json'), stored = JSON.parse(await readFile(statePath, 'utf8'));
  delete stored.state.preferences.onboarding; await writeFile(statePath, JSON.stringify(stored));
  page = await launch(); await expect(page.locator('.onboarding-view')).toHaveCount(0);
  assert.equal((await snapshot()).preferences.onboarding, undefined);
  assert.equal(calls, 3); assert.deepEqual(errors, []);
  console.log('Onboarding UI passed: seven languages, compact layout, explicit consent, defer/restart/resume, optional voice, real tool-free model check, failure/retry, Esc cancellation, completion/restart/reopen.');
} catch (error) {
  if (instance) await (await instance.firstWindow()).screenshot({ path: 'artifacts/openhiatus-onboarding-failure.png' }).catch(() => {});
  throw error;
} finally { await instance?.close().catch(() => {}); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
