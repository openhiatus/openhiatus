import test from 'node:test';
import assert from 'node:assert/strict';
import { parseActivityPresence } from '../src/shared/activity-presence';
import { voicePresence } from '../src/renderer/features/voice/voice-presence';

test('voice activity covers capture, recognition, synthesis, playback and transcript review', () => {
  for (const phase of ['opening', 'recording', 'mic-test'] as const) assert.deepEqual(voicePresence(phase, false, false), { phase: 'listening' });
  assert.deepEqual(voicePresence('transcribing', false, false), { phase: 'transcribing' });
  assert.deepEqual(voicePresence('synthesizing', false, false), { phase: 'thinking' });
  assert.deepEqual(voicePresence('playing', false, false), { phase: 'speaking' });
  assert.deepEqual(voicePresence('idle', true, false), { phase: 'thinking' });
  assert.deepEqual(voicePresence('idle', false, true), { phase: 'ready' });
  assert.deepEqual(voicePresence('idle', false, false), { phase: 'idle' });
  assert.equal(voicePresence('playing', false, true).phase, 'speaking');
});

test('the compact activity channel permits fixed phases and rejects transcript text or malformed data', () => {
  for (const phase of ['idle', 'listening', 'transcribing', 'thinking', 'working', 'speaking', 'ready', 'error', 'stopping']) {
    assert.deepEqual(parseActivityPresence({ phase }), { phase });
  }
  for (const value of [null, [], {}, { phase: 'playing' }, { phase: true }, { phase: 'speaking', text: 'private transcript' },
    { phase: 'listening', detail: 'private reply' }, { phase: { toString: () => 'speaking' } }, Object.assign(Object.create({ phase: 'speaking' }), { extra: true })]) {
    assert.equal(parseActivityPresence(value), undefined);
  }
});
