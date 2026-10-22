import assert from 'node:assert/strict';
import test from 'node:test';
import { selectComputerRegion, type ComputerRegionInput } from '../src/main/computer-regions';
import { MAX_COMPUTER_DETAIL_PIXELS, type ComputerPixels, type ComputerRect } from '../src/shared/computer-views';

function frame(width = 1920, height = 1080): ComputerPixels {
  return { width, height, data: new Uint8Array(width * height * 4).fill(255) };
}

function paint(image: ComputerPixels, rect: ComputerRect, value = 0): void {
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      const offset = (y * image.width + x) * 4;
      image.data[offset] = image.data[offset + 1] = image.data[offset + 2] = value;
    }
  }
}

function border(image: ComputerPixels, rect: ComputerRect): void {
  paint(image, { ...rect, height: 1 });
  paint(image, { ...rect, y: rect.y + rect.height - 1, height: 1 });
  paint(image, { ...rect, width: 1 });
  paint(image, { ...rect, x: rect.x + rect.width - 1, width: 1 });
}

function covers(outer: ComputerRect | undefined, inner: ComputerRect): void {
  assert.ok(outer, 'a crop was selected');
  assert.ok(outer.x <= inner.x && outer.y <= inner.y
    && outer.x + outer.width >= inner.x + inner.width
    && outer.y + outer.height >= inner.y + inner.height, `crop ${JSON.stringify(outer)} covers ${JSON.stringify(inner)}`);
}

function bounded(rect: ComputerRect | undefined, image: ComputerPixels, budget = MAX_COMPUTER_DETAIL_PIXELS): void {
  assert.ok(rect);
  assert.ok([rect.x, rect.y, rect.width, rect.height].every(Number.isSafeInteger));
  assert.ok(rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0);
  assert.ok(rect.x + rect.width <= image.width && rect.y + rect.height <= image.height);
  assert.ok(rect.width * rect.height <= budget);
}

test('first frame needs a hint or an action before choosing detail', () => {
  assert.deepEqual(selectComputerRegion({ current: frame() }), { reason: 'none' });
  const current = frame();
  const result = selectComputerRegion({ current, actionPoint: { x: 1919, y: 1079 } });
  assert.equal(result.reason, 'action-point');
  bounded(result.rect, current);
  covers(result.rect, { x: 1919, y: 1079, width: 1, height: 1 });
});

test('explicit valid model hint wins over change, retained detail and action', () => {
  const previous = frame();
  const current = frame();
  paint(current, { x: 1500, y: 500, width: 100, height: 100 });
  const hint = { x: 700, y: 300, width: 300, height: 200 };
  const result = selectComputerRegion({ current, previous, modelHint: hint,
    retained: { x: 0, y: 0, width: 400, height: 300 }, actionPoint: { x: 20, y: 20 } });
  assert.deepEqual(result, { reason: 'model-hint', rect: hint });
  assert.notEqual(result.rect, hint, 'selection does not expose the caller rectangle for mutation');
});

test('a single checkbox and a single character qualify at original resolution', () => {
  for (const target of [{ x: 317, y: 245, width: 14, height: 14 }, { x: 991, y: 499, width: 4, height: 9 }]) {
    const current = frame();
    paint(current, target);
    const result = selectComputerRegion({ current, previous: frame() });
    assert.equal(result.reason, 'visual-change');
    assert.equal(result.changedPixels, target.width * target.height);
    assert.equal(result.candidates, 1);
    covers(result.rect, target);
    bounded(result.rect, current);
    assert.ok(result.rect!.width > target.width && result.rect!.height > target.height, 'detail includes context');
  }
});

test('action-local character is preferred over a disconnected modest distractor', () => {
  const current = frame();
  const target = { x: 101, y: 100, width: 4, height: 9 };
  paint(current, target);
  paint(current, { x: 1500, y: 700, width: 20, height: 20 });
  const result = selectComputerRegion({ current, previous: frame(), actionPoint: { x: 103, y: 104 } });
  assert.equal(result.reason, 'visual-change');
  assert.equal(result.candidates, 2);
  covers(result.rect, target);
  assert.ok(result.rect!.x + result.rect!.width < 1500);
});

