export interface StateJournalPorts<State> {
  snapshot(): State;
  /** Resolves only after validation, complete write and durable acknowledgement. */
  commit(state: State): void | Promise<void>;
  publish(): void;
  checkpointsBlocked(): boolean;
  checkpointFailed(error: unknown): void;
}

interface Write<State> {
  state: State;
  generation: number;
  kind: 'durable' | 'checkpoint';
  resolve?(): void;
  reject?(error: unknown): void;
}

export class StateWriteInvalidatedError extends Error {
  constructor(cause?: unknown) {
    super('Der Speicherstand wurde nach einem fehlgeschlagenen Schreibzugriff verworfen. Bitte erneut versuchen.'
      + (cause instanceof Error ? `\n${cause.message}` : ''), { cause });
  }
}

/** Ordered durable barriers and coalesced checkpoints, independently of UI delivery. */
export class StateJournal<State> {
  private readonly barriers: Write<State>[] = [];
  private checkpointWrite?: Write<State>;
  private checkpointRequested = false;
  private active?: Write<State>;
  private generation = 0;
  private failure?: { generation: number; error: unknown };
  private timer?: ReturnType<typeof setTimeout>;
  private recoveryTimer?: ReturnType<typeof setTimeout>;
  private recovery?: Promise<void>;
  private recovered?: () => void;
  private readonly waiters: Array<{ resolve(): void; reject(error: unknown): void }> = [];
  private readonly delay: number;

  constructor(private readonly ports: StateJournalPorts<State>, options: { checkpointDelayMs?: number } = {}) {
    this.delay = options.checkpointDelayMs ?? 25;
    if (!Number.isFinite(this.delay) || this.delay < 0 || this.delay > 1000) throw new Error('Ungültiger Checkpoint-Abstand.');
  }

  /** Await before optimistic admission mutations after a failed write. */
  ready(): Promise<void> { return this.recovery ?? Promise.resolve(); }

  durableCommit(): Promise<void> {
    if (this.recovery) return Promise.reject(new StateWriteInvalidatedError(this.failure?.error));
    const generation = ++this.generation;
    let state: State;
    try { state = structuredClone(this.ports.snapshot()); }
    catch (error) { this.invalidate(generation, error); return Promise.reject(error); }
    // This newer complete snapshot includes earlier ordinary checkpoints.
    this.checkpointWrite = undefined; this.checkpointRequested = false; this.clearTimer();
    const promise = new Promise<void>((resolve, reject) => this.barriers.push({ kind: 'durable', state, generation, resolve, reject }));
    this.pump();
    return promise;
  }

  checkpoint(save = true): void {
    if (save) {
      if (this.recovery || this.ports.checkpointsBlocked()) {
        this.checkpointWrite = undefined; this.checkpointRequested = true; this.clearTimer();
      } else this.captureCheckpoint();
    }
    this.ports.publish();
  }

  publish(): void { this.ports.publish(); }

  /** Resume ordinary writes after confirmed termination, without awaiting disk work in Stop. */
  flushCheckpoint(): void {
    if (this.recovery || this.ports.checkpointsBlocked()) return;
    if (this.checkpointRequested) this.captureCheckpoint();
    this.clearTimer(); this.pump();
  }

  /** Drain before closing the store; Stop itself must never await this method. */
  flush(): Promise<void> {
    const promise = new Promise<void>((resolve, reject) => this.waiters.push({ resolve, reject }));
    this.flushCheckpoint(); this.pump(); this.settle();
    return promise;
  }

  private clearTimer(): void { if (this.timer !== undefined) clearTimeout(this.timer); this.timer = undefined; }
  private captureCheckpoint(): void {
    const generation = ++this.generation;
    try { this.checkpointWrite = { kind: 'checkpoint', state: structuredClone(this.ports.snapshot()), generation }; this.checkpointRequested = false; }
    catch (error) { this.invalidate(generation, error); this.report(error); return; }
    if (this.waiters.length) { this.clearTimer(); this.pump(); }
    else if (this.timer === undefined) this.timer = setTimeout(() => { this.timer = undefined; this.pump(); }, this.delay);
  }

  private pump(): void {
    if (this.active || this.recovery) return;
    let write = this.barriers.shift();
    if (!write && this.checkpointWrite && this.ports.checkpointsBlocked()) {
      this.checkpointWrite = undefined; this.checkpointRequested = true; this.clearTimer();
    }
    if (!write && this.checkpointWrite && this.timer === undefined) { write = this.checkpointWrite; this.checkpointWrite = undefined; }
    if (!write) { this.settle(); return; }
    this.active = write;
    const current = write;
    void Promise.resolve().then(() => this.ports.commit(current.state)).then(() => {
      this.active = undefined;
      if (this.failure && current.generation > this.failure.generation) this.failure = undefined;
      current.resolve?.(); this.pump(); this.settle();
    }, error => {
      this.active = undefined;
      this.invalidate(current.generation, error);
      current.reject?.(error);
      if (current.kind === 'checkpoint') this.report(error);
      this.settle();
    });
  }

  private invalidate(generation: number, error: unknown): void {
    this.clearTimer(); this.checkpointWrite = undefined; this.checkpointRequested = false;
    const cancelled = this.barriers.splice(0);
    this.failure = { generation: Math.max(generation, ...cancelled.map(write => write.generation)), error };
    if (!this.recovery) this.recovery = new Promise<void>(resolve => { this.recovered = resolve; });
    for (const write of cancelled) write.reject?.(new StateWriteInvalidatedError(error));
    if (this.recoveryTimer !== undefined) clearTimeout(this.recoveryTimer);
    // Async port wrappers may add multiple Promise hops before module rollbacks.
    // Recapture only in the next event-loop turn, never from speculative old queue snapshots.
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = undefined;
      const resolve = this.recovered; this.recovered = undefined; this.recovery = undefined;
      resolve?.();
      if (this.checkpointRequested && !this.ports.checkpointsBlocked()) this.captureCheckpoint();
      this.pump(); this.settle();
    }, 0);
  }

  private report(error: unknown): void {
    try { this.ports.checkpointFailed(error); this.ports.publish(); }
    catch { /* Reporting cannot strand acknowledgements or prevent process cleanup. */ }
  }

  private settle(): void {
    if (this.active || this.barriers.length || this.checkpointWrite || this.checkpointRequested || this.recovery) return;
    for (const waiter of this.waiters.splice(0)) this.failure ? waiter.reject(this.failure.error) : waiter.resolve();
  }
}
