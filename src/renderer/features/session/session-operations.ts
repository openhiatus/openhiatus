export interface OperationEffects {
  started?(): void;
  succeeded?(): void;
  failed?(error: unknown): void;
  settled?(): void;
  cancelled?(): void;
}
interface Operation { epoch: number; name: string; effects: OperationEffects; }
interface StopOperation { epoch: number; promise: Promise<boolean>; }

/** UI effects belong to the admitted operation, independently of backend acknowledgement timing. */
export class SessionOperations {
  private epoch = 0;
  private closed = false;
  private sendOperation?: Operation;
  private actionOperation?: Operation;
  private stopOperation?: StopOperation;
  private draftRequest?: { text: string; id: string };

  constructor(private readonly createRequestId: () => string = () => crypto.randomUUID()) {}

  isSending(): boolean { return this.sendOperation !== undefined; }
  isStopping(): boolean { return this.stopOperation !== undefined; }
  actionName(): string | undefined { return this.actionOperation?.name; }

  send(text: string, work: (requestId: string) => Promise<void>, effects: OperationEffects): Promise<boolean> {
    if (this.closed || this.stopOperation || this.sendOperation || this.actionOperation?.name === 'new') return Promise.resolve(false);
    const operation: Operation = { epoch: this.epoch, name: 'send', effects };
    this.sendOperation = operation;
    return this.run(operation, 'sendOperation', () => {
      if (!this.draftRequest || this.draftRequest.text !== text) this.draftRequest = { text, id: this.createRequestId() };
      return work(this.draftRequest.id);
    });
  }
  action(name: string, work: () => Promise<void>, effects: OperationEffects): Promise<boolean> {
    if (this.closed || this.stopOperation || this.actionOperation || (name === 'new' && this.sendOperation)) return Promise.resolve(false);
    const operation: Operation = { epoch: this.epoch, name, effects };
    this.actionOperation = operation;
    return this.run(operation, 'actionOperation', work);
  }
  private async run(operation: Operation, owner: 'sendOperation' | 'actionOperation', work: () => Promise<void>): Promise<boolean> {
    const current = () => !this.closed && operation.epoch === this.epoch && this[owner] === operation;
    try {
      operation.effects.started?.();
      if (!current()) return false;
      await work();
      if (!current()) return false;
      if (owner === 'sendOperation') this.draftRequest = undefined;
      operation.effects.succeeded?.(); return true;
    } catch (error) { if (current()) operation.effects.failed?.(error); return false; }
    finally {
      if (current()) { this[owner] = undefined; operation.effects.settled?.(); }
    }
  }
  stop(work: () => Promise<void>, effects: OperationEffects): Promise<boolean> {
    if (this.closed) return Promise.resolve(false);
    if (this.stopOperation) return this.stopOperation.promise;
    const cancelled = [this.sendOperation, this.actionOperation];
    this.sendOperation = undefined; this.actionOperation = undefined;
    this.draftRequest = undefined;
    const epoch = ++this.epoch;
    let resolve!: (confirmed: boolean) => void, reject!: (error: unknown) => void;
    const promise = new Promise<boolean>((done, failed) => { resolve = done; reject = failed; });
    const operation: StopOperation = { epoch, promise }; this.stopOperation = operation;
    const current = () => !this.closed && epoch === this.epoch && this.stopOperation === operation;
    void (async () => {
      try {
        for (const previous of cancelled) previous?.effects.cancelled?.();
        effects.started?.();
        await work();
        if (!current()) return false;
        effects.succeeded?.(); return true;
      } catch (error) { if (current()) effects.failed?.(error); return false; }
      finally { if (current()) { this.stopOperation = undefined; effects.settled?.(); } }
    })().then(resolve, reject);
    return promise;
  }
  dispose(): void {
    this.closed = true; this.epoch++;
    this.sendOperation = undefined; this.actionOperation = undefined; this.stopOperation = undefined;
    this.draftRequest = undefined;
  }
}
