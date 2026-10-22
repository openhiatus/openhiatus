import type { OpenhiatusApi, AudioClip, Snapshot, SpeechCue } from '../../../shared/contracts';
import { physicalAudioDevices, resolveAudioDevice } from '../../../shared/audio-devices';
import { SpeechCueQueue } from '../../speech-queue';

export type Earcon = 'listen' | 'heard' | 'sent' | 'done' | 'error';
export type AudioPhase = 'idle' | 'opening' | 'recording' | 'mic-test' | 'transcribing' | 'synthesizing' | 'playing';
export interface VoiceState { phase: AudioPhase; level: number; seconds: number; devices: MediaDeviceInfo[]; }
export const initialVoiceState = (): VoiceState => ({ phase: 'idle', level: 0, seconds: 0, devices: [] });

export interface VoiceRecorder {
  start(deviceId: string, onLevel: (level: number) => void, onLimit: () => void, limit: number): Promise<void>;
  stop(): AudioClip | null;
  cancel(): void;
}
export interface VoicePlayer {
  onended: (() => void) | null;
  onerror: (() => void) | null;
  play(): Promise<void>;
  pause(): void;
  removeAttribute(name: string): void;
  load(): void;
  setSinkId?(id: string): Promise<void>;
}
/** Browser resources are injected so lifetime and cancellation rules can run against fakes. */
export interface VoiceEnvironment {
  api: Pick<OpenhiatusApi, 'synthesize' | 'transcribe' | 'testSpeech'>;
  createRecorder(): VoiceRecorder;
  createPlayer(url: string): VoicePlayer;
  createAudioUrl(clip: AudioClip): string;
  revokeAudioUrl(url: string): void;
  outputMeter: { attach(player: VoicePlayer): void; detach(): void; level(): number; readonly active: boolean; dispose(): void; };
  earcons: { play(name: Earcon, outputDeviceId?: string): Promise<void>; stop(): void; dispose(): void; };
  enumerateDevices(): Promise<MediaDeviceInfo[]>;
  onDevicesChanged(listener: () => void): () => void;
  now(): number;
  every(milliseconds: number, listener: () => void): () => void;
}
export interface VoiceEvents {
  changed(state: VoiceState): void;
  error(error: unknown): void;
  notice(text: string): void;
  inputStarted(): void;
  transcribing(): void;
  transcript(text: string, automatic: boolean): void | Promise<void>;
  connectionsRequired(): void;
}

interface Playback { player: VoicePlayer; url: string; deviceId: string; settle(): void; }

/** Owns one microphone/playback lifetime, including queued speech and all late completions. */
export class VoiceSession {
  private state = initialVoiceState();
  private snapshot?: Snapshot;
  private disposed = false;
  private started = false;
  private epoch = 0;
  private deviceRevision = 0;
  private devicesKnown = false;
  private recordingDeviceId?: string;
  private recorder?: VoiceRecorder;
  private playback?: Playback;
  private stopClock?: () => void;
  private unwatchDevices?: () => void;
  private readonly queue = new SpeechCueQueue();
  private activeSpeech?: SpeechCue;
  private pumpScheduled = false;
  private jobStatuses?: Map<string, string>;

