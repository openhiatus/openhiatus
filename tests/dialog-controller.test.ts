import test from 'node:test';
import assert from 'node:assert/strict';
import { AppController } from '../src/main/controller';
import { defaultState, type SavedState } from '../src/main/storage';
import type { BackgroundJob, AgentAdapter, AgentEvent, AgentRunOptions } from '../src/shared/contracts';
import { JobManager, resourcesConflict } from '../src/main/jobs';
import { MemoryStore } from '../src/main/memory';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

class FakeAgent implements AgentAdapter {
  runs: Array<{ text: string; model: string; threadId?: string; options?: AgentRunOptions }> = [];
  stops = 0; disposals = 0;
  stopResult?: () => Promise<void>;
  jobAtCreation?: BackgroundJob;
  steering: Array<{ text: string; expectedTurnId?: string }> = [];
  constructor(readonly emit: (event: AgentEvent) => void = () => {}) {}
  async start() {}
  async run(text: string, model: string, threadId?: string, options?: AgentRunOptions) {
    // Like the real adapter: fresh-thread context is prepended only when no thread is resumed.
    if (!threadId && options?.freshThreadContext) text = `${options.freshThreadContext}\n\n${text}`;
    this.runs.push({ text, model, threadId, options });
    this.emit({ type: 'started', threadId: threadId ?? `thread-${this.runs.length}`, turnId: `turn-${this.runs.length}` });
  }
  async stop() { this.stops++; await this.stopResult?.(); }
  async dispose() { this.disposals++; }
  async steer(text: string, expectedTurnId?: string) { this.steering.push({ text, expectedTurnId }); }
  async listSkills() { return { skills: [{ name: 'test-skill', description: 'Bekannte Codex-Fenster öffnen.', path: 'C:\\skills\\test\\SKILL.md', enabled: true, scope: 'user' as const }], errors: [], directory: 'C:\\skills' }; }
  finish(text = 'Bestätigtes Ergebnis.') { this.emit({ type: 'completed', status: 'completed', text }); }
}
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(initial = defaultState(), memory?: MemoryStore, profileDirectory?: string) {
  let saved = structuredClone(initial); saved.preferences.fullAccessAcknowledged = true;
  let failSave = false;
  let now = 1000;
  let app!: AppController;
  const workers: FakeAgent[] = [];
  const agent = new FakeAgent();
  const dialog = new FakeAgent(event => app.handleDialog(event));
  const options = {
    store: { load: () => structuredClone(saved), save: (state: SavedState) => { if (failSave) throw new Error('Datenträger voll'); saved = structuredClone(state); } },
    credentials: { get: () => undefined, set() {}, remove() {} },
    speech: { async transcribe() { return 'Neuer Auftrag'; }, async synthesize() { return { base64: 'YQ==', mimeType: 'audio/mpeg' }; }, async test() { return { base64: 'YQ==', mimeType: 'audio/mpeg' }; } },
    memory, agent, dialogAgent: dialog, createWorker: (onEvent: (event: AgentEvent) => void, job: BackgroundJob) => {
      assert.equal(saved.jobs?.at(-1)?.status, 'running', 'Worker creation follows a durable running transition');
      const worker = new FakeAgent(onEvent); worker.jobAtCreation = structuredClone(job); workers.push(worker); return worker;
    }, receiptPhrase: () => 'Okay, ich bin dran.', workspace: 'C:\\demo', profileDirectory, publish() {}, async openAuth() {}, now: () => now,
  };
  app = new AppController(options);
  app.handle({ type: 'connection', status: 'ready', account: 'Testkonto' });

  app.handle({ type: 'models', models: [{ id: 'test-model', label: 'Testmodell' }] });
  return { app, options, agent, dialog, workers, saved: () => saved, failSave: (value: boolean) => { failSave = value; }, advance: (ms: number) => { now += ms; } };
}
const args = (resources = ['C:\\repo-a'], prompt = 'Öffne das ausdrücklich angeforderte Fenster mit test-skill.') => ({
  requestId: 'work', title: 'Projekt öffnen', prompt, acknowledgement: 'Okay, ich öffne das Projekt. Das dauert einen Moment.', resources,
});
function shortArgs(resources?: string[]) { const { prompt: _prompt, ...short } = args(resources); return short; }
function response(result: Awaited<ReturnType<AppController['dialogTool']>>) { return JSON.parse(result.contentItems[0].type === 'inputText' ? result.contentItems[0].text : 'null'); }
async function accept(f: ReturnType<typeof fixture>, requestId: string, resources?: string[]) {
  await f.app.send('Öffne das Projekt', requestId);
  const result = await f.app.dialogTool('start_task', args(resources), new AbortController().signal);
  assert.equal(result.success, true);
  f.dialog.finish(args(resources).acknowledgement);
  await tick();
  return response(result).job.id as string;
}

test('dialogues acknowledge durable background admission immediately and remain usable while work runs', async () => {
  const f = fixture(); await f.app.start();
  const jobId = await accept(f, 'request-1');
  assert.equal(f.agent.runs.length, 0, 'control runtime does not execute the foreground conversation');
  assert.equal(f.dialog.runs[0].options?.purpose, 'dialog');
  assert.ok(f.dialog.runs[0].text.includes('C:\\\\skills\\\\test\\\\SKILL.md'));
  assert.equal(f.app.snapshot().task.status, 'completed');
  assert.equal(f.app.snapshot().jobs![0].status, 'running');
  assert.equal(f.app.snapshot().speech!.length, 2, 'receipt and one concrete job acknowledgement are separate');
  assert.equal(f.app.snapshot().speech![0].text, 'Okay, ich bin dran.');
  assert.equal(f.app.snapshot().speech![0].kind, 'receipt');
  assert.equal(f.app.snapshot().speech![1].kind, undefined, 'the concrete acknowledgement is no neutral receipt');
  assert.equal(f.app.snapshot().speech![0].jobId, undefined);
  assert.equal(f.app.snapshot().speech![1].jobId, jobId);
  assert.ok(f.workers[0].runs[0].text.includes('test-skill'));
  await f.app.send('Was machst du gerade?', 'status-request');
  const status = await f.app.dialogTool('status_task', { jobId }, new AbortController().signal);
  assert.equal(response(status).jobs[0].status, 'running');
  assert.equal(f.workers.length, 1, 'a status request never starts another worker');
  f.dialog.finish('Das Projekt wird gerade geöffnet.');
  f.workers[0].finish('Das angeforderte Fenster wurde geöffnet und geprüft.');
  assert.equal(f.app.snapshot().jobs![0].status, 'completed');
  assert.ok(f.app.snapshot().messages.some(message => message.jobId === jobId && message.text.includes('geöffnet und geprüft')));
  assert.equal(f.app.snapshot().speech!.at(-1)?.jobId, jobId);
  assert.equal(f.app.snapshot().jobs![0].runtimeRetained, true);
});

