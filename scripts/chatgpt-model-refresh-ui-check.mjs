import { _electron as electron, expect } from '@playwright/test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createUiAppFixture } from './helpers/ui-app-fixture.mjs';

await mkdir('artifacts', { recursive: true });
const fixture = await createUiAppFixture('chatgpt-model-refresh-ui');
const profile = await mkdtemp(path.resolve('.test-data/chatgpt-model-profile-'));
// Seed only this new profile with a synthetic, Windows-encrypted existing account.
// The real Main, auth, provider catalog, IPC, preload and renderer stay in use.
await writeFile(path.join(fixture.appDirectory, 'dist/main.cjs'), `
const { app, safeStorage } = require('electron');
const { existsSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const profile = ${JSON.stringify(profile)};
globalThis.__catalogCalls = 0;
globalThis.__unexpectedRequests = [];
globalThis.__catalogMode = 'old';
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url !== 'https://api.openai.com/v1/models') {
    globalThis.__unexpectedRequests.push(url); throw new Error('Unexpected external request in synthetic ChatGPT fixture');
  }
  if (new Headers(init?.headers).get('authorization') !== 'Bearer synthetic-chatgpt-access') throw new Error('Unexpected synthetic credential');
  globalThis.__catalogCalls++;
  if (globalThis.__catalogMode === 'pending') await new Promise((resolve, reject) => {
    const abort = () => reject(new Error('Synthetic request aborted'));
    init.signal.addEventListener('abort', abort, { once: true });
    globalThis.__releaseCatalog = () => { init.signal.removeEventListener('abort', abort); resolve(); };
  });
  const models = [{ slug: 'gpt-6.1-sol', display_name: 'GPT-6.1 Sol', visibility: 'list' }];
  if (globalThis.__catalogMode === 'terra') models.push({ slug: 'gpt-6.1-terra', display_name: 'GPT-6.1 Terra', visibility: 'list' });
  const failed = globalThis.__catalogMode === 'error';
  return new Response(JSON.stringify(failed ? { error: 'temporarily_unavailable' } : { models }), {
    status: failed ? 503 : 200, headers: { 'content-type': 'application/json' }
  });
};
app.whenReady().then(() => {
  const credentialFile = path.join(profile, 'credentials.json');
  if (!existsSync(credentialFile)) {
    const hostId = 'urn:uuid:00000000-0000-4000-8000-000000000030';
    writeFileSync(path.join(profile, 'chatgpt-host.json'), JSON.stringify({ id: hostId }));
    const record = { version: 1, hostId, clientId: 'oaiapp_synthetic_refresh', subject: 'synthetic-subject',
      email: 'model-refresh@example.test', issuer: 'https://auth.openai.com', accessToken: 'synthetic-chatgpt-access',
      refreshToken: 'synthetic-chatgpt-refresh', expiresAt: Date.now() + 86400000,
      scopes: ['chatgpt.tokens.use.direct'], models: [{ id: 'chatgpt/gpt-6.1-sol', label: 'GPT-6.1 Sol', provider: 'chatgpt' }] };
    writeFileSync(credentialFile, JSON.stringify({ version: 1, keys: { 'provider:chatgpt': safeStorage.encryptString(JSON.stringify(record)).toString('base64') } }));
  }
  require('./real-main.cjs');
});
`);
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const errors = [], sol = 'chatgpt/gpt-6.1-sol', terra = 'chatgpt/gpt-6.1-terra';
let instance;
async function launch() {
  instance = await electron.launch({ executablePath: path.resolve('node_modules/electron/dist/electron.exe'), args: [fixture.appDirectory, `--data-dir=${profile}`], env, timeout: 30000 });
  const page = await instance.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('.language-trigger')).toBeEnabled({ timeout: 30000 });
  return page;
}
async function settings(page) {
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name: 'Einstellungen', exact: true }).click();
  return page.locator('[data-provider="chatgpt"]');
}
try {
  let page = await launch();
  await page.getByRole('button', { name: 'Verstanden, Vollzugriff bestätigen', exact: true }).click();
  await page.evaluate(() => window.openhiatus.savePreferences({ speakReplies: false, earcons: false, memoryAutoSummarize: false, chatgptBackgroundUsage: false }));
  let card = await settings(page);
  const snapshot = () => page.evaluate(() => window.openhiatus.snapshot());
  assert.equal((await snapshot()).chatgpt.status, 'signed-in');
  assert.equal((await snapshot()).models.some(model => model.id === terra), false);
  assert.equal(await instance.evaluate(() => globalThis.__catalogCalls), 0);
  const refresh = card.getByRole('button', { name: 'Modelle aktualisieren', exact: true });
  await refresh.click(); await expect(card.getByText('Modellliste aktualisiert.', { exact: true })).toBeVisible();
  assert.equal((await snapshot()).models.some(model => model.id === terra), false, 'refresh must not invent account availability');

  await instance.evaluate(() => { globalThis.__catalogMode = 'error'; });
  await refresh.click();
  await expect(page.getByText(/ChatGPT-Anfrage fehlgeschlagen \(HTTP 503/).first()).toBeVisible();
  await expect(refresh).toBeEnabled();
  assert.equal((await snapshot()).preferences.dialogModel, sol);
  assert.equal((await snapshot()).chatgpt.status, 'signed-in');
  await expect(card.getByText('Modellliste aktualisiert.', { exact: true })).toHaveCount(0);

  await instance.evaluate(() => { globalThis.__catalogMode = 'pending'; });
  await refresh.click(); await expect(refresh).toBeDisabled();
  await expect(card.getByRole('button', { name: 'Abmelden', exact: true })).toBeDisabled();
  await expect.poll(() => instance.evaluate(() => typeof globalThis.__releaseCatalog)).toBe('function');
  await instance.evaluate(() => { globalThis.__catalogMode = 'terra'; globalThis.__releaseCatalog(); });
  await expect(card.getByText('Modellliste aktualisiert.', { exact: true })).toBeVisible();
  for (const role of ['model', 'dialogModel', 'memoryModel']) {
    await expect(page.locator(`#role-${role}`)).toHaveValue(sol);
    await page.locator(`#role-${role}`).selectOption(role === 'model' ? `${terra}::fast` : terra);
  }
  await expect.poll(async () => (await snapshot()).preferences.dialogModel).toBe(terra);
  await card.screenshot({ path: 'artifacts/openhiatus-chatgpt-modelle-aktualisiert.png' });
  const languages = [['en', 'Refresh models'], ['es', 'Actualizar modelos'], ['fr', 'Actualiser les modèles'], ['zh-CN', '刷新模型'], ['ja', 'モデルを更新'], ['pt-BR', 'Atualizar modelos'], ['de', 'Modelle aktualisieren']];
  await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 760));
  for (const [uiLanguage, label] of languages) {
    await page.evaluate(uiLanguage => window.openhiatus.savePreferences({ uiLanguage }), uiLanguage);
    await expect(card.getByRole('button', { name: label, exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  }
  assert.equal(await instance.evaluate(() => globalThis.__catalogCalls), 3);
  assert.deepEqual(await instance.evaluate(() => globalThis.__unexpectedRequests), []);
  await instance.close(); instance = undefined;

  page = await launch(); card = await settings(page);
  await expect(page.locator('#role-dialogModel')).toHaveValue(terra);
  await expect(page.locator('#role-model')).toHaveValue(`${terra}::fast`);
  await expect(page.locator('#role-memoryModel')).toHaveValue(terra);
  assert.equal((await snapshot()).chatgpt.status, 'signed-in');
  assert.equal(await instance.evaluate(() => globalThis.__catalogCalls), 0);
  assert.deepEqual(await instance.evaluate(() => globalThis.__unexpectedRequests), []);
  const encrypted = await readFile(path.join(profile, 'credentials.json'), 'utf8');
  for (const secret of ['synthetic-chatgpt-access', 'synthetic-chatgpt-refresh']) assert.ok(!encrypted.includes(secret));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'passed', profile, checked: ['restored signed-in catalog', 'real Main/auth/IPC/preload/renderer', 'no entitlement invented', 'HTTP failure retains models and login', 'pending refresh disables duplicate actions', 'Terra and Fast appear after refresh', 'previous roles retained', 'three role selections survive restart', 'seven languages and compact layout', 'encrypted persistence', 'no reauthentication or real cloud requests'] }, null, 2));
} finally { if (instance) await instance.close(); }
