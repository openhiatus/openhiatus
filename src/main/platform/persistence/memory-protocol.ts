import type { MemoryStore } from '../../memory.js';
import { UnsupportedMemoryVersion } from '../../memory.js';
import { parseAssistantProfile } from '../../../shared/assistant-profile';
import type { CoreProposal, MemoryContext, MemoryDocument, MemorySummaryInput, MemorySummaryPlanJob, MemorySummaryResult } from '../../../shared/memory.js';
import { array, boolean, choice, integer, nothing, object, optional, record, text, type Decoder } from '../../../shared/ipc/decode.js';
import { decodeMemoryPeriod, decodeMemorySearch, decodeMemorySnapshot, decodeMemorySource } from '../../../shared/ipc/memory.js';
import { messageFields } from '../../../shared/ipc/snapshot.js';
import { decodeBootstrap, trustedPath } from './protocol.js';

export { decodeBootstrap as decodeMemoryBootstrap };
export type MemoryMethod = Exclude<keyof MemoryStore, 'instructionDocuments'>;
export type MemoryArgs<M extends MemoryMethod> = Parameters<MemoryStore[M]>;
export type MemoryResult<M extends MemoryMethod> = ReturnType<MemoryStore[M]>;
export type InstructionDocuments = Array<Pick<MemoryDocument, 'id' | 'version' | 'content'>>;
export type MemoryCall<M extends MemoryMethod = MemoryMethod> = { [K in M]: {
  version: 1; type: 'call'; id: number; method: K; args: MemoryArgs<K>; secrets: string[];
} }[M];
export type MemoryWorkerRequest = MemoryCall | { version: 1; type: 'initialize'; secrets: string[] } | { version: 1; type: 'close' };
export interface MemoryWorkerFailure { kind: 'unsupported-version' | 'operation-failed'; message: string; }
export type MemoryWorkerResponse =
  | { version: 1; type: 'ready'; threadId: number; instructions: InstructionDocuments }
  | { version: 1; type: 'result'; id: number; method: MemoryMethod; result: unknown; instructions?: InstructionDocuments }
  | { version: 1; type: 'rejected'; id: number; method: MemoryMethod; error: MemoryWorkerFailure }
  | { version: 1; type: 'fatal'; error: MemoryWorkerFailure };

const methods = ['initializeProfile', 'capture', 'snapshot', 'source', 'retrieve', 'rebuild', 'edit', 'propose', 'decide', 'search', 'readPeriod', 'planSummaries', 'summaryInput', 'applySummary'] as const satisfies readonly MemoryMethod[];
const mutations: readonly MemoryMethod[] = ['initializeProfile', 'capture', 'retrieve', 'rebuild', 'edit', 'propose', 'decide', 'applySummary'];
export function mutatesMemory(method: MemoryMethod): boolean { return mutations.includes(method); }
export function updatesInstructionCache(method: MemoryMethod): boolean { return method === 'snapshot' || mutatesMemory(method); }
export class MemoryWorkerProtocolError extends Error { constructor() { super('Ungültiges Protokoll des Gedächtnisspeichers.'); } }
function fail(): never { throw new MemoryWorkerProtocolError(); }
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const source = record(value); if (Object.keys(source).some(key => !keys.includes(key))) fail(); return source;
}
const positive: Decoder<number> = value => { const n = integer(value); return n > 0 ? n : fail(); };
const id: Decoder<string> = value => { const s = text(512)(value); return s.trim() ? s : fail(); };
const at: Decoder<string> = value => { const s = text(100)(value); return /^\d{4}-\d{2}-\d{2}T/.test(s) && Number.isFinite(Date.parse(s)) ? s : fail(); };
const refs = array(id, 50000);
const periodKind = choice(['day', 'week', 'month']);
const inputDocument = object({ id, version: positive });
const hash: Decoder<string> = value => { const s = text(64)(value); return /^[a-f0-9]{64}$/.test(s) ? s : fail(); };
const proposalInput = object({ documentId: choice(['identity', 'core']), baseVersion: positive, content: text(8000), reason: text(2000), sourceIds: optional(refs) });
const proposal: Decoder<CoreProposal> = object({ documentId: choice(['identity', 'core']), baseVersion: positive, content: text(8000), reason: text(2000), sourceIds: refs,
  id, status: choice(['pending', 'approved', 'rejected', 'stale']), createdAt: at, decidedAt: optional(at) });
