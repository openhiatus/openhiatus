import { isCommandName, type IpcResponse } from '../../shared/ipc';
import type { HandlerMap } from './command';
import { conversationHandlers } from './conversation';
import { memoryHandlers } from './memory';
import { settingsHandlers } from './settings';
import { speechHandlers } from './speech';
import { workspaceHandlers } from './workspace';
import type { IpcPorts } from './ports';

export function createIpcRouter(ports: IpcPorts) {
  // Static, exhaustive allowlist. No renderer-controlled property is invoked on an application object.
  const handlers: HandlerMap = Object.freeze({ ...conversationHandlers(ports), ...settingsHandlers(ports), ...speechHandlers(ports), ...memoryHandlers(ports), ...workspaceHandlers(ports) });
  return {
    async dispatch(method: unknown, args: unknown): Promise<IpcResponse> {
      try {
        if (!isCommandName(method)) throw new Error('Unbekannter Aufruf.');
        return { ok: true, value: await handlers[method](args) };
      } catch (error) { return { ok: false, error: ports.reportError(error) }; }
    },
  };
}
