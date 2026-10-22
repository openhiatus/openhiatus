import test from 'node:test';
import assert from 'node:assert/strict';
import type { AudioClip, BackgroundJob, Snapshot, SpeechCue } from '../src/shared/contracts';
import { VoiceSession, type VoiceEnvironment, type VoiceEvents, type VoicePlayer, type VoiceRecorder, type VoiceState } from '../src/renderer/features/voice';

const clip: AudioClip = { base64: 'synthetic-wav', mimeType: 'audio/wav' };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { for (let step = 0; step < 20; step++) await Promise.resolve(); }
function snapshot(patch: Partial<Snapshot> = {}): Snapshot {
  return {
    messages: [], activity: [], task: { id: 'task', status: 'idle' },
    preferences: { inputDeviceId: 'mic', outputDeviceId: 'default', speakReplies: true, voiceId: 'voice', model: 'model', dialogModel: 'model', memoryModel: 'model' },
    connections: { agent: 'ready', account: '', speech: 'saved' }, models: [], workspace: '', version: 'test', speech: [], ...patch,
  };
}
const speech = (id: string, patch: Partial<SpeechCue> = {}): SpeechCue => ({ id, text: id, at: '2026-10-21T12:00:00Z', ...patch });
const job = (status: BackgroundJob['status']): BackgroundJob => ({ id: 'job', requestId: 'request', title: 'Test', prompt: 'Test', status, createdAt: '', updatedAt: '', model: 'model', resources: [] });

class Recorder implements VoiceRecorder {
  starting = Promise.resolve();
  level!: (value: number) => void;
  limit!: () => void;
  milliseconds = 0;
  device = '';
  cancelled = 0;
  stopped = 0;
  clip: AudioClip | null = clip;
  start(device: string, level: (value: number) => void, limit: () => void, milliseconds: number) {
    this.device = device; this.level = level; this.limit = limit; this.milliseconds = milliseconds;
    return this.starting;
  }
  stop() { this.stopped++; return this.clip; }
  cancel() { this.cancelled++; }
}
class Player implements VoicePlayer {
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  playing = Promise.resolve();
  sink = Promise.resolve();
  played = 0;
  paused = 0;
  unloaded = 0;
  play() { this.played++; return this.playing; }
  pause() { this.paused++; }
  setSinkId() { return this.sink; }
  removeAttribute() { this.unloaded++; }
  load() {}
  end() { this.onended?.(); }
}

function fixture() {
  const recorders: Recorder[] = [], players: Player[] = [], revoked: string[] = [], synthesized: string[] = [];
  const states: VoiceState[] = [], notices: string[] = [], errors: unknown[] = [], transcripts: { text: string; automatic: boolean }[] = [];
  const timers = new Set<() => void>();
  let watch: (() => void) | undefined, unwatch = 0, now = 0, transcriptions = 0;
  let meterAttached = 0, meterDetached = 0, meterDisposed = 0, earconsStopped = 0, earconsDisposed = 0;
  const environment: VoiceEnvironment = {
    api: {
      synthesize: async text => { synthesized.push(text); return clip; },
      transcribe: async () => { transcriptions++; return 'Erkannter Auftrag'; },
      testSpeech: async () => clip,
    },
    createRecorder: () => { const recorder = new Recorder(); recorders.push(recorder); return recorder; },
    createPlayer: () => { const player = new Player(); players.push(player); return player; },
    createAudioUrl: () => `audio:${players.length}`,
    revokeAudioUrl: url => { revoked.push(url); },
    outputMeter: {
      attach: () => { meterAttached++; }, detach: () => { meterDetached++; }, level: () => 0.4, active: true,
      dispose: () => { meterDisposed++; },
    },
    earcons: { play: async () => {}, stop: () => { earconsStopped++; }, dispose: () => { earconsDisposed++; } },
    enumerateDevices: async () => [],
    onDevicesChanged: listener => { watch = listener; return () => { watch = undefined; unwatch++; }; },
    now: () => now,
    every: (_ms, listener) => { timers.add(listener); return () => { timers.delete(listener); }; },
  };
  const events: VoiceEvents = {
    changed: state => { states.push(state); }, error: error => { errors.push(error); }, notice: notice => { notices.push(notice); },
    inputStarted: () => {}, transcribing: () => {}, connectionsRequired: () => {},
    transcript: (text, automatic) => { transcripts.push({ text, automatic }); },
  };
  const session = new VoiceSession(environment, events);
  session.start(); session.updateSnapshot(snapshot());
  return {
    session, environment, events, recorders, players, revoked, synthesized, states, notices, errors, transcripts, timers,
    advance: (milliseconds: number) => { now += milliseconds; for (const tick of timers) tick(); },
    devicesChanged: () => watch?.(),
    counts: () => ({ unwatch, transcriptions, meterAttached, meterDetached, meterDisposed, earconsStopped, earconsDisposed }),
  };
}

