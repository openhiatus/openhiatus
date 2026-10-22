import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppController } from '../src/main/controller';
import { MemoryStore } from '../src/main/memory';
import { defaultState } from '../src/main/storage';
import type { Message } from '../src/shared/contracts';

type Backend = NonNullable<ConstructorParameters<typeof AppController>[0]['memory']>;
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
async function until(check: () => boolean) { for (let count = 0; count < 100 && !check(); count++) await tick(); assert.ok(check(), 'expected memory operation was not submitted'); }
function delayedBackend(store: MemoryStore) {
  const calls: Array<{ name: string; args: unknown[] }> = [], pending = new Set<Promise<unknown>>();
  let documents = store.instructionDocuments();
  const gates = new Map<string, { promise: Promise<void>; release(): void }>(), releases: Array<() => void> = [];
  const invoke = <T>(name: string, args: unknown[], work: () => T): Promise<T> => {
    const gate = gates.get(name); gates.delete(name); calls.push({ name, args: structuredClone(args) });
    const operation = (async () => {
      await gate?.promise;
      const value = work();
      if (['initialize', 'edit', 'decide', 'rebuild'].includes(name)) documents = store.instructionDocuments();
      return value;
    })();
    pending.add(operation); void operation.finally(() => pending.delete(operation)).catch(() => undefined); return operation;
  };
  const backend: Backend = {
    initialize: () => invoke('initialize', [], () => undefined),
    async flush() { await Promise.allSettled([...pending]); },
    instructionDocuments: () => structuredClone(documents),
    snapshot: () => invoke('snapshot', [], () => store.snapshot()),
    capture: (messages, conversationId) => invoke('capture', [messages, conversationId], () => store.capture(messages, conversationId)),
    retrieve: (query, options) => invoke('retrieve', [query, options], () => store.retrieve(query, options)),
    source: id => invoke('source', [id], () => store.source(id)),
    search: query => invoke('search', [query], () => store.search(query)),
    readPeriod: request => invoke('readPeriod', [request], () => store.readPeriod(request)),
    edit: (id, content, version) => invoke('edit', [id, content, version], () => store.edit(id, content, version)),
    decide: (id, decision) => invoke('decide', [id, decision], () => store.decide(id, decision)),
    propose: input => invoke('propose', [input], () => store.propose(input)),
    rebuild: () => invoke('rebuild', [], () => store.rebuild()),
  };
  return { backend, calls, pause(name: string) {
    let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; });
    const gate = { promise, release }; gates.set(name, gate); releases.push(release); return gate;
  }, releaseAll() { releases.forEach(release => release()); } };
}
function fixture(t: any, initial: Message[] = []) {
  const directory = mkdtempSync(join(tmpdir(), 'openhiatus-async-memory-'));
  let app!: AppController;
  const store = new MemoryStore(directory, { sanitize: text => app ? app.sanitizeMemory(text) : text });
  if (initial.length) store.capture(initial, 'imported-original-conversation');
  const memory = delayedBackend(store);
  let saved = defaultState(); saved.messages = structuredClone(initial); saved.preferences.fullAccessAcknowledged = true;
  let disposals = 0, stops = 0;
  const runs: Array<{ text: string; identity: string; threadId?: string }> = [];
  app = new AppController({
    store: { load: () => structuredClone(saved), save: value => { saved = structuredClone(value); } }, memory: memory.backend,
    credentials: { get() { return undefined; }, set() {}, remove() {} },
    speech: { async transcribe() { return ''; }, async synthesize() { return { base64: '', mimeType: '' }; }, async test() { return { base64: '', mimeType: '' }; } },
    agent: { async start() {}, async run(text, _model, threadId) { runs.push({ text, identity: app.identityInstructions(), threadId }); app.handle({ type: 'started', threadId: threadId ?? 'thread', turnId: `turn-${runs.length}` }); },
      async stop() { stops++; }, async dispose() { disposals++; } }, workspace: directory, publish() {},
  });
  app.handle({ type: 'connection', status: 'ready' }); app.handle({ type: 'models', models: [{ id: 'test/model', label: 'Test' }] });
  const flush = memory.backend.flush;
  t.after(async () => { memory.releaseAll(); memory.backend.flush = flush; await app.dispose().catch(() => undefined); rmSync(directory, { recursive: true, force: true }); });
  return { app, memory, store, runs, counts: () => ({ disposals, stops }), complete(text = 'Antwort.') { app.handle({ type: 'completed', status: 'completed', text }); } };
}
const initial: Message[] = [{ id: 'imported-user', role: 'user', text: 'Importierter alter Verlauf.', at: '2026-10-04T12:00:00Z' }];

test('strict captures retain immutable FIFO batches and each conversation keeps its own source identity', async t => {
  const f = fixture(t, initial); await f.app.initialize();
  const gate = f.memory.pause('capture'), previous = f.memory.calls.filter(call => call.name === 'capture').length;
  const reset = f.app.newConversation(); await until(() => f.memory.calls.filter(call => call.name === 'capture').length > previous);
  assert.equal(f.app.snapshot().messages[0].id, 'imported-user', 'reset waits for the actual archive ACK');
  gate.release(); await reset; await f.app.send('Neue Frage', 'new-user');
  const batches = f.memory.calls.filter(call => call.name === 'capture');
  assert.deepEqual((batches[previous].args[0] as Message[]).map(message => message.id), ['imported-user']);
  assert.equal(batches[previous].args[1], 'imported-original-conversation');
  const fresh = batches.at(-1)!;
  assert.deepEqual((fresh.args[0] as Message[]).map(message => message.id), ['new-user']); assert.equal(fresh.args[1], 'conversation-new-user');
  assert.equal(f.store.source('imported-user')?.conversationId, 'imported-original-conversation');
});

