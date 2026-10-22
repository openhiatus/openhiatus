import test from 'node:test';
import assert from 'node:assert/strict';
import type { BrowserWindow } from 'electron';
import type { VoiceOverlayState } from '../src/shared/contracts';
import { VoiceOverlay, parseVoiceOverlayState } from '../src/main/voice-overlay';

const ready: VoiceOverlayState = { phase: 'ready', text: 'Grüße aus dem Mikrofon', detail: 'Bitte prüfen und mit F9 senden.', canSend: true };
const flush = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };

function fixture() {
  let canShow = true;
  const windows: { destroyed: boolean; shown: number; hidden: number; scripts: string[] }[] = [];
  let finishLoad: (() => void) | undefined;
  let delayed = false;
  const overlay = new VoiceOverlay({
    canShow: () => canShow,
    bounds: () => ({ x: 200, y: 300, width: 520, height: 300 }),
    createWindow: () => {
      const state = { destroyed: false, shown: 0, hidden: 0, scripts: [] as string[] };
      windows.push(state);
      return {
        isDestroyed: () => state.destroyed,
        hide: () => { state.hidden++; },
        destroy: () => { state.destroyed = true; },
        loadURL: async () => { if (delayed) await new Promise<void>(resolve => { finishLoad = resolve; }); },
        setBounds: () => {},
        showInactive: () => { state.shown++; },
        webContents: { executeJavaScript: async (source: string) => { state.scripts.push(source); } }
      } as unknown as BrowserWindow;
    }
  });
  return { overlay, windows, focus: () => { canShow = false; }, delayLoad: () => { delayed = true; }, finishLoad: () => finishLoad?.() };
}

test('overlay accepts only the bounded display-state contract', () => {
  assert.deepEqual(parseVoiceOverlayState(ready), ready);
  for (const phase of ['live-connecting', 'live-active', 'live-closing', 'live-ended'] as const) {
    const live = { ...ready, phase, canSend: false };
    assert.equal(parseVoiceOverlayState(live), undefined);
  }
  for (const invalid of [null, [], {}, { ...ready, extra: 'value' }, { ...ready, phase: 'execute' },
    { ...ready, canSend: 'yes' }, { ...ready, text: 'x'.repeat(12001) }, { ...ready, detail: 'x'.repeat(501) }]) {
    assert.equal(parseVoiceOverlayState(invalid), undefined);
  }
});

test('ordinary drafts do not open overlays; a background hotkey arms a passive preview', async () => {
  const f = fixture();
  f.overlay.update(ready); await flush();
  assert.equal(f.windows.length, 0);
  f.overlay.arm(); await flush();
  assert.equal(f.windows.length, 1); assert.equal(f.windows[0].shown, 1);
  assert.ok(f.windows[0].scripts[0].includes('text.textContent = state.text'));
  f.focus(); f.overlay.arm(); await flush();
  assert.equal(f.windows[0].shown, 1); assert.equal(f.windows[0].hidden, 1);
  f.overlay.dispose();
});

test('transcript markup is data, and Stop cancels in-flight render plus late updates', async () => {
  const f = fixture(); f.delayLoad();
  f.overlay.update({ ...ready, text: '</script><img src=x onerror=alert(1)>\u2028' });
  f.overlay.arm();
  f.overlay.stop(); f.finishLoad(); await flush();
  assert.equal(f.windows[0].shown, 0); assert.equal(f.windows[0].destroyed, true);
  f.overlay.update(ready); await flush();
  assert.equal(f.windows.length, 1);
  f.overlay.dispose();

  const second = fixture(); second.overlay.update({ ...ready, text: '</script><img src=x onerror=alert(1)>\u2028' });
  second.overlay.arm(); await flush();
  const script = second.windows[0].scripts[0];
  assert.ok(script.includes('\\u003c/script>'));
  assert.ok(script.includes('\\u2028'));
  assert.ok(!script.includes('</script>'));
  assert.ok(!script.includes('innerHTML'));
  second.overlay.dispose();
});

test('ready expires after 12 seconds; sent expires after 3; repeated state does not extend it', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture();
  f.overlay.update(ready); f.overlay.arm(); await flush();
  context.mock.timers.tick(11000); assert.equal(f.windows[0].hidden, 0);
  f.overlay.update({ ...ready }); await flush();
  context.mock.timers.tick(1000); assert.equal(f.windows[0].hidden, 1);
  f.overlay.arm(); await flush();
  f.overlay.update({ phase: 'sent', text: ready.text, detail: 'Auftrag gesendet.', canSend: false }); await flush();
  context.mock.timers.tick(2999); assert.equal(f.windows[0].hidden, 1);
  context.mock.timers.tick(1); assert.equal(f.windows[0].hidden, 2);
  f.overlay.dispose();
});