const retrieval = object({ query: text(20000), at, documentIds: array(id, 15000), sourceIds: refs, text: text(24000) });
const context: Decoder<MemoryContext> = object({ text: text(24000), retrieval });
const summaryInput: Decoder<MemorySummaryInput> = object({ documentId: id, kind: periodKind, title: text(512), baseVersion: positive, inputHash: hash,
  sourceIds: refs, inputDocuments: array(inputDocument, 15000), records: array(object({ id, text: text(200000), kind: choice(['source', 'report']), sourceIds: refs,
    at: optional(at), role: optional(choice(['user', 'assistant'])), version: optional(positive), edited: optional(boolean) }), 65000) });
const summaryResult: Decoder<MemorySummaryResult> = object({ content: text(20000), model: text(200), citations: optional(refs) });
const plans: Decoder<MemorySummaryPlanJob[]> = array(object({ documentId: id, kind: periodKind, title: text(512), blockedBy: array(id, 15000), sourceCount: integer }), 15000);
const limit = (min: number, max: number): Decoder<number> => value => { const n = integer(value); return n >= min && n <= max ? n : fail(); };
const retrieveOptions = object({ maxChars: optional(limit(512, 24000)), maxBytes: optional(limit(512, 96000)), includeInstructions: optional(boolean) });
const planningTime: Decoder<Date | string> = value => {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : fail();
  const date = text(512)(value); return Number.isFinite(new Date(date).getTime()) ? date : fail();
};
const planOptions = object({ closedOnly: optional(boolean), now: optional(planningTime) });
const periodRequest = object({ documentId: optional(id), date: optional(text(512)), cursor: optional(text(2048)), maxBytes: optional(limit(512, 10000)) });

export function decodeSecrets(value: unknown): string[] {
  const secrets = array(text(65536), 4096)(value);
  if (secrets.reduce((total, secret) => total + secret.length, 0) > 16_777_216) fail();
  return secrets;
}
export function decodeInstructions(value: unknown): InstructionDocuments {
  const documents = array(object({ id: choice(['identity', 'core', 'soul', 'agent', 'user']), version: positive, content: text(8000) }), 5)(value);
  const ids = new Set(documents.map(doc => doc.id));
  if (![2, 5].includes(documents.length) || ids.size !== documents.length || !ids.has('identity') || !ids.has('core')) fail();
  return documents;
}
function args(value: unknown, min: number, max = min): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail();
  return Array.from(value);
}
export function decodeMemoryRequest(value: unknown): MemoryWorkerRequest {
  try {
    const source = record(value); if (source.version !== 1) fail();
    if (source.type === 'close') { exact(source, ['version', 'type']); return { version: 1, type: 'close' }; }
    if (source.type === 'initialize') { exact(source, ['version', 'type', 'secrets']); return { version: 1, type: 'initialize', secrets: decodeSecrets(source.secrets) }; }
    if (source.type !== 'call') return fail();
    exact(source, ['version', 'type', 'id', 'method', 'args', 'secrets']);
    const common = { version: 1 as const, type: 'call' as const, id: positive(source.id), secrets: decodeSecrets(source.secrets) };
    switch (source.method) {
      case 'initializeProfile': { const a = args(source.args, 1); return { ...common, method: 'initializeProfile', args: [parseAssistantProfile(a[0])] }; }
      case 'capture': { const a = args(source.args, 2); return { ...common, method: 'capture', args: [array(object({ ...messageFields, id, at }), 50000)(a[0]), id(a[1])] }; }
      case 'snapshot': args(source.args, 0); return { ...common, method: 'snapshot', args: [] };
      case 'source': { const a = args(source.args, 1); return { ...common, method: 'source', args: [id(a[0])] }; }
      case 'retrieve': { const a = args(source.args, 1, 2); return { ...common, method: 'retrieve', args: [text(20000)(a[0]), optional(retrieveOptions)(a[1])] }; }
      case 'rebuild': args(source.args, 0); return { ...common, method: 'rebuild', args: [] };
      case 'edit': { const a = args(source.args, 3); return { ...common, method: 'edit', args: [id(a[0]), text(20000)(a[1]), positive(a[2])] }; }
      case 'propose': { const a = args(source.args, 1); return { ...common, method: 'propose', args: [proposalInput(a[0])] }; }
      case 'decide': { const a = args(source.args, 2); return { ...common, method: 'decide', args: [id(a[0]), choice(['approve', 'reject'])(a[1])] }; }
      case 'search': { const a = args(source.args, 1); return { ...common, method: 'search', args: [text(20000)(a[0])] }; }
      case 'readPeriod': { const a = args(source.args, 1, 2); return { ...common, method: 'readPeriod', args: [periodRequest(a[0]), optional(boolean)(a[1])] }; }
      case 'planSummaries': { const a = args(source.args, 0, 1); return { ...common, method: 'planSummaries', args: [optional(planOptions)(a[0])] }; }
      case 'summaryInput': { const a = args(source.args, 1); return { ...common, method: 'summaryInput', args: [id(a[0])] }; }
      case 'applySummary': { const a = args(source.args, 2); return { ...common, method: 'applySummary', args: [summaryInput(a[0]), summaryResult(a[1])] }; }
      default: return fail();
    }
  } catch { return fail(); }
}