test('Stop invalidates a pending TTS result and permits future speech without replaying it', async () => {
  const f = fixture(), result = deferred<AudioClip>();
  f.environment.api.synthesize = () => result.promise;
  const pending = f.session.speak('late');
  assert.equal(f.session.phase, 'synthesizing');
  f.session.stop(); result.resolve(clip); await pending; await flush();
  assert.equal(f.session.phase, 'idle'); assert.equal(f.players.length, 0); assert.deepEqual(f.errors, []);
  f.environment.api.synthesize = async () => clip;
  const future = f.session.speak('future'); await flush();
  assert.equal(f.players.length, 1); assert.equal(f.session.phase, 'playing');
  f.players[0].end(); await future;
  assert.deepEqual(f.revoked, ['audio:0']); f.session.dispose();
});

test('late STT completion or failure after Stop never submits text or overwrites feedback', async () => {
  for (const reject of [false, true]) {
    const f = fixture(), result = deferred<string>(); f.environment.api.transcribe = () => result.promise;
    await f.session.startRecording();
    const pending = f.session.startRecording(); assert.equal(f.session.phase, 'transcribing');
    f.session.stop(); const changes = f.states.length;
    if (reject) result.reject(new Error('late failure')); else result.resolve('Nicht mehr senden');
    await pending; await flush();
    assert.equal(f.states.length, changes); assert.deepEqual(f.transcripts, []); assert.deepEqual(f.errors, []); assert.deepEqual(f.notices, []);
    f.session.dispose();
  }
});

test('a stopped permission request and its old callbacks cannot affect the next recording', async () => {
  const f = fixture(), permission = deferred<void>(), old = new Recorder(); old.starting = permission.promise;
  f.environment.createRecorder = () => old;
  const opening = f.session.startRecording(); assert.equal(f.session.phase, 'opening');
  await f.session.startRecording(); assert.equal(f.session.phase, 'idle');
  const current = new Recorder(); f.environment.createRecorder = () => current;
  await f.session.startRecording(); current.level(0.7); f.advance(2000);
  assert.equal(f.states.at(-1)?.seconds, 2); assert.equal(f.session.microphoneLevel(), 0.7);
  old.level(1); old.limit(); permission.resolve(); await opening;
  assert.equal(f.session.phase, 'recording'); assert.equal(f.session.microphoneLevel(), 0.7); assert.equal(old.stopped, 0); assert.ok(old.cancelled > 0);
  f.session.dispose(); assert.equal(f.timers.size, 0); assert.equal(current.cancelled, 1);
});

test('Stop releases playback while setSinkId or play is pending and ignores its completion', async () => {
  for (const pendingOperation of ['sink', 'play'] as const) {
    const f = fixture(), pending = deferred<void>(), player = new Player();
    player[pendingOperation === 'sink' ? 'sink' : 'playing'] = pending.promise;
    f.environment.createPlayer = () => { f.players.push(player); return player; };
    f.session.updateSnapshot(snapshot({ preferences: { ...snapshot().preferences, outputDeviceId: 'speaker' } }));
    const playback = f.session.speak('test'); await flush();
    f.session.stop(); assert.deepEqual(f.revoked, ['audio:0']);
    assert.equal(player.onended, null); assert.equal(player.onerror, null);
    pending.resolve(); await playback; await flush();
    assert.equal(f.session.phase, 'idle'); assert.equal(f.counts().meterAttached, 0);
    assert.deepEqual(f.errors, []); assert.deepEqual(f.revoked, ['audio:0']); f.session.dispose();
  }
});

test('speech stays ordered across snapshots, ignores restored cues, and Stop consumes canceled deliveries', async () => {
  const f = fixture();
  f.session.updateSnapshot(snapshot({ speech: [speech('first'), speech('second')] })); await flush();
  assert.deepEqual(f.synthesized, ['first']); assert.equal(f.players.length, 1);
  f.session.updateSnapshot(snapshot({ speech: [speech('first'), speech('second'), speech('third')] }));
  f.players[0].end(); await flush(); assert.deepEqual(f.synthesized, ['first', 'second']);
  f.session.stop(); await flush();
  f.session.updateSnapshot(snapshot({ speech: [speech('first'), speech('second'), speech('third')] })); await flush();
  assert.deepEqual(f.synthesized, ['first', 'second']);
  f.session.updateSnapshot(snapshot({ speech: [speech('fourth')] })); await flush();
  assert.deepEqual(f.synthesized, ['first', 'second', 'fourth']); f.session.dispose();
  const restored = fixture(); restored.session.dispose();
  const clean = new VoiceSession(restored.environment, restored.events);
  clean.updateSnapshot(snapshot({ speech: [speech('stored')] })); await flush();
  assert.deepEqual(restored.synthesized, []); clean.dispose();
});

