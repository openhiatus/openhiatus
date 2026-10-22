import { useEffect, useMemo, useRef, useState } from 'react';
import type { Snapshot } from '../../../shared/contracts';
import { createBrowserVoiceEnvironment } from './browser-voice-environment';
import { initialVoiceState, VoiceSession, type Earcon, type VoiceEvents } from './voice-session';

type VoiceCallbacks = Omit<VoiceEvents, 'changed'>;

/** One runtime per mounted App; changing tabs never ends the microphone or speech lifetime. */
export function useVoiceSession(snapshot: Snapshot | undefined, callbacks: VoiceCallbacks) {
  const [state, setState] = useState(initialVoiceState);
  const session = useRef<VoiceSession | undefined>(undefined);
  const current = useRef({ snapshot, callbacks }); current.current = { snapshot, callbacks };

  useEffect(() => {
    // Create inside the effect: StrictMode's setup/cleanup cycle gets a fresh resource owner.
    const runtime = new VoiceSession(createBrowserVoiceEnvironment(), {
      changed: setState,
      error: error => current.current.callbacks.error(error),
      notice: text => current.current.callbacks.notice(text),
      inputStarted: () => current.current.callbacks.inputStarted(),
      transcribing: () => current.current.callbacks.transcribing(),
      transcript: (text, automatic) => current.current.callbacks.transcript(text, automatic),
      connectionsRequired: () => current.current.callbacks.connectionsRequired(),
    });
    session.current = runtime;
    runtime.start(); runtime.updateSnapshot(current.current.snapshot);
    return () => { session.current = undefined; runtime.dispose(); };
  }, []);
  useEffect(() => { session.current?.updateSnapshot(snapshot); }, [snapshot]);

  const controls = useMemo(() => ({
    getPhase: () => session.current?.phase ?? 'idle',
    microphoneLevel: () => session.current?.microphoneLevel() ?? 0,
    playbackLevel: () => session.current?.playbackLevel(),
    startRecording: (test = false) => session.current?.startRecording(test) ?? Promise.resolve(),
    speak: (text: string) => session.current?.speak(text) ?? Promise.resolve(),
    testSpeech: () => session.current?.testSpeech() ?? Promise.resolve(),
    cue: (name: Earcon) => session.current?.cue(name),
    cancelAudio: () => session.current?.cancelAudio(),
    clearSpeech: () => session.current?.clearSpeech(),
    stopEarcons: () => session.current?.stopEarcons(),
    stop: () => session.current?.stop(),
  }), []);
  return { ...state, ...controls };
}
