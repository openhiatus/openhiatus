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
let calls = 0, dialogCalls = 0, instance, delayed;
const models = [];
const errors = [];
const server = createServer(async (request, response) => {
  try {
    let body = ''; for await (const chunk of request) body += chunk;
    const input = JSON.parse(body), setupCheck = JSON.stringify(input.messages).includes('connection check');
    if (setupCheck) {
      calls++; models.push(input.model);
      assert.ok(['setup-test', 'setup-second'].includes(input.model)); assert.equal(input.messages.length, 1);
      assert.ok(!input.tools?.length); assert.ok(!JSON.stringify(input.messages).includes('Nova'));
      if (calls === 1) { response.writeHead(401, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: { message: 'Synthetic account failure' } })); return; }
    } else {
      dialogCalls++; assert.equal(input.model, 'setup-second');
      const context = JSON.stringify(input.messages.filter(message => ['system', 'developer'].includes(message.role)));
      for (const expected of ['Nova', 'Camille', 'Synthetic beginner context', 'Geduldige Computerhilfe', 'kleinen, leicht', 'Please avoid jargon.', 'Keep custom content.']) assert.ok(context.includes(expected), expected);
    }
    const reply = () => {
      if (response.destroyed) return;
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const [delta, finish_reason] of [[{ role: 'assistant', content: 'Hallo! Wie kann ich dir helfen?' }, null], [{}, 'stop']]) {
        response.write(`data: ${JSON.stringify({ id: 'setup-test', object: 'chat.completion.chunk', model: input.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
      }
      response.end('data: [DONE]\n\n');
    };
    if (setupCheck && calls === 2) delayed = reply; else reply();
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
  const jump = title => setup.getByRole('navigation', { name: 'Einrichtung', exact: true }).getByRole('button', { name: title, exact: true }).click();
  await jump('Die erste Antwort');
  await expect(setup.getByRole('button', { name: 'Erste Antwort testen', exact: true })).toBeDisabled();
  await jump('Willkommen bei openHiatus');
  await setup.getByRole('button', { name: 'Verstanden, Vollzugriff bestätigen', exact: true }).click();
  await setup.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(setup.locator('h1')).toHaveText('Du und dein Agent');
  await checkStep('Du und dein Agent');
  const originalIdentity = await page.evaluate(async () => (await window.openhiatus.memorySnapshot()).documents.filter(doc => ['agent', 'soul', 'user', 'core'].includes(doc.id)));
  await setup.locator('#setup-agent-name').fill('Discard this draft');
  await setup.getByRole('button', { name: 'Überspringen', exact: true }).click();
  assert.deepEqual(await page.evaluate(async () => (await window.openhiatus.memorySnapshot()).documents.filter(doc => ['agent', 'soul', 'user', 'core'].includes(doc.id))), originalIdentity);
  await jump('Du und dein Agent');
  await expect(setup.locator('#setup-agent-name')).toHaveValue('');
  await setup.locator('#setup-agent-name').fill('Nova');
  await page.evaluate(async () => {
    const doc = (await window.openhiatus.memorySnapshot()).documents.find(doc => doc.id === 'agent');
    await window.openhiatus.editMemory(doc.id, doc.content + '\nKeep custom content.\n', doc.version);
  });
  await setup.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(setup.locator('.onboarding-error')).toBeVisible();
  await expect(setup.locator('#setup-agent-name')).toHaveValue('Nova');
  await expect(setup.locator('h1')).toHaveText('Du und dein Agent');
  await setup.getByRole('button', { name: 'Neu laden und Entwurf verwerfen', exact: true }).click();
  await expect(setup.locator('#setup-agent-name')).toHaveValue('');
  await setup.locator('#setup-agent-name').fill('Nova');
  await setup.locator('#setup-user-name').fill('Camille');
  await setup.locator('#setup-agent-role').fill('Geduldige Computerhilfe');
  await setup.locator('#setup-user-context').fill('Synthetic beginner context');
  await setup.locator('#setup-reply-style').selectOption('guided');
  await setup.locator('#setup-reply-notes').fill('Please avoid jargon.');
  await page.screenshot({ path: 'artifacts/openhiatus-onboarding-identity.png' });
  // A direct jump saves the identity, just like Next or Continue later.
  await jump('Konto verbinden');
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
  await setup.getByRole('button', { name: 'Später fortsetzen', exact: true }).click();
  await page.locator('.connection-summary').click();
  await expect(setup.locator('h1')).toHaveText('Willkommen bei openHiatus');
  await jump('Du und dein Agent');
  await expect(setup.locator('#setup-agent-name')).toHaveValue('Nova');
  await expect(setup.locator('#setup-user-name')).toHaveValue('Camille');
  await expect(setup.locator('#setup-reply-style')).toHaveValue('guided');
  await jump('Konto verbinden');
  await setup.getByText('Anderen Anbieter oder lokalen Server verwenden', { exact: true }).click();
  await setup.locator('#setup-provider').selectOption('local');
  await setup.locator('#setup-local-url').fill(`http://127.0.0.1:${server.address().port}/v1`);
  await setup.locator('#setup-local-models').fill('setup-test, setup-second');
  await setup.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(setup.getByRole('button', { name: 'Weiter', exact: true })).toBeEnabled();
  await expect(setup.locator('#setup-model')).toBeVisible();
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
  const workModel = (await snapshot()).preferences.model;
  await setup.locator('#setup-model').selectOption('local/setup-second');
  await expect(finish()).toBeDisabled(); await expect(setup.locator('.onboarding-success')).toHaveCount(0);
  await setup.locator('#setup-model').selectOption('local/setup-test');
  await expect(finish()).toBeDisabled();
  await setup.locator('#setup-model').selectOption('local/setup-second');
  await check().click(); await expect(finish()).toBeEnabled();
  assert.equal((await snapshot()).preferences.model, workModel);
  assert.deepEqual(models, ['setup-test', 'setup-test', 'setup-test', 'setup-second']);
  await page.screenshot({ path: 'artifacts/openhiatus-onboarding-complete.png' });
  await finish().click(); await expect(setup).toHaveCount(0);
  assert.equal((await snapshot()).preferences.onboarding.status, 'complete');
  assert.equal((await snapshot()).workItems?.length ?? 0, 0);
  await page.getByRole('textbox', { name: 'Dein Auftrag', exact: true }).fill('Synthetic onboarding conversation');
  await page.getByRole('button', { name: 'Auftrag senden', exact: true }).click();
  await expect.poll(() => dialogCalls).toBe(1);
  await expect.poll(async () => (await snapshot()).messages.some(message => message.role === 'assistant' && message.text.includes('Hallo!'))).toBe(true);
  await instance.close(); instance = undefined;
  page = await launch(); setup = page.locator('.onboarding-view');
  await expect(setup).toHaveCount(0); assert.equal((await snapshot()).preferences.onboarding.status, 'complete');
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.getByRole('button', { name: 'Schritt für Schritt einrichten', exact: true }).click();
  await expect(setup.locator('h1')).toHaveText('Willkommen bei openHiatus');
  await jump('Die erste Antwort'); await expect(finish()).toBeDisabled();
  await jump('Du und dein Agent'); await expect(setup.locator('#setup-agent-name')).toHaveValue('Nova');
  await instance.close(); instance = undefined;
  const statePath = path.join(profile, 'state.json'), stored = JSON.parse(await readFile(statePath, 'utf8'));
  delete stored.state.preferences.onboarding; await writeFile(statePath, JSON.stringify(stored));
  page = await launch(); await expect(page.locator('.onboarding-view')).toHaveCount(0);
  assert.equal((await snapshot()).preferences.onboarding, undefined);
  assert.equal(calls, 4); assert.equal(dialogCalls, 1); assert.deepEqual(errors, []);
  console.log('Onboarding UI passed: seven languages, compact layout, direct step navigation, optional identity/skip, stale edits, persistence/restart, real conversation identity, consent, defer/resume, optional voice, model selection/reset, tool-free check, failure/retry, Esc, completion and reopening from the start.');
} catch (error) {
  if (instance) await (await instance.firstWindow()).screenshot({ path: 'artifacts/openhiatus-onboarding-failure.png' }).catch(() => {});
  throw error;
} finally { await instance?.close().catch(() => {}); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
