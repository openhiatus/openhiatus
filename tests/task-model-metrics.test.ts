import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BackgroundJobView, ModelRequestSummary } from '../src/shared/contracts';
import { TasksView } from '../src/renderer/features/tasks';

const job: BackgroundJobView = { id: 'synthetic-job', requestId: 'synthetic-request', title: 'Synthetischer Auftrag', prompt: 'UI prüfen', status: 'completed',
  createdAt: '2026-10-23T12:00:00Z', updatedAt: '2026-10-23T12:01:00Z', model: 'synthetic/planner', resources: [] };
const measurement: ModelRequestSummary = { role: 'computer', model: 'synthetic/vision', requestedServiceTier: 'fast', actualServiceTier: 'default',
  requests: 7, completed: 4, failed: 2, aborted: 1, elapsedMs: 123456, usage: { inputTokens: 1234, outputTokens: 56, cacheReadTokens: 7890, cacheWriteTokens: 12 } };
function render(patch: Partial<BackgroundJobView>): string {
  return renderToStaticMarkup(createElement(TasksView, { jobs: [{ ...job, ...patch }],
    onStop: async () => assert.fail('Rendering must not stop a task'), onError: () => assert.fail('Rendering must not start operations') }));
}

test('old tasks have no empty measurements disclosure and measured tasks keep it initially closed', () => {
  assert.doesNotMatch(render({}), /tasks-model-metrics/);
  const html = render({ modelRequests: [measurement] });
  assert.match(html, /<details class="tasks-stored-context tasks-model-metrics"><summary>Modelle &amp; Messwerte/);
  assert.doesNotMatch(html, /tasks-model-metrics" open/);
});

test('request metrics keep roles, returned tiers, request duration and all token classes distinct', () => {
  const html = render({ modelRequests: [{ ...measurement, role: 'worker', model: 'synthetic/planner', requestedServiceTier: undefined, actualServiceTier: undefined, usage: undefined }, measurement] });
  assert.match(html, /Arbeit · synthetic\/planner/); assert.match(html, /Computer · synthetic\/vision/);
  assert.match(html, /Service-Stufe angefordert<\/dt><dd>Fast<\/dd>/);
  assert.match(html, /Service-Stufe gemeldet<\/dt><dd>default<\/dd>/);
  assert.match(html, /Service-Stufe gemeldet<\/dt><dd>nicht gemeldet<\/dd>/);
  assert.match(html, /Service-Stufe angefordert<\/dt><dd>Keine Vorgabe<\/dd>/);
  assert.match(html, /Anfragen<\/dt><dd>7<\/dd>/);
  assert.match(html, /Modellzeit \(Summe\)<\/dt><dd>123,5 s<\/dd>/);
  assert.match(html, /Fehlgeschlagen<\/dt><dd>2<\/dd>/); assert.match(html, /Abgebrochen<\/dt><dd>1<\/dd>/);
  assert.match(html, /Eingabe ohne Cache<\/dt><dd>1.234<\/dd>/); assert.match(html, /Ausgabe<\/dt><dd>56<\/dd>/);
  assert.match(html, /Cache gelesen<\/dt><dd>7.890<\/dd>/); assert.match(html, /Cache geschrieben<\/dt><dd>12<\/dd>/);
  assert.match(html, /Tokenverbrauch nicht gemeldet/);
  assert.doesNotMatch(html, /Gesamt-Wandzeit|Gesamtlaufzeit|USD/);
});

test('frozen computer configuration remains visible without metrics and direct tasks do not claim Fast requests', () => {
  const computer = { delegationEnabled: true, model: 'synthetic/vision', fast: true, overviewScaleDivisor: 16 };
  const html = render({ computer });
  assert.match(html, /Getrenntes Computer-Modell/); assert.match(html, /Computer-Modell<\/dt><dd>synthetic\/vision/);
  assert.match(html, /Fast angefordert<\/dt><dd>Ja/); assert.match(html, /Bildschirmübersicht<\/dt><dd>1:16/);
  assert.doesNotMatch(html, /Service-Stufe gemeldet|Modellzeit/);
  const direct = render({ computer: { ...computer, delegationEnabled: false } });
  assert.match(direct, /Computerbedienung<\/dt><dd>Arbeitsmodell/);
  assert.doesNotMatch(direct, /Fast angefordert/);
});

test('model names and provider service tiers render as inert text', () => {
  const html = render({ modelRequests: [{ ...measurement, model: '<script>model</script>', actualServiceTier: '<img onerror=bad>' }] });
  assert.match(html, /&lt;script&gt;model&lt;\/script&gt;/); assert.match(html, /&lt;img onerror=bad&gt;/);
  assert.doesNotMatch(html, /<script>|<img onerror/);
});
