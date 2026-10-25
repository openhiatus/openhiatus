import { _electron as electron, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

await mkdir('.test-data', { recursive: true });
await mkdir('artifacts', { recursive: true });
const profile = await mkdtemp(path.resolve('.test-data/conversation-ui-'));
const longOpening = 'Die Prüfung ist abgeschlossen. Zwei Angaben konnten noch nicht bestätigt werden.';
const longAnswer = `## Vollständige Prüfdetails\n\n${'Ein zusätzlicher nachvollziehbarer Detailpunkt. '.repeat(80)}\n\n${longOpening}`;
const replies = ['Präzise Grüße aus dem ersten Gespräch.', 'Der Gesprächsverlauf bleibt nach dem Neustart erhalten.',
  '```openhiatus-reply\n' + JSON.stringify({ spoken: longOpening, text: longAnswer }) + '\n```'];
const requests = [];
const server = createServer(async (request, response) => {
  try {
    assert.equal(request.method, 'POST'); assert.equal(request.url, '/v1/chat/completions');
    let body = ''; for await (const chunk of request) body += chunk;
    const input = JSON.parse(body); requests.push(input);
    assert.ok(input.tools?.some(tool => tool.function.name === 'start_task'), 'A real dialogue request must expose dialogue tools');
    assert.ok(!input.tools?.some(tool => tool.function.name === 'write'));
    const answer = replies[requests.length - 1]; assert.ok(answer, 'Unexpected extra model request');
    const base = { id: `conversation-${requests.length}`, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: 'conversation-test' };
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta, finish_reason = null, usage) => response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason }], ...(usage ? { usage } : {}) })}\n\n`);
    chunk({ role: 'assistant', content: answer.slice(0, 12) }); chunk({ content: answer.slice(12) });
    chunk({}, 'stop', { prompt_tokens: 500 + 100 * requests.length, completion_tokens: 100, total_tokens: 600 + 100 * requests.length });
    response.end('data: [DONE]\n\n');
  } catch (error) { response.writeHead(500); response.end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
const executablePath = process.env.OPENHIATUS_TEST_APP || path.resolve('node_modules/electron/dist/electron.exe');
const args = process.env.OPENHIATUS_TEST_APP ? [] : ['.'];
args.push(`--data-dir=${profile}`);
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const requireContext = process.argv.includes('--require-context');
let instance;
const exceptions = [];
const diagnostics = [];
async function checkHistory(page, count, answer, stage) {
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).messages.length)).toBe(count);
  const toggle = page.getByRole('button', { name: /^Verlauf/ });
  if (await toggle.getAttribute('aria-pressed') === 'false') await toggle.click();
  await expect(page.locator('.message-list > article')).toHaveCount(count);
  await expect(page.locator('.message.assistant .message-body').last()).toHaveText(answer);
  await expect(page.locator('.history-empty')).toHaveCount(0);
  const snapshot = await page.evaluate(() => window.openhiatus.snapshot());
  if (snapshot.hotkeys && Object.values(snapshot.hotkeys).includes(false)) {
    await expect(page.locator('.hotkey-warning')).toBeVisible();
    await expect(page.locator('.hotkey-warning')).toContainText('systemweit nicht verfügbar');
    if (snapshot.hotkeys.recording === false || snapshot.hotkeys.submit === false) await expect(page.locator('.hotkey-warning')).toContainText('Sprechen und Senden funktionieren über die Schaltflächen');
  }
  const meter = page.getByRole('meter', { name: 'Kontext des Gesprächs', exact: true });
  await expect(meter).not.toContainText('Frisches Gespräch');
  if (snapshot.context && snapshot.task.threadId && snapshot.context.threadId === snapshot.task.threadId && snapshot.context.usedTokens > 0) {
    await expect(meter).toContainText('Token');
    await expect(meter.locator('strong')).not.toHaveText('0 %');
  } else {
    await expect(meter).toContainText('Kontextverbrauch noch nicht gemeldet');
    await expect(meter.locator('strong')).toHaveText('–');
    if (requireContext && stage !== 'restart') throw new Error('The completed SDK dialogue did not report current context usage.');
  }
  // Renderer completion can precede the asynchronous journal flush to state.json.
  await expect.poll(async () => {
    const stored = JSON.parse(await readFile(path.join(profile, 'state.json'), 'utf8')).state;
    return { count: stored.messages.length, text: stored.messages.at(-1)?.text };
  }).toEqual({ count, text: answer });
  diagnostics.push({ stage, messages: snapshot.messages.length, threadId: snapshot.task.threadId, context: snapshot.context, meterText: await meter.innerText(), hotkeys: snapshot.hotkeys });
}
try {
  instance = await electron.launch({ executablePath, args, env, timeout: 30000 });
  const page = await instance.firstWindow(); page.on('pageerror', error => exceptions.push(error.message));
  await page.getByRole('button', { name: 'Verstanden, Vollzugriff bestätigen', exact: true }).click();
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name: 'Gespräch', exact: true }).click();
  await page.evaluate(async url => {
    await window.openhiatus.saveProvider({ id: 'local', baseUrl: url, models: ['conversation-test'] });
    await window.openhiatus.savePreferences({ model: 'local/conversation-test', dialogModel: 'local/conversation-test', memoryModel: 'local/conversation-test', memoryAutoSummarize: false, speakReplies: false, earcons: false });
  }, baseUrl);
  await expect(page.getByRole('meter', { name: 'Kontext des Gesprächs', exact: true })).toContainText('Frisches Gespräch');
  await page.getByRole('textbox', { name: 'Dein Auftrag', exact: true }).fill(`Antworte genau: ${replies[0]}`);
  await page.getByRole('button', { name: 'Auftrag senden', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).task.status), { timeout: 30000 }).toBe('completed');
  await checkHistory(page, 2, replies[0], 'first-reply');
  await page.screenshot({ path: 'artifacts/openhiatus-gespraech-verlauf.png' });
  await instance.close(); instance = undefined;

  instance = await electron.launch({ executablePath, args, env, timeout: 30000 });
  const restarted = await instance.firstWindow(); restarted.on('pageerror', error => exceptions.push(error.message));
  await expect.poll(() => restarted.evaluate(async () => (await window.openhiatus.snapshot()).connections.agent), { timeout: 30000 }).toBe('ready');
  await expect(restarted.getByRole('button', { name: /^Verlauf/ })).toHaveAttribute('aria-pressed', 'true');
  await checkHistory(restarted, 2, replies[0], 'restart');
  assert.equal(requests.length, 1, 'Restart must not repeat the conversation');
  await restarted.getByRole('textbox', { name: 'Dein Auftrag', exact: true }).fill(`Antworte genau: ${replies[1]}`);
  await restarted.getByRole('button', { name: 'Auftrag senden', exact: true }).click();
  await expect.poll(() => restarted.evaluate(async () => (await window.openhiatus.snapshot()).task.status), { timeout: 30000 }).toBe('completed');
  await checkHistory(restarted, 4, replies[1], 'second-reply');
  assert.equal(requests.length, 2);
  await restarted.getByRole('textbox', { name: 'Dein Auftrag', exact: true }).fill('Gib das ausführliche Prüfergebnis aus.');
  await restarted.getByRole('button', { name: 'Auftrag senden', exact: true }).click();
  await expect.poll(() => restarted.evaluate(async () => (await window.openhiatus.snapshot()).task.status), { timeout: 30000 }).toBe('completed');
  await checkHistory(restarted, 6, longAnswer, 'long-reply');
  const spokenReply = await restarted.evaluate(async () => (await window.openhiatus.snapshot()).speech.at(-1)?.text);
  assert.equal(spokenReply, longOpening, 'Speech must use the model-authored summary rather than extracting the written opening.');
  assert.ok(spokenReply.length <= 500, 'The TTS cue must stay inside the technical speech budget.');
  assert.equal(requests.length, 3, 'Speech shortening must not start an extra model request.');
  assert.deepEqual(exceptions, []);
  await restarted.screenshot({ path: 'artifacts/openhiatus-gespraech-neustart.png' });
  const result = { status: 'passed', profile, requireContext, modelRequests: requests.length, checked: ['real SDK conversation through UI send', 'visible and persisted user/assistant messages', 'history survives restart', 'restart never repeats model work', 'second dialogue after restart', 'model-authored speech separated from full written answer without another model call', 'technical 500-character speech budget', 'unknown context never claims a fresh conversation', 'no cloud requests or existing user profiles'], diagnostics };
  await writeFile(path.join(profile, 'conversation-check.json'), JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result, null, 2));
} finally { if (instance) await instance.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