test('completed worker commentary speaks concise progress while tool output and deltas remain silent', async () => {
  const f = fixture();
  const id = await accept(f, 'progress');
  const before = f.app.snapshot().speech!.length;
  f.workers[0].emit({ type: 'activity', kind: 'command', title: 'Befehl beendet', detail: 'Rohdaten aus einem Werkzeug' });
  f.workers[0].emit({ type: 'delta', text: 'Unvollständige Mitteilung' });
  assert.equal(f.app.snapshot().speech!.length, before);
  f.workers[0].emit({ type: 'commentary', itemId: 'milestone-1', text: '**Die Fenster sind geöffnet und geprüft.** Ich trage jetzt die Texte ein.' });
  assert.deepEqual(f.app.snapshot().speech!.at(-1)?.jobId, id);
  assert.equal(f.app.snapshot().speech!.at(-1)?.text, 'Die Fenster sind geöffnet und geprüft. Ich trage jetzt die Texte ein.');
  assert.equal(f.app.snapshot().task.status, 'completed', 'progress does not occupy the conversation');
  assert.equal(f.app.snapshot().jobs![0].status, 'running');
  assert.ok(f.app.snapshot().activity.some(item => item.detail?.includes('Ich trage jetzt')));
  assert.equal(f.saved().messages.filter(item => item.jobId === id).length, 0, 'progress is not another final result');
});

test('worker progress is deduplicated and rate limited without deferred audio after completion', async () => {
  const f = fixture(); await accept(f, 'progress-throttle');
  const emit = (itemId: string, text: string) => f.workers[0].emit({ type: 'commentary', itemId, text });
  const before = f.app.snapshot().speech!.length;
  emit('p1', 'Der erste Schritt ist geprüft.');
  emit('p1', 'Geänderte Wiederholung derselben Mitteilung.');
  emit('p2', 'Der erste Schritt ist geprüft.');
  emit('p3', 'Eine zu schnell folgende Mitteilung.');
  assert.equal(f.app.snapshot().speech!.length, before + 1);
  f.advance(15000);
  emit('p3', 'Eine zu schnell folgende Mitteilung.');
  assert.equal(f.app.snapshot().speech!.length, before + 1, 'suppressed updates never become a backlog');
  emit('p4', 'Ein weiterer Schritt ist jetzt geprüft.');
  assert.equal(f.app.snapshot().speech!.length, before + 2);
  f.workers[0].finish('Die Arbeit ist abgeschlossen.');
  const finished = f.app.snapshot().speech!.length;
  f.advance(60000); emit('late', 'Verspätete Fortschrittsmeldung.'); await tick();
  assert.equal(f.app.snapshot().speech!.length, finished);
  assert.equal(f.app.snapshot().speech!.at(-1)?.text, 'Projekt öffnen: Die Arbeit ist abgeschlossen.');
});

test('long or code-bearing progress stays visible and disabled speech produces no progress cue', async () => {
  const f = fixture(); await accept(f, 'progress-length');
  const before = f.app.snapshot().speech!.length;
  f.workers[0].emit({ type: 'commentary', text: 'Sehr ausführlicher Status. '.repeat(20) });
  f.workers[0].emit({ type: 'commentary', text: 'Technische Ausgabe:\n```json\n{"detail":"kein Sprachtext"}\n```' });
  assert.equal(f.app.snapshot().speech!.length, before);
  assert.ok(f.app.snapshot().activity.some(item => item.detail?.includes('Technische Ausgabe')));
  for (const preferences of [{ voiceConversation: false }, { speakReplies: false }]) {
    const initial = defaultState(); initial.preferences = { ...initial.preferences, ...preferences };
    const silent = fixture(initial); await accept(silent, 'silent-progress');
    const count = silent.app.snapshot().speech!.length;
    silent.workers[0].emit({ type: 'commentary', text: 'Der erste Schritt ist geprüft.' });
    assert.equal(silent.app.snapshot().speech!.length, count);
  }
});

test('concurrent progress names its job and a targeted stop prevents late speech without stopping the other worker', async () => {
  const f = fixture();
  const first = await accept(f, 'first-progress', ['C:\\first']);
  const second = await accept(f, 'second-progress', ['C:\\second']);
  f.workers[0].emit({ type: 'commentary', text: 'Der erste Schritt ist geprüft.' });
  assert.equal(f.app.snapshot().speech!.at(-1)?.text, 'Projekt öffnen: Der erste Schritt ist geprüft.');
  assert.equal(f.app.snapshot().speech!.at(-1)?.jobId, first);
  await f.app.stopJob(first);
  const count = f.app.snapshot().speech!.length;
  f.advance(60000);
  f.workers[0].emit({ type: 'commentary', text: 'Diese Mitteilung kam nach dem Stopp.' });
  assert.equal(f.app.snapshot().speech!.length, count);
  f.workers[1].emit({ type: 'commentary', text: 'Die andere Aufgabe arbeitet weiter.' });
  assert.equal(f.app.snapshot().speech!.at(-1)?.jobId, second);
  assert.equal(f.app.snapshot().speech!.at(-1)?.text, 'Die andere Aufgabe arbeitet weiter.');
  assert.equal(f.workers[1].stops, 0);
});

test('durable dialogue receipt is published before the model runs, does not claim a job, and is never repeated for the same request', async () => {
  const f = fixture();
  const run = f.dialog.run.bind(f.dialog);
  f.dialog.run = async (...parameters) => {
    assert.ok(f.saved().messages.some(message => message.id === 'received-request'));
    assert.equal(f.saved().task.status, 'running');
    assert.equal(f.app.snapshot().jobs!.length, 0);
    assert.equal(f.workers.length, 0);
    assert.deepEqual(f.app.snapshot().speech!.map(({ text, jobId }) => ({ text, jobId })), [{ text: 'Okay, ich bin dran.', jobId: undefined }]);
    await run(...parameters);
  };
  await f.app.send('Öffne Codex im Bernsteinprojekt.', 'received-request');
  await f.app.send('Öffne Codex im Bernsteinprojekt.', 'received-request');
  assert.equal(f.app.snapshot().speech!.length, 1);
  assert.equal(f.dialog.runs.length, 1);
  f.dialog.finish('Welcher Projektordner gehört dazu?');
  await f.app.send('Öffne Codex im Bernsteinprojekt.', 'received-request');
  assert.equal(f.app.snapshot().speech!.filter(cue => cue.text === 'Okay, ich bin dran.').length, 1);
});

