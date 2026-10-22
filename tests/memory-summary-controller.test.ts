import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppController } from '../src/main/controller';
import { MemoryStore } from '../src/main/memory';
import { defaultState } from '../src/main/storage';
import type { SummaryCallEvidence } from '../src/main/memory-summarizer';

const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(check: () => boolean) { for (let i = 0; i < 100 && !check(); i++) await tick(); assert.ok(check()); }
function fixture(t: any) {
  const directory = mkdtempSync(join(tmpdir(), 'openhiatus-semantic-controller-'));
  const memory = new MemoryStore(directory);
  memory.capture([{ id: 'old-user', role: 'user', at: '2026-10-01T12:00:00.000Z', text: 'Bitte erstelle einen Plan für Morgenrot.' },
    { id: 'old-answer', role: 'assistant', at: '2026-10-01T12:01:00.000Z', text: 'Die Datei plan.md wurde erstellt.' }], 'historic-demo');
  let stops = 0; let starts = 0;
  const calls: Array<{ text: string; model: string; thread?: string; purpose?: string; signal?: AbortSignal; evidence?: SummaryCallEvidence }> = [];
  let complete = async (_text: string, _signal: AbortSignal): Promise<string> => new Promise(() => {});
  let run = async (_text: string) => {};
  let saved = defaultState(); saved.preferences.memoryAutoSummarize = false; saved.preferences.fullAccessAcknowledged = true;
  const app = new AppController({ memory, store: { load: () => saved, save: value => { saved = structuredClone(value); } },
    credentials: { get() { return undefined; }, set() {}, remove() {} },
    speech: { async test() { return { base64: '', mimeType: '' }; }, async synthesize() { throw new Error('Summary may not synthesize speech'); }, async transcribe() { return ''; } },
    agent: { async start() { starts++; }, async run(text, model, thread) { calls.push({ text, model, thread }); await run(text); },
      async stop() { stops++; }, async dispose() {} },
    modelClient: { async complete(text, model, signal, evidence) { calls.push({ text, model, signal, evidence, purpose: 'summary' }); return complete(text, signal); } },
    workspace: 'C:\\demo', publish() {},
  });
  app.handle({ type: 'connection', status: 'ready' }); app.handle({ type: 'models', models: [{ id: 'chosen-model', label: 'Chosen' }, { id: 'memory-model', label: 'Memory' }] });
  t.after(async () => { await app.dispose(); rmSync(directory, { recursive: true, force: true, maxRetries: 3 }); });
  return { app, memory, calls, stops: () => stops, starts: () => starts,
    setComplete: (fn: typeof complete) => { complete = fn; }, setRun: (fn: typeof run) => { run = fn; } };
}
function summary(prompt: string) {
  const category = /Zulässige Kategorien: ([a-z]+)/.exec(prompt)![1];
  return JSON.stringify({ items: [{ category, text: category === 'activity' ? 'Ein Plan für Morgenrot wurde angefragt.' : 'Die Arbeit konzentrierte sich auf die Planung von Morgenrot.', sourceIds: ['old-user'] }] });
}

test('semantic reports use the selected memory model directly without any agent, tools or chat pollution', async t => {
  const f = fixture(t); await f.app.savePreferences({ memoryModel: 'memory-model' });
  f.setComplete(async text => summary(text));
  await f.app.startMemorySummary(); await until(() => f.app.snapshot().summary?.status === 'completed');
  const state = f.app.snapshot();
  assert.deepEqual(state.messages, []); assert.equal(state.task.status, 'idle');
  assert.equal(state.summary?.completed, 3); assert.equal(state.summary?.calls, 3);
  assert.ok(f.calls.every(call => call.purpose === 'summary' && call.model === 'memory-model' && call.evidence!.sourceIds.includes('old-user')));
  assert.equal(f.starts(), 0); assert.equal(f.stops(), 0);
  assert.equal(f.memory.snapshot().documents.filter(doc => doc.summary?.method === 'ai').length, 3);
});

test('Stop aborts the model signal and late report results cannot change memory', async t => {
  const f = fixture(t); const original = f.memory.snapshot().documents.find(doc => doc.kind === 'day')!.content;
  let resolve!: (value: string) => void;
  f.setComplete(async () => new Promise(done => { resolve = done; }));
  await f.app.startMemorySummary(); await until(() => f.calls.length === 1);
  await f.app.stop(); assert.equal(f.calls[0].signal!.aborted, true);
  assert.equal(f.app.snapshot().summary?.status, 'interrupted');
  resolve(summary(f.calls[0].text)); await tick();
  assert.equal(f.calls.length, 1); assert.equal(f.memory.snapshot().documents.find(doc => doc.kind === 'day')!.content, original);
});

