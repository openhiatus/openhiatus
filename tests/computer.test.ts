import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import type { CuaDriverSessionLike, PressKeyInput, ToolResult } from '@trycua/cua-driver';
import { COMPUTER_TOOL, COMPUTER_METADATA_PREFIX, computerReplyMetadata, ComputerCleanupError, ComputerDriverError, DesktopCoordinator, NativeComputer, parseComputerInput, pasteComputerText, type ComputerInput, type ComputerSession } from '../src/main/computer.js';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7N8AAAAASUVORK5CYII=';
function result(values: Partial<ToolResult> = {}): ToolResult {
  return { text: '', images: [], isError: false, degraded: false, rawJson: '{}', ...values };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function paintClock() {
  let now = 0;
  return { now: () => now, async wait(ms: number, _signal: AbortSignal) { now += ms; await Promise.resolve(); } };
}
/** Actual complete 1px RGB PNGs, so delayed-paint fixtures differ in visible pixels. */
function pixelPng(red: number, green: number, blue: number): string {
  const chunk = (name: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(name, 'ascii'), data]);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, body, checksum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from([0, red, green, blue]))), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}
class FakeSession implements ComputerSession {
  calls: string[] = [];
  inputs: ComputerInput[] = [];
  size = { width: 1, height: 1, scale_factor: 1 };
  capture = result({ images: [{ mimeType: 'image/png', dataBase64: PNG }], structuredJson: JSON.stringify({
    platform: 'windows', display: 'primary', screenshot_width: 1, screenshot_height: 1,
    screen_width: 1, screen_height: 1, scale_factor: 1,
  }) });
  beforeSize?: (signal: AbortSignal) => Promise<void>;
  beforeAct?: (signal: AbortSignal) => Promise<void>;
  beforeCapture?: (signal: AbortSignal) => Promise<void>;
  beforeDispose?: () => Promise<void>;
  failDispose = false;
  actionResult = result({ action: { effect: 2, route: 2 } });
  async screenshot(signal: AbortSignal) { this.calls.push('screenshot'); await this.beforeCapture?.(signal); return this.capture; }
  async screenSize(signal: AbortSignal) { this.calls.push('size'); await this.beforeSize?.(signal); return result({ structuredJson: JSON.stringify(this.size) }); }
  async act(input: Exclude<ComputerInput, { action: 'screenshot' }>, signal: AbortSignal) {
    this.calls.push(input.action); this.inputs.push(input); await this.beforeAct?.(signal); return this.actionResult;
  }
  async dispose() { this.calls.push('dispose'); await this.beforeDispose?.(); if (this.failDispose) throw new Error('native secret'); }
}
function fixture() {
  const sessions: FakeSession[] = [];
  const computer = new NativeComputer({ captureTiming: paintClock(), createSession: async () => { const session = new FakeSession(); sessions.push(session); return session; } });
  return { computer, sessions };
}

test('metadata excludes accidental embedded image data and preserves special characters and observation boundaries', async () => {
  const observation = `Größe, Äpfel und Öl.\nEine Zeile mit ${COMPUTER_METADATA_PREFIX}{} und data:image/png;base64,${PNG}`;
  const metadata = computerReplyMetadata({ frameId: 'frame', width: 1, height: 1 }, observation);
  assert.ok(!metadata.includes(PNG));
  assert.ok(metadata.length < 2500);
  const parsed = JSON.parse(metadata.split('\n')[0].slice(COMPUTER_METADATA_PREFIX.length));
  assert.equal(parsed.observation, observation.replace(`data:image/png;base64,${PNG}`, '[Bilddaten separat]'));
  const large = computerReplyMetadata({ frameId: 'frame', width: 1, height: 1 }, 'ö'.repeat(10000));
  assert.ok(large.length < 2300, 'future verbose driver output cannot turn metadata into an unbounded text dump');
});

test('each returned action image permits the next observed action without an extra explicit screenshot', async () => {
  const { computer, sessions } = fixture();
  const initial = await computer.execute({ action: 'screenshot' });
  const focused = await computer.execute({ action: 'click', frameId: initial.frameId, x: 0, y: 0 });
  const typed = await computer.execute({ action: 'type', frameId: focused.frameId, text: 'Vorbereiteter Auftrag ohne Absenden.' });
  assert.deepEqual(sessions[0].calls.filter(call => call !== 'screenshot'), ['size', 'click', 'size', 'type']);
  assert.equal(JSON.parse(typed.text).renderingWait.result, 'bounded-wait');
  assert.notEqual(typed.frameId, focused.frameId);
  await assert.rejects(computer.execute({ action: 'key', frameId: focused.frameId, key: 'enter' }), /veraltet/);
  assert.equal(sessions[0].inputs.length, 2, 'an already consumed frame still cannot authorize another input');
  await computer.dispose();
});

