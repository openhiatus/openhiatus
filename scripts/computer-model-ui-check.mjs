import { _electron as electron, expect } from '@playwright/test';
import { build } from 'esbuild';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

// Hidden renderer only: no production Main, global hotkeys, accounts, desktop driver or model calls.
await mkdir('.test-data', { recursive: true }); await mkdir('artifacts', { recursive: true });
const directory = await mkdtemp(path.resolve('.test-data/computer-model-ui-'));
const source = file => JSON.stringify(path.resolve(file));
await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'openhiatus-computer-model-ui', version: '0.0.0', main: 'main.cjs' }));
await build({ stdin: { contents: `
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {SettingsView} from ${source('src/renderer/features/settings/index.ts')};
import {TaskModelMetrics} from ${source('src/renderer/features/tasks/model-metrics.tsx')};
import {snapshotFixture} from ${source('tests/ipc-fixtures.ts')};
import ${source('src/renderer/styles.css')};
import ${source('src/renderer/providers.css')};
import ${source('src/renderer/features/settings/index.css')};
import ${source('src/renderer/features/tasks/index.css')};
globalThis.fetch=()=>{throw new Error('No network is permitted in this UI fixture.')};
const initial=snapshotFixture(); initial.models=[{id:'chatgpt/gpt-6.1-sol',label:'Sol'},{id:'chatgpt/gpt-6-luna',label:'Luna'}];
Object.assign(initial.preferences,{model:'chatgpt/gpt-6.1-sol',computerModel:'chatgpt/gpt-6-luna',computerDelegationEnabled:false,computerFast:true});
const job={id:'fixture',computer:{delegationEnabled:true,model:'chatgpt/gpt-6-luna',fast:true,overviewScaleDivisor:16},modelRequests:[
{role:'computer',model:'chatgpt/gpt-6-luna',requestedServiceTier:'fast',actualServiceTier:'default',requests:2,completed:2,failed:0,aborted:0,elapsedMs:2500,usage:{inputTokens:20,outputTokens:3,cacheReadTokens:100,cacheWriteTokens:0}},
{role:'worker',model:'chatgpt/gpt-6.1-sol',requests:1,completed:1,failed:0,aborted:0,elapsedMs:1000}]};
const unexpected=()=>{throw new Error('Unexpected operation')};
function Fixture(){const [state,setState]=useState(initial),[busy,setBusy]=useState(false);window.fixture={state,patches:window.fixture?.patches??[],setBusy};return <div style={{width:'100%',height:'100%',overflow:'auto'}}>
<SettingsView state={state} workBusy={busy} summaryInProgress={false} onPreference={patch=>{window.fixture.patches.push(patch);setState(previous=>({...previous,preferences:{...previous.preferences,...patch}}))}} onError={unexpected} onNotice={()=>{}}
voice={{phase:'idle',seconds:0,devices:[],audioBusy:false,speechReady:false,startRecording:unexpected,testSpeech:unexpected,cancelAudio:unexpected,clearSpeech:unexpected,stopEarcons:unexpected,saveSpeechKey:unexpected,removeSpeechKey:unexpected}}/>
<section style={{padding:32}}><TaskModelMetrics job={job}/></section></div>}
createRoot(document.getElementById('root')).render(<Fixture/>);
`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, platform: 'browser', jsx: 'automatic', outfile: path.join(directory, 'renderer.js') });
await writeFile(path.join(directory, 'index.html'), '<!doctype html><html lang="de"><meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><body><div id="root"></div><script src="renderer.js"></script></body></html>');
await writeFile(path.join(directory, 'main.cjs'), `const {app,BrowserWindow}=require('electron');const path=require('node:path');app.setPath('userData',path.join(__dirname,'profile'));app.disableHardwareAcceleration();app.whenReady().then(()=>{const window=new BrowserWindow({show:false,width:1180,height:1000,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});return window.loadFile(path.join(__dirname,'index.html'))});`);
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
let instance;
try {
  instance = await electron.launch({ executablePath: path.resolve('node_modules/electron/dist/electron.exe'), args: [directory], env, timeout: 30000 });
  const page = await instance.firstWindow(), errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('tab', { name: 'Bedienung', exact: true }).click();
  const enabled = page.getByRole('checkbox', { name: /^Eigenes Computer-Modell verwenden/ });
  const fast = page.getByRole('checkbox', { name: /^Fast für das Computer-Modell/ });
  await expect(enabled).not.toBeChecked(); await expect(fast).toBeChecked();
  await page.getByLabel('Auflösung der Übersicht', { exact: true }).selectOption('16');
  await enabled.check();
  await expect.poll(() => page.evaluate(() => window.fixture.state.preferences.computerDelegationEnabled)).toBe(true);
  assert.deepEqual(await page.evaluate(() => ({ model: window.fixture.state.preferences.model, computer: window.fixture.state.preferences.computerModel, factor: window.fixture.state.preferences.computerOverviewScaleDivisor, fast: window.fixture.state.preferences.computerFast })),
    { model: 'chatgpt/gpt-6.1-sol', computer: 'chatgpt/gpt-6-luna', factor: 16, fast: true });
  await page.evaluate(() => window.fixture.setBusy(true));
  await expect(enabled).toBeDisabled(); await expect(fast).toBeDisabled(); await expect(page.getByLabel('Computer-Modell', { exact: true })).toBeDisabled();
  await page.evaluate(() => window.fixture.setBusy(false));
  await page.getByLabel('Computer-Modell', { exact: true }).selectOption(''); await expect(enabled).not.toBeChecked(); await expect(enabled).toBeDisabled();
  await page.getByLabel('Computer-Modell', { exact: true }).selectOption('chatgpt/gpt-6-luna'); await enabled.check();
  const details = page.locator('.tasks-model-metrics');
  assert.equal(await details.getAttribute('open'), null); await details.locator('summary').click();
  await expect(details.getByText('default', { exact: true })).toBeVisible(); await expect(details.getByText('nicht gemeldet', { exact: true })).toBeVisible();
  await expect(details.getByText('2,5 s', { exact: true })).toBeVisible();
  assert.deepEqual(errors, []);
  const png = await instance.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG().toString('base64'));
  await writeFile('artifacts/openhiatus-computer-model-ui.png', Buffer.from(png, 'base64'));
  await writeFile('artifacts/openhiatus-computer-model-ui.json', JSON.stringify({ passed: true, hidden: true, nativeCaptures: 0, nativeInputs: 0, cloudRequests: 0, checks: ['opt-in and Fast', 'independent computer model', '1:16 choice', 'busy locking', 'clear model disables delegation', 'actual default and unknown preserved', 'request time label'] }, null, 2));
  console.log('Computer model UI passed: hidden renderer, zero native inputs/captures and zero model requests.');
} finally { await instance?.close(); }
