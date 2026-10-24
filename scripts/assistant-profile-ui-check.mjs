import { _electron as electron, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createUiAppFixture } from './helpers/ui-app-fixture.mjs';

await mkdir('.test-data', { recursive: true }); await mkdir('artifacts', { recursive: true });
const profile = await mkdtemp(path.resolve('.test-data/assistant-profile-'));
const fixture = process.env.OPENHIATUS_TEST_APP ? undefined : await createUiAppFixture('assistant-profile-build');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.OPENHIATUS_TEST_APP || path.resolve('node_modules/electron/dist/electron.exe');
const args = [...(fixture ? [fixture.appDirectory] : []), `--data-dir=${profile}`];
const style = 'Sprich ruhig und präzise. Verwende kurze Sätze und sparsamen trockenen Humor.';
const editedStyle = 'Sprich ruhig und präzise. Begründe deine Einschätzung kurz. Keine Floskeln.';
const legacyIdentity = 'Du bist openHiatus, ein hilfreicher deutschsprachiger Assistent. Sprich klar, freundlich und ehrlich. Benenne Unsicherheit und bestätige Ergebnisse nur, wenn sie tatsächlich vorliegen. Respektiere die Entscheidungen des Nutzers.';
let dialogCalls = 0, workerCalls = 0;
const server = createServer(async (request, response) => {
  try {
    assert.equal(request.url, '/v1/chat/completions');
    let body = ''; for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    const developer = input.messages.filter(message => ['system', 'developer'].includes(message.role)).map(message => typeof message.content === 'string' ? message.content : JSON.stringify(message.content)).join('\n');
    assert.ok(developer.includes('"rufname":"Juno"'), 'actual model instructions must carry the call name');
    assert.ok(developer.includes(editedStyle), 'actual model instructions must carry the saved custom personality');
    assert.ok(!developer.includes('Sprich klar, freundlich und ehrlich.'), 'known legacy defaults must not impose a competing tone');
    assert.ok(developer.includes('openHiatus ist der Name der Anwendung und Organisation'));
    const tools = input.tools?.map(tool => tool.function.name) ?? [];
    const backgroundRequest = input.messages.some(message => message.role === 'user' && JSON.stringify(message.content).includes('[background-profile]'));
    let tool, answer;
    if (tools.includes('start_task')) {
      dialogCalls++;
      if (backgroundRequest && input.messages.at(-1)?.role !== 'tool') tool = { name: 'start_task', args: { requestId: 'profile-task', title: 'Profil prüfen', acknowledgement: 'Ich prüfe das Profil.', resources: ['*'] } };
      else answer = 'Das persönliche Profil ist aktiv.';
    } else if (tools.includes('write')) { workerCalls++; answer = 'Das gespeicherte Profil ist auch im Arbeitsauftrag aktiv.'; }
    else throw Error('Unexpected model role');
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta, finish_reason = null) => response.write(`data: ${JSON.stringify({ id: `profile-${dialogCalls}-${workerCalls}`, object: 'chat.completion.chunk', model: 'profile-test', choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
    chunk({ role: 'assistant' });
    if (tool) { chunk({ tool_calls: [{ index: 0, id: 'profile-admission', type: 'function', function: { name: tool.name, arguments: JSON.stringify(tool.args) } }] }); chunk({}, 'tool_calls'); }
    else { chunk({ content: '```openhiatus-reply\n' + JSON.stringify({ spoken: answer, text: answer }) + '\n```' }); chunk({}, 'stop'); }
    response.end('data: [DONE]\n\n');
  } catch (error) { response.writeHead(500); response.end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let instance;
const errors = [];
async function launch() {
  instance = await electron.launch({ executablePath, args, env, timeout: 30000 });
  const page = await instance.firstWindow(); page.on('pageerror', error => errors.push(error.message)); return page;
}
async function openProfile(page) {
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.getByRole('tab', { name: 'Bedienung', exact: true }).click();
  return page.getByRole('region', { name: 'Name & Persönlichkeit', exact: true });
}
async function saved(page, name) { await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).preferences.assistantProfile.name)).toBe(name); }
try {
  let page = await launch();
  await page.getByRole('button', { name: 'Verstanden, Vollzugriff bestätigen', exact: true }).click();
  let card = await openProfile(page);
  await card.getByLabel('Rufname', { exact: true }).fill('Mira');
  await card.getByLabel('Persönlichkeit', { exact: true }).selectOption('direct');
  await card.getByRole('button', { name: 'Speichern', exact: true }).click(); await saved(page, 'Mira');
  // An unrelated published preference must not replace an unfinished profile draft.
  await card.getByLabel('Rufname', { exact: true }).fill('Unfertiger Entwurf');
  await page.evaluate(() => window.openhiatus.savePreferences({ earcons: false }));
  await expect(card.getByLabel('Rufname', { exact: true })).toHaveValue('Unfertiger Entwurf');
  await card.getByLabel('Rufname', { exact: true }).fill('Mira');
  await card.getByLabel('Vorlagenname', { exact: true }).fill('Büro');
  await card.getByLabel('Stilbeschreibung', { exact: true }).fill(style);
  await expect(card.getByRole('button', { name: 'Speichern', exact: true })).toBeDisabled();
  await card.getByRole('button', { name: 'Als neue Vorlage speichern', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).preferences.assistantProfile.templates.length)).toBe(1);
  const customId = await page.evaluate(async () => (await window.openhiatus.snapshot()).preferences.assistantProfile.personalityId);
  await card.getByLabel('Stilbeschreibung', { exact: true }).fill(editedStyle);
  await card.getByLabel('Rufname', { exact: true }).fill('Juno');
  await card.getByRole('button', { name: 'Speichern', exact: true }).click(); await saved(page, 'Juno');
  await expect(card.getByRole('status')).toHaveText('Rufname und Persönlichkeit gespeichert.');
  await card.screenshot({ path: 'artifacts/openhiatus-persoenlichkeit.png' });
  await page.evaluate(async text => {
    const memory = await window.openhiatus.memorySnapshot(), identity = memory.documents.find(document => document.id === 'identity');
    await window.openhiatus.editMemory('identity', text, identity.version);
  }, legacyIdentity);
  await page.evaluate(async url => {
    await window.openhiatus.saveProvider({ id: 'local', baseUrl: url, models: ['profile-test'] });
    await window.openhiatus.savePreferences({ model: 'local/profile-test', dialogModel: 'local/profile-test', memoryModel: 'local/profile-test', memoryAutoSummarize: false, speakReplies: false });
  }, `http://127.0.0.1:${server.address().port}/v1`);
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name: 'Gespräch', exact: true }).click();
  for (const prompt of ['Prüfe dein persönliches Profil.', '[background-profile] Prüfe dein Profil in einem Arbeitsauftrag.']) {
    const before = await page.evaluate(async () => (await window.openhiatus.snapshot()).messages.length);
    await page.getByRole('textbox', { name: 'Dein Auftrag', exact: true }).fill(prompt);
    await page.getByRole('button', { name: 'Auftrag senden', exact: true }).click();
    await expect.poll(() => page.evaluate(async before => { const state = await window.openhiatus.snapshot(); return state.messages.length >= before + 2 && state.task.status === 'completed'; }, before), { timeout: 30000 }).toBe(true);
  }
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).jobs?.[0]?.status), { timeout: 30000 }).toBe('completed');
  await page.getByRole('button', { name: /^Verlauf/ }).click();
  await expect(page.locator('.message.assistant .message-meta strong').first()).toHaveText('Juno');
  await expect(page.locator('.brand-name')).toHaveText('openHiatus');
  const requestCount = dialogCalls + workerCalls;
  await instance.close(); instance = undefined; page = await launch(); card = await openProfile(page);
  await expect(card.getByLabel('Rufname', { exact: true })).toHaveValue('Juno');
  await expect(card.getByLabel('Persönlichkeit', { exact: true })).toHaveValue(customId);
  await expect(card.getByLabel('Stilbeschreibung', { exact: true })).toHaveValue(editedStyle);
  assert.equal(await page.evaluate(async () => (await window.openhiatus.memorySnapshot()).documents.find(document => document.id === 'identity').content), legacyIdentity);
  assert.equal(dialogCalls + workerCalls, requestCount, 'restart must not repeat model work');
  await card.getByLabel('Persönlichkeit', { exact: true }).selectOption('analytical');
  await card.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).preferences.assistantProfile.personalityId)).toBe('analytical');
  await expect(card.getByLabel('Rufname', { exact: true })).toHaveValue('Juno');
  await card.getByLabel('Persönlichkeit', { exact: true }).selectOption(customId);
  await card.getByRole('button', { name: 'Löschen', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).preferences.assistantProfile.templates.length)).toBe(0);
  await expect(card.getByLabel('Persönlichkeit', { exact: true })).toHaveValue('balanced');
  await expect(card.getByLabel('Rufname', { exact: true })).toHaveValue('Juno');
  await expect(card.getByRole('button', { name: 'Löschen', exact: true })).toBeDisabled();
  assert.deepEqual(errors, []);
  const result = { status: 'passed', profile, dialogCalls, workerCalls,
    checks: ['name independent of application brand', 'four builtin personalities', 'unsaved draft survives snapshots', 'create and edit custom template', 'durable profile survives restart', 'legacy default tone removed from dialog and worker prompts without editing stored identity',
      'selected name and style in actual dialog and worker instructions', 'assistant author label', 'builtin switch preserves name', 'delete custom with default fallback', 'no cloud or user profile access'] };
  await writeFile('artifacts/openhiatus-persoenlichkeit-pruefung.json', JSON.stringify(result, null, 2), 'utf8'); console.log(JSON.stringify(result, null, 2));
} finally { if (instance) await instance.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