const results: { [M in MemoryMethod]: Decoder<MemoryResult<M>> } = {
  initializeProfile: decodeSnapshot,
  capture: nothing, snapshot: decodeSnapshot, source: decodeMemorySource, retrieve: context, rebuild: decodeSnapshot, edit: decodeSnapshot,
  propose: proposal, decide: decodeSnapshot, search: decodeMemorySearch, readPeriod: decodeMemoryPeriod, planSummaries: plans, summaryInput, applySummary: decodeSnapshot,
};
function decodeSnapshot(value: unknown) {
  const source = record(value), storagePath = trustedPath(source.storagePath);
  // The public IPC display path is capped at 4096; the private worker accepts the
  // same absolute trusted-path domain as its bootstrap without narrowing it.
  return { ...decodeMemorySnapshot({ ...source, storagePath: '' }), storagePath };
}
export function decodeMemoryResult<M extends MemoryMethod>(method: M, value: unknown): MemoryResult<M> { return results[method](value); }
function decodeFailure(value: unknown): MemoryWorkerFailure {
  const source = exact(value, ['kind', 'message']);
  return { kind: choice(['unsupported-version', 'operation-failed'])(source.kind), message: text(4000)(source.message) };
}
export function decodeMemoryResponse(value: unknown): MemoryWorkerResponse {
  try {
    const source = record(value); if (source.version !== 1) fail();
    switch (source.type) {
      case 'ready': exact(source, ['version', 'type', 'threadId', 'instructions']); return { version: 1, type: 'ready', threadId: positive(source.threadId), instructions: decodeInstructions(source.instructions) };
      case 'result': {
        exact(source, ['version', 'type', 'id', 'method', 'result', 'instructions']);
        const method = choice(methods)(source.method);
        if (!Object.hasOwn(source, 'result') || updatesInstructionCache(method) !== Object.hasOwn(source, 'instructions')) return fail();
        const instructions = updatesInstructionCache(method) ? decodeInstructions(source.instructions) : undefined;
        return { version: 1, type: 'result', id: positive(source.id), method, result: source.result,
          ...(instructions === undefined ? {} : { instructions }) };
      }
      case 'rejected': exact(source, ['version', 'type', 'id', 'method', 'error']); return { version: 1, type: 'rejected', id: positive(source.id), method: choice(methods)(source.method), error: decodeFailure(source.error) };
      case 'fatal': exact(source, ['version', 'type', 'error']); return { version: 1, type: 'fatal', error: decodeFailure(source.error) };
      default: return fail();
    }
  } catch { return fail(); }
}
export function memoryFailure(error: unknown, sanitize: (value: string) => string): MemoryWorkerFailure {
  return { kind: error instanceof UnsupportedMemoryVersion ? 'unsupported-version' : 'operation-failed',
    message: sanitize(error instanceof Error ? error.message : 'Der Gedächtnisauftrag ist fehlgeschlagen.').slice(0, 4000) || 'Der Gedächtnisauftrag ist fehlgeschlagen.' };
}
export function restoreMemoryFailure(failure: MemoryWorkerFailure, sanitize: (value: string) => string): Error {
  const message = sanitize(failure.message);
  return failure.kind === 'unsupported-version' ? new UnsupportedMemoryVersion(message) : new Error(message);
}
