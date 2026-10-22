import type { AudioClip } from '../../shared/contracts';
import { command, inputObject, inputText, noArgs, type HandlerMap } from './command';
import type { IpcPorts } from './ports';

function audioClip(value: unknown): AudioClip {
  const input = inputObject(value, ['base64', 'mimeType'], 'Ungültige Aufnahme.');
  if (typeof input.base64 !== 'string' || input.base64.length > 2700000 || typeof input.mimeType !== 'string'
    || !['audio/wav', 'audio/wave', 'audio/x-wav'].includes(input.mimeType)) throw new Error('Bitte eine WAV-Aufnahme mit höchstens 60 Sekunden verwenden.');
  return { base64: input.base64, mimeType: input.mimeType };
}
export function speechHandlers({ controller }: IpcPorts): Pick<HandlerMap, 'saveSpeechKey' | 'removeSpeechKey' | 'testSpeech' | 'transcribe' | 'synthesize'> {
  return {
    saveSpeechKey: command('saveSpeechKey', 1, args => [inputText(args[0], 4096, 'Inworld-Key')], key => controller.saveSpeechKey(key)),
    removeSpeechKey: command('removeSpeechKey', 0, noArgs, () => controller.removeSpeechKey()),
    testSpeech: command('testSpeech', 0, noArgs, () => controller.testSpeech()),
    transcribe: command('transcribe', 1, args => [audioClip(args[0])], clip => controller.transcribe(clip)),
    synthesize: command('synthesize', 1, args => [inputText(args[0], 20000, 'Sprachausgabe')], text => controller.synthesize(text)),
  };
}
