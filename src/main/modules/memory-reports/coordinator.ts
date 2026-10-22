import { APP_DISPLAY_NAME } from '../../../shared/branding';
import type { SummaryJobState } from '../../../shared/memory';
import { MemorySummarizer, type SummaryBackend, type SummaryCallEvidence } from './summarizer';

export interface MemoryReportSettings {
  memoryModel: string;
  workModel: string;
  automatic: boolean;
  chatgptBackgroundUsage: boolean;
}
export interface MemoryReportPreferenceChange { automatic?: boolean; chatgptBackgroundUsage?: boolean; }
export interface MemoryReportTiming {
  now(): Date;
  schedule(callback: () => void, delayMs: number): { cancel(): void };
}
export interface MemoryReportPorts {
  memory?: SummaryBackend;
  modelClient?: { complete(prompt: string, model: string, signal: AbortSignal, evidence: SummaryCallEvidence): Promise<string> };
  settings(): MemoryReportSettings;
  availability: {
    assertIdle(): void;
    blocked(): boolean;
  };
  capture(): void | Promise<void>;
  projection: {
    publish(state: SummaryJobState): void;
    changed(save?: boolean): void;
  };
  effects: {
    clean(text: string): string;
    activity(kind: 'system' | 'error', title: string, detail?: string): void;
    reportError(error: unknown): void;
  };
}

interface Lease {
  mode: 'auto' | 'manual';
  abort: AbortController;
  done?: Promise<void>;
  stop?: Promise<void>;
  stopping: boolean;
  model: string;
  rejectStart(error: Error): void;
}
interface ScheduledReport { timer?: { cancel(): void }; }
const systemTiming: MemoryReportTiming = {
  now: () => new Date(),
  schedule(callback, delayMs) {
    const timer = setTimeout(callback, delayMs); timer.unref?.();
    return { cancel: () => clearTimeout(timer) };
  },
};
const isChatGPTModel = (model: string) => model.toLowerCase().startsWith('chatgpt/');

/** Direct, tool-free memory reports and their scheduling; no agent or account implementation. */
export class MemoryReportCoordinator {
  private state: SummaryJobState = { status: 'idle', mode: 'manual', model: '', calls: 0, maxCalls: 12, completed: 0, total: 0, remaining: 0 };
  private readonly summarizer?: MemorySummarizer;
  private lease?: Lease;
  private automatic?: ScheduledReport;
  private readonly attemptedDays = new Set<string>();
  private closed = false;
  private stopping?: Promise<void>;
  private readonly work = new Set<Promise<void>>();

  constructor(private readonly ports: MemoryReportPorts, private readonly timing: MemoryReportTiming = systemTiming) {
    if (ports.memory) this.summarizer = new MemorySummarizer(ports.memory);
  }
  snapshot(): SummaryJobState { return structuredClone(this.state); }
  busy(): boolean { return this.lease !== undefined || this.stopping !== undefined; }
  isStopping(): boolean { return this.state.status === 'stopping'; }
  assertIdle(): void {
    if (this.lease || this.stopping) throw new Error('Bitte zuerst die laufenden KI-Gedächtnisberichte stoppen.');
  }
  private model(): string { const settings = this.ports.settings(); return settings.memoryModel || settings.workModel; }
  private automaticAllowed(): boolean { return !isChatGPTModel(this.model()) || this.ports.settings().chatgptBackgroundUsage; }
  private changed(save = true): void { this.ports.projection.publish(this.snapshot()); this.ports.projection.changed(save); }
  private day(): string { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(this.timing.now()); }
  private eligible(): boolean {
    return !this.closed && this.automaticAllowed() && Boolean(this.summarizer) && this.ports.settings().automatic
      && !this.lease && !this.stopping && !this.ports.availability.blocked() && Boolean(this.ports.modelClient) && Boolean(this.model());
  }

