import test from 'node:test';
import assert from 'node:assert/strict';
import { audioDevicePreference, resolveAudioDevice, type AudioDeviceInfo } from '../src/shared/audio-devices';
import { defaultState, StateStore } from '../src/main/storage';
import { decodeSnapshot } from '../src/shared/ipc';
import { snapshotFixture } from './ipc-fixtures';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const microphone: AudioDeviceInfo = { deviceId: 'usb-mic', kind: 'audioinput', label: 'USB Studio Microphone', groupId: 'usb-group' };
const speaker: AudioDeviceInfo = { deviceId: 'usb-speaker', kind: 'audiooutput', label: 'USB Studio Headphones', groupId: 'usb-group' };
const preferences = () => ({ ...defaultState().preferences, ...audioDevicePreference('audioinput', microphone.deviceId, [microphone]), ...audioDevicePreference('audiooutput', speaker.deviceId, [speaker]) });

test('pinned device metadata survives storage and IPC while disconnected', () => {
  const stored = preferences(), directory = mkdtempSync(join(tmpdir(), 'openhiatus-audio-prefs-'));
  const store = new StateStore(directory); store.save({ ...defaultState(), preferences: stored });
  const restored = new StateStore(directory).load().preferences;
  assert.deepEqual(restored, stored);
  assert.deepEqual(decodeSnapshot({ ...snapshotFixture(), preferences: restored }).preferences, stored);
  assert.deepEqual(resolveAudioDevice(restored, 'audioinput', []), { deviceId: 'usb-mic', label: microphone.label, connected: false, ambiguous: false });
  assert.equal(resolveAudioDevice(restored, 'audiooutput', []).deviceId, 'usb-speaker');
  assert.throws(() => store.save({ ...defaultState(), preferences: { ...stored, inputDeviceLabel: 42 as unknown as string } }));
});

test('a reconnected device can be resolved with a new ID using its saved group and name', () => {
  const saved = preferences(), reconnected = { ...microphone, deviceId: 'new-mic' };
  assert.equal(resolveAudioDevice(saved, 'audioinput', [reconnected]).deviceId, 'new-mic');
  assert.equal(resolveAudioDevice(saved, 'audioinput', [{ ...reconnected, groupId: 'new-session-group' }]).deviceId, 'new-mic');
  assert.equal(saved.inputDeviceId, 'usb-mic');
  assert.equal(resolveAudioDevice(saved, 'audiooutput', [{ ...speaker, deviceId: 'new-speaker' }]).deviceId, 'new-speaker');
});

test('ambiguous names never choose the first device or a Windows default alias', () => {
  const saved = preferences(), first = { ...microphone, deviceId: 'one', groupId: 'one' }, second = { ...microphone, deviceId: 'two', groupId: 'two' };
  const result = resolveAudioDevice(saved, 'audioinput', [first, second, { ...microphone, deviceId: 'default' }, { ...microphone, deviceId: 'communications' }]);
  assert.equal(result.ambiguous, true); assert.equal(result.connected, false); assert.equal(result.deviceId, 'usb-mic');
  assert.equal(resolveAudioDevice(saved, 'audioinput', [first, { ...second, groupId: microphone.groupId }]).deviceId, 'two');
  assert.equal(resolveAudioDevice(saved, 'audioinput', [{ ...microphone, kind: 'audiooutput' }]).connected, false);
});

test('legacy IDs and an explicit Windows default remain supported without stale identity metadata', () => {
  const legacy = { ...defaultState().preferences, inputDeviceId: microphone.deviceId };
  assert.equal(resolveAudioDevice(legacy, 'audioinput', [microphone]).deviceId, microphone.deviceId);
  const patch = audioDevicePreference('audioinput', 'default', [microphone]);
  assert.deepEqual(patch, { inputDeviceId: 'default', inputDeviceLabel: '', inputDeviceGroupId: '' });
  assert.equal(resolveAudioDevice({ ...preferences(), ...patch }, 'audioinput', []).connected, true);
});
