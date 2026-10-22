import { Worker } from 'node:worker_threads';
import { resolve } from 'node:path';
import { redact } from '../../redact.js';
import { trustedPath } from './protocol.js';
import { sanitizeInstructions, sanitizeMemoryResult } from './memory-sanitize.js';
import { decodeInstructions, decodeMemoryResponse, decodeMemoryResult, decodeSecrets, mutatesMemory, restoreMemoryFailure,
  type InstructionDocuments, type MemoryArgs, type MemoryCall, type MemoryMethod, type MemoryResult, type MemoryWorkerResponse } from './memory-protocol.js';

export interface WorkerMemoryStoreOptions {
  workerPath: string; getSecrets?: () => readonly string[]; sanitize?: (value: string) => string; timeoutMs?: number; shutdownTimeoutMs?: number;
}
export interface AsyncMemoryStore {
  initialize(): Promise<void>;
  instructionDocuments(): InstructionDocuments;
  capture(...args: MemoryArgs<'capture'>): Promise<MemoryResult<'capture'>>;
  snapshot(...args: MemoryArgs<'snapshot'>): Promise<MemoryResult<'snapshot'>>;
  source(...args: MemoryArgs<'source'>): Promise<MemoryResult<'source'>>;
  retrieve(...args: MemoryArgs<'retrieve'>): Promise<MemoryResult<'retrieve'>>;
  rebuild(...args: MemoryArgs<'rebuild'>): Promise<MemoryResult<'rebuild'>>;
  edit(...args: MemoryArgs<'edit'>): Promise<MemoryResult<'edit'>>;
  propose(...args: MemoryArgs<'propose'>): Promise<MemoryResult<'propose'>>;
  decide(...args: MemoryArgs<'decide'>): Promise<MemoryResult<'decide'>>;
  search(...args: MemoryArgs<'search'>): Promise<MemoryResult<'search'>>;
  readPeriod(...args: MemoryArgs<'readPeriod'>): Promise<MemoryResult<'readPeriod'>>;
  planSummaries(...args: MemoryArgs<'planSummaries'>): Promise<MemoryResult<'planSummaries'>>;
  summaryInput(...args: MemoryArgs<'summaryInput'>): Promise<MemoryResult<'summaryInput'>>;
  applySummary(...args: MemoryArgs<'applySummary'>): Promise<MemoryResult<'applySummary'>>;
  flush(): Promise<void>;
  dispose(): Promise<void>;
}
type Reply = Extract<MemoryWorkerResponse, { type: 'result' | 'rejected' }>;
interface Pending { method: MemoryMethod; settle(reply: Reply): void; reject(error: Error): void; promise: Promise<unknown>; timer: NodeJS.Timeout; }
export class MemoryWorkerUnavailableError extends Error {
  constructor(message = 'Der Gedächtnisspeicher wurde unerwartet beendet. Kein Auftrag wird automatisch wiederholt.') { super(message); this.name = 'MemoryWorkerUnavailableError'; }
}

/** The worker owns the complete store. Only its ACKed protected documents live here. */
export class WorkerMemoryStore implements AsyncMemoryStore {
  private readonly worker: Worker;
  private readonly ready: Promise<void>;
  private readonly exited: Promise<number>;
  private resolveReady!: () => void;
  private rejectReady!: (error: Error) => void;
  private readonly pending = new Map<number, Pending>();
  private readonly failures = new Map<number, Error>();
  private readonly timeoutMs: number;
  private readonly shutdownTimeoutMs: number;
  private startupTimer?: NodeJS.Timeout;
  private serial = 0;
  private lastSettled = 0;
  private initializing = false;
  private instructions?: InstructionDocuments;
  private closing = false;
  private closeRequested = false;
  private exitCode?: number;
  private fatal?: Error;
  private disposal?: Promise<void>;
  private confirmedCloseSequence?: number;