test('a substantial remote dialog can displace old action context, including a border-only dialog', () => {
  for (const solid of [true, false]) {
    const current = frame();
    const dialog = { x: 1100, y: 420, width: 600, height: 320 };
    if (solid) paint(current, dialog);
    else border(current, dialog);
    paint(current, { x: 100, y: 100, width: 14, height: 14 });
    const result = selectComputerRegion({ current, previous: frame(), actionPoint: { x: 107, y: 107 },
      retained: { x: 0, y: 0, width: 430, height: 320 } });
    assert.equal(result.reason, 'visual-change');
    covers(result.rect, dialog);
    bounded(result.rect, current);
  }
});

test('nearby changed glyphs group into one complete component and crop', () => {
  const current = frame(1000, 600);
  const first = { x: 100, y: 100, width: 5, height: 9 };
  const second = { x: 122, y: 100, width: 5, height: 9 };
  paint(current, first);
  paint(current, second);
  const result = selectComputerRegion({ current, previous: frame(1000, 600) });
  assert.equal(result.candidates, 1);
  assert.equal(result.changedPixels, 90);
  covers(result.rect, first);
  covers(result.rect, second);
});

test('remote caret noise keeps useful retained detail but action at the caret can select it', () => {
  const current = frame();
  const caret = { x: 1600, y: 500, width: 1, height: 20 };
  const retained = { x: 20, y: 20, width: 430, height: 320 };
  paint(current, caret);
  const input = { current, previous: frame(), retained };
  const quiet = selectComputerRegion(input);
  assert.equal(quiet.reason, 'retained');
  assert.deepEqual(quiet.rect, retained);
  assert.equal(quiet.changedPixels, 20);
  const active = selectComputerRegion({ ...input, actionPoint: { x: 1600, y: 505 } });
  assert.equal(active.reason, 'visual-change');
  covers(active.rect, caret);
});

test('a disconnected remote caret does not divert an action-local checkbox', () => {
  const current = frame();
  const checkbox = { x: 300, y: 200, width: 14, height: 14 };
  paint(current, checkbox);
  paint(current, { x: 1700, y: 700, width: 1, height: 18 });
  const result = selectComputerRegion({ current, previous: frame(), actionPoint: { x: 305, y: 205 } });
  assert.equal(result.candidates, 2);
  covers(result.rect, checkbox);
});

test('unchanged pixels retain the prior crop with exact zero diagnostics', () => {
  const retained = { x: 100, y: 100, width: 500, height: 400 };
  const result = selectComputerRegion({ current: frame(), previous: frame(), retained, actionPoint: { x: 1800, y: 900 } });
  assert.deepEqual(result, { reason: 'retained', rect: retained, changedPixels: 0, changedFraction: 0, candidates: 0 });
  assert.notEqual(result.rect, retained);
  assert.deepEqual(selectComputerRegion({ current: frame(), previous: frame() }),
    { reason: 'none', changedPixels: 0, changedFraction: 0, candidates: 0 });
});

test('RGB tolerance ignores small variations and alpha-only changes, but checks each RGB channel', () => {
  const current = frame(200, 120);
  const previous = frame(200, 120);
  paint(current, { x: 20, y: 20, width: 5, height: 5 }, 237);
  current.data[3] = 0;
  assert.equal(selectComputerRegion({ current, previous }).changedPixels, 0);
  for (const channel of [0, 1, 2]) current.data[(50 * current.width + 50 + channel) * 4 + channel] = 236;
  const result = selectComputerRegion({ current, previous });
  assert.equal(result.changedPixels, 3);
  assert.equal(result.reason, 'visual-change');
});

