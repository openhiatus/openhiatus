import { isAbsolute } from 'node:path';
import { UnsupportedStateVersion } from '../../storage.js';

export const STATE_WORKER_PROTOCOL = 1;
export interface StateWorkerBootstrap { version: 1; directory: string; }
export type StateWorkerRequest = { version: 1; type: 'commit'; id: number; state: unknown } | { version: 1; type: 'close' };
export interface StateWorkerFailure { kind: 'unsupported-version' | 'write-failed'; message: string; }
export type StateWorkerResponse =
  | { version: 1; type: 'ready'; threadId: number }
  | { version: 1; type: 'committed'; id: number }
  | { version: 1; type: 'rejected'; id: number; error: StateWorkerFailure }
  | { version: 1; type: 'fatal'; error: StateWorkerFailure };

export class StateWorkerProtocolError extends Error { constructor() { super('Ungültiges Protokoll des Verlaufsspeichers.'); } }
function fail(): never { throw new StateWorkerProtocolError(); }
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail(); }
function fields(value: Record<string, unknown>, allowed: readonly string[]): void { if (Object.keys(value).some(key => !allowed.includes(key))) fail(); }
function id(value: unknown): number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fail(); }
export function trustedPath(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 32_768 || value.includes('\0') || !isAbsolute(value)) return fail();
  return value;
}
export function decodeBootstrap(value: unknown): StateWorkerBootstrap {
  const source = record(value); fields(source, ['version', 'directory']);
  if (source.version !== 1) return fail();
  return { version: 1, directory: trustedPath(source.directory) };
}
export function decodeStateRequest(value: unknown): StateWorkerRequest {
  const source = record(value);
  if (source.version !== 1) return fail();
  if (source.type === 'close') { fields(source, ['version', 'type']); return { version: 1, type: 'close' }; }
  if (source.type !== 'commit') return fail();
  fields(source, ['version', 'type', 'id', 'state']);
  if (!Object.hasOwn(source, 'state')) return fail();
  return { version: 1, type: 'commit', id: id(source.id), state: source.state };
}
function decodeFailure(value: unknown): StateWorkerFailure {
  const source = record(value); fields(source, ['kind', 'message']);
  if ((source.kind !== 'unsupported-version' && source.kind !== 'write-failed') || typeof source.message !== 'string' || !source.message || source.message.length > 4000) return fail();
  return { kind: source.kind, message: source.message };
}
export function decodeStateResponse(value: unknown): StateWorkerResponse {
  const source = record(value);
  if (source.version !== 1) return fail();
  switch (source.type) {
    case 'ready': fields(source, ['version', 'type', 'threadId']); return { version: 1, type: 'ready', threadId: id(source.threadId) };
    case 'committed': fields(source, ['version', 'type', 'id']); return { version: 1, type: 'committed', id: id(source.id) };
    case 'rejected': fields(source, ['version', 'type', 'id', 'error']); return { version: 1, type: 'rejected', id: id(source.id), error: decodeFailure(source.error) };
    case 'fatal': fields(source, ['version', 'type', 'error']); return { version: 1, type: 'fatal', error: decodeFailure(source.error) };
    default: return fail();
  }
}
export function workerFailure(error: unknown): StateWorkerFailure {
  return { kind: error instanceof UnsupportedStateVersion ? 'unsupported-version' : 'write-failed',
    message: (error instanceof Error ? error.message : 'Der Verlauf konnte nicht gespeichert werden.').slice(0, 4000) || 'Der Verlauf konnte nicht gespeichert werden.' };
}
export function restoreFailure(error: StateWorkerFailure): Error { return error.kind === 'unsupported-version' ? new UnsupportedStateVersion(error.message) : new Error(error.message); }
