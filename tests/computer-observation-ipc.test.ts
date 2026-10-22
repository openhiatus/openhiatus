import test from 'node:test';
import assert from 'node:assert/strict';
import type { ComputerFrame } from '../src/shared/contracts';
import { decodeComputerFrame, decodeSnapshot } from '../src/shared/ipc';
import { snapshotFixture } from './ipc-fixtures';

function frameFixture(): ComputerFrame & { observation: NonNullable<ComputerFrame['observation']> } {
  const dataUrl = 'data:image/png;base64,synthetic-overview';
  return { dataUrl, frameId: 'frame-current', width: 320, height: 180, at: '2026-10-22T12:34:56.000Z', observation: {
    version: 2, frameId: 'frame-current', at: '2026-10-22T12:34:56.000Z', displayId: 'primary',
    screenWidth: 2560, screenHeight: 1440, scaleFactor: 1.5, overviewScaleDivisor: 8,
    views: [
      { viewId: 'overview-current', kind: 'overview', imageWidth: 320, imageHeight: 180, dataUrl, sourceRect: { x: 0, y: 0, width: 2560, height: 1440 } },
      { viewId: 'detail-current', kind: 'detail', imageWidth: 1024, imageHeight: 1024, dataUrl: 'data:image/png;base64,synthetic-detail', sourceRect: { x: 256, y: 144, width: 1024, height: 1024 } },
    ], selection: { rect: { x: 256, y: 144, width: 1024, height: 1024 }, reason: 'visual-change', changedPixels: 200, changedFraction: 0.01, candidates: 2 },
    timings: { imageProcessingMs: 1.25, regionSelectionMs: 0 },
  } };
}

test('computer IPC accepts legacy and current overview/detail frames without exposing internal fields', () => {
  const frame = frameFixture();
  assert.deepEqual(decodeComputerFrame(frame), frame);
  const { observation: current, ...legacy } = frame;
  assert.deepEqual(decodeComputerFrame(legacy), legacy);
  const raw = { ...frame, nativeSession: 'private', observation: { ...current, pixels: 'private',
    views: current.views.map(view => ({ ...view, nativeHandle: 'private', sourceRect: { ...view.sourceRect, private: true } })),
    selection: { ...current.selection, process: 'private' }, timings: { ...current.timings, private: true } } };
  assert.deepEqual(decodeComputerFrame(raw), frame);
  const overviewOnly = frameFixture(); overviewOnly.observation.views.pop(); delete overviewOnly.observation.selection.rect;
  overviewOnly.observation.selection.reason = 'none';
  assert.deepEqual(decodeComputerFrame(overviewOnly), overviewOnly);
});

test('computer IPC rejects mismatched top-level and observation identities, timestamps and overview geometry', () => {
  const patches: Array<(frame: ReturnType<typeof frameFixture>) => void> = [
    frame => { frame.frameId = 'other'; }, frame => { frame.at = 'other'; }, frame => { frame.width++; }, frame => { frame.height++; },
    frame => { frame.dataUrl = 'data:image/png;base64,other'; },
    frame => { frame.observation.views[0].sourceRect.x = 1; },
    frame => { frame.observation.views[0].sourceRect.height--; },
    frame => { frame.observation.screenWidth = 100; },
    frame => { frame.observation.views[0].imageWidth = frame.width = 2561; },
    frame => { frame.observation.views[0].imageWidth = frame.width = 321; },
  ];
  for (const patch of patches) { const frame = frameFixture(); patch(frame); assert.throws(() => decodeComputerFrame(frame), /Ungültige/); }
});

test('computer IPC uses independently rounded overview dimensions for custom factors and tiny screens', () => {
  for (const [width, height, divisor] of [[2561, 1441, 2.5], [1, 2, 64], [2560, 1440, 1]]) {
    const frame = frameFixture(), observation = frame.observation, overview = observation.views[0];
    observation.screenWidth = width; observation.screenHeight = height; observation.overviewScaleDivisor = divisor;
    observation.views = [overview]; observation.selection = { reason: 'none' };
    overview.sourceRect = { x: 0, y: 0, width, height };
    frame.width = overview.imageWidth = Math.max(1, Math.round(width / divisor));
    frame.height = overview.imageHeight = Math.max(1, Math.round(height / divisor));
    assert.deepEqual(decodeComputerFrame(frame), frame);
  }
});

test('computer IPC requires ordered overview/detail cardinality and nonblank unique view IDs', () => {
  const patches: Array<(frame: ReturnType<typeof frameFixture>) => void> = [
    frame => { frame.observation.views = []; }, frame => { frame.observation.views.reverse(); },
    frame => { frame.observation.views[1].kind = 'overview'; },
    frame => { frame.observation.views.push({ ...frame.observation.views[1], viewId: 'third' }); },
    frame => { frame.observation.views[0].viewId = ''; }, frame => { frame.observation.views[1].viewId = ' \t '; },
    frame => { frame.observation.views[1].viewId = frame.observation.views[0].viewId; },
    frame => { frame.frameId = frame.observation.frameId = ''; },
  ];
  for (const patch of patches) { const frame = frameFixture(); patch(frame); assert.throws(() => decodeComputerFrame(frame), /Ungültige/); }
});

