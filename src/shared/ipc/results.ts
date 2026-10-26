import type { AudioClip, SkillCatalog } from '../contracts';
import type { CommandName, CommandResult } from './contracts';
import { array, boolean, choice, invalidPayload, nothing, object, optional, record, text, type Decoder } from './decode';
import { decodeMemoryPeriod, decodeMemorySearch, decodeMemorySnapshot, decodeMemorySource } from './memory';
import { decodeSnapshot } from './snapshot';
import { decodeGoogleCalendarSnapshot, decodeCalendarEvents } from './calendar';

const audio: Decoder<AudioClip> = object({ base64: text(32 * 1024 * 1024), mimeType: choice(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav']) });
const skills: Decoder<SkillCatalog> = object({ skills: array(object({ name: text(1024), displayName: optional(text()), description: text(), path: text(4096),
  enabled: boolean, scope: choice(['user', 'repo', 'system', 'admin']) }), 10000), errors: array(object({ path: text(4096), message: text() }), 10000), directory: text(4096) });
/** Exhaustive map: a new public async command must choose its result decoder. */
const results: { [Name in CommandName]: Decoder<CommandResult<Name>> } = {
  autostartSettings: object({ available: boolean, enabled: boolean, disabledByWindows: boolean, unavailableReason: optional(text(1000)) }),
  setAutostart: object({ available: boolean, enabled: boolean, disabledByWindows: boolean, unavailableReason: optional(text(1000)) }),
  googleCalendarSnapshot: decodeGoogleCalendarSnapshot, saveGoogleCalendarClient: decodeGoogleCalendarSnapshot, connectGoogleCalendar: decodeGoogleCalendarSnapshot,
  cancelGoogleCalendarLogin: decodeGoogleCalendarSnapshot, disconnectGoogleCalendar: decodeGoogleCalendarSnapshot, selectGoogleCalendar: decodeGoogleCalendarSnapshot,
  googleCalendarEvents: decodeCalendarEvents, openGoogleCalendarSetup: nothing,
  snapshot: decodeSnapshot, send: nothing, stop: nothing, stopJob: nothing, savePreferences: nothing, acknowledgeFullAccess: nothing,
  signInChatGPT: nothing, cancelChatGPTSignIn: nothing, signOutChatGPT: nothing, openChatGPTUsage: nothing,
  saveProvider: nothing, testProvider: nothing, checkSetup: object({ model: text(300), answer: text(4000) }), removeProvider: nothing, listSkills: skills, openSkillsFolder: nothing,
  saveSpeechKey: nothing, removeSpeechKey: nothing, testSpeech: audio, transcribe: text(20000), synthesize: audio,
  openWorkspace: nothing, revealFile: nothing, newConversation: nothing,
  memorySnapshot: decodeMemorySnapshot, rebuildMemory: decodeMemorySnapshot, startMemorySummary: nothing, readMemoryPeriod: decodeMemoryPeriod,
  editMemory: decodeMemorySnapshot, decideMemoryProposal: decodeMemorySnapshot, memorySource: decodeMemorySource, searchMemory: decodeMemorySearch,
};
export function isCommandName(value: unknown): value is CommandName { return typeof value === 'string' && Object.hasOwn(results, value); }
export function decodeResult<Name extends CommandName>(name: Name, value: unknown): CommandResult<Name> { return results[name](value); }
export function decodeResponse<Name extends CommandName>(name: Name, value: unknown): CommandResult<Name> {
  const response = record(value);
  if (!Object.hasOwn(response, 'ok')) return invalidPayload();
  if (response.ok === false) {
    if (Object.keys(response).length !== 2 || !Object.hasOwn(response, 'error')) return invalidPayload();
    throw new Error(text()(response.error));
  }
  if (response.ok !== true || Object.keys(response).length !== 2 || !Object.hasOwn(response, 'value')) return invalidPayload();
  return decodeResult(name, response.value);
}