test('Stop during strict capture prevents a late conversation reset without waiting for memory', async t => {
  const f = fixture(t, initial); await f.app.initialize(); const gate = f.memory.pause('capture');
  const previous = f.memory.calls.filter(call => call.name === 'capture').length, reset = f.app.newConversation();
  await until(() => f.memory.calls.filter(call => call.name === 'capture').length > previous);
  const rejected = assert.rejects(reset, /abgebrochen/); await f.app.stop(); assert.equal(f.counts().stops, 1);
  gate.release(); await rejected; assert.equal(f.app.snapshot().messages[0].id, 'imported-user');
});

test('a retrieval after a mid-admission edit excludes newer protected instructions and retains frozen identity', async t => {
  const f = fixture(t); await f.app.initialize();
  let version = f.store.instructionDocuments().find(document => document.id === 'core')!.version;
  await f.app.editMemory('core', 'Vorliebe Altmarker.', version); version++;
  const gate = f.memory.pause('retrieve'), sending = f.app.send('Prüfe den Kontext.', 'request');
  await until(() => f.memory.calls.some(call => call.name === 'retrieve'));
  await f.app.editMemory('core', 'Vorliebe Neumarker.', version);
  gate.release(); await sending;
  assert.match(f.runs[0].identity, /Altmarker/); assert.ok(!f.runs[0].identity.includes('Neumarker'));
  assert.ok(!f.runs[0].text.includes('Neumarker'));
  assert.equal((f.memory.calls.find(call => call.name === 'retrieve')!.args[1] as { includeInstructions?: boolean }).includeInstructions, false);
  f.complete(); await f.app.send('Nächste Frage.', 'next'); assert.match(f.runs[1].identity, /Neumarker/); assert.equal(f.runs[1].threadId, undefined);
});

test('a pre-decision snapshot finishing after a completed Stop cannot submit a new decision', async t => {
  const f = fixture(t, initial); await f.app.initialize();
  const version = f.store.instructionDocuments().find(document => document.id === 'core')!.version;
  const proposal = f.store.propose({ documentId: 'core', baseVersion: version, content: 'Gewünschte Vorliebe.', reason: 'Gewünscht.', sourceIds: ['imported-user'] });
  const gate = f.memory.pause('snapshot'), decision = f.app.decideMemoryProposal(proposal.id, 'approve');
  await until(() => f.memory.calls.some(call => call.name === 'snapshot')); const rejected = assert.rejects(decision, /abgebrochen/);
  await f.app.stop(); gate.release(); await rejected;
  assert.equal(f.memory.calls.filter(call => call.name === 'decide').length, 0); assert.equal(f.store.snapshot().proposals[0].status, 'pending');
});

test('an explicitly submitted edit survives Stop and updates only confirmed instructions at ACK', async t => {
  const f = fixture(t); await f.app.initialize();
  const version = f.store.instructionDocuments().find(document => document.id === 'core')!.version;
  const gate = f.memory.pause('edit'), editing = f.app.editMemory('core', 'Bestätigter Marker.', version);
  await until(() => f.memory.calls.some(call => call.name === 'edit')); assert.ok(!f.app.identityInstructions().includes('Bestätigter Marker'));
  await f.app.stop(); const task = f.app.snapshot().task; gate.release(); await editing;
  assert.match(f.app.identityInstructions(), /Bestätigter Marker/); assert.deepEqual(f.app.snapshot().task, task);
});

test('shutdown confirms process disposal before draining capture and keeps admissions frozen after a flush failure', async t => {
  const f = fixture(t); await f.app.initialize(); await f.app.send('Frage.', 'source');
  const previous = f.memory.calls.filter(call => call.name === 'capture').length, gate = f.memory.pause('capture'); f.complete();
  await until(() => f.memory.calls.filter(call => call.name === 'capture').length > previous);
  let settled = false; f.memory.backend.flush = async () => { throw new Error('Memoryflush fehlgeschlagen'); };
  const disposal = f.app.dispose(); void disposal.then(() => { settled = true; }, () => { settled = true; });
  const failed = assert.rejects(disposal, /Memoryflush/); await tick(); assert.equal(f.counts().disposals, 1); assert.equal(settled, false);
  gate.release(); await failed; await assert.rejects(f.app.send('Zu spät.', 'late'), /beendet/);
});

test('worker redaction input retains removed secrets and cannot be mutated by its caller', async t => {
  const f = fixture(t); await f.app.initialize(); const secret = 'synthetic-removed-runtime-credential';
  await f.app.saveSpeechKey(secret); await f.app.removeSpeechKey();
  const secrets = f.app.redactionSecrets(); assert.ok(secrets.includes(secret)); secrets.length = 0; assert.ok(f.app.redactionSecrets().includes(secret));
  const version = f.store.instructionDocuments().find(document => document.id === 'core')!.version;
  await f.app.editMemory('core', `Keine Ausgabe von ${secret}`, version); await f.app.send(`Merke ${secret}`, 'secret-user');
  f.complete(`Antwort mit ${secret}`); await f.app.newConversation();
  assert.ok(!JSON.stringify(f.store.snapshot()).includes(secret)); assert.ok(!JSON.stringify(f.store.source('secret-user')).includes(secret));
});