test('computer exposes a generic single-action tool and rejects scripts, batches and unrelated fields', async () => {
  const { computer, sessions } = fixture();
  assert.equal(COMPUTER_TOOL.name, 'computer');
  for (const value of [[], null, { action: 'exec', command: 'anything' }, { action: 'screenshot', script: 'anything' },
    { action: 'click', frameId: 'f', x: -1, y: 0 }, { action: 'type', frameId: 'f', text: 'a'.repeat(12001) },
    { action: 'type', frameId: 'f', text: 'bad\0text' }, { action: 'key', frameId: 'f', key: 'x', modifiers: ['ctrl', 'ctrl'] },
    { action: 'scroll', frameId: 'f', x: 0, y: 0, direction: 'down', amount: 21 }]) await assert.rejects(computer.execute(value));
  assert.equal(sessions.length, 0);
  assert.deepEqual(parseComputerInput({ action: 'key', frameId: 'f', key: 'Return', modifiers: ['alt'] }),
    { action: 'key', frameId: 'f', key: 'enter', modifiers: ['alt'] });
  assert.throws(() => parseComputerInput({ action: 'key', frameId: 'f', key: '1' }), /type/);
});

test('real image bytes are returned after screenshot and each input, without exposing typed text in diagnostics', async () => {
  const { computer, sessions } = fixture();
  let image = await computer.execute({ action: 'screenshot' });
  assert.equal(image.image.base64, PNG);
  assert.equal(image.image.mimeType, 'image/png');
  assert.deepEqual([image.width, image.height], [1, 1]);
  const actions = [
    { action: 'click', x: 0, y: 0, button: 'right', count: 2 },
    { action: 'type', text: 'private input äöü' }, { action: 'key', key: 'enter', modifiers: ['ctrl'] },
    { action: 'scroll', x: 0, y: 0, direction: 'down', amount: 2 },
    { action: 'move', x: 0, y: 0 }, { action: 'drag', fromX: 0, fromY: 0, x: 0, y: 0 },
  ];
  for (const input of actions) {
    const previous = image.frameId;
    image = await computer.execute({ ...input, frameId: previous });
    assert.notEqual(image.frameId, previous);
    assert.equal(image.image.base64, PNG);
    assert.doesNotMatch(image.text, /private input/);
    assert.equal(JSON.parse(image.text).effect, 'unverifiable');
  }
  assert.equal(sessions[0].inputs.length, 6);
  assert.ok(sessions[0].calls.filter(call => call === 'screenshot').length > 7);
  assert.ok(sessions[0].calls.filter(call => call === 'screenshot').length <= 55, 'capture retries are bounded independently of input count');
  await computer.dispose();
});

test('post-action capture waits past stable old pictures for delayed visible paint and performs exactly one input', async () => {
  const session = new FakeSession(); const timing = paintClock();
  const empty = pixelPng(255, 255, 255); const painted = pixelPng(12, 80, 160);
  session.capture.images = [{ mimeType: 'image/png', dataBase64: empty }];
  const computer = new NativeComputer({ createSession: async () => session, captureTiming: timing });
  const initial = await computer.execute({ action: 'screenshot' });
  session.beforeCapture = async () => { session.capture.images = [{ mimeType: 'image/png', dataBase64: timing.now() >= 500 ? painted : empty }]; };
  const answer = await computer.execute({ action: 'type', frameId: initial.frameId, text: 'Äpfel und Grüße' });
  assert.equal(session.inputs.length, 1);
  assert.equal(session.inputs[0].action, 'type');
  assert.equal(answer.image.base64, painted, 'the first returned action result contains the delayed visible change');
  assert.notEqual(answer.frameId, initial.frameId);
  assert.deepEqual(JSON.parse(answer.text).renderingWait, { captures: 5, elapsedMs: 650, result: 'changed-image-stable' });
  assert.doesNotMatch(answer.text, /Äpfel|Grüße/);
  assert.equal(JSON.parse(answer.text).effect, 'unverifiable', 'rendering stability never upgrades driver evidence to semantic confirmation');
  await assert.rejects(computer.execute({ action: 'type', frameId: initial.frameId, text: 'duplicate' }), /veraltet/);
  assert.equal(session.inputs.length, 1);
  await computer.dispose();
});

test('unchanged frames and continuous screen animation end at the bounded wait with the latest valid image', async () => {
  for (const animation of [false, true]) {
    const session = new FakeSession(); const timing = paintClock();
    const computer = new NativeComputer({ createSession: async () => session, captureTiming: timing });
    const initial = await computer.execute({ action: 'screenshot' });
    let captures = 0; let latest = initial.image.base64;
    session.beforeCapture = async () => {
      captures++;
      if (animation) latest = pixelPng(captures, 40, 80);
      session.capture.images = [{ mimeType: 'image/png', dataBase64: latest }];
    };
    const answer = await computer.execute({ action: 'click', frameId: initial.frameId, x: 0, y: 0 });
    assert.equal(session.inputs.length, 1);
    assert.equal(captures, 9);
    assert.deepEqual(JSON.parse(answer.text).renderingWait, { captures: 9, elapsedMs: 1000, result: 'bounded-wait' });
    assert.equal(answer.image.base64, latest);
    await computer.dispose();
  }
});

