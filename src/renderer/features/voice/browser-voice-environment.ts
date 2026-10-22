import { audioObjectUrl, MicrophoneRecorder } from '../../audio';
import { EarconPlayer } from '../../earcons';
import { OutputMeter } from '../../Presence';
import type { VoiceEnvironment, VoicePlayer } from './voice-session';

/** The only voice-session adapter that touches browser devices and audio globals. */
export function createBrowserVoiceEnvironment(): VoiceEnvironment {
  const outputMeter = new OutputMeter();
  return {
    api: {
      synthesize: text => window.openhiatus.synthesize(text),
      transcribe: clip => window.openhiatus.transcribe(clip),
      testSpeech: () => window.openhiatus.testSpeech(),
    },
    createRecorder: () => new MicrophoneRecorder(),
    createPlayer: url => new Audio(url) as unknown as VoicePlayer,
    createAudioUrl: audioObjectUrl,
    revokeAudioUrl: url => URL.revokeObjectURL(url),
    outputMeter: {
      attach: player => { outputMeter.attach(player as unknown as HTMLAudioElement); },
      detach: () => outputMeter.detach(),
      level: () => outputMeter.level(),
      get active() { return outputMeter.active; },
      dispose: () => outputMeter.dispose(),
    },
    earcons: new EarconPlayer(),
    enumerateDevices: () => navigator.mediaDevices?.enumerateDevices() ?? Promise.resolve([]),
    onDevicesChanged: listener => {
      navigator.mediaDevices?.addEventListener('devicechange', listener);
      return () => navigator.mediaDevices?.removeEventListener('devicechange', listener);
    },
    now: () => Date.now(),
    every: (milliseconds, listener) => { const timer = setInterval(listener, milliseconds); return () => clearInterval(timer); },
  };
}
