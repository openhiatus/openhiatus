import { Worker } from 'node:worker_threads';
import { resolve } from 'node:path';
import type { SavedState } from '../../storage.js';
import { decodeStateResponse, restoreFailure, trustedPath, type StateWorkerRequest } from './protocol.js';

export interface WorkerStateStoreOptions { workerPath: string; timeoutMs?: number; shutdownTimeoutMs?: number; }
export interface AsyncStateStore { commit(state: SavedState): Promise<void>; flush(): Promise<void>; dispose(): Promise<void>; }
interface PendingCommit { resolve(): void; reject(error: Error): void; promise: Promise<void>; timer: NodeJS.Timeout; }
export class StateWorkerUnavailableError extends Error { constructor(message = 'Der Verlaufsspeicher wurde unerwartet beendet. Der Schreibauftrag wird nicht automatisch wiederholt.') { super(message); this.name = 'StateWorkerUnavailableError'; } }

/** One worker owns every validation, JSON serialization, backup and fsync operation. */
export class WorkerStateStore implements AsyncStateStore {
  private readonly worker: Worker;
  private readonly ready: Promise<void>;
  private readonly exited: Promise<number>;
  private resolveReady!: () => void;
  private rejectReady!: (error: Error) => void;
  private readonly pending = new Map<number, PendingCommit>();
  private readonly failures = new Map<number, Error>();
  private readonly timeoutMs: number;
  private readonly shutdownTimeoutMs: number;
  private startupTimer?: NodeJS.Timeout;
  private serial = 0;
  private lastSettled = 0;
  private initialized = false;
  private closing = false;
  private closeRequested = false;
  private exitCode?: number;
  private fatal?: Error;
  private disposal?: Promise<void>;
  private confirmedCloseSequence?: number;