test('a slowly completing screenshot uses the original deadline rather than adding another rendering wait', async () => {
  const session = new FakeSession(); const timing = paintClock();
  const computer = new NativeComputer({ createSession: async () => session, captureTiming: timing });
  const initial = await computer.execute({ action: 'screenshot' });
  session.beforeCapture = async signal => { await timing.wait(1200, signal); session.capture.images = [{ mimeType: 'image/png', dataBase64: pixelPng(40, 50, 60) }]; };
  const answer = await computer.execute({ action: 'key', frameId: initial.frameId, key: 'tab' });
  assert.deepEqual(JSON.parse(answer.text).renderingWait, { captures: 1, elapsedMs: 1450, result: 'bounded-wait' });
  assert.equal(session.inputs.length, 1);
  await computer.dispose();
});

test('Stop or an external abort during the rendering wait stops captures without repeating an admitted input', async () => {
  for (const external of [false, true]) {
    const session = new FakeSession(); const entered = deferred();
    const abort = new AbortController();
    const computer = new NativeComputer({ createSession: async () => session, captureTiming: {
      now: () => performance.now(),
      wait(_ms, signal) { entered.resolve(); return new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('cancelled wait')), { once: true });
      }); },
    } });
    const initial = await computer.execute({ action: 'screenshot' });
    const action = assert.rejects(computer.execute({ action: 'type', frameId: initial.frameId, text: 'once' }, abort.signal), /unterbrochen/);
    await entered.promise;
    if (external) { abort.abort(); await action; await computer.stop(); }
    else await Promise.all([computer.stop(), action]);
    assert.equal(session.inputs.length, 1);
    assert.deepEqual(session.calls, ['screenshot', 'size', 'type', 'dispose']);
    await computer.dispose();
  }
});

test('the existing operation timeout cancels the paint wait and invalidates its already consumed frame', async () => {
  const session = new FakeSession();
  const computer = new NativeComputer({ createSession: async () => session, timeoutMs: 40 });
  const initial = await computer.execute({ action: 'screenshot' });
  await assert.rejects(computer.execute({ action: 'type', frameId: initial.frameId, text: 'once' }), /unterbrochen/);
  await assert.rejects(computer.execute({ action: 'type', frameId: initial.frameId, text: 'twice' }), /veraltet/);
  assert.equal(session.inputs.length, 1);
  assert.equal(session.calls.filter(call => call === 'screenshot').length, 1);
  await computer.dispose();
});

test('Stop while a native retake is pending awaits its settlement before releasing desktop ownership', async () => {
  const session = new FakeSession(); const timing = paintClock(); const entered = deferred(); const finish = deferred();
  const coordinator = new DesktopCoordinator();
  const computer = new NativeComputer({ createSession: async () => session, captureTiming: timing, desktopCoordinator: coordinator });
  const initial = await computer.execute({ action: 'screenshot' });
  session.beforeCapture = async () => { entered.resolve(); await finish.promise; };
  const action = assert.rejects(computer.execute({ action: 'key', frameId: initial.frameId, key: 'tab' }), /unterbrochen/);
  await entered.promise;
  let ended = false;
  const stopping = computer.stop().then(() => { ended = true; });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(ended, false);
  let handedOver = false;
  const next = coordinator.acquire(new AbortController().signal).then(lease => { handedOver = true; lease.release(); });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(handedOver, false);
  finish.resolve(); await Promise.all([action, stopping, next]);
  assert.equal(session.inputs.length, 1);
  assert.equal(session.calls.filter(call => call === 'screenshot').length, 2);
  assert.equal(handedOver, true);
  await computer.dispose();
});

test('invalid post-action PNG geometry fails without replay and cannot leave a reusable prior frame', async () => {
  const session = new FakeSession(); const timing = paintClock();
  const computer = new NativeComputer({ createSession: async () => session, captureTiming: timing });
  const initial = await computer.execute({ action: 'screenshot' });
  session.beforeCapture = async () => {
    session.capture.structuredJson = JSON.stringify({ screenshot_width: 2, screenshot_height: 1, screen_width: 2, screen_height: 1, scale_factor: 1 });
  };
  await assert.rejects(computer.execute({ action: 'type', frameId: initial.frameId, text: 'once' }), /PNG-Abmessungen/);
  await assert.rejects(computer.execute({ action: 'type', frameId: initial.frameId, text: 'twice' }), /veraltet/);
  assert.equal(session.inputs.length, 1);
  await computer.dispose();
});

test('stale frames and out-of-screen coordinates cannot produce native inputs', async () => {
  const { computer, sessions } = fixture();
  let image = await computer.execute({ action: 'screenshot' });
  await assert.rejects(computer.execute({ action: 'click', frameId: image.frameId, x: 1, y: 0 }));
  image = await computer.execute({ action: 'screenshot' });
  const first = computer.execute({ action: 'type', frameId: image.frameId, text: 'first' });
  const second = computer.execute({ action: 'type', frameId: image.frameId, text: 'second' });
  await first;
  await assert.rejects(second, /veraltet/);
  assert.equal(sessions[0].inputs.length, 1);
  await computer.dispose();
});

