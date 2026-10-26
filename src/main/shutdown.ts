export type ShutdownChoice = 'retry' | 'cancel' | 'force';
export interface ShutdownPorts {
  shutdown(): Promise<void>;
  choose(reason: 'failed' | 'timeout'): Promise<ShutdownChoice>;
  busy(value: boolean): void;
  finish(force: boolean): void;
}

/** A failed write must never trap the user in an unclosable application. */
export class ShutdownCoordinator {
  private operation?: Promise<'done' | 'failed'>;
  private request?: Promise<void>;
  private done = false;

  constructor(private readonly ports: ShutdownPorts, private readonly timeoutMs = 10_000) {}

  close(): Promise<void> {
    if (this.request) return this.request;
    this.ports.busy(true);
    const request = this.run().finally(() => {
      if (this.request === request) this.request = undefined;
      this.ports.busy(false);
    });
    this.request = request;
    return request;
  }

  private async run(): Promise<void> {
    for (;;) {
      if (this.done) { this.ports.finish(false); return; }
      // A timeout does not cancel the write or start a second shutdown over it.
      this.operation ??= Promise.resolve().then(() => this.ports.shutdown()).then(
        () => { this.done = true; return 'done' as const; }, () => 'failed' as const);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const result = await Promise.race([this.operation, new Promise<'timeout'>(resolve => {
        timer = setTimeout(() => resolve('timeout'), this.timeoutMs);
      })]);
      clearTimeout(timer);
      if (result === 'done') { this.ports.finish(false); return; }
      if (result === 'failed') this.operation = undefined;
      // Native dialog: still usable if the renderer or its storage has failed.
      const choice = await this.ports.choose(result);
      if (choice === 'force') { this.ports.finish(true); return; }
      if (choice === 'cancel') return;
    }
  }
}