test('expired progress cannot delay or overwrite a receipt while its old synthesis settles', async () => {
  const f = fixture(), progress = deferred<AudioClip>();
  f.environment.api.synthesize = async text => { f.synthesized.push(text); return text === 'progress' ? progress.promise : clip; };
  f.session.updateSnapshot(snapshot({ jobs: [job('running')], speech: [speech('progress', { kind: 'progress', jobId: 'job' })] })); await flush();
  assert.deepEqual(f.synthesized, ['progress']);
  f.session.updateSnapshot(snapshot({ jobs: [job('completed')], speech: [speech('receipt', { kind: 'receipt', jobId: 'job' })] })); await flush();
  assert.deepEqual(f.synthesized, ['progress', 'receipt']); assert.equal(f.players.length, 1);
  progress.resolve(clip); await flush(); assert.equal(f.players.length, 1); assert.equal(f.session.phase, 'playing');
  f.players[0].end(); await flush(); assert.equal(f.session.phase, 'idle'); f.session.dispose();
});

test('recording retains device, limit, current transcript mode and a local microphone test', async () => {
  const f = fixture();
  await f.session.startRecording(); assert.equal(f.recorders[0].device, 'mic'); assert.equal(f.recorders[0].milliseconds, 60_000);
  f.session.updateSnapshot(snapshot({ preferences: { ...snapshot().preferences, voiceConversation: false } }));
  await f.session.startRecording(); assert.deepEqual(f.transcripts, [{ text: 'Erkannter Auftrag', automatic: false }]);
  await f.session.startRecording(true); assert.equal(f.recorders[1].milliseconds, 4000);
  const local = f.session.startRecording(true); await flush();
  assert.equal(f.counts().transcriptions, 1); assert.deepEqual(f.synthesized, []); assert.equal(f.session.phase, 'playing');
  f.players[0].end(); await local;
  assert.match(f.notices.at(-1)!, /nichts an einen Anbieter/); f.session.dispose();
});

test('canceling a speech or microphone test never publishes a late success notice', async () => {
  for (const microphone of [false, true]) {
    const f = fixture();
    if (microphone) await f.session.startRecording(true);
    const pending = microphone ? f.session.startRecording(true) : f.session.testSpeech(); await flush();
    assert.equal(f.session.phase, 'playing'); f.session.stop(); await pending;
    assert.deepEqual(f.notices, []); assert.deepEqual(f.errors, []); assert.deepEqual(f.revoked, ['audio:0']); f.session.dispose();
  }
});

test('playback failures release their URL and report failure without a test success notice', async () => {
  const f = fixture(), pending = f.session.testSpeech(); await flush();
  f.players[0].onerror?.(); await pending;
  assert.equal(f.session.phase, 'idle'); assert.equal(f.errors.length, 1); assert.deepEqual(f.notices, []);
  assert.deepEqual(f.revoked, ['audio:0']); f.session.dispose();
});

test('a player error while play is pending is retained until playback settles', async () => {
  const f = fixture(), wait = deferred<void>(), player = new Player(); player.playing = wait.promise;
  f.environment.createPlayer = () => { f.players.push(player); return player; };
  const pending = f.session.testSpeech(); await flush();
  player.onerror?.(); wait.resolve(); await pending;
  assert.equal(f.session.phase, 'idle'); assert.equal(f.errors.length, 1);
  assert.deepEqual(f.notices, []); assert.deepEqual(f.revoked, ['audio:0']); f.session.dispose();
});

test('speech waits for recording and an empty transcript still completes the input handoff', async () => {
  const f = fixture(); f.environment.api.transcribe = async () => '   ';
  await f.session.startRecording();
  f.session.updateSnapshot(snapshot({ speech: [speech('after-recording')] })); await flush();
  assert.deepEqual(f.synthesized, []);
  await f.session.startRecording(); await flush();
  assert.deepEqual(f.transcripts, [{ text: '', automatic: true }]);
  assert.match(f.notices.at(-1)!, /Keine Sprache erkannt/);
  assert.deepEqual(f.synthesized, ['after-recording']); f.session.dispose();
});

test('dispose closes resources once, settles playback and drops late device and speech callbacks', async () => {
  const f = fixture(), devices = deferred<MediaDeviceInfo[]>();
  await flush(); f.environment.enumerateDevices = () => devices.promise; f.devicesChanged();
  const pending = f.session.speak('playing'); await flush(); assert.equal(f.session.phase, 'playing');
  f.session.dispose(); const changes = f.states.length;
  f.session.dispose(); devices.resolve([{ deviceId: 'late' } as MediaDeviceInfo]); await pending; await flush();
  assert.equal(f.states.length, changes); assert.equal(f.counts().unwatch, 1);
  assert.equal(f.counts().meterDisposed, 1); assert.equal(f.counts().earconsDisposed, 1);
  assert.deepEqual(f.revoked, ['audio:0']); assert.equal(f.players[0].onended, null);
  await f.session.startRecording(); await f.session.speak('closed'); f.session.updateSnapshot(snapshot({ speech: [speech('closed')] })); await flush();
  assert.equal(f.recorders.length, 0); assert.deepEqual(f.synthesized, ['playing']);
});