test('geometry changes, invalid PNGs and old observations fail before input', async () => {
  let now = 1;
  const session = new FakeSession();
  const computer = new NativeComputer({ createSession: async () => session, now: () => now });
  let image = await computer.execute({ action: 'screenshot' });
  now += 120001;
  await assert.rejects(computer.execute({ action: 'click', frameId: image.frameId, x: 0, y: 0 }), /veraltet/);
  image = await computer.execute({ action: 'screenshot' });
  session.size.width = 2;
  await assert.rejects(computer.execute({ action: 'key', frameId: image.frameId, key: 'enter' }), /geändert/);
  assert.equal(session.inputs.length, 0);
  session.capture.images = [{ mimeType: 'image/png', dataBase64: Buffer.from('not a PNG').toString('base64') }];
  await assert.rejects(computer.execute({ action: 'screenshot' }), /PNG/);
  await computer.dispose();
});

test('Stop synchronously aborts current input, discards queued calls, waits for settlement and does not close applications', async () => {
  const { computer, sessions } = fixture();
  const image = await computer.execute({ action: 'screenshot' });
  const admitted = deferred(); const finish = deferred();
  let inputSignal!: AbortSignal;
  sessions[0].beforeAct = async signal => { inputSignal = signal; admitted.resolve(); await finish.promise; };
  const action = computer.execute({ action: 'type', frameId: image.frameId, text: 'once' });
  const rejectedAction = assert.rejects(action, /unterbrochen/);
  await admitted.promise;
  const queued = computer.execute({ action: 'screenshot' });
  const rejectedQueued = assert.rejects(queued, /unterbrochen/);
  let stopFinished = false;
  const stopping = computer.stop().then(() => { stopFinished = true; });
  assert.equal(inputSignal.aborted, true);
  await assert.rejects(computer.execute({ action: 'screenshot' }), /unterbrochen/);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(stopFinished, false);
  finish.resolve();
  await Promise.all([rejectedAction, rejectedQueued, stopping]);
  assert.deepEqual(sessions[0].calls, ['screenshot', 'size', 'type', 'dispose']);
  await computer.execute({ action: 'screenshot' });
  assert.equal(sessions.length, 2);
  await computer.dispose();
});

test('external abort during observation blocks subsequent input and error text never reflects native content', async () => {
  const { computer, sessions } = fixture();
  const image = await computer.execute({ action: 'screenshot' });
  const abort = new AbortController();
  sessions[0].beforeSize = async () => { abort.abort(); };
  await assert.rejects(computer.execute({ action: 'type', frameId: image.frameId, text: 'password' }, abort.signal), /unterbrochen/);
  assert.equal(sessions[0].inputs.length, 0);
  sessions[0].beforeCapture = async () => { throw new Error('password'); };
  await assert.rejects(computer.execute({ action: 'screenshot' }), error => error instanceof Error && !error.message.includes('password'));
  await computer.dispose();
});

test('Stop during lazy initialization disposes the created session and never captures or types', async () => {
  const started = deferred(); const finish = deferred(); const session = new FakeSession();
  const computer = new NativeComputer({ createSession: async () => { started.resolve(); await finish.promise; return session; } });
  const action = assert.rejects(computer.execute({ action: 'screenshot' }), /unterbrochen/);
  await started.promise;
  const stopping = computer.stop();
  finish.resolve();
  await Promise.all([action, stopping]);
  assert.deepEqual(session.calls, ['dispose']);
});

test('an ambiguous native input failure returns a fresh observed frame and never replays the input', async () => {
  const { computer, sessions } = fixture();
  const image = await computer.execute({ action: 'screenshot' });
  sessions[0].actionResult = result({ isError: true, text: 'password' });
  let recovery!: NonNullable<ComputerDriverError['recovery']>;
  await assert.rejects(computer.execute({ action: 'type', frameId: image.frameId, text: 'password' }), error => {
    assert.ok(error instanceof ComputerDriverError); assert.ok(error.recovery); recovery = error.recovery;
    assert.notEqual(recovery.frameId, image.frameId); assert.equal(recovery.image.base64, PNG);
    assert.equal(error.diagnostic.operation, 'type'); assert.equal(error.diagnostic.isError, true);
    assert.doesNotMatch(error.message + recovery.text, /password|abgelehnt/);
    return true;
  });
  await assert.rejects(computer.execute({ action: 'type', frameId: image.frameId, text: 'password' }), /veraltet/);
  assert.equal(sessions[0].inputs.length, 1);
  // The preceding stale-frame error invalidates the recovery too, just like any
  // other rejected admission. Capture again to make a new observed decision.
  const fresh = await computer.execute({ action: 'screenshot' });
  sessions[0].actionResult = result();
  await computer.execute({ action: 'key', frameId: fresh.frameId, key: 'tab' });
  assert.deepEqual(sessions[0].inputs.map(input => input.action), ['type', 'key']);
  await computer.dispose();
});

test('a failed post-click foreground check preserves the next observed action without declaring click success', async () => {
  const { computer, sessions } = fixture(); const first = await computer.execute({ action: 'screenshot' });
  sessions[0].actionResult = result({ isError: true,
    text: 'foreground_unavailable: exact target HWND 123 or a verified same-process post-action window was not foreground after the click (private window)' });
  let recovery!: NonNullable<ComputerDriverError['recovery']>;
  await assert.rejects(computer.execute({ action: 'click', frameId: first.frameId, x: 0, y: 0 }), error => {
    assert.ok(error instanceof ComputerDriverError); assert.ok(error.recovery); recovery = error.recovery;
    assert.equal(error.diagnostic.failureStage, 'after-input');
    assert.equal(error.diagnostic.effect, undefined);
    assert.doesNotMatch(error.message + recovery.text, /123|private window|refused/);
    assert.equal(JSON.parse(recovery.text).driverFailure.failureReason, 'post-action-foreground-mismatch'); return true;
  });
  sessions[0].actionResult = result();
  await computer.execute({ action: 'key', frameId: recovery.frameId, key: 'tab' });
  assert.deepEqual(sessions[0].inputs.map(input => input.action), ['click', 'key']);
  await computer.dispose();
});