test('rejected persistence and pending Stop produce no new receipt; review mode and disabled speech remain silent at intake', async () => {
  const f = fixture(); f.failSave(true);
  await assert.rejects(f.app.send('Nicht gespeicherte Nachricht.', 'failed-receipt'), /Datenträger voll/);
  assert.equal(f.app.snapshot().speech!.length, 0);
  assert.equal(f.dialog.runs.length, 0);
  f.failSave(false); await f.app.send('Gespeicherte Nachricht.', 'valid-receipt');
  f.failSave(true);
  await assert.rejects(f.app.send('Nicht gespeicherte Warteschlangennachricht.', 'failed-queued-receipt'), /Datenträger voll/);
  assert.equal(f.app.snapshot().speech!.length, 1, 'a rejected queued message also receives no cue');
  assert.ok(!f.app.snapshot().messages.some(message => message.id === 'failed-queued-receipt'));
  f.failSave(false);
  let release!: () => void;
  f.dialog.stopResult = () => new Promise<void>(resolve => { release = resolve; });
  const stopping = f.app.stop();
  const before = f.app.snapshot().speech!.length;
  await assert.rejects(f.app.send('Nachricht während Stopp.', 'stop-receipt'), /Stopp/);
  assert.equal(f.app.snapshot().speech!.length, before);
  release(); await stopping;
  for (const preferences of [{ voiceConversation: false }, { speakReplies: false }]) {
    const initial = defaultState(); initial.preferences = { ...initial.preferences, ...preferences };
    const silent = fixture(initial);
    await silent.app.send('Eine Nachricht ohne gesprochene Empfangsbestätigung.', 'silent-receipt');
    assert.equal(silent.app.snapshot().speech!.length, 0);
    assert.equal(silent.dialog.runs.length, 1);
  }
});

test('duplicate tool admissions and IPC sends execute only once, and a different final question is still spoken', async () => {
  const f = fixture(); await f.app.send('Auftrag', 'request');
  const first = await f.app.dialogTool('start_task', args(), new AbortController().signal);
  const repeated = await f.app.dialogTool('start_task', args(), new AbortController().signal);
  assert.equal(response(first).job.id, response(repeated).job.id);
  assert.equal(response(repeated).repeated, true);
  assert.equal(f.app.snapshot().speech!.length, 2);
  f.dialog.finish('Soll ich außerdem den Bericht vorbereiten?');
  assert.equal(f.app.snapshot().speech!.at(-1)?.text, 'Soll ich außerdem den Bericht vorbereiten?');
  await f.app.send('Auftrag', 'request');
  assert.equal(f.dialog.runs.length, 1);
  assert.equal(f.workers.length, 1);
});

test('short admissions inherit the unchanged current message, proven prior history, memory and warm skills without copying queued future requests', async () => {
  const initial = defaultState();
  initial.messages = [
    { id: 'known-project', role: 'user', text: 'Mein Bernsteinprojekt liegt in C:\\bernstein-repo. Verwende dort test-skill.', at: '2026-10-06T12:00:00Z' },
    { id: 'known-answer', role: 'assistant', text: 'Das vorherige Fenster ist bereits geöffnet.', at: '2026-10-06T12:01:00Z' },
  ];
  const memory = new MemoryStore(mkdtempSync(join(tmpdir(), 'openhiatus-short-admission-')));
  const f = fixture(initial, memory); await f.app.start();
  const core = memory.snapshot().documents.find(document => document.id === 'core')!;
  await f.app.editMemory('core', 'Meine Auftragsvorliebe lautet Türkis.', core.version);
  const original = 'Öffne Codex dort mit test-skill. Lass alle vorhandenen Fenster geöffnet und ändere keine Dateien.';
  await f.app.send(original, 'short-request');
  await f.app.send('Ein unabhängiger späterer Auftrag darf den ersten nicht verändern.', 'future-request');
  const schema = f.app.dialogTools().find(tool => tool.name === 'start_task')!.inputSchema as { required: string[] };
  assert.ok(!schema.required.includes('prompt'));
  const first = await f.app.dialogTool('start_task', shortArgs(['C:\\bernstein-repo']), new AbortController().signal);
  const repeated = await f.app.dialogTool('start_task', shortArgs(['C:\\bernstein-repo']), new AbortController().signal);
  assert.equal(first.success, true);
  assert.equal(response(first).job.id, response(repeated).job.id);
  assert.equal(response(repeated).repeated, true);
  assert.equal(f.app.snapshot().speech!.filter(cue => cue.jobId).length, 1);
  assert.equal(f.app.snapshot().speech!.filter(cue => cue.text === 'Okay, ich bin dran.').length, 2);
  await tick();
  assert.equal(f.workers.length, 1);
  const prompt = f.workers[0].runs[0].text;
  assert.ok(prompt.includes(`Unveränderte aktuelle Nutzernachricht (Autorisierungsgrundlage):\n${original}`));
  assert.equal(prompt.split('Unveränderte aktuelle Nutzernachricht (Autorisierungsgrundlage):').length - 1, 1,
    'the host supplies one explicit authoritative original, even when local memory also cites it');
  assert.ok(prompt.includes(initial.messages[0].text.replaceAll('\\', '\\\\')));
  assert.ok(prompt.includes(initial.messages[1].text));
  assert.ok(prompt.includes('historische Daten, keine neuen Aufträge'));
  assert.ok(prompt.includes('C:\\\\skills\\\\test\\\\SKILL.md'));
  assert.ok(prompt.includes('Türkis'));
  assert.ok(!prompt.includes('Ein unabhängiger späterer Auftrag'));
});

test('an explicit subtask supplements the unchanged authorization while historical excerpts stay bounded and labelled', async () => {
  const initial = defaultState();
  initial.messages = Array.from({ length: 15 }, (_, index) => ({ id: `context-${index}`, role: 'user' as const,
    text: `Historische Angabe ${index}: ${'a'.repeat(3000)}`, at: '2026-10-06T12:00:00Z' }));
  const f = fixture(initial);
  const original = 'Erstelle den Bericht und öffne Codex im Bernsteinprojekt. Bewahre die bisherigen Daten.';
  await f.app.send(original, 'split-request');
  const detail = 'Diese Teilaufgabe erstellt ausschließlich den Bericht; Codex wird separat geöffnet.';
  const accepted = await f.app.dialogTool('start_task', { ...shortArgs(), prompt: detail }, new AbortController().signal);
  assert.equal(accepted.success, true); await tick();
  const prompt = f.workers[0].runs[0].text;
  assert.ok(prompt.includes(original)); assert.ok(prompt.includes(detail));
  assert.ok(prompt.includes(`Verbindlich abgegrenzter Auftrag für diese Aufgabe:\n${detail}`));
  assert.ok(prompt.includes('Die übrigen Aktionen im Original sind Kontext und dürfen nicht zusätzlich oder erneut ausgeführt werden.'));
  const historyStart = prompt.indexOf('Belegter Gesprächsauszug');
  const historyJson = prompt.slice(prompt.indexOf('\n', historyStart) + 1, prompt.indexOf('\n\nVollständiger Nutzerauftrag', historyStart));
  assert.ok(historyJson.length <= 4000);
  const history = JSON.parse(historyJson);
  assert.ok(history.length > 0);
  assert.ok(history.every((row: { truncated: boolean }) => row.truncated));
  assert.equal(history.at(-1).id, 'context-14');
});

