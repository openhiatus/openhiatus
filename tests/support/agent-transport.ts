import { decodeCommandResult, decodeHostMessage, decodeParentMessage, ProtocolError,
  type AgentTransport, type CommandArgs, type CommandMethod, type CommandRequest, type HostPacket } from '../../src/main/agent-protocol.js';

/** Keep fakes on the same method/result boundary as the real JSONL transport. */
export function fakeCommandRequest(handle: (request: CommandRequest) => unknown | Promise<unknown>): AgentTransport['request'] {
  return async <M extends CommandMethod>(method: M, ...args: CommandArgs<M>) => {
    const request = decodeParentMessage({ method, params: args[0] ?? {} });
    if (request.method === undefined) throw new ProtocolError();
    return decodeCommandResult(method, await handle(request));
  };
}
export function fakeHostPacket(value: unknown): HostPacket {
  const packet = decodeHostMessage(value);
  if (packet.method === undefined || packet.method === 'openhiatus/host/child') throw new ProtocolError();
  return packet;
}
