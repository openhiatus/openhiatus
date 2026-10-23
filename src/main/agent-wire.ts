import type { AgentEvent, DynamicFunctionTool, DynamicToolResponse } from '../shared/contracts.js';
import { MODEL_SERVICE_TIERS } from '../shared/model-requests.js';
import type { ResolvedModel } from './providers.js';
import { computerImageRetentionCalls, computerWorkingMemoryCalls } from '../shared/computer-task-settings';

export const MAX_PACKET_BYTES = 80 * 1024 * 1024;
export const MAX_PROMPT_CHARS = 1_000_000;
const MAX_TOOL_TEXT = 2_000_000;
const MAX_IMAGE_BASE64 = 56_000_000;
type Empty = Record<string, never>;
export interface HostRun {
  runId: string; text: string; workspace: string; home: string; model: ResolvedModel; threadId?: string;
  dialog: boolean; tools: DynamicFunctionTool[]; instructions: string; freshThreadContext?: string;
  computerOnly?: boolean; serviceTier?: 'fast';
  computerImageRetentionCalls?: number;
  computerWorkingMemoryCalls?: number;
}
export interface CommandParams {
  hello: Empty; run: HostRun; steer: { runId: string; text: string }; abort: Empty;
}
export interface CommandResults { hello: { protocol: 1 }; run: { accepted: true }; steer: { accepted: true }; abort: { stopped: true }; }
export type CommandMethod = keyof CommandParams;
export type CommandRequest<M extends CommandMethod = CommandMethod> = { [K in M]: { id?: string; method: K; params: CommandParams[K] } }[M];
export type CommandArgs<M extends CommandMethod> = M extends 'hello' | 'abort' ? [params?: CommandParams[M], timeoutMs?: number] : [params: CommandParams[M], timeoutMs?: number];
export interface HostRequestParams {
  tool: { runId: string; toolCallId: string; name: string; args: unknown };
  credential: { runId: string };
}
export type CredentialResult = { apiKey: string; error?: never } | { error: string; apiKey?: never };
export interface HostResults { tool: DynamicToolResponse; credential: CredentialResult; }
export type HostRequestMethod = keyof HostRequestParams;
export type HostRequest<M extends HostRequestMethod = HostRequestMethod> = { [K in M]: { id: string; method: K; params: HostRequestParams[K] } }[M];
export type HostResponseArgs = { [K in HostRequestMethod]: [request: HostRequest<K>, result: HostResults[K]] }[HostRequestMethod];
export type CommandResponseArgs = { [K in CommandMethod]: [request: CommandRequest<K>, result: CommandResults[K]] }[CommandMethod];
/** The host cannot publish main-process connection/model/desktop events. */
export type HostEvent = Extract<AgentEvent, { type: 'started' | 'delta' | 'commentary' | 'context' | 'usage' | 'model-request' | 'activity' | 'completed' }>;
export type HostNotification = { method: 'event'; params: { runId: string; event: HostEvent } };
export type NativeOwnership = { method: 'openhiatus/host/child'; params: { control: string; pid: number } };
/** A response has no method on the wire; its result remains unknown until ID lookup supplies that method. */
export type WireReply = { id: string; result: unknown; error?: never; method?: never } | { id: string; error: string; result?: never; method?: never };
export type TypedReply<Result> = { id: string; result: Result } | { id: string; error: string };
export type ParentToHost = CommandRequest | TypedReply<HostResults[HostRequestMethod]>;
export type HostToParent = HostRequest | HostNotification | NativeOwnership | TypedReply<CommandResults[CommandMethod]>;
export type DecodedHostMessage = HostRequest | HostNotification | NativeOwnership | WireReply;
export type DecodedParentMessage = CommandRequest | WireReply;

