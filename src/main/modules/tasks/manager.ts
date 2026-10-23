import { validateUsage } from './usage';
import { parseModelRequest } from '../../../shared/model-requests';
import { parseComputerTaskSettings } from '../../../shared/computer-task-settings';
import { randomUUID } from 'node:crypto';
import type { BackgroundJob, AgentAdapter, AgentEvent, Usage, ComputerTaskSettings, ModelRequest } from '../../../shared/contracts';

export interface JobRequest {
  requestId: string; title: string; prompt: string; model: string;
  resources: string[];
  identityInstructions?: string;
  computer?: ComputerTaskSettings;
}
interface Runtime { adapter: AgentAdapter; stop?: Promise<void>; release?: Promise<void>; disposal?: Promise<void>; ended: boolean; usageBase?: Usage; workerUsage?: Usage; computerUsage?: Usage; }
export interface JobDependencies {
  createWorker(onEvent: (event: AgentEvent) => void, job: BackgroundJob): AgentAdapter;
  prepare?(): void | Promise<void>;
  persist(): void | Promise<void>;
  changed(): void;
  clean(text: string): string;
  onEvent(job: BackgroundJob, event: AgentEvent): void;
  onResult(job: BackgroundJob): void;
  continueJob?(job: BackgroundJob, event: Extract<AgentEvent, { type: 'completed' }>, adapter: AgentAdapter): boolean;
}

