import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppController } from '../src/main/controller';
import { MemoryStore } from '../src/main/memory';
import { defaultState } from '../src/main/storage';
import { AGENT_INSTRUCTIONS, parseMemoryReply } from '../src/main/instructions';
import type { Message } from '../src/shared/contracts';

const at = '2026-10-05T14:00:00.000Z';
function fixture(t: any, initial: Message[] = [], seed?: (memory: MemoryStore) => void) {
  const directory = mkdtempSync(join(tmpdir(), 'openhiatus-memory-controller-'));
  let saved = defaultState(); saved.preferences.fullAccessAcknowledged = true; saved.messages = structuredClone(initial);
  let app!: AppController;
  const memory = new MemoryStore(directory, { sanitize: value => app ? app.sanitizeMemory(value) : value });
  seed?.(memory);
  const runs: Array<{ text: string; threadId?: string; identity: string }> = [];
  let stops = 0;
  let stopImplementation = async () => {};
  let stateWriteHook = () => {};
  app = new AppController({
    store: { load: () => structuredClone(saved), save: value => { stateWriteHook(); saved = structuredClone(value); } },
    memory, credentials: { get: () => 'sk-stored-synthetic-key', set() {}, remove() {} },
    speech: { async transcribe() { return ''; }, async synthesize() { return { base64: '', mimeType: '' }; }, async test() { return { base64: '', mimeType: '' }; } },
    agent: { async start() {}, async run(text, _model, threadId) { runs.push({ text, threadId, identity: app.identityInstructions() }); },
      async stop() { stops++; await stopImplementation(); }, async dispose() {}, },
    workspace: 'C:\\demo', publish() {},
  });
  app.handle({ type: 'connection', status: 'ready' });
  app.handle({ type: 'models', models: [{ id: 'test-model', label: 'Test' }] });
  t.after(async () => { await app.dispose(); rmSync(directory, { recursive: true, force: true, maxRetries: 3 }); });
  const complete = async (text = 'Erledigt.') => { app.handle({ type: 'completed', status: 'completed', text }); await new Promise(resolve => setImmediate(resolve)); };
  const core = async () => (await app.memorySnapshot()).documents.find(document => document.id === 'core')!;
  return { app, memory, runs, complete, core, saved: () => saved, stops: () => stops,
    setStop: (fn: () => Promise<void>) => { stopImplementation = fn; },
    setStateWriteHook: (fn: () => void) => { stateWriteHook = fn; },
  };
}
function proposal(baseVersion: number, content = 'Bitte antworte auf Deutsch.') {
  return `Bitte prüfe den Vorschlag.\n\n\`\`\`openhiatus-memory-proposal\n${JSON.stringify({ documentId: 'core', baseVersion, content, reason: 'Der Nutzer hat diese Vorliebe genannt.' })}\n\`\`\``;
}

test('saved conversations import once and remain retrievable after a new conversation', async t => {
  const f = fixture(t, [{ id: 'old-user', role: 'user', at, text: 'Mein Projekt Morgenrot verwendet blaue Karten.' }]);
  await f.app.initialize();
  assert.equal(f.memory.snapshot().sourceCount, 1);
  await f.app.newConversation();
  assert.deepEqual(f.app.snapshot().messages, []);
  assert.equal(f.memory.source('old-user')?.text, 'Mein Projekt Morgenrot verwendet blaue Karten.');
  await f.app.send('Welche Farbe haben die Karten bei Morgenrot?', 'new-question');
  assert.match(f.runs[0].text, /blaue Karten/);
  assert.match(f.runs[0].text, /old-user/);
  const retrieval = (await f.app.memorySnapshot()).lastRetrieval!;
  assert.ok(f.runs[0].text.includes(retrieval.text));
  assert.ok(retrieval.sourceIds.includes('old-user'));
  assert.ok(f.app.snapshot().activity.some(event => event.title === 'Gedächtnis für diesen Auftrag gelesen' && event.detail?.includes('old-user')));
  await f.complete();
  assert.equal(f.memory.snapshot().sourceCount, 3);
  await f.app.rebuildMemory();
  assert.equal(f.memory.snapshot().sourceCount, 3);
});

test('existing imported conversation IDs are reused instead of reassigning their sources', async t => {
  const user = { id: 'external-seed', role: 'user' as const, at, text: 'Merkzeichen Sonnenblume.' };
  const f = fixture(t, [user], memory => memory.capture([user], 'synthetic-m3-demo'));
  await f.app.send('Was ist das Merkzeichen?', 'question'); await f.complete();
  // Legacy import retains original provenance instead of creating a fresh conversation identity.
  assert.equal(f.memory.source(user.id)?.conversationId, 'synthetic-m3-demo');
  assert.ok(!f.app.snapshot().activity.some(row => row.title.includes('konnte nicht ins Gedächtnis')));
});

