import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process';

export type NativeVoiceHotkey = 'F8' | 'F9';
export interface NativeVoiceHotkeys {
  registered: Record<NativeVoiceHotkey, boolean>;
  dispose(): Promise<void>;
}
interface Options {
  executable: string;
  onPress(key: NativeVoiceHotkey): void;
  onError(error: Error): void;
}
type Launch = (executable: string, args: string[], options: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams;
interface Runtime {
  launch?: Launch;
  readyTimeoutMs?: number;
  stopTimeoutMs?: number;
}
type Message = { type: 'ready'; registered: Record<NativeVoiceHotkey, boolean> } |
  { type: 'press'; key: NativeVoiceHotkey };
const MAX_LINE_LENGTH = 1024;

function parseMessage(line: string): Message {
  const invalid = () => new Error('Ungültige Antwort des Hotkey-Dienstes.');
  let value: unknown;
  try { value = JSON.parse(line); } catch { throw invalid(); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const record = value as Record<string, unknown>;
  if (record.type === 'press' && Object.keys(record).length === 2 && (record.key === 'F8' || record.key === 'F9')) {
    return { type: 'press', key: record.key };
  }
  if (record.type === 'ready' && Object.keys(record).length === 2 && record.registered &&
      typeof record.registered === 'object' && !Array.isArray(record.registered)) {
    const registered = record.registered as Record<string, unknown>;
    if (Object.keys(registered).length === 2 && typeof registered.F8 === 'boolean' && typeof registered.F9 === 'boolean') {
      return { type: 'ready', registered: { F8: registered.F8, F9: registered.F9 } };
    }
  }
  throw invalid();
}

/** Only this helper is owned/stopped here; no terminal or user application is touched. */
export function startNativeVoiceHotkeys(options: Options, runtime: Runtime = {}): Promise<NativeVoiceHotkeys> {
  return new Promise((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = (runtime.launch ?? spawn)(options.executable, ['--parent-pid', String(process.pid)], {
        windowsHide: true, stdio: 'pipe',
      });
    } catch {
      reject(new Error('Der Hotkey-Dienst konnte nicht gestartet werden.'));
      return;
    }
    let registered: Record<NativeVoiceHotkey, boolean> | undefined;
    let closed = false;
    let stopping = false;
    let failed = false;
    let buffer = '';
    let termination: Promise<void> | undefined;
    let closedResolve!: () => void;
    const exited = new Promise<void>(done => { closedResolve = done; });
    const pauseUntilClosed = async (milliseconds: number) => {
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([exited, new Promise<void>(done => { timer = setTimeout(done, milliseconds); })]);
      if (timer) clearTimeout(timer);
    };
    const dispose = (): Promise<void> => {
      if (termination) return termination;
      stopping = true;
      clearTimeout(readyTimer);
      termination = (async () => {
        if (closed) return;
        // EOF alone also stops the native message loop. Sending a byte makes shutdown immediate.
        try { child.stdin.end('stop\n'); } catch { /* The exit event remains authoritative. */ }
        await pauseUntilClosed(runtime.stopTimeoutMs ?? 1500);
        if (!closed) {
          // Windows releases RegisterHotKey ownership when its owning process dies.
          child.kill();
          await pauseUntilClosed(runtime.stopTimeoutMs ?? 1500);
        }
        if (!closed) throw new Error('Der Hotkey-Dienst konnte nicht beendet werden.');
      })();
      return termination;
    };
    const fail = (error: Error) => {
      if (failed || stopping) return;
      failed = true;
      clearTimeout(readyTimer);
      if (registered) {
        try { options.onError(error); } catch { /* Consumer callbacks must not retain global shortcuts. */ }
      } else reject(error);
      void dispose().catch(() => {});
    };
    const readyTimer = setTimeout(() => fail(new Error('Der Hotkey-Dienst antwortet nicht.')), runtime.readyTimeoutMs ?? 5000);
    child.once('error', () => {
      // An unsuccessful spawn has no live helper and may not produce an exit event.
      if (child.pid === undefined) {
        closed = true;
        closedResolve();
      }
      fail(new Error('Der Hotkey-Dienst konnte nicht gestartet werden.'));
    });
    child.once('close', () => {
      closed = true;
      clearTimeout(readyTimer);
      closedResolve();
      if (!stopping) fail(new Error('Der Hotkey-Dienst wurde unerwartet beendet.'));
    });
    child.stdin.on('error', () => fail(new Error('Die Verbindung zum Hotkey-Dienst wurde unterbrochen.')));
    child.stdout.on('error', () => fail(new Error('Die Verbindung zum Hotkey-Dienst wurde unterbrochen.')));
    child.stderr.on('error', () => {});
    child.stderr.resume(); // Never surface raw subprocess diagnostics.
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (stopping || failed) return;
      buffer += chunk;
      while (true) {
        const newline = buffer.indexOf('\n');
        if (newline < 0) {
          if (buffer.length > MAX_LINE_LENGTH) fail(new Error('Ungültige Antwort des Hotkey-Dienstes.'));
          return;
        }
        if (newline > MAX_LINE_LENGTH) { fail(new Error('Ungültige Antwort des Hotkey-Dienstes.')); return; }
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        let message: Message;
        try { message = parseMessage(line); } catch {
          fail(new Error('Ungültige Antwort des Hotkey-Dienstes.'));
          return;
        }
        if (message.type === 'ready') {
          if (registered) { fail(new Error('Ungültige Antwort des Hotkey-Dienstes.')); return; }
          registered = message.registered;
          clearTimeout(readyTimer);
          resolve({ registered: { ...registered }, dispose });
        } else {
          if (!registered || !registered[message.key]) { fail(new Error('Ungültige Antwort des Hotkey-Dienstes.')); return; }
          try { options.onPress(message.key); } catch {
            fail(new Error('Der Hotkey konnte nicht verarbeitet werden.'));
            return;
          }
          if (stopping) return;
        }
      }
    });
  });
}