const unfinished = (job: BackgroundJob) => ['queued', 'running', 'stopping'].includes(job.status);
const zeroUsage = (): Usage => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
function resource(value: string): string { return value.trim().replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase(); }
export function resourcesConflict(a: string[], b: string[]): boolean {
  return a.some(left => b.some(right => {
    const x = resource(left), y = resource(right);
    return x === '*' || y === '*' || x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`);
  }));
}

/** Durable admission and isolated lifecycles: each accepted job owns its worker. */
export function addUsage(base: Usage | undefined, current: Usage): Usage {
  return { inputTokens: (base?.inputTokens ?? 0) + current.inputTokens, outputTokens: (base?.outputTokens ?? 0) + current.outputTokens,
    cacheReadTokens: (base?.cacheReadTokens ?? 0) + current.cacheReadTokens, cacheWriteTokens: (base?.cacheWriteTokens ?? 0) + current.cacheWriteTokens,
    ...(base?.costUsd !== undefined || current.costUsd !== undefined ? { costUsd: (base?.costUsd ?? 0) + (current.costUsd ?? 0) } : {}) };
}
export class JobManager {
  private readonly runtimes = new Map<string, Runtime>();
  private readonly retiredRequests = new Set<string>();
  private pumping = false;
  private pumpRequested = false;
  private pumpCompletion: Promise<void> = Promise.resolve();
  private stoppingAll = false;
  private closed = false;
  private epoch = 0;
  private readonly admissions = new Map<string, Promise<{ job: BackgroundJob; created: boolean }>>();
  private admissionTail: Promise<void> = Promise.resolve();
  private readonly admitting = new Set<string>();
  private readonly mutations = new Map<string, Promise<BackgroundJob>>();
  private readonly revisions = new Map<string, number>();
  constructor(readonly jobs: BackgroundJob[], private readonly deps: JobDependencies, private readonly concurrency = 2) {}

  busy(): boolean { return this.admissions.size > 0 || this.jobs.some(unfinished); }
  enqueue(input: JobRequest, onAdmitted?: (job: BackgroundJob) => void): Promise<{ job: BackgroundJob; created: boolean }> {
    const pending = this.admissions.get(input.requestId);
    if (pending) return pending.then(result => ({ ...result, created: false }));
    const waiting = [...this.admissions.keys()].filter(id => !this.jobs.some(job => job.requestId === id)).length;
    if (!this.jobs.some(job => job.requestId === input.requestId) && this.jobs.filter(unfinished).length + waiting >= 50) {
      return Promise.reject(new Error('Es warten bereits 50 Aufgaben. Bitte zuerst einige abschließen oder stoppen.'));
    }
    const epoch = this.epoch;
    const request = { ...input, resources: [...input.resources], ...(input.computer ? { computer: parseComputerTaskSettings(input.computer) } : {}) };
    // Reserve the request synchronously, including while another admission is writing.
    const accepted = this.admissionTail.then(() => this.admit(request, epoch, onAdmitted));
    this.admissions.set(input.requestId, accepted);
    this.admissionTail = accepted.then(() => undefined, () => undefined);
    void accepted.finally(() => { if (this.admissions.get(input.requestId) === accepted) this.admissions.delete(input.requestId); }).catch(() => undefined);
    return accepted;
  }
  private async admit(input: JobRequest, epoch: number, onAdmitted?: (job: BackgroundJob) => void): Promise<{ job: BackgroundJob; created: boolean }> {
    await this.deps.prepare?.();
    if (epoch !== this.epoch || this.closed || this.stoppingAll) throw new Error('Aufgaben werden gerade beendet.');
    const previous = this.jobs.find(job => job.requestId === input.requestId);
    if (previous) return { job: previous, created: false };
    if (this.retiredRequests.has(input.requestId)) throw new Error('Dieser Auftrag wurde bereits bearbeitet. Sein historisches Ergebnis steht im Gespräch.');
    if (this.closed || this.stoppingAll) throw new Error('Aufgaben werden gerade beendet.');
    if (this.jobs.filter(unfinished).length >= 50) throw new Error('Es warten bereits 50 Aufgaben. Bitte zuerst einige abschließen oder stoppen.');
    const before = this.jobs.length >= 1000 ? [...this.jobs] : undefined;
    const retired: BackgroundJob[] = [];
    if (before) {
      for (const candidate of before) {
        if (this.jobs.length < 500) break;
        if (unfinished(candidate) || this.runtimes.has(candidate.id)) continue;
        this.jobs.splice(this.jobs.indexOf(candidate), 1); retired.push(candidate);
      }
      // Conversation messages and their result references remain intact.
      if (this.jobs.length >= 1000) {
        this.jobs.splice(0, this.jobs.length, ...before);
        throw new Error('Es kann gerade keine weitere Aufgabe angenommen werden.');
      }
    }
    const at = new Date().toISOString();
    const job: BackgroundJob = { ...input, id: randomUUID(), status: 'queued', createdAt: at, updatedAt: at,
      resources: [...input.resources] };
    this.jobs.push(job);
    this.admitting.add(job.id);
    try { await this.deps.persist(); }
    catch (error) {
      const index = this.jobs.indexOf(job);
      if (index >= 0) this.jobs.splice(index, 1);
      if (before) for (const retiredJob of retired) {
        if (!this.jobs.includes(retiredJob)) this.jobs.splice(Math.min(before.indexOf(retiredJob), this.jobs.length), 0, retiredJob);
      }
      this.deps.changed();
      throw error;
    } finally { this.admitting.delete(job.id); }
    for (const retiredJob of retired) this.retiredRequests.add(retiredJob.requestId);
    if (epoch !== this.epoch || this.closed || this.stoppingAll || job.status !== 'queued') throw new Error('Aufgaben werden gerade beendet.');
    try { onAdmitted?.(job); }
    catch (error) { job.status = 'interrupted'; this.update(job); throw error; }
    this.deps.changed();
    // Never begin external work before enqueue's caller publishes its accepted acknowledgement.
    queueMicrotask(() => this.pump());
    return { job, created: true };
  }

  private update(job: BackgroundJob): void {
    job.updatedAt = new Date().toISOString();
    this.deps.changed();
  }
  private earlierReservation(job: BackgroundJob): boolean {
    return this.jobs.slice(0, this.jobs.indexOf(job)).some(earlier => earlier.status === 'queued'
      && (this.admitting.has(earlier.id) || this.mutations.has(earlier.id)) && resourcesConflict(earlier.resources, job.resources));
  }
  private pump(): Promise<void> {
    if (this.closed || this.stoppingAll) return this.pumpCompletion;
    if (this.pumping) { this.pumpRequested = true; return this.pumpCompletion; }
    this.pumping = true;
    this.pumpRequested = false;
    this.pumpCompletion = this.runPump();
    return this.pumpCompletion;
  }
  private async runPump(): Promise<void> {
    try {
      for (const job of this.jobs) {
        if (this.closed || this.stoppingAll) break;
        if (job.status !== 'queued' || this.admitting.has(job.id) || this.mutations.has(job.id) || this.earlierReservation(job)) continue;
        const active = this.jobs.filter(item => item.status === 'running' || item.status === 'stopping');
        if (active.length >= this.concurrency) break;
        if (this.runtimes.size >= 8) break;
        if (active.some(item => resourcesConflict(item.resources, job.resources))) continue;
        const preparingEpoch = this.epoch;
        try { await this.deps.prepare?.(); }
        catch (error) { if (preparingEpoch === this.epoch && job.status === 'queued') this.fail(job, error); continue; }
        if (preparingEpoch !== this.epoch || this.closed || this.stoppingAll || job.status !== 'queued' || this.mutations.has(job.id) || this.earlierReservation(job)) continue;
        const reserved = this.jobs.filter(item => item.status === 'running' || item.status === 'stopping');
        if (reserved.length >= this.concurrency || this.runtimes.size >= 8 || reserved.some(item => resourcesConflict(item.resources, job.resources))) continue;
        job.status = 'running'; job.updatedAt = new Date().toISOString();
        const epoch = this.epoch, revision = this.revisions.get(job.id);
        try {
          // If the durable transition fails, no process or model turn is started.
          await this.deps.persist();
          if (epoch !== this.epoch || revision !== this.revisions.get(job.id) || this.closed || this.stoppingAll || job.status !== 'running') continue;
          const runtime: Runtime = { adapter: this.deps.createWorker(event => this.handle(job, event), job), ended: false };
          this.runtimes.set(job.id, runtime);
          job.runtimeRetained = true;
          this.deps.changed();
          void runtime.adapter.run(job.prompt, job.model, undefined).catch(error => {
            if (!runtime.ended && job.status === 'running') this.fail(job, error);
          });
        } catch (error) { if (epoch === this.epoch && revision === this.revisions.get(job.id) && job.status === 'running') this.fail(job, error); }
      }
    } finally {
      this.pumping = false;
      if (this.pumpRequested) { this.pumpRequested = false; queueMicrotask(() => this.pump()); }
    }
  }

  private fail(job: BackgroundJob, error: unknown): void {
    if (!unfinished(job)) return;
    const runtime = this.runtimes.get(job.id);
    if (error instanceof Error && error.name === 'AgentStopUnconfirmedError') {
      job.status = 'stopping'; job.error = this.deps.clean(error.message);
      this.update(job); this.deps.onResult(job); return;
    }
    if (runtime) runtime.ended = true;
    job.status = 'failed'; job.error = this.deps.clean(error instanceof Error ? error.message : 'Die Aufgabe konnte nicht gestartet werden.');
    this.update(job); this.deps.onResult(job);
    if (runtime) this.releaseIdle(job, runtime);
    queueMicrotask(() => this.pump());
  }
  private handle(job: BackgroundJob, event: AgentEvent): void {
    const runtime = this.runtimes.get(job.id);
    if (!runtime || runtime.ended || this.closed) return;
    if (event.type === 'started' && job.status === 'running') {
      if (job.turnId !== event.turnId) {
        runtime.usageBase = job.usage ? { ...job.usage } : undefined;
        runtime.workerUsage = undefined; runtime.computerUsage = undefined;
      }
      job.threadId = event.threadId; job.turnId = event.turnId; this.update(job);
    } else if ((event.type === 'usage' || event.type === 'computer-usage') && job.status === 'running') {
      const usage = validateUsage(event.usage); if (!usage) return;
      if (event.type === 'computer-usage') runtime.computerUsage = usage;
      else runtime.workerUsage = usage;
      job.usage = addUsage(addUsage(runtime.usageBase, runtime.workerUsage ?? zeroUsage()), runtime.computerUsage ?? zeroUsage()); this.update(job);
    } else if (event.type === 'model-request' && job.status === 'running') {
      this.recordRequest(job, parseModelRequest(event.request)); this.update(job);
    } else if (event.type === 'completed') {
      // A cancellation is acknowledged by stop(), even if a successful result races it.
      if (job.status === 'stopping') return;
      if (job.status !== 'running') return;
      if (this.deps.continueJob?.(job, event, runtime.adapter)) return;
      runtime.ended = true;
      job.status = event.status;
      if (event.text) job.result = this.deps.clean(event.text);
      if (event.error) job.error = this.deps.clean(event.error);
      this.update(job); this.deps.onResult(job); this.releaseIdle(job, runtime); queueMicrotask(() => this.pump());
    } else if (job.status === 'running') this.deps.onEvent(job, event);
  }
  private recordRequest(job: BackgroundJob, request: ModelRequest): void {
    const summaries = job.modelRequests ??= [];
    let summary = summaries.find(row => row.role === request.role && row.model === request.model
      && row.requestedServiceTier === request.requestedServiceTier && row.actualServiceTier === request.actualServiceTier);
    if (!summary) {
      // Each job freezes its models; this also bounds malformed/adversarial event streams.
      if (summaries.length >= 64) return;
      const { status: _status, ...fields } = request;
      summary = { ...fields, requests: 0, completed: 0, failed: 0, aborted: 0, elapsedMs: 0 };
      delete summary.usage; summaries.push(summary);
    }
    summary.requests++; summary[request.status]++; summary.elapsedMs += request.elapsedMs;
    if (request.usage) summary.usage = addUsage(summary.usage, request.usage);
  }
  private releaseIdle(job: BackgroundJob, runtime: Runtime): void {
    if (!runtime.adapter.hasManagedWork || runtime.release || runtime.stop) return;
    runtime.release = Promise.resolve().then(async () => {
      const retained = await runtime.adapter.hasManagedWork!();
      if (retained || runtime.stop || this.closed || this.runtimes.get(job.id) !== runtime) return;
      await this.disposeRuntime(runtime);
      if (this.runtimes.get(job.id) === runtime) {
        this.runtimes.delete(job.id); job.runtimeRetained = false; this.update(job);
      }
    }).catch(error => {
      // Unknown process state remains visible and counted; never kill an unverified service.
      this.deps.onEvent(job, { type: 'activity', kind: 'error', title: 'Aufgabenprozess bleibt zur Prüfung erhalten',
        detail: this.deps.clean(error instanceof Error ? error.message : 'Der Prozesszustand wurde nicht bestätigt.') });
    }).finally(() => { runtime.release = undefined; queueMicrotask(() => this.pump()); });
  }
  private disposeRuntime(runtime: Runtime): Promise<void> {
    if (runtime.disposal) return runtime.disposal;
    const disposal = Promise.resolve().then(() => runtime.adapter.dispose());
    runtime.disposal = disposal;
    // A failed cleanup remains owned, but an explicit later stop may retry it.
    void disposal.catch(() => { if (runtime.disposal === disposal) runtime.disposal = undefined; });
    return disposal;
  }

  get(id: string): BackgroundJob {
    const job = this.jobs.find(item => item.id === id);
    if (!job) throw new Error('Diese Aufgabe wurde nicht gefunden.');
    return job;
  }
  completeReadFailure(id: string, message: string): void { this.fail(this.get(id), new Error(message)); }
  waitReason(job: BackgroundJob): string | undefined {
    if (this.runtimes.size >= 8) return 'Sie wartet, bis ein früherer Aufgabenprozess beendet wurde.';
    const active = this.jobs.filter(item => item.status === 'running' || item.status === 'stopping');
    if (active.some(item => resourcesConflict(item.resources, job.resources))) return 'Sie wartet auf die laufende Arbeit im selben Projekt oder am Bildschirm.';
    if (active.length >= this.concurrency) return 'Sie startet, sobald eine der laufenden Aufgaben fertig ist.';
    return undefined;
  }
  steer(id: string, instruction: string, additionalResources: string[] = []): Promise<BackgroundJob> {
    const epoch = this.epoch, revision = this.revisions.get(id);
    const previous = this.mutations.get(id);
    const mutation = (previous ?? Promise.resolve()).catch(() => undefined).then(() => this.applySteer(id, instruction, additionalResources, epoch, revision));
    this.mutations.set(id, mutation);
    void mutation.finally(() => {
      if (this.mutations.get(id) === mutation) this.mutations.delete(id);
      queueMicrotask(() => this.pump());
    }).catch(() => undefined);
    return mutation;
  }
  private async applySteer(id: string, instruction: string, additionalResources: string[], epoch: number, revision: number | undefined): Promise<BackgroundJob> {
    await this.deps.prepare?.();
    const job = this.get(id);
    const valid = () => epoch === this.epoch && revision === this.revisions.get(id) && !this.closed && !this.stoppingAll;
    if (!valid() || this.admitting.has(id) || !['queued', 'running'].includes(job.status)) throw new Error('Diese Aufgabe nimmt gerade keine Änderungen an.');
    if (job.status === 'queued') {
      const previous = job.prompt;
      const previousResources = job.resources;
      const corrected = `${job.prompt}\n\nSpätere Nutzeranweisung:\n${instruction}`;
      if (corrected.length > 32000) throw new Error('Die Änderung ist mit dem bisherigen Auftrag zu lang. Der Auftrag blieb unverändert.');
      job.prompt = corrected;
      job.resources = [...new Set([...job.resources, ...additionalResources])];
      try { await this.deps.persist(); } catch (error) { job.prompt = previous; job.resources = previousResources; this.deps.changed(); throw error; }
      if (!valid() || job.status !== 'queued') throw new Error('Diese Aufgabe nimmt gerade keine Änderungen an.');
      this.update(job); return job;
    }
    const runtime = this.runtimes.get(id);
    const adapter = runtime?.adapter, turnId = job.turnId;
    if (!adapter?.steer || !job.turnId) throw new Error('Die Aufgabe ist noch nicht bereit für eine Änderung. Sie wurde nicht gestoppt.');
    const expanded = [...new Set([...job.resources, ...additionalResources])];
    if (this.jobs.some(other => other.id !== id && ['running', 'stopping'].includes(other.status) && resourcesConflict(expanded, other.resources))) {
      throw new Error('Die Änderung würde ein Projekt oder den Bildschirm einer anderen laufenden Aufgabe verwenden. Sie wurde noch nicht übergeben; der bisherige Auftrag bleibt unverändert.');
    }
    const previousResources = job.resources;
    job.resources = expanded;
    try { await this.deps.persist(); } catch (error) { job.resources = previousResources; this.deps.changed(); throw error; }
    if (!valid() || job.status !== 'running' || this.runtimes.get(id) !== runtime || job.turnId !== turnId) throw new Error('Diese Aufgabe nimmt gerade keine Änderungen an.');
    await adapter.steer(instruction, turnId!);
    if (!valid() || job.status !== 'running' || this.runtimes.get(id) !== runtime || job.turnId !== turnId) throw new Error('Diese Aufgabe nimmt gerade keine Änderungen an.');
    this.update(job);
    return job;
  }
  async stop(id: string): Promise<void> {
    const job = this.get(id);
    this.revisions.set(id, (this.revisions.get(id) ?? 0) + 1);
    const runtime = this.runtimes.get(id);
    if (runtime?.stop) return runtime.stop;
    if (job.status === 'queued' || (job.status === 'running' && !runtime)) {
      job.status = 'interrupted'; this.update(job); return;
    }
    // A completed agent turn may still own useful managed background processes.
    if (!runtime) return;
    const previousStatus = job.status;
    const previousError = job.error;
    job.status = 'stopping'; this.update(job);
    let resolve!: () => void; let reject!: (error: unknown) => void;
    const stopping = new Promise<void>((done, failed) => { resolve = done; reject = failed; });
    runtime.stop = stopping;
    void (async () => {
      try {
        // Invalidate desktop/model work immediately, even while a query-only
        // idle inspection is pending. Share any already-running disposal.
        await runtime.adapter.stop();
        if (this.runtimes.get(id) !== runtime) {
          job.status = previousStatus; this.update(job); return;
        }
        // stop() may warm a new control connection. This worker is no longer reused.
        await this.disposeRuntime(runtime);
        runtime.ended = true;
        job.status = ['completed', 'failed', 'interrupted'].includes(previousStatus) ? previousStatus : 'interrupted';
        if (previousStatus === 'failed' && previousError) job.error = previousError;
        else delete job.error;
        this.runtimes.delete(id);
        job.runtimeRetained = false;
        this.update(job);
      } catch (error) {
        job.error = this.deps.clean(error instanceof Error ? error.message : 'Das Aufgabenende wurde nicht bestätigt.');
        this.update(job); throw error;
      } finally { runtime.stop = undefined; queueMicrotask(() => this.pump()); }
    })().then(resolve, reject);
    return stopping;
  }
  async stopAll(): Promise<void> {
    this.epoch++;
    this.stoppingAll = true;
    try {
      // Invalidate all admissions before awaiting any single worker's confirmation.
      for (const job of this.jobs) if (job.status === 'queued' || (job.status === 'running' && !this.runtimes.has(job.id))) { job.status = 'interrupted'; this.update(job); }
      const results = await Promise.allSettled([...this.runtimes.keys()].map(id => this.stop(id)));
      const failed = results.find(result => result.status === 'rejected');
      if (failed?.status === 'rejected') throw failed.reason;
    } finally { this.stoppingAll = false; }
  }
  async dispose(): Promise<void> {
    this.closed = true;
    await this.stopAll();
    await Promise.allSettled([this.admissionTail, this.pumpCompletion, ...this.mutations.values()]);
  }
}
