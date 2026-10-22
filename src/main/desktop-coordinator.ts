export interface DesktopLease {
  /** Only the granted owner can release this lease. Repeated releases are harmless. */
  release(): void;
}

type Waiter = {
  signal: AbortSignal;
  resolve(lease: DesktopLease): void;
  reject(reason: unknown): void;
  abort(): void;
};

/** One desktop owner at a time, including the gaps between observations and inputs. */
export class DesktopCoordinator {
  private active?: DesktopLease;
  private readonly waiting: Waiter[] = [];

  acquire(signal: AbortSignal): Promise<DesktopLease> {
    if (signal.aborted) return Promise.reject(signal.reason);
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { signal, resolve, reject, abort: () => {
        const index = this.waiting.indexOf(waiter);
        if (index < 0) return; // Granted leases are retained until their owner finishes cleanup.
        this.waiting.splice(index, 1);
        signal.removeEventListener('abort', waiter.abort);
        reject(signal.reason);
      } };
      this.waiting.push(waiter);
      signal.addEventListener('abort', waiter.abort, { once: true });
      this.grantNext();
    });
  }

  private grantNext(): void {
    if (this.active) return;
    const waiter = this.waiting.shift();
    if (!waiter) return;
    waiter.signal.removeEventListener('abort', waiter.abort);
    if (waiter.signal.aborted) {
      waiter.reject(waiter.signal.reason);
      this.grantNext();
      return;
    }
    const lease: DesktopLease = { release: () => {
      if (this.active !== lease) return;
      this.active = undefined;
      this.grantNext();
    } };
    this.active = lease;
    waiter.resolve(lease);
  }
}

/** All production NativeComputer instances coordinate through the same desktop. */
export const sharedDesktopCoordinator = new DesktopCoordinator();
