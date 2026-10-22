import type { MemoryPeriodRequest } from '../../shared/memory';
import type { MemoryEditRequest } from '../../shared/ipc';
import { command, inputObject, inputText, noArgs, type HandlerMap } from './command';
import type { IpcPorts } from './ports';

function periodRequest(value: unknown): MemoryPeriodRequest {
  const input = inputObject(value, ['documentId', 'date', 'cursor', 'maxBytes'], 'Ungültiger Gedächtnisabruf.');
  const result: MemoryPeriodRequest = {};
  for (const key of ['documentId', 'date', 'cursor'] as const) if (input[key] !== undefined) {
    const item = input[key];
    if (typeof item !== 'string' || item.length > (key === 'cursor' ? 2000 : 160)) throw new Error('Ungültiger Zeitraum oder Fortsetzungsverweis.');
    result[key] = item;
  }
  if (input.maxBytes !== undefined) {
    if (typeof input.maxBytes !== 'number' || !Number.isSafeInteger(input.maxBytes) || input.maxBytes < 512 || input.maxBytes > 10000) throw new Error('Ungültige Seitengröße.');
    result.maxBytes = input.maxBytes;
  }
  return result;
}
function memoryEdit(value: unknown): MemoryEditRequest {
  const input = inputObject(value, ['id', 'content', 'expectedVersion'], 'Ungültige Gedächtnisänderung.');
  if (typeof input.content !== 'string' || input.content.length > 20000 || typeof input.expectedVersion !== 'number'
    || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw new Error('Ungültige Gedächtnisänderung.');
  return { id: inputText(input.id, 100, 'Dokumentkennung'), content: input.content, expectedVersion: input.expectedVersion };
}
export function memoryHandlers({ controller }: IpcPorts): Pick<HandlerMap, 'memorySnapshot' | 'rebuildMemory' | 'startMemorySummary' | 'readMemoryPeriod' | 'memorySource' | 'searchMemory' | 'editMemory' | 'decideMemoryProposal'> {
  return {
    memorySnapshot: command('memorySnapshot', 0, noArgs, () => controller.memorySnapshot()),
    rebuildMemory: command('rebuildMemory', 0, noArgs, () => controller.rebuildMemory()),
    startMemorySummary: command('startMemorySummary', 0, noArgs, () => controller.startMemorySummary()),
    readMemoryPeriod: command('readMemoryPeriod', 1, args => [periodRequest(args[0])], request => controller.readMemoryPeriod(request)),
    memorySource: command('memorySource', 1, args => [inputText(args[0], 160, 'Quellenkennung')], id => controller.memorySource(id)),
    searchMemory: command('searchMemory', 1, args => {
      if (typeof args[0] !== 'string' || args[0].length > 500) throw new Error('Die Suche ist zu lang.'); return [args[0]];
    }, query => controller.searchMemory(query)),
    editMemory: command('editMemory', 1, args => [memoryEdit(args[0])], edit => controller.editMemory(edit.id, edit.content, edit.expectedVersion)),
    decideMemoryProposal: command('decideMemoryProposal', 2, args => {
      if (args[1] !== 'approve' && args[1] !== 'reject') throw new Error('Ungültige Entscheidung.');
      return [inputText(args[0], 100, 'Vorschlagskennung'), args[1]];
    }, (id, decision) => controller.decideMemoryProposal(id, decision)),
  };
}