export class ProtocolError extends Error { constructor() { super('Ungültiges Agent-Protokoll.'); } }
function fail(): never { throw new ProtocolError(); }
export function isWireRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
const record = (value: unknown): Record<string, unknown> => isWireRecord(value) ? value : fail();
function text(value: unknown, max = MAX_PACKET_BYTES, nonempty = false): string {
  return typeof value === 'string' && value.length <= max && (!nonempty || Boolean(value.trim())) ? value : fail();
}
function identifier(value: unknown): string { const result = text(value, 512, true); return /[\r\n\0]/.test(result) ? fail() : result; }
function uuid(value: unknown): string { const result = identifier(value); return /^[a-f0-9-]{36}$/i.test(result) ? result : fail(); }
function finite(value: unknown, positive = false): number { return typeof value === 'number' && Number.isFinite(value) && (positive ? value > 0 : value >= 0) ? value : fail(); }
const optionalText = (value: unknown, max = MAX_PACKET_BYTES): string | undefined => value === undefined ? undefined : text(value, max);
function model(value: unknown): ResolvedModel {
  const input = record(value), apiKey = text(input.apiKey, 32_768);
  if (input.authType !== undefined && input.authType !== 'chatgpt') fail();
  if (!apiKey && input.authType !== 'chatgpt') fail();
  const baseUrl = optionalText(input.baseUrl, 32_768);
  if (baseUrl !== undefined) { let url: URL; try { url = new URL(baseUrl); } catch { return fail(); } if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) fail(); }
  return { provider: identifier(input.provider), modelId: text(input.modelId, 4096, true), api: identifier(input.api), apiKey,
    ...(baseUrl === undefined ? {} : { baseUrl }), ...(input.authType === 'chatgpt' ? { authType: 'chatgpt' } : {}) };
}
function toolDefinition(value: unknown): DynamicFunctionTool {
  const input = record(value);
  if (input.type !== 'function' || !isWireRecord(input.inputSchema) || (input.deferLoading !== undefined && typeof input.deferLoading !== 'boolean')) fail();
  return { type: 'function', name: identifier(input.name), description: text(input.description, MAX_PROMPT_CHARS), inputSchema: input.inputSchema,
    ...(input.deferLoading === undefined ? {} : { deferLoading: input.deferLoading }) };
}
export function decodeRun(value: unknown): HostRun {
  const input = record(value);
  if (typeof input.dialog !== 'boolean' || !Array.isArray(input.tools) || input.tools.length > 100) fail();
  if (input.computerOnly !== undefined && typeof input.computerOnly !== 'boolean') fail();
  if (input.computerOnly && input.dialog) fail();
  if (input.serviceTier !== undefined && (input.serviceTier !== 'fast' || !input.computerOnly)) fail();
  const tools = Array.from(input.tools, toolDefinition);
  if (new Set(tools.map(tool => tool.name)).size !== tools.length) fail();
  const threadId = input.threadId === undefined ? undefined : uuid(input.threadId);
  const freshThreadContext = optionalText(input.freshThreadContext, MAX_PACKET_BYTES);
  let imageRetention: number | undefined;
  if (input.computerImageRetentionCalls !== undefined) {
    try { imageRetention = computerImageRetentionCalls(input.computerImageRetentionCalls); } catch { return fail(); }
  }
  let workingMemory: number | undefined;
  if (input.computerWorkingMemoryCalls !== undefined) {
    try { workingMemory = computerWorkingMemoryCalls(input.computerWorkingMemoryCalls); } catch { return fail(); }
  }
  return { runId: uuid(input.runId), text: text(input.text, MAX_PROMPT_CHARS, true), workspace: text(input.workspace, 32_768, true), home: text(input.home, 32_768, true),
    instructions: text(input.instructions, MAX_PROMPT_CHARS), model: model(input.model), dialog: input.dialog, tools,
    ...(input.computerOnly === undefined ? {} : { computerOnly: input.computerOnly }), ...(input.serviceTier === undefined ? {} : { serviceTier: input.serviceTier }),
    ...(imageRetention === undefined ? {} : { computerImageRetentionCalls: imageRetention }),
    ...(workingMemory === undefined ? {} : { computerWorkingMemoryCalls: workingMemory }),
    ...(threadId === undefined ? {} : { threadId }), ...(freshThreadContext === undefined ? {} : { freshThreadContext }) };
}
export function decodeToolResponse(value: unknown): DynamicToolResponse {
  const input = record(value);
  if (typeof input.success !== 'boolean' || !Array.isArray(input.contentItems) || input.contentItems.length > 32) fail();
  const contentItems: DynamicToolResponse['contentItems'] = Array.from(input.contentItems, value => {
    const item = record(value);
    if (item.type === 'inputText') return { type: 'inputText', text: text(item.text, MAX_TOOL_TEXT) };
    if (item.type !== 'inputImage') return fail();
    const imageUrl = text(item.imageUrl, MAX_IMAGE_BASE64 + 32);
    const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]*={0,2})$/.exec(imageUrl);
    if (!match || match[2].length > MAX_IMAGE_BASE64 || match[2].length % 4 !== 0) return fail();
    if (item.computerView !== undefined && item.computerView !== 'overview' && item.computerView !== 'detail') fail();
    return { type: 'inputImage', imageUrl, ...(item.computerView === undefined ? {} : { computerView: item.computerView }) };
  });
  return { success: input.success, contentItems };
}
function credential(value: unknown): CredentialResult {
  const input = record(value);
  if (input.error !== undefined) { if (input.apiKey !== undefined) fail(); return { error: text(input.error, MAX_PACKET_BYTES, true) }; }
  const apiKey = text(input.apiKey, 32_000, true);
  if (/[\r\n\0]/.test(apiKey)) fail();
  return { apiKey };
}
const commandResultDecoders: { [M in CommandMethod]: (value: unknown) => CommandResults[M] } = {
  hello: value => { if (record(value).protocol !== 1) fail(); return { protocol: 1 }; },
  run: value => { if (record(value).accepted !== true) fail(); return { accepted: true }; },
  steer: value => { if (record(value).accepted !== true) fail(); return { accepted: true }; },
  abort: value => { if (record(value).stopped !== true) fail(); return { stopped: true }; },
};
const hostResultDecoders: { [M in HostRequestMethod]: (value: unknown) => HostResults[M] } = { tool: decodeToolResponse, credential };
export function decodeCommandResult<M extends CommandMethod>(method: M, value: unknown): CommandResults[M] { return commandResultDecoders[method](value); }
export function decodeHostResult<M extends HostRequestMethod>(method: M, value: unknown): HostResults[M] { return hostResultDecoders[method](value); }
function event(value: unknown): HostEvent {
  const input = record(value);
  switch (input.type) {
    case 'started': return { type: 'started', threadId: identifier(input.threadId), turnId: identifier(input.turnId) };
    case 'delta': return { type: 'delta', text: text(input.text) };
    case 'commentary': return { type: 'commentary', text: text(input.text), ...(input.itemId === undefined ? {} : { itemId: identifier(input.itemId) }) };
    case 'context': return { type: 'context', threadId: identifier(input.threadId), usedTokens: finite(input.usedTokens), ...(input.windowTokens === undefined ? {} : { windowTokens: finite(input.windowTokens, true) }) };
    case 'usage': {
      const usage = record(input.usage);
      return { type: 'usage', usage: { inputTokens: finite(usage.inputTokens), outputTokens: finite(usage.outputTokens), cacheReadTokens: finite(usage.cacheReadTokens), cacheWriteTokens: finite(usage.cacheWriteTokens),
        ...(usage.costUsd === undefined ? {} : { costUsd: finite(usage.costUsd) }) } };
    }
    case 'model-request': {
      const request = record(input.request);
      if (typeof request.role !== 'string' || !['dialog', 'worker', 'computer'].includes(request.role)
        || typeof request.status !== 'string' || !['completed', 'failed', 'aborted'].includes(request.status)) fail();
      if (request.requestedServiceTier !== undefined && request.requestedServiceTier !== 'fast') fail();
      if (request.actualServiceTier !== undefined && (typeof request.actualServiceTier !== 'string' || !(MODEL_SERVICE_TIERS as readonly string[]).includes(request.actualServiceTier))) fail();
      const usage = request.usage === undefined ? undefined : record(request.usage);
      return { type: 'model-request', request: { role: request.role as 'dialog' | 'worker' | 'computer', model: identifier(request.model),
        status: request.status as 'completed' | 'failed' | 'aborted', elapsedMs: finite(request.elapsedMs),
        ...(request.requestedServiceTier === undefined ? {} : { requestedServiceTier: 'fast' }),
        ...(request.actualServiceTier === undefined ? {} : { actualServiceTier: request.actualServiceTier as string }),
        ...(usage ? { usage: { inputTokens: finite(usage.inputTokens), outputTokens: finite(usage.outputTokens), cacheReadTokens: finite(usage.cacheReadTokens), cacheWriteTokens: finite(usage.cacheWriteTokens),
          ...(usage.costUsd === undefined ? {} : { costUsd: finite(usage.costUsd) }) } } : {}) } };
    }
    case 'activity': {
      const kind = input.kind;
      if (kind !== 'system' && kind !== 'command' && kind !== 'file' && kind !== 'error') return fail();
      return { type: 'activity', kind, title: text(input.title), ...(input.detail === undefined ? {} : { detail: text(input.detail) }) };
    }
    case 'completed': {
      if (input.status !== 'completed' && input.status !== 'interrupted' && input.status !== 'failed') return fail();
      if (input.status === 'completed' && input.error !== undefined) return fail();
      return { type: 'completed', status: input.status, ...(input.text === undefined ? {} : { text: text(input.text) }), ...(input.error === undefined ? {} : { error: text(input.error) }) };
    }
    default: return fail();
  }
}
function reply(input: Record<string, unknown>): WireReply {
  const id = identifier(input.id);
  if (input.method !== undefined || input.params !== undefined) return fail();
  if (Object.hasOwn(input, 'error')) {
    if (Object.hasOwn(input, 'result')) return fail();
    return { id, error: text(input.error, MAX_PACKET_BYTES, true) };
  }
  if (!Object.hasOwn(input, 'result')) return fail();
  return { id, result: input.result };
}
function envelope(value: unknown): Record<string, unknown> {
  const input = record(value);
  if (input.method !== undefined && (Object.hasOwn(input, 'result') || Object.hasOwn(input, 'error'))) fail();
  return input;
}
export function decodeHostMessage(value: unknown): DecodedHostMessage {
  const input = envelope(value);
  if (input.method === undefined) return reply(input);
  const params = record(input.params);
  switch (input.method) {
    case 'event': if (input.id !== undefined) return fail(); return { method: 'event', params: { runId: identifier(params.runId), event: event(params.event) } };
    case 'tool': return { id: identifier(input.id), method: 'tool', params: { runId: identifier(params.runId), toolCallId: identifier(params.toolCallId), name: identifier(params.name), args: params.args } };
    case 'credential': return { id: identifier(input.id), method: 'credential', params: { runId: identifier(params.runId) } };
    case 'openhiatus/host/child': {
      if (input.id !== undefined || !Number.isSafeInteger(params.pid) || typeof params.pid !== 'number' || params.pid <= 0 || params.pid > 0xffffffff) return fail();
      return { method: 'openhiatus/host/child', params: { control: uuid(params.control), pid: params.pid } };
    }
    default: return fail();
  }
}
export function decodeParentMessage(value: unknown): DecodedParentMessage {
  const input = envelope(value);
  if (input.method === undefined) return reply(input);
  const id = input.id === undefined ? undefined : identifier(input.id);
  const header = id === undefined ? {} : { id };
  switch (input.method) {
    case 'hello': record(input.params ?? {}); return { ...header, method: 'hello', params: {} };
    case 'abort': record(input.params ?? {}); return { ...header, method: 'abort', params: {} };
    case 'run': return { ...header, method: 'run', params: decodeRun(input.params) };
    case 'steer': { const params = record(input.params); return { ...header, method: 'steer', params: { runId: identifier(params.runId), text: text(params.text, MAX_PROMPT_CHARS) } }; }
    default: return fail();
  }
}
