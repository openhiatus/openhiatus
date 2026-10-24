import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';

/** Lazy hidden read-only observer. Its output contains no key codes, titles or screen contents. */
export class ScreenMonitor {
  private child?: ChildProcessWithoutNullStreams; private ready?: Promise<void>; private stamp?: string; private closing = false; private updated = 0;
  private idle?: ReturnType<typeof setTimeout>;
  constructor(private readonly executable: string, private readonly changed: () => void) {}
  async current(): Promise<string> {
    if (this.closing) throw Error('Bildschirmbeobachtung wird beendet.');
    if (!this.ready) this.ready = new Promise<void>((resolve, reject) => {
      const child = this.child = spawn(this.executable, [String(process.pid)], { windowsHide: true, stdio: 'pipe' });
      const timer = setTimeout(() => { child.stdin.end(); reject(Error('Bildschirmbeobachtung nicht verfügbar.')); }, 5000);
      const lines = createInterface({ input: child.stdout }); let first = true;
      lines.on('line', line => {
        if (line.length > 512) { child.stdin.end(); return; }
        try { const v = JSON.parse(line); if (typeof v.stamp !== 'string' || !/^-?\d+(?::-?\d+){5}$/.test(v.stamp)) throw Error();
          if (this.stamp !== undefined && v.stamp !== this.stamp) this.changed(); this.stamp = v.stamp; this.updated = Date.now();
          if (first) { first = false; clearTimeout(timer); resolve(); }
        } catch { this.stamp = undefined; this.changed(); child.stdin.end(); }
      });
      const retired = () => { if (this.child !== child) return; this.stamp = undefined; this.ready = undefined; this.child = undefined; this.changed(); };
      child.stdin.on('error', () => retired());
      child.on('error', () => { clearTimeout(timer); retired(); reject(Error('Bildschirmbeobachtung nicht verfügbar.')); });
      child.on('exit', () => { clearTimeout(timer); retired(); lines.close(); reject(Error('Bildschirmbeobachtung beendet.')); });
      child.stderr.resume();
    });
    await this.ready; await new Promise(resolve => setTimeout(resolve, 60));
    if (!this.stamp || this.closing || Date.now() - this.updated > 500) throw Error('Bildschirmbeobachtung nicht verfügbar.');
    clearTimeout(this.idle); this.idle = setTimeout(() => { this.stamp = undefined; this.changed(); this.child?.stdin.end(); }, 65000); this.idle.unref?.();
    return this.stamp;
  }
  async dispose(): Promise<void> {
    this.closing = true; clearTimeout(this.idle); this.stamp = undefined; const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(Error('Bildschirmbeobachtung wurde noch nicht beendet.')), 5000);
      child.once('exit', () => { clearTimeout(timer); resolve(); }); child.stdin.end(); });
  }
}
