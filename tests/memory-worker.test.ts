import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { mkdtemp, mkdir, readFile, readdir, rm, rmdir, writeFile, access } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
import { WorkerMemoryStore, MemoryWorkerUnavailableError, type WorkerMemoryStoreOptions } from '../src/main/platform/persistence';
import { decodeMemoryBootstrap, decodeMemoryRequest, decodeMemoryResponse, decodeMemoryResult, MemoryWorkerProtocolError } from '../src/main/platform/persistence/memory-protocol';
import { MemoryStore, UnsupportedMemoryVersion } from '../src/main/memory';
import type { Message } from '../src/shared/contracts';

async function fixture(t: { after(callback: () => Promise<void>): void }, wrapper?: (entry: string) => string) {
  const directory = await mkdtemp(join(tmpdir(), 'openhiatus-memory-worker-'));
  const artifacts = resolve('.test-data'); await mkdir(artifacts, { recursive: true });
  const bundleDirectory = await mkdtemp(join(artifacts, 'memory-worker-')), realEntry = join(bundleDirectory, 'memory-worker.cjs');
  await build({ entryPoints: ['src/main/memory-worker.ts'], platform: 'node', target: 'node24', format: 'cjs', bundle: true, outfile: realEntry });
  const entry = wrapper ? join(bundleDirectory, 'wrapper.cjs') : realEntry;
  if (wrapper) await writeFile(entry, wrapper(realEntry), 'utf8');
  const stores: WorkerMemoryStore[] = [];
  t.after(async () => {
    for (const store of stores) await store.dispose().catch(() => {});
    assert.equal(dirname(directory).toLowerCase(), resolve(tmpdir()).toLowerCase()); assert.ok(basename(directory).startsWith('openhiatus-memory-worker-'));
    assert.equal(dirname(bundleDirectory), artifacts); assert.ok(basename(bundleDirectory).startsWith('memory-worker-'));
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    await rm(bundleDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  return { directory, entry, create: (options: Omit<WorkerMemoryStoreOptions, 'workerPath'> = {}, location = directory) => {
    const store = new WorkerMemoryStore(location, { workerPath: entry, ...options }); stores.push(store); return store;
  } };
}
function message(id: string, text: string, at = '2026-10-05T12:00:00Z'): Message { return { id, text, at, role: 'user' }; }
test('four-file migration and external edits update the acknowledged worker instruction cache', async t => {
  const f = await fixture(t), store = f.create(); await store.initialize();
  await store.initializeProfile({ name: 'Juno', personalityId: 'direct', templates: [] });
  assert.equal(store.instructionDocuments().length, 5);
  await writeFile(join(f.directory, 'IDENTITY.md'), '# IDENTITY.md\n- **Name:** Kai\n- **Emoji:** 🌙', 'utf8');
  await store.snapshot();
  assert.match(store.instructionDocuments().find(document => document.id === 'agent')!.content, /Kai/);
  await store.flush();
});
const instructions = [{ id: 'identity', version: 1, content: 'Synthetic identity' }, { id: 'core', version: 1, content: '' }];
const fakeWorker = (handler: string) => `const {parentPort,threadId}=require('node:worker_threads');parentPort.on('message',message=>{
  if(message.type==='initialize'){parentPort.postMessage({version:1,type:'ready',threadId,instructions:${JSON.stringify(instructions)}});return;}
  if(message.type==='close'){parentPort.close();return;}${handler}});`;
const holdWorker = (method: string, ms: number) => (entry: string) => `const {parentPort}=require('node:worker_threads'),on=parentPort.on;
  parentPort.on=function(event,handler){return on.call(this,event,event==='message'?message=>{
    if(message.type==='call'&&message.method===${JSON.stringify(method)})Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,${ms});
    handler(message);
  }:handler);};require(${JSON.stringify(entry)});`;

test('initialize loads only in its worker and exposes detached confirmed instructions', async t => {
  const f = await fixture(t), location = join(f.directory, 'created-in-worker'); let secretsRead = 0;
  const store = f.create({ getSecrets: () => { secretsRead++; return []; } }, location);
  assert.equal(secretsRead, 0); await assert.rejects(access(location));
  assert.throws(() => store.instructionDocuments(), /initialisiert/);
  const first = store.initialize(); assert.equal(store.initialize(), first); await first;
  assert.ok(secretsRead > 0); assert.equal(store.instructionDocuments().length, 2);
  const detached = store.instructionDocuments(); detached[0].content = 'Local mutation';
  assert.notEqual(store.instructionDocuments()[0].content, 'Local mutation');
  assert.equal((await store.snapshot()).sourceCount, 0);
  const source = await readFile(f.entry, 'utf8');
  assert.ok(!source.includes('CredentialStore')); assert.ok(!source.includes('providers.json')); assert.ok(!source.includes('ModelClient'));
});

test('real FIFO captures immutable arguments and ACKs complete primary/backup writes', async t => {
  const f = await fixture(t), store = f.create(), row = message('m1', 'Präzise Grüße');
  const first = store.capture([row], 'conversation'); row.text = 'Second';
  const second = store.capture([row], 'conversation'); row.text = 'Must not be captured';
  const snapshot = store.snapshot(); await Promise.all([first, second]);
  assert.equal((await snapshot).sourceCount, 1); assert.equal((await store.source('m1'))?.text, 'Second');
  const primary = JSON.parse(await readFile(join(f.directory, 'memory.json'), 'utf8'));
  const backup = JSON.parse(await readFile(join(f.directory, 'memory.backup.json'), 'utf8'));
  assert.equal(primary.version, 1); assert.equal(primary.state.sources[0].text, 'Second'); assert.equal(backup.state.sources[0].text, 'Präzise Grüße');
  assert.ok(!(await readdir(f.directory)).includes('memory.json.tmp'));
  await store.flush(); await store.dispose();
  assert.equal(new MemoryStore(f.directory).source('m1')?.text, 'Second');
});

test('held real edit keeps the old cache until its ACK while the main thread stays responsive', async t => {
  const f = await fixture(t, holdWorker('edit', 160)), store = f.create(); await store.initialize();
  const before = store.instructionDocuments(), edit = store.edit('core', 'Confirmed new core', 1), next = store.snapshot();
  await new Promise(done => setTimeout(done, 35)); assert.deepEqual(store.instructionDocuments(), before);
  await edit; assert.equal(store.instructionDocuments().find(doc => doc.id === 'core')?.content, 'Confirmed new core');
  assert.equal((await next).documents.find(doc => doc.id === 'core')?.version, 2);
});

test('all real read methods, explicit period paging and summary methods retain their store contracts', async t => {
  const f = await fixture(t), store = f.create();
  await store.capture([message('long', 'Historical purple decision. ' + 'Quelltext '.repeat(2200))], 'conversation');
  assert.equal(await store.source('missing'), undefined); assert.ok((await store.search('purple')).some(row => row.id === 'long'));
  const context = await store.retrieve('purple', { maxChars: 3000, maxBytes: 4000, includeInstructions: false });
  assert.ok(context.text.includes('purple')); assert.ok(!context.retrieval.documentIds.includes('identity'));
  assert.deepEqual((await store.snapshot()).lastRetrieval, context.retrieval);
  const page = await store.readPeriod({ documentId: 'day:2026-10-05', maxBytes: 512 }); assert.ok(page.found); assert.ok(page.nextCursor); assert.ok(Buffer.byteLength(page.text) <= 512);
  const next = await store.readPeriod({ documentId: 'day:2026-10-05', maxBytes: 512, cursor: page.nextCursor }, true); assert.ok(next.offset > 0);
  const planned = await store.planSummaries({ closedOnly: false, now: new Date('2026-12-01') }); assert.ok(planned.some(job => job.documentId === 'day:2026-10-05'));
  assert.deepEqual(await store.planSummaries({ now: '2026-12-01' }), planned);
  const input = await store.summaryInput('day:2026-10-05'); assert.equal(input.records[0].text.length, (await store.source('long'))?.text.length);
  const summarized = await store.applySummary(input, { content: 'The recorded decision was purple.', model: 'synthetic/offline', citations: ['long'] });
  assert.equal(summarized.documents.find(doc => doc.id === input.documentId)?.summary?.model, 'synthetic/offline');
  await store.capture([message('later', 'An additional source.')], 'conversation');
  await assert.rejects(store.applySummary(input, { content: 'Stale', model: 'synthetic/offline' }), /inzwischen/);
  await assert.rejects(store.flush(), /inzwischen/);
  await store.rebuild(); await store.flush();
});

test('proposals change the instruction cache only after explicit approval; failed mutations stay explicit', async t => {
  const f = await fixture(t), store = f.create(); await store.initialize();
  const before = store.instructionDocuments();
  const proposal = await store.propose({ documentId: 'core', baseVersion: 1, content: 'Approved preference', reason: 'Explicit request' });
  assert.deepEqual(store.instructionDocuments(), before);
  await store.decide(proposal.id, 'approve');
  assert.equal(store.instructionDocuments().find(doc => doc.id === 'core')?.content, 'Approved preference');
  const confirmed = store.instructionDocuments();
  await assert.rejects(store.edit('core', 'Wrong version', 1), /inzwischen/);
  await store.snapshot(); await assert.rejects(store.flush(), /inzwischen/); assert.deepEqual(store.instructionDocuments(), confirmed);
  await store.edit('core', 'Explicit next edit', 2); await store.flush();
});

test('real write failure leaves state/cache unchanged and permits only an explicit later retry', async t => {
  const f = await fixture(t), store = f.create(); await store.initialize(); const before = store.instructionDocuments();
  await mkdir(join(f.directory, 'memory.json.tmp'));
  await assert.rejects(store.edit('core', 'Failed atomic write', 1)); await assert.rejects(store.flush());
  assert.deepEqual(store.instructionDocuments(), before); assert.equal((await store.snapshot()).documents.find(doc => doc.id === 'core')?.content, '');
  await rmdir(join(f.directory, 'memory.json.tmp')); await store.edit('core', 'Explicit retry', 1); await store.flush();
  assert.equal(new MemoryStore(f.directory).instructionDocuments().find(doc => doc.id === 'core')?.content, 'Explicit retry');
});

test('external modifications are preserved and read success never clears a failed mutation', async t => {
  const f = await fixture(t), store = f.create(); await store.initialize();
  const modified = (await readFile(join(f.directory, 'memory.json'), 'utf8')) + '\n ';
  await writeFile(join(f.directory, 'memory.json'), modified);
  await assert.rejects(store.edit('core', 'Must not overwrite', 1), /außerhalb/);
  await store.snapshot(); await assert.rejects(store.flush(), /außerhalb/);
  await assert.rejects(store.dispose(), /außerhalb/); await assert.rejects(store.dispose(), /außerhalb/);
  assert.equal(await readFile(join(f.directory, 'memory.json'), 'utf8'), modified);
});

test('worker preserves backup recovery and unsupported versions without rewriting those files', async t => {
  const f = await fixture(t), seeded = new MemoryStore(f.directory);
  seeded.edit('core', 'Backup core', 1); seeded.edit('core', 'Primary core', 2);
  await writeFile(join(f.directory, 'memory.json'), '{damaged');
  const recovered = f.create(); await recovered.initialize(); assert.equal((await recovered.snapshot()).recovered, true);
  assert.equal(recovered.instructionDocuments().find(doc => doc.id === 'core')?.content, 'Backup core');
  await recovered.edit('core', 'Recovered edit', 2); await recovered.dispose();
  assert.equal(new MemoryStore(f.directory).instructionDocuments().find(doc => doc.id === 'core')?.content, 'Recovered edit');
  const unsupportedDirectory = join(f.directory, 'unsupported'); await mkdir(unsupportedDirectory);
  const original = '{"version":99,"state":{"untouched":true}}'; await writeFile(join(unsupportedDirectory, 'memory.json'), original);
  const unsupported = f.create({}, unsupportedDirectory); await assert.rejects(unsupported.initialize(), UnsupportedMemoryVersion);
  await assert.rejects(unsupported.snapshot(), UnsupportedMemoryVersion);
  assert.equal(await readFile(join(unsupportedDirectory, 'memory.json'), 'utf8'), original); assert.deepEqual(await readdir(unsupportedDirectory), ['memory.json']);
});

test('initial and per-call secrets redact worker persistence; latest secrets and sanitizer protect held results/cache', async t => {
  const f = await fixture(t, holdWorker('snapshot', 120)), seeded = new MemoryStore(f.directory);
  seeded.edit('core', 'initial-private late-private custom-private', 1);
  let secrets = ['initial-private'], latest = false;
  const store = f.create({ getSecrets: () => secrets, sanitize: value => latest ? value.replaceAll('custom-private', '[custom]') : value });
  await store.initialize(); assert.ok(!JSON.stringify(store.instructionDocuments()).includes('initial-private'));
  const held = store.snapshot(); secrets = ['initial-private', 'late-private', 'incoming-private']; latest = true;
  const snapshot = await held, json = JSON.stringify(snapshot);
  assert.ok(!json.includes('initial-private')); assert.ok(!json.includes('late-private')); assert.ok(!json.includes('custom-private'));
  const cache = JSON.stringify(store.instructionDocuments()); assert.ok(!cache.includes('late-private')); assert.ok(!cache.includes('custom-private'));
  await store.capture([message('secret', 'Value incoming-private')], 'conversation');
  assert.ok(!(await readFile(join(f.directory, 'memory.json'), 'utf8')).includes('incoming-private'));
  const source = await store.source('secret'); assert.ok(source?.text.includes('[geschützt]'));
  secrets = ['core', 'a'];
  assert.deepEqual(store.instructionDocuments().map(row => row.id), ['identity', 'core']);
});

test('short overlapping secrets preserve cache identities, enums, source references, hashes and paging cursors', async t => {
  const f = await fixture(t), store = f.create({ getSecrets: () => ['core', 'a'] }); await store.initialize();
  assert.deepEqual(store.instructionDocuments().map(row => row.id), ['identity', 'core']);
  await store.edit('core', 'A core preference and a value', 1);
  const core = store.instructionDocuments().find(row => row.id === 'core'); assert.equal(core?.version, 2);
  assert.ok(core?.content.includes('[geschützt]')); assert.ok(!core?.content.includes('core'));
  const sourceId = 'artifact-core-a', conversationId = 'conversation-core-a';
  await store.capture([{ ...message(sourceId, 'a core report: ' + 'Report '.repeat(1200)), role: 'assistant' }], conversationId);
  const source = await store.source(sourceId); assert.equal(source?.id, sourceId); assert.equal(source?.role, 'assistant'); assert.equal(source?.conversationId, conversationId);
  const snapshot = await store.snapshot(), day = snapshot.documents.find(row => row.id === 'day:2026-10-05');
  assert.equal(day?.kind, 'day'); assert.deepEqual(day?.sourceIds, [sourceId]); assert.equal(day?.history[0].reason, 'capture');
  const first = await store.readPeriod({ documentId: day!.id, maxBytes: 512 }); assert.ok(first.nextCursor);
  const next = await store.readPeriod({ documentId: day!.id, maxBytes: 512, cursor: first.nextCursor });
  // Coordinates address the fingerprinted worker view, whose text length can
  // differ from the newly redacted main-process display text.
  assert.equal(next.documentId, day!.id); assert.ok(next.offset > first.offset);
  const plans = await store.planSummaries({ closedOnly: false }); assert.equal(plans.find(row => row.documentId === day!.id)?.kind, 'day');
  const input = await store.summaryInput(day!.id); assert.match(input.inputHash, /^[a-f0-9]{64}$/); assert.ok(input.inputHash.includes('a'));
  assert.equal(input.records[0].kind, 'source'); assert.equal(input.records[0].role, 'assistant'); assert.deepEqual(input.sourceIds, [sourceId]);
  const applied = await store.applySummary(input, { content: 'A core summary', model: 'fake/model', citations: [sourceId] });
  assert.equal(applied.documents.find(row => row.id === day!.id)?.summary?.inputHash, input.inputHash);
  assert.equal(applied.documents.find(row => row.id === day!.id)?.summary?.method, 'ai');
  const proposal = await store.propose({ documentId: 'core', baseVersion: 2, content: 'Changed preference', reason: 'Requested change' });
  assert.equal(proposal.documentId, 'core'); assert.equal(proposal.status, 'pending');
  await store.decide(proposal.id, 'approve'); assert.equal(store.instructionDocuments().find(row => row.id === 'core')?.version, 3);
  await store.flush();
});

test('workers inherit neither ambient secret environment nor main preload arguments', async t => {
  const key = 'OPENHIATUS_MEMORY_WORKER_SYNTHETIC_SECRET', previous = process.env[key]; process.env[key] = 'synthetic-only';
  try {
    const f = await fixture(t, () => `if(process.env.${key}!==undefined||process.execArgv.length)throw new Error('Environment leaked');${fakeWorker(`if(message.type==='call')parentPort.postMessage({version:1,type:'result',id:message.id,method:message.method,result:undefined,instructions:${JSON.stringify(instructions)}});`)}`);
    const store = f.create(); await store.capture([], 'conversation'); await store.dispose();
  } finally { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
});

test('crash rejects pending operations and permanently blocks that instance without replay', async t => {
  const f = await fixture(t, () => fakeWorker(`if(message.type==='call'){
    require('node:fs').appendFileSync(require('node:path').join(require('node:worker_threads').workerData.directory,'attempts.txt'),'attempt\\n');process.exit(37);
  }`));
  const store = f.create(), first = store.capture([], 'conversation'), second = store.rebuild();
  await assert.rejects(first, MemoryWorkerUnavailableError); await assert.rejects(second, MemoryWorkerUnavailableError);
  await assert.rejects(store.snapshot(), MemoryWorkerUnavailableError); await assert.rejects(store.flush()); await assert.rejects(store.dispose());
  assert.equal(await readFile(join(f.directory, 'attempts.txt'), 'utf8'), 'attempt\n');
});

test('malformed success, wrong method and out-of-order ACK never confirm an operation or update its cache', async t => {
  for (const response of [
    `{version:1,type:'result',id:message.id,method:'snapshot',result:{}}`,
    `{version:1,type:'result',id:message.id,method:'capture',result:undefined,instructions:${JSON.stringify(instructions)}}`,
    `{version:1,type:'result',id:message.id+1,method:'snapshot',result:{}}`,
  ]) {
    const f = await fixture(t, () => fakeWorker(`if(message.type==='call')parentPort.postMessage(${response});`));
    const store = f.create(); await store.initialize(); const before = store.instructionDocuments();
    await assert.rejects(store.snapshot(), /Gedächtnisbestätigung/); await assert.rejects(store.flush());
    assert.deepEqual(store.instructionDocuments(), before);
  }
});

test('pending requests are bounded and an unconfirmed operation timeout never triggers replay', async t => {
  const f = await fixture(t, () => fakeWorker('')), store = f.create({ timeoutMs: 200 }); await store.initialize();
  const pending = Array.from({ length: 64 }, () => store.snapshot());
  await assert.rejects(store.snapshot(), /Zu viele/);
  const results = await Promise.allSettled(pending); assert.ok(results.every(result => result.status === 'rejected'));
  await assert.rejects(store.capture([], 'conversation'), /unbestätigt/); await assert.rejects(store.dispose(), /unbestätigt/);
});

test('dispose waits real writes and an explicit close retry can confirm a later terminated thread without replay', async t => {
  const terminate = Worker.prototype.terminate, terminations: Promise<number>[] = [];
  t.mock.method(Worker.prototype, 'terminate', function (this: Worker) { const termination = terminate.call(this); terminations.push(termination); return termination; });
  const f = await fixture(t, entry => `const {parentPort}=require('node:worker_threads'),on=parentPort.on;
    parentPort.on=function(event,handler){return on.call(this,event,event==='message'?message=>{if(message.type!=='close')handler(message);}:handler);};require(${JSON.stringify(entry)});`);
  const store = f.create({ shutdownTimeoutMs: 100 }), write = store.edit('core', 'Final ACKed core', 1), close = store.dispose();
  await assert.rejects(store.capture([], 'too-late'), /beendet/); await write;
  const persisted = await readFile(join(f.directory, 'memory.json'), 'utf8');
  await assert.rejects(close, /Ende des Gedächtnisspeichers wurde nicht bestätigt/);
  assert.equal(terminations.length, 1); await terminations[0];
  const retry = store.dispose(); assert.notEqual(retry, close); await retry;
  assert.equal(store.dispose(), retry); assert.equal(await readFile(join(f.directory, 'memory.json'), 'utf8'), persisted);
});

test('unknown request decoding rejects invalid methods, sparse arguments and write directories before side effects', async t => {
  for (const input of [null, { version: 1, directory: 'relative' }, { version: 2, directory: resolve('.') }]) assert.throws(() => decodeMemoryBootstrap(input));
  const base = { version: 1, type: 'call', id: 1, secrets: [] };
  for (const input of [
    { ...base, method: 'remove', args: [] }, { ...base, method: 'capture', args: [new Array(1), 'conversation'] },
    { ...base, method: 'capture', args: [[], 'conversation'], directory: resolve('.') },
    { ...base, method: 'edit', args: ['core', 'x', 0] }, { ...base, method: 'retrieve', args: ['q', { maxBytes: 511 }] },
    { ...base, method: 'planSummaries', args: [{ now: new Date('invalid') }] }, { ...base, method: 'snapshot', args: [], secrets: ['x'.repeat(65537)] },
  ]) assert.throws(() => decodeMemoryRequest(input), MemoryWorkerProtocolError);
  assert.throws(() => decodeMemoryResult('snapshot', {}));
  assert.throws(() => decodeMemoryResponse({ version: 1, type: 'result', id: 1, method: 'edit', result: {} }), MemoryWorkerProtocolError);
  assert.throws(() => decodeMemoryResponse({ version: 1, type: 'result', id: 1, method: 'capture', result: undefined, instructions: undefined }), MemoryWorkerProtocolError);
  const f = await fixture(t), worker = new Worker(f.entry, { workerData: { version: 1, directory: f.directory }, env: {}, execArgv: [] });
  const ready = new Promise<unknown>((done, reject) => { worker.once('message', done); worker.once('error', reject); });
  worker.postMessage({ version: 1, type: 'initialize', secrets: [] }); assert.equal(decodeMemoryResponse(await ready).type, 'ready');
  const before = await readFile(join(f.directory, 'memory.json'), 'utf8');
  const rejected = new Promise<unknown>(done => worker.once('message', done)), exited = new Promise<number>(done => worker.once('exit', done));
  worker.postMessage({ ...base, method: 'edit', args: ['core', 'Must not persist', 1], directory: resolve('.') });
  assert.equal(decodeMemoryResponse(await rejected).type, 'fatal'); await exited;
  assert.equal(await readFile(join(f.directory, 'memory.json'), 'utf8'), before);
});