  constructor(directory: string, options: WorkerStateStoreOptions) {
    const location = resolve(trustedPath(directory)), workerPath = resolve(trustedPath(options.workerPath));
    this.timeoutMs = timeout(options.timeoutMs, 30_000);
    this.shutdownTimeoutMs = timeout(options.shutdownTimeoutMs, 5000);
    this.ready = new Promise((resolveReady, rejectReady) => { this.resolveReady = resolveReady; this.rejectReady = rejectReady; });
    void this.ready.catch(() => {});
    this.worker = new Worker(workerPath, { workerData: { version: 1, directory: location }, env: {}, execArgv: [] });
    this.exited = new Promise(resolveExit => {
      this.worker.once('error', () => this.fail(new StateWorkerUnavailableError()));
      this.worker.once('exit', code => {
        this.exitCode = code;
        if (!this.closeRequested || code !== 0 || this.pending.size > 0) this.fail(new StateWorkerUnavailableError());
        resolveExit(code);
      });
    });
    this.worker.on('message', (value: unknown) => {
      if (this.fatal) return;
      try { this.receive(value); }
      catch { this.fail(new StateWorkerUnavailableError('Die Speicherbestätigung ist ungültig. Es wird kein Schreibauftrag automatisch wiederholt.')); void this.worker.terminate().catch(() => {}); }
    });
    this.startupTimer = setTimeout(() => this.expired(), this.timeoutMs);
  }
  private receive(value: unknown): void {
    const message = decodeStateResponse(value);
    if (message.type === 'ready') {
      if (this.initialized || this.closeRequested) throw new Error('Unexpected initialization');
      this.initialized = true; if (this.startupTimer) clearTimeout(this.startupTimer); this.resolveReady(); return;
    }
    if (!this.initialized) throw new Error('Worker has not initialized');
    if (message.type === 'fatal') { this.fail(restoreFailure(message.error)); return; }
    if (message.id <= this.lastSettled) return;
    const pending = this.pending.get(message.id), oldest = this.pending.keys().next().value;
    if (!pending || oldest !== message.id) throw new Error('Unknown or out-of-order acknowledgment');
    this.pending.delete(message.id); this.lastSettled = message.id; clearTimeout(pending.timer);
    if (message.type === 'committed') {
      for (const failed of this.failures.keys()) if (failed <= message.id) this.failures.delete(failed);
      pending.resolve();
    } else {
      const error = restoreFailure(message.error); this.failures.set(message.id, error); pending.reject(error);
    }
  }
  commit(state: SavedState): Promise<void> {
    if (this.fatal) return Promise.reject(this.fatal);
    if (this.closing) return Promise.reject(new StateWorkerUnavailableError('Der Verlaufsspeicher wird beendet und nimmt keine neuen Schreibaufträge an.'));
    if (this.pending.size >= 64) return Promise.reject(new Error('Zu viele unbestätigte Schreibaufträge für den Verlauf. Bitte erneut versuchen.'));
    const id = ++this.serial;
    let resolveCommit!: () => void, rejectCommit!: (error: Error) => void;
    const promise = new Promise<void>((resolve, reject) => { resolveCommit = resolve; rejectCommit = reject; });
    void promise.catch(() => {});
    const timer = setTimeout(() => this.expired(), this.timeoutMs);
    this.pending.set(id, { resolve: resolveCommit, reject: rejectCommit, promise, timer });
    try {
      // Only SavedState roots cross the thread boundary. postMessage captures their
      // immutable graph immediately, before this function returns, even when queued.
      const snapshot: SavedState = { messages: state.messages, activity: state.activity, task: state.task, preferences: state.preferences,
        ...(state.workItems === undefined ? {} : { workItems: state.workItems }),
        ...(state.jobs === undefined ? {} : { jobs: state.jobs }), ...(state.usage === undefined ? {} : { usage: state.usage }) };
      this.post({ version: 1, type: 'commit', id, state: snapshot });
    } catch {
      this.pending.delete(id); clearTimeout(timer);
      const error = new Error('Der Verlauf konnte nicht unverändert für den Schreibauftrag übernommen werden.');
      this.failures.set(id, error); rejectCommit(error);
    }
    return promise;
  }
  async flush(): Promise<void> {
    const through = this.serial;
    const commits = [...this.pending.values()].map(commit => commit.promise);
    await this.ready;
    await Promise.allSettled(commits);
    if (this.fatal) throw this.fatal;
    const failure = [...this.failures].filter(([id]) => id <= through).sort(([left], [right]) => left - right).at(-1)?.[1];
    if (failure) throw failure;
  }
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.closing = true;
    const attempt = this.close();
    this.disposal = attempt;
    // An explicit later close attempt must observe a subsequently confirmed exit.
    // Keep successful/active attempts shared, but never cache a rejected attempt.
    void attempt.catch(() => { if (this.disposal === attempt) this.disposal = undefined; });
    return attempt;
  }
  private async close(): Promise<void> {
    // A shutdown timeout may terminate the thread after all writes were ACKed.
    // Reuse only that unchanged write barrier; this never retries a commit or
    // treats an unresolved write failure as successfully persisted.
    const confirmed = this.confirmedCloseSequence === this.serial && this.pending.size === 0 && this.failures.size === 0;
    let failure: unknown;
    if (!confirmed) {
      try { await this.flush(); this.confirmedCloseSequence = this.serial; } catch (error) { failure = error; }
    }
    try {
      if (this.exitCode === undefined) {
        if (!this.fatal) { this.closeRequested = true; this.post({ version: 1, type: 'close' }); }
        else void this.worker.terminate().catch(() => {});
        let timer: NodeJS.Timeout | undefined;
        try {
          await Promise.race([this.exited, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new StateWorkerUnavailableError('Das Ende des Verlaufsspeichers wurde nicht bestätigt.')), this.shutdownTimeoutMs); })]);
        } catch (error) { void this.worker.terminate().catch(() => {}); throw error; }
        finally { if (timer) clearTimeout(timer); }
      }
      if (!confirmed && this.closeRequested && this.exitCode !== 0) throw new StateWorkerUnavailableError('Der Verlaufsspeicher wurde beim Beenden unterbrochen.');
      if (!confirmed && this.fatal && !failure) failure = this.fatal;
    } catch (error) { if (failure) throw new AggregateError([failure, error], 'Verlauf konnte nicht bestätigt gespeichert und beendet werden.'); throw error; }
    finally { if (this.startupTimer) clearTimeout(this.startupTimer); }
    if (failure) throw failure;
  }
  private post(message: StateWorkerRequest): void { this.worker.postMessage(message); }
  private expired(): void { this.fail(new StateWorkerUnavailableError('Die Speicherung des Verlaufs blieb unbestätigt. Es erfolgt keine automatische Wiederholung.')); void this.worker.terminate().catch(() => {}); }
  private fail(error: Error): void {
    if (this.fatal) return;
    this.fatal = error; if (this.startupTimer) clearTimeout(this.startupTimer); this.rejectReady(error);
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
  }
}
function timeout(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > 300_000) throw new Error('Ungültige Wartezeit für den Verlaufsspeicher.');
  return value;
}