test('identity edits during a task take effect on the next turn without stopping current work', async t => {
  const f = fixture(t);
  await f.app.send('Erstelle eine Notiz.', 'work');
  f.app.handle({ type: 'started', threadId: 'old-thread', turnId: 'old-turn' });
  const originalInstructions = f.runs[0].identity;
  await f.app.editMemory('core', 'Bitte nenne mich Testnutzer und verwende kurze Sätze.', (await f.core()).version);
  assert.equal(f.app.snapshot().task.status, 'running');
  assert.equal(f.app.snapshot().task.threadId, 'old-thread');
  assert.equal(f.stops(), 0); assert.equal(f.runs[0].identity, originalInstructions);
  await f.complete();
  assert.equal(f.app.snapshot().task.threadId, undefined);
  await f.app.send('Nächste Aufgabe.', 'next');
  assert.equal(f.runs[1].threadId, undefined);
  assert.match(f.runs[1].identity, /Testnutzer/);
  assert.match(f.runs[1].identity, /keine Aufhebung fester Schutzregeln/);
  const docs = (await f.app.memorySnapshot()).runtimeInstructions!;
  assert.equal(docs.find(doc => doc.id === 'runtime-agent')?.content, AGENT_INSTRUCTIONS);
});

test('model proposals only become pending and link actual user and cleaned answer sources', async t => {
  const f = fixture(t); const version = (await f.core()).version; const original = (await f.core()).content;
  await f.app.send('Merke bitte dauerhaft: kurze Antworten.', 'user-proposal');
  await f.complete(proposal(version, 'Bitte antworte kurz.'));
  const snapshot = await f.app.memorySnapshot(); const pending = snapshot.proposals[0];
  assert.equal(pending.status, 'pending'); assert.equal((await f.core()).content, original); assert.equal((await f.core()).version, version);
  assert.ok(pending.sourceIds.includes('user-proposal'));
  const answer = f.app.snapshot().messages.at(-1)!;
  assert.ok(pending.sourceIds.includes(answer.id));
  assert.equal(answer.text, 'Bitte prüfe den Vorschlag.');
  assert.equal(f.memory.source(answer.id)?.text, answer.text);
  assert.ok(!JSON.stringify(f.app.snapshot()).includes('openhiatus-memory-proposal'));
  await f.app.decideMemoryProposal(pending.id, 'approve');
  assert.equal((await f.core()).content, 'Bitte antworte kurz.'); assert.equal((await f.core()).version, version + 1);
  assert.equal((await f.app.memorySnapshot()).proposals[0].status, 'approved');
});

test('stale or invented versions and malformed approval fields cannot change protected memory', async t => {
  const f = fixture(t); const version = (await f.core()).version;
  await f.app.send('Schlage eine Kernänderung vor.', 'first');
  await f.app.editMemory('core', 'Manuelle Änderung gewinnt.', version);
  await f.complete(proposal(version));
  assert.equal((await f.app.memorySnapshot()).proposals.length, 0);
  assert.equal((await f.core()).content, 'Manuelle Änderung gewinnt.');
  assert.ok(f.app.snapshot().activity.some(event => event.title.includes('nicht übernommen') && event.detail?.includes('veraltet')));
  await f.app.send('Noch ein Vorschlag.', 'second');
  await f.complete(proposal((await f.core()).version + 1));
  assert.equal((await f.app.memorySnapshot()).proposals.length, 0);
  await f.app.send('Dritter Vorschlag.', 'third');
  await f.complete('```openhiatus-memory-proposal\n{"documentId":"core","baseVersion":2,"content":"ungefragt","reason":"Test","status":"approved"}\n```');
  assert.equal((await f.app.memorySnapshot()).proposals.length, 0);
  assert.equal((await f.core()).content, 'Manuelle Änderung gewinnt.');
  assert.match(f.app.snapshot().messages.at(-1)!.text, /ungültiger/);
});

test('Stop works through archive failures, suppresses late proposals and failed archive blocks clearing history', async t => {
  const f = fixture(t);
  await f.app.send('Eine Aufgabe.', 'stop-me');
  const original = f.memory.capture;
  f.memory.capture = () => { throw new Error('synthetic disk full'); };
  await f.app.stop();
  assert.equal(f.stops(), 1); assert.equal(f.app.snapshot().task.status, 'interrupted');
  f.app.handle({ type: 'completed', status: 'completed', text: proposal((await f.core()).version) });
  assert.equal((await f.app.memorySnapshot()).proposals.length, 0);
  const history = f.app.snapshot().messages;
  await assert.rejects(f.app.newConversation(), /Verlauf bleibt erhalten/);
  assert.deepEqual(f.app.snapshot().messages, history);
  f.memory.capture = original;
  await f.app.newConversation();
  assert.equal(f.memory.source('stop-me')?.text, 'Eine Aufgabe.');
});

