import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectTaskCoordinator, type DirectTaskPorts, type DirectTaskState } from '../src/main/modules/direct-task';
import type { CoreProposalInput } from '../src/shared/memory';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture(initial: DirectTaskState = { messages: [], task: { id: '', status: 'idle' } }) {
  let projection = structuredClone(initial), saved = structuredClone(initial), failSave = false, identity = 'Alte Identität', blocked = false, reportBusy = false;
  const config = { ready: true, model: 'frozen-model' }, core = { id: 'core', version: 1, content: 'Alte Vorliebe.' };
  const runs: Array<{ text: string; model: string; threadId?: string }> = [], proposals: CoreProposalInput[] = [], frames: string[] = [], activities: string[] = [], archived = new Set<string>();
  let stop = async () => {}, dispose = async () => {}, prepare = async () => { reportBusy = false; };
  let direct!: DirectTaskCoordinator;
  const ports: DirectTaskPorts = {
    agent: { async start() {}, async run(text, model, threadId) {
      assert.equal(saved.task.status, 'running', 'external work follows durable intent');
      runs.push({ text, model, threadId }); direct.handle({ type: 'started', threadId: threadId ?? 'thread-one', turnId: `turn-${runs.length}` });
    }, stop: () => stop(), dispose: () => dispose() },
    access: { assertAdmission() {}, blocked: () => blocked }, configuration: () => config,
    reports: { busy: () => reportBusy, prepareForUserWork: () => prepare() }, context: { identity: () => identity, started() {} },
    memory: {
      documents: () => [structuredClone(core)], retrieve: () => 'Belegter Kontext.',
      readPeriod: () => ({ found: true, documentId: 'day:2026-10-01', text: 'Vollständige Archivdaten.', sourceIds: ['historical'], sourceCount: 1, offset: 0, totalBytes: 26, nextCursor: 'next' }),
      propose(input) {
        assert.ok(input.sourceIds?.every(id => archived.has(id))); proposals.push(input);
        return { ...input, sourceIds: input.sourceIds ?? [], id: 'proposal', status: 'pending', createdAt: 'now' };
      },
    },
    parseReply: text => ({ text, proposals: [], errors: [] }),
    journal: { publish: value => { projection = value; }, persist() { if (failSave) throw new Error('Datenträger voll'); saved = structuredClone(projection); },
      changed(save) { if (save !== false && !failSave) saved = structuredClone(projection); }, capture() { for (const message of direct.archivableMessages()) if (message.text) archived.add(message.id); } },
    effects: { clean: text => text.replaceAll('synthetic-secret', '[entfernt]'), activity: (_kind, title) => { activities.push(title); },
      reportError: error => error instanceof Error ? error.message : String(error), frame: frame => { frames.push(frame.frameId); }, idle() {} },
  };
  direct = new DirectTaskCoordinator(initial, ports);
  return { direct, ports, config, core, runs, proposals, frames, activities, archived, projection: () => projection,
    failSave: (value: boolean) => { failSave = value; }, identity: (value: string) => { identity = value; }, stop: (value: typeof stop) => { stop = value; },
    dispose: (value: typeof dispose) => { dispose = value; }, reports: (value: boolean, valuePrepare?: typeof prepare) => { reportBusy = value; if (valuePrepare) prepare = valuePrepare; } };
}
const read = '```openhiatus-memory-read\n{"documentId":"day:2026-10-01"}\n```';

test('direct admission owns its transcript, rolls back failed intent and freezes the initial execution model', async () => {
  const f = fixture(); f.failSave(true); await assert.rejects(f.direct.send('Auftrag', 'same'), /Datenträger/);
  assert.equal(f.runs.length, 0); assert.equal(f.direct.snapshot().messages.length, 0); assert.equal(f.projection().task.status, 'idle');
  f.failSave(false); f.ports.memory!.retrieve = () => { f.config.model = 'changed-during-context'; return 'Belegter Kontext.'; };
  await f.direct.send('Auftrag', 'same'); await f.direct.send('Auftrag', 'same');
  assert.equal(f.runs.length, 1); assert.equal(f.runs[0].model, 'frozen-model');
  f.projection().messages[0].text = 'Mutierte Projektion'; assert.equal(f.direct.snapshot().messages[0].text, 'Auftrag');
  await f.direct.stop();
});

