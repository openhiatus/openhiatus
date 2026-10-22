import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { startNativeVoiceHotkeys, type NativeVoiceHotkey } from '../src/main/native-hotkeys.js';

const ready = (f8 = true, f9 = true) => JSON.stringify({ type: 'ready', registered: { F8: f8, F9: f9 } }) + '\n';
const press = (key: string) => JSON.stringify({ type: 'press', key }) + '\n';

function fixture(initial: string | null = ready(), closeOnInput = true) {
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), pid: 123,
    kill: () => { kills++; queueMicrotask(() => child.emit('close', null)); return true; },
  });
  let kills = 0;
  const calls: NativeVoiceHotkey[] = [];
  const errors: Error[] = [];
  const inputs: string[] = [];
  child.stdin.on('data', (chunk: Buffer) => inputs.push(chunk.toString()));
  if (closeOnInput) child.stdin.on('finish', () => queueMicrotask(() => child.emit('close', 0)));
  const start = () => startNativeVoiceHotkeys({
    executable: 'isolated-test-helper.exe', onPress: key => calls.push(key), onError: error => errors.push(error),
  }, {
    launch: (executable, args, options) => {
      assert.equal(executable, 'isolated-test-helper.exe');
      assert.deepEqual(args, ['--parent-pid', String(process.pid)]);
      assert.equal(options.windowsHide, true);
      assert.equal(options.stdio, 'pipe');
      if (initial !== null) queueMicrotask(() => child.stdout.write(initial));
      return child as unknown as ChildProcessWithoutNullStreams;
    },
    readyTimeoutMs: 30, stopTimeoutMs: 15,
  });
  return { child, start, calls, errors, inputs, get kills() { return kills; } };
}

test('native hotkeys reports individual conflicts and forwards registered keys across split JSON lines', async () => {
  const f = fixture(ready(true, false));
  const service = await f.start();
  assert.deepEqual(service.registered, { F8: true, F9: false });
  f.child.stdout.write('{"type":"pre');
  assert.deepEqual(f.calls, []);
  f.child.stdout.write('ss","key":"F8"}\r\n');
  assert.deepEqual(f.calls, ['F8']);
  f.child.stdout.write(press('F8'));
  assert.deepEqual(f.calls, ['F8', 'F8']);
  assert.equal(f.errors.length, 0);
  await service.dispose();
  assert.equal(f.kills, 0);
});

test('dispose is idempotent, stops only its child and discards queued or late key presses', async () => {
  const f = fixture();
  const service = await f.start();
  f.child.stdout.write(press('F8') + press('F9'));
  assert.deepEqual(f.calls, ['F8', 'F9']);
  const first = service.dispose();
  assert.equal(service.dispose(), first);
  f.child.stdout.write(press('F8') + press('F10'));
  await first;
  assert.deepEqual(f.calls, ['F8', 'F9']);
  assert.deepEqual(f.inputs, ['stop\n']);
  assert.equal(f.errors.length, 0);
  assert.equal(f.kills, 0);
});

test('an unresponsive owned helper is terminated after bounded graceful shutdown', async () => {
  const f = fixture(ready(), false);
  const service = await f.start();
  await service.dispose();
  assert.equal(f.kills, 1);
  assert.equal(f.errors.length, 0);
});

test('ready timeout closes stdin so an initialization failure cannot orphan the helper', async () => {
  const f = fixture(null);
  await assert.rejects(f.start(), /antwortet nicht/);
  assert.deepEqual(f.inputs, ['stop\n']);
  assert.equal(f.errors.length, 0);
});

test('unexpected helper exit reports one generic error and disables subsequent input', async () => {
  const f = fixture();
  const service = await f.start();
  f.child.stderr.write('private detail must not become an error');
  f.child.emit('close', 5);
  f.child.stdout.write(press('F8'));
  assert.equal(f.errors.length, 1);
  assert.match(f.errors[0].message, /unerwartet beendet/);
  assert.doesNotMatch(f.errors[0].message, /private/);
  assert.deepEqual(f.calls, []);
  await service.dispose();
});

test('malformed, oversized and premature messages fail closed without dispatching keys', async () => {
  for (const invalid of [press('F8'), press('F10'), 'null\n', '[]\n', 'invalid\n', 'x'.repeat(1025),
    '{"type":"ready","registered":{"F8":true}}\n',
    '{"type":"ready","registered":{"F8":true,"F9":true,"F10":"true"}}\n',
    '{"type":"ready","registered":{"F8":true,"F9":true,"F10":true,"F11":true}}\n',
    '{"type":"ready","registered":{"F8":true,"F9":true,"F10":true},"extra":true}\n']) {
    const f = fixture(invalid);
    await assert.rejects(f.start(), /Ungültige Antwort/);
    assert.deepEqual(f.calls, []);
    assert.deepEqual(f.inputs, ['stop\n']);
  }
});

test('duplicate ready and events for unavailable or unknown keys disable the helper', async () => {
  for (const invalid of [ready(), press('F9'), press('F10'), press('F11')]) {
    const f = fixture(ready(true, false));
    const service = await f.start();
    f.child.stdout.write(invalid);
    assert.equal(f.errors.length, 1);
    assert.deepEqual(f.calls, []);
    await service.dispose();
  }
});

test('spawn failures are sanitized and rejected without a pending startup timer', async () => {
  await assert.rejects(startNativeVoiceHotkeys({
    executable: 'missing.exe', onPress() { assert.fail('no press expected'); }, onError() { assert.fail('startup rejects'); },
  }, { launch() { throw new Error('private environment'); }, readyTimeoutMs: 10 }), /konnte nicht gestartet werden/);
  const f = fixture(null);
  const starting = f.start();
  Object.assign(f.child, { pid: undefined });
  f.child.emit('error', new Error('private path'));
  await assert.rejects(starting, /konnte nicht gestartet werden/);
});

test('a process error after startup still stops the existing owned helper', async () => {
  const f = fixture();
  const service = await f.start();
  f.child.emit('error', new Error('native runtime error'));
  await service.dispose();
  assert.equal(f.errors.length, 1);
  assert.deepEqual(f.inputs, ['stop\n']);
});