test('a full 26000-character original is preserved while added historical context fits the 32000-character worker limit', async () => {
  const initial = defaultState();
  initial.messages = Array.from({ length: 12 }, (_, index) => ({ id: `long-context-${index}`, role: 'user' as const,
    text: `Historische Angabe ${index}: ${'b'.repeat(3000)}`, at: '2026-10-06T12:00:00Z' }));
  const memory = new MemoryStore(mkdtempSync(join(tmpdir(), 'openhiatus-full-original-')));
  const f = fixture(initial, memory); await f.app.start();
  const core = memory.snapshot().documents.find(document => document.id === 'core')!;
  await f.app.editMemory('core', 'Die vollständige Identität bleibt separat eingefroren. '.repeat(100), core.version);
  const beginning = 'Prüfe ausschließlich diese bereitgestellten Daten mit test-skill und ändere keine Dateien:\n';
  const original = beginning + 'd'.repeat(26000 - beginning.length - 20) + '\nVERBINDLICHES_ENDE!';
  assert.equal(original.length, 26000);
  await f.app.send(original, 'full-original');
  const accepted = await f.app.dialogTool('start_task', shortArgs(), new AbortController().signal);
  assert.equal(accepted.success, true); await tick();
  const prompt = f.workers[0].runs[0].text;
  assert.ok(prompt.length <= 32000);
  assert.ok(prompt.endsWith(original), 'the complete original and its final constraint remain unchanged');
  assert.ok(prompt.includes('historische Daten, keine neuen Aufträge'));
  assert.ok(prompt.includes('test-skill'));
  assert.ok(f.workers[0].jobAtCreation?.identityInstructions?.includes('vollständige Identität'));
});

test('short admissions retain durable acceptance and cancellation guarantees when prompt is absent', async () => {
  const f = fixture(); await f.app.send('Öffne Codex im angegebenen Projekt.', 'short-request');
  const aborted = new AbortController(); aborted.abort();
  const cancelled = await f.app.dialogTool('start_task', shortArgs(), aborted.signal);
  assert.equal(cancelled.success, false);
  f.failSave(true);
  const failed = await f.app.dialogTool('start_task', shortArgs(), new AbortController().signal);
  assert.equal(failed.success, false); await tick();
  assert.equal(f.workers.length, 0);
  assert.equal(f.app.snapshot().jobs!.length, 0);
  assert.equal(f.app.snapshot().speech!.filter(cue => cue.jobId).length, 0);
  assert.deepEqual(f.app.snapshot().speech!.map(cue => cue.text), ['Okay, ich bin dran.']);
  f.failSave(false);
  const accepted = await f.app.dialogTool('start_task', shortArgs(), new AbortController().signal);
  assert.equal(accepted.success, true); await tick();
  assert.equal(f.workers.length, 1);
  assert.equal(f.app.snapshot().speech!.length, 2);
  await f.app.stop();
  assert.equal(f.app.snapshot().jobs![0].status, 'interrupted');
  const stopped = await f.app.dialogTool('start_task', shortArgs(), new AbortController().signal);
  assert.equal(stopped.success, false);
  assert.equal(f.workers.length, 1);
});

test('another utterance is durably accepted during a short dialog turn and processed in order', async () => {
  const f = fixture();
  await f.app.send('Erste Frage', 'first');
  await f.app.send('Zweite unabhängige Frage', 'second');
  await f.app.send('Zweite unabhängige Frage', 'second');
  assert.equal(f.dialog.runs.length, 1);
  assert.equal(f.app.snapshot().speech!.length, 2, 'queued input is received once, before its later turn runs');
  assert.ok(f.saved().messages.some(message => message.id === 'second'));
  f.dialog.finish('Antwort eins.'); await tick();
  assert.equal(f.dialog.runs.length, 2);
  assert.equal(f.app.snapshot().speech!.filter(cue => cue.text === 'Okay, ich bin dran.').length, 2, 'dequeue adds no receipt');
  assert.equal(f.app.snapshot().task.id, 'second');
  assert.ok(f.dialog.runs[1].text.endsWith('Zweite unabhängige Frage'));
  f.dialog.finish('Antwort zwei.');
  assert.deepEqual(f.app.snapshot().speech!.map(cue => cue.text), ['Okay, ich bin dran.', 'Okay, ich bin dran.', 'Antwort eins.', 'Antwort zwei.']);
});

test('at most two independent workers run; overlapping Windows project paths wait without cancelling work', async () => {
  const f = fixture();
  const first = await accept(f, 'one', ['C:\\Repo\\Package']);
  const second = await accept(f, 'two', ['c:/repo']);
  const third = await accept(f, 'three', ['C:\\other']);
  assert.equal(f.workers.length, 2);
  assert.equal(f.app.snapshot().jobs!.find(job => job.id === second)?.status, 'queued');
  assert.equal(f.app.snapshot().jobs!.find(job => job.id === third)?.status, 'running');
  assert.equal(f.workers[0].stops, 0);
  f.workers[0].finish(); await tick();
  assert.equal(f.workers.length, 3);
  assert.equal(f.app.snapshot().jobs!.find(job => job.id === first)?.status, 'completed');
  assert.equal(f.app.snapshot().jobs!.find(job => job.id === second)?.status, 'running');
  assert.equal(resourcesConflict(['C:\\Repo'], ['c:/repo/sub']), true);
  assert.equal(resourcesConflict(['C:\\Repo'], ['C:\\Repository']), false);
});

test('steering updates the exact running turn; cancelling one worker preserves other workers and ignores late output', async () => {
  const f = fixture();
  const first = await accept(f, 'one', ['C:\\one']);
  const second = await accept(f, 'two', ['C:\\two']);
  await f.app.send('Ändere den ersten Auftrag', 'correction');
  const correction = await f.app.dialogTool('steer_task', { jobId: first, instruction: 'Verwende stattdessen den neuen Branch.' }, new AbortController().signal);
  assert.equal(correction.success, true);
  assert.deepEqual(f.workers[0].steering, [{ text: 'Verwende stattdessen den neuen Branch.', expectedTurnId: 'turn-1' }]);
  f.dialog.finish();
  await f.app.stopJob(first);
  assert.equal(f.workers[0].stops, 1);
  assert.equal(f.workers[0].disposals, 1);
  assert.equal(f.workers[1].stops, 0);
  assert.equal(f.app.snapshot().jobs!.find(job => job.id === second)?.status, 'running');
  const cueCount = f.app.snapshot().speech!.length;
  f.workers[0].finish('Verspäteter Erfolg.');
  assert.equal(f.app.snapshot().speech!.length, cueCount);
  assert.equal(f.app.snapshot().jobs!.find(job => job.id === first)?.status, 'interrupted');
});

test('global Stop cancels queued dialogue and worker admissions before waiting for a difficult worker', async () => {
  const f = fixture(); await accept(f, 'one');
  await f.app.send('Erkläre etwas', 'dialog');
  await f.app.send('Noch eine Nachricht', 'queued-dialog');
  let release!: () => void;
  f.workers[0].stopResult = () => new Promise<void>(resolve => { release = resolve; });
  const stopping = f.app.stop();
  assert.equal(f.app.snapshot().task.status, 'stopping');
  assert.equal(f.app.snapshot().jobs![0].status, 'stopping');
  const cueCount = f.app.snapshot().speech!.length;
  f.dialog.finish('Verspätete Antwort.'); f.workers[0].finish('Verspätetes Ergebnis.');
  assert.equal(f.app.snapshot().speech!.length, cueCount);
  release(); await stopping; await tick();
  assert.equal(f.app.snapshot().jobs![0].status, 'interrupted');
  assert.equal(f.dialog.runs.length, 2, 'queued utterance is not replayed after Stop');
});