  constructor(directory: string, private readonly options: WorkerMemoryStoreOptions) {
    const location = resolve(trustedPath(directory)), workerPath = resolve(trustedPath(options.workerPath));
    this.timeoutMs = timeout(options.timeoutMs, 30_000); this.shutdownTimeoutMs = timeout(options.shutdownTimeoutMs, 5000);
    this.ready = new Promise((done, reject) => { this.resolveReady = done; this.rejectReady = reject; });
    void this.ready.catch(() => {});
    this.worker = new Worker(workerPath, { workerData: { version: 1, directory: location }, env: {}, execArgv: [] });
    this.exited = new Promise(done => {
      this.worker.once('error', () => this.fail(new MemoryWorkerUnavailableError()));
      this.worker.once('exit', code => {
        this.exitCode = code;
        if (!this.closeRequested || code !== 0 || this.pending.size) this.fail(new MemoryWorkerUnavailableError());
        done(code);
      });
    });
    this.worker.on('message', (value: unknown) => {
      if (this.fatal) return;
      try { this.receive(value); }
      catch { this.fail(new MemoryWorkerUnavailableError('Die Gedächtnisbestätigung ist ungültig. Kein Auftrag wird automatisch wiederholt.')); void this.worker.terminate().catch(() => {}); }
    });
  }
  initialize(): Promise<void> {
    if (this.fatal) return Promise.reject(this.fatal);
    if (this.instructions || this.initializing) return this.ready;
    if (this.closing) return Promise.reject(new MemoryWorkerUnavailableError('Der Gedächtnisspeicher wird beendet.'));
    this.initializing = true;
    try {
      this.worker.postMessage({ version: 1, type: 'initialize', secrets: this.secrets() });
      this.startupTimer = setTimeout(() => this.expired(), this.timeoutMs);
    } catch { this.fail(new MemoryWorkerUnavailableError('Der Gedächtnisspeicher konnte nicht initialisiert werden.')); void this.worker.terminate().catch(() => {}); }
    return this.ready;
  }
  instructionDocuments(): InstructionDocuments {
    if (!this.instructions) throw this.fatal || new MemoryWorkerUnavailableError('Das Gedächtnis ist noch nicht initialisiert.');
    return sanitizeInstructions(this.instructions, this.sanitizer());
  }
  capture(...args: MemoryArgs<'capture'>) { return this.call('capture', args); }
  snapshot(...args: MemoryArgs<'snapshot'>) { return this.call('snapshot', args); }
  source(...args: MemoryArgs<'source'>) { return this.call('source', args); }
  retrieve(...args: MemoryArgs<'retrieve'>) { return this.call('retrieve', args); }
  rebuild(...args: MemoryArgs<'rebuild'>) { return this.call('rebuild', args); }
  edit(...args: MemoryArgs<'edit'>) { return this.call('edit', args); }
  propose(...args: MemoryArgs<'propose'>) { return this.call('propose', args); }
  decide(...args: MemoryArgs<'decide'>) { return this.call('decide', args); }
  search(...args: MemoryArgs<'search'>) { return this.call('search', args); }
  readPeriod(...args: MemoryArgs<'readPeriod'>) { return this.call('readPeriod', args); }
  planSummaries(...args: MemoryArgs<'planSummaries'>) { return this.call('planSummaries', args); }
  summaryInput(...args: MemoryArgs<'summaryInput'>) { return this.call('summaryInput', args); }
  applySummary(...args: MemoryArgs<'applySummary'>) { return this.call('applySummary', args); }