test('archive continuation retains the original, model, identity and cumulative usage while a deferred thread reset applies next turn', async () => {
  const f = fixture(); await f.direct.send('Vollständiger Originalauftrag', 'first');
  f.direct.handle({ type: 'usage', usage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 } });
  f.config.model = 'next-model'; f.identity('Neue Identität'); f.direct.invalidateThread();
  assert.equal(f.direct.currentIdentity(), 'Alte Identität');
  f.direct.handle({ type: 'completed', status: 'completed', text: read }); await tick();
  assert.equal(f.runs[1].model, 'frozen-model'); assert.equal(f.runs[1].threadId, 'thread-one');
  assert.ok(f.runs[1].text.includes('Vollständiger Originalauftrag')); assert.ok(f.runs[1].text.includes('Vollständige Archivdaten.'));
  f.direct.handle({ type: 'usage', usage: { inputTokens: 4, outputTokens: 3, cacheReadTokens: 0, cacheWriteTokens: 0 } });
  assert.equal(f.direct.snapshot().usage?.inputTokens, 14);
  f.direct.handle({ type: 'completed', status: 'completed', text: 'Belegte Antwort.' });
  assert.equal(f.direct.snapshot().task.threadId, undefined); assert.ok(!JSON.stringify(f.direct.snapshot().messages).includes('openhiatus-memory-read'));
  await f.direct.send('Nächster Auftrag', 'next'); assert.equal(f.runs[2].threadId, undefined); assert.equal(f.runs[2].model, 'next-model'); assert.equal(f.direct.currentIdentity(), 'Neue Identität');
  await f.direct.stop();
});

test('stopping invalidates queued continuation and ignores racing results until a failed stop is successfully retried', async () => {
  const f = fixture(); await f.direct.send('Archiv lesen', 'first');
  f.direct.handle({ type: 'completed', status: 'completed', text: read });
  f.stop(async () => { throw new Error('Ende unbestätigt'); }); await assert.rejects(f.direct.stop(), /unbestätigt/); await tick();
  assert.equal(f.runs.length, 1); assert.equal(f.direct.snapshot().task.status, 'stopping');
  f.direct.handle({ type: 'completed', status: 'completed', text: 'Zu spät synthetic-secret' });
  f.direct.handle({ type: 'computer-frame', frame: { frameId: 'late', dataUrl: 'image', width: 1, height: 1, at: 'now' } });
  await assert.rejects(f.direct.send('Neue Arbeit', 'blocked'), /bereits/); assert.equal(f.frames.length, 0);
  f.stop(async () => {}); await f.direct.stop(); assert.equal(f.direct.snapshot().task.status, 'interrupted');
  assert.ok(!JSON.stringify(f.direct.snapshot()).includes('synthetic-secret'));
});

test('memory proposals use only offered versions and cite archived user and complete-answer records', async () => {
  const f = fixture(); f.ports.parseReply = text => JSON.parse(text); await f.direct.send('Vorliebe ändern', 'user');
  f.core.version = 2;
  f.direct.handle({ type: 'completed', status: 'completed', text: JSON.stringify({ text: 'Vorschlag zur Prüfung.', proposals: [{ documentId: 'core', baseVersion: 1, content: 'Vorliebe.', reason: 'Gewünscht.' }], errors: [] }) });
  await f.direct.settleMemory();
  const answer = f.direct.snapshot().messages[1]; assert.deepEqual(f.proposals[0].sourceIds, ['user', answer.id]); assert.equal(f.proposals[0].baseVersion, 1);
  await f.direct.send('Nächste Änderung', 'next');
  f.direct.handle({ type: 'completed', status: 'completed', text: JSON.stringify({ text: '', proposals: [{ documentId: 'core', baseVersion: 99, content: 'Vorliebe.', reason: 'Gewünscht.' }], errors: [] }) });
  await f.direct.settleMemory();
  assert.equal(f.proposals.length, 1); assert.ok(f.activities.includes('Gedächtnisvorschlag wurde nicht übernommen'));
});

