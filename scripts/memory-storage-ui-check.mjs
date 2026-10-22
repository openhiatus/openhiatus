import { _electron as electron, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

// A private build copy gates individual calls before the real memory worker executes them.
await mkdir('.test-data', { recursive: true }); await mkdir('artifacts', { recursive: true });
const directory = await mkdtemp(path.resolve('.test-data/memory-storage-ui-'));
const appDirectory = path.join(directory, 'app'), profile = path.join(directory, 'profile');
await mkdir(profile, { recursive: true });
await cp(path.resolve('dist'), path.join(appDirectory, 'dist'), { recursive: true });
const { name, productName, version } = JSON.parse(await readFile('package.json', 'utf8'));
await writeFile(path.join(appDirectory, 'package.json'), JSON.stringify({ name, productName, version, main: 'dist/main.cjs' }));
const workerDirectory = path.join(appDirectory, 'dist');
await cp(path.join(workerDirectory, 'memory-worker.cjs'), path.join(workerDirectory, 'real-memory-worker.cjs'));
const gate = path.join(profile, 'memory-gate.txt'), held = path.join(profile, 'memory-held.json');
await writeFile(gate, '');
await writeFile(path.join(workerDirectory, 'memory-worker.cjs'), `
const { parentPort, workerData, threadId } = require('node:worker_threads');
const { readFileSync, writeFileSync } = require('node:fs');
const { join, dirname } = require('node:path');
const profile = dirname(workerData.directory), gate = join(profile, 'memory-gate.txt');
const on = parentPort.on.bind(parentPort);
parentPort.on = (event, callback) => on(event, event === 'message' ? value => {
  if (value?.type === 'call' && readFileSync(gate, 'utf8') === value.method) {
    writeFileSync(join(profile, 'memory-held.json'), JSON.stringify({ id: value.id, method: value.method, threadId }));
    const wait = new Int32Array(new SharedArrayBuffer(4));
    while (readFileSync(gate, 'utf8') === value.method) Atomics.wait(wait, 0, 0, 10);
  }
  callback(value);
} : callback);
require('./real-memory-worker.cjs');
`);
let requests = 0;
const server = createServer((request, response) => { requests++; request.resume(); response.writeHead(500); response.end('No model request expected.'); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const launch = () => electron.launch({ executablePath: path.resolve('node_modules/electron/dist/electron.exe'), args: [appDirectory, `--data-dir=${profile}`], env, timeout: 30000 });
const exceptions = [], timings = [];
const waitHeld = method => expect.poll(async () => { try { return JSON.parse(await readFile(held, 'utf8')).method; } catch { return ''; } }).toBe(method);
const memoryFile = path.join(profile, 'Gedächtnis', 'memory.json');
let instance;
try {
  instance = await launch();
  const page = await instance.firstWindow(); page.on('pageerror', error => exceptions.push(error.message));
  await page.getByRole('button', { name: 'Verstanden, Vollzugriff bestätigen', exact: true }).click();
  await page.evaluate(async url => {
    await window.openhiatus.saveProvider({ id: 'local', baseUrl: url, models: ['memory-storage-test'] });
    await window.openhiatus.savePreferences({ model: 'local/memory-storage-test', dialogModel: 'local/memory-storage-test', memoryModel: 'local/memory-storage-test', memoryAutoSummarize: false, speakReplies: false, earcons: false });
  }, baseUrl);
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).connections.agent), { timeout: 30000 }).toBe('ready');
  const original = (await page.evaluate(() => window.openhiatus.memorySnapshot())).documents.find(document => document.id === 'identity');
  const content = 'Synthetische Identität: Grüße, äöü ÄÖÜ ß. Änderungen erst nach Speicherbestätigung melden.';
  await writeFile(gate, 'edit');
  await page.evaluate(({ content, version }) => {
    window.__edited = false;
    window.__editing = window.openhiatus.editMemory('identity', content, version).then(result => { window.__edited = true; return result; });
  }, { content, version: original.version });
  await waitHeld('edit');
  assert.equal(await page.evaluate(() => window.__edited), false);
  const diskIdentity = JSON.parse(await readFile(memoryFile, 'utf8')).state.documents.find(document => document.id === 'identity');
  assert.equal(diskIdentity.version, original.version, 'A held edit is not a committed version');
  const stop = async stage => {
    const start = performance.now(); await page.evaluate(() => window.openhiatus.stop());
    const milliseconds = Number((performance.now() - start).toFixed(3));
    assert.ok(milliseconds < 2000, `${stage}: Stop waited ${milliseconds} ms for memory`);
    await page.evaluate(() => window.openhiatus.snapshot());
    timings.push({ stage, stopMs: milliseconds });
  };
  await stop('held-edit'); assert.equal(await readFile(gate, 'utf8'), 'edit');
  await writeFile(gate, '');
  const edited = await page.evaluate(() => window.__editing);
  assert.equal(edited.documents.find(document => document.id === 'identity').content, content);
  assert.equal(edited.documents.find(document => document.id === 'identity').version, original.version + 1);

  await writeFile(gate, 'retrieve');
  await page.evaluate(() => {
    window.__sent = false;
    window.__sending = window.openhiatus.send('Synthetischer Auftrag mit wartendem Gedächtnisabruf.', 'memory-held-request').then(
      () => { window.__sent = true; }, error => { window.__sent = true; window.__sendError = error.message; });
  });
  await waitHeld('retrieve'); assert.equal(requests, 0);
  assert.equal(await page.evaluate(() => window.__sent), false);
  await stop('held-retrieval'); assert.equal(await readFile(gate, 'utf8'), 'retrieve');
  assert.equal((await page.evaluate(() => window.openhiatus.snapshot())).task.status, 'interrupted');
  await writeFile(gate, ''); await page.evaluate(() => window.__sending);
  assert.equal(requests, 0, 'Late memory results must not start a stopped agent');
  await instance.close(); instance = undefined;
  instance = await launch();
  const restarted = await instance.firstWindow(); restarted.on('pageerror', error => exceptions.push(error.message));
  await expect.poll(() => restarted.evaluate(async () => (await window.openhiatus.snapshot()).connections.agent), { timeout: 30000 }).toBe('ready');
  const restored = await restarted.evaluate(() => window.openhiatus.memorySnapshot());
  assert.equal(restored.documents.find(document => document.id === 'identity').content, content);
  assert.equal(restored.documents.find(document => document.id === 'identity').version, original.version + 1);
  assert.equal((await restarted.evaluate(() => window.openhiatus.snapshot())).task.status, 'interrupted');
  assert.equal(requests, 0); assert.deepEqual(exceptions, []);

  // The native close button must keep the window alive until its last accepted edit is durable.
  await writeFile(gate, 'edit');
  const closingContent = `${content} Der letzte Edit wird auch beim Schließen gespeichert.`;
  await restarted.evaluate(({ content, version }) => {
    void window.openhiatus.editMemory('identity', content, version).catch(() => {});
  }, { content: closingContent, version: original.version + 1 });
  await waitHeld('edit');
  assert.equal(await instance.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]; window.close(); return !window.isDestroyed();
  }), true, 'Window must remain available while shutdown waits for the memory ACK');
  const appClosed = new Promise(resolve => instance.once('close', resolve));
  await writeFile(gate, '');
  await appClosed; instance = undefined;
  const finalIdentity = JSON.parse(await readFile(memoryFile, 'utf8')).state.documents.find(document => document.id === 'identity');
  assert.equal(finalIdentity.content, closingContent); assert.equal(finalIdentity.version, original.version + 2);
  const result = { status: 'passed', profile, timings, heldWorker: JSON.parse(await readFile(held, 'utf8')), modelRequests: requests,
    checked: ['production memory worker in private app copy', 'UI and Stop respond during held edit and retrieval', 'edit acknowledgement follows durable commit', 'accepted edit survives Stop and restart with Unicode and version', 'late retrieval cannot start stopped agent', 'restart never replays interrupted work', 'native close keeps window until final accepted edit is durable', 'synthetic profile and local endpoint only'] };
  await writeFile('artifacts/openhiatus-gedaechtnisspeicher-ui.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await writeFile(gate, ''); if (instance) await instance.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
