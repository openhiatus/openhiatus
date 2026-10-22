import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BackgroundJobView } from '../src/shared/contracts';
import { TasksView } from '../src/renderer/features/tasks';
import { taskIsActive, taskStatusLabel, tasksForFilter, taskUsageLabel } from '../src/renderer/features/tasks/presentation';
import { TaskStopActions } from '../src/renderer/features/tasks/stop-actions';

const fixture: BackgroundJobView = {
  id: 'opaque-job', requestId: 'request', title: 'Projekt prüfen', prompt: 'Prüfe das Projekt und dokumentiere das Ergebnis.', status: 'running',
  createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:04:00Z', model: 'openai/test-model', resources: ['computer', 'project:example'],
};
const render = (jobs: readonly BackgroundJobView[]) => renderToStaticMarkup(createElement(TasksView, { jobs, onStop: async () => {}, onError: () => {} }));

test('the task view includes every persisted job, including older finished results', () => {
  const jobs = Array.from({ length: 21 }, (_, index): BackgroundJobView => ({ ...fixture, id: `job-${index}`, title: `Aufgabe Nummer ${index}`, status: 'completed', createdAt: `2026-10-${String(index + 1).padStart(2, '0')}T12:00:00Z` }));
  const html = render(jobs);
  assert.equal((html.match(/data-job-id=/g) || []).length, jobs.length);
  for (const job of jobs) assert.ok(html.includes(`data-job-id="${job.id}"`));
  assert.match(html, /21 gespeicherte Aufgaben/);
  assert.match(html, /Aufgaben nach Status filtern/);
});

test('status filters reflect lifecycle and keep completed retained sessions both active and discoverable as results', () => {
  const jobs: BackgroundJobView[] = [
    { ...fixture, id: 'queued', status: 'queued' }, { ...fixture, id: 'running', status: 'running' }, { ...fixture, id: 'stopping', status: 'stopping' },
    { ...fixture, id: 'result', status: 'completed' }, { ...fixture, id: 'retained', status: 'completed', runtimeRetained: true },
    { ...fixture, id: 'interrupted', status: 'interrupted' }, { ...fixture, id: 'failed', status: 'failed' },
  ];
  assert.deepEqual(new Set(tasksForFilter(jobs, 'active').map(job => job.id)), new Set(['queued', 'running', 'stopping', 'retained']));
  assert.deepEqual(new Set(tasksForFilter(jobs, 'completed').map(job => job.id)), new Set(['result', 'retained']));
  assert.deepEqual(tasksForFilter(jobs, 'interrupted').map(job => job.id), ['interrupted']);
  assert.deepEqual(tasksForFilter(jobs, 'failed').map(job => job.id), ['failed']);
  assert.equal(tasksForFilter(jobs, 'all').length, 7);
  assert.equal(taskIsActive(jobs.find(job => job.id === 'retained')!), true);
});

test('ordering never mutates incoming snapshots and IDs remain opaque across replacement objects', () => {
  const older = { ...fixture, id: 'not-a-number/[]:#', status: 'completed' as const, createdAt: '2026-10-01T00:00:00Z' };
  const newer = { ...fixture, id: 'new-result', status: 'completed' as const, createdAt: '2026-10-20T00:00:00Z' };
  const active = { ...fixture, id: 'running', createdAt: '2026-09-01T00:00:00Z' };
  const jobs = Object.freeze([older, newer, active]);
  const sorted = tasksForFilter(jobs, 'all'); assert.deepEqual(sorted.map(job => job.id), ['running', 'new-result', older.id]);
  assert.deepEqual(jobs.map(job => job.id), [older.id, newer.id, 'running']);
  const replacement = jobs.map(job => ({ ...job, resources: [...job.resources] }));
  assert.deepEqual(tasksForFilter(replacement, 'all').map(job => job.id), sorted.map(job => job.id));
});

test('details prioritize the result and preserve complete assembled context in a closed disclosure', () => {
  const prompt = '[Identität]\nSynthetischer Kern\n[Historie]\nFrüherer Austausch\nVollständiger Nutzerauftrag:\n' + fixture.prompt;
  const html = render([{ ...fixture, prompt, status: 'completed', result: 'Das überprüfte Ergebnis.', usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 300, cacheWriteTokens: 100 } }]);
  for (const expected of ['Gespeicherter Auftragskontext', prompt, 'Das überprüfte Ergebnis.', 'Auftragsdetails', 'Erstellt', 'Aktualisiert', fixture.model, 'project:example', 'Eingabe', 'Ausgabe', 'Cache gelesen', 'Cache geschrieben', '1.600 Token']) assert.ok(html.includes(expected), expected);
  assert.ok(html.indexOf('Das überprüfte Ergebnis.') < html.indexOf('Auftragsdetails'));
  assert.ok(html.indexOf('Auftragsdetails') < html.indexOf('Gespeicherter Auftragskontext'));
  assert.match(html, /<details class="tasks-stored-context"><summary>/); assert.doesNotMatch(html, /Originalauftrag/);
  assert.match(html, /dateTime="2026-10-20T12:00:00Z"|datetime="2026-10-20T12:00:00Z"/);
  assert.match(html, /Preis nicht verfügbar/); assert.doesNotMatch(html, /USD/);
  assert.doesNotMatch(html, /Auftrag stoppen:/);
});