test('Stop while reports are being preempted prevents admission and restart does not replay persisted work', async () => {
  const f = fixture(); let release!: () => void; f.reports(true, () => new Promise<void>(resolve => { release = resolve; }));
  const sending = f.direct.send('Noch nicht angenommen', 'pending'); await f.direct.stop(); release();
  await assert.rejects(sending, /Stopp abgebrochen/); assert.equal(f.runs.length, 0); assert.equal(f.direct.snapshot().messages.length, 0);
  const recovered = fixture({ messages: [{ id: 'old', role: 'user', text: 'Alter Auftrag', at: 'now' }], task: { id: 'old', status: 'running', threadId: 'old-thread' } });
  await tick(); assert.equal(recovered.direct.snapshot().task.status, 'interrupted'); assert.equal(recovered.runs.length, 0);
});

test('context-only delivery retains owned metrics without copying or republishing the transcript', async () => {
  const f = fixture(); await f.direct.send('Auftrag', 'first');
  const projection = f.projection(), delivered: string[] = [];
  f.ports.journal.publishContext = context => { delivered.push(context.threadId); context.usedTokens = 999; };
  f.direct.handle({ type: 'context', threadId: 'foreign', usedTokens: 1 });
  f.direct.handle({ type: 'context', threadId: 'thread-one', usedTokens: 42, windowTokens: 128000 });
  assert.deepEqual(delivered, ['thread-one']);
  assert.equal(f.projection(), projection, 'only the independent context projection is delivered');
  assert.equal(f.direct.snapshot().context?.usedTokens, 42, 'projection recipients cannot mutate owned context');
  assert.equal(f.direct.snapshot().messages[0].text, 'Auftrag'); await f.direct.stop();
});

test('failed adapter disposal leaves the direct path usable for an explicit retry', async () => {
  const f = fixture(); await f.direct.send('Auftrag', 'first'); f.direct.handle({ type: 'completed', status: 'completed', text: 'Fertig.' });
  f.dispose(async () => { throw new Error('Dispose unbestätigt'); }); await assert.rejects(f.direct.dispose(), /unbestätigt/);
  await f.direct.send('Neuer Auftrag', 'new'); assert.equal(f.runs.length, 2); await f.direct.stop();
  f.direct.reset(); assert.deepEqual(f.direct.snapshot().messages, []); assert.equal(f.direct.snapshot().task.status, 'idle');
});

test('duplicates share a pending durable failure and a corrected admission can be retried', async () => {
  const f = fixture(), persist = f.ports.journal.persist;
  let reject!: (error: Error) => void, repeatedSettled = false;
  f.ports.journal.persist = () => new Promise<void>((_resolve, failed) => { reject = failed; });
  const first = f.direct.send('Auftrag', 'same'); await tick();
  const repeated = f.direct.send('Auftrag', 'same');
  void repeated.then(() => { repeatedSettled = true; }, () => { repeatedSettled = true; });
  await tick(); assert.equal(repeatedSettled, false); assert.equal(f.runs.length, 0);
  const failures = Promise.all([assert.rejects(first, /Schreibfehler/), assert.rejects(repeated, /Schreibfehler/)]);
  reject(new Error('Schreibfehler')); await failures;
  assert.deepEqual(f.direct.snapshot().messages, []); assert.equal(f.projection().task.status, 'idle');
  f.ports.journal.persist = persist; await f.direct.send('Auftrag', 'same'); assert.equal(f.runs.length, 1);
  await f.direct.stop();
});

test('Stop interrupts immediately during intent persistence and the later ACK cannot start a turn', async () => {
  const f = fixture(); let release!: () => void, stops = 0;
  f.ports.journal.persist = () => new Promise<void>(resolve => { release = resolve; });
  f.stop(async () => { stops++; });
  const sending = f.direct.send('Auftrag', 'pending'); await tick();
  const rejected = assert.rejects(sending, /Stopp abgebrochen/);
  await f.direct.stop(); assert.equal(stops, 1); assert.equal(f.direct.snapshot().task.status, 'interrupted');
  release(); await rejected; assert.equal(f.runs.length, 0);
});

