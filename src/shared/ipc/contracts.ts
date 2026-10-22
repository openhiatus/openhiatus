import type { OpenhiatusApi, ComputerFrame, Snapshot, VoiceOverlayState } from '../contracts';

/** The public async API is the source of truth for command argument and result types. */
type ApiCommands = {
  [Name in keyof OpenhiatusApi as OpenhiatusApi[Name] extends (...args: never[]) => Promise<unknown> ? Name : never]:
    OpenhiatusApi[Name] extends (...args: infer Args) => Promise<infer Result> ? { args: Args; result: Result } : never;
};
export interface MemoryEditRequest { id: string; content: string; expectedVersion: number; }
/** Keep the established editMemory wire shape while its public API takes three arguments. */
export type IpcCommands = Omit<ApiCommands, 'editMemory'> & {
  editMemory: { args: [edit: MemoryEditRequest]; result: ApiCommands['editMemory']['result'] };
};
export type CommandName = keyof IpcCommands;
export type CommandArgs<Name extends CommandName> = IpcCommands[Name]['args'];
export type CommandResult<Name extends CommandName> = IpcCommands[Name]['result'];
export type IpcResponse<Name extends CommandName = CommandName> =
  | { ok: true; value: CommandResult<Name> }
  | { ok: false; error: string };
export type IpcRequest = { [Name in CommandName]: { method: Name; args: CommandArgs<Name> } }[CommandName];

export interface IpcEvents {
  'openhiatus:state': Snapshot;
  'openhiatus:computer-frame': ComputerFrame;
  'openhiatus:emergency-stop': undefined;
  'openhiatus:toggle-recording': undefined;
  'openhiatus:submit-draft': undefined;
}
export interface IpcClientTransport {
  invoke(method: CommandName, args: readonly unknown[]): Promise<unknown>;
  subscribe(channel: keyof IpcEvents, listener: (payload: unknown) => void): () => void;
  publishVoiceOverlay(state: VoiceOverlayState): void;
}