test('user work preempts automatic reports without stopping or reconnecting its agent runtime', async t => {
  const f = fixture(t);
  await f.app.startMemorySummary('auto'); await until(() => f.calls.length === 1);
  await f.app.send('Jetzt eine echte Nutzeraufgabe.', 'foreground');
  assert.equal(f.calls[0].signal!.aborted, true);
  assert.equal(f.stops(), 0); assert.equal(f.starts(), 0); assert.equal(f.calls[1].purpose, undefined);
  assert.equal(f.app.snapshot().task.status, 'running');
  await assert.rejects(f.app.startMemorySummary(), /laufenden Auftrag/);
});

test('failed direct reports preserve the completed task and never stop retained work', async t => {
  const f = fixture(t); await f.app.send('Starte ein Programm.', 'application');
  f.app.handle({ type: 'completed', status: 'completed', text: 'Programm gestartet.' });
  f.setComplete(async () => { throw new Error('Modell nicht erreichbar'); });
  await f.app.startMemorySummary(); await until(() => f.app.snapshot().summary?.status === 'failed');
  assert.equal(f.stops(), 0); assert.equal(f.app.snapshot().task.status, 'completed');
  assert.equal(f.app.snapshot().messages.at(-1)?.text, 'Programm gestartet.');
});

test('agent archive paging keeps one user task, freezes identity and hides read protocol from chat', async t => {
  const f = fixture(t); await f.app.send('Was geschah am 1. Oktober 2026?', 'date-query');
  f.app.handle({ type: 'started', threadId: 'conversation-thread', turnId: 'first' });
  const before = f.app.identityInstructions();
  const core = (await f.app.memorySnapshot()).documents.find(doc => doc.id === 'core')!;
  await f.app.editMemory('core', 'Eine erst später geltende Vorliebe.', core.version);
  f.app.handle({ type: 'completed', status: 'completed', text: '```openhiatus-memory-read\n{"documentId":"day:2026-10-01"}\n```' });
  await until(() => f.calls.length === 2);
  assert.equal(f.app.snapshot().task.status, 'running'); assert.equal(f.calls[1].thread, 'conversation-thread');
  assert.match(f.calls[1].text, /plan.md wurde erstellt/); assert.equal(f.app.identityInstructions(), before);
  assert.equal(f.app.snapshot().messages.length, 2); assert.equal(f.app.snapshot().messages[1].text, '');
  f.app.handle({ type: 'completed', status: 'completed', text: 'Am 1. Oktober wurde ein Plan für Morgenrot erstellt.' });
  assert.equal(f.app.snapshot().task.status, 'completed'); assert.equal(f.app.snapshot().messages.length, 2);
  assert.ok(!JSON.stringify(f.app.snapshot().messages).includes('openhiatus-memory-read'));
});

test('archive paging never truncates quote/control-heavy data with a maximum user prompt', async t => {
  const f = fixture(t); const pageText = 'BEGINN' + '"\\\u0001'.repeat(3100) + 'ENDE';
  f.memory.readPeriod = () => ({ found: true, documentId: 'day:2026-10-01', text: pageText, sourceIds: ['old-user'], sourceCount: 1, offset: 0, totalBytes: Buffer.byteLength(pageText), nextCursor: 'test-cursor' });
  await f.app.send('Q'.repeat(12000), 'long-query');
  f.app.handle({ type: 'completed', status: 'completed', text: '```openhiatus-memory-read\n{"documentId":"day:2026-10-01"}\n```' });
  await until(() => f.calls.length === 2);
  assert.ok(f.calls[1].text.includes(pageText)); assert.ok(f.calls[1].text.length < 32000); assert.match(f.calls[1].text, /test-cursor/);
});

test('Stop between requested archive page and followup submission prevents the extra turn', async t => {
  const f = fixture(t); await f.app.send('Lies den Tagesbericht.', 'read-and-stop');
  f.app.handle({ type: 'completed', status: 'completed', text: '```openhiatus-memory-read\n{"documentId":"day:2026-10-01"}\n```' });
  await f.app.stop(); await tick();
  assert.equal(f.calls.length, 1); assert.equal(f.app.snapshot().task.status, 'interrupted');
});

test('asking about today does not invalidate the continuation cursor offered to the agent', async t => {
  const f = fixture(t);
  const now = new Date();
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(now);
  f.memory.capture([{ id: 'today-before-question', role: 'user', at: now.toISOString(), text: 'Heutige Notiz mit Originalquellen.' }], 'earlier-today');
  await f.app.send(`Was ist am ${day} passiert?`, 'today-question');
  const match = /openhiatus-memory-read (\{[^\n]+\})/.exec(f.calls[0].text);
  assert.ok(match, 'targeted retrieval must offer an original-source continuation');
  const request = JSON.parse(match[1]);
  f.app.handle({ type: 'completed', status: 'completed', text: `\`\`\`openhiatus-memory-read\n${JSON.stringify(request)}\n\`\`\`` });
  await until(() => f.calls.length === 2);
  assert.match(f.calls[1].text, /Heutige Notiz/);
  assert.equal(f.app.snapshot().task.status, 'running');
  assert.ok(!f.app.snapshot().activity.some(row => row.title === 'Archivanfrage beendet'));
});
