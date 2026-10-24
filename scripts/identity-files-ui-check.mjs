import { _electron as electron, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createUiAppFixture } from './helpers/ui-app-fixture.mjs';

await mkdir('.test-data', { recursive: true }); await mkdir('artifacts', { recursive: true });
const profile = await mkdtemp(path.resolve('.test-data/identity-files-'));
const fixture = process.env.OPENHIATUS_TEST_APP ? undefined : await createUiAppFixture('identity-files-build');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.OPENHIATUS_TEST_APP || path.resolve('node_modules/electron/dist/electron.exe');
const args = [...(fixture ? [fixture.appDirectory] : []), `--data-dir=${profile}`];
const style = 'Sprich knapp und trocken. Keine unnötigen Wörter. Begründe deine Einschätzung kurz.';
let expectedName = 'Juno', dialogCalls = 0, workerCalls = 0;
const server = createServer(async (request, response) => {
  try {
    assert.equal(request.url, '/v1/chat/completions');
    let body = ''; for await (const chunk of request) body += chunk;
    const input = JSON.parse(body), tools = input.tools?.map(tool => tool.function.name) ?? [];
    const developer = input.messages.filter(message => ['system', 'developer'].includes(message.role)).map(message => typeof message.content === 'string' ? message.content : JSON.stringify(message.content)).join('\n');
    for (const file of ['SOUL.md', 'IDENTITY.md', 'USER.md', 'MEMORY.md']) assert.ok(developer.includes(file));
    assert.ok(developer.includes(style)); assert.ok(developer.includes(expectedName)); assert.ok(developer.includes('Sam')); assert.ok(developer.includes('Dienstag'));
    assert.ok(!developer.includes('Aktuelles, vom Nutzer in der Oberfläche gewähltes Assistentenprofil:'), 'legacy profile must not compete with the four files');
    const background = input.messages.some(message => message.role === 'user' && JSON.stringify(message.content).includes('[identity-worker]'));
    let tool;
    if (tools.includes('start_task')) { dialogCalls++; if (background && input.messages.at(-1)?.role !== 'tool') tool = { name: 'start_task', args: { requestId: 'identity-files-task', title: 'Identitätsdateien prüfen', acknowledgement: 'Ich prüfe die Dateien.', resources: ['*'] } }; }
    else { workerCalls++; assert.ok(tools.includes('write')); }
    const answer = 'Die vier gespeicherten Dateien sind im aktuellen Kontext angekommen.';
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta, finish_reason = null) => response.write(`data: ${JSON.stringify({ id: `identity-${dialogCalls}-${workerCalls}`, object: 'chat.completion.chunk', model: 'identity-test', choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
    chunk({ role: 'assistant' });
    if (tool) { chunk({ tool_calls: [{ index: 0, id: 'identity-admission', type: 'function', function: { name: tool.name, arguments: JSON.stringify(tool.args) } }] }); chunk({}, 'tool_calls'); }
    else { chunk({ content: '```openhiatus-reply\n' + JSON.stringify({ spoken: answer, text: answer }) + '\n```' }); chunk({}, 'stop'); }
    response.end('data: [DONE]\n\n');
  } catch (error) { response.writeHead(500); response.end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let instance; const errors = [];
async function launch() {
  instance = await electron.launch({ executablePath, args, env, timeout: 30000 });
  const page = await instance.firstWindow(); page.on('pageerror', error => errors.push(error.message)); await page.waitForFunction(() => !!window.openhiatus); return page;
}
async function openFile(page, name) {
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name: 'Gedächtnis', exact: true }).click();
  await page.locator('.memory-identity-overview button').filter({ hasText: name }).click();
  await expect(page.locator('.memory-document h2')).toHaveText(name);
}
async function editFile(page, name, content) {
  await openFile(page, name); await page.locator('.memory-document').getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await page.locator('#memory-document-editor').fill(content);
  await page.locator('.memory-document').getByRole('button', { name: 'Änderung speichern', exact: true }).click();
  await expect(page.locator('#memory-document-editor')).toHaveCount(0);
}
try {
  let page = await launch();
  await page.getByRole('button', { name: 'Verstanden, Vollzugriff bestätigen', exact: true }).click();
  await page.evaluate(async url => { await window.openhiatus.saveProvider({ id: 'local', baseUrl: url, models: ['identity-test'] }); await window.openhiatus.savePreferences({ model: 'local/identity-test', dialogModel: 'local/identity-test', memoryModel: 'local/identity-test', memoryAutoSummarize: false, speakReplies: false, earcons: false }); }, `http://127.0.0.1:${server.address().port}/v1`);
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click(); await page.getByRole('tab', { name: 'Persönlichkeit', exact: true }).click();
  await expect(page.locator('.assistant-profile-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Agent & Nutzer öffnen', exact: true }).click();
  await expect(page.locator('.memory-document h2')).toHaveText('SOUL.md');
  await editFile(page, 'IDENTITY.md', '# IDENTITY.md\n- **Name:** Juno\n- **Rolle:** Persönlicher Assistent\n- **Ausstrahlung:** Ruhig\n- **Emoji:** 🌙');
  await editFile(page, 'SOUL.md', '# SOUL.md\nVorhandener eigener Stil.');
  await editFile(page, 'USER.md', '# USER.md\nName: Sam\nVorliebe: kurze Antworten.');
  await editFile(page, 'MEMORY.md', '# MEMORY.md\nDie Übergabe ist am Dienstag.');
  await page.getByText('Stilvorlagen verwalten', { exact: true }).click();
  const card = page.getByRole('region', { name: 'Stilvorlagen', exact: true });
  await card.getByLabel('Vorlagenname', { exact: true }).fill('Büro'); await card.getByLabel('Stilbeschreibung', { exact: true }).fill(style);
  await card.getByRole('button', { name: 'Als neue Vorlage speichern', exact: true }).click();
  await expect(card.getByRole('status')).toContainText('Vorlagenbibliothek gespeichert');
  let snapshot = await page.evaluate(() => window.openhiatus.memorySnapshot());
  assert.equal(snapshot.documents.find(document => document.id === 'soul').content, '# SOUL.md\nVorhandener eigener Stil.');
  await page.getByRole('button', { name: 'Ausgewählte Vorlage in SOUL.md übernehmen', exact: true }).click();
  await expect(page.locator('#memory-document-editor')).toContainText(style);
  await page.getByRole('button', { name: 'Gespräch', exact: true }).click();
  await page.getByRole('button', { name: 'Gedächtnis', exact: true }).click();
  await expect(page.locator('#memory-document-editor')).toContainText(style);
  await page.locator('.memory-document').getByRole('button', { name: 'Änderung speichern', exact: true }).click(); await expect(page.locator('#memory-document-editor')).toHaveCount(0);
  await openFile(page, 'USER.md'); await page.locator('.memory-document').getByRole('button', { name: 'Bearbeiten', exact: true }).click(); await page.locator('#memory-document-editor').fill('Unfertiger Benutzerentwurf');
  snapshot = await page.evaluate(() => window.openhiatus.memorySnapshot()); const directory = snapshot.markdownDirectory;
  await writeFile(path.join(directory, 'USER.md'), '# USER.md\nName: Sam\nOrt: Köln. Grüße äöü ß.', 'utf8');
  await page.getByRole('button', { name: 'Dateien neu einlesen', exact: true }).click();
  await expect(page.getByText('Inzwischen gibt es eine neuere Version. Dein Entwurf wurde erhalten; er kann die neue Fassung nicht überschreiben.', { exact: true })).toBeVisible();
  await expect(page.locator('#memory-document-editor')).toHaveValue('Unfertiger Benutzerentwurf');
  await expect(page.locator('.memory-document').getByRole('button', { name: 'Änderung speichern', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Entwurf verwerfen & neu laden', exact: true }).click();
  await expect(page.locator('.memory-document-text')).toContainText('Köln');
  await page.screenshot({ path: 'artifacts/openhiatus-agent-und-nutzer.png' });
  await page.getByRole('button', { name: 'Gespräch', exact: true }).click(); await page.getByRole('textbox', { name: 'Dein Auftrag', exact: true }).fill('[identity-worker] Prüfe den synthetischen Kontext.'); await page.getByRole('button', { name: 'Auftrag senden', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).jobs?.[0]?.status), { timeout: 30000 }).toBe('completed');
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).task.status), { timeout: 30000 }).toBe('completed');
  assert.ok(dialogCalls >= 2); assert.equal(workerCalls, 1);
  await page.getByRole('button', { name: /^Verlauf/ }).click(); await expect(page.locator('.message.assistant .message-meta strong').first()).toHaveText('Juno');
  expectedName = 'Kai'; await writeFile(path.join(directory, 'IDENTITY.md'), '# IDENTITY.md\n- **Name:** Kai\n- **Emoji:** 🌙', 'utf8');
  await page.getByRole('textbox', { name: 'Dein Auftrag', exact: true }).fill('Bestätige nur den aktuellen Kontext.'); await page.getByRole('button', { name: 'Auftrag senden', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).task.status), { timeout: 30000 }).toBe('completed');
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).preferences.assistantProfile.name)).toBe('Kai');
  const calls = dialogCalls + workerCalls; await instance.close(); instance = undefined; page = await launch();
  snapshot = await page.evaluate(() => window.openhiatus.memorySnapshot());
  assert.equal(dialogCalls + workerCalls, calls);
  assert.ok(snapshot.documents.find(document => document.id === 'soul').content.includes(style));
  assert.equal((await page.evaluate(() => window.openhiatus.snapshot())).preferences.assistantProfile.name, 'Kai');
  for (const [id, name] of [['soul', 'SOUL.md'], ['agent', 'IDENTITY.md'], ['user', 'USER.md'], ['core', 'MEMORY.md']]) assert.equal(await readFile(path.join(directory, name), 'utf8'), snapshot.documents.find(document => document.id === id).content);
  assert.deepEqual(errors, []);
  const result = { status: 'passed', profile, dialogCalls, workerCalls, checks: ['single memory identity editor and settings shortcut', 'four real UTF-8 Markdown files', 'template library and explicit SOUL draft application', 'draft retention across navigation', 'external edit versioning and stale draft protection', 'all four files in actual dialog and worker instructions', 'name reflected in conversation', 'external identity change applied before next request', 'restart preserves files and templates without replay', 'no cloud or user profile access'] };
  await writeFile('artifacts/openhiatus-identitaetsdateien-pruefung.json', JSON.stringify(result, null, 2), 'utf8'); console.log(JSON.stringify(result, null, 2));
} finally { if (instance) await instance.close(); await new Promise(resolve => server.close(resolve)); }
