import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SettingsView, type SettingsViewProps } from '../src/renderer/features/settings';
import { snapshotFixture } from './ipc-fixtures';

function render(divisor?: number, ready = true): string {
  const state = snapshotFixture();
  if (divisor !== undefined) state.preferences.computerOverviewScaleDivisor = divisor;
  const unexpected = () => assert.fail('Rendering settings must not start an operation');
  const props: SettingsViewProps = { state: ready ? state : undefined, workBusy: false, summaryInProgress: false,
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
  assert.deepEqual([...card.matchAll(/<option value="([^"]+)"/g)].map(match => match[1]), ['1', '4', '8', '16', '32']);
  assert.match(card, /höchstens einen Detailausschnitt in Originalauflösung/);
  assert.match(card, /automatisch an die Bildschirmauflösung/); assert.match(card, /garantiert keine schnellere Bearbeitung/);
  assert.match(card, /aria-describedby="[^"]+-computer-overview-description"/);
});

test('computer overview settings preserve saved presets and a supported custom current factor', () => {
  assert.match(render(16), /value="16" selected="">Übersicht 1:16/);
  assert.match(render(2.5), /value="2.5" selected="">Übersicht 1:2.5 \(aktuell\)/);
  assert.match(render(undefined, false), /<select[^>]*-computer-overview"[^>]*disabled=""/);
});
