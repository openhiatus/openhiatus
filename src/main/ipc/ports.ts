import type { OpenhiatusApi } from '../../shared/contracts';
import type { CommandName, CommandResult } from '../../shared/ipc';
import type { GoogleCalendarApi } from '../../shared/calendar';

export type MaybePromise<Value> = Value | Promise<Value>;
type PlatformCommand = 'openWorkspace' | 'openSkillsFolder' | 'openChatGPTUsage' | 'revealFile';
type PublicArgs<Name extends CommandName> = OpenhiatusApi[Name] extends (...args: infer Args) => Promise<unknown> ? Args : never;
/** Structural port: the IPC layer has no dependency on the concrete AppController. */
export type IpcControllerPort = {
  [Name in Exclude<CommandName, PlatformCommand | keyof GoogleCalendarApi>]: (...args: PublicArgs<Name>) => MaybePromise<CommandResult<Name>>;
};
export interface IpcPlatformPort {
  stopActivityPresence(): void;
  openWorkspace(): Promise<void>;
  openSkillsFolder(): Promise<void>;
  openChatGPTUsage(): Promise<void>;
  revealFile(path: string): Promise<void>;
}
export interface IpcPorts {
  calendar?: GoogleCalendarApi;
  controller: IpcControllerPort;
  platform: IpcPlatformPort;
  reportError(error: unknown): string;
}
