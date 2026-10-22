import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationCoordinator, type ConversationPorts, type ConversationState } from '../src/main/modules/conversation';
import type { AgentRunOptions, BackgroundJob, Message } from '../src/shared/contracts';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture() {
  let projection: ConversationState = { messages: [], task: { id: '', status: 'idle' } };
  let saved = structuredClone(projection), failSave = false, identity = 'Identität vor dem Auftrag';
  const runs: Array<{ text: string; model: string; threadId?: string; options?: AgentRunOptions }> = [];
  const receipts: string[] = [], spoken: string[] = [], finished: Array<Message | undefined> = [];
  const jobs: BackgroundJob[] = [], accepted: Parameters<ConversationPorts['jobs']['accept']>[0][] = [];
  let conversation!: ConversationCoordinator;
  const ports: ConversationPorts = {
    agent: {
      run: async (text, model, threadId, options) => {
        assert.equal(saved.task.status, 'running', 'dialogue execution follows durable admission');
        runs.push({ text, model, threadId, options });
        conversation.handle({ type: 'started', threadId: threadId ?? `thread-${runs.length}`, turnId: `turn-${runs.length}` });
      }, stop: async () => {},
    },
    availability: { blocked: () => false, prepare: async () => {}, configuration: () => ({ ready: true, model: 'dialog-model', workspace: 'C:\\workspace' }) },
    journal: {
      project: value => { projection = value; },
      persist: () => { if (failSave) throw new Error('Datenträger voll'); saved = structuredClone(projection); },
      changed: save => { if (save !== false && !failSave) saved = structuredClone(projection); },
    },
    context: {
      identity: () => identity, memory: () => '', skills: () => '', capture() {}, started() {},
      finished: answer => { finished.push(answer); }, idle() {},
    },
    jobs: {
      list: () => jobs,
      accept: input => {
        const previous = jobs.find(job => job.requestId === input.requestId);
        if (previous) return { job: previous, created: false };
        accepted.push(structuredClone(input));
        const job: BackgroundJob = { ...input, id: `job-${jobs.length}`, model: 'worker-model', status: 'running', createdAt: 'now', updatedAt: 'now' };
        jobs.push(job); return { job, created: true };
      },
      waitReason: () => undefined,
      get: id => { const job = jobs.find(job => job.id === id); if (!job) throw new Error('Aufgabe fehlt'); return job; },
      stop: async id => { ports.jobs.get(id).status = 'interrupted'; },
      steer: async id => ports.jobs.get(id),
    },
    effects: {
      clean: text => text,
      receipt: text => { assert.ok(saved.messages.some(message => message.role === 'user' && message.text === text)); receipts.push(text); },
      speak: text => { spoken.push(text); }, runtimeEvent() {},
      reportError: error => error instanceof Error ? error.message : String(error),
    },
  };
  conversation = new ConversationCoordinator(projection, ports);
  return { conversation, ports, runs, receipts, spoken, finished, accepted,
    projection: () => projection, saved: () => saved, failSave: (value: boolean) => { failSave = value; }, identity: (value: string) => { identity = value; } };
}

const task = { requestId: 'subtask', title: 'Projekt prüfen', resources: ['C:\\project'], acknowledgement: 'Ich prüfe das Projekt.' };

test('conversation admission remains exactly once when preparation yields to a duplicate request', async () => {
  const f = fixture();
  await Promise.all([f.conversation.send('Prüfe das Projekt', 'same'), f.conversation.send('Prüfe das Projekt', 'same')]);
  assert.equal(f.runs.length, 1);
  assert.equal(f.receipts.length, 1);
  assert.equal(f.conversation.hasPending(), false);
  assert.equal(f.saved().messages.filter(message => message.role === 'user').length, 1);
  const external = f.conversation.snapshot();
  external.messages[0].text = 'Veränderte Projektion'; external.task.status = 'idle';
  assert.equal(f.conversation.snapshot().messages[0].text, 'Prüfe das Projekt');
  assert.equal(f.conversation.snapshot().task.status, 'running');
});

test('failed queued admission stays retryable and Stop invalidates a continuation already scheduled for the queue', async () => {
  const f = fixture();
  await f.conversation.send('Erste Frage', 'first');
  f.failSave(true);
  await assert.rejects(f.conversation.send('Zweite Frage', 'second'), /Datenträger/);
  assert.equal(f.conversation.hasPending(), false);
  assert.ok(!f.conversation.snapshot().messages.some(message => message.id === 'second'));
  assert.deepEqual(f.receipts, ['Erste Frage']);
  f.failSave(false);
  await f.conversation.send('Zweite Frage', 'second');
  assert.equal(f.conversation.hasPending(), true);
  f.conversation.handle({ type: 'completed', status: 'completed', text: 'Erste Antwort' });
  await f.conversation.stop(); await tick();
  assert.equal(f.runs.length, 1, 'a scheduled queue continuation cannot survive Stop');
  assert.equal(f.conversation.hasPending(), false);
  assert.deepEqual(f.receipts, ['Erste Frage', 'Zweite Frage']);
  assert.ok(f.conversation.snapshot().messages.some(message => message.id === 'second'));
});

