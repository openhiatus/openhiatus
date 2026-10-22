import test from 'node:test';
import assert from 'node:assert/strict';
import { EarconPlayer } from '../src/renderer/earcons';
import { OutputMeter } from '../src/renderer/Presence';

function pending() { let resolve!: () => void; const promise = new Promise<void>(yes => { resolve = yes; }); return { promise, resolve }; }

test('earcons never fall back to another output when the pinned speaker is unavailable', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  let created = 0;
  class Context {
    state = 'running';
    async setSinkId() { throw new Error('Device disconnected'); }
    createOscillator() { created++; throw new Error('Unexpected default output'); }
    async close() { this.state = 'closed'; }
  }
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: Context });
  try { const player = new EarconPlayer(); await player.play('done', 'usb-speaker'); assert.equal(created, 0); player.dispose(); }
  finally { if (original) Object.defineProperty(globalThis, 'AudioContext', original); else Reflect.deleteProperty(globalThis, 'AudioContext'); }
});

test('Earcon Stop/dispose invalidates delayed device selection and resume before oscillators start', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  try {
    for (const operation of ['sink', 'resume'] as const) for (const dispose of [false, true]) {
      const wait = pending(); let created = 0, closed = 0;
      class Context {
        state = operation === 'resume' ? 'suspended' : 'running';
        currentTime = 0;
        async setSinkId() { if (operation === 'sink') await wait.promise; }
        async resume() { if (operation === 'resume') await wait.promise; }
        async close() { closed++; this.state = 'closed'; }
        createOscillator() { created++; assert.fail('Canceled earcon must never start an oscillator'); }
      }
      Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: Context });
      const player = new EarconPlayer(), playing = player.play('listen', 'chosen-speaker');
      // Device selection completes before resume can start.
      await Promise.resolve(); await Promise.resolve();
      if (dispose) player.dispose(); else player.stop();
      wait.resolve(); await playing;
      assert.equal(created, 0); player.dispose(); player.dispose(); assert.equal(closed, 1);
      await player.play('listen'); assert.equal(created, 0);
    }
  } finally {
    if (original) Object.defineProperty(globalThis, 'AudioContext', original);
    else Reflect.deleteProperty(globalThis, 'AudioContext');
  }
});

test('OutputMeter dispose disconnects measurement and closes its context exactly once', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  let disconnected = 0, closed = 0;
  class Context {
    state = 'running';
    createAnalyser() { return { fftSize: 512, disconnect: () => { disconnected++; } }; }
    createMediaStreamSource() { return { connect: () => {}, disconnect: () => { disconnected++; } }; }
    async close() { closed++; this.state = 'closed'; }
  }
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: Context });
  try {
    const meter = new OutputMeter();
    const audio = { captureStream: () => ({ getAudioTracks: () => [{}] }) } as unknown as HTMLAudioElement;
    assert.equal(meter.attach(audio), true); assert.equal(meter.active, true);
    meter.dispose(); meter.dispose(); assert.equal(meter.active, false);
    assert.equal(disconnected, 2); assert.equal(closed, 1);
  } finally {
    if (original) Object.defineProperty(globalThis, 'AudioContext', original);
    else Reflect.deleteProperty(globalThis, 'AudioContext');
  }
});
