import type { SpeechCue } from '../shared/contracts';

/** Snapshot IDs are delivery receipts: canceled or disabled speech is never replayed. */
export class SpeechCueQueue {
  private initialized = false;
  private readonly seen = new Set<string>();
  private pending: SpeechCue[] = [];

  ingest(cues: readonly SpeechCue[] | undefined, enabled: boolean, runningJobIds?: ReadonlySet<string>): void {
    const current = (cue: SpeechCue) => cue.kind !== 'progress' || runningJobIds === undefined
      || !!cue.jobId && runningJobIds.has(cue.jobId);
    this.pending = this.pending.filter(current);
    const first = !this.initialized;
    this.initialized = true;
    for (const cue of cues ?? []) {
      if (this.seen.has(cue.id)) continue;
      this.seen.add(cue.id);
      if (!first && enabled && cue.text.trim() && current(cue)) this.pending.push(cue);
    }
    if (!enabled) this.clear();
  }

  take(): SpeechCue | undefined { return this.pending.shift(); }
  clear(): void { this.pending = []; }
  get length(): number { return this.pending.length; }
}
