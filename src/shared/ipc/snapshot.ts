import type { ComputerFrame, Snapshot } from '../contracts';
import { MAX_COMPUTER_DETAIL_PIXELS, type ComputerObservation, type ComputerRect } from '../computer-views';
import { parseSkillFavorites } from '../skill-favorites';
import { parseComputerTaskSettings } from '../computer-task-settings';
import { parseModelRequestSummaries } from '../model-requests';
import { array, boolean, choice, integer, invalidPayload, number, object, optional, text, type Decoder } from './decode';

const id = text(1024), at = text(100), short = text(4096), body = text();
export const taskStatus = choice(['idle', 'running', 'stopping', 'completed', 'interrupted', 'failed']);
export const messageFields = { id, role: choice(['user', 'assistant']), text: body, at, source: optional(choice(['agent'])), jobId: optional(id) };
export const summary = object({ status: taskStatus, mode: choice(['auto', 'manual']), model: short, calls: integer, maxCalls: integer,
  completed: integer, total: integer, remaining: integer, currentDocumentId: optional(id), currentTitle: optional(body), error: optional(body), startedAt: optional(at) });
const usage = object({ inputTokens: number, outputTokens: number, cacheReadTokens: number, cacheWriteTokens: number, costUsd: optional(number) });
const models = array(object({ id, label: short, provider: optional(short) }), 10000);
const overviewPreference: Decoder<number> = value => {
  const divisor = number(value);
  return divisor >= 1 && divisor <= 64 ? divisor : invalidPayload();
};
export const decodeSnapshot: Decoder<Snapshot> = object({
  messages: array(object(messageFields), 10000),
  activity: array(object({ id, at, kind: choice(['system', 'command', 'file', 'error']), title: body, detail: optional(body) }), 20000),
  task: object({ id, status: taskStatus, threadId: optional(body), turnId: optional(body), error: optional(body) }),
  preferences: object({ inputDeviceId: short, outputDeviceId: short, speakReplies: boolean, voiceId: short, model: short, dialogModel: short, memoryModel: short,
    inputDeviceLabel: optional(text(1000)), inputDeviceGroupId: optional(text(1000)), outputDeviceLabel: optional(text(1000)), outputDeviceGroupId: optional(text(1000)),
    memoryAutoSummarize: optional(boolean), voiceConversation: optional(boolean), earcons: optional(boolean), skillFavorites: optional(parseSkillFavorites),
    fullAccessAcknowledged: optional(boolean), chatgptBackgroundUsage: optional(boolean), computerOverviewScaleDivisor: optional(overviewPreference),
    computerDelegationEnabled: optional(boolean), computerModel: optional(text(300)), computerFast: optional(boolean) }),
  connections: object({ agent: choice(['offline', 'missing', 'ready', 'connecting']), account: body, speech: choice(['missing', 'saved', 'verified']) }),
  models,
  providers: optional(array(object({ id, label: short, configured: boolean, verified: boolean, baseUrl: optional(short), models,
    error: optional(body), authType: optional(choice(['api-key', 'chatgpt'])), account: optional(body) }), 1000)),
  chatgpt: optional(object({ status: choice(['signed-out', 'signing-in', 'signed-in', 'error']), account: optional(body), planUsage: boolean, error: optional(body) })),
  hotkeys: optional(object({ recording: boolean, submit: boolean, stop: boolean })),
  workspace: short, version: short,
  jobs: optional(array(object({ id, requestId: short, title: body, prompt: body, status: choice(['queued', 'running', 'stopping', 'completed', 'interrupted', 'failed']),
    createdAt: at, updatedAt: at, model: short, resources: array(short, 24), threadId: optional(body), turnId: optional(body), result: optional(body), error: optional(body),
    runtimeRetained: optional(boolean), usage: optional(usage), computer: optional(parseComputerTaskSettings), modelRequests: optional(parseModelRequestSummaries) }), 1000)),
  speech: optional(array(object({ id, text: body, at, jobId: optional(id), kind: optional(choice(['progress', 'receipt'])) }), 1000)),
  summary: optional(summary), context: optional(object({ threadId: body, usedTokens: number, windowTokens: optional(number), at })), usage: optional(usage),
});
const positive: Decoder<number> = value => { const result = number(value); return result > 0 ? result : invalidPayload(); };
const dimension: Decoder<number> = value => { const result = integer(value); return result > 0 ? result : invalidPayload(); };
const viewId: Decoder<string> = value => { const result = id(value); return result.trim() ? result : invalidPayload(); };
const fraction: Decoder<number> = value => { const result = number(value); return result <= 1 ? result : invalidPayload(); };
const png: Decoder<string> = value => {
  // Match NativeComputer's existing 56,000,000-character PNG base64 contract.
  const result = text(56_000_000 + 'data:image/png;base64,'.length)(value);
  return result.startsWith('data:image/png;base64,') ? result : invalidPayload();
};
const rect = object({ x: integer, y: integer, width: dimension, height: dimension });
function withinScreen(value: ComputerRect, width: number, height: number): boolean {
  // Subtraction avoids overflowing safe integer coordinates when checking bounds.
  return value.x <= width - value.width && value.y <= height - value.height;
}
const observation: Decoder<ComputerObservation> = value => {
  const result = object({
    version: (version: unknown) => version === 2 ? 2 as const : invalidPayload(), frameId: viewId, at, displayId: choice(['primary']),
    screenWidth: dimension, screenHeight: dimension, scaleFactor: positive, overviewScaleDivisor: overviewPreference,
    views: array(object({ viewId, kind: choice(['overview', 'detail']), imageWidth: dimension, imageHeight: dimension, sourceRect: rect, dataUrl: png }), 2),
    selection: object({ rect: optional(rect), reason: choice(['manual', 'model-hint', 'visual-change', 'retained', 'action-point', 'none']),
      changedPixels: optional(integer), changedFraction: optional(fraction), candidates: optional(integer) }),
    timings: object({ imageProcessingMs: number, regionSelectionMs: number }),
  })(value);
  const [overview, detail] = result.views;
  if (!overview || overview.kind !== 'overview' || (detail && detail.kind !== 'detail') ||
    overview.sourceRect.x !== 0 || overview.sourceRect.y !== 0 || overview.sourceRect.width !== result.screenWidth || overview.sourceRect.height !== result.screenHeight ||
    overview.imageWidth !== Math.max(1, Math.round(result.screenWidth / result.overviewScaleDivisor)) ||
    overview.imageHeight !== Math.max(1, Math.round(result.screenHeight / result.overviewScaleDivisor)) ||
    new Set(result.views.map(view => view.viewId)).size !== result.views.length) return invalidPayload();
  for (const view of result.views) if (!withinScreen(view.sourceRect, result.screenWidth, result.screenHeight)) return invalidPayload();
  if (detail && (detail.imageWidth !== detail.sourceRect.width || detail.imageHeight !== detail.sourceRect.height ||
    detail.imageWidth > MAX_COMPUTER_DETAIL_PIXELS / detail.imageHeight)) return invalidPayload();
  if (result.selection.rect && !withinScreen(result.selection.rect, result.screenWidth, result.screenHeight)) return invalidPayload();
  if (result.selection.changedPixels !== undefined && result.selection.changedPixels / result.screenWidth > result.screenHeight) return invalidPayload();
  return result;
};
export const decodeComputerFrame: Decoder<ComputerFrame> = value => {
  const frame = object({ dataUrl: png, frameId: id, width: dimension, height: dimension, at, observation: optional(observation) })(value);
  if (frame.observation) {
    const current = frame.observation, overview = current.views[0];
    if (current.frameId !== frame.frameId || current.at !== frame.at || overview.dataUrl !== frame.dataUrl ||
      overview.imageWidth !== frame.width || overview.imageHeight !== frame.height) return invalidPayload();
  }
  return frame;
};
