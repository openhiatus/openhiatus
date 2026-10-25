import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { startDesktopProtection } from '../src/main/desktop-protection';

function fixture() {
  const commands: string[] = [], stops: (Error | undefined)[] = [], voices: string[] = [];
  const signal = new AbortController();
  const child = Object.assign(new EventEmitter(), { pid: 123, stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(),
    kill: () => { queueMicrotask(() => child.emit('close')); return true; } });
  child.stdin.on('data', value => commands.push(String(value)));
  child.stdin.on('finish', () => queueMicrotask(() => child.emit('close')));
  const pending = startDesktopProtection({ executable: 'synthetic.exe', signal: signal.signal, voiceKeys: { recording: true, submit: true },
    onStop: error => stops.push(error), onVoice: key => voices.push(key) },
  { launch: (_file, args, options) => { assert.ok(args.includes('--parent-pid')); assert.equal(options.windowsHide, true); return child as unknown as ChildProcessWithoutNullStreams; }, readyTimeoutMs: 1000 });
  return { child, pending, signal, commands, stops, voices, message: (value: string) => child.stdout.write(value + '\n') };
}

test('native readiness gates use; Esc aborts synchronously and disposal confirms restoration', async () => {
  const f = fixture(); let ready = false; void f.pending.then(() => { ready = true; });
  f.message('alive'); await Promise.resolve(); assert.equal(ready, false);
  f.message('ready'); const guard = await f.pending;
  f.message('f8'); f.message('f9'); assert.deepEqual(f.voices, ['F8', 'F9']);
  f.message('escape'); assert.equal(guard.signal.aborted, true); assert.equal(f.stops.length, 1);
  assert.ok(f.commands.includes('halt\n'));
  await guard.dispose(); await guard.dispose(); assert.ok(f.commands.includes('release\n'));
});

test('an interrupted startup waits for helper exit and never returns an unprotected desktop', async () => {
  const f = fixture(); f.signal.abort(); await assert.rejects(f.pending, /abgebrochen/);
  assert.ok(f.commands.includes('release\n')); assert.equal(f.stops.length, 1);
});

test('unexpected exit and malformed protocol stop active automation', async () => {
  for (const invalid of ['private key text must not leave the helper', 'ready', 'x'.repeat(5000), 'exit']) {
    const f = fixture(); f.message('ready'); const guard = await f.pending;
    if (invalid === 'exit') f.child.emit('close'); else f.message(invalid);
    assert.equal(guard.signal.aborted, true); assert.equal(f.stops.length, 1);
    assert.ok(!f.stops[0]?.message.includes('private key text'));
    await guard.dispose();
  }
});

test('ready failure rejects and retires the helper', async () => {
  const f = fixture(); f.message('failed'); await assert.rejects(f.pending, /aufrechterhalten/);
  assert.ok(f.commands.includes('release\n'));
});
