import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process';

export interface DesktopProtection {
  readonly signal: AbortSignal;
  /** Stop accepting injected actions while native cleanup is pending. */
  halt(): void;
  dispose(): Promise<void>;
}
export type ProtectDesktop = (signal: AbortSignal) => Promise<DesktopProtection>;
type Launch = (file: string, args: string[], options: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams;
interface Options { executable: string; signal: AbortSignal; voiceKeys?: { recording: boolean; submit: boolean }; onStop(error?: Error): void; onVoice?(key: 'F8' | 'F9'): void; }
interface Runtime { launch?: Launch; readyTimeoutMs?: number; heartbeatMs?: number; stopTimeoutMs?: number; }

/** Content-free native protocol. The helper independently unlocks on EOF, parent exit or a lost heartbeat. */
export function startDesktopProtection(options: Options, runtime: Runtime = {}): Promise<DesktopProtection> {
  options.signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = new AbortController();
    let child: ChildProcessWithoutNullStreams;
    try { child = (runtime.launch ?? spawn)(options.executable, ['--parent-pid', String(process.pid),
      ...(options.voiceKeys?.recording ? ['--f8'] : []), ...(options.voiceKeys?.submit ? ['--f9'] : [])], { windowsHide: true, stdio: 'pipe' }); }
    catch { reject(Error('Die Eingabesperre konnte nicht gestartet werden.')); return; }
    let ready = false, closed = false, disposing = false, failed = false, buffer = '';
    let termination: Promise<void> | undefined, heartbeat: NodeJS.Timeout | undefined;
    let lastAlive = Date.now();
    let closeResolve!: () => void;
    const exited = new Promise<void>(done => { closeResolve = done; });
    const write = (command: string) => { if (!closed && !child.stdin.destroyed) child.stdin.write(command + '\n'); };
    const waitClosed = async () => {
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([exited, new Promise<void>(done => { timer = setTimeout(done, runtime.stopTimeoutMs ?? 1000); })]);
      clearTimeout(timer);
    };
    const halt = () => { if (!disposing && !closed) write('halt'); };
    const dispose = (): Promise<void> => termination ??= (async () => {
      disposing = true; clearTimeout(readyTimer); clearInterval(heartbeat);
      options.signal.removeEventListener('abort', cancelled);
      if (closed) return;
      try { child.stdin.end('release\n'); } catch { /* Exit is authoritative. */ }
      await waitClosed();
      if (!closed) { child.kill(); await waitClosed(); }
      if (!closed) throw Error('Die Freigabe von Maus und Tastatur konnte nicht bestätigt werden.');
    })();
    const fail = (error?: Error) => {
      if (failed || disposing) return;
      failed = true; abort.abort(error ?? Error('Desktopsteuerung mit Esc gestoppt.')); halt();
      clearTimeout(readyTimer); options.signal.removeEventListener('abort', cancelled);
      if (!ready) {
        void dispose().then(() => reject(error ?? Error('Desktopübernahme abgebrochen.')), reject);
      }
      try { options.onStop(error); } catch { /* Native watchdog remains independent of the host. */ }
    };
    const cancelled = () => fail();
    const readyTimer = setTimeout(() => fail(Error('Die Eingabesperre wurde nicht bestätigt. Bitte Tasten und Maustasten loslassen.')), runtime.readyTimeoutMs ?? 6000);
    options.signal.addEventListener('abort', cancelled, { once: true });
    if (options.signal.aborted) cancelled();
    child.once('error', () => { if (child.pid === undefined) { closed = true; closeResolve(); } fail(Error('Die Eingabesperre konnte nicht gestartet werden.')); });
    child.once('close', () => { closed = true; clearTimeout(readyTimer); clearInterval(heartbeat); closeResolve(); if (!disposing) fail(Error('Die Eingabesperre wurde beendet; die Desktopsteuerung wird gestoppt.')); });
    for (const stream of [child.stdin, child.stdout]) stream.on('error', () => fail(Error('Die Verbindung zur Eingabesperre wurde unterbrochen.')));
    child.stderr.on('error', () => {}); child.stderr.resume();
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (disposing || failed) return;
      buffer += chunk;
      if (buffer.length > 4096) { fail(Error('Ungültige Antwort der Eingabesperre.')); return; }
      for (;;) {
        const end = buffer.indexOf('\n'); if (end < 0) return;
        const line = buffer.slice(0, end).replace(/\r$/, ''); buffer = buffer.slice(end + 1);
        if (line === 'ready' && !ready) {
          ready = true; clearTimeout(readyTimer); options.signal.removeEventListener('abort', cancelled);
          resolve({ signal: abort.signal, halt, dispose });
        } else if (line === 'alive') lastAlive = Date.now();
        else if (ready && ((line === 'f8' && options.voiceKeys?.recording) || (line === 'f9' && options.voiceKeys?.submit))) {
          try { options.onVoice?.(line === 'f8' ? 'F8' : 'F9'); } catch { fail(Error('Der Sprachkurzbefehl konnte nicht verarbeitet werden.')); return; }
        }
        else if (line === 'escape') { fail(); return; }
        else { fail(Error('Die Eingabesperre konnte nicht aufrechterhalten werden.')); return; }
      }
    });
    heartbeat = setInterval(() => {
      if (disposing || closed) return;
      if (Date.now() - lastAlive > 2000) { fail(Error('Die Eingabesperre antwortet nicht mehr.')); void dispose().catch(() => {}); return; }
      write('ping');
    }, runtime.heartbeatMs ?? 250);
    heartbeat.unref(); write('ping');
  });
}
