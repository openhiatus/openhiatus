import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import type { ToolResult } from '@trycua/cua-driver';
import { NativeComputer, ComputerDriverError, DesktopCoordinator, parseComputerInput, type ComputerSession, type ComputerResult } from '../src/main/computer';
import type { ComputerAction } from '../src/main/computer-input';
import type { ComputerImageProcessor, DecodedComputerImage } from '../src/main/computer-images';
import type { ComputerRect, ComputerSize } from '../src/shared/computer-views';
import { detailSize, mapViewPoint, mapViewRect, overviewSize } from '../src/main/computer-views';

function png(size: ComputerSize, color = 0): string {
  const chunk = (type: string, data: Buffer) => {
    const bytes = Buffer.concat([Buffer.from(type), data]); let crc = 0xffffffff;
    for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = crc >>> 1 ^ ((crc & 1) ? 0xedb88320 : 0); }
    const header = Buffer.alloc(4), checksum = Buffer.alloc(4);
    header.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([header, bytes, checksum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(size.width); header.writeUInt32BE(size.height, 4); header[8] = 8; header[9] = 6;
  const stride = size.width * 4 + 1, rows = Buffer.alloc(stride * size.height, color);
  for (let row = 0; row < size.height; row++) rows[row * stride] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}
const toolResult = (fields: Partial<ToolResult> = {}): ToolResult => ({ text: '', images: [], isError: false, degraded: false, rawJson: '{}', ...fields });
function fixture() {
  let time = 0, paint = 0, divisor = 8, detailDivisor = 1, decoded = 0, actionResult = toolResult();
  const inputs: ComputerAction[] = [], crops: ComputerRect[] = [];
  let geometry = { width: 1920, height: 1080, scale: 1.25 };
  let pixels = new Uint8Array(geometry.width * geometry.height * 4);
  const processor: ComputerImageProcessor = {
    decode(base64, size) { decoded++; return { png: base64, ...size, data: pixels.slice() }; },
    overview(_image, factor) { const size = overviewSize(_image, factor); return { ...size, base64: png(size) }; },
    crop(_image, rect, factor = 1) { crops.push({ ...rect }); const size = detailSize(rect, factor); return { ...size, base64: png(size) }; },
  };
  const session: ComputerSession = {
    async screenshot() { return toolResult({ images: [{ mimeType: 'image/png', dataBase64: png(geometry) }], structuredJson: JSON.stringify({
      screenshot_width: geometry.width, screenshot_height: geometry.height, screen_width: geometry.width, screen_height: geometry.height, scale_factor: geometry.scale,
    }) }); },
    async screenSize() { return toolResult({ structuredJson: JSON.stringify({ width: geometry.width, height: geometry.height, scale_factor: geometry.scale }) }); },
    async act(input) { inputs.push(input); return actionResult; }, dispose: async () => {},
  };
  const options = { createSession: async () => session, createImageProcessor: async () => processor, now: () => time,
    desktopCoordinator: new DesktopCoordinator(), getOverviewScaleDivisor: () => divisor, getDetailScaleDivisor: () => detailDivisor,
    captureTiming: { now: () => paint, wait: async (ms: number) => { paint += ms; } } };
  const computer = new NativeComputer(options);
  return { computer, inputs, crops, options, processor, get decoded() { return decoded; }, setTime: (now: number) => { time = now; },
    setActionResult: (result: ToolResult) => { actionResult = result; },
    setDivisor: (value: number) => { divisor = value; }, setDetailDivisor: (value: number) => { detailDivisor = value; }, setGeometry: (value: typeof geometry) => { geometry = value; pixels = new Uint8Array(value.width * value.height * 4); },
    change(rect: ComputerRect) { for (let y = rect.y; y < rect.y + rect.height; y++) for (let x = rect.x; x < rect.x + rect.width; x++) pixels[(y * geometry.width + x) * 4] = 255; } };
}
const overview = (result: ComputerResult) => result.observation!.views[0];
async function inspect(f: ReturnType<typeof fixture>) {
  const first = await f.computer.execute({ action: 'screenshot' });
  return f.computer.execute({ action: 'inspect', frameId: first.frameId, viewId: overview(first).viewId, x: 20, y: 20, width: 60, height: 40 });
}

test('overview is true divisor, retains native screen geometry and initially contains no guessed detail', async () => {
  const f = fixture(); const first = await f.computer.execute({ action: 'screenshot' });
  assert.deepEqual([overview(first).imageWidth, overview(first).imageHeight], [240, 135]);
  assert.deepEqual([first.width, first.height, first.observation!.scaleFactor], [1920, 1080, 1.25]);
  assert.equal(first.observation!.views.length, 1); assert.equal(first.observation!.selection.reason, 'none');
  await f.computer.dispose();
});

test('short observation handles keep exact frame/view rejection, consumed images and ownership boundaries', async () => {
  const f = fixture(); const first = await f.computer.execute({ action: 'screenshot' });
  const view = overview(first);
  assert.ok(first.frameId.length <= 24 && view.viewId.length <= 24);
  assert.notEqual(first.frameId, view.viewId);
  const typo = (value: string) => value.slice(0, -1) + (value.endsWith('a') ? 'b' : 'a');
  await assert.rejects(f.computer.execute({ action: 'click', frameId: typo(first.frameId), viewId: view.viewId, x: 1, y: 1 }), /veraltet/);
  assert.equal(f.inputs.length, 0, 'misspelled frame never reaches the driver');
  const next = await f.computer.execute({ action: 'screenshot' });
  await assert.rejects(f.computer.execute({ action: 'click', frameId: next.frameId, viewId: typo(overview(next).viewId), x: 1, y: 1 }), /Unknown or replaced/);
  assert.equal(f.inputs.length, 0, 'misspelled view never reaches the driver');
  const current = await f.computer.execute({ action: 'screenshot' });
  const after = await f.computer.execute({ action: 'click', frameId: current.frameId, viewId: overview(current).viewId, x: 1, y: 1 });
  assert.equal(f.inputs.length, 1); assert.notEqual(after.frameId, current.frameId);
  await assert.rejects(f.computer.execute({ action: 'key', frameId: current.frameId, key: 'enter' }), /veraltet/);
  assert.equal(f.inputs.length, 1);
  await f.computer.stop();
  const resumed = await f.computer.execute({ action: 'screenshot' });
  assert.notEqual(resumed.frameId, after.frameId);
  await assert.rejects(f.computer.execute({ action: 'key', frameId: after.frameId, key: 'enter' }), /veraltet/);
  assert.equal(f.inputs.length, 1);
  await f.computer.dispose();
});

test('a refused detail action keeps a fresh configured overview/control view without reusing or replaying old coordinates', async () => {
  const f = fixture(); f.setDivisor(16); const first = await inspect(f), detail = first.observation!.views[1];
  f.setActionResult(toolResult({ isError: true, action: { effect: 4, route: 2, delivery: { mode: 1, deliveredCount: 0 } } }));
  let recovery!: ComputerResult;
  await assert.rejects(f.computer.execute({ action: 'click', frameId: first.frameId, viewId: detail.viewId, x: 100, y: 100 }), error => {
    assert.ok(error instanceof ComputerDriverError); assert.ok(error.recovery); recovery = error.recovery;
    assert.notEqual(recovery.frameId, first.frameId); assert.equal(recovery.observation!.overviewScaleDivisor, 16);
    assert.equal(error.diagnostic.effect, 'refused'); assert.equal(error.diagnostic.delivery?.deliveredCount, 0); return true;
  });
  assert.equal(f.inputs.length, 1);
  f.setActionResult(toolResult());
  const currentView = recovery.observation!.views[0];
  await f.computer.execute({ action: 'click', frameId: recovery.frameId, viewId: currentView.viewId, x: 10, y: 10 });
  assert.equal(f.inputs.length, 2); assert.equal(f.inputs[1].action, 'click');
  assert.deepEqual(f.inputs[1], { action: 'click', frameId: recovery.frameId, x: 160, y: 159, button: 'left', count: 1 });
  await f.computer.dispose();
});
test('original-resolution screenshot returns one fresh full image and post-action output resumes the configured factor', async () => {
  const f = fixture(), first = await inspect(f);
  const full = await f.computer.execute({ action: 'screenshot', resolution: 'original' });
  const view = overview(full);
  assert.notEqual(full.frameId, first.frameId);
  assert.equal(full.observation!.overviewScaleDivisor, 1);
  assert.deepEqual([view.imageWidth, view.imageHeight, view.sourceRect], [1920, 1080, { x: 0, y: 0, width: 1920, height: 1080 }]);
  assert.equal(full.image.base64, png({ width: 1920, height: 1080 }));
  assert.equal(full.observation!.views.length, 1); assert.equal(full.observation!.selection.reason, 'none');
  assert.equal(JSON.parse(full.text).observationMode, 'full-display-once');
  assert.equal(f.inputs.length, 0); assert.equal(f.crops.length, 1, 'full image does not create an extra detail');
  const next = await f.computer.execute({ action: 'click', frameId: full.frameId, viewId: view.viewId, x: 100, y: 200 });
  assert.deepEqual(f.inputs, [{ action: 'click', frameId: full.frameId, x: 100, y: 200, button: 'left', count: 1 }]);
  assert.equal(next.observation!.overviewScaleDivisor, 8);
  assert.deepEqual([overview(next).imageWidth, overview(next).imageHeight], [240, 135]);
  await f.computer.dispose();
});
test('full-image request retires earlier frame IDs and ordinary screenshot restores overview mode', async () => {
  const f = fixture(), first = await f.computer.execute({ action: 'screenshot' });
  const full = await f.computer.execute({ action: 'screenshot', resolution: 'original' });
  const next = await f.computer.execute({ action: 'screenshot' });
  assert.equal(next.observation!.overviewScaleDivisor, 8);
  assert.notEqual(next.frameId, full.frameId);
  await assert.rejects(f.computer.execute({ action: 'click', frameId: first.frameId, viewId: overview(first).viewId, x: 0, y: 0 }), /veraltet/);
  assert.equal(f.inputs.length, 0); await f.computer.dispose();
});
test('full-image requests keep legacy full-screen mode compatible and skip optional image processing', async () => {
  const f = fixture(); f.setDivisor(1);
  const full = await f.computer.execute({ action: 'screenshot', resolution: 'original' });
  assert.equal(full.observation, undefined); assert.equal(f.decoded, 0);
  assert.deepEqual([full.width, full.height], [1920, 1080]);
  await f.computer.execute({ action: 'click', frameId: full.frameId, x: 100, y: 200 });
  assert.equal(f.inputs[0].action, 'click'); assert.equal(f.decoded, 0); await f.computer.dispose();
});
test('full-resolution option is explicit and allowed only on screenshot', () => {
  assert.deepEqual(parseComputerInput({ action: 'screenshot' }), { action: 'screenshot' });
  assert.deepEqual(parseComputerInput({ action: 'screenshot', resolution: 'original' }), { action: 'screenshot', resolution: 'original' });
  for (const resolution of ['high', 'full', 1, true, null]) assert.throws(() => parseComputerInput({ action: 'screenshot', resolution }));
  assert.throws(() => parseComputerInput({ action: 'inspect', frameId: 'f', viewId: 'v', x: 0, y: 0, width: 1, height: 1, resolution: 'original' }));
  assert.throws(() => parseComputerInput({ action: 'click', frameId: 'f', x: 0, y: 0, resolution: 'original' }));
});
test('inspect reuses the same capture and only replaces detail; native detail clicks add its source origin once', async () => {
  const f = fixture(); const result = await inspect(f), view = result.observation!.views[1];
  assert.equal(f.decoded, 1); assert.deepEqual(view.sourceRect, { x: 160, y: 160, width: 480, height: 320 });
  const next = await f.computer.execute({ action: 'click', frameId: result.frameId, viewId: view.viewId, x: 100, y: 200 });
  assert.deepEqual(f.inputs, [{ action: 'click', frameId: result.frameId, x: 260, y: 360, button: 'left', count: 1 }]);
  assert.notEqual(next.frameId, result.frameId); assert.equal(next.observation!.selection.reason, 'retained');
  await f.computer.dispose();
});
test('overview click and cross-view drag map actual image pixels before one native action', async () => {
  const f = fixture(), result = await inspect(f), [wide, detail] = result.observation!.views;
  await f.computer.execute({ action: 'drag', frameId: result.frameId, viewId: wide.viewId, x: 100, y: 50,
    fromViewId: detail.viewId, fromX: 10, fromY: 20 });
  assert.deepEqual(f.inputs, [{ action: 'drag', frameId: result.frameId, x: 800, y: 400, fromX: 170, fromY: 180 }]);
  await f.computer.dispose();
});
test('old detail identifiers cannot authorize input or inspect after replacement', async () => {
  const f = fixture(), result = await inspect(f), [wide, detail] = result.observation!.views;
  const replacement = await f.computer.execute({ action: 'inspect', frameId: result.frameId, viewId: wide.viewId, x: 10, y: 10, width: 20, height: 20 });
  assert.equal(replacement.frameId, result.frameId); assert.equal(replacement.observation!.at, result.observation!.at);
  assert.notEqual(replacement.observation!.views[1].viewId, detail.viewId);
  await assert.rejects(f.computer.execute({ action: 'click', frameId: result.frameId, viewId: detail.viewId, x: 1, y: 1 }));
  assert.equal(f.inputs.length, 0); await f.computer.dispose();
});
test('missing view, oversized crop and out-of-view points fail before native input', async () => {
  for (const make of [
    (r: ComputerResult) => ({ action: 'click', frameId: r.frameId, x: 1, y: 1 }),
    (r: ComputerResult) => ({ action: 'click', frameId: r.frameId, viewId: overview(r).viewId, x: 240, y: 1 }),
    (r: ComputerResult) => ({ action: 'inspect', frameId: r.frameId, viewId: overview(r).viewId, x: 0, y: 0, width: 240, height: 135 }),
  ]) {
    const f = fixture(), result = await f.computer.execute({ action: 'screenshot' });
    await assert.rejects(f.computer.execute(make(result))); assert.equal(f.inputs.length, 0); await f.computer.dispose();
  }
});
test('inspect cannot renew the input deadline and Stop invalidates all original views', async () => {
  const f = fixture(), result = await inspect(f);
  f.setTime(119999);
  const same = await f.computer.execute({ action: 'inspect', frameId: result.frameId, viewId: overview(result).viewId, x: 1, y: 1, width: 10, height: 10 });
  f.setTime(120001);
  await assert.rejects(f.computer.execute({ action: 'key', frameId: same.frameId, key: 'enter' }), /veraltet/);
  await f.computer.stop();
  await assert.rejects(f.computer.execute({ action: 'inspect', frameId: same.frameId, viewId: overview(same).viewId, x: 0, y: 0, width: 1, height: 1 }), /veraltet/);
  assert.equal(f.inputs.length, 0); await f.computer.dispose();
});
test('nextDetail predicts the next crop in current view coordinates without an extra capture or input', async () => {
  const f = fixture(), result = await f.computer.execute({ action: 'screenshot' });
  const next = await f.computer.execute({ action: 'key', frameId: result.frameId, key: 'tab', viewId: overview(result).viewId,
    nextDetail: { x: 10, y: 20, width: 40, height: 30 } });
  assert.equal(next.observation!.selection.reason, 'model-hint');
  assert.deepEqual(next.observation!.views[1].sourceRect, { x: 80, y: 160, width: 320, height: 240 });
  assert.equal(f.inputs.length, 1); assert.equal(f.decoded, 2); await f.computer.dispose();
});
test('automatic detail detects a remote change using originals, independent of the overview factor', async () => {
  const f = fixture(); f.setDivisor(32); const first = await f.computer.execute({ action: 'screenshot' });
  f.change({ x: 1400, y: 500, width: 150, height: 100 });
  const next = await f.computer.execute({ action: 'key', frameId: first.frameId, key: 'enter' });
  const rect = next.observation!.views[1].sourceRect;
  assert.equal(next.observation!.selection.reason, 'visual-change'); assert.ok(rect.x <= 1400 && rect.x + rect.width >= 1550);
  assert.ok(rect.y <= 500 && rect.y + rect.height >= 600); await f.computer.dispose();
});

test('automatic detail scales the output only, preserves physical change selection and maps a detail click at Windows DPI once', async () => {
  for (const factor of [2, 4]) {
    const f = fixture(); f.setDetailDivisor(factor); f.setGeometry({ width: 1920, height: 1080, scale: 1.75 });
    const first = await f.computer.execute({ action: 'screenshot' }); f.change({ x: 1400, y: 500, width: 151, height: 101 });
    const next = await f.computer.execute({ action: 'key', frameId: first.frameId, key: 'enter' });
    const detail = next.observation!.views[1], source = detail.sourceRect;
    assert.equal(next.observation!.selection.reason, 'visual-change'); assert.equal(next.observation!.detailScaleDivisor, factor);
    assert.ok(source.x <= 1400 && source.x + source.width >= 1551 && source.y <= 500 && source.y + source.height >= 601);
    assert.deepEqual({ width: detail.imageWidth, height: detail.imageHeight }, detailSize(source, factor));
    const bytes = Buffer.from(detail.dataUrl.split(',')[1], 'base64');
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [detail.imageWidth, detail.imageHeight]);
    const point = { x: detail.imageWidth - 1, y: detail.imageHeight - 1 }, physical = mapViewPoint(detail, point);
    await f.computer.execute({ action: 'click', frameId: next.frameId, viewId: detail.viewId, ...point });
    assert.deepEqual(f.inputs[1], { action: 'click', frameId: next.frameId, ...physical, button: 'left', count: 1 });
    await f.computer.dispose();
  }
});

test('full overview plus scaled odd detail supports original inspect fallback and resumes the configured scale', async () => {
  const f = fixture(); f.setDivisor(1); f.setDetailDivisor(2);
  const first = await f.computer.execute({ action: 'screenshot' });
  assert.deepEqual([overview(first).imageWidth, overview(first).imageHeight], [1920, 1080]);
  assert.equal(first.observation!.detailScaleDivisor, 2);
  const next = await f.computer.execute({ action: 'key', frameId: first.frameId, key: 'tab', viewId: overview(first).viewId,
    nextDetail: { x: 13, y: 29, width: 799, height: 611 } });
  const detail = next.observation!.views[1]; assert.deepEqual(detail.sourceRect, { x: 13, y: 29, width: 799, height: 611 });
  assert.deepEqual([detail.imageWidth, detail.imageHeight], [400, 306]);
  const region = { x: 1, y: 2, width: 9, height: 11 }, physical = mapViewRect(detail, region);
  const inspected = await f.computer.execute({ action: 'inspect', frameId: next.frameId, viewId: detail.viewId, ...region });
  const originalDetail = inspected.observation!.views[1];
  assert.equal(inspected.frameId, next.frameId); assert.equal(inspected.observation!.at, next.observation!.at);
  assert.equal(inspected.observation!.detailScaleDivisor, 1); assert.deepEqual(originalDetail.sourceRect, physical);
  assert.deepEqual([originalDetail.imageWidth, originalDetail.imageHeight], [physical.width, physical.height]);
  assert.equal(f.decoded, 2, 'inspect reuses the retained physical original');
  const resumed = await f.computer.execute({ action: 'key', frameId: inspected.frameId, key: 'tab' });
  assert.equal(resumed.observation!.detailScaleDivisor, 2);
  const resumedDetail = resumed.observation!.views[1];
  assert.deepEqual([resumedDetail.imageWidth, resumedDetail.imageHeight], Object.values(detailSize(resumedDetail.sourceRect, 2)));
  const full = await f.computer.execute({ action: 'screenshot', resolution: 'original' });
  assert.equal(full.observation!.detailScaleDivisor, 1); assert.equal(full.observation!.overviewScaleDivisor, 1);
  assert.equal(full.observation!.views.length, 1); assert.deepEqual([overview(full).imageWidth, overview(full).imageHeight], [1920, 1080]);
  assert.equal((await f.computer.execute({ action: 'screenshot' })).observation!.detailScaleDivisor, 2);
  await f.computer.dispose();
});

test('detail factor freezes with desktop ownership, invalid settings cannot admit input and scaled mode still rejects missing views', async () => {
  const f = fixture(); f.setDivisor(1); f.setDetailDivisor(2);
  const first = await f.computer.execute({ action: 'screenshot' }); f.setDetailDivisor(4);
  assert.equal((await f.computer.execute({ action: 'screenshot' })).observation!.detailScaleDivisor, 2);
  await f.computer.stop(); const current = await f.computer.execute({ action: 'screenshot' });
  assert.equal(current.observation!.detailScaleDivisor, 4);
  await assert.rejects(f.computer.execute({ action: 'click', frameId: current.frameId, x: 1, y: 1 }), /current viewId/);
  assert.equal(f.inputs.length, 0); await f.computer.stop(); f.setDetailDivisor(3);
  await assert.rejects(f.computer.execute({ action: 'screenshot' }), error => {
    assert.match(String((error as Error).cause), /detail divisor/); return true;
  });
  assert.equal(f.inputs.length, 0); await f.computer.dispose();
});

test('overview1/detail2 cannot omit viewId, including a drag with an explicit source view', async () => {
  for (const action of ['click', 'move', 'drag'] as const) {
    const f = fixture(); f.setDivisor(1); f.setDetailDivisor(2);
    const first = await f.computer.execute({ action: 'screenshot' });
    await assert.rejects(f.computer.execute({ action, frameId: first.frameId, x: 10, y: 20,
      ...(action === 'drag' ? { fromViewId: overview(first).viewId, fromX: 1, fromY: 2 } : {}) }), /current viewId/);
    assert.equal(f.inputs.length, 0, 'an explicitly named drag source cannot authorize an unnamed target coordinate space');
    await f.computer.dispose();
  }
});

test('overview1/detail2 cross-view drag maps its scaled source and validates the source view before native input', async () => {
  const f = fixture(); f.setDivisor(1); f.setDetailDivisor(2);
  const first = await f.computer.execute({ action: 'screenshot' });
  const next = await f.computer.execute({ action: 'key', frameId: first.frameId, key: 'tab', viewId: overview(first).viewId,
    nextDetail: { x: 13, y: 29, width: 799, height: 611 } });
  const [wide, detail] = next.observation!.views, from = { x: detail.imageWidth - 1, y: detail.imageHeight - 1 };
  const physicalSource = mapViewPoint(detail, from);
  await f.computer.execute({ action: 'drag', frameId: next.frameId, viewId: wide.viewId, x: 1000, y: 700,
    fromViewId: detail.viewId, fromX: from.x, fromY: from.y });
  assert.deepEqual(f.inputs[1], { action: 'drag', frameId: next.frameId, x: 1000, y: 700, fromX: physicalSource.x, fromY: physicalSource.y });
  const current = await f.computer.execute({ action: 'screenshot' }), count = f.inputs.length;
  await assert.rejects(f.computer.execute({ action: 'drag', frameId: current.frameId, viewId: overview(current).viewId, x: 10, y: 20,
    fromViewId: detail.viewId, fromX: 1, fromY: 2 }), /Unknown or replaced drag source view/);
  assert.equal(f.inputs.length, count); await f.computer.dispose();
});
test('DPI change blocks input and fresh capture drops retained original geometry', async () => {
  const f = fixture(), first = await inspect(f);
  f.setGeometry({ width: 1920, height: 1080, scale: 2 });
  await assert.rejects(f.computer.execute({ action: 'key', frameId: first.frameId, key: 'enter' }), /geändert/);
  assert.equal(f.inputs.length, 0);
  const fresh = await f.computer.execute({ action: 'screenshot' }); assert.equal(fresh.observation!.views.length, 1);
  await f.computer.dispose();
});
test('settings stay fixed during a desktop ownership interval and reload after Stop; full mode skips processing', async () => {
  const f = fixture(); await f.computer.execute({ action: 'screenshot' }); f.setDivisor(16);
  assert.equal((await f.computer.execute({ action: 'screenshot' })).observation!.overviewScaleDivisor, 8);
  await f.computer.stop(); assert.equal((await f.computer.execute({ action: 'screenshot' })).observation!.overviewScaleDivisor, 16);
  await f.computer.stop(); const count = f.decoded; f.setDivisor(1);
  assert.equal((await f.computer.execute({ action: 'screenshot' })).observation, undefined); assert.equal(f.decoded, count);
  await f.computer.dispose();
});
test('Stop waits for lazy image preparation and cannot publish or retain a late original', async () => {
  const f = fixture(); let resolve!: (value: ComputerImageProcessor) => void;
  let began!: () => void; const started = new Promise<void>(done => { began = done; });
  const computer = new NativeComputer({ ...f.options, createImageProcessor: () => { began(); return new Promise(done => { resolve = done; }); } });
  const pending = computer.execute({ action: 'screenshot' }); const rejected = assert.rejects(pending, /unterbrochen/);
  await started; let settled = false; const stop = computer.stop().then(() => { settled = true; });
  await Promise.resolve(); assert.equal(settled, false); resolve(f.processor); await rejected; await stop;
  assert.equal(f.decoded, 0); await computer.dispose(); await f.computer.dispose();
});
test('new view action fields reject unsafe or misplaced input before execution', () => {
  for (const input of [
    { action: 'inspect', frameId: 'f', x: 0, y: 0, width: 1, height: 1 },
    { action: 'screenshot', viewId: 'v' },
    { action: 'key', frameId: 'f', key: 'tab', nextDetail: { x: 0, y: 0, width: 1, height: 1 } },
    { action: 'inspect', frameId: 'f', viewId: 'v', x: 0, y: 0, width: NaN, height: 1 },
    { action: 'click', frameId: 'f', viewId: 'v', x: 0, y: 0, fromViewId: 'other' },
  ]) assert.throws(() => parseComputerInput(input));
});