  constructor(private readonly environment: VoiceEnvironment, private readonly events: VoiceEvents) {}

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.unwatchDevices = this.environment.onDevicesChanged(() => { void this.refreshDevices(); });
    void this.refreshDevices();
  }

  updateSnapshot(snapshot: Snapshot | undefined): void {
    if (this.disposed) return;
    this.snapshot = snapshot;
    if (!snapshot) return;
    const running = new Set(snapshot.jobs?.filter(job => job.status === 'running').map(job => job.id));
    this.queue.ingest(snapshot.speech, snapshot.preferences.speakReplies && snapshot.connections.speech !== 'missing', running);
    if (this.activeSpeech?.kind === 'progress' && (!this.activeSpeech.jobId || !running.has(this.activeSpeech.jobId))) this.cancelAudio();
    if (snapshot.jobs) {
      const previous = this.jobStatuses;
      this.jobStatuses = new Map(snapshot.jobs.map(job => [job.id, job.status]));
      for (const job of snapshot.jobs) {
        const before = previous?.get(job.id);
        if (!before || before === job.status) continue;
        if (job.status === 'completed') this.cue('done');
        else if (job.status === 'failed') this.cue('error');
      }
    }
    this.scheduleSpeech();
  }

  get phase(): AudioPhase { return this.state.phase; }
  microphoneLevel = (): number => this.state.level;
  playbackLevel = (): number | undefined => this.environment.outputMeter.active ? this.environment.outputMeter.level() : undefined;

  cue = (name: Earcon): void => {
    if (this.disposed || this.snapshot?.preferences.earcons === false) return;
    const output = this.snapshot && resolveAudioDevice(this.snapshot.preferences, 'audiooutput', this.state.devices);
    if (output && this.devicesKnown && !output.connected) return;
    void this.environment.earcons.play(name, output?.deviceId).catch(() => {});
  };
  stopEarcons = (): void => { this.environment.earcons.stop(); };

  cancelAudio = (): void => {
    if (this.disposed) return;
    this.epoch++;
    this.activeSpeech = undefined;
    this.recorder?.cancel(); this.recorder = undefined;
    this.recordingDeviceId = undefined;
    this.stopRecordingClock();
    this.releasePlayback();
    this.change({ phase: 'idle', level: 0 });
    this.scheduleSpeech();
  };

  clearSpeech = (): void => { this.queue.clear(); };
  stop = (): void => { this.clearSpeech(); this.stopEarcons(); this.cancelAudio(); };

  speak = async (text: string): Promise<void> => {
    if (this.disposed) return;
    this.cancelAudio();
    await this.synthesize(text, this.epoch);
  };

  startRecording = async (test = false): Promise<void> => {
    if (this.disposed) return;
    if (this.phase === 'opening') { this.cancelAudio(); this.events.notice('Aufnahme abgebrochen. Deine Aufträge arbeiten weiter.'); return; }
    if (this.phase === 'recording' || this.phase === 'mic-test') { await this.finishRecording(this.phase === 'mic-test'); return; }
    const current = this.snapshot;
    if (!current) return;
    if (!test && current.summary?.mode === 'manual' && ['running', 'stopping'].includes(current.summary.status)) return;
    if (!['idle', 'playing', 'synthesizing'].includes(this.phase)) return;
    if (!test && current.connections.speech === 'missing') {
      this.events.connectionsRequired(); this.events.notice('Verbinde zuerst Inworld in den Einstellungen unter Sprache & Geräte, damit openHiatus deine Aufnahme transkribieren kann.'); return;
    }
    this.cancelAudio(); const epoch = this.epoch;
    this.events.inputStarted(); this.change({ phase: 'opening' });
    const capture = this.environment.createRecorder(); this.recorder = capture;
    try {
      this.recordingDeviceId = resolveAudioDevice(current.preferences, 'audioinput', this.state.devices).deviceId;
      await capture.start(this.recordingDeviceId, level => {
        if (this.current(epoch) && this.recorder === capture) this.change({ level });
      }, () => {
        if (this.current(epoch) && this.recorder === capture) void this.finishRecording(test);
      }, test ? 4000 : 60_000);
      if (!this.current(epoch) || this.recorder !== capture) { capture.cancel(); return; }
      const began = this.environment.now();
      this.change({ seconds: 0, phase: test ? 'mic-test' : 'recording' });
      this.stopClock = this.environment.every(250, () => {
        if (this.current(epoch)) this.change({ seconds: Math.floor((this.environment.now() - began) / 1000) });
      });
      if (!test) this.cue('listen');
      void this.refreshDevices();
    } catch (error) {
      capture.cancel();
      if (this.current(epoch)) { this.recorder = undefined; this.recordingDeviceId = undefined; this.change({ phase: 'idle' }); this.events.error(error); }
    }
  };

  testSpeech = async (): Promise<void> => {
    if (this.disposed) return;
    this.cancelAudio(); const epoch = this.epoch;
    this.events.inputStarted(); this.change({ phase: 'synthesizing' });
    try {
      this.outputDevice();
      const clip = await this.environment.api.testSpeech();
      if (!this.current(epoch)) return;
      await this.play(clip, epoch);
      if (this.current(epoch)) this.events.notice('Die Verbindung liefert eine echte Sprachausgabe. Die Spracherkennung prüfst du mit einem gesprochenen Auftrag.');
    } catch (error) { this.fail(epoch, error); }
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.epoch++; this.deviceRevision++;
    this.queue.clear(); this.activeSpeech = undefined;
    this.recorder?.cancel(); this.recorder = undefined;
    this.stopRecordingClock(); this.unwatchDevices?.(); this.unwatchDevices = undefined;
    this.releasePlayback();
    this.environment.outputMeter.dispose(); this.environment.earcons.dispose();
  }

  private current(epoch: number): boolean { return !this.disposed && epoch === this.epoch; }
  private change(patch: Partial<VoiceState>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch }; this.events.changed(this.state);
    if (this.phase === 'idle') this.scheduleSpeech();
  }
  private stopRecordingClock(): void { this.stopClock?.(); this.stopClock = undefined; }
  private async refreshDevices(): Promise<void> {
    const revision = ++this.deviceRevision;
    try {
      const devices = await this.environment.enumerateDevices();
      if (!this.disposed && revision === this.deviceRevision) {
        this.devicesKnown = true;
        this.change({ devices });
        if (this.snapshot && !resolveAudioDevice(this.snapshot.preferences, 'audiooutput', devices).connected) this.stopEarcons();
        const inputGone = this.recordingDeviceId && this.recordingDeviceId !== 'default'
          && (this.phase === 'recording' || this.phase === 'mic-test')
          && !physicalAudioDevices(devices, 'audioinput').some(device => device.deviceId === this.recordingDeviceId);
        const outputGone = this.playback && this.playback.deviceId !== 'default'
          && !physicalAudioDevices(devices, 'audiooutput').some(device => device.deviceId === this.playback?.deviceId);
        if (inputGone || outputGone) {
          this.stopEarcons(); this.cancelAudio();
          this.events.notice('Das gewählte Audiogerät wurde getrennt. Die Auswahl bleibt gespeichert und wird beim Wiederverbinden erneut verwendet.');
        }
      }
    } catch { /* Device labels are optional; capture reports actionable microphone errors. */ }
  }
  private fail(epoch: number, error: unknown): void {
    if (!this.current(epoch)) return;
    this.releasePlayback(); this.change({ phase: 'idle' }); this.events.error(error);
  }
  private async synthesize(text: string, epoch: number): Promise<void> {
    this.change({ phase: 'synthesizing' });
    try {
      this.outputDevice();
      const clip = await this.environment.api.synthesize(text);
      if (this.current(epoch)) await this.play(clip, epoch);
    } catch (error) { this.fail(epoch, error); }
  }
  private async finishRecording(test: boolean): Promise<void> {
    const capture = this.recorder; this.recorder = undefined;
    this.recordingDeviceId = undefined;
    if (!capture || this.disposed) return;
    const epoch = this.epoch; this.stopRecordingClock(); this.change({ level: 0 });
    try {
      const clip = capture.stop();
      if (!clip) { this.change({ phase: 'idle' }); this.events.notice('Die Aufnahme war sehr kurz. Halte einen Moment inne und versuche es erneut.'); return; }
      if (test) {
        await this.play(clip, epoch);
        if (this.current(epoch)) this.events.notice('Mikrofontest: Du hörst jetzt deine Aufnahme. Es wurde nichts an einen Anbieter gesendet.');
        return;
      }
      this.events.transcribing(); this.change({ phase: 'transcribing' }); this.cue('heard');
      const text = await this.environment.api.transcribe(clip);
      if (!this.current(epoch)) return;
      this.change({ phase: 'idle' });
      if (!text.trim()) this.events.notice('Keine Sprache erkannt. Versuche es noch einmal oder schreibe deinen Auftrag.');
      await this.events.transcript(text.trim(), this.snapshot?.preferences.voiceConversation !== false);
    } catch (error) { this.fail(epoch, error); }
  }
  private releasePlayback(): void {
    this.environment.outputMeter.detach();
    const playback = this.playback; this.playback = undefined;
    if (!playback) return;
    playback.player.onended = null; playback.player.onerror = null;
    playback.player.pause(); playback.player.removeAttribute('src'); playback.player.load();
    this.environment.revokeAudioUrl(playback.url); playback.settle();
  }
  private async play(clip: AudioClip, epoch: number): Promise<void> {
    if (!this.current(epoch)) return;
    const output = this.outputDevice();
    this.releasePlayback();
    const url = this.environment.createAudioUrl(clip);
    let player: VoicePlayer;
    try { player = this.environment.createPlayer(url); }
    catch (error) { this.environment.revokeAudioUrl(url); throw error; }
    let finish!: () => void;
    let reject!: (error: Error) => void;
    const ended = new Promise<void>((resolve, fail) => { finish = resolve; reject = fail; });
    // A player can fail while play()/setSinkId() is pending; attach a handler immediately.
    void ended.catch(() => {});
    const playback = { player, url, deviceId: output, settle: finish }; this.playback = playback;
    const active = () => this.current(epoch) && this.playback === playback;
    player.onended = () => { if (active()) { this.releasePlayback(); this.change({ phase: 'idle' }); } };
    player.onerror = () => {
      if (!active()) return;
      reject(new Error('Die Audioantwort konnte nicht abgespielt werden. Die Textantwort bleibt im Gespräch.'));
      this.releasePlayback();
    };
    try {
      if (output && output !== 'default') {
        if (!player.setSinkId) throw new Error('Die gewählte Audioausgabe wird auf diesem System nicht unterstützt. Wähle das Standardgerät.');
        await player.setSinkId(output);
      }
      if (!active()) { await ended; return; }
      await player.play();
      if (!active()) { player.pause(); await ended; return; }
      this.environment.outputMeter.attach(player); this.change({ phase: 'playing' });
      await ended;
    } catch (error) { if (this.playback === playback) this.releasePlayback(); throw error; }
  }
  private outputDevice(): string {
    if (!this.snapshot) return 'default';
    const choice = resolveAudioDevice(this.snapshot.preferences, 'audiooutput', this.state.devices);
    if (this.devicesKnown && !choice.connected) {
      throw new Error(choice.ambiguous
        ? 'Der gespeicherte Lautsprecher ist nicht eindeutig erkennbar. Wähle ihn unter Sprache & Geräte erneut aus.'
        : 'Der gewählte Lautsprecher ist nicht angeschlossen. Die Auswahl bleibt gespeichert; verbinde das Gerät erneut.');
    }
    return choice.deviceId;
  }
  private scheduleSpeech(): void {
    if (this.pumpScheduled || this.disposed) return;
    this.pumpScheduled = true;
    void Promise.resolve().then(() => {
      this.pumpScheduled = false;
      if (this.disposed || this.phase !== 'idle' || this.activeSpeech || !this.snapshot?.preferences.speakReplies || this.snapshot.connections.speech === 'missing') return;
      const cue = this.queue.take(); if (!cue) return;
      this.cancelAudio(); const epoch = this.epoch; this.activeSpeech = cue;
      void this.synthesize(cue.text, epoch).finally(() => {
        if (this.activeSpeech !== cue) return;
        this.activeSpeech = undefined; this.scheduleSpeech();
      });
    });
  }
}
