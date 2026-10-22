import { command, inputText, noArgs, type HandlerMap } from './command';
import type { IpcPorts } from './ports';

export function workspaceHandlers({ platform }: IpcPorts): Pick<HandlerMap, 'openWorkspace' | 'revealFile'> {
  return {
    openWorkspace: command('openWorkspace', 0, noArgs, () => platform.openWorkspace()),
    revealFile: command('revealFile', 1, args => [inputText(args[0], 4096, 'Dateiverweis')], path => platform.revealFile(path)),
  };
}
