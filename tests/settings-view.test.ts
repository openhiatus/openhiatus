import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SettingsView, type SettingsViewProps } from '../src/renderer/features/settings';
import { defaultState } from '../src/main/storage';
import type { Snapshot } from '../src/shared/contracts';
import { AudioDeviceSelect } from '../src/renderer/features/settings/audio-device-select';

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

test('a disconnected pinned device stays selected instead of showing the Windows default', () => {
  const f = fixture();
  Object.assign(f.props.state!.preferences, { inputDeviceId: 'unplugged', inputDeviceLabel: 'USB Studio Microphone' });
  const html = f.render();
  assert.match(html, /value="unplugged" selected=""[^>]*>USB Studio Microphone – nicht angeschlossen/);
  assert.ok(!html.includes('value="default" selected="">Windows-Standardgerät</option><option value="unplugged"'));
  assert.deepEqual(f.invoked, []);
});

test('a reconnected device with a new ID is selected by its remembered identity without saving over preferences', () => {
  const preferences = { ...defaultState().preferences, outputDeviceId: 'old-id', outputDeviceLabel: 'USB Studio Headphones', outputDeviceGroupId: 'old-group' };
  const devices = [{ deviceId: 'new-id', label: 'USB Studio Headphones', groupId: 'new-group', kind: 'audiooutput' }] as MediaDeviceInfo[];
  const html = renderToStaticMarkup(createElement(AudioDeviceSelect, { id: 'test-speakers', kind: 'audiooutput', preferences, devices, disabled: false, onChange: () => assert.fail('Rendering must not save preferences') }));
  assert.match(html, /value="new-id" selected=""/); assert.equal(preferences.outputDeviceId, 'old-id');
});