test('task delegation uses the active original and acknowledgements stay isolated from the next queued turn', async () => {
  const f = fixture();
  await f.conversation.send('Prüfe nur den aktuellen Projektstatus.', 'current');
  await f.conversation.send('Danach eine unabhängige Frage.', 'future');
  const signal = new AbortController().signal;
  const response = await f.conversation.tool('start_task', task, signal);
  assert.equal(response.success, true);
  assert.ok(f.accepted[0].prompt.includes('Prüfe nur den aktuellen Projektstatus.'));
  assert.ok(!f.accepted[0].prompt.includes('unabhängige Frage'));
  assert.ok(!JSON.stringify(f.accepted[0].history).includes('unabhängige Frage'));
  assert.equal((await f.conversation.tool('start_task', task, signal)).success, true);
  assert.equal(f.accepted.length, 1);
  assert.deepEqual(f.spoken, [task.acknowledgement]);
  f.conversation.handle({ type: 'completed', status: 'completed', text: `${task.acknowledgement} Welche Datei meinst du?` });
  await tick();
  assert.equal(f.runs.length, 2);
  assert.deepEqual(f.spoken, [task.acknowledgement, 'Welche Datei meinst du?']);
  f.conversation.handle({ type: 'completed', status: 'completed', text: task.acknowledgement });
  assert.equal(f.spoken.at(-1), task.acknowledgement, 'a later turn can say the same sentence independently');
  assert.equal(f.finished.length, 2);
});

test('identity and thread invalidation stay frozen for the active turn and apply on the next turn', async () => {
  const f = fixture();
  await f.conversation.send('Erster Auftrag', 'first');
  assert.equal(f.conversation.currentIdentity(), 'Identität vor dem Auftrag');
  f.identity('Neue Identität'); f.conversation.invalidateThread();
  assert.equal(f.conversation.currentIdentity(), 'Identität vor dem Auftrag');
  assert.equal(f.conversation.snapshot().task.threadId, 'thread-1');
  f.conversation.appendMessage({ id: 'result', role: 'assistant', jobId: 'earlier-job', text: 'Belegtes Arbeitsergebnis.', at: 'now' });
  f.conversation.handle({ type: 'completed', status: 'completed', text: 'Erste Antwort' });
  assert.equal(f.conversation.snapshot().task.threadId, undefined);
  await f.conversation.send('Nächster Auftrag', 'next');
  assert.equal(f.runs[1].threadId, undefined);
  assert.equal(f.conversation.currentIdentity(), 'Neue Identität');
  assert.ok(f.runs[1].options?.freshThreadContext?.includes('Belegtes Arbeitsergebnis.'));
  f.conversation.handle({ type: 'completed', status: 'completed', text: 'Zweite Antwort' });
  f.conversation.reset();
  assert.deepEqual(f.conversation.snapshot(), { messages: [], task: { id: '', status: 'idle' } });
});

test('a synchronous stop failure remains retryable and late completion cannot reopen the conversation', async () => {
  const f = fixture(); await f.conversation.send('Aktiver Auftrag', 'active');
  f.ports.agent.stop = () => { throw new Error('Prozessende unbestätigt'); };
  await assert.rejects(f.conversation.stop(), /unbestätigt/);
  assert.equal(f.conversation.snapshot().task.status, 'stopping');
  await assert.rejects(f.conversation.send('Zu früher Auftrag', 'premature'), /Stopp/);
  f.conversation.handle({ type: 'completed', status: 'completed', text: 'Verspätete Antwort' });
  assert.deepEqual(f.spoken, []);
  assert.equal(f.conversation.snapshot().task.status, 'stopping');
  f.ports.agent.stop = async () => {};
  await f.conversation.stop();
  assert.equal(f.conversation.snapshot().task.status, 'interrupted');
  assert.equal(f.conversation.isStopping(), false);
  await f.conversation.send('Neuer Auftrag', 'new');
  assert.equal(f.runs.length, 2);
});

test('Stop during admission preparation prevents a new durable request and any model work', async () => {
  const f = fixture(); let release!: () => void;
  f.ports.availability.prepare = () => new Promise<void>(resolve => { release = resolve; });
  const sending = f.conversation.send('Noch nicht angenommener Auftrag', 'waiting');
  await tick();
  await f.conversation.stop(); release();
  await assert.rejects(sending, /Stopp abgebrochen/);
  assert.equal(f.runs.length, 0);
  assert.deepEqual(f.receipts, []);
  assert.deepEqual(f.conversation.snapshot().messages, []);
});