test('incomplete and failed jobs retain partial results and present their actual failure', () => {
  const html = render([{ ...fixture, status: 'failed', result: 'Bereits erstellter Teilbericht.', error: 'Der Testserver antwortet nicht.' }]);
  assert.match(html, /Vorhandenes Teilergebnis/); assert.match(html, /Bereits erstellter Teilbericht\./);
  assert.match(html, /Fehlermeldung/); assert.match(html, /Der Testserver antwortet nicht\./);
  assert.match(html, /Fehlgeschlagen/); assert.match(html, /Verbrauch noch nicht gemeldet/);
});

test('retained completed sessions stay individually stoppable and stopping is visibly disabled', () => {
  const retained = { ...fixture, status: 'completed' as const, runtimeRetained: true, result: 'Ergebnis vorhanden' };
  const html = render([retained]); assert.match(html, /Ergebnis da · Sitzung offen/); assert.match(html, /Auftrag stoppen: Projekt prüfen/);
  assert.match(taskStatusLabel(retained), /Sitzung offen/);
  const stopping = render([{ ...fixture, status: 'stopping' }]);
  const buttons = stopping.match(/<button[^>]*aria-label="Auftrag stoppen:[^>]*>/g) || [];
  assert.ok(buttons.length > 0); assert.ok(buttons.every(button => button.includes('disabled')));
});

test('safe shared result rendering keeps HTML and executable links inert while preserving file actions', () => {
  const html = render([{ ...fixture, status: 'completed', result: '<script>alert("x")</script> [Bericht](C:/synthetic/report.txt) [böse](javascript:alert(1))' }]);
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<a ')); assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes('&lt;script&gt;')); assert.match(html, /message-file-link/); assert.match(html, /Bericht/);
});

test('rendering and empty states trigger neither stops, navigation nor new jobs', () => {
  let sideEffects = 0;
  const html = renderToStaticMarkup(createElement(TasksView, { jobs: [], onStop: async () => { sideEffects++; }, onError: () => { sideEffects++; }, onConversation: () => { sideEffects++; } }));
  assert.match(html, /Noch keine Aufgaben/); assert.match(html, /Zum Gespräch/); assert.equal(sideEffects, 0);
});

test('ChatGPT usage names the plan, API prices stay explicit and unmeasured usage is never zero', () => {
  const usage = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 10, costUsd: 0.012 };
  assert.equal(taskUsageLabel({ ...fixture, model: 'chatgpt/test', usage }), '160 Token · ChatGPT-Kontingent');
  assert.match(taskUsageLabel({ ...fixture, usage }), /Schätzkosten 0,0120 USD/);
  assert.equal(taskUsageLabel(fixture), 'Verbrauch noch nicht gemeldet');
});

test('synchronous stop locks deduplicate rapid list/detail requests across changed callbacks while other jobs remain stoppable', async () => {
  const events: string[][] = [], requests: string[] = [], pending = new Map<string, () => void>();
  const actions = new TaskStopActions(ids => events.push([...ids]));
  const request = (id: string) => { requests.push(id); return new Promise<void>(done => pending.set(id, done)); };
  const unexpected = (error: unknown) => assert.fail(error instanceof Error ? error : String(error));
  const first = actions.stop('opaque-id', request, unexpected);
  const duplicate = actions.stop('opaque-id', async () => assert.fail('Replacement snapshot callback must not run twice'), unexpected);
  const another = actions.stop('other-id', request, unexpected);
  assert.deepEqual(requests, ['opaque-id', 'other-id']); assert.deepEqual(events, [['opaque-id'], ['opaque-id', 'other-id']]);
  pending.get('opaque-id')!(); await first; await duplicate; assert.deepEqual(events.at(-1), ['other-id']);
  pending.get('other-id')!(); await another; assert.deepEqual(events.at(-1), []);
  assert.deepEqual(events[0], ['opaque-id']);
});

test('a failed stop reports once and releases its lock for an explicit user retry', async () => {
  const errors: unknown[] = [], actions = new TaskStopActions(() => {}), failure = new Error('Synthetic stop failure');
  let attempts = 0;
  await actions.stop('job', async () => { attempts++; throw failure; }, error => errors.push(error));
  await actions.stop('job', async () => { attempts++; }, error => errors.push(error));
  assert.equal(attempts, 2); assert.deepEqual(errors, [failure]);
});