test('failed persistence never creates or speaks an unaccepted worker; restart interrupts queued/running work without replay', async () => {
  const f = fixture(); await f.app.send('Auftrag', 'one'); f.failSave(true);
  const result = await f.app.dialogTool('start_task', args(), new AbortController().signal);
  assert.equal(result.success, false);
  assert.equal(f.workers.length, 0); assert.equal(f.app.snapshot().jobs!.length, 0);
  assert.deepEqual(f.app.snapshot().speech!.map(cue => cue.text), ['Okay, ich bin dran.']);
  f.failSave(false); f.dialog.finish();
  await accept(f, 'two'); await accept(f, 'three');
  const restarted = new AppController(f.options);
  assert.ok(restarted.snapshot().jobs!.every(job => job.status === 'interrupted' && !job.runtimeRetained));
  assert.equal(restarted.snapshot().speech!.length, 0);
  assert.equal(f.workers.length, 1);
});

test('upgrade/restart creates a fresh dialogue thread while preserving worker history and interrupting unfinished work without replay', async () => {
  for (const status of ['completed', 'running'] as const) {
    const initial = defaultState();
    initial.task = { id: 'old-worker-request', status, threadId: 'persisted-worker-thread', turnId: 'persisted-worker-turn' };
    initial.messages = [
      { id: 'old-worker-request', role: 'user', text: 'Die vorige Aufgabe galt dem Bernsteinprojekt.', at: '2026-10-06T12:00:00Z' },
      { id: 'old-worker-answer', role: 'assistant', text: 'Zum Bernsteinprojekt liegt dieses frühere Ergebnis vor.', at: '2026-10-06T12:01:00Z' },
    ];
    initial.jobs = [{ ...historicalJob(0), status: 'running', runtimeRetained: true,
      threadId: 'another-worker-thread', turnId: 'another-worker-turn' }];
    const f = fixture(initial);
    await f.app.initialize();
    assert.equal(f.app.snapshot().task.threadId, undefined);
    assert.equal(f.app.snapshot().task.turnId, undefined);
    assert.equal(f.saved().task.threadId, undefined, 'discarded identifiers cannot be revived on restart');
    assert.deepEqual(f.app.snapshot().messages, initial.messages);
    assert.equal(f.app.snapshot().task.status, status === 'running' ? 'interrupted' : 'completed');
    assert.equal(f.app.snapshot().jobs![0].status, 'interrupted');
    assert.equal(f.app.snapshot().jobs![0].runtimeRetained, false);
    await f.app.send('Was wissen wir über das Bernsteinprojekt?', `new-dialogue-${status}`);
    assert.equal(f.dialog.runs[0].threadId, undefined, 'legacy worker threads never reach dialogue thread/resume');
    assert.ok(f.dialog.runs[0].text.includes(initial.messages[0].text));
    assert.ok(f.dialog.runs[0].text.includes(initial.messages[1].text));
    assert.equal(f.workers.length, 0, 'no unfinished job is automatically replayed');
    assert.equal(f.agent.runs.length, 0);
  }
});

test('/goal fails explicitly before any dialog or worker is started', async () => {
  const f = fixture();
  await assert.rejects(f.app.send('/goal Prüfe die Funktion.', 'goal-request'), /noch nicht verfügbar/);
  assert.equal(f.dialog.runs.length, 0); assert.equal(f.workers.length, 0);
  assert.equal(f.app.snapshot().messages.length, 0);
});

test('retained runtime trees are bounded; targeted stop of a completed job releases exactly its tree and admits the queue', async () => {
  const f = fixture();
  for (let index = 0; index < 8; index++) {
    await accept(f, `request-${index}`, [`C:\\project-${index}`]);
    f.workers[index].finish();
  }
  const waiting = await accept(f, 'ninth', ['C:\\ninth']);
  assert.equal(f.workers.length, 8);
  assert.equal(f.app.snapshot().jobs!.find(job => job.id === waiting)?.status, 'queued');
  assert.ok(f.app.snapshot().speech!.at(-1)?.text.includes('wartet'));
  await f.app.stopJob(f.app.snapshot().jobs![0].id); await tick();
  assert.equal(f.workers.length, 9);
  assert.equal(f.app.snapshot().jobs![0].status, 'completed');
  assert.equal(f.app.snapshot().jobs![0].runtimeRetained, false);
  assert.equal(f.app.snapshot().jobs!.find(job => job.id === waiting)?.status, 'running');
  assert.equal(f.workers.slice(1, 8).some(worker => worker.stops > 0), false);
});

test('parallel worker memory proposals use their own captured versions and archived user/result sources', async () => {
  const memory = new MemoryStore(mkdtempSync(join(tmpdir(), 'openhiatus-dialog-memory-')));
  const f = fixture(defaultState(), memory);
  const core = () => memory.snapshot().documents.find(document => document.id === 'core')!;
  const original = core().version;
  const first = await accept(f, 'one', ['C:\\one']);
  await f.app.editMemory('core', 'Bitte knapp antworten.', original);
  const second = await accept(f, 'two', ['C:\\two']);
  const next = core().version;
  const proposal = (version: number) => 'Vorschlag zur Prüfung.\n\n```openhiatus-memory-proposal\n'
    + JSON.stringify({ documentId: 'core', baseVersion: version, content: 'Bitte auf Deutsch und knapp antworten.', reason: 'Ausdrücklich gewünschte Vorliebe.' }) + '\n```';
  f.workers[0].finish(proposal(original));
  f.workers[1].finish(proposal(next));
  await tick();
  const proposals = memory.snapshot().proposals;
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].status, 'pending');
  assert.ok(proposals[0].sourceIds.includes('two'));
  assert.ok(f.app.snapshot().activity.some(row => row.title === 'Gedächtnisvorschlag wurde nicht übernommen' && row.detail?.includes('veraltet')));
  for (const jobId of [first, second]) {
    const resultMessage = f.app.snapshot().messages.find(message => message.jobId === jobId)!;
    if (jobId === second) assert.ok(proposals[0].sourceIds.includes(resultMessage.id));
    assert.ok(memory.source(resultMessage.id), 'proposal source exists before proposal admission');
    assert.ok(!resultMessage.text.includes('openhiatus-memory-proposal'));
  }
});

test('background archive paging continues the same worker/thread without exposing its protocol or blocking dialogue', async () => {
  const memory = new MemoryStore(mkdtempSync(join(tmpdir(), 'openhiatus-dialog-archive-')));
  memory.capture([{ id: 'historical', role: 'user', text: 'Das Projekt hatte am vierten Oktober blaue Karten.', at: '2026-10-04T13:00:00Z' }], 'synthetic-history');
  const f = fixture(defaultState(), memory);
  const id = await accept(f, 'archive');
  f.workers[0].finish('```openhiatus-memory-read\n{"documentId":"day:2026-10-04"}\n```');
  await tick();
  assert.equal(f.workers[0].runs.length, 2);
  assert.equal(f.workers[0].runs[1].threadId, 'thread-1');
  assert.ok(f.workers[0].runs[1].text.includes('blaue Karten'));
  assert.equal(f.app.snapshot().jobs!.find(job => job.id === id)?.status, 'running');
  assert.ok(!JSON.stringify(f.app.snapshot().messages).includes('openhiatus-memory-read'));
  await f.app.send('Zusätzliche kurze Frage', 'question');
  assert.equal(f.dialog.runs.length, 2);
  f.workers[0].finish('Am vierten Oktober hatte das Projekt blaue Karten.');
  assert.equal(f.app.snapshot().jobs!.find(job => job.id === id)?.status, 'completed');
});