  start(mode: 'manual' | 'auto' = 'manual'): Promise<void> { return this.begin(mode); }
  private async begin(mode: 'auto' | 'manual', scheduledDay?: string): Promise<void> {
    if (this.closed) throw new Error(`${APP_DISPLAY_NAME} wird beendet.`);
    if (mode === 'auto' && !this.automaticAllowed()) throw new Error('Automatische Gedächtnisberichte mit ChatGPT benötigen deine ausdrückliche Freigabe in Verbindungen.');
    this.ports.availability.assertIdle(); this.assertIdle();
    if (!this.ports.modelClient || !this.model()) throw new Error('Bitte zuerst ein Gedächtnismodell unter Verbindungen einrichten.');
    if (!this.summarizer) throw new Error('KI-Gedächtnisberichte sind in diesem Build nicht verfügbar.');
    const model = this.model();
    let resolveStart!: () => void, rejectStart!: (error: Error) => void;
    const admitted = new Promise<void>((resolve, reject) => { resolveStart = resolve; rejectStart = reject; });
    void admitted.catch(() => {});
    const lease: Lease = { mode, model, abort: new AbortController(), stopping: false, rejectStart };
    this.lease = lease;
    let published = false;
    lease.done = Promise.resolve().then(async () => {
      try {
        this.checkLease(lease);
        await this.ports.capture();
        this.checkLease(lease);
        if (scheduledDay !== undefined) {
          const jobs = await this.ports.memory!.planSummaries({ closedOnly: true });
          this.checkLease(lease);
          if (!jobs.length) { resolveStart(); return; }
          this.attemptedDays.add(scheduledDay);
        }
        this.state = { status: 'running', mode, model, calls: 0, maxCalls: 12, completed: 0, total: 0, remaining: 0, startedAt: this.timing.now().toISOString() };
        published = true;
        this.ports.effects.activity('system', 'KI-Gedächtnisberichte gestartet', `${model} · direkter Modellaufruf ohne Werkzeuge · höchstens 12 Modellaufrufe · zusätzliche Kontonutzung`); this.changed();
        this.checkLease(lease);
        resolveStart();
        const progress = await this.summarizer!.run({ mode, model, signal: lease.abort.signal, maxCalls: 12,
          call: (prompt, evidence) => this.call(lease, prompt, model, evidence),
          progress: state => { if (this.current(lease)) { Object.assign(this.state, state); this.changed(false); } },
        });
        this.checkLease(lease);
        Object.assign(this.state, progress, { status: 'completed' });
        this.ports.effects.activity('system', 'KI-Gedächtnisberichte beendet', `${progress.completed} Berichte · ${progress.calls} Modellaufrufe${progress.remaining ? ` · ${progress.remaining} verbleiben; bei Bedarf erneut starten.` : ''}`);
      } catch (error) {
        rejectStart(error instanceof Error ? error : new Error('Die Gedächtnisberichte konnten nicht vorbereitet werden.'));
        if (this.current(lease) && !published && scheduledDay !== undefined) {
          this.attemptedDays.add(scheduledDay); this.ports.effects.reportError(error);
        }
        if (this.current(lease) && published) {
          this.state.status = 'failed';
          this.state.error = this.ports.effects.clean(error instanceof Error ? error.message : 'Die Gedächtnisberichte konnten nicht erstellt werden.');
          this.ports.effects.activity('error', 'KI-Gedächtnisberichte unterbrochen', this.state.error);
        }
      } finally {
        if (this.lease === lease && !lease.stopping) {
          this.lease = undefined;
          if (published) this.changed();
        }
      }
    });
    this.work.add(lease.done);
    void lease.done.finally(() => this.work.delete(lease.done!)).catch(() => {});
    return admitted;
  }
  private current(lease: Lease): boolean { return this.lease === lease && !lease.stopping && !lease.abort.signal.aborted && !this.closed; }
  private checkLease(lease: Lease): void {
    if (!this.current(lease)) throw new Error('Gedächtnis-Zusammenfassung gestoppt.');
    if (lease.mode === 'auto' && isChatGPTModel(lease.model) && !this.ports.settings().chatgptBackgroundUsage) throw new Error('Die automatische ChatGPT-Nutzung ist nicht freigegeben.');
  }
  private async call(lease: Lease, prompt: string, model: string, evidence: SummaryCallEvidence): Promise<string> {
    this.checkLease(lease);
    if (!this.ports.modelClient) throw new Error('Kein Modellzugang für Gedächtnisberichte eingerichtet.');
    if (lease.mode === 'auto' && isChatGPTModel(model) && !this.ports.settings().chatgptBackgroundUsage) throw new Error('Die automatische ChatGPT-Nutzung ist nicht freigegeben.');
    const signal = lease.abort.signal;
    let cancel!: () => void;
    const cancelled = new Promise<never>((_resolve, reject) => {
      cancel = () => reject(new Error('Gedächtnis-Zusammenfassung gestoppt.'));
      signal.addEventListener('abort', cancel, { once: true });
    });
    let result: string;
    try { result = await Promise.race([this.ports.modelClient.complete(prompt, model, signal, evidence), cancelled]); }
    finally { signal.removeEventListener('abort', cancel); }
    this.checkLease(lease);
    return this.ports.effects.clean(result);
  }

  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    const lease = this.lease;
    if (!lease) return Promise.resolve();
    if (lease.stop) return lease.stop;
    const stopping = Promise.resolve().then(() => {
      if (this.lease !== lease) return;
      this.lease = undefined;
      this.state.status = 'interrupted'; delete this.state.error;
      this.ports.effects.activity('system', 'KI-Gedächtnisberichte gestoppt', 'Bereits fertiggestellte Berichte bleiben erhalten; kein weiterer Modellaufruf wird gestartet.');
      this.changed();
    });
    lease.stop = stopping; this.stopping = stopping;
    void stopping.finally(() => { if (this.stopping === stopping) this.stopping = undefined; }).catch(() => {});
    lease.stopping = true; lease.abort.abort(); lease.rejectStart(new Error('Gedächtnis-Zusammenfassung gestoppt.'));
    this.state.status = 'stopping'; this.changed(false);
    return stopping;
  }
  async prepareForUserWork(): Promise<void> {
    if (!this.lease) return;
    if (this.lease.mode !== 'auto') throw new Error('Die KI-Gedächtnisberichte laufen gerade. Bitte abwarten oder Stopp betätigen.');
    await this.stop();
  }
  private cancelAutomatic(): void {
    const scheduled = this.automatic; this.automatic = undefined; scheduled?.timer?.cancel();
  }
  suppressAutomaticForToday(): void { this.cancelAutomatic(); this.attemptedDays.add(this.day()); }
  queueAutomatic(): void {
    if (!this.eligible() || this.attemptedDays.has(this.day()) || this.automatic) return;
    const scheduled: ScheduledReport = {}; this.automatic = scheduled;
    scheduled.timer = this.timing.schedule(() => {
      if (this.automatic !== scheduled) return;
      this.automatic = undefined;
      const day = this.day();
      if (!this.eligible() || this.attemptedDays.has(day)) return;
      void this.begin('auto', day).catch(() => {});
    }, 5000);
  }
  async preferencesChanged(change: MemoryReportPreferenceChange): Promise<void> {
    if (change.automatic === false) this.cancelAutomatic();
    if (change.chatgptBackgroundUsage === false && this.lease?.mode === 'auto' && isChatGPTModel(this.lease.model)) await this.stop();
    if (change.chatgptBackgroundUsage === false && !this.automaticAllowed()) this.cancelAutomatic();
    if (change.automatic === true || change.chatgptBackgroundUsage === true) this.queueAutomatic();
  }
  async dispose(): Promise<void> {
    this.closed = true; this.cancelAutomatic(); await this.stop();
    // The controller invokes disposal only after agent/process termination; Stop never drains memory I/O.
    await Promise.allSettled([...this.work]);
  }
}
