import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { guidanceGeometry, parseScreenHelpInput } from '../src/shared/screen-help';
import { ScreenHelpService, type HelpCapture } from '../src/main/platform/screen-help/service';
import { installHelpSkill, readHelpSkill } from '../src/main/platform/screen-help/skill';
import { GuidanceOverlay } from '../src/main/platform/screen-help/overlay';
import { createScreenHelpTools } from '../src/main/platform/tools/screen-help-tools';
import { createToolRegistry } from '../src/main/modules/tools';
import { ComputerImageHistory } from '../src/main/computer-image-history';

function fixture() {
  let stamp = 'a', now = 1000, pixel = 0, busy = false, captureGate: Promise<void> | undefined;
  let shown: unknown[] = [], clears = 0;
  const capture: HelpCapture = { png: 'source', width: 1920, height: 1080, stamp, displayId: 'primary-test', bounds: { x: -1280, y: 40, width: 1280, height: 720 } };
  const service = new ScreenHelpService({ currentStamp: async () => stamp, now: () => now, skill: async () => 'synthetic help skill', busy: () => busy,
    capture: async () => { await captureGate; return { ...capture, stamp }; }, clear: () => { clears++; }, show: async (...args) => { shown = args; },
    processor: async () => ({ decode: (_png, size) => ({ ...size, png: 'source', data: new Uint8Array(size.width * size.height * 4).fill(pixel) }),
      overview: (image, divisor) => ({ base64: 'cG5n', width: Math.round(image.width / divisor), height: Math.round(image.height / divisor) }),
      crop: (_image, rect) => ({ ...rect, base64: 'cG5n' }) }),
  });
  const signal = new AbortController().signal;
  const observe = async () => { const result = await service.execute({ action: 'observe' }, signal);
    const text = result.contentItems.find(item => item.type === 'inputText' && item.text.startsWith('OPENHIATUS_'));
    assert.ok(text && text.type === 'inputText'); return JSON.parse(text.text.slice(text.text.indexOf(' ') + 1)); };
  return { service, signal, observe, shown: () => shown, clears: () => clears, stamp: (v: string) => { stamp = v; }, now: (v: number) => { now = v; }, pixel: (v: number) => { pixel = v; }, busy: () => { busy = true; }, gate: (v: Promise<void>) => { captureGate = v; } };
}
test('help capture loads the skill and maps an inspected target back to physical pixels', async () => {
  const f = fixture(), initial = await f.observe();
  const inspected = await f.service.execute({ action: 'inspect', frameId: initial.frameId, viewId: initial.views[0].viewId, x: 100, y: 50, width: 200, height: 100 }, f.signal);
  const metadata = inspected.contentItems.find(i => i.type === 'inputText' && i.text.startsWith('OPENHIATUS_')); assert.ok(metadata && metadata.type === 'inputText');
  const detail = JSON.parse(metadata.text.slice(metadata.text.indexOf(' ') + 1)).views[1];
  const result = await f.service.execute({ action: 'mark', frameId: initial.frameId, viewId: detail.viewId, x: 20, y: 10, width: 24, height: 18, label: 'Fett' }, f.signal);
  assert.equal(result.success, true); assert.deepEqual(f.shown()[0], { x: 220, y: 110, width: 24, height: 18 });
  assert.deepEqual(f.shown()[2], { x: -1280, y: 40, width: 1280, height: 720 });
  await assert.rejects(f.service.execute({ action: 'mark', frameId: initial.frameId, viewId: 'misspelled', x: 1, y: 1, width: 1, height: 1 }, f.signal), /Unbekannte/);
});
test('stale, changed and user-invalidated targets never show an overlay', async () => {
  for (const change of ['stamp','time','pixels','clear'] as const) {
    const f = fixture(), m = await f.observe();
    if (change === 'stamp') f.stamp('changed'); if (change === 'time') f.now(62000); if (change === 'pixels') f.pixel(255); if (change === 'clear') f.service.clear();
    await assert.rejects(f.service.execute({ action: 'mark', frameId: m.frameId, viewId: m.views[0].viewId, x: 20, y: 30, width: 12, height: 12 }, f.signal)); assert.deepEqual(f.shown(), []);
  }
});
test('Stop during a pending local validation cannot publish a late marker', async () => {
  const f = fixture(), m = await f.observe(); let release!: () => void;
  f.gate(new Promise<void>(resolve => { release = resolve; }));
  const pending = f.service.execute({ action: 'mark', frameId: m.frameId, viewId: m.views[0].viewId, x: 20, y: 30, width: 12, height: 12 }, f.signal);
  await new Promise(resolve => setImmediate(resolve)); f.service.clear(); release(); await assert.rejects(pending); assert.deepEqual(f.shown(), []);
});
test('guidance is a restricted dialog tool and refuses a busy desktop', async () => {
  const f = fixture(), registry = createToolRegistry([createScreenHelpTools(f.service)]);
  const worker = registry.bind({ runId: 'worker', role: 'worker', signal: f.signal, emit() {} }); assert.deepEqual(worker.definitions, []); await worker.stop();
  const dialog = registry.bind({ runId: 'dialog', role: 'dialog', signal: f.signal, emit() {} });
  assert.deepEqual(dialog.definitions.map(d => d.name), ['screen_help']);
  await assert.rejects(dialog.call('screen_help', { action: 'click', x: 10, y: 10 }));
  f.busy(); await assert.rejects(dialog.call('screen_help', { action: 'observe' }), /Arbeitsauftrag/); await registry.dispose();
});
test('circle and arrow geometry uses actual image dimensions and display-local DIP', () => {
  for (const factor of [1, 1.25, 1.5, 2]) {
    const g = guidanceGeometry({ x: 200 * factor, y: 100 * factor, width: 20 * factor, height: 20 * factor }, { width: 1920 * factor, height: 1080 * factor }, { width: 1920, height: 1080 });
    assert.equal(g.cx, 210); assert.equal(g.cy, 110); assert.ok(g.radius >= Math.hypot(10,10));
    assert.ok(Math.abs(Math.hypot(g.tipX-g.cx,g.tipY-g.cy) - (g.radius+3)) < 1e-7);
    assert.ok(g.arrowX >= 0 && g.arrowX <= 1920 && g.arrowY >= 0 && g.arrowY <= 1080);
  }
  for (const value of [{ action: 'mark', frameId:'f',viewId:'v',x:-1,y:0,width:10,height:10 }, { action: 'observe', click: true }, { action: 'clear', label: 'bad' }]) assert.throws(() => parseScreenHelpInput(value));
});
test('a cleared overlay cannot reappear after its asynchronous document load', async () => {
  let loaded!: () => void, shows=0;
  const window = { isDestroyed: () => false, hide() {}, destroy() {}, setBounds() {}, showInactive() { shows++; },
    loadURL: () => new Promise<void>(resolve => { loaded=resolve; }), webContents: { executeJavaScript: async () => undefined } };
  const overlay = new GuidanceOverlay(() => window as never);
  const pending = overlay.show({ x: 10,y:10,width:20,height:20 },{width:1000,height:800},{x:0,y:0,width:1000,height:800},'Fett');
  overlay.clear(); loaded(); await assert.rejects(pending); assert.equal(shows,0); overlay.dispose();
});
test('the editable help skill is seeded once and user changes survive reinstall', async t => {
  const directory=await mkdtemp(join(tmpdir(),'openhiatus-help-')); t.after(() => rm(directory,{recursive:true,force:true}));
  const source=join(directory,'source.md'), content='---\nname: bildschirmhilfe\ndescription: Testhilfe\n---\n\nZeige nur.';
  await writeFile(source,content); const file=await installHelpSkill(join(directory,'profile'),source); assert.equal(await readHelpSkill(file),content);
  await writeFile(file,content+' Meine Ergänzung.'); await installHelpSkill(join(directory,'profile'),source); assert.equal(await readFile(file,'utf8'),content+' Meine Ergänzung.');
});
test('help images expire after two model requests without removing unrelated images', () => {
  const messages: unknown[] = [{ role: 'assistant', content: [{type:'toolCall',name:'screen_help',id:'help1',arguments:{action:'observe'}}] },
    { role:'toolResult', toolName:'screen_help',toolCallId:'help1',content:[{type:'image',data:'help',mimeType:'image/png'}] },
    { role:'user',content:[{type:'image',data:'user',mimeType:'image/png'}] }];
  const history=new ComputerImageHistory(2); assert.ok(JSON.stringify(history.nextRequest(messages)).includes('"data":"help"'));
  assert.ok(JSON.stringify(history.nextRequest(messages)).includes('"data":"help"')); const third=JSON.stringify(history.nextRequest(messages));
  assert.ok(!third.includes('"data":"help"')); assert.ok(third.includes('"data":"user"'));
});
