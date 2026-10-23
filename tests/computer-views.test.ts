import test from 'node:test';
import assert from 'node:assert/strict';
import { createViewDescriptor, detailSize, mapViewPoint, mapViewRect, overviewSize, validateSourceRect } from '../src/main/computer-views.js';
import { COMPUTER_DETAIL_FACTORS, computerDetailDivisor, MAX_COMPUTER_DETAIL_PIXELS } from '../src/shared/computer-views.js';

const screens = [
  [1366, 768], [1920, 1080], [2560, 1440], [3840, 2160],
  [1080, 1920], [3440, 1440], [137, 91], [1, 1], [1, 63], [63, 1],
];

test('overview dimensions round each physical axis independently across displays and divisors', () => {
  for (const [width, height] of screens) for (const divisor of [1, 4, 8, 16, 32, 64]) {
    const size = overviewSize({ width, height }, divisor);
    assert.deepEqual(size, { width: Math.max(1, Math.round(width / divisor)), height: Math.max(1, Math.round(height / divisor)) });
    assert.ok(size.width <= width && size.height <= height);
    const view = createViewDescriptor('overview', 'screen', { x: 0, y: 0, width, height }, size);
    for (const [x, y] of [[0, 0], [Math.floor(size.width / 2), Math.floor(size.height / 2)], [size.width - 1, size.height - 1]]) {
      assert.deepEqual(mapViewPoint(view, { x, y }), {
        x: Math.min(width - 1, Math.round(x * width / size.width)),
        y: Math.min(height - 1, Math.round(y * height / size.height)),
      });
    }
    assert.deepEqual(mapViewRect(view, { x: 0, y: 0, ...size }), { x: 0, y: 0, width, height });
  }
});

test('odd source axes use actual image ratios rather than the nominal overview divisor', () => {
  const view = createViewDescriptor('overview', 'odd', { x: 13, y: 29, width: 1366, height: 769 }, { width: 342, height: 192 });
  assert.deepEqual(mapViewPoint(view, { x: 300, y: 190 }), { x: 1211, y: 790 });
  assert.notEqual(mapViewPoint(view, { x: 300, y: 190 }).x, 13 + 300 * 4);
  assert.deepEqual(mapViewRect(view, { x: 100, y: 50, width: 1, height: 1 }), { x: 412, y: 229, width: 5, height: 5 });
  assert.deepEqual(mapViewRect(view, { x: 341, y: 191, width: 1, height: 1 }), { x: 1375, y: 793, width: 4, height: 5 });
});

test('detail coordinates are original pixels with source offsets, independent of Windows DPI', () => {
  for (const scaleFactor of [1, 1.25, 1.5, 1.75, 2, 3]) {
    const capture = { width: 3840, height: 2160, scaleFactor };
    const source = validateSourceRect({ x: 2031, y: 1201, width: 799, height: 611 }, capture);
    const detail = createViewDescriptor('detail', 'detail', source, source);
    assert.deepEqual(mapViewPoint(detail, { x: 798, y: 610 }), { x: 2829, y: 1811 });
    assert.deepEqual(mapViewRect(detail, { x: 1, y: 2, width: 7, height: 11 }), { x: 2032, y: 1203, width: 7, height: 11 });
    const overview = createViewDescriptor('overview', 'overview', { x: 0, y: 0, ...capture }, overviewSize(capture, 16));
    assert.deepEqual(mapViewPoint(overview, { x: 100, y: 75 }), { x: 1600, y: 1200 });
  }
});

test('detail factors validate 1/2/4 and rounded crop axes preserve actual physical coordinate mapping', () => {
  assert.deepEqual(COMPUTER_DETAIL_FACTORS, [1, 2, 4]);
  for (const factor of COMPUTER_DETAIL_FACTORS) {
    assert.equal(computerDetailDivisor(factor), factor);
    for (const source of [{ x: 2031, y: 1201, width: 799, height: 611 }, { x: 17, y: 23, width: 1, height: 1 }, { x: 3, y: 5, width: 1, height: 63 }]) {
      const size = detailSize(source, factor), view = createViewDescriptor('detail', 'scaled', source, size);
      assert.deepEqual(size, { width: Math.max(1, Math.round(source.width / factor)), height: Math.max(1, Math.round(source.height / factor)) });
      assert.deepEqual(mapViewRect(view, { x: 0, y: 0, ...size }), source);
      const point = { x: size.width - 1, y: size.height - 1 };
      assert.deepEqual(mapViewPoint(view, point), { x: source.x + Math.min(source.width - 1, Math.round(point.x * source.width / size.width)),
        y: source.y + Math.min(source.height - 1, Math.round(point.y * source.height / size.height)) });
    }
  }
  assert.deepEqual(detailSize({ width: 799, height: 611 }, 2), { width: 400, height: 306 });
  for (const invalid of [undefined, null, '2', true, [], 0, -1, 1.5, 3, 8, NaN, Infinity]) assert.throws(() => computerDetailDivisor(invalid));
  assert.deepEqual(detailSize({ width: 799, height: 611 }), { width: 799, height: 611 });
});

