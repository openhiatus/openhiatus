import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeWav, MicrophoneRecorder } from '../src/renderer/audio';

test('audio export is a valid mono 16-bit 16-kHz WAV with signed and clipped samples', () => {
  const bytes = encodeWav(new Float32Array([-2, -1, 0, 1, 2]), 16_000);
  const view = new DataView(bytes.buffer);
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 4)), 'RIFF');
  assert.equal(new TextDecoder().decode(bytes.subarray(8, 12)), 'WAVE');
  assert.equal(view.getUint32(4, true), bytes.length - 8);
  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 16_000);
  assert.equal(view.getUint32(28, true), 32_000);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 10);
  assert.deepEqual(Array.from({ length: 5 }, (_, i) => view.getInt16(44 + i * 2, true)), [-32768, -32768, 0, 32767, 32767]);
});

test('48-kHz microphone input preserves the captured duration when resampled', () => {
  const source = new Float32Array(48_000).fill(0.5);
  const bytes = encodeWav(source, 48_000);
  assert.equal(bytes.byteLength, 44 + 16_000 * 2);
  assert.equal(new DataView(bytes.buffer).getInt16(44, true), 16384);
});

test('Stop while microphone permission is pending closes a late stream without starting capture', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let grant!: (stream: MediaStream) => void;
  let stopped = 0;
  const permission = new Promise<MediaStream>(resolve => { grant = resolve; });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: () => permission } } });
  try {
    const recorder = new MicrophoneRecorder();
    const start = recorder.start('default', () => assert.fail('Late stream must not capture'), () => assert.fail('Late stream must not finish'));
    recorder.cancel();
    grant({ getTracks: () => [{ stop: () => { stopped++; } }] } as unknown as MediaStream);
    await start;
    assert.equal(stopped, 1);
    assert.equal(recorder.stop(), null);
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
});
