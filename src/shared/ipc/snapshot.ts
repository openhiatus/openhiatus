import type { ComputerFrame, Snapshot } from '../contracts';
import { parseSkillFavorites } from '../skill-favorites';
import { array, boolean, choice, integer, invalidPayload, number, object, optional, text, type Decoder } from './decode';

const id = text(1024), at = text(100), short = text(4096), body = text();
export const taskStatus = choice(['idle', 'running', 'stopping', 'completed', 'interrupted', 'failed']);
export const messageFields = { id, role: choice(['user', 'assistant']), text: body, at, source: optional(choice(['agent'])), jobId: optional(id) };
export const summary = object({ status: taskStatus, mode: choice(['auto', 'manual']), model: short, calls: integer, maxCalls: integer,
  completed: integer, total: integer, remaining: integer, currentDocumentId: optional(id), currentTitle: optional(body), error: optional(body), startedAt: optional(at) });
const usage = object({ inputTokens: number, outputTokens: number, cacheReadTokens: number, cacheWriteTokens: number, costUsd: optional(number) });
const models = array(object({ id, label: short, provider: optional(short) }), 10000);
export const decodeSnapshot: Decoder<Snapshot> = object({
  messages: array(object(messageFields), 10000),
  activity: array(object({ id, at, kind: choice(['system', 'command', 'file', 'error']), title: body, detail: optional(body) }), 20000),
  task: object({ id, status: taskStatus, threadId: optional(body), turnId: optional(body), error: optional(body) }),
  preferences: object({ inputDeviceId: short, outputDeviceId: short, speakReplies: boolean, voiceId: short, model: short, dialogModel: short, memoryModel: short,
    inputDeviceLabel: optional(text(1000)), inputDeviceGroupId: optional(text(1000)), outputDeviceLabel: optional(text(1000)), outputDeviceGroupId: optional(text(1000)),
    memoryAutoSummarize: optional(boolean), voiceConversation: optional(boolean), earcons: optional(boolean), skillFavorites: optional(parseSkillFavorites),
    fullAccessAcknowledged: optional(boolean), chatgptBackgroundUsage: optional(boolean) }),
  connections: object({ agent: choice(['offline', 'missing', 'ready', 'connecting']), account: body, speech: choice(['missing', 'saved', 'verified']) }),
  models,
  providers: optional(array(object({ id, label: short, configured: boolean, verified: boolean, baseUrl: optional(short), models,
    error: optional(body), authType: optional(choice(['api-key', 'chatgpt'])), account: optional(body) }), 1000)),
  chatgpt: optional(object({ status: choice(['signed-out', 'signing-in', 'signed-in', 'error']), account: optional(body), planUsage: boolean, error: optional(body) })),
  hotkeys: optional(object({ recording: boolean, submit: boolean, stop: boolean })),
  workspace: short, version: short,
  jobs: optional(array(object({ id, requestId: short, title: body, prompt: body, status: choice(['queued', 'running', 'stopping', 'completed', 'interrupted', 'failed']),
    createdAt: at, updatedAt: at, model: short, resources: array(short, 24), threadId: optional(body), turnId: optional(body), result: optional(body), error: optional(body),
    runtimeRetained: optional(boolean), usage: optional(usage) }), 1000)),
  speech: optional(array(object({ id, text: body, at, jobId: optional(id), kind: optional(choice(['progress', 'receipt'])) }), 1000)),
  summary: optional(summary), context: optional(object({ threadId: body, usedTokens: number, windowTokens: optional(number), at })), usage: optional(usage),
});
export const decodeComputerFrame: Decoder<ComputerFrame> = value => {
  // Match NativeComputer's existing 56,000,000-character PNG base64 contract.
  const frame = object({ dataUrl: text(56_000_000 + 'data:image/png;base64,'.length), frameId: id, width: integer, height: integer, at })(value);
  if (!frame.dataUrl.startsWith('data:image/png;base64,') || !frame.width || !frame.height) return invalidPayload();
  return frame;
};
