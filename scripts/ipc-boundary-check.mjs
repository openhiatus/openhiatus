import { _electron as electron, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

await mkdir('.test-data', { recursive: true });
await mkdir('artifacts', { recursive: true });
const profile = await mkdtemp(path.resolve('.test-data/openhiatus-ipc-'));
const firstFile = path.join(profile, 'Arbeitsbereich', 'Auftrag eins', 'ergebnis.txt');
const secondFile = path.join(profile, 'Arbeitsbereich', 'Auftrag zwei', 'ergebnis.txt');
const content = 'Präzise Grüße aus der typisierten IPC. Äpfel, Öl und Übungen.';
const requests = [], workerCalls = { 'worker-one': 0, 'worker-two': 0 };
let dialogCalls = 0, waitingFirst, waitingSecond, firstConnectionClosed = false;
function stream(response, value) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  const chunk = (delta, finish_reason = null) => response.write(`data: ${JSON.stringify({ id: `ipc-${requests.length}`, object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000), model: 'ipc-test', choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
  chunk({ role: 'assistant' });
  if (value.tool) {
    chunk({ tool_calls: [{ index: 0, id: `call-${requests.length}`, type: 'function', function: { name: value.tool.name, arguments: JSON.stringify(value.tool.args) } }] });
    chunk({}, 'tool_calls');
  } else { chunk({ content: value.text }); chunk({}, 'stop'); }
  response.end('data: [DONE]\n\n');
}
const server = createServer(async (request, response) => {
  try {
    assert.equal(request.method, 'POST'); assert.equal(request.url, '/v1/chat/completions');
    let body = ''; for await (const chunk of request) body += chunk;
    const input = JSON.parse(body); requests.push(input);
    const names = input.tools?.map(tool => tool.function.name) ?? [];
    if (input.model === 'dialog') {
      assert.ok(names.includes('start_task')); assert.ok(!names.includes('write')); dialogCalls++;
      if (dialogCalls === 1 || dialogCalls === 3) {
        const first = dialogCalls === 1;
        stream(response, { tool: { name: 'start_task', args: { requestId: first ? 'one' : 'two', title: first ? 'Erster Prüfauftrag' : 'Zweiter Prüfauftrag',
          acknowledgement: first ? 'Ich prüfe den ersten Auftrag.' : 'Ich prüfe den zweiten Auftrag.', resources: [path.dirname(first ? firstFile : secondFile)] } } });
      } else { assert.ok(dialogCalls === 2 || dialogCalls === 4); stream(response, { text: 'Der Auftrag wurde angenommen.' }); }
      return;
    }
    assert.ok(Object.hasOwn(workerCalls, input.model)); assert.ok(names.includes('write')); assert.ok(!names.includes('start_task'));
    const count = ++workerCalls[input.model];
    if (input.model === 'worker-one') {
      if (count === 1) stream(response, { tool: { name: 'write', args: { path: firstFile, content } } });
      else {
        assert.equal(count, 2); waitingFirst = response;
        response.on('close', () => { firstConnectionClosed = true; });
      }
    } else if (count === 1) waitingSecond = response;
    else if (count === 2) stream(response, { tool: { name: 'read', args: { path: secondFile } } });
    else { assert.equal(count, 3); stream(response, { text: 'Zweiter Auftrag: Datei erstellt und geprüft.' }); }
  } catch (error) { response.writeHead(500); response.end(String(error)); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}/v1`;
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const executablePath = path.resolve('node_modules/electron/dist/electron.exe');
const args = ['.', `--data-dir=${profile}`];
let instance;
const errors = [];
try {
  instance = await electron.launch({ executablePath, args, env, timeout: 30000 });
  let page = await instance.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => Boolean(window.openhiatus));
  const invalid = await page.evaluate(async () => {
    const calls = [
      () => window.openhiatus.send(42, 'invalid'),
      () => window.openhiatus.savePreferences({ fullAccessAcknowledged: true }),
      () => window.openhiatus.saveProvider({ id: 'local', models: 'invalid' }),
      () => window.openhiatus.readMemoryPeriod({ documentId: 'day:2026-10-21', unexpected: true }),
      () => window.openhiatus.editMemory('identity', 'Invalid version', NaN),
      () => window.openhiatus.transcribe({ base64: 'not-wav', mimeType: 'text/html' }),
    ];
    return Promise.all(calls.map(async call => { try { await call(); return { rejected: false }; } catch (error) { return { rejected: true, message: error.message }; } }));
  });
  assert.ok(invalid.every(value => value.rejected && value.message));
  const unchanged = await page.evaluate(() => window.openhiatus.snapshot());
  assert.equal(unchanged.preferences.fullAccessAcknowledged, false); assert.equal(unchanged.messages.length, 0); assert.equal(unchanged.jobs.length, 0);
  assert.equal(unchanged.providers.some(provider => provider.configured), false);

  const foreign = await instance.evaluate(async ({ BrowserWindow }, preload) => {
    const rogue = new BrowserWindow({ show: false, webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false } });
    try {
      await rogue.loadURL('data:text/html;charset=utf-8,<title>IPC Testfenster</title>');
      return await rogue.webContents.executeJavaScript(`(async () => {
        if (typeof window.openhiatus?.snapshot !== 'function') throw new Error('Test preload missing');
        try { await window.openhiatus.snapshot(); return { rejected: false }; }
        catch (error) { return { rejected: true, message: error.message }; }
      })()`);
    } finally { rogue.destroy(); }
  }, path.resolve('dist/preload.cjs'));
  assert.equal(foreign.rejected, true); assert.match(foreign.message, /Unzulässiger Aufruf/);

  await page.getByRole('button', { name: 'Verstanden, Vollzugriff bestätigen', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).activity.some(item => item.title === 'Vollzugriff bestätigt')), { timeout: 30000 }).toBe(true);
  await page.evaluate(async url => {
    await window.openhiatus.saveProvider({ id: 'local', baseUrl: url, models: ['dialog', 'worker-one', 'worker-two'] });
    await window.openhiatus.savePreferences({ dialogModel: 'local/dialog', model: 'local/worker-one', memoryModel: 'local/dialog', memoryAutoSummarize: false, speakReplies: false });
    await window.openhiatus.send('Erstelle und prüfe die Datei für den ersten Prüfauftrag.', 'ui-one');
  }, url);
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).task.status), { timeout: 30000 }).toBe('completed');
  await expect.poll(() => Boolean(waitingFirst), { timeout: 30000 }).toBe(true);
  await page.evaluate(async () => {
    await window.openhiatus.savePreferences({ model: 'local/worker-two' });
    await window.openhiatus.send('Erstelle und prüfe die Datei für den zweiten Prüfauftrag.', 'ui-two');
  });
  await expect.poll(() => Boolean(waitingSecond), { timeout: 30000 }).toBe(true);
  const beforeStop = await page.evaluate(() => window.openhiatus.snapshot());
  assert.equal(beforeStop.jobs.length, 2); assert.ok(beforeStop.jobs.every(job => job.status === 'running'));
  assert.equal(beforeStop.jobs[0].model, 'local/worker-one'); assert.equal(beforeStop.jobs[1].model, 'local/worker-two');
  assert.ok(beforeStop.jobs.every(job => !Object.hasOwn(job, 'identityInstructions')), 'Internal frozen instructions must not cross the renderer boundary.');
  const navigation = page.getByRole('navigation', { name: 'Hauptnavigation' });
  const draft = 'Diesen Entwurf während der Arbeit behalten.';
  await page.getByRole('textbox', { name: 'Dein Auftrag', exact: true }).fill(draft);
  const callsBeforeNavigation = requests.length;
  for (const name of [/^Aufgaben/, 'Dienste', 'Gedächtnis', 'Skills', 'Einstellungen', 'Gespräch']) {
    const destination = navigation.getByRole('button', { name, exact: typeof name === 'string' });
    await destination.click();
    await expect(destination).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('button', { name: 'Stopp Esc', exact: true })).toBeVisible();
  }
  await expect(page.getByRole('textbox', { name: 'Dein Auftrag', exact: true })).toHaveValue(draft);
  const afterNavigation = await page.evaluate(() => window.openhiatus.snapshot());
  assert.deepEqual(afterNavigation.jobs.map(job => [job.id, job.status]), beforeStop.jobs.map(job => [job.id, job.status]));
  assert.equal(requests.length, callsBeforeNavigation, 'Navigation must not send model requests.');
  await navigation.getByRole('button', { name: /^Aufgaben/ }).click();
  const activeFilter = page.getByRole('group', { name: 'Aufgaben nach Status filtern' }).getByRole('button', { name: /^Aktiv/ });
  await activeFilter.click();
  await page.getByRole('button', { name: `Aufgabe anzeigen: ${beforeStop.jobs[0].title}`, exact: true }).click();
  await navigation.getByRole('button', { name: 'Dienste', exact: true }).click();
  await navigation.getByRole('button', { name: /^Aufgaben/ }).click();
  await expect(activeFilter).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-task-detail-id]')).toHaveAttribute('data-task-detail-id', beforeStop.jobs[0].id);
  await page.screenshot({ path: 'artifacts/openhiatus-aufgaben-aktiv.png' });
  await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 760));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: 'artifacts/openhiatus-aufgaben-kompakt.png' });
  await page.locator(`[data-job-id="${beforeStop.jobs[0].id}"]`).getByRole('button', { name: `Auftrag stoppen: ${beforeStop.jobs[0].title}`, exact: true }).click();
  await expect.poll(() => firstConnectionClosed, { timeout: 10000 }).toBe(true);
  const afterStop = await page.evaluate(() => window.openhiatus.snapshot());
  assert.equal(afterStop.jobs[0].status, 'interrupted'); assert.equal(afterStop.jobs[1].status, 'running');
  stream(waitingSecond, { tool: { name: 'write', args: { path: secondFile, content } } });
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).jobs[1].status), { timeout: 30000 }).toBe('completed');
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).task.status), { timeout: 30000 }).toBe('completed');
  const finished = await page.evaluate(() => window.openhiatus.snapshot());
  assert.ok(finished.messages.some(message => message.jobId === finished.jobs[1].id && message.text.includes('Datei erstellt und geprüft')));
  assert.equal(await readFile(firstFile, 'utf8'), content); assert.equal(await readFile(secondFile, 'utf8'), content);
  const count = requests.length;
  await instance.close(); instance = undefined;
  instance = await electron.launch({ executablePath, args, env, timeout: 30000 });
  page = await instance.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => Boolean(window.openhiatus));
  const restored = await page.evaluate(() => window.openhiatus.snapshot());
  assert.deepEqual(restored.jobs.map(job => [job.id, job.status]), finished.jobs.map(job => [job.id, job.status]));
  assert.deepEqual(restored.messages, finished.messages); assert.equal(requests.length, count); assert.deepEqual(errors, []);
  const evidence = { status: 'passed', profile, invalidCallsRejected: invalid.length, foreignSenderRejected: foreign.rejected,
    jobs: restored.jobs.map(job => ({ id: job.id, status: job.status, model: job.model })), modelCalls: { dialog: dialogCalls, ...workerCalls },
    checks: ['runtime input validation', 'untrusted window denied', 'two parallel jobs', 'captured model per job', 'single-job UI Stop preserves other job',
      'all navigation views preserve running jobs and draft without model calls', 'task filter and selection survive navigation', '1000px task layout without document overflow',
      'internal instructions excluded', 'UTF-8 files and job result', 'restart preserves results without replay', 'no renderer exceptions'] };
  await writeFile('artifacts/openhiatus-ipc-auftraege-pruefung.json', JSON.stringify(evidence, null, 2), 'utf8');
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  if (instance) await instance.close();
  server.closeAllConnections(); await new Promise(done => server.close(done));
}
