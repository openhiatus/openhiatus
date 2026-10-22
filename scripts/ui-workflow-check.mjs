import { _electron as electron, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

await mkdir('.test-data', { recursive: true });
await mkdir('artifacts', { recursive: true });
const profile = await mkdtemp(path.resolve('.test-data/openhiatus-workflow-'));
const resultPath = path.join(profile, 'Arbeitsbereich', 'workflow-ergebnis.txt');
const expectedContent = 'Präzise Grüße aus openhiatus. Äpfel, Öl und Übungen.';
const requests = [];
let dialogCalls = 0, workerCalls = 0;
function stream(response, value) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  const chunk = (delta, finish_reason = null, usage) => response.write(`data: ${JSON.stringify({ id: `ui-${requests.length}`, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: 'ui-workflow', choices: [{ index: 0, delta, finish_reason }], ...(usage ? { usage } : {}) })}\n\n`);
  chunk({ role: 'assistant' });
  if (value.tool) {
    chunk({ tool_calls: [{ index: 0, id: `call-ui-${requests.length}`, type: 'function', function: { name: value.tool.name, arguments: JSON.stringify(value.tool.args) } }] });
    chunk({}, 'tool_calls', { prompt_tokens: 15, completion_tokens: 5, total_tokens: 20 });
  } else {
    chunk({ content: value.text });
    chunk({}, 'stop', { prompt_tokens: 15, completion_tokens: 5, total_tokens: 20 });
  }
  response.end('data: [DONE]\n\n');
}
const server = createServer(async (request, response) => {
  try {
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') { response.writeHead(404); response.end(); return; }
    let body = ''; for await (const chunk of request) body += chunk;
    const data = JSON.parse(body); requests.push(data);
    const tools = data.tools?.map(tool => tool.function.name) ?? [];
    if (tools.includes('start_task')) {
      dialogCalls++;
      assert.ok(!tools.includes('write'), 'Dialog must have no file tools');
      if (dialogCalls === 1) stream(response, { tool: { name: 'start_task', args: { requestId: 'ui-workflow-file', title: 'Workflow-Datei erstellen', acknowledgement: 'Ich erstelle und prüfe die Workflow-Datei.', resources: [path.dirname(resultPath)] } } });
      else stream(response, { text: 'Ich melde mich mit dem geprüften Ergebnis.' });
    } else if (tools.includes('write')) {
      workerCalls++;
      assert.ok(!tools.includes('start_task'), 'Worker must have no dialog admission tools');
      if (workerCalls === 1) stream(response, { tool: { name: 'write', args: { path: resultPath, content: expectedContent } } });
      else if (workerCalls === 2) stream(response, { tool: { name: 'read', args: { path: resultPath } } });
      else stream(response, { text: `Workflow-Datei erstellt und geprüft. [Ergebnis](<${resultPath}>).` });
    } else throw new Error(`Unexpected model call: ${JSON.stringify(tools)}`);
  } catch (error) { response.writeHead(500); response.end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.OPENHIATUS_TEST_APP || path.resolve('node_modules/electron/dist/electron.exe');
const args = process.env.OPENHIATUS_TEST_APP ? [] : ['.'];
args.push(`--data-dir=${profile}`);
let instance;
const errors = [];
try {
  instance = await electron.launch({ executablePath, args, env, timeout: 30000 });
  const page = await instance.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'Verstanden, Vollzugriff bestätigen', exact: true }).click();
  await page.evaluate(async url => {
    await window.openhiatus.saveProvider({ id: 'local', baseUrl: url, models: ['ui-workflow'] });
    await window.openhiatus.savePreferences({ model: 'local/ui-workflow', dialogModel: 'local/ui-workflow', memoryModel: 'local/ui-workflow', memoryAutoSummarize: false });
  }, baseUrl);
  const prompt = `Erstelle die Datei "${resultPath}" mit genau diesem Inhalt: ${expectedContent} Lies die Datei anschließend zur Prüfung.`;
  await page.getByRole('textbox', { name: 'Dein Auftrag', exact: true }).fill(prompt);
  await page.getByRole('button', { name: 'Auftrag senden', exact: true }).click();
  await expect.poll(async () => {
    const snapshot = await page.evaluate(() => window.openhiatus.snapshot());
    if (snapshot.task.status === 'failed' || snapshot.jobs?.some(job => job.status === 'failed')) throw new Error(JSON.stringify(snapshot));
    return snapshot.jobs?.[0]?.status;
  }, { timeout: 45000 }).toBe('completed');
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).task.status), { timeout: 30000 }).toBe('completed');
  const snapshot = await page.evaluate(() => window.openhiatus.snapshot());
  assert.equal(snapshot.jobs.length, 1);
  assert.equal(await readFile(resultPath, 'utf8'), expectedContent);
  assert.ok(snapshot.messages.some(message => message.jobId === snapshot.jobs[0].id && message.text.includes('Workflow-Datei erstellt und geprüft.')));
  assert.ok(snapshot.speech.some(cue => cue.jobId === snapshot.jobs[0].id && cue.text.includes('Ich erstelle und prüfe')));
  assert.ok(snapshot.speech.some(cue => cue.kind === 'receipt'));
  assert.equal(dialogCalls, 2);
  assert.equal(workerCalls, 3);
  assert.equal(snapshot.jobs[0].usage?.inputTokens, 45);
  assert.equal(snapshot.jobs[0].usage?.outputTokens, 15);
  assert.equal(snapshot.jobs[0].usage?.costUsd, undefined);
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name: /^Aufgaben/ }).click();
  await expect(page.getByText('60 Token · Preis nicht verfügbar', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: 'artifacts/openhiatus-aufgaben-ergebnis.png' });
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name: 'Gespräch', exact: true }).click();
  await page.getByRole('button', { name: /^Verlauf/ }).click();
  await page.locator('.messages').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await page.screenshot({ path: 'artifacts/openhiatus-auftrag-ergebnis.png' });
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.screenshot({ path: 'artifacts/openhiatus-modellrollen.png' });
  await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 760));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.locator('.model-roles').screenshot({ path: 'artifacts/openhiatus-modellrollen-kompakt.png' });
  assert.deepEqual(errors, []);
  await writeFile(path.join(profile, 'workflow-pruefung.json'), JSON.stringify({ status: 'passed', resultPath, dialogCalls, workerCalls, job: snapshot.jobs[0], usage: snapshot.usage }, null, 2), 'utf8');
  console.log(JSON.stringify({ status: 'passed', profile, resultPath, checked: ['UI send', 'SDK dialog start_task', 'durable controller admission', 'worker write and read through SDK', 'Unicode file content', 'job-linked receipt and result', 'separate tool sets', 'reported token totals without invented prices', 'rendered job usage'], dialogCalls, workerCalls }, null, 2));
} finally { if (instance) await instance.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