test('global changes and diffuse scrolling use retained detail or action context', () => {
  const retained = { x: 50, y: 50, width: 400, height: 300 };
  for (const diffuse of [false, true]) {
    const current = frame(1000, 600);
    if (!diffuse) paint(current, { x: 0, y: 0, width: 1000, height: 600 });
    else for (let y = 0; y < 600; y += 5) for (let x = 0; x < 1000; x += 5) paint(current, { x, y, width: 1, height: 1 });
    const input = { current, previous: frame(1000, 600), retained };
    const result = selectComputerRegion(input);
    assert.equal(result.reason, 'retained');
    assert.deepEqual(result.rect, retained);
    assert.ok(result.changedPixels! > 0);
    if (diffuse) assert.ok(result.changedFraction! < 0.1, 'sparse scroll is detected by coverage rather than changed fraction alone');
    const action = selectComputerRegion({ ...input, retained: undefined, actionPoint: { x: 600, y: 400 } });
    assert.equal(action.reason, 'action-point');
    bounded(action.rect, current);
    assert.equal(selectComputerRegion({ ...input, retained: undefined }).reason, 'none');
  }
});

test('a viewport-wide sparse border is not presented as an arbitrary partial crop', () => {
  const current = frame(1000, 600);
  border(current, { x: 0, y: 0, width: 1000, height: 600 });
  const result = selectComputerRegion({ current, previous: frame(1000, 600), maxDetailPixels: 100_000 });
  assert.equal(result.reason, 'none');
  assert.equal(result.candidates, 1);
});

test('geometry change discards previous comparisons and old retained coordinates', () => {
  const previous = frame(1000, 600);
  const current = frame(600, 400);
  const retained = { x: 800, y: 450, width: 200, height: 150 };
  assert.deepEqual(selectComputerRegion({ current, previous, retained }), { reason: 'none' });
  const result = selectComputerRegion({ current, previous, retained, actionPoint: { x: 599, y: 399 } });
  assert.equal(result.reason, 'action-point');
  bounded(result.rect, current);
  assert.equal(result.changedPixels, undefined);
});

test('padding at each original image edge stays inside the image and covers the whole target', () => {
  for (const [x, y] of [[0, 0], [199, 0], [0, 119], [199, 119]]) {
    const current = frame(200, 120);
    const target = { x, y, width: 1, height: 1 };
    paint(current, target);
    const result = selectComputerRegion({ current, previous: frame(200, 120) });
    assert.equal(result.reason, 'visual-change');
    bounded(result.rect, current);
    covers(result.rect, target);
  }
});

test('equal disconnected candidates have stable top-then-left tie breaking', () => {
  const current = frame();
  const first = { x: 100, y: 100, width: 10, height: 10 };
  paint(current, first);
  paint(current, { x: 1000, y: 100, width: 10, height: 10 });
  paint(current, { x: 100, y: 800, width: 10, height: 10 });
  const input = { current, previous: frame() };
  const reference = selectComputerRegion(input);
  assert.equal(reference.candidates, 3);
  covers(reference.rect, first);
  for (let attempt = 0; attempt < 5; attempt++) assert.deepEqual(selectComputerRegion(input), reference);
});

test('detail budgets reduce context, preserve complete components and reject oversized coverage', () => {
  const target = { x: 300, y: 200, width: 80, height: 80 };
  const current = frame(1000, 600);
  paint(current, target);
  for (const maxDetailPixels of [6400, 8000, 10_000]) {
    const result = selectComputerRegion({ current, previous: frame(1000, 600), maxDetailPixels });
    assert.equal(result.reason, 'visual-change');
    bounded(result.rect, current, maxDetailPixels);
    covers(result.rect, target);
  }
  const tooSmall = selectComputerRegion({ current, previous: frame(1000, 600), maxDetailPixels: 4000 });
  assert.equal(tooSmall.reason, 'none');
  assert.equal(tooSmall.rect, undefined);
  assert.equal(tooSmall.candidates, 1);
  const action = selectComputerRegion({ current, maxDetailPixels: 1, actionPoint: { x: 4, y: 5 } });
  assert.deepEqual(action.rect, { x: 4, y: 5, width: 1, height: 1 });
  assert.equal(selectComputerRegion({ current, retained: target, maxDetailPixels: 4000 }).reason, 'none');
});

