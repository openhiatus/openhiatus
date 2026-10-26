import { renameSync } from 'node:fs';

interface StateFileReplacePorts {
  platform: NodeJS.Platform;
  rename(temporary: string, target: string): void;
  wait(milliseconds: number): void;
}
const retryDelays = [10, 20, 40, 80, 160, 320, 640] as const;
const waitCell = new Int32Array(new SharedArrayBuffer(4));
const systemPorts: StateFileReplacePorts = {
  platform: process.platform,
  rename: renameSync,
  wait: milliseconds => { Atomics.wait(waitCell, 0, 0, milliseconds); },
};

/** Worker-only replacement of a completed, fsynced state file. Never repeats save or removes the target. */
export function replaceStateFile(temporary: string, target: string, ports: StateFileReplacePorts = systemPorts): void {
  for (let attempt = 0; ; attempt++) {
    try { ports.rename(temporary, target); return; }
    catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      if (ports.platform !== 'win32' || (code !== 'EPERM' && code !== 'EBUSY') || attempt >= retryDelays.length) throw error;
      // A reader or scanner can briefly prevent Windows from replacing the target.
      // The same closed temp file remains intact; the worker keeps its FIFO until ACK.
      ports.wait(retryDelays[attempt]);
    }
  }
}
