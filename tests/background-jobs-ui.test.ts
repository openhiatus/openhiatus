import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BackgroundJobs } from '../src/renderer/BackgroundJobs';
import type { BackgroundJob } from '../src/shared/contracts';

const fixture: BackgroundJob = {
  id: 'job', requestId: 'request', title: 'Projekt prüfen', prompt: 'Prüfe mein Projekt.', status: 'running',
  createdAt: '2026-10-20T12:00:00Z', updatedAt: '2026-10-20T12:00:00Z', model: 'openai/test-model', resources: [],
};
const render = (job: BackgroundJob, open = true) => renderToStaticMarkup(createElement(BackgroundJobs, {
  jobs: [job], onStop: async () => {}, onError: () => {}, open, onToggle: () => {},
}));

test('active jobs expose an individual stop action; stopping disables duplicate requests', () => {
  assert.match(render(fixture), /Auftrag stoppen: Projekt prüfen/);
  assert.doesNotMatch(render(fixture).match(/<button[^>]*aria-label="Auftrag stoppen:[^>]*>/)![0], /disabled/);
  assert.match(render({ ...fixture, status: 'stopping' }).match(/<button[^>]*aria-label="Auftrag stoppen:[^>]*>/)![0], /disabled/);
});

test('a retained session remains stoppable after a result; finished sessions do not', () => {
  const retained = render({ ...fixture, status: 'completed', runtimeRetained: true });
  assert.match(retained, /Ergebnis liegt vor · Sitzung noch offen/);
  assert.match(retained, /Auftrag stoppen/);
  const completed = render({ ...fixture, status: 'completed' });
  assert.match(completed, /Fertig/);
  assert.doesNotMatch(completed, /Auftrag stoppen/);
});

test('collapsed jobs retain active counts and failures are visible when expanded', () => {
  const collapsed = render(fixture, false);
  assert.match(collapsed, /1 aktiv/);
  assert.doesNotMatch(collapsed, /<li/);
  const failed = render({ ...fixture, status: 'failed', error: 'Server nicht erreichbar' });
  assert.match(failed, /Server nicht erreichbar/);
  assert.match(failed, /Rückmeldung nötig/);
});

test('reported tokens include cached usage and unknown model prices never become a zero cost claim', () => {
  const usage = { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 300, cacheWriteTokens: 100 };
  const unknown = render({ ...fixture, usage });
  assert.match(unknown, /1\.600 Token · Preis nicht verfügbar/);
  assert.doesNotMatch(unknown, /USD/);
  const known = render({ ...fixture, usage: { ...usage, costUsd: 0.001234 } });
  assert.match(known, /Schätzkosten 0,001234 USD/);
});

test('ChatGPT model usage is attributed to the plan instead of presenting API prices', () => {
  const html = render({ ...fixture, model: 'chatgpt/account-model', usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.012 } });
  assert.match(html, /120 Token · ChatGPT-Kontingent/);
  assert.doesNotMatch(html, /USD|Schätzkosten|Preis nicht verfügbar/);
});