test('Stop initiates the agent before archive writes and defers every archive/state write until termination is confirmed', async t => {
  const f = fixture(t); await f.app.send('Laufende Arbeit.', 'critical-stop');
  const trace: string[] = []; let confirmed = false; let resolveStop!: () => void;
  f.setStop(() => { trace.push('CODEX-STOP'); return new Promise<void>(resolve => { resolveStop = resolve; }); });
  const originalCapture = f.memory.capture;
  f.memory.capture = () => { trace.push('ARCHIVE'); assert.ok(confirmed); throw new Error('synthetic blocked archive'); };
  f.setStateWriteHook(() => { trace.push('STATE-WRITE'); assert.ok(confirmed); throw new Error('synthetic blocked state'); });
  const stopping = f.app.stop();
  assert.deepEqual(trace, ['CODEX-STOP']);
  assert.equal(f.app.snapshot().task.status, 'stopping');
  // The close callback above is synchronous, and pending state changes may continue arriving.
  f.app.handle({ type: 'activity', kind: 'system', title: 'Späte Statusmeldung' });
  await assert.rejects(f.app.memorySnapshot(), /Stopp/);
  await assert.rejects(f.app.searchMemory('Garten'), /Stopp/);
  await assert.rejects(f.app.editMemory('core', 'Verspätete Änderung', 1), /Stopp/);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(trace, ['CODEX-STOP']);
  confirmed = true; trace.push('CODEX-CONFIRMED'); resolveStop(); await stopping;
  assert.equal(f.app.snapshot().task.status, 'interrupted');
  assert.ok(trace.indexOf('ARCHIVE') > trace.indexOf('CODEX-CONFIRMED'));
  assert.ok(trace.indexOf('STATE-WRITE') > trace.indexOf('CODEX-CONFIRMED'));
  f.memory.capture = originalCapture; f.setStateWriteHook(() => {}); f.setStop(async () => {});
});

test('an unconfirmed Stop retains deferred writes until a successful retry', async t => {
  const f = fixture(t); await f.app.send('Auftrag.', 'retry-stop');
  const trace: string[] = [];
  f.setStop(async () => { throw new Error('synthetic unconfirmed termination'); });
  f.setStateWriteHook(() => { trace.push('state'); });
  const original = f.memory.capture;
  f.memory.capture = (...args) => { trace.push('archive'); original.apply(f.memory, args); };
  await assert.rejects(f.app.stop(), /unconfirmed/);
  assert.equal(f.app.snapshot().task.status, 'stopping'); assert.equal(trace.length, 0);
  f.setStop(async () => {}); await f.app.stop();
  assert.equal(f.app.snapshot().task.status, 'interrupted');
  assert.ok(trace.includes('state')); assert.ok(trace.includes('archive'));
});

test('runtime speech secrets are scrubbed from manual edits, captured messages and proposals', async t => {
  const f = fixture(t); const secret = 'bm9uc3RhbmRhcmQtcnVudGltZS10ZXN0LWNyZWRlbnRpYWw=';
  await f.app.saveSpeechKey(secret);
  await f.app.editMemory('core', `Keine Ausgabe von ${secret}`, (await f.core()).version);
  await f.app.send(`Merke ${secret}`, 'secret-user');
  await f.complete(proposal((await f.core()).version, `Mein geheimer Marker: ${secret}`));
  assert.ok(!JSON.stringify(await f.app.memorySnapshot()).includes(secret));
  assert.ok(!JSON.stringify(f.memory.source('secret-user')).includes(secret));
});

test('proposal parser keeps ordinary fenced answers and rejects nonfinal or incomplete protocol output', () => {
  assert.equal(parseMemoryReply('```json\n{"hello":"world"}\n```').text, '```json\n{"hello":"world"}\n```');
  const nonfinal = parseMemoryReply(`${proposal(1)}\nDas war nur ein Beispiel.`);
  assert.equal(nonfinal.proposals.length, 0); assert.equal(nonfinal.errors.length, 1);
  const incomplete = parseMemoryReply('Antwort.\n```openhiatus-memory-proposal\n{"documentId":"core"');
  assert.equal(incomplete.proposals.length, 0); assert.equal(incomplete.errors.length, 1);
  assert.equal(incomplete.text, 'Antwort.');
});