test('computer IPC enforces native detail geometry, screen bounds and the original pixel budget', () => {
  const patches: Array<(frame: ReturnType<typeof frameFixture>) => void> = [
    frame => { frame.observation.views[1].imageWidth--; },
    frame => { frame.observation.views[1].sourceRect.x = -1; },
    frame => { frame.observation.views[1].sourceRect.x = 2000; },
    frame => { frame.observation.views[1].sourceRect.y = 1000; },
    frame => { frame.observation.views[1].imageHeight = frame.observation.views[1].sourceRect.height = 1025; },
    frame => { frame.observation.selection.rect!.x = 2560; },
    frame => { frame.observation.views[1].sourceRect.width = 0; },
  ];
  for (const patch of patches) { const frame = frameFixture(); patch(frame); assert.throws(() => decodeComputerFrame(frame), /Ungültige/); }
  const boundary = frameFixture();
  assert.equal(decodeComputerFrame(boundary).observation!.views[1].imageWidth * boundary.observation.views[1].imageHeight, 1_048_576);
});

test('computer IPC rejects malformed limits and metadata throughout observations', () => {
  const original = frameFixture();
  const malformed: unknown[] = [
    { ...original, observation: null },
    { ...original, observation: { ...original.observation, version: 1 } },
    { ...original, observation: { ...original.observation, displayId: 'secondary' } },
    ...[0, 0.5, 65, -1, Infinity, NaN, '8'].map(overviewScaleDivisor => ({ ...original, observation: { ...original.observation, overviewScaleDivisor } })),
    ...[0, -1, Infinity, NaN].map(scaleFactor => ({ ...original, observation: { ...original.observation, scaleFactor } })),
    ...[0, 1.5, Number.MAX_SAFE_INTEGER + 1].map(screenWidth => ({ ...original, observation: { ...original.observation, screenWidth } })),
    ...[-1, Infinity, NaN].map(imageProcessingMs => ({ ...original, observation: { ...original.observation, timings: { imageProcessingMs, regionSelectionMs: 0 } } })),
    ...[-1, Infinity, NaN].map(regionSelectionMs => ({ ...original, observation: { ...original.observation, timings: { imageProcessingMs: 0, regionSelectionMs } } })),
    ...[-0.1, 1.1, Infinity].map(changedFraction => ({ ...original, observation: { ...original.observation, selection: { reason: 'visual-change', changedFraction } } })),
    ...[-1, 1.5, 2560 * 1440 + 1].map(changedPixels => ({ ...original, observation: { ...original.observation, selection: { reason: 'visual-change', changedPixels } } })),
    { ...original, observation: { ...original.observation, selection: { reason: 'unknown' } } },
    { ...original, observation: { ...original.observation, selection: { reason: 'none', candidates: -1 } } },
  ];
  for (const frame of malformed) assert.throws(() => decodeComputerFrame(frame), /Ungültige/);
});

test('every observation image preserves the native PNG transport limit and excludes non-PNG URLs', () => {
  const frame = frameFixture(), detail = frame.observation.views[1];
  detail.dataUrl = `data:image/png;base64,${'A'.repeat(56_000_000)}`;
  assert.equal(decodeComputerFrame(frame).observation!.views[1].dataUrl.length, 56_000_022);
  detail.dataUrl += 'A'; assert.throws(() => decodeComputerFrame(frame), /Ungültige/);
  for (const dataUrl of ['file:///synthetic.png', 'data:image/jpeg;base64,synthetic', 'https://example.test/image.png']) {
    detail.dataUrl = dataUrl; assert.throws(() => decodeComputerFrame(frame), /Ungültige/);
  }
});

test('snapshot IPC preserves absent, predefined and current custom computer overview preferences', () => {
  assert.equal(Object.hasOwn(decodeSnapshot(snapshotFixture()).preferences, 'computerOverviewScaleDivisor'), false);
  for (const divisor of [1, 4, 8, 16, 32, 2.5, 64]) {
    const snapshot = snapshotFixture(); snapshot.preferences.computerOverviewScaleDivisor = divisor;
    assert.equal(decodeSnapshot(snapshot).preferences.computerOverviewScaleDivisor, divisor);
  }
  for (const divisor of [0, -1, 0.5, 64.1, Infinity, NaN, '4', null]) {
    const snapshot = snapshotFixture();
    assert.throws(() => decodeSnapshot({ ...snapshot, preferences: { ...snapshot.preferences, computerOverviewScaleDivisor: divisor } }), /Ungültige/);
  }
});
