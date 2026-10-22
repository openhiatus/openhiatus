import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SettingsView, type SettingsViewProps } from '../src/renderer/features/settings';
import { defaultState } from '../src/main/storage';
import type { Snapshot } from '../src/shared/contracts';

function fixture() {
  const invoked: string[] = [];
  const state: Snapshot = { ...defaultState(), models: [], providers: [], workspace: 'synthetic-settings', version: 'synthetic',
    connections: { agent: 'missing', account: '', speech: 'saved' } };
  const device = (deviceId: string, label: string, kind: MediaDeviceKind) => ({ deviceId, label, kind, groupId: '', toJSON() { return {}; } });
  const props: SettingsViewProps = {
    state, workBusy: false, summaryInProgress: false, onPreference: () => { invoked.push('preference'); },
    onError: () => { invoked.push('error'); }, onNotice: () => { invoked.push('notice'); },
    voice: { phase: 'idle', seconds: 0, audioBusy: false, speechReady: true,
      devices: [device('default', 'Duplicate system microphone', 'audioinput'), device('communications', 'Duplicate communications speaker', 'audiooutput'),
        device('physical-input', 'Büromikrofon', 'audioinput'), device('physical-output', 'Kopfhörer', 'audiooutput')],
      startRecording: async () => { invoked.push('recording'); }, testSpeech: async () => { invoked.push('speech-test'); },
      saveSpeechKey: async () => { invoked.push('save-key'); }, removeSpeechKey: async () => { invoked.push('remove-key'); },
      cancelAudio: () => { invoked.push('cancel'); }, clearSpeech: () => { invoked.push('clear'); }, stopEarcons: () => { invoked.push('earcons'); },
    },
  };
  return { props, invoked, render: () => renderToStaticMarkup(createElement(SettingsView, props)) };
}

test('settings mounts every tab and access form without browser resources, commands or CSS loaders', () => {
  const f = fixture(), html = f.render();
  assert.equal((html.match(/role="tab"/g) ?? []).length, 3);
  assert.equal((html.match(/role="tabpanel"/g) ?? []).length, 3);
  assert.equal((html.match(/hidden=""/g) ?? []).length, 2);
  assert.match(html, /Modelle &amp; Zugänge/); assert.match(html, /Sprache &amp; Geräte/); assert.match(html, /Bedienung/);
  assert.match(html, /data-provider="openai"/); assert.match(html, /Inworld-Zugang/);
  assert.match(html, /role-model/); assert.match(html, /role-dialogModel/); assert.match(html, /role-memoryModel/);
  assert.match(html, /type="password"[^>]*autoComplete="off"/);
  assert.deepEqual(f.invoked, []);
});

test('settings renders real device choices and keeps the current audio phase visible without starting it', () => {
  const f = fixture(); f.props.voice.phase = 'mic-test'; f.props.voice.audioBusy = true; f.props.voice.seconds = 3;
  const html = f.render();
  assert.match(html, /Büromikrofon/); assert.match(html, /Kopfhörer/);
  assert.ok(!html.includes('Duplicate system microphone')); assert.ok(!html.includes('Duplicate communications speaker'));
  assert.match(html, /Mikrofontest · 3s/); assert.match(html, /Test beenden · 3s/); assert.match(html, /Audio beenden/);
  assert.deepEqual(f.invoked, []);
});