  private call<M extends MemoryMethod>(method: M, args: MemoryArgs<M>): Promise<MemoryResult<M>> {
    if (this.fatal) return Promise.reject(this.fatal);
    if (this.closing) return Promise.reject(new MemoryWorkerUnavailableError('Der Gedächtnisspeicher wird beendet und nimmt keine neuen Aufträge an.'));
    if (this.pending.size >= 64) return Promise.reject(new Error('Zu viele unbestätigte Gedächtnisaufträge. Bitte erneut versuchen.'));
    void this.initialize().catch(() => {});
    if (this.fatal) return Promise.reject(this.fatal);
    const id = ++this.serial;
    let done!: (value: MemoryResult<M>) => void, reject!: (error: Error) => void;
    const promise = new Promise<MemoryResult<M>>((resolveResult, rejectResult) => { done = resolveResult; reject = rejectResult; });
    void promise.catch(() => {});
    const timer = setTimeout(() => this.expired(), this.timeoutMs);
    const settle = (reply: Reply): void => {
      if (reply.method !== method) throw new Error('Mismatched memory method');
      const clean = this.sanitizer();
      if (reply.type === 'rejected') {
        const error = restoreMemoryFailure(reply.error, clean);
        if (mutatesMemory(method)) this.failures.set(id, error);
        reject(error); return;
      }
      const result = sanitizeMemoryResult(method, decodeMemoryResult(method, reply.result), clean);
      const instructions = reply.instructions === undefined ? undefined : sanitizeInstructions(decodeInstructions(reply.instructions), clean);
      if (instructions) this.instructions = instructions;
      if (mutatesMemory(method)) for (const failed of this.failures.keys()) if (failed <= id) this.failures.delete(failed);
      done(result);
    };
    this.pending.set(id, { method, settle, reject, promise, timer });
    try {
      // postMessage performs the immutable structured clone now, not when the FIFO
      // reaches this request. Directory and callbacks never cross this boundary.
      this.worker.postMessage({ version: 1, type: 'call', id, method, args, secrets: this.secrets() } satisfies Omit<MemoryCall, 'args'> & { args: MemoryArgs<M> });
    } catch {
      this.pending.delete(id); clearTimeout(timer);
      const error = new Error('Der Gedächtnisauftrag konnte nicht unverändert übernommen werden.');
      if (mutatesMemory(method)) this.failures.set(id, error);
      reject(error);
    }
    return promise;
  }
  private receive(value: unknown): void {
    const reply = decodeMemoryResponse(value);
    if (reply.type === 'ready') {
      if (!this.initializing || this.instructions || this.closeRequested) throw new Error('Unexpected memory initialization');
      this.instructions = sanitizeInstructions(reply.instructions, this.sanitizer());
      if (this.startupTimer) clearTimeout(this.startupTimer);
      this.resolveReady(); return;
    }
    if (reply.type === 'fatal') { this.fail(restoreMemoryFailure(reply.error, this.sanitizer())); void this.worker.terminate().catch(() => {}); return; }
    if (!this.instructions) throw new Error('Memory worker has not initialized');
    if (reply.id <= this.lastSettled) return;
    const pending = this.pending.get(reply.id), oldest = this.pending.keys().next().value;
    if (!pending || oldest !== reply.id) throw new Error('Unknown or out-of-order memory acknowledgment');
    // Decode/correlate before removing the pending entry: malformed success must
    // reject this operation along with every other outstanding call.
    pending.settle(reply);
    this.pending.delete(reply.id); this.lastSettled = reply.id; clearTimeout(pending.timer);
  }
  async flush(): Promise<void> {
    const through = this.serial, pending = [...this.pending.values()].map(call => call.promise);
    if (!this.initializing && !this.closing) await this.initialize(); else await this.ready;
    await Promise.allSettled(pending);
    if (this.fatal) throw this.fatal;
    const failure = [...this.failures].filter(([id]) => id <= through).sort(([a], [b]) => a - b).at(-1)?.[1];
    if (failure) throw failure;
  }
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    // Initializing first allows an unused adapter to shut down without waiting on
    // an initialization promise that nobody ever requested.
    if (!this.initializing && !this.fatal) void this.initialize().catch(() => {});
    this.closing = true;
    const attempt = this.close(); this.disposal = attempt;
    void attempt.catch(() => { if (this.disposal === attempt) this.disposal = undefined; });
    return attempt;
  }
  private async close(): Promise<void> {
    const confirmed = this.confirmedCloseSequence === this.serial && this.pending.size === 0 && this.failures.size === 0;
    let failure: unknown;
    if (!confirmed) { try { await this.flush(); this.confirmedCloseSequence = this.serial; } catch (error) { failure = error; } }
    try {
      if (this.exitCode === undefined) {
        if (!this.fatal) { this.closeRequested = true; this.worker.postMessage({ version: 1, type: 'close' }); }
        else void this.worker.terminate().catch(() => {});
        let timer: NodeJS.Timeout | undefined;
        try {
          await Promise.race([this.exited, new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new MemoryWorkerUnavailableError('Das Ende des Gedächtnisspeichers wurde nicht bestätigt.')), this.shutdownTimeoutMs);
          })]);
        } catch (error) { void this.worker.terminate().catch(() => {}); throw error; }
        finally { if (timer) clearTimeout(timer); }
      }
      if (!confirmed && this.closeRequested && this.exitCode !== 0) throw new MemoryWorkerUnavailableError('Der Gedächtnisspeicher wurde beim Beenden unterbrochen.');
      if (!confirmed && this.fatal && !failure) failure = this.fatal;
    } catch (error) { if (failure) throw new AggregateError([failure, error], 'Gedächtnis konnte nicht bestätigt gespeichert und beendet werden.'); throw error; }
    finally { if (this.startupTimer) clearTimeout(this.startupTimer); }
    if (failure) throw failure;
  }
  private secrets(): string[] { return decodeSecrets(Array.from(this.options.getSecrets?.() || [])); }
  private sanitizer(): (value: string) => string {
    const secrets = this.secrets(), sanitize = this.options.sanitize;
    return value => redact(sanitize ? sanitize(value) : value, secrets);
  }
  private expired(): void { this.fail(new MemoryWorkerUnavailableError('Der Gedächtnisauftrag blieb unbestätigt. Es erfolgt keine automatische Wiederholung.')); void this.worker.terminate().catch(() => {}); }
  private fail(error: Error): void {
    if (this.fatal) return;
    this.fatal = error; if (this.startupTimer) clearTimeout(this.startupTimer); this.rejectReady(error);
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
  }
}
function timeout(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > 300_000) throw new Error('Ungültige Wartezeit für den Gedächtnisspeicher.');
  return value;
}