test('source crops are fully contained and enforce the exact pixel limit without clipping', () => {
  const screen = { width: 3840, height: 2160 };
  assert.deepEqual(validateSourceRect({ x: 0, y: 0, width: 1024, height: 1024 }, screen), { x: 0, y: 0, width: 1024, height: 1024 });
  assert.deepEqual(validateSourceRect({ x: 3839, y: 2159, width: 1, height: 1 }, screen), { x: 3839, y: 2159, width: 1, height: 1 });
  assert.throws(() => validateSourceRect({ x: 0, y: 0, width: 1025, height: 1024 }, screen), /pixel limit/);
  assert.throws(() => validateSourceRect({ x: 3839, y: 2159, width: 2, height: 2 }, screen), /outside/);
  assert.throws(() => validateSourceRect({ x: 0, y: 0, ...screen }, { width: 1920, height: 1080 }), /outside/);
  assert.throws(() => validateSourceRect({ x: 0, y: 0, width: 1, height: 1 }, screen, NaN));
  assert.equal(validateSourceRect({ x: 0, y: 0, ...screen }, screen, screen.width * screen.height).width, screen.width);
  assert.equal(MAX_COMPUTER_DETAIL_PIXELS, 1_048_576);
});

test('invalid, fractional, unsafe, NaN and infinite coordinates never map or crop', () => {
  const size = { width: 37, height: 19 }, source = { x: 11, y: 23, width: 137, height: 91 };
  const view = createViewDescriptor('overview', 'valid', source, size);
  for (const bad of [NaN, Infinity, -Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => mapViewPoint(view, { x: bad, y: 0 }));
    assert.throws(() => mapViewPoint(view, { x: 0, y: bad }));
    for (const property of ['x', 'y', 'width', 'height']) {
      const rect = { x: 0, y: 0, width: 1, height: 1, [property]: bad };
      assert.throws(() => mapViewRect(view, rect));
      assert.throws(() => validateSourceRect(rect, source));
    }
  }
  for (const point of [{ x: 37, y: 0 }, { x: 0, y: 19 }]) assert.throws(() => mapViewPoint(view, point), /outside/);
  for (const rect of [{ x: 0, y: 0, width: 0, height: 1 }, { x: 36, y: 18, width: 2, height: 1 }]) assert.throws(() => mapViewRect(view, rect));
  assert.throws(() => mapViewPoint({ ...view, imageWidth: NaN }, { x: 0, y: 0 }));
  assert.throws(() => mapViewRect({ ...view, sourceRect: { ...source, width: 0 } }, { x: 0, y: 0, width: 1, height: 1 }));
});

test('view descriptors validate source/image geometry and snapshot the source rectangle', () => {
  const source = { x: 0, y: 0, width: 1366, height: 768 };
  const view = createViewDescriptor('overview', 'screen', source, { width: 342, height: 192 });
  source.x = 8;
  assert.equal(view.sourceRect.x, 0);
  assert.throws(() => createViewDescriptor('overview', '', source, { width: 1, height: 1 }));
  assert.throws(() => createViewDescriptor('overview', 'screen', source, { width: 1367, height: 768 }));
  assert.deepEqual(createViewDescriptor('detail', 'screen', source, { width: 342, height: 192 }).sourceRect, source);
  assert.throws(() => createViewDescriptor('overview', 'screen', { ...source, x: Number.MAX_SAFE_INTEGER }, { width: 1, height: 1 }));
  for (const divisor of [0, -1, NaN, Infinity, 64.01]) assert.throws(() => overviewSize(source, divisor));
  for (const bad of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => overviewSize({ width: bad, height: 1 }, 4));
    assert.throws(() => overviewSize({ width: 1, height: bad }, 4));
  }
});

test('large safe integer source geometry does not lose precision in multiplied edges', () => {
  const width = Number.MAX_SAFE_INTEGER - 1;
  const view = createViewDescriptor('overview', 'large', { x: 0, y: 0, width, height: 1 }, { width: 3, height: 1 });
  assert.deepEqual(mapViewRect(view, { x: 2, y: 0, width: 1, height: 1 }), { x: 6_004_799_503_160_660, y: 0, width: 3_002_399_751_580_330, height: 1 });
  assert.deepEqual(mapViewPoint(view, { x: 2, y: 0 }), { x: 6_004_799_503_160_660, y: 0 });
});