test('verified idle worker trees are released automatically; actual services and unknown process states stay retained', async () => {
  const f = fixture(); await accept(f, 'one');
  const idle = f.workers[0] as FakeAgent & { hasManagedWork(): Promise<boolean> };
  idle.hasManagedWork = async () => false;
  idle.finish(); await tick();
  assert.equal(f.app.snapshot().jobs![0].runtimeRetained, false);
  assert.equal(idle.disposals, 1);
  await accept(f, 'two');
  const service = f.workers[1] as FakeAgent & { hasManagedWork(): Promise<boolean> };
  service.hasManagedWork = async () => true;
  service.finish(); await tick();
  assert.equal(f.app.snapshot().jobs![1].runtimeRetained, true);
  assert.equal(service.disposals, 0);
  await accept(f, 'three');
  const uncertain = f.workers[2] as FakeAgent & { hasManagedWork(): Promise<boolean> };
  uncertain.hasManagedWork = async () => { throw new Error('Prüfung nicht bestätigt'); };
  uncertain.finish(); await tick();
  assert.equal(f.app.snapshot().jobs![2].runtimeRetained, true);
  assert.equal(uncertain.disposals, 0);
});

test('targeted stop interrupts immediately and finishes despite a hung idle inspection, preserving the other job', async () => {
  const f = fixture(); const id = await accept(f, 'one');
  const worker = f.workers[0] as FakeAgent & { hasManagedWork(): Promise<boolean> };
  let resolve!: (value: boolean) => void;
  worker.hasManagedWork = () => new Promise<boolean>(done => { resolve = done; });
  worker.finish(); await tick();
  const independent = await accept(f, 'two', ['C:\\two']);
  const stopping = f.app.stopJob(id);
  assert.equal(worker.stops, 1, 'model/desktop interruption must not wait for the query');
  const repeated = f.app.stopJob(id);
  const completed = await Promise.race([Promise.all([stopping, repeated]).then(() => true), tick().then(() => false)]);
  assert.equal(completed, true, 'a query-only inspection cannot delay a confirmed stop');
  assert.equal(worker.disposals, 1);
  assert.equal(f.app.snapshot().jobs![0].runtimeRetained, false);
  assert.equal(f.workers[1].stops, 0);
  assert.equal(f.app.snapshot().jobs!.find(job => job.id === independent)?.status, 'running');
  const cueCount = f.app.snapshot().speech!.length;
  worker.finish('Verspätetes Ergebnis.'); resolve(false); await tick();
  assert.equal(worker.disposals, 1, 'late inspection cannot dispose again');
  assert.equal(f.app.snapshot().speech!.length, cueCount);
});

test('targeted stop shares a disposal already started by automatic idle cleanup', async () => {
  const f = fixture(); const id = await accept(f, 'one');
  const worker = f.workers[0] as FakeAgent & { hasManagedWork(): Promise<boolean> };
  worker.hasManagedWork = async () => false;
  let release!: () => void;
  worker.dispose = async () => { worker.disposals++; await new Promise<void>(resolve => { release = resolve; }); };
  worker.finish(); await tick();
  assert.equal(worker.disposals, 1);
  const stopping = f.app.stopJob(id);
  assert.equal(worker.stops, 1);
  release(); await stopping; await tick();
  assert.equal(worker.disposals, 1);
  assert.equal(f.app.snapshot().jobs![0].status, 'completed');
  assert.equal(f.app.snapshot().jobs![0].runtimeRetained, false);
});

function historicalJob(index: number): BackgroundJob {
  return { id: `historical-job-${index}`, requestId: `historical-request-${index}`, title: `Aufgabe ${index}`, prompt: `Historischer Auftrag ${index}`,
    model: 'test-model', resources: ['C:\\history'], status: 'completed', result: `Historisches Ergebnis ${index}`,
    createdAt: '2026-10-06T12:00:00Z', updatedAt: '2026-10-06T12:01:00Z', runtimeRetained: false };
}

test('a full task history keeps recent state and conversation results, exposing pruned entries only as historical results', async () => {
  const initial = defaultState(); initial.jobs = Array.from({ length: 1000 }, (_, index) => historicalJob(index));
  initial.messages = [
    { id: 'historical-user', role: 'user', text: 'Der ursprüngliche Auftrag.', at: '2026-10-06T12:00:00Z' },
    { id: 'historical-result', role: 'assistant', jobId: initial.jobs[0].id, text: 'Das damalige Ergebnis.', at: '2026-10-06T12:01:00Z' },
  ];
  const f = fixture(initial); await accept(f, 'new-request');
  const snapshot = f.app.snapshot();
  assert.equal(snapshot.jobs!.length, 500);
  assert.equal(snapshot.jobs![0].id, 'historical-job-501');
  assert.ok(snapshot.jobs!.some(job => job.id === 'historical-job-999'));
  assert.deepEqual(snapshot.messages.slice(0, 2), initial.messages);
  assert.equal(f.saved().jobs!.length, 500);
  await f.app.send('Was war das damalige Ergebnis?', 'history-status');
  const answer = await f.app.dialogTool('status_task', { jobId: 'historical-job-0' }, new AbortController().signal);
  assert.equal(answer.success, true);
  assert.equal(response(answer).stateAvailable, false);
  assert.deepEqual(response(answer).jobs, []);
  assert.equal(response(answer).historicalResult.text, 'Das damalige Ergebnis.');
  assert.equal(f.workers.length, 1);
});

test('history pruning is atomic with admission, protects owned runtimes, and rejects retired duplicate requests', async () => {
  const jobs: BackgroundJob[] = [];
  const worker = new FakeAgent(); let failSave = false;
  let manager!: JobManager;
  manager = new JobManager(jobs, { createWorker(onEvent) { Object.defineProperty(worker, 'emit', { value: onEvent }); return worker; },
    persist() { if (failSave) throw new Error('Datenträger voll'); }, changed() {}, clean: text => text, onEvent() {}, onResult() {} });
  const request = { requestId: 'retained-request', title: 'Gehaltene Aufgabe', prompt: 'Auftrag', model: 'test-model', resources: ['C:\\retained'] };
  const retained = (await manager.enqueue(request)).job; await tick(); worker.finish();
  jobs.push(...Array.from({ length: 999 }, (_, index) => historicalJob(index)));
  const before = structuredClone(jobs);
  failSave = true;
  await assert.rejects(manager.enqueue({ ...request, requestId: 'new-request' }), /Datenträger voll/);
  assert.deepEqual(jobs, before, 'failed persistence restores every previous entry and its order');
  assert.equal(worker.runs.length, 1);
  failSave = false;
  await manager.enqueue({ ...request, requestId: 'new-request' });
  assert.equal(jobs.length, 500);
  assert.equal(jobs[0].id, retained.id, 'old completed runtime owners are never pruned');
  assert.equal(jobs[1].id, 'historical-job-501');
  await assert.rejects(manager.enqueue({ ...request, requestId: 'historical-request-0' }), /bereits bearbeitet/);
  await manager.dispose();
});

