import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SettingsView, type SettingsViewProps } from '../src/renderer/features/settings';
import { snapshotFixture } from './ipc-fixtures';
import type { PreferencesPatch, ModelOption } from '../src/shared/contracts';

function render(divisor?: number, ready = true, preferences: PreferencesPatch = {}, models: ModelOption[] = [], busy = false): string {
  const state = snapshotFixture();
  if (divisor !== undefined) state.preferences.computerOverviewScaleDivisor = divisor;
  Object.assign(state.preferences, preferences); state.models = models;
  const unexpected = () => assert.fail('Rendering settings must not start an operation');
  const props: SettingsViewProps = { state: ready ? state : undefined, workBusy: busy, summaryInProgress: false,
    onPreference: unexpected, onError: unexpected, onNotice: unexpected,
    voice: { phase: 'idle', seconds: 0, devices: [], audioBusy: false, speechReady: false,
      startRecording: async () => unexpected(), testSpeech: async () => unexpected(), cancelAudio: unexpected, clearSpeech: unexpected, stopEarcons: unexpected,
      saveSpeechKey: async () => unexpected(), removeSpeechKey: async () => unexpected() } };
  return renderToStaticMarkup(createElement(SettingsView, props));
}

test('computer overview settings default to full screen and offer only the experiment factors', () => {
  const html = render(), card = html.slice(html.indexOf('settings-card settings-computer'), html.indexOf('settings-card settings-shortcuts'));
  assert.match(card, /Experimentell/); assert.match(card, /nächsten Desktop-Auftrag/);
  assert.match(card, /value="1" selected="">Vollbild \(1:1\)/);
  const overview = card.match(/<select[^>]*-computer-overview"[^>]*>.*?<\/select>/)?.[0] ?? '';
  assert.deepEqual([...overview.matchAll(/<option value="([^"]+)"/g)].map(match => match[1]), ['1', '4', '8', '16', '32']);
  assert.match(card, /höchstens einen Detailausschnitt/);
  assert.match(card, /automatisch an die Bildschirmauflösung/); assert.match(card, /garantiert keine schnellere Bearbeitung/);
  assert.match(card, /aria-describedby="[^"]+-computer-overview-description"/);
});

test('detail scale and image retention default to unchanged behavior and remain independent of the computer role', () => {
  const html = render(), detail = html.match(/<select[^>]*-computer-detail"[^>]*>.*?<\/select>/)?.[0] ?? '';
  const retention = html.match(/<select[^>]*-computer-image-retention"[^>]*>.*?<\/select>/)?.[0] ?? '';
  assert.deepEqual([...detail.matchAll(/<option value="([^"]+)"/g)].map(match => match[1]), ['1', '2', '4']);
  assert.match(detail, /value="1" selected="">Original \(1:1\)/);
  assert.deepEqual([...retention.matchAll(/<option value="([^"]+)"/g)].map(match => match[1]), ['0', '1', '2', '3', '5', '10']);
  assert.match(retention, /value="0" selected="">Unbegrenzt/);
  assert.doesNotMatch(detail, /disabled=""/); assert.doesNotMatch(retention, /disabled=""/);
  assert.match(html, /Breite und Höhe.*halbiert/); assert.match(html, /Originalausschnitte bleiben auf Abruf verfügbar/);
  assert.match(html, /Zählt Modellanfragen, keine Klicks/); assert.match(html, /wichtige Beobachtungen kurz im Text festhalten/);
  assert.match(html, /auch ohne eigenes Computer-Modell/);
  const selected = render(16, true, { computerDetailScaleDivisor: 2, computerImageRetentionCalls: 3 });
  assert.match(selected, /value="2" selected="">Details 1:2/);
  assert.match(selected, /value="3" selected="">Letzte 3 Modellanfragen/);
  assert.match(render(16, true, { computerImageRetentionCalls: 4 }), /value="4" selected="">Letzte 4 Modellanfragen \(aktuell\)/);
  const unavailable = render(undefined, false);
  assert.match(unavailable, /<select[^>]*-computer-detail"[^>]*disabled=""/);
  assert.match(unavailable, /<select[^>]*-computer-image-retention"[^>]*disabled=""/);
});

test('the separate computer model is opt-in with Fast enabled and cannot be enabled without a configured model', () => {
  const html = render();
  const delegation = html.match(/<label class="settings-toggle"><span><strong>Eigenes Computer-Modell verwenden.*?<\/label>/)?.[0] ?? '';
  const fast = html.match(/<label class="settings-toggle"><span><strong>Fast für das Computer-Modell.*?<\/label>/)?.[0] ?? '';
  assert.match(delegation, /<input[^>]*disabled=""/);
  assert.doesNotMatch(delegation, /<input[^>]*checked=""/);
  assert.match(fast, /<input[^>]*disabled=""[^>]*checked=""/);
  assert.match(html, /Das Arbeitsmodell plant und prüft/);
  assert.match(html, /Ohne Aktivierung bedient das Arbeitsmodell den Computer/);
  assert.match(html, /höhere Kosten entstehen/);
});

test('computer settings retain the independently selected model and disable role changes during work', () => {
  const models = [{ id: 'work/sol', label: 'Sol' }, { id: 'computer/luna', label: 'Luna' }];
  const preferences = { model: 'work/sol', computerModel: 'computer/luna', computerDelegationEnabled: true, computerFast: false };
  const html = render(16, true, preferences, models);
  assert.match(html, /Eigenes Computer-Modell verwenden<\/strong>.*?<input[^>]*checked=""/);
  assert.match(html, /value="computer\/luna" selected="">Luna/);
  assert.doesNotMatch(html, /Fast für das Computer-Modell<\/strong>.*?<input[^>]*checked=""/);
  assert.match(render(16, true, preferences, models, true), /<select[^>]*-computer-model"[^>]*disabled=""/);
  assert.match(render(16, true, { computerModel: 'missing/luna' }, models), /missing\/luna – nicht verfügbar/);
});

test('computer overview settings preserve saved presets and a supported custom current factor', () => {
  assert.match(render(16), /value="16" selected="">Übersicht 1:16/);
  assert.match(render(2.5), /value="2.5" selected="">Übersicht 1:2.5 \(aktuell\)/);
  assert.match(render(undefined, false), /<select[^>]*-computer-overview"[^>]*disabled=""/);
});
