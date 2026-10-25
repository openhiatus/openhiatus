import { _electron as electron, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

// Only this synthetic app copy replaces its worker entry with a controllable gate.
// The production Main, renderer, writer and actual state-worker bundle are unchanged.
await mkdir('.test-data', { recursive: true });
await mkdir('artifacts', { recursive: true });
const directory = await mkdtemp(path.resolve('.test-data/async-storage-ui-'));
const appDirectory = path.join(directory, 'app'), profile = path.join(directory, 'profile');
await mkdir(profile, { recursive: true });
await cp(path.resolve('dist'), path.join(appDirectory, 'dist'), { recursive: true });
const { name, productName, version } = JSON.parse(await readFile('package.json', 'utf8'));
await writeFile(path.join(appDirectory, 'package.json'), JSON.stringify({ name, productName, version, main: 'dist/main.cjs' }));
const workerDirectory = path.join(appDirectory, 'dist');
await cp(path.join(workerDirectory, 'state-worker.cjs'), path.join(workerDirectory, 'real-state-worker.cjs'));
const gate = path.join(profile, 'write-gate.txt'), held = path.join(profile, 'write-held.json');
await writeFile(gate, 'release');
await writeFile(path.join(workerDirectory, 'state-worker.cjs'), `
const { parentPort, workerData, threadId } = require('node:worker_threads');
const { appendFileSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const gate = join(workerData.directory, 'write-gate.txt');
const trace = value => appendFileSync(join(workerData.directory, 'write-trace.jsonl'), JSON.stringify({ at: Date.now(), ...value }) + '\\n');
const post = parentPort.postMessage.bind(parentPort);
parentPort.postMessage = value => { trace({ event: 'reply', type: value.type, id: value.id, error: value.error }); return post(value); };
const on = parentPort.on.bind(parentPort);
parentPort.on = (event, callback) => on(event, event === 'message' ? value => {
  trace({ event: 'request', type: value?.type, id: value?.id, task: value?.state?.task });
  if (value?.type === 'commit' && readFileSync(gate, 'utf8') === 'hold') {
    writeFileSync(join(workerData.directory, 'write-held.json'), JSON.stringify({ id: value.id, threadId }));
    const wait = new Int32Array(new SharedArrayBuffer(4));
    while (readFileSync(gate, 'utf8') === 'hold') Atomics.wait(wait, 0, 0, 10);
  }
  callback(value);
} : callback);
require('./real-state-worker.cjs');
`);

let requests = 0;
const server = createServer((request, response) => {
  requests++;
  request.resume();
  response.writeHead(500); response.end('No model request is expected in this test.');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const launch = () => electron.launch({ executablePath: path.resolve('node_modules/electron/dist/electron.exe'), args: [appDirectory, `--data-dir=${profile}`], env, timeout: 30000 });
const exceptions = [];
let instance;
try {
  instance = await launch();
  const page = await instance.firstWindow(); page.on('pageerror', error => exceptions.push(error.message));
  await page.getByRole('button', { name: 'Verstanden, Vollzugriff bestätigen', exact: true }).click();
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name: 'Gespräch', exact: true }).click();
  await page.evaluate(async url => {
    await window.openhiatus.saveProvider({ id: 'local', baseUrl: url, models: ['storage-test'] });
    await window.openhiatus.savePreferences({ model: 'local/storage-test', dialogModel: 'local/storage-test', memoryModel: 'local/storage-test', memoryAutoSummarize: false, speakReplies: false, earcons: false });
  }, baseUrl);
  const saved = async () => JSON.parse(await readFile(path.join(profile, 'state.json'), 'utf8')).state;
  await expect.poll(async () => (await saved()).preferences.dialogModel).toBe('local/storage-test');
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).connections.agent), { timeout: 30000 }).toBe('ready');
  await writeFile(gate, 'hold');
  await page.evaluate(() => {
    window.__sendResult = { settled: false };
    window.__send = window.openhiatus.send('Synthetische Nachricht während eines blockierten Schreibvorgangs.', 'held-request').then(
      () => { window.__sendResult = { settled: true }; },
      error => { window.__sendResult = { settled: true, error: error.message }; });
  });
  await expect.poll(async () => { try { return JSON.parse(await readFile(held, 'utf8')).threadId; } catch { return 0; } }).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).messages.some(message => message.id === 'held-request'))).toBe(true);
  assert.equal(await page.evaluate(() => window.__sendResult.settled), false);
  assert.equal(requests, 0, 'Agent work must wait for the durable admission ACK');
  const stoppedAt = performance.now();
  await page.evaluate(() => window.openhiatus.stop());
  const stopMs = Number((performance.now() - stoppedAt).toFixed(3));
  assert.ok(stopMs < 2000, `Stop waited ${stopMs} ms while the worker write was held`);
  assert.equal(await readFile(gate, 'utf8'), 'hold');
  const snapshot = await page.evaluate(() => window.openhiatus.snapshot());
  assert.equal(snapshot.task.status, 'interrupted');
  assert.equal(await page.evaluate(() => window.openhiatus.memorySource('held-request')), undefined, 'Unacknowledged admission must not leak into memory');
  assert.equal(await page.evaluate(() => window.__sendResult.settled), false);
  await writeFile(gate, 'release');
  await page.evaluate(() => window.__send);
  assert.equal(requests, 0, 'A stopped admission must not start after its late ACK');
  await expect.poll(async () => (await saved()).task.status).toBe('interrupted');

  // Exercise the renderer's own pending Send as well as the backend-only case above.
  const uiDraft = 'Diesen UI-Entwurf nach Stop und später Bestätigung behalten.';
  const composer = page.getByRole('textbox', { name: 'Dein Auftrag', exact: true });
  await composer.fill(uiDraft);
  await writeFile(gate, 'hold');
  await page.getByRole('button', { name: 'Auftrag senden', exact: true }).click();
  await expect.poll(() => page.evaluate(async text => (await window.openhiatus.snapshot()).messages.find(message => message.role === 'user' && message.text === text)?.id, uiDraft)).toBeTruthy();
  const uiRequestId = await page.evaluate(async text => (await window.openhiatus.snapshot()).messages.find(message => message.role === 'user' && message.text === text).id, uiDraft);
  await expect(page.getByRole('button', { name: 'Auftrag senden', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Stopp Esc', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).task.status)).toBe('interrupted');
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await writeFile(gate, 'release');
  await expect.poll(async () => (await saved()).messages.some(message => message.id === uiRequestId)).toBe(true);
  await expect.poll(async () => (await saved()).task.status).toBe('interrupted');
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  await expect(page.getByRole('textbox', { name: 'Dein Auftrag', exact: true, includeHidden: true })).toHaveValue(uiDraft);
  await expect(page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name: 'Einstellungen', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('status').filter({ hasText: 'Stopp angefordert.' })).toBeVisible();
  assert.equal(requests, 0, 'The renderer send must stay stopped after its admission ACK.');
  await instance.close(); instance = undefined;
  instance = await launch();
  const restarted = await instance.firstWindow(); restarted.on('pageerror', error => exceptions.push(error.message));
  await expect.poll(() => restarted.evaluate(async () => (await window.openhiatus.snapshot()).connections.agent), { timeout: 30000 }).toBe('ready');
  const restored = await restarted.evaluate(() => window.openhiatus.snapshot());
  assert.equal(restored.task.status, 'interrupted');
  assert.ok(restored.messages.some(message => message.id === 'held-request'));
  assert.equal(requests, 0, 'Restart must not replay the interrupted admission');
  assert.deepEqual(exceptions, []);
  const result = { status: 'passed', profile, stopMs, heldWorker: JSON.parse(await readFile(held, 'utf8')), modelRequests: requests,
    checked: ['real Main and renderer with production writer and gated real worker', 'UI snapshot and Stop respond while worker write is held', 'no agent work before admission ACK', 'no unacknowledged memory source', 'late ACK after Stop never starts work', 'renderer send preserves draft, Stop notice and view after late ACK', 'interrupted history persists across restart without replay', 'synthetic profile and local HTTP endpoint only'] };
  await writeFile('artifacts/openhiatus-async-speicher-ui.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const workerTrace = await readFile(path.join(profile, 'write-trace.jsonl'), 'utf8').then(contents => contents.trim().split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return { incompleteLine: line }; }
  })).catch(() => [{ traceUnavailable: true }]);
  console.error(JSON.stringify({ profile, workerTrace }, null, 2));
  throw error;
} finally {
  await writeFile(gate, 'release');
  if (instance) await instance.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
