import test from 'node:test';
import assert from 'node:assert/strict';
import type { BrowserWindow } from 'electron';
import { DesktopControlOverlay } from '../src/main/desktop-control-overlay';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DesktopControlNotice } from '../src/renderer/components/DesktopControlNotice';
import { snapshotFixture } from './ipc-fixtures';
import { decodeSnapshot } from '../src/shared/ipc';

function fixture(load = Promise.resolve()) {
  let displays = [{ id: 1, bounds: { x: -1920, y: 0, width: 1920, height: 1080 } }, { id: 2, bounds: { x: 0, y: 0, width: 2560, height: 1440 } }];
  const windows: { visible: boolean; destroyed: boolean; url: string; scripts: string[]; bounds: unknown }[] = [];
  const overlay = new DesktopControlOverlay({ displays: () => displays, afterShow: async () => {}, createWindow: () => {
    const state = { visible: false, destroyed: false, url: '', scripts: [] as string[], bounds: undefined as unknown }; windows.push(state);
    return { loadURL: (url: string) => { state.url = url; return load; }, webContents: { executeJavaScript: async (script: string) => { state.scripts.push(script); } },
      isDestroyed: () => state.destroyed, hide: () => { state.visible = false; }, destroy: () => { state.visible = false; state.destroyed = true; },
      setBounds: (bounds: unknown) => { state.bounds = bounds; }, showInactive: () => { state.visible = true; } } as unknown as BrowserWindow;
  } });
  return { overlay, windows, removeDisplay: () => { displays = displays.slice(0, 1); } };
}

test('mandatory takeover notice follows all display bounds and confirmed release', async () => {
  const f = fixture(); await f.overlay.update('free'); assert.equal(f.windows.length, 0);
  await f.overlay.update('preparing'); await f.overlay.ready(); assert.equal(f.windows.length, 2);
  assert.deepEqual(f.windows[0].bounds, { x: -1920, y: 0, width: 1920, height: 1080 });
  await f.overlay.update('active'); assert.ok(f.windows.every(window => window.visible));
  const html = decodeURIComponent(f.windows[0].url.split(',').slice(1).join(','));
  assert.match(html, /<kbd>Esc<\/kbd>/); assert.match(html, /script-src 'none'/); assert.doesNotMatch(html, /<script|<button|https?:\/\//);
  f.removeDisplay(); await f.overlay.refresh(); assert.equal(f.windows[1].destroyed, true);
  await f.overlay.update('stopping'); assert.equal(f.windows[0].visible, true);
  await f.overlay.update('free'); assert.equal(f.windows[0].visible, false); await assert.rejects(f.overlay.ready()); f.overlay.dispose();
});

test('late overlay loads never revive a released or disposed reservation', async () => {
  for (const dispose of [true, false]) {
    let finish!: () => void; const f = fixture(new Promise<void>(resolve => { finish = resolve; }));
    const pending = f.overlay.update('preparing');
    if (dispose) f.overlay.dispose(); else await f.overlay.update('free');
    finish(); await pending; assert.ok(f.windows.every(window => !window.visible)); f.overlay.dispose();
  }
});

test('background work and a desktop reservation have distinct accessible copy on every app view', () => {
  const state = snapshotFixture(); state.task.status = 'running'; state.desktopControl = 'free';
  const render = () => renderToStaticMarkup(createElement(DesktopControlNotice, { state, onStop: async () => {} }));
  assert.match(render(), /Hintergrundarbeit · Arbeitsplatz frei/); assert.doesNotMatch(render(), /gesperrt/);
  state.desktopControl = 'active'; assert.match(render(), /Agent steuert deinen PC/); assert.match(render(), /gesperrt/); assert.match(render(), /<kbd>Esc<\/kbd>/);
  assert.equal(decodeSnapshot(state).desktopControl, 'active');
  assert.throws(() => decodeSnapshot({ ...state, desktopControl: 'fake-lock' }));
  state.desktopControl = 'free'; state.task.status = 'completed'; state.jobs = []; state.summary = undefined;
  assert.equal(render(), '');
});