test('a correction declares additional resources and never redirects a running worker into another active project', async () => {
  const f = fixture(); const first = await accept(f, 'one', ['C:\\one']); await accept(f, 'two', ['C:\\two']);
  await f.app.send('Verwende für die erste Aufgabe das zweite Projekt', 'correction');
  const conflict = await f.app.dialogTool('steer_task', { jobId: first, instruction: 'Arbeite stattdessen im zweiten Projekt.', resources: ['C:\\two'] }, new AbortController().signal);
  assert.equal(conflict.success, false);
  assert.equal(f.workers[0].steering.length, 0);
  assert.deepEqual(f.app.snapshot().jobs![0].resources, ['C:\\one']);
  assert.equal(f.workers[1].stops, 0);
  f.workers[1].finish();
  const accepted = await f.app.dialogTool('steer_task', { jobId: first, instruction: 'Arbeite stattdessen im zweiten Projekt.', resources: ['C:\\two'] }, new AbortController().signal);
  assert.equal(accepted.success, true);
  assert.deepEqual(f.app.snapshot().jobs![0].resources, ['C:\\one', 'C:\\two']);
  assert.equal(f.workers[0].steering.length, 1);
});

test('queued workers receive the exact identity and model captured at admission despite later edits and new dialogue', async () => {
  const memory = new MemoryStore(mkdtempSync(join(tmpdir(), 'openhiatus-dialog-frozen-')));
  const f = fixture(defaultState(), memory);
  const core = () => memory.snapshot().documents.find(document => document.id === 'core')!;
  await accept(f, 'one', ['C:\\one']);
  await f.app.editMemory('core', 'Zum zweiten Auftrag gilt die Vorliebe Bernstein.', core().version);
  const second = await accept(f, 'two', ['C:\\one']);
  const admitted = f.saved().jobs!.find(job => job.id === second)!;
  assert.equal(admitted.status, 'queued');
  assert.ok(admitted.identityInstructions?.includes('Bernstein'));
  const frozen = admitted.identityInstructions;
  await f.app.editMemory('core', 'Für spätere Aufträge gilt die Vorliebe Silber.', core().version);
  f.app.handle({ type: 'models', models: [{ id: 'test-model', label: 'Alt' }, { id: 'new-model', label: 'Neu' }] });
  await f.app.savePreferences({ model: 'new-model' });
  await f.app.send('Neue Gesprächsnachricht', 'three');
  assert.ok(f.app.identityInstructions().includes('Silber'));
  f.workers[0].finish(); await tick();
  assert.equal(f.workers[1].jobAtCreation?.identityInstructions, frozen);
  assert.equal(f.workers[1].runs[0].model, 'test-model');
  assert.ok(f.saved().jobs!.find(job => job.id === second)?.identityInstructions?.includes('Bernstein'));
});

test('a job admitted after a mid-dialog identity edit captures a matching new identity/version while the dialog stays frozen', async () => {
  const memory = new MemoryStore(mkdtempSync(join(tmpdir(), 'openhiatus-dialog-admission-')));
  const f = fixture(defaultState(), memory);
  const core = () => memory.snapshot().documents.find(document => document.id === 'core')!;
  await f.app.send('Erstelle einen Vorliebenvorschlag', 'request');
  const frozenDialog = f.app.identityInstructions();
  await f.app.editMemory('core', 'Die neue Auftragsvorliebe ist Türkis.', core().version);
  const version = core().version;
  assert.equal(f.app.identityInstructions(), frozenDialog);
  const result = await f.app.dialogTool('start_task', args(), new AbortController().signal);
  assert.equal(result.success, true); await tick();
  const job = f.saved().jobs![0];
  assert.ok(job.identityInstructions?.includes('Türkis'));
  f.workers[0].finish('Bitte prüfe den Vorschlag.\n\n```openhiatus-memory-proposal\n'
    + JSON.stringify({ documentId: 'core', baseVersion: version, content: 'Bitte auf Deutsch mit Türkisbeispielen antworten.', reason: 'Gewünschte Vorliebe.' }) + '\n```');
  await tick();
  assert.equal(memory.snapshot().proposals[0]?.baseVersion, version);
  assert.equal(memory.snapshot().proposals[0]?.status, 'pending');
});

test('all active capabilities arrive automatically as frozen instructions and the generated file follows discovery updates', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'openhiatus-capability-integration-'));
  const f = fixture(defaultState(), undefined, profile);
  const skills = Array.from({ length: 39 }, (_, index) => ({ name: `fertigkeit-${index}`, description: `Bearbeitet Aufgabe Nummer ${index}. Liest dafür die Anleitung.`,
    path: `C:\\skills\\fertigkeit-${index}\\SKILL.md`, enabled: true, scope: 'user' as const }));
  let catalog = { skills, errors: [], directory: 'C:\\skills' };
  f.agent.listSkills = async () => structuredClone(catalog);
  await f.app.start();
  const overview = join(profile, 'Fähigkeiten von openhiatus.md');
  let file = readFileSync(overview, 'utf8');
  for (const skill of skills) {
    assert.ok(file.includes(skill.name));
    assert.ok(f.app.identityInstructions().includes(skill.name), 'the complete catalogue is supplied beyond the ranked prompt subset');
  }
  assert.ok(file.includes('STT → LLM → TTS'));
  const first = await accept(f, 'capability-first');
  const frozen = f.workers[0].jobAtCreation!.identityInstructions!;
  assert.ok(frozen.includes('fertigkeit-38'));
  await f.app.send('Welche Fähigkeiten hast du?', 'capability-question');
  const frozenDialog = f.app.identityInstructions();
  catalog = { ...catalog, skills: [...skills.map(skill => ({ ...skill, enabled: skill.name !== 'fertigkeit-38' })),
    { ...skills[0], name: 'neue-fertigkeit', path: 'C:\\skills\\neue-fertigkeit\\SKILL.md' }] };
  await f.app.listSkills();
  file = readFileSync(overview, 'utf8');
  assert.ok(!file.includes('fertigkeit-38'));
  assert.ok(file.includes('neue-fertigkeit'));
  assert.equal(f.app.identityInstructions(), frozenDialog, 'a running conversation keeps its accepted catalogue');
  assert.equal(f.saved().jobs!.find(job => job.id === first)!.identityInstructions, frozen);
  f.dialog.finish('Die verfügbaren Fähigkeiten stehen in der Übersicht.');
  assert.ok(f.app.identityInstructions().includes('neue-fertigkeit'));
  assert.ok(!f.app.identityInstructions().includes('fertigkeit-38'));
});