test('narrow and tall components keep complete coverage when the budget leaves no padding', () => {
  for (const target of [
    { x: 500, y: 599, width: 500, height: 1 },
    { x: 999, y: 200, width: 1, height: 400 },
  ]) {
    const current = frame(1000, 600);
    paint(current, target);
    const maxDetailPixels = target.width * target.height;
    const result = selectComputerRegion({ current, previous: frame(1000, 600), maxDetailPixels });
    assert.equal(result.reason, 'visual-change');
    assert.deepEqual(result.rect, target);
    bounded(result.rect, current, maxDetailPixels);
  }
});

test('selection is independent of overview scaling and includes an unsampled one-pixel change', () => {
  const current = frame();
  const target = { x: 991, y: 511, width: 1, height: 1 };
  paint(current, target);
  const input = { current, previous: frame() };
  // This pixel is absent from a nearest-neighbor overview at all these divisors.
  for (const divisor of [4, 8, 16, 32]) {
    assert.notEqual(target.x % divisor, 0);
    const result = selectComputerRegion(input);
    assert.equal(result.changedPixels, 1);
    assert.equal(result.reason, 'visual-change');
    covers(result.rect, target);
  }
});

test('manual strategy permits explicit crops while disabling change selection', () => {
  const current = frame();
  paint(current, { x: 500, y: 400, width: 100, height: 100 });
  const input: ComputerRegionInput = { current, previous: frame(), strategy: 'manual' };
  assert.deepEqual(selectComputerRegion(input), { reason: 'none' });
  const hint = { x: 400, y: 300, width: 400, height: 300 };
  assert.deepEqual(selectComputerRegion({ ...input, modelHint: hint }), { reason: 'manual', rect: hint });
});

test('rejects malformed and unsupported frame geometry before scanning', () => {
  const invalid = [
    { width: 0, height: 1, data: new Uint8Array(0) },
    { width: -1, height: 1, data: new Uint8Array(0) },
    { width: 1.5, height: 1, data: new Uint8Array(4) },
    { width: NaN, height: 1, data: new Uint8Array(4) },
    { width: 32_769, height: 1, data: new Uint8Array(0) },
    { width: 10_000, height: 10_000, data: new Uint8Array(0) },
  ];
  for (const current of invalid) assert.throws(() => selectComputerRegion({ current }), /geometry/);
  for (const data of [new Uint8Array(3), new Uint8Array(5), []]) {
    assert.throws(() => selectComputerRegion({ current: { width: 1, height: 1, data } as ComputerPixels }), /BGRA/);
  }
  assert.throws(() => selectComputerRegion({ current: frame(10, 10), previous: { width: 1, height: 1, data: new Uint8Array(0) } }), /previous.*BGRA/);
});

test('rejects invalid hints, retained rectangles, points, strategies and budgets', () => {
  const current = frame(200, 120);
  for (const modelHint of [
    { x: -1, y: 0, width: 10, height: 10 },
    { x: 190, y: 0, width: 11, height: 10 },
    { x: 0, y: 0, width: 0, height: 10 },
    { x: 0.5, y: 0, width: 10, height: 10 },
  ]) assert.throws(() => selectComputerRegion({ current, modelHint }), /modelHint/);
  assert.throws(() => selectComputerRegion({ current, modelHint: { x: 0, y: 0, width: 100, height: 100 }, maxDetailPixels: 9999 }), /budget/);
  assert.throws(() => selectComputerRegion({ current, retained: { x: 0, y: 0, width: 201, height: 1 } }), /retained/);
  for (const actionPoint of [{ x: -1, y: 0 }, { x: 200, y: 0 }, { x: 0, y: 120 }, { x: 0.5, y: 1 }, { x: Infinity, y: 0 }]) {
    assert.throws(() => selectComputerRegion({ current, actionPoint }), /actionPoint/);
  }
  for (const maxDetailPixels of [0, -1, 1.5, NaN, Infinity, MAX_COMPUTER_DETAIL_PIXELS + 1]) {
    assert.throws(() => selectComputerRegion({ current, maxDetailPixels }), /maxDetailPixels/);
  }
  assert.throws(() => selectComputerRegion({ current, strategy: 'other' as 'changes' }), /strategy/);
});
