import test from 'node:test';
import assert from 'node:assert/strict';
import type { BrowserWindow, Rectangle } from 'electron';
import { ActivityOverlay, activityOverlayBounds, parseActivityOverlayCommand, type ActivityOverlayState } from '../src/main/activity-overlay';

const active: ActivityOverlayState = { enabled: true, working: true, size: 144 };
const flush = async () => { for (let index = 0; index < 20; index++) await Promise.resolve(); };
function deferred() {
  let resolve!: () => void, reject!: (reason: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(options: { load?: Promise<void>; afterHide?: () => Promise<void>; save?: (size: number) => void | Promise<void> } = {}) {
  let background = true;
  let area: Rectangle = { x: -1920, y: -150, width: 1920, height: 1080 };
  let load = options.load;
  const sizes: number[] = [];
  const windows: { destroyed: boolean; visible: boolean; shown: number; hidden: number; url: string; bounds: Rectangle[]; scripts: string[]; ignore: boolean[]; sender: object }[] = [];
  const overlay = new ActivityOverlay({
    canShow: () => background,
    workArea: () => area,
    afterHide: options.afterHide ?? (async () => {}),
    onSizeChange: value => { sizes.push(value); return options.save?.(value); },
    createWindow: () => {
      const sender = { executeJavaScript: async (source: string) => { state.scripts.push(source); } };
      const state = { destroyed: false, visible: false, shown: 0, hidden: 0, url: '', bounds: [] as Rectangle[], scripts: [] as string[], ignore: [] as boolean[], sender };
      windows.push(state);
      return {
        isDestroyed: () => state.destroyed,
        hide: () => { state.hidden++; state.visible = false; },
        destroy: () => { state.destroyed = true; state.visible = false; },
        loadURL: (url: string) => { state.url = url; return load ?? Promise.resolve(); },
        setBounds: (bounds: Rectangle) => state.bounds.push(bounds),
        showInactive: () => { state.visible = true; state.shown++; },
        setIgnoreMouseEvents: (ignore: boolean) => state.ignore.push(ignore),
        webContents: sender
      } as unknown as BrowserWindow;
    }
  });
  return { overlay, windows, sizes,
    send: (value: unknown, sender: unknown = windows.at(-1)?.sender) => overlay.handleResize(sender, value),
    focus: (focused: boolean) => { background = !focused; overlay.refresh(); },
    area: (value: Rectangle) => { area = value; overlay.refresh(); },
    load: (value?: Promise<void>) => { load = value; }
  };
}

test('top-right geometry follows monitor work areas including negative origins and small displays', () => {
  assert.deepEqual(activityOverlayBounds({ x: -1920, y: -1080, width: 1920, height: 1080 }, 144), { x: -156, y: -1068, width: 144, height: 144 });
  assert.equal(activityOverlayBounds({ x: 0, y: 0, width: 3840, height: 2160 }, 10000).width, 320);
  assert.equal(activityOverlayBounds({ x: 0, y: 0, width: 1920, height: 1080 }, -1).width, 96);
  assert.equal(activityOverlayBounds({ x: 0, y: 0, width: 1920, height: 1080 }, NaN).width, 144);
  for (const area of [{ x: -100, y: -20, width: 80, height: 50 }, { x: 7, y: -3, width: 1, height: 1 }]) {
    const bounds = activityOverlayBounds(area, 320);
    assert.ok(bounds.x >= area.x && bounds.y >= area.y);
    assert.ok(bounds.x + bounds.width <= area.x + area.width && bounds.y + bounds.height <= area.y + area.height);
    assert.equal(bounds.width, bounds.height);
  }
});

test('resize protocol accepts only exact finite bounded commands without coercion', () => {
  for (const value of [{ phase: 'hover', over: true }, { phase: 'start', pointerId: 7, y: -300 }, { phase: 'move', pointerId: 7, y: 200 },
    { phase: 'end', pointerId: 7, y: 210 }, { phase: 'cancel', pointerId: 7, y: 210 }, { phase: 'key', key: 'Home' }]) {
    assert.deepEqual(parseActivityOverlayCommand(value), value);
  }
  const coercion = { toString: () => { throw new Error('must not coerce'); } };
  for (const invalid of [null, [], {}, { phase: 'hover', over: 'true' }, { phase: 'hover', over: true, extra: 1 },
    { phase: 'move', pointerId: 1, y: Infinity }, { phase: 'move', pointerId: 1, y: NaN }, { phase: 'move', pointerId: 1, y: 100001 },
    { phase: 'move', pointerId: 1.5, y: 30 }, { phase: 'move', pointerId: -1, y: 30 }, { phase: 'move', pointerId: 2147483648, y: 30 },
    { phase: 'move', pointerId: 1, y: 30, extra: 0 }, { phase: 'key', key: 'Delete' }, { phase: 'key', key: coercion }, { phase: coercion, pointerId: 1, y: 0 }]) {
    assert.equal(parseActivityOverlayCommand(invalid), undefined);
  }
});

test('window is lazy, passive, and visible only for enabled background work', async () => {
  const f = fixture();
  f.overlay.update({ ...active, enabled: false });
  f.overlay.update({ ...active, working: false });
  f.focus(true); f.overlay.update(active); await flush();
  assert.equal(f.windows.length, 0);
  f.focus(false); await flush();
  const window = f.windows[0];
  assert.equal(window.visible, true); assert.equal(window.ignore.at(-1), true);
  assert.deepEqual(window.bounds.at(-1), { x: -156, y: -138, width: 144, height: 144 });
  const html = decodeURIComponent(window.url.split(',').slice(1).join(','));
  assert.match(html, /script-src 'none'/); assert.match(html, /base-uri 'none'/);
  assert.match(html, /Overlay-Größe/); assert.doesNotMatch(html, /<script|https?:\/\//);
  f.overlay.update({ ...active, stopping: true }); await flush();
  assert.ok(window.scripts.at(-1)?.includes('"stopping":true'));
  f.focus(true); assert.equal(window.visible, false);
  f.focus(false); await flush(); assert.equal(window.visible, true);
  f.overlay.update({ ...active, working: false }); assert.equal(window.visible, false);
  f.overlay.dispose();
});

test('only the overlay sender can activate its grip and a drag saves once at its end', async () => {
  const f = fixture(); f.overlay.update(active); await flush(); const window = f.windows[0];
  assert.equal(f.send({ phase: 'hover', over: true }, {}), false); assert.equal(window.ignore.at(-1), true);
  assert.equal(f.send({ phase: 'hover', over: true }), true); assert.equal(window.ignore.at(-1), false);
  assert.equal(f.send({ phase: 'start', pointerId: 7, y: 100 }), true);
  assert.equal(f.send({ phase: 'move', pointerId: 9, y: 200 }), false);
  assert.equal(f.send({ phase: 'move', pointerId: 7, y: 170 }), true); await flush();
  assert.equal(window.bounds.at(-1)?.width, 214); assert.deepEqual(f.sizes, []);
  f.overlay.update({ ...active, stopping: true }); await flush(); assert.equal(window.bounds.at(-1)?.width, 214);
  assert.equal(f.send({ phase: 'end', pointerId: 7, y: 180 }), true); await flush();
  assert.deepEqual(f.sizes, [224]); assert.equal(window.bounds.at(-1)?.width, 224);
  assert.equal(window.bounds.at(-1)!.x + window.bounds.at(-1)!.width, -12);
  assert.equal(f.send({ phase: 'end', pointerId: 7, y: 200 }), false); assert.deepEqual(f.sizes, [224]);
  f.overlay.update({ ...active, size: 224 }); await flush();
  f.send({ phase: 'start', pointerId: 8, y: 100 }); f.send({ phase: 'move', pointerId: 8, y: -1000 }); await flush();
  assert.equal(window.bounds.at(-1)?.width, 96);
  f.send({ phase: 'cancel', pointerId: 8, y: -1000 }); await flush();
  assert.equal(window.bounds.at(-1)?.width, 224); assert.deepEqual(f.sizes, [224]);
  f.overlay.dispose();
});

test('drag limits and cancellation preserve a previous committed size before its snapshot arrives', async () => {
  const f = fixture(); f.overlay.update(active); await flush();
  f.send({ phase: 'start', pointerId: 1, y: 0 }); f.send({ phase: 'end', pointerId: 1, y: 80 }); await flush();
  f.send({ phase: 'start', pointerId: 2, y: 0 }); f.send({ phase: 'move', pointerId: 2, y: 1000 }); await flush();
  assert.equal(f.windows[0].bounds.at(-1)?.width, 320);
  f.send({ phase: 'cancel', pointerId: 2, y: 1000 }); await flush();
  assert.equal(f.windows[0].bounds.at(-1)?.width, 224); assert.deepEqual(f.sizes, [224]);
  f.overlay.dispose();
});

test('keyboard resizing is bounded and debounced instead of writing on every repeat', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(); f.overlay.update(active); await flush();
  for (let index = 0; index < 20; index++) f.send({ phase: 'key', key: 'ArrowDown' });
  await flush(); assert.equal(f.windows[0].bounds.at(-1)?.width, 320); assert.deepEqual(f.sizes, []);
  context.mock.timers.tick(149); await flush(); assert.deepEqual(f.sizes, []);
  context.mock.timers.tick(1); await flush(); assert.deepEqual(f.sizes, [320]);
  f.overlay.update({ ...active, size: 320 });
  f.send({ phase: 'key', key: 'Home' }); context.mock.timers.tick(150); await flush(); assert.deepEqual(f.sizes, [320, 96]);
  f.send({ phase: 'key', key: 'End' }); f.overlay.dispose(); context.mock.timers.tick(1000); await flush();
  assert.deepEqual(f.sizes, [320, 96]);
});

test('suspension is nested and idempotent; focus, disabled state and work end prevent restoration', async () => {
  const f = fixture(); f.overlay.update(active); await flush(); const window = f.windows[0];
  const releaseOuter = f.overlay.suspend(), releaseInner = f.overlay.suspend();
  assert.equal(window.visible, false); assert.equal(f.send({ phase: 'start', pointerId: 1, y: 0 }), false);
  releaseOuter(); releaseOuter(); await flush(); assert.equal(window.visible, false);
  releaseInner(); await flush(); assert.equal(window.visible, true);
  const endWork = f.overlay.suspend(); f.overlay.update({ ...active, working: false }); endWork(); await flush(); assert.equal(window.visible, false);
  f.overlay.update(active); await flush(); const focused = f.overlay.suspend(); f.focus(true); focused(); await flush(); assert.equal(window.visible, false);
  f.focus(false); await flush(); const disabled = f.overlay.suspend(); f.overlay.update({ ...active, enabled: false }); disabled(); await flush(); assert.equal(window.visible, false);
  f.overlay.dispose();
});

test('runHidden waits for compositor before a native operation and restores after failure', async () => {
  const compositor = deferred(), operation = deferred();
  let started = false, waited = 0;
  const f = fixture({ afterHide: () => { waited++; return compositor.promise; } }); f.overlay.update(active); await flush();
  const native = f.overlay.runHidden(async () => { started = true; await operation.promise; throw new Error('native failed'); });
  const rejected = assert.rejects(native, /native failed/);
  assert.equal(f.windows[0].visible, false); assert.equal(started, false); assert.equal(waited, 1);
  compositor.resolve(); await flush(); assert.equal(started, true); assert.equal(f.windows[0].visible, false);
  operation.resolve(); await rejected; await flush(); assert.equal(f.windows[0].visible, true);
  f.overlay.stop();
  assert.equal(await f.overlay.runHidden(async () => 42), 42); assert.equal(waited, 1);
  f.overlay.dispose();
});

test('runHidden cannot restore a disposed indicator or interfere with overlapping operations', async () => {
  const a = deferred(), b = deferred(); const f = fixture(); f.overlay.update(active); await flush();
  const first = f.overlay.runHidden(() => a.promise), second = f.overlay.runHidden(() => b.promise);
  a.resolve(); await first; await flush(); assert.equal(f.windows[0].visible, false);
  f.overlay.dispose(); b.resolve(); await second; await flush();
  assert.equal(f.windows[0].destroyed, true); assert.equal(f.windows[0].visible, false);
});

test('simultaneous native operations share the pending compositor barrier', async () => {
  const compositor = deferred(), firstDone = deferred(), secondDone = deferred();
  let starts = 0, waits = 0;
  const f = fixture({ afterHide: () => { waits++; return compositor.promise; } }); f.overlay.update(active); await flush();
  const first = f.overlay.runHidden(async () => { starts++; await firstDone.promise; });
  const second = f.overlay.runHidden(async () => { starts++; await secondDone.promise; });
  await flush(); assert.equal(starts, 0); assert.equal(waits, 1); assert.equal(f.windows[0].visible, false);
  compositor.resolve(); await flush(); assert.equal(starts, 2);
  firstDone.resolve(); await first; await flush(); assert.equal(f.windows[0].visible, false);
  secondDone.resolve(); await second; await flush(); assert.equal(f.windows[0].visible, true);
  f.overlay.dispose();
});

test('late page loads cannot show after focus, disable, stop or disposal', async () => {
  for (const change of ['focus', 'disable', 'stop', 'dispose'] as const) {
    const load = deferred(); const f = fixture({ load: load.promise }); f.overlay.update(active);
    assert.equal(f.send({ phase: 'hover', over: true }), false);
    if (change === 'focus') f.focus(true);
    if (change === 'disable') f.overlay.update({ ...active, enabled: false });
    if (change === 'stop') f.overlay.stop();
    if (change === 'dispose') f.overlay.dispose();
    load.resolve(); await flush(); assert.equal(f.windows[0].shown, 0); assert.equal(f.windows[0].visible, false);
    f.overlay.dispose();
  }
});

test('failed loads are contained, can recover on refresh and reject the retired sender', async () => {
  const load = deferred(); const f = fixture({ load: load.promise }); f.overlay.update(active); load.reject(new Error('load failed')); await flush();
  assert.equal(f.windows[0].destroyed, true); assert.equal(f.windows[0].visible, false);
  const retired = f.windows[0].sender; f.load(); f.overlay.refresh(); await flush();
  assert.equal(f.windows.length, 2); assert.equal(f.windows[1].visible, true);
  assert.equal(f.send({ phase: 'hover', over: true }, retired), false);
  f.area({ x: 2000, y: -900, width: 1280, height: 800 }); await flush();
  assert.deepEqual(f.windows[1].bounds.at(-1), { x: 3124, y: -888, width: 144, height: 144 });
  f.overlay.dispose();
});

test('a failed size save reverts while stale failures cannot overwrite a newer completed drag', async () => {
  const firstSave = deferred(), secondSave = deferred(); let count = 0;
  const f = fixture({ save: () => (++count === 1 ? firstSave : secondSave).promise }); f.overlay.update(active); await flush();
  f.send({ phase: 'start', pointerId: 1, y: 0 }); f.send({ phase: 'end', pointerId: 1, y: 60 }); await flush();
  f.send({ phase: 'start', pointerId: 2, y: 0 }); f.send({ phase: 'end', pointerId: 2, y: 30 }); await flush();
  assert.deepEqual(f.sizes, [204, 234]);
  firstSave.reject(new Error('stale')); await flush(); assert.equal(f.windows[0].bounds.at(-1)?.width, 234);
  secondSave.reject(new Error('disk full')); await flush(); assert.equal(f.windows[0].bounds.at(-1)?.width, 144);
  f.overlay.dispose();
});
