import type { TaskStatus } from './contracts';
import { array, choice, object, optional, text, type Decoder } from './ipc/decode';

/** Host observations, never a claim that the user's intended outcome was verified. */
export interface WorkAction {
  id: string; tool: string; status: 'running' | 'completed' | 'failed' | 'interrupted';
  startedAt: string; updatedAt: string; target?: string;
}
export interface WorkItem {
  id: string; kind: 'conversation' | 'direct' | 'background'; sessionId: string;
  requestId: string; parentId?: string; answerId?: string;
  title: string; prompt: string; status: Exclude<TaskStatus, 'idle'> | 'queued';
  createdAt: string; updatedAt: string; resources: string[];
  result?: string; error?: string; actions: WorkAction[];
}
export interface WorkActionEvent {
  type: 'work-action'; id: string; tool: string;
  status: 'running' | 'completed' | 'failed'; target?: string;
}
const id = text(1024), at = text(100);
export const decodeWorkActionEvent: Decoder<WorkActionEvent> = object({
  type: choice(['work-action']), id, tool: text(512), status: choice(['running', 'completed', 'failed']), target: optional(text(4096)),
});
export const decodeWorkItems: Decoder<WorkItem[]> = array(object({
  id, kind: choice(['conversation', 'direct', 'background']), sessionId: id, requestId: id,
  parentId: optional(id), answerId: optional(id), title: text(200), prompt: text(32000),
  status: choice(['queued', 'running', 'stopping', 'completed', 'interrupted', 'failed']),
  createdAt: at, updatedAt: at, resources: array(text(4096), 24), result: optional(text(200000)), error: optional(text(200000)),
  actions: array(object({ id, tool: text(512), status: choice(['running', 'completed', 'failed', 'interrupted']),
    startedAt: at, updatedAt: at, target: optional(text(4096)) }), 10000),
}), 10000);

export const requestWorkId = (id: string): string => `request:${id}`;
export const jobWorkId = (id: string): string => `job:${id}`;
/** Deliberately excludes typed text, file contents, images, and raw tool responses. */
export function workActionTarget(tool: string, args: unknown): string | undefined {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return;
  const values = args as Record<string, unknown>;
  const fields = tool === 'computer' || tool === 'screen_help' ? ['action']
    : ['read', 'write', 'edit', 'ls', 'find', 'grep'].includes(tool) ? ['path', 'file_path']
    : tool === 'start_task' ? ['title'] : ['steer_task', 'status_task', 'cancel_task'].includes(tool) ? ['jobId']
    : tool === 'bash' ? ['command'] : [];
  const value = fields.map(field => values[field]).find(value => typeof value === 'string');
  if (typeof value === 'string') return value.length > 1000 ? `${value.slice(0, 999)}…` : value;
}
/** Parent completion includes delegated work; an answer alone cannot complete its children. */
export function workStatus(item: WorkItem, items: readonly WorkItem[]): WorkItem['status'] {
  const statuses = [item.status, ...items.filter(child => child.parentId === item.id).map(child => child.status)];
  for (const status of ['stopping', 'running', 'queued', 'failed', 'interrupted'] as const) if (statuses.includes(status)) return status;
  return 'completed';
}
