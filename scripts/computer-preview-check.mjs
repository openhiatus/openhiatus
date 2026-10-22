import { _electron as electron, expect } from '@playwright/test';
import { build } from 'esbuild';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

// Hidden, isolated renderer with a synthetic session: never starts the real app,
// native desktop driver, hotkeys, audio, model requests or an existing profile.
await mkdir('.test-data', { recursive: true }); await mkdir('artifacts', { recursive: true });
const directory = await mkdtemp(path.resolve('.test-data/computer-preview-'));
const sourcePath = file => JSON.stringify(path.resolve(file));
await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'openhiatus-computer-preview-check', version: '0.0.0', main: 'main.cjs' }));
await build({ stdin: { contents: `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ComputerPreview } from ${sourcePath('src/renderer/ComputerPreview.tsx')};
import ${sourcePath('src/renderer/computer-preview.css')};
createRoot(document.getElementById('root')).render(<ComputerPreview enabled={true} onStop={() => window.openhiatus.stop()} />);
`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, platform: 'browser', jsx: 'automatic', outfile: path.join(directory, 'renderer.js') });
await writeFile(path.join(directory, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><style>body{background:#131714;color:#dce8ce;font-family:Arial}.icon-button,.stop-all{padding:10px;background:#293626;color:inherit;border:1px solid #556448;border-radius:5px}button{cursor:pointer}</style></head><body><div id="root"></div><script src="renderer.js"></script></body></html>');
await writeFile(path.join(directory, 'preload.cjs'), `
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('openhiatus', {
 onComputerFrame(callback) { const listener = (_event, frame) => callback(frame); ipcRenderer.on('frame', listener); return () => ipcRenderer.removeListener('frame', listener); },
 stop() { return ipcRenderer.invoke('stop'); }
});`);
await build({ stdin: { contents: `
import { app, BrowserWindow, ipcMain, nativeImage } from 'electron';
import path from 'node:path';
import { NativeComputer, DesktopCoordinator } from ${sourcePath('src/main/computer.ts')};
import { createToolRegistry } from ${sourcePath('src/main/modules/tools/index.ts')};
import { createComputerToolContribution } from ${sourcePath('src/main/platform/tools/computer-tools.ts')};
async function run(){
app.setPath('userData', path.join(__dirname, 'profile')); app.disableHardwareAcceleration();
await app.whenReady();
const width=3840, height=2160, data=Buffer.alloc(width*height*4,255);
for(let y=540;y<1080;y++) for(let x=960;x<1920;x++){const offset=(y*width+x)*4;data[offset]=140;data[offset+1]=100;data[offset+2]=30;}
const png=nativeImage.createFromBitmap(data,{width,height,scaleFactor:1}).toPNG({scaleFactor:1}).toString('base64');
const result=fields=>({text:'',images:[],isError:false,degraded:false,rawJson:'{}',...fields});
let captures=0, inputs=0, disposed=0;
const computer=new NativeComputer({overviewScaleDivisor:16, desktopCoordinator:new DesktopCoordinator(), createSession:async()=>({
 screenshot:async()=>{captures++;return result({images:[{mimeType:'image/png',dataBase64:png}],structuredJson:JSON.stringify({screenshot_width:width,screenshot_height:height,screen_width:width,screen_height:height,scale_factor:1.5})});},
 screenSize:async()=>result({structuredJson:JSON.stringify({width,height,scale_factor:1.5})}),
 act:async()=>{inputs++;throw new Error('Desktop input forbidden in this fixture');},dispose:async()=>{disposed++;}
})});
const window=new BrowserWindow({show:false,width:1100,height:800,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
const registry=createToolRegistry([createComputerToolContribution({computer})]);
const binding=registry.bind({runId:'synthetic',role:'worker',signal:new AbortController().signal,emit:event=>{if(event.type==='computer-frame')window.webContents.send('frame',event.frame);}});
globalThis.fixture={
 capture:()=>binding.call('computer',{action:'screenshot'}),
 inspect:(frameId,viewId)=>binding.call('computer',{action:'inspect',frameId,viewId,x:60,y:34,width:60,height:34}),
 original:()=>binding.call('computer',{action:'screenshot',resolution:'original'}),
 legacy:()=>window.webContents.send('frame',{dataUrl:'data:image/png;base64,'+png,frameId:'legacy',width,height,at:new Date().toISOString()}),
 counts:()=>({captures,inputs,disposed}),
};
ipcMain.handle('stop',()=>binding.stop());
app.on('before-quit',()=>{void registry.dispose();});
await window.loadFile(path.join(__dirname,'index.html'));
}
run().catch(error=>{console.error(error);process.exit(1)});
`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', target: 'node24',
  external: ['electron', '@trycua/cua-driver'], outfile: path.join(directory, 'main.cjs') });

const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
let instance;
try {
  instance = await electron.launch({ executablePath: path.resolve('node_modules/electron/dist/electron.exe'), args: [directory], env, timeout: 30000 });
  const screenshot = async file => {
    const base64 = await instance.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG().toString('base64'));
    assert.ok(base64.length > 1000); await writeFile(file, Buffer.from(base64, 'base64'));
  };
  const page = await instance.firstWindow(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  const trigger = page.getByRole('button', { name: 'openHiatus’ letzte Bildschirmansicht', exact: true });
  await expect(trigger).toBeDisabled();
  const first = await instance.evaluate(() => globalThis.fixture.capture());
  const metadata = JSON.parse(first.contentItems[0].text.slice('OPENHIATUS_COMPUTER_METADATA_V2 '.length));
  await expect(trigger).toBeEnabled();
  const detail = await instance.evaluate((_electron, value) => globalThis.fixture.inspect(value.frameId, value.views[0].viewId), metadata);
  await trigger.click(); const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
  const views = dialog.locator('.computer-preview-views img'); await expect(views).toHaveCount(2);
  assert.deepEqual(await views.evaluateAll(elements => elements.map(element => [element.naturalWidth, element.naturalHeight])), [[240,135],[960,544]]);
  assert.deepEqual(await views.evaluateAll(elements => elements.map(element => element.getAttribute('src'))), detail.contentItems.filter(item=>item.type==='inputImage').map(item=>item.imageUrl));
  await expect(dialog).toContainText('3840 × 2160'); await expect(dialog).toContainText('(960, 544)'); await expect(dialog).toContainText('Momentaufnahme, kein Livebild');
  const overlay = dialog.locator('.computer-preview-detail-rect');
  assert.equal(await overlay.evaluate(element=>element.style.left), '25%');
  assert.ok(Math.abs(await overlay.evaluate(element=>parseFloat(element.style.top))-544/2160*100)<0.001);
  await screenshot('artifacts/openhiatus-computer-preview.png');
  await page.setViewportSize({width:700,height:760});
  assert.equal(await dialog.locator('.computer-preview-views').evaluate(element=>getComputedStyle(element).gridTemplateColumns.split(' ').length),1);
  assert.ok(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth));
  await screenshot('artifacts/openhiatus-computer-preview-narrow.png');
  const original = await instance.evaluate(()=>globalThis.fixture.original());
  const fullMetadata = JSON.parse(original.contentItems[0].text.slice('OPENHIATUS_COMPUTER_METADATA_V2 '.length));
  assert.notEqual(fullMetadata.frameId,metadata.frameId); assert.equal(fullMetadata.overviewScaleDivisor,1);
  await expect(dialog.getByRole('heading',{name:'Vollbild in Originalauflösung',exact:true})).toBeVisible();
  await expect(dialog.locator('img')).toHaveCount(1);
  assert.deepEqual(await dialog.locator('img').evaluate(element=>[element.naturalWidth,element.naturalHeight]),[3840,2160]);
  assert.equal(await dialog.locator('img').getAttribute('src'),original.contentItems.find(item=>item.type==='inputImage').imageUrl);
  const restored = await instance.evaluate(()=>globalThis.fixture.capture());
  const restoredMetadata = JSON.parse(restored.contentItems[0].text.slice('OPENHIATUS_COMPUTER_METADATA_V2 '.length));
  assert.equal(restoredMetadata.overviewScaleDivisor,16);
  await expect(dialog.getByRole('heading',{name:'Übersicht',exact:true})).toBeVisible();
  assert.deepEqual(await dialog.locator('img').first().evaluate(element=>[element.naturalWidth,element.naturalHeight]),[240,135]);
  await dialog.getByRole('button', { name:'Stopp', exact:true }).click();
  await expect.poll(()=>instance.evaluate(()=>globalThis.fixture.counts())).toEqual({captures:3,inputs:0,disposed:1});
  await dialog.getByRole('button', {name:'Bildschirmansicht schließen',exact:true}).click(); await expect(trigger).toBeFocused();
  await instance.evaluate(()=>globalThis.fixture.legacy()); await trigger.click();
  await expect(dialog.locator('img')).toHaveCount(1); await expect(dialog).toContainText('Vollbild');
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible(); await expect(trigger).toBeFocused();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,original:[3840,2160],overview:[240,135],detail:[960,544],captures:3,inputs:0,responsive:true,legacy:true,originalOnRequest:true,configuredFactorRestored:true}));
} finally { await instance?.close(); }