test('a failed control capture preserves original input diagnostics and invalidates the consumed frame', async () => {
  const { computer, sessions } = fixture(); const first = await computer.execute({ action: 'screenshot' });
  sessions[0].actionResult = result({ isError: true, errorCode: 'foreground_unavailable' });
  sessions[0].capture = result({ isError: true, errorCode: 'facility_unavailable', text: 'private native detail' });
  await assert.rejects(computer.execute({ action: 'click', frameId: first.frameId, x: 0, y: 0 }), error => {
    assert.ok(error instanceof ComputerDriverError); assert.equal(error.recovery, undefined);
    assert.equal(error.diagnostic.operation, 'click'); assert.equal(error.diagnostic.errorCode, 'foreground_unavailable');
    assert.equal(error.recoveryFailure?.operation, 'screenshot'); assert.equal(error.recoveryFailure?.errorCode, 'facility_unavailable');
    assert.doesNotMatch(error.message, /private native detail/); return true;
  });
  await assert.rejects(computer.execute({ action: 'click', frameId: first.frameId, x: 0, y: 0 }), /veraltet/);
  assert.equal(sessions[0].inputs.length, 1); await computer.dispose();
});

test('Stop during failure recovery prevents image delivery and never repeats the failed input', async () => {
  const { computer, sessions } = fixture(); const first = await computer.execute({ action: 'screenshot' });
  const entered = deferred(), finish = deferred();
  sessions[0].actionResult = result({ action: { effect: 4, route: 2, delivery: { mode: 1, deliveredCount: 0 } } });
  sessions[0].beforeCapture = async () => { entered.resolve(); await finish.promise; };
  const action = assert.rejects(computer.execute({ action: 'click', frameId: first.frameId, x: 0, y: 0 }), /unterbrochen/);
  await entered.promise; const stop = computer.stop(); finish.resolve(); await Promise.all([action, stop]);
  assert.equal(sessions[0].inputs.length, 1); assert.equal(sessions[0].calls.filter(call => call === 'screenshot').length, 2);
  await computer.dispose();
});

test('failed Stop blocks all admissions until cleanup is confirmed; dispose never reopens the adapter', async () => {
  const { computer, sessions } = fixture();
  await computer.execute({ action: 'screenshot' });
  sessions[0].failDispose = true;
  await assert.rejects(computer.stop(), /nicht bestätigt/);
  await assert.rejects(computer.execute({ action: 'screenshot' }), /unterbrochen/);
  sessions[0].failDispose = false;
  await computer.stop();
  await computer.execute({ action: 'screenshot' });
  await computer.dispose();
  await assert.rejects(computer.execute({ action: 'screenshot' }), /unterbrochen/);
  assert.equal(sessions.length, 2);
});

test('default desktop ownership survives gaps between multiple screenshot/action calls', async t => {
  const first = fixture(); const second = fixture();
  t.after(async () => { await first.computer.dispose(); await second.computer.dispose(); });
  let frame = await first.computer.execute({ action: 'screenshot' });
  const waiting = second.computer.execute({ action: 'screenshot' });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(second.sessions.length, 0);
  frame = await first.computer.execute({ action: 'click', frameId: frame.frameId, x: 0, y: 0 });
  await first.computer.execute({ action: 'type', frameId: frame.frameId, text: 'same owner' });
  assert.equal(second.sessions.length, 0);
  await first.computer.stop();
  await waiting;
  assert.equal(second.sessions.length, 1);
  assert.deepEqual(first.sessions[0].inputs.map(input => input.action), ['click', 'type']);
});

test('desktop handover waits for admitted input and session disposal to settle', async t => {
  const desktopCoordinator = new DesktopCoordinator();
  const a = new FakeSession(); const b = new FakeSession();
  const first = new NativeComputer({ desktopCoordinator, createSession: async () => a });
  const second = new NativeComputer({ desktopCoordinator, createSession: async () => b });
  t.after(async () => { await first.dispose(); await second.dispose(); });
  const frame = await first.execute({ action: 'screenshot' });
  const admitted = deferred(); const finishInput = deferred(); const disposing = deferred(); const finishDispose = deferred();
  a.beforeAct = async () => { admitted.resolve(); await finishInput.promise; };
  a.beforeDispose = async () => { disposing.resolve(); await finishDispose.promise; };
  const action = assert.rejects(first.execute({ action: 'type', frameId: frame.frameId, text: 'once' }), /unterbrochen/);
  await admitted.promise;
  const waiting = second.execute({ action: 'screenshot' });
  const stopping = first.stop();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(b.calls, []);
  finishInput.resolve();
  await disposing.promise;
  assert.deepEqual(b.calls, []);
  finishDispose.resolve();
  await Promise.all([action, stopping, waiting]);
  assert.deepEqual(b.calls, ['screenshot']);
});

