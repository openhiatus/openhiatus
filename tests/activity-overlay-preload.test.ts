import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { ACTIVITY_OVERLAY_RESIZE_CHANNEL } from '../src/main/activity-overlay';

type EventData = Record<string, unknown>;
class Surface {
  readonly listeners = new Map<string, ((event: EventData) => void)[]>();
  addEventListener(name: string, callback: (event: EventData) => void) { this.listeners.set(name, [...this.listeners.get(name) ?? [], callback]); }
  dispatch(name: string, values: EventData = {}) {
    let prevented = false;
    const event = { preventDefault: () => { prevented = true; }, ...values };
    for (const callback of this.listeners.get(name) ?? []) callback(event);
    return prevented;
  }
}

function fixture() {
  const window = new Surface(), document = Object.assign(new Surface(), { hidden: false });
  let captured: number | undefined, failCapture = false;
  const handle = Object.assign(new Surface(), {
    getBoundingClientRect: () => ({ left: 120, top: 8, right: 135, bottom: 136 }),
    setPointerCapture: (pointer: number) => { if (failCapture) throw new Error('pointer inactive'); captured = pointer; },
    hasPointerCapture: (pointer: number) => captured === pointer,
    releasePointerCapture: (pointer: number) => { if (captured === pointer) { captured = undefined; handle.dispatch('lostpointercapture', { pointerId: pointer }); } }
  });
  const commands: EventData[] = [];
  const source = readFileSync(new URL('../src/main/activity-overlay-preload.ts', import.meta.url), 'utf8');
  const code = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node24' }).code;
  runInNewContext(code, { window, document: Object.assign(document, { getElementById: (id: string) => id === 'resize' ? handle : undefined }),
    require: (name: string) => {
      assert.equal(name, 'electron');
      return { ipcRenderer: { send: (channel: string, command: EventData) => { assert.equal(channel, ACTIVITY_OVERLAY_RESIZE_CHANNEL); commands.push(JSON.parse(JSON.stringify(command)) as EventData); } } };
    }
  });
  window.dispatch('DOMContentLoaded');
  return { window, document, handle, commands, failCapture: () => { failCapture = true; } };
}

const pointer = (pointerId = 7, y = -100, x = 127): EventData => ({ pointerId, button: 0, screenY: y, clientX: x, clientY: 50 });

test('isolated preload enables input only while hovering the size handle', () => {
  const f = fixture();
  f.window.dispatch('mousemove', { clientX: 30, clientY: 30 }); assert.deepEqual(f.commands, []);
  f.window.dispatch('mousemove', { clientX: 127, clientY: 30 });
  f.window.dispatch('mousemove', { clientX: 128, clientY: 31 });
  f.window.dispatch('mousemove', { clientX: 10, clientY: 30 });
  assert.deepEqual(f.commands, [{ phase: 'hover', over: true }, { phase: 'hover', over: false }]);
});

test('pointer capture forwards only matching pointer positions and finishes once outside the handle', () => {
  const f = fixture();
  assert.equal(f.handle.dispatch('pointerdown', pointer()), true);
  f.handle.dispatch('pointermove', pointer(8, 100));
  f.handle.dispatch('pointermove', pointer(7, -70));
  f.handle.dispatch('pointerup', pointer(7, -60, 20));
  f.handle.dispatch('pointerup', pointer(7, -50));
  assert.deepEqual(f.commands, [{ phase: 'start', pointerId: 7, y: -100 }, { phase: 'move', pointerId: 7, y: -70 }, { phase: 'end', pointerId: 7, y: -60 }]);
});

test('a hidden or reset overlay releases capture so the next drag starts normally', () => {
  for (const reset of ['visibilitychange', 'openhiatus:activity-overlay-reset']) {
    const f = fixture();
    f.handle.dispatch('pointerdown', pointer());
    f.document.hidden = true; f.document.dispatch(reset);
    f.handle.dispatch('pointerup', pointer(7, -60));
    f.document.hidden = false; f.handle.dispatch('pointerdown', pointer(8, 20));
    assert.deepEqual(f.commands, [{ phase: 'start', pointerId: 7, y: -100 }, { phase: 'start', pointerId: 8, y: 20 }]);
  }
});

test('lost capture cancels once and unsupported buttons, failed capture and keys send no commands', () => {
  const f = fixture();
  f.handle.dispatch('pointerdown', { ...pointer(), button: 2 }); assert.deepEqual(f.commands, []);
  f.handle.dispatch('pointerdown', pointer()); f.handle.dispatch('lostpointercapture', pointer());
  assert.deepEqual(f.commands, [{ phase: 'start', pointerId: 7, y: -100 }, { phase: 'cancel', pointerId: 7, y: -100 }]);
  assert.equal(f.handle.dispatch('keydown', { key: 'Delete' }), false);
  assert.equal(f.handle.dispatch('keydown', { key: 'ArrowDown' }), true);
  assert.deepEqual(f.commands.at(-1), { phase: 'key', key: 'ArrowDown' });
  const failed = fixture(); failed.failCapture(); failed.handle.dispatch('pointerdown', pointer()); assert.deepEqual(failed.commands, []);
});