test('a capabilities-file write failure is reported while known skills remain available in the conversation', async () => {
  const f = fixture(defaultState(), undefined, 'kein-absoluter-Profilpfad');
  await f.app.start();
  assert.ok(f.app.snapshot().activity.some(item => item.title === 'Fähigkeitenübersicht konnte nicht aktualisiert werden'));
  assert.ok(f.app.identityInstructions().includes('test-skill'));
});

test('a resumed dialogue thread receives neither the history excerpt again nor unchanged job states', async () => {
  const f = fixture(); await f.app.start();
  const jobId = await accept(f, 'lean-1');
  assert.equal(f.dialog.runs[0].threadId, undefined);
  assert.equal(f.dialog.runs[0].options?.freshThreadContext, undefined, 'the very first message has no history or jobs yet');
  const next = async (text: string, id: string) => { await f.app.send(text, id); const run = f.dialog.runs.at(-1)!; f.dialog.finish('Antwort.'); await tick(); return run; };
  let run = await next('Zweite Frage', 'lean-2');
  assert.ok(run.threadId, 'the dialogue resumes its thread');
  assert.ok(run.options?.freshThreadContext?.includes('Gesprächsauszug'), 'history is offered only for a thread Codex would start anew');
  assert.equal(run.text.includes('Gesprächsauszug'), false);
  assert.match(run.text, /Seit deiner letzten Antwort geänderte Aufgabenstände/, 'the job is new since the last message');
  run = await next('Dritte Frage ohne Änderung', 'lean-3');
  assert.equal(run.text.includes('Aufgabenstände'), false, 'nothing changed since the last message');
  f.workers[0].finish('Das angeforderte Fenster wurde geöffnet und geprüft.'); await tick();
  run = await next('Vierte Frage nach Abschluss', 'lean-4');
  assert.match(run.text, /Seit deiner letzten Antwort geänderte Aufgabenstände/);
  assert.ok(run.text.includes(jobId));
  assert.equal(run.text.includes('Gesprächsauszug'), false);
});

test('dialogue context reports reach the snapshot without being saved, also between turns', async () => {
  const f = fixture(); await f.app.start();
  f.app.handleDialog({ type: 'context', threadId: 'dialog-thread', usedTokens: 42_000, windowTokens: 128_000 });
  const context = f.app.snapshot().context!;
  assert.deepEqual({ ...context, at: undefined }, { threadId: 'dialog-thread', usedTokens: 42_000, windowTokens: 128_000, at: undefined });
  assert.ok(!Number.isNaN(Date.parse(context.at)));
  const restarted = new AppController({ ...f.options });
  assert.equal(restarted.snapshot().context, undefined, 'the report is runtime state only');
});

test('a silver favourite reaches the instructions without its text, leads the skill context and starts a fresh thread', async () => {
  const f = fixture();
  const skills = Array.from({ length: 30 }, (_, index) => ({ name: `fertigkeit-${index}`, description: `Bearbeitet Aufgabe Nummer ${index}.`,
    path: `C:\\skills\\fertigkeit-${index}\\SKILL.md`, enabled: true, scope: 'user' as const }));
  f.agent.listSkills = async () => ({ skills, errors: [], directory: 'C:\\skills' });
  await f.app.start();
  assert.ok(!f.app.identityInstructions().includes('Favoriten-Skills'));
  await f.app.send('Erste Frage', 'favorite-before');
  f.dialog.finish('Antwort.'); await tick();
  assert.ok(f.app.snapshot().task.threadId, 'the dialogue has a thread before the change');
  await f.app.savePreferences({ skillFavorites: { 'C:\\skills\\fertigkeit-29\\SKILL.md': 'favorite' } });
  assert.equal(f.app.snapshot().task.threadId, undefined, 'new favourites need a fresh developer context');
  const instructions = f.app.identityInstructions();
  assert.match(instructions, /Favoriten-Skills/);
  assert.match(instructions, /"name":"fertigkeit-29"[^}]*bei Bedarf lesen/);
  assert.doesNotMatch(instructions, /Vollständig mitgegebene/);
  await f.app.send('Etwas ganz anderes ohne Bezug', 'favorite-after');
  const prompt = f.dialog.runs.at(-1)!.text;
  const skillList = prompt.slice(prompt.indexOf('Aktivierte Skills:'));
  assert.ok(skillList.indexOf('fertigkeit-29') < skillList.indexOf('fertigkeit-0'), 'the favourite leads the ranked skill context');
  await assert.rejects(f.app.savePreferences({ skillFavorites: { 'C:\\skills\\x\\SKILL.md': 'immer' } as never }));
});

test('model roles stay independent and a changed dialog model starts a fresh session after the running turn', async () => {
  const f = fixture();
  f.app.handle({ type: 'models', models: ['work', 'dialog-a', 'dialog-b', 'memory'].map(id => ({ id, label: id })) });
  await f.app.savePreferences({ model: 'work', dialogModel: 'dialog-a', memoryModel: 'memory' });
  await f.app.send('Erster Auftrag', 'role-first');
  assert.equal(f.dialog.runs[0].model, 'dialog-a');
  await f.app.savePreferences({ dialogModel: 'dialog-b' });
  const admitted = await f.app.dialogTool('start_task', args(), new AbortController().signal);
  assert.equal(admitted.success, true); await tick();
  assert.equal(f.workers[0].runs[0].model, 'work');
  f.dialog.finish();
  await f.app.send('Eine Rückfrage', 'role-second');
  assert.equal(f.dialog.runs[1].model, 'dialog-b'); assert.equal(f.dialog.runs[1].threadId, undefined);
  assert.equal(f.app.snapshot().preferences.memoryModel, 'memory');
  await assert.rejects(f.app.savePreferences({ dialogModel: 'unknown' }), /nicht verfügbar/);
  await f.app.stop();
});

test('parallel workers keep cumulative consumption separate from each other and the conversation', async () => {
  const f = fixture();
  const one = await accept(f, 'usage-one', ['C:\\one']); const two = await accept(f, 'usage-two', ['C:\\two']);
  const usage = (inputTokens: number, outputTokens: number, costUsd?: number) => ({ inputTokens, outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0, ...(costUsd === undefined ? {} : { costUsd }) });
  f.workers[0].emit({ type: 'usage', usage: usage(10, 2, 0.001) });
  f.workers[0].emit({ type: 'usage', usage: usage(20, 5, 0.002) });
  f.workers[1].emit({ type: 'usage', usage: usage(7, 3) });
  assert.deepEqual(f.app.snapshot().jobs!.find(job => job.id === one)!.usage, usage(20, 5, 0.002));
  assert.deepEqual(f.app.snapshot().jobs!.find(job => job.id === two)!.usage, usage(7, 3));
  assert.equal(f.app.snapshot().usage, undefined);
  await f.app.send('Statusfrage', 'usage-dialog');
  f.dialog.emit({ type: 'usage', usage: usage(4, 1) });
  assert.deepEqual(f.app.snapshot().usage, usage(4, 1));
  await f.app.dispose();
  assert.deepEqual(f.saved().jobs!.find(job => job.id === one)!.usage, usage(20, 5, 0.002));
  assert.deepEqual(f.saved().usage, usage(4, 1));
});