test('stopping a waiting owner cannot release or dispose another owner', async t => {
  const desktopCoordinator = new DesktopCoordinator();
  const a = new FakeSession(); const b = new FakeSession();
  let secondCreated = false;
  const first = new NativeComputer({ desktopCoordinator, createSession: async () => a });
  const second = new NativeComputer({ desktopCoordinator, createSession: async () => { secondCreated = true; return b; } });
  t.after(async () => { await first.dispose(); await second.dispose(); });
  const frame = await first.execute({ action: 'screenshot' });
  const waiting = assert.rejects(second.execute({ action: 'screenshot' }), /unterbrochen/);
  await new Promise<void>(resolve => setImmediate(resolve));
  await second.stop();
  await waiting;
  assert.equal(secondCreated, false);
  assert.deepEqual(a.calls, ['screenshot']);
  await first.execute({ action: 'key', frameId: frame.frameId, key: 'enter' });
  const retry = second.execute({ action: 'screenshot' });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(secondCreated, false);
  await first.stop();
  await retry;
  assert.equal(secondCreated, true);
});

test('external abort removes a waiting desktop owner without affecting the active session', async t => {
  const desktopCoordinator = new DesktopCoordinator();
  const a = new FakeSession(); let secondCreated = false;
  const first = new NativeComputer({ desktopCoordinator, createSession: async () => a });
  const second = new NativeComputer({ desktopCoordinator, createSession: async () => { secondCreated = true; return new FakeSession(); } });
  t.after(async () => { await first.dispose(); await second.dispose(); });
  await first.execute({ action: 'screenshot' });
  const abort = new AbortController();
  const waiting = assert.rejects(second.execute({ action: 'screenshot' }, abort.signal), /unterbrochen/);
  await new Promise<void>(resolve => setImmediate(resolve));
  abort.abort();
  await waiting;
  assert.equal(secondCreated, false);
  assert.deepEqual(a.calls, ['screenshot']);
  await first.stop();
  await second.execute({ action: 'screenshot' });
  assert.equal(secondCreated, true);
});

test('unconfirmed cleanup retains the desktop lease until a successful retry', async t => {
  const desktopCoordinator = new DesktopCoordinator();
  const a = new FakeSession(); const b = new FakeSession();
  const first = new NativeComputer({ desktopCoordinator, createSession: async () => a });
  const second = new NativeComputer({ desktopCoordinator, createSession: async () => b });
  t.after(async () => { a.failDispose = false; await first.dispose(); await second.dispose(); });
  await first.execute({ action: 'screenshot' });
  a.failDispose = true;
  const waiting = second.execute({ action: 'screenshot' });
  await assert.rejects(first.stop(), /nicht bestätigt/);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(b.calls, []);
  await assert.rejects(first.execute({ action: 'screenshot' }), /unterbrochen/);
  a.failDispose = false;
  await first.stop();
  await waiting;
  assert.deepEqual(b.calls, ['screenshot']);
});

test('handover invalidates old observations and each new owner must capture a fresh frame', async t => {
  const desktopCoordinator = new DesktopCoordinator();
  const sessionsA: FakeSession[] = []; const b = new FakeSession();
  const first = new NativeComputer({ desktopCoordinator, createSession: async () => { const session = new FakeSession(); sessionsA.push(session); return session; } });
  const second = new NativeComputer({ desktopCoordinator, createSession: async () => b });
  t.after(async () => { await first.dispose(); await second.dispose(); });
  const oldFrame = await first.execute({ action: 'screenshot' });
  await first.stop();
  const otherFrame = await second.execute({ action: 'screenshot' });
  await second.stop();
  await assert.rejects(first.execute({ action: 'click', frameId: oldFrame.frameId, x: 0, y: 0 }), /veraltet/);
  await assert.rejects(first.execute({ action: 'key', frameId: otherFrame.frameId, key: 'enter' }), /veraltet/);
  assert.equal(sessionsA[1].inputs.length, 0);
  const fresh = await first.execute({ action: 'screenshot' });
  assert.notEqual(fresh.frameId, oldFrame.frameId);
  await first.execute({ action: 'click', frameId: fresh.frameId, x: 0, y: 0 });
  assert.equal(sessionsA[1].inputs.length, 1);
});

test('desktop coordinator grants FIFO ownership and stale release cannot release the next owner', async () => {
  const coordinator = new DesktopCoordinator();
  const signal = new AbortController().signal;
  const first = await coordinator.acquire(signal);
  const order: string[] = [];
  const secondPromise = coordinator.acquire(signal).then(lease => { order.push('second'); return lease; });
  const thirdPromise = coordinator.acquire(signal).then(lease => { order.push('third'); return lease; });
  first.release();
  const second = await secondPromise;
  first.release();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(order, ['second']);
  second.release();
  const third = await thirdPromise;
  assert.deepEqual(order, ['second', 'third']);
  third.release();
});