test('disposal confirms the adapter before waiting for an outstanding intent write', async () => {
  const f = fixture(); let release!: () => void, disposed = 0, settled = false;
  f.ports.journal.persist = () => new Promise<void>(resolve => { release = resolve; });
  f.dispose(async () => { disposed++; });
  const sending = f.direct.send('Auftrag', 'pending'); await tick();
  const rejected = assert.rejects(sending, /Stopp abgebrochen/);
  const disposal = f.direct.dispose().then(() => { settled = true; }); await tick();
  assert.equal(disposed, 1); assert.equal(settled, false); assert.equal(f.runs.length, 0);
  release(); await rejected; await disposal; assert.equal(settled, true);
});

test('a Stop followed by an admission failure never archives unaccepted messages', async () => {
  const f = fixture(); let reject!: (error: Error) => void;
  f.ports.journal.persist = () => new Promise<void>((_resolve, failed) => { reject = failed; });
  const sending = f.direct.send('Nie angenommen', 'pending'); await tick(); const failed = assert.rejects(sending, /Schreibfehler/);
  await f.direct.stop(); assert.equal(f.archived.has('pending'), false); assert.deepEqual(f.direct.archivableMessages(), []);
  reject(new Error('Schreibfehler')); await failed;
  assert.equal(f.archived.has('pending'), false); assert.deepEqual(f.direct.snapshot().messages, []);
});

test('Stop during asynchronous retrieval returns before memory and blocks the later model submission', async () => {
  const f = fixture(); let release!: (text: string) => void;
  f.ports.memory!.retrieve = () => new Promise<string>(resolve => { release = resolve; });
  const sending = f.direct.send('Auftrag', 'pending'); await tick(); const rejected = assert.rejects(sending, /Stopp abgebrochen/);
  await f.direct.stop(); assert.equal(f.runs.length, 0); assert.equal(f.direct.snapshot().task.status, 'interrupted');
  release('Verspäteter Kontext'); await rejected; assert.equal(f.runs.length, 0);
});

test('a delayed archive page cannot continue or fail a newer task after Stop and reset', async () => {
  const f = fixture(); await f.direct.send('Archiv lesen', 'old'); let reject!: (error: Error) => void;
  f.ports.memory!.readPeriod = () => new Promise((_resolve, failed) => { reject = failed; });
  f.direct.handle({ type: 'completed', status: 'completed', text: read }); await tick();
  await f.direct.stop(); f.direct.reset(); await f.direct.send('Neuer Auftrag', 'new');
  reject(new Error('Alte Archivseite fehlgeschlagen')); await f.direct.settleMemory();
  assert.equal(f.runs.length, 2); assert.equal(f.direct.snapshot().task.id, 'new'); assert.equal(f.direct.snapshot().task.status, 'running'); await f.direct.stop();
});

test('completed output is projected synchronously but Stop prevents proposals after a delayed capture', async () => {
  const f = fixture(); f.ports.parseReply = text => JSON.parse(text); await f.direct.send('Vorliebe', 'source');
  let release!: () => void; const captured = new Promise<void>(resolve => { release = resolve; });
  f.ports.journal.capture = () => captured;
  f.direct.handle({ type: 'completed', status: 'completed', text: JSON.stringify({ text: 'Vorschlag.', proposals: [{ documentId: 'core', baseVersion: 1, content: 'Neue Vorliebe.', reason: 'Gewünscht.' }], errors: [] }) });
  assert.equal(f.direct.snapshot().task.status, 'completed'); assert.equal(f.direct.snapshot().messages[1].text, 'Vorschlag.');
  await f.direct.stop(); release(); await f.direct.settleMemory(); assert.equal(f.proposals.length, 0);
});

test('failed strict completion capture prevents proposal submission', async () => {
  const f = fixture(); f.ports.parseReply = text => JSON.parse(text); await f.direct.send('Vorliebe', 'source');
  f.ports.journal.capture = strict => { assert.equal(strict, true); return Promise.reject(new Error('Archivfehler')); };
  f.direct.handle({ type: 'completed', status: 'completed', text: JSON.stringify({ text: 'Vorschlag.', proposals: [{ documentId: 'core', baseVersion: 1, content: 'Neue Vorliebe.', reason: 'Gewünscht.' }], errors: [] }) });
  await f.direct.settleMemory(); assert.equal(f.proposals.length, 0); assert.equal(f.direct.snapshot().task.status, 'completed');
});
