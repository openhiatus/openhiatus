/** One synchronous lock per job, shared by list/detail actions across renders. */
export class TaskStopActions {
  private readonly pending = new Set<string>();
  constructor(private readonly changed: (pending: ReadonlySet<string>) => void) {}
  async stop(id: string, request: (id: string) => Promise<void>, onError: (error: unknown) => void): Promise<void> {
    if (this.pending.has(id)) return;
    this.pending.add(id); this.changed(new Set(this.pending));
    try { await request(id); }
    catch (error) { onError(error); }
    finally { this.pending.delete(id); this.changed(new Set(this.pending)); }
  }
}
