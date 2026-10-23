import type { PreferencesPatch, ProviderInput } from '../../shared/contracts';
import { parseSkillFavorites } from '../../shared/skill-favorites';
import { computerDetailDivisor, computerOverviewDivisor } from '../../shared/computer-views';
import { computerImageRetentionCalls } from '../../shared/computer-task-settings';
import { command, inputObject, inputText, noArgs, type HandlerMap } from './command';
import type { IpcPorts } from './ports';

const booleanPreferences = ['speakReplies', 'voiceConversation', 'earcons', 'memoryAutoSummarize', 'chatgptBackgroundUsage', 'computerDelegationEnabled', 'computerFast'] as const;
const textPreferences = ['inputDeviceId', 'outputDeviceId', 'voiceId', 'model', 'dialogModel', 'memoryModel', 'computerModel'] as const;
const deviceMetadata = ['inputDeviceLabel', 'inputDeviceGroupId', 'outputDeviceLabel', 'outputDeviceGroupId'] as const;
function preferences(value: unknown): PreferencesPatch {
  const input = inputObject(value, [...booleanPreferences, ...textPreferences, ...deviceMetadata, 'skillFavorites', 'computerOverviewScaleDivisor', 'computerDetailScaleDivisor', 'computerImageRetentionCalls'], 'Ungültige Einstellungen.');
  const patch: PreferencesPatch = {};
  for (const key of booleanPreferences) if (Object.hasOwn(input, key)) {
    const item = input[key]; if (typeof item !== 'boolean') throw new Error('Ungültige Einstellung.'); patch[key] = item;
  }
  for (const key of textPreferences) if (Object.hasOwn(input, key)) {
    const item = input[key]; if (typeof item !== 'string' || item.length > 300) throw new Error('Ungültige Einstellung.'); patch[key] = item;
  }
  for (const key of deviceMetadata) if (Object.hasOwn(input, key)) {
    const item = input[key]; if (typeof item !== 'string' || item.length > 1000) throw new Error('Ungültige Geräteeinstellung.'); patch[key] = item;
  }
  if (Object.hasOwn(input, 'skillFavorites')) patch.skillFavorites = parseSkillFavorites(input.skillFavorites);
  if (Object.hasOwn(input, 'computerOverviewScaleDivisor')) patch.computerOverviewScaleDivisor = computerOverviewDivisor(input.computerOverviewScaleDivisor);
  if (Object.hasOwn(input, 'computerDetailScaleDivisor')) patch.computerDetailScaleDivisor = computerDetailDivisor(input.computerDetailScaleDivisor);
  if (Object.hasOwn(input, 'computerImageRetentionCalls')) patch.computerImageRetentionCalls = computerImageRetentionCalls(input.computerImageRetentionCalls);
  return patch;
}
function providerInput(value: unknown): ProviderInput {
  const input = inputObject(value, ['id', 'apiKey', 'baseUrl', 'models'], 'Ungültige Anbieterfelder.');
  const result: ProviderInput = { id: inputText(input.id, 100, 'Anbieter') };
  if (input.apiKey !== undefined) {
    if (typeof input.apiKey !== 'string' || input.apiKey.length > 4096) throw new Error('Ungültiger API-Schlüssel.'); result.apiKey = input.apiKey.trim();
  }
  if (input.baseUrl !== undefined) {
    if (typeof input.baseUrl !== 'string' || input.baseUrl.length > 2048) throw new Error('Ungültige Basis-URL.'); result.baseUrl = input.baseUrl.trim();
  }
  if (input.models !== undefined) {
    if (!Array.isArray(input.models) || input.models.length > 100) throw new Error('Ungültige Modellliste.');
    const models: readonly unknown[] = input.models;
    result.models = Array.from(models, model => inputText(model, 250, 'Modellkennung'));
  }
  return result;
}
export function settingsHandlers({ controller, platform }: IpcPorts): Pick<HandlerMap, 'savePreferences' | 'signInChatGPT' | 'cancelChatGPTSignIn' | 'signOutChatGPT' | 'openChatGPTUsage' | 'saveProvider' | 'testProvider' | 'removeProvider' | 'listSkills' | 'openSkillsFolder'> {
  return {
    savePreferences: command('savePreferences', 1, args => [preferences(args[0])], patch => controller.savePreferences(patch)),
    signInChatGPT: command('signInChatGPT', 0, noArgs, () => controller.signInChatGPT()),
    cancelChatGPTSignIn: command('cancelChatGPTSignIn', 0, noArgs, () => controller.cancelChatGPTSignIn()),
    signOutChatGPT: command('signOutChatGPT', 0, noArgs, () => controller.signOutChatGPT()),
    openChatGPTUsage: command('openChatGPTUsage', 0, noArgs, () => platform.openChatGPTUsage()),
    saveProvider: command('saveProvider', 1, args => [providerInput(args[0])], input => controller.saveProvider(input)),
    testProvider: command('testProvider', 1, args => [inputText(args[0], 100, 'Anbieter')], id => controller.testProvider(id)),
    removeProvider: command('removeProvider', 1, args => [inputText(args[0], 100, 'Anbieter')], id => controller.removeProvider(id)),
    listSkills: command('listSkills', 0, noArgs, () => controller.listSkills()),
    openSkillsFolder: command('openSkillsFolder', 0, noArgs, () => platform.openSkillsFolder()),
  };
}
