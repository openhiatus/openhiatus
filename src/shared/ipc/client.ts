import type { OpenhiatusApi } from '../contracts';
import type { CommandArgs, CommandName, CommandResult, IpcClientTransport, IpcEvents } from './contracts';
import { nothing, type Decoder } from './decode';
import { decodeResponse } from './results';
import { decodeComputerFrame, decodeSnapshot } from './snapshot';

const events: { [Channel in keyof IpcEvents]: Decoder<IpcEvents[Channel]> } = {
  'openhiatus:state': decodeSnapshot, 'openhiatus:computer-frame': decodeComputerFrame,
  'openhiatus:emergency-stop': nothing, 'openhiatus:toggle-recording': nothing, 'openhiatus:submit-draft': nothing,
};
export function createIpcInvoker(invoke: IpcClientTransport['invoke']) {
  return async <Name extends CommandName>(name: Name, ...args: CommandArgs<NoInfer<Name>>): Promise<CommandResult<Name>> => {
    const raw: unknown = await invoke(name, args);
    return decodeResponse(name, raw);
  };
}
/** No Electron objects enter the public API, including callbacks for payload-free events. */
export function createOpenhiatusApi(transport: IpcClientTransport): OpenhiatusApi {
  const call = createIpcInvoker((name, args) => transport.invoke(name, args));
  function subscribe<Channel extends keyof IpcEvents>(channel: Channel, listener: (payload: IpcEvents[Channel]) => void): () => void {
    return transport.subscribe(channel, raw => {
      let payload: IpcEvents[Channel];
      try { payload = events[channel](raw); } catch { return; }
      listener(payload);
    });
  }
  return {
    googleCalendarSnapshot: () => call('googleCalendarSnapshot'), saveGoogleCalendarClient: client => call('saveGoogleCalendarClient', client), connectGoogleCalendar: () => call('connectGoogleCalendar'),
    cancelGoogleCalendarLogin: () => call('cancelGoogleCalendarLogin'), disconnectGoogleCalendar: () => call('disconnectGoogleCalendar'), selectGoogleCalendar: id => call('selectGoogleCalendar', id),
    googleCalendarEvents: query => call('googleCalendarEvents', query), openGoogleCalendarSetup: () => call('openGoogleCalendarSetup'),
    snapshot: () => call('snapshot'), subscribe: listener => subscribe('openhiatus:state', listener),
    onStop: listener => subscribe('openhiatus:emergency-stop', () => listener()),
    onToggleRecording: listener => subscribe('openhiatus:toggle-recording', () => listener()),
    onSubmitDraft: listener => subscribe('openhiatus:submit-draft', () => listener()),
    onComputerFrame: listener => subscribe('openhiatus:computer-frame', listener),
    publishActivityPresence: state => transport.publishActivityPresence(state),
    send: (text, requestId) => call('send', text, requestId), stop: () => call('stop'), stopJob: id => call('stopJob', id),
    savePreferences: patch => call('savePreferences', patch), acknowledgeFullAccess: () => call('acknowledgeFullAccess'),
    signInChatGPT: () => call('signInChatGPT'), cancelChatGPTSignIn: () => call('cancelChatGPTSignIn'), signOutChatGPT: () => call('signOutChatGPT'),
    openChatGPTUsage: () => call('openChatGPTUsage'), saveProvider: input => call('saveProvider', input), testProvider: id => call('testProvider', id), removeProvider: id => call('removeProvider', id),
    listSkills: () => call('listSkills'), openSkillsFolder: () => call('openSkillsFolder'),
    saveSpeechKey: key => call('saveSpeechKey', key), removeSpeechKey: () => call('removeSpeechKey'), testSpeech: () => call('testSpeech'),
    transcribe: clip => call('transcribe', clip), synthesize: text => call('synthesize', text),
    openWorkspace: () => call('openWorkspace'), revealFile: path => call('revealFile', path), newConversation: () => call('newConversation'),
    memorySnapshot: () => call('memorySnapshot'), rebuildMemory: () => call('rebuildMemory'), startMemorySummary: () => call('startMemorySummary'),
    readMemoryPeriod: request => call('readMemoryPeriod', request), editMemory: (id, content, expectedVersion) => call('editMemory', { id, content, expectedVersion }),
    decideMemoryProposal: (id, decision) => call('decideMemoryProposal', id, decision), memorySource: id => call('memorySource', id), searchMemory: query => call('searchMemory', query),
  };
}