test('desktop protection covers model gaps and remains reserved until native cleanup and unlock both confirm', async () => {
  const coordinator = new DesktopCoordinator(), session = new FakeSession(), prepared = deferred(), unlocked = deferred(), disposed = deferred();
  const phases: string[] = []; coordinator.subscribe(phase => phases.push(phase));
  const abort = new AbortController(); let halts = 0;
  session.beforeDispose = () => disposed.promise;
  const computer = new NativeComputer({ desktopCoordinator: coordinator, createSession: async () => session,
    protectDesktop: async () => { await prepared.promise; return { signal: abort.signal, halt: () => { halts++; }, dispose: () => unlocked.promise }; } });
  const first = computer.execute({ action: 'screenshot' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(coordinator.phase, 'preparing'); assert.deepEqual(session.calls, []);
  prepared.resolve(); await first; assert.equal(coordinator.phase, 'active');
  await new Promise(resolve => setImmediate(resolve)); assert.equal(coordinator.phase, 'active');
  const stopping = computer.stop(); assert.equal(coordinator.phase, 'stopping'); assert.equal(halts, 1);
  disposed.resolve(); await new Promise(resolve => setImmediate(resolve)); assert.equal(coordinator.isBusy, true);
  unlocked.resolve(); await stopping; assert.equal(coordinator.phase, 'free');
  assert.deepEqual(phases, ['free', 'preparing', 'active', 'stopping', 'free']);
});

test('protection interruption prevents the next desktop input and failed native cleanup still unlocks the user', async () => {
  const coordinator = new DesktopCoordinator(), session = new FakeSession(), abort = new AbortController(); let unlocks = 0;
  const computer = new NativeComputer({ desktopCoordinator: coordinator, createSession: async () => session,
    protectDesktop: async () => ({ signal: abort.signal, halt() {}, dispose: async () => { unlocks++; } }) });
  const frame = await computer.execute({ action: 'screenshot' }); abort.abort();
  await assert.rejects(computer.execute({ action: 'click', frameId: frame.frameId, x: 0, y: 0 }), /unterbrochen/);
  assert.equal(session.inputs.length, 0); session.failDispose = true;
  await assert.rejects(computer.stop(), /nicht bestätigt/);
  assert.equal(unlocks, 1); assert.equal(coordinator.phase, 'error'); assert.equal(coordinator.isBusy, true);
  session.failDispose = false; await computer.stop(); assert.equal(coordinator.phase, 'free');
});

test('desktop reservation handover never reports a free workstation between queued owners', async () => {
  const coordinator = new DesktopCoordinator(), phases: string[] = [];
  coordinator.subscribe(phase => phases.push(phase));
  const first = await coordinator.acquire(new AbortController().signal); first.setPhase('active');
  const next = coordinator.acquire(new AbortController().signal); first.release();
  const second = await next; first.setPhase('error');
  assert.deepEqual(phases, ['free', 'preparing', 'active', 'preparing']);
  second.release(); assert.equal(phases.at(-1), 'free');
});

test('failed cleanup during initialization keeps ownership blocked even without a returned session', async () => {
  const desktopCoordinator = new DesktopCoordinator();
  const first = new NativeComputer({ desktopCoordinator, createSession: async () => {
    throw new ComputerCleanupError('native cleanup unconfirmed');
  } });
  const b = new FakeSession();
  const second = new NativeComputer({ desktopCoordinator, createSession: async () => b });
  await assert.rejects(first.execute({ action: 'screenshot' }), ComputerCleanupError);
  await assert.rejects(first.stop(), /nicht bestätigt/);
  const waiting = assert.rejects(second.execute({ action: 'screenshot' }), /unterbrochen/);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(b.calls, []);
  await second.dispose();
  await waiting;
  await assert.rejects(first.dispose(), /nicht bestätigt/);
});

function clipboardFixture() {
  const calls: string[] = [];
  const writes: string[] = [];
  const keys: PressKeyInput[] = [];
  let clipboardResult = result({ structuredJson: JSON.stringify({ supported: true, written_type: 'text' }) });
  let beforeWrite: (() => Promise<void>) | undefined;
  let pasteFailure: Error | undefined;
  const driver: Pick<CuaDriverSessionLike, 'clipboardWrite' | 'pressKey'> = {
    async clipboardWrite(input) { calls.push('clipboard'); writes.push(input.text!); await beforeWrite?.(); return clipboardResult; },
    async pressKey(input) { calls.push('paste'); keys.push(input); if (pasteFailure) throw pasteFailure; return result({ action: { effect: 2, route: 2 } }); },
  };
  return { driver, calls, writes, keys, setClipboardResult(value: ToolResult) { clipboardResult = value; },
    setBeforeWrite(value: () => Promise<void>) { beforeWrite = value; }, setPasteFailure(value: Error) { pasteFailure = value; } };
}

test('type defaults to paste and only offers an explicit direct-typing alternative', async () => {
  assert.deepEqual(parseComputerInput({ action: 'type', frameId: 'f', text: 'abc' }), { action: 'type', frameId: 'f', text: 'abc' });
  assert.deepEqual(parseComputerInput({ action: 'type', frameId: 'f', text: 'abc', method: 'keys' }),
    { action: 'type', frameId: 'f', text: 'abc', method: 'keys' });
  assert.throws(() => parseComputerInput({ action: 'type', frameId: 'f', text: 'abc', method: 'auto' }));
  assert.throws(() => parseComputerInput({ action: 'screenshot', method: 'paste' }));
  const { computer } = fixture();
  let frame = await computer.execute({ action: 'screenshot' });
  frame = await computer.execute({ action: 'type', frameId: frame.frameId, text: 'abc' });
  assert.equal(JSON.parse(frame.text).inputMethod, 'clipboard-paste');
  assert.equal(JSON.parse(frame.text).clipboard, 'replaced-with-input');
  frame = await computer.execute({ action: 'type', frameId: frame.frameId, text: 'abc', method: 'keys' });
  assert.equal(JSON.parse(frame.text).inputMethod, 'keys');
  assert.equal(JSON.parse(frame.text).clipboard, undefined);
  await computer.dispose();
});

test('clipboard paste preserves the whole Unicode text and sends exactly Ctrl+V with no additional Enter', async () => {
  const f = clipboardFixture();
  const text = 'äöü ÄÖÜ ß Grüße € 😀\n"quotes" \\ path\t trailing spaces  ' + 'x'.repeat(11000);
  const signal = new AbortController().signal;
  const action = await pasteComputerText(f.driver, { session: 'test' }, text, signal);
  assert.deepEqual(f.calls, ['clipboard', 'paste']);
  assert.deepEqual(f.writes, [text]);
  assert.deepEqual(f.keys, [{ session: 'test', key: 'v', modifiers: ['ctrl'] }]);
  assert.equal(action.action?.effect, 2); // A shortcut is not proof the application accepted all text.
});

test('Stop between clipboard replacement and paste blocks the shortcut and settles the native call', async () => {
  const f = clipboardFixture();
  const admitted = deferred(); const finish = deferred();
  f.setBeforeWrite(async () => { admitted.resolve(); await finish.promise; });
  const session = new FakeSession();
  session.act = async (input, signal) => {
    assert.equal(input.action, 'type');
    return pasteComputerText(f.driver, { session: 'test' }, (input as Extract<ComputerInput, { action: 'type' }>).text, signal);
  };
  const computer = new NativeComputer({ createSession: async () => session });
  const frame = await computer.execute({ action: 'screenshot' });
  const action = assert.rejects(computer.execute({ action: 'type', frameId: frame.frameId, text: 'once' }), /unterbrochen/);
  await admitted.promise;
  const stopping = computer.stop();
  finish.resolve();
  await Promise.all([action, stopping]);
  assert.deepEqual(f.calls, ['clipboard']);
  assert.deepEqual(session.calls, ['screenshot', 'size', 'dispose']);
  await computer.dispose();
});

test('unconfirmed clipboard writes never paste; ambiguous paste failures never replay or fall back to typing', async () => {
  for (const denied of [
    result({ isError: true, text: 'private clipboard text' }),
    result({ structuredJson: JSON.stringify({ supported: false, written_type: 'text' }) }),
    result({ structuredJson: JSON.stringify({ supported: true, written_type: 'image' }) }),
    result({ structuredJson: 'invalid private clipboard text' }),
  ]) {
    const f = clipboardFixture(); f.setClipboardResult(denied);
    await assert.rejects(pasteComputerText(f.driver, { session: 'test' }, 'private clipboard text', new AbortController().signal),
      error => error instanceof Error && !error.message.includes('private clipboard text'));
    assert.deepEqual(f.calls, ['clipboard']);
  }
  const f = clipboardFixture(); f.setPasteFailure(new Error('uncertain native effect'));
  await assert.rejects(pasteComputerText(f.driver, { session: 'test' }, 'once', new AbortController().signal));
  assert.deepEqual(f.calls, ['clipboard', 'paste']);
  const aborted = new AbortController(); aborted.abort();
  const untouched = clipboardFixture();
  await assert.rejects(pasteComputerText(untouched.driver, { session: 'test' }, 'never', aborted.signal), /unterbrochen/);
  assert.deepEqual(untouched.calls, []);
});

test('failed clipboard write returns control-image diagnostics without claiming clipboard replacement or sending paste', async () => {
  const f = clipboardFixture(); f.setClipboardResult(result({ isError: true, errorCode: 'permission_denied', text: 'private input' }));
  const session = new FakeSession();
  session.act = async (input, signal) => pasteComputerText(f.driver, { session: 'test' }, (input as Extract<ComputerInput, { action: 'type' }>).text, signal);
  const computer = new NativeComputer({ createSession: async () => session, captureTiming: paintClock() });
  const first = await computer.execute({ action: 'screenshot' });
  await assert.rejects(computer.execute({ action: 'type', frameId: first.frameId, text: 'private input' }), error => {
    assert.ok(error instanceof ComputerDriverError); assert.ok(error.recovery);
    assert.equal(error.diagnostic.operation, 'clipboard-write'); assert.equal(error.diagnostic.errorCode, 'permission_denied');
    assert.equal(JSON.parse(error.recovery.text).clipboard, 'write-unconfirmed');
    assert.doesNotMatch(error.message + error.recovery.text, /private input/); return true;
  });
  assert.deepEqual(f.calls, ['clipboard']); await computer.dispose();
});