test('pending duplicate messages share a durable failure without a premature receipt', async () => {
  const f = fixture(), persist = f.ports.journal.persist; let reject!: (error: Error) => void, settled = false;
  f.ports.journal.persist = () => new Promise<void>((_resolve, failed) => { reject = failed; });
  const first = f.conversation.send('Frage', 'same'); await tick();
  const repeated = f.conversation.send('Frage', 'same');
  void repeated.then(() => { settled = true; }, () => { settled = true; });
  await tick(); assert.equal(settled, false); assert.deepEqual(f.receipts, []); assert.equal(f.runs.length, 0);
  const failures = Promise.all([assert.rejects(first, /Schreibfehler/), assert.rejects(repeated, /Schreibfehler/)]);
  reject(new Error('Schreibfehler')); await failures;
  assert.deepEqual(f.conversation.snapshot().messages, []); assert.equal(f.conversation.snapshot().task.status, 'idle');
  f.ports.journal.persist = persist; await f.conversation.send('Frage', 'same'); assert.equal(f.runs.length, 1);
  await f.conversation.stop();
});

test('a queued message whose write outlives the active turn is continued after durable acknowledgement', async () => {
  const f = fixture(); await f.conversation.send('Erste Frage', 'first');
  const persist = f.ports.journal.persist; let release!: () => void;
  f.ports.journal.persist = () => new Promise<void>(resolve => { release = () => { persist(); resolve(); }; });
  const queued = f.conversation.send('Zweite Frage', 'second'); await tick();
  f.conversation.handle({ type: 'completed', status: 'completed', text: 'Erste Antwort' });
  assert.equal(f.runs.length, 1); assert.deepEqual(f.receipts, ['Erste Frage']);
  f.ports.journal.persist = persist; release(); await queued; await tick();
  assert.equal(f.runs.length, 2); assert.deepEqual(f.receipts, ['Erste Frage', 'Zweite Frage']);
  assert.equal(f.conversation.snapshot().task.id, 'second'); await f.conversation.stop();
});

test('Stop does not wait for the pending message write and its ACK cannot restart the conversation', async () => {
  const f = fixture(); let release!: () => void, stops = 0;
  f.ports.journal.persist = () => new Promise<void>(resolve => { release = resolve; });
  f.ports.agent.stop = async () => { stops++; };
  const sending = f.conversation.send('Frage', 'pending'); await tick();
  const rejected = assert.rejects(sending, /Stopp abgebrochen/);
  await f.conversation.stop(); assert.equal(stops, 1); assert.equal(f.conversation.snapshot().task.status, 'interrupted');
  release(); await rejected; assert.equal(f.runs.length, 0); assert.deepEqual(f.receipts, []);
});

test('Stop and a later failed admission cannot capture provisional conversation sources', async () => {
  const f = fixture(), archived = new Set<string>(); let reject!: (error: Error) => void;
  const capture = () => { for (const message of f.conversation.archivableMessages()) archived.add(message.id); };
  f.ports.context.capture = capture; f.ports.context.finished = capture;
  f.ports.journal.persist = () => new Promise<void>((_resolve, failed) => { reject = failed; });
  const sending = f.conversation.send('Nie angenommen', 'pending'); await tick(); const failed = assert.rejects(sending, /Schreibfehler/);
  await f.conversation.stop(); assert.equal(archived.has('pending'), false); assert.deepEqual(f.conversation.archivableMessages(), []);
  reject(new Error('Schreibfehler')); await failed;
  assert.equal(archived.has('pending'), false); assert.deepEqual(f.conversation.snapshot().messages, []);
});

test('Stop interrupts an asynchronous context lookup without waiting and suppresses its late run', async () => {
  const f = fixture(); let release!: (text: string) => void;
  f.ports.context.memory = () => new Promise<string>(resolve => { release = resolve; });
  const sending = f.conversation.send('Frage', 'pending'); await tick(); const rejected = assert.rejects(sending, /Stopp abgebrochen/);
  await f.conversation.stop(); assert.equal(f.conversation.snapshot().task.status, 'interrupted');
  release('Verspäteter Kontext'); await rejected; assert.equal(f.runs.length, 0);
});

test('the next admission waits for completion capture and cannot survive a Stop during that wait', async () => {
  const f = fixture(); await f.conversation.send('Erste Frage', 'first'); let release!: () => void;
  f.ports.context.finished = () => new Promise<void>(resolve => { release = resolve; });
  f.conversation.handle({ type: 'completed', status: 'completed', text: 'Antwort.' });
  const sending = f.conversation.send('Nächste Frage', 'next'); await tick(); assert.equal(f.runs.length, 1);
  const rejected = assert.rejects(sending, /Stopp abgebrochen/); await f.conversation.stop(); release(); await rejected;
  assert.equal(f.runs.length, 1); assert.ok(!f.conversation.snapshot().messages.some(message => message.id === 'next'));
});
