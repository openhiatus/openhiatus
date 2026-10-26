export type SpeechProvider = 'inworld' | 'elevenlabs';
export const SPEECH_PROVIDERS = ['inworld', 'elevenlabs'] as const;
export const SPEECH_DEFAULTS = {
  inworld: { label: 'Inworld', voice: 'Dennis', voiceName: 'Dennis', stt: 'inworld/inworld-stt-1', tts: 'inworld-tts-2' },
  elevenlabs: { label: 'ElevenLabs', voice: '6WwXjDDEMyNmFG95zycZ', voiceName: 'Eldrin', stt: 'scribe_v2', tts: 'eleven_multilingual_v2' },
} as const;
export function parseSpeechProvider(value: unknown): SpeechProvider {
  if (value !== 'inworld' && value !== 'elevenlabs') throw new Error('Ungültiger Sprachanbieter.');
  return value;
}
export function parseVoiceId(value: unknown): string {
  if (typeof value !== 'string' || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('Die gewählte Stimme ist ungültig.');
  return value.trim();
}
