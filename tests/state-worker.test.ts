import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { mkdtemp, mkdir, readFile, readdir, rm, rmdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
import { WorkerStateStore, StateWorkerUnavailableError } from '../src/main/platform/persistence';
import { decodeBootstrap, decodeStateRequest, decodeStateResponse, StateWorkerProtocolError } from '../src/main/platform/persistence/protocol';
import { defaultState, StateStore, UnsupportedStateVersion, type SavedState } from '../src/main/storage';

async function fixture(t: { after(callback: () => Promise<void>): void }, source?: string) {
  const directory = await mkdtemp(join(tmpdir(), 'openhiatus-state-worker-'));
  const artifacts = resolve('.test-data'); await mkdir(artifacts, { recursive: true });
  const bundleDirectory = await mkdtemp(join(artifacts, 'state-worker-')), entry = join(bundleDirectory, 'state-worker.cjs');
  if (source) await writeFile(entry, source, 'utf8');
  else await build({ entryPoints: ['src/main/state-worker.ts'], platform: 'node', target: 'node24', format: 'cjs', bundle: true, outfile: entry });
  const stores: WorkerStateStore[] = [];
  t.after(async () => {
    for (const store of stores) await store.dispose().catch(() => {});
    assert.equal(dirname(directory).toLowerCase(), resolve(tmpdir()).toLowerCase()); assert.ok(basename(directory).startsWith('openhiatus-state-worker-'));
    assert.equal(dirname(bundleDirectory), artifacts); assert.ok(basename(bundleDirectory).startsWith('state-worker-'));
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    await rm(bundleDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  return { directory, entry, create: (options: { timeoutMs?: number; shutdownTimeoutMs?: number } = {}) => {
    const store = new WorkerStateStore(directory, { workerPath: entry, ...options }); stores.push(store); return store;
  } };
}
function state(text: string): SavedState {
  const result = defaultState(); result.messages.push({ id: 'message-1', role: 'user', text, at: '2026-10-21T12:00:00.000Z' }); return result;
}
const fakeWorker = (handler: string) => `const {parentPort,threadId}=require('node:worker_threads');parentPort.postMessage({version:1,type:'ready',threadId});parentPort.on('message',message=>{${handler}});`;

test('real worker commits immutable queued snapshots in order and acknowledges complete primary/backup writes', async t => {
  const f = await fixture(t), store = f.create(), snapshot = state('Präzise Grüße');
  const first = store.commit(snapshot);
  snapshot.messages[0].text = 'Zweiter Stand'; snapshot.preferences.voiceId = 'Second';
  const second = store.commit(snapshot);
  snapshot.messages[0].text = 'Must not reach either queued write';
  await Promise.all([first, second]); await store.flush();
  const primary = JSON.parse(await readFile(join(f.directory, 'state.json'), 'utf8'));
  const backup = JSON.parse(await readFile(join(f.directory, 'state.backup.json'), 'utf8'));
  assert.equal(primary.version, 1); assert.equal(primary.state.messages[0].text, 'Zweiter Stand'); assert.equal(primary.state.preferences.voiceId, 'Second');
  assert.equal(backup.state.messages[0].text, 'Präzise Grüße'); assert.equal(backup.state.preferences.voiceId, 'Dennis');
  assert.equal((await readdir(f.directory)).includes('state.json.tmp'), false);
  await store.dispose(); assert.equal(new StateStore(f.directory).load().messages[0].text, 'Zweiter Stand');
  await assert.rejects(store.commit(state('After dispose')), /beendet/);
});

test('worker bootstrap is a separate thread and bundle/commit exclude credential and memory objects', async t => {
  const f = await fixture(t);
  const worker = new Worker(f.entry, { workerData: { version: 1, directory: f.directory }, env: {}, execArgv: [] });
  const ready: unknown = await new Promise((done, fail) => { worker.once('message', done); worker.once('error', fail); });
  const decoded = decodeStateResponse(ready); assert.ok(decoded.type === 'ready' && decoded.threadId > 0);
  const exit = new Promise<number>(done => worker.once('exit', done)); worker.postMessage({ version: 1, type: 'close' }); assert.equal(await exit, 0);
  const source = await readFile(f.entry, 'utf8'); assert.ok(!source.includes('class CredentialStore')); assert.ok(!source.includes('credentials.json')); assert.ok(!source.includes('MemoryStore'));
  const snapshot = state('Only SavedState crosses');
  Reflect.set(snapshot, 'credentials', { apiKey: 'synthetic-secret', get: () => assert.fail('Must not be cloned') });
  Reflect.set(snapshot, 'memory', { rebuild: () => assert.fail('Must not be cloned') });
  Reflect.set(snapshot, 'connections', { openai: 'synthetic-secret' });
  const store = f.create(); await store.commit(snapshot);
  const serialized = await readFile(join(f.directory, 'state.json'), 'utf8');
  assert.ok(!serialized.includes('synthetic-secret')); assert.ok(!serialized.includes('connections')); assert.ok(!serialized.includes('credentials'));
});

test('adapter workers inherit neither ambient credential environment nor main-process preload arguments', async t => {
  const name = 'OPENHIATUS_STATE_WORKER_SYNTHETIC_KEY', previous = process.env[name];
  process.env[name] = 'synthetic-only';
  try {
    const f = await fixture(t, `if(process.env.${name}!==undefined||process.execArgv.length)throw new Error('Ambient configuration leaked');${fakeWorker(`if(message.type==='commit')parentPort.postMessage({version:1,type:'committed',id:message.id});if(message.type==='close')parentPort.close();`)}`);
    const store = f.create(); await store.commit(state('Clean worker environment')); await store.dispose();
  } finally { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; }
});

test('validation failure stays explicit; newer successful commit clears old flush failures without automatic replay', async t => {
  const f = await fixture(t), store = f.create(), invalid = state('Invalid'); Reflect.set(invalid.task, 'status', 'not-a-status');
  await assert.rejects(store.commit(invalid), /Aufgabenstatus/); await assert.rejects(store.flush(), /Aufgabenstatus/);
  assert.deepEqual(await readdir(f.directory), []);
  await store.commit(state('Explicit retry')); await store.flush();
  assert.equal(new StateStore(f.directory).load().messages[0].text, 'Explicit retry');
  const uncloneable = state('Cannot clone'); Reflect.set(uncloneable.messages[0], 'text', () => {});
  await assert.rejects(store.commit(uncloneable), /übernommen/); await assert.rejects(store.flush(), /übernommen/);
  await store.commit(state('Explicit retry after capture failure')); await store.flush();
  assert.equal(new StateStore(f.directory).load().messages[0].text, 'Explicit retry after capture failure');
});

test('unsupported state version survives worker error roundtrip without replacing primary or backup', async t => {
  const f = await fixture(t), original = '{"version":99,"state":{"untouched":true}}';
  await writeFile(join(f.directory, 'state.json'), original, 'utf8');
  const store = f.create(); await assert.rejects(store.commit(state('Must not overwrite')), UnsupportedStateVersion);
  assert.equal(await readFile(join(f.directory, 'state.json'), 'utf8'), original);
  assert.equal((await readdir(f.directory)).includes('state.backup.json'), false);
  await assert.rejects(store.dispose(), UnsupportedStateVersion);
});

test('corrupt primary retains validated backup and existing synchronous recovery behavior', async t => {
  const f = await fixture(t), synchronous = new StateStore(f.directory);
  synchronous.save(state('Backup')); synchronous.save(state('Primary'));
  await writeFile(join(f.directory, 'state.json'), '{damaged', 'utf8');
  const store = f.create(); await store.commit(state('New primary')); await store.dispose();
  assert.equal(JSON.parse(await readFile(join(f.directory, 'state.backup.json'), 'utf8')).state.messages[0].text, 'Backup');
  await writeFile(join(f.directory, 'state.json'), '{damaged again', 'utf8');
  const recovered = new StateStore(f.directory).load(); assert.equal(recovered.messages[0].text, 'Backup'); assert.equal(recovered.preferences.fullAccessAcknowledged, false);
});

test('a real atomic-rename failure is rejected; only a later explicit retry can confirm a saved state', async t => {
  const f = await fixture(t); await mkdir(join(f.directory, 'state.json'));
  const store = f.create(); await assert.rejects(store.commit(state('Failed rename'))); await assert.rejects(store.flush());
  await rmdir(join(f.directory, 'state.json'));
  await store.commit(state('Explicit retry after file error')); await store.flush();
  assert.equal(new StateStore(f.directory).load().messages[0].text, 'Explicit retry after file error');
});

test('worker crash rejects all pending calls and permanently blocks that instance without automatic writes', async t => {
  const f = await fixture(t, fakeWorker(`if(message.type==='commit'){require('node:fs').appendFileSync(require('node:path').join(require('node:worker_threads').workerData.directory,'attempts.txt'),'attempt\\n');process.exit(37);}`));
  const store = f.create();
  const first = store.commit(state('First')), second = store.commit(state('Second'));
  await assert.rejects(first, StateWorkerUnavailableError); await assert.rejects(second, StateWorkerUnavailableError);
  await assert.rejects(store.commit(state('No automatic restart')), StateWorkerUnavailableError);
  await assert.rejects(store.flush(), StateWorkerUnavailableError); await assert.rejects(store.dispose(), StateWorkerUnavailableError);
  assert.equal(await readFile(join(f.directory, 'attempts.txt'), 'utf8'), 'attempt\n');
});

test('malformed or out-of-order confirmation never acknowledges a write', async t => {
  const f = await fixture(t, fakeWorker(`if(message.type==='commit')parentPort.postMessage({version:1,type:'committed',id:message.id+1});`));
  const store = f.create(); await assert.rejects(store.commit(state('No ACK')), /Speicherbestätigung/);
  await assert.rejects(store.flush()); assert.deepEqual(await readdir(f.directory), []);
});

test('unconfirmed write timeout blocks writes and dispose confirms worker termination before propagating failure', async t => {
  const f = await fixture(t, fakeWorker(''));
  const store = f.create({ timeoutMs: 200 }); await store.flush();
  await assert.rejects(store.commit(state('No response')), /unbestätigt/);
  await assert.rejects(store.commit(state('No retry')), /unbestätigt/); await assert.rejects(store.dispose(), /unbestätigt/);
});

test('dispose waits submitted writes, forbids new ones, and propagates a preceding validation failure', async t => {
  const f = await fixture(t), store = f.create();
  const save = store.commit(state('Shutdown snapshot')), close = store.dispose();
  await assert.rejects(store.commit(state('Too late')), /beendet/); await save; await close;
  assert.equal(new StateStore(f.directory).load().messages[0].text, 'Shutdown snapshot');
  const another = f.create(), invalid = state('No success'); Reflect.set(invalid.preferences, 'speakReplies', 'yes');
  await assert.rejects(another.commit(invalid), /Spracheinstellung/); await assert.rejects(another.dispose(), /Spracheinstellung/);
  await assert.rejects(another.dispose(), /Spracheinstellung/);
  assert.equal(new StateStore(f.directory).load().messages[0].text, 'Shutdown snapshot');
});

test('explicit close retry confirms later termination after the last write ACK without replaying it', async t => {
  const terminate = Worker.prototype.terminate, terminations: Promise<number>[] = [];
  t.mock.method(Worker.prototype, 'terminate', function (this: Worker) {
    const termination = terminate.call(this); terminations.push(termination); return termination;
  });
  const f = await fixture(t, fakeWorker(`if(message.type==='commit'){
    const fs=require('node:fs'),path=require('node:path'),directory=require('node:worker_threads').workerData.directory;
    fs.appendFileSync(path.join(directory,'attempts.txt'),'commit\\n');
    fs.writeFileSync(path.join(directory,'state.json'),JSON.stringify({version:1,state:message.state}));
    parentPort.postMessage({version:1,type:'committed',id:message.id});
  }`));
  const store = f.create({ shutdownTimeoutMs: 100 });
  await store.commit(state('Already acknowledged final snapshot'));
  const first = store.dispose();
  assert.equal(store.dispose(), first);
  await assert.rejects(first, /Ende des Verlaufsspeichers wurde nicht bestätigt/);
  assert.equal(terminations.length, 1); await terminations[0];
  const retry = store.dispose(); assert.notEqual(retry, first);
  await retry;
  assert.equal(store.dispose(), retry);
  assert.equal(new StateStore(f.directory).load().messages[0].text, 'Already acknowledged final snapshot');
  assert.equal(await readFile(join(f.directory, 'attempts.txt'), 'utf8'), 'commit\n');
  await assert.rejects(store.commit(state('Never replay after shutdown')), StateWorkerUnavailableError);
});

test('protocol rejects mutable write directories, unknown methods and invalid paths before storage work', () => {
  for (const value of [null, { version: 2, directory: resolve('.') }, { version: 1, directory: 'relative' }, { version: 1, directory: resolve('.'), apiKey: 'not-allowed' }]) assert.throws(() => decodeBootstrap(value), StateWorkerProtocolError);
  for (const value of [{ version: 1, type: 'commit', id: 0, state: {} }, { version: 1, type: 'commit', id: 1, state: {}, directory: resolve('.') }, { version: 1, type: 'save', id: 1, state: {} }, { version: 1, type: 'close', directory: resolve('.') }]) assert.throws(() => decodeStateRequest(value), StateWorkerProtocolError);
  for (const value of [{ version: 1, type: 'ready', threadId: 0 }, { version: 1, type: 'committed', id: Number.NaN }, { version: 1, type: 'rejected', id: 1, error: { kind: 'other', message: 'no' } }]) assert.throws(() => decodeStateResponse(value), StateWorkerProtocolError);
});
