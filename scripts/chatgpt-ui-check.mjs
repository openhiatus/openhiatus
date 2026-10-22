import { _electron as electron, expect } from '@playwright/test';
import { build } from 'esbuild';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

await mkdir('.test-data', { recursive: true });
await mkdir('artifacts', { recursive: true });
const fixture = await mkdtemp(path.resolve('.test-data/chatgpt-ui-'));
const component = path.resolve('src/renderer/ProvidersView.tsx').replaceAll('\\', '/');
const entry = path.join(fixture, 'chatgpt-ui-fixture.tsx');
await writeFile(entry, `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ProvidersView } from ${JSON.stringify(component)};
let snapshot = { messages:[], activity:[], task:{id:'',status:'idle'},
  preferences:{inputDeviceId:'default',outputDeviceId:'default',speakReplies:false,voiceId:'Dennis',model:'',dialogModel:'',memoryModel:'',chatgptBackgroundUsage:false},
  connections:{agent:'missing',account:'',speech:'missing'}, models:[], workspace:'test',version:'test',
  chatgpt:{status:'signed-out',planUsage:false}, providers:[{id:'chatgpt',label:'ChatGPT',authType:'chatgpt',configured:false,verified:false,models:[]}] };
let setSnapshot, setDisabled, finish, fail;
const calls = [], errors = [];
const publish = patch => { snapshot={...snapshot,...patch}; setSnapshot?.(snapshot); };
const signedOut = (retain=true) => {const account=retain?snapshot.chatgpt.account:undefined;publish({chatgpt:{status:'signed-out',planUsage:false,...(account?{account}:{})},models:[],providers:[{id:'chatgpt',label:'ChatGPT',authType:'chatgpt',configured:false,verified:false,models:[],...(account?{account}:{})}]});};
window.openhiatus={
  signInChatGPT:()=>{ calls.push('signin'); publish({chatgpt:{status:'signing-in',planUsage:false}}); return new Promise((resolve,reject)=>{finish=resolve;fail=reject;}); },
  cancelChatGPTSignIn:async()=>{calls.push('cancel');signedOut();finish?.();},
  signOutChatGPT:async()=>{calls.push('signout');signedOut();},
  openChatGPTUsage:async()=>{calls.push('usage');},
  removeProvider:async id=>{calls.push('remove:'+id);signedOut(false);},
  savePreferences:async patch=>{calls.push({preferences:patch});publish({preferences:{...snapshot.preferences,...patch}});},
};
window.__chatgptTest={calls,errors,getSnapshot:()=>snapshot,setDisabled:value=>setDisabled(value),
  complete:planUsage=>{ const models=planUsage?[{id:'chatgpt/ui-account-model',label:'ChatGPT · Konto-Modell',provider:'chatgpt'}]:[];
    publish({chatgpt:{status:'signed-in',planUsage,account:'ui-account@example.test'},models,providers:[{id:'chatgpt',label:'ChatGPT',authType:'chatgpt',configured:planUsage,verified:true,account:'ui-account@example.test',models}]});finish?.(); },
  fail:()=>{publish({chatgpt:{status:'error',planUsage:false,error:'Der gespeicherte ChatGPT-Zugang ist beschädigt.'}});fail?.(new Error('Der gespeicherte ChatGPT-Zugang ist beschädigt.'));}
};
function Fixture(){const[state,update]=useState(snapshot);const[disabled,disable]=useState(false);setSnapshot=update;setDisabled=disable;
 return <><aside className="sidebar" aria-hidden="true"/><div className="main-shell"><main className="settings-scroll"><div className="settings-content"><ProvidersView state={state} disabled={disabled} onError={error=>errors.push(error.message)} onPreference={value=>void window.openhiatus.savePreferences(value)} /></div></main></div></>;}
createRoot(document.getElementById('root')).render(<Fixture/>);
`, 'utf8');
await build({ entryPoints: [entry], bundle: true, platform: 'browser', target: 'chrome130', format: 'iife', jsx: 'automatic', outfile: path.join(fixture, 'chatgpt-ui-fixture.js') });
const style = name => pathToFileURL(path.resolve(`src/renderer/${name}`)).href;
await writeFile(path.join(fixture, 'chatgpt-ui-fixture.html'), `<!doctype html><html lang="de"><head><meta charset="UTF-8"><link rel="stylesheet" href="${style('styles.css')}"><link rel="stylesheet" href="${style('providers.css')}"></head><body><div id="root" class="app-shell"></div><script src="chatgpt-ui-fixture.js"></script></body></html>`, 'utf8');
const main = path.join(fixture, 'chatgpt-ui-fixture.cjs');
await writeFile(main, `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(fixture, 'profile'))});app.whenReady().then(()=>{const window=new BrowserWindow({width:1180,height:900,show:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});window.loadFile(${JSON.stringify(path.join(fixture, 'chatgpt-ui-fixture.html'))});});app.on('window-all-closed',()=>app.quit());`, 'utf8');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
let instance;
try {
  instance = await electron.launch({ executablePath: path.resolve('node_modules/electron/dist/electron.exe'), args: [main], env, timeout: 30000 });
  const page = await instance.firstWindow();
  const exceptions = []; page.on('pageerror', error => exceptions.push(error.message));
  const card = page.locator('[data-provider="chatgpt"]');
  const signIn = card.getByRole('button', { name: 'Continue with ChatGPT', exact: true });
  const consent = card.getByRole('checkbox', { name: /Automatische Gedächtnisberichte mit ChatGPT erlauben/ });
  await expect(signIn).toBeVisible();
  await expect(page.locator('[data-provider]')).toHaveCount(6);
  await expect(page.getByRole('heading', { name: 'OpenAI API', exact: true })).toBeVisible();
  await expect(card.locator('input[type="password"], input[type="url"], textarea')).toHaveCount(0);
  await expect(consent).not.toBeChecked(); await expect(consent).toBeDisabled();
  await card.screenshot({ path: 'artifacts/openhiatus-chatgpt-anmeldung.png' });

  await signIn.click();
  const cancel = card.getByRole('button', { name: 'Anmeldung abbrechen', exact: true });
  await expect(cancel).toBeEnabled();
  await page.evaluate(() => window.__chatgptTest.setDisabled(true));
  await expect(cancel).toBeEnabled();
  await cancel.click(); await expect(signIn).toBeVisible(); await expect(signIn).toBeDisabled();
  await page.evaluate(() => window.__chatgptTest.setDisabled(false));

  await signIn.click(); await page.evaluate(() => window.__chatgptTest.complete(false));
  await expect(card.getByText('ui-account@example.test', { exact: true })).toBeVisible();
  await expect(card.getByText('Kein Modellzugriff freigeschaltet', { exact: true })).toBeVisible();
  await expect(consent).toBeDisabled(); await expect(consent).not.toBeChecked();
  await card.getByRole('button', { name: 'ChatGPT-Zugang freigeben', exact: true }).click();
  await expect(cancel).toBeEnabled();
  await page.evaluate(() => window.__chatgptTest.complete(false));
  await card.screenshot({ path: 'artifacts/openhiatus-chatgpt-kein-zugriff.png' });
  await card.getByRole('button', { name: /Nutzung verwalten/ }).click();
  await card.getByRole('button', { name: 'Abmelden', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Verbindung entfernen', exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Abmelden', exact: true })).toHaveCount(0);
  await card.getByRole('button', { name: 'Verbindung entfernen', exact: true }).click();

  await signIn.click(); await page.evaluate(() => window.__chatgptTest.fail());
  await expect(card.getByRole('alert')).toHaveText('Der gespeicherte ChatGPT-Zugang ist beschädigt.');
  await expect(signIn).toBeEnabled();
  await expect(card.getByRole('button', { name: 'Abmelden', exact: true })).toHaveCount(0);
  await card.getByRole('button', { name: 'Verbindung entfernen', exact: true }).click();
  await expect(card.getByRole('alert')).toHaveCount(0);
  await signIn.click(); await page.evaluate(() => window.__chatgptTest.complete(true));
  await expect(card.getByText('ChatGPT-Kontingent verwenden', { exact: true })).toBeVisible();
  await expect(consent).toBeEnabled(); await expect(consent).not.toBeChecked();
  await consent.check();
  await page.locator('#role-model').selectOption('chatgpt/ui-account-model');
  await page.locator('#role-dialogModel').selectOption('chatgpt/ui-account-model');
  await page.locator('#role-memoryModel').selectOption('chatgpt/ui-account-model');
  assert.equal(await page.evaluate(() => window.__chatgptTest.getSnapshot().preferences.chatgptBackgroundUsage), true);
  await card.screenshot({ path: 'artifacts/openhiatus-chatgpt-verbunden.png' });
  await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 760));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await card.screenshot({ path: 'artifacts/openhiatus-chatgpt-kompakt.png' });
  await card.getByRole('button', { name: 'Verbindung entfernen', exact: true }).click();
  await expect(signIn).toBeVisible();
  const result = await page.evaluate(() => ({ calls:window.__chatgptTest.calls, errors:window.__chatgptTest.errors }));
  assert.deepEqual(result.calls.filter(call => typeof call === 'string'), ['signin', 'cancel', 'signin', 'signin', 'usage', 'signout', 'remove:chatgpt', 'signin', 'remove:chatgpt', 'signin', 'remove:chatgpt']);
  assert.ok(result.calls.some(call => call.preferences?.chatgptBackgroundUsage === true));
  assert.equal(result.errors.length, 1); assert.deepEqual(exceptions, []);
  console.log(JSON.stringify({ status:'passed', fixture, checked:['six distinct provider cards', 'no ChatGPT credential or callback fields', 'pending login remains cancellable', 'verified account and missing plan access', 'identity-only account can grant model access again', 'usage and signout actions', 'signed-out retained account can be forgotten without signout', 'invalid record without an account can be removed', 'login error and retry', 'background usage requires explicit opt-in', 'dynamic models for all three roles', 'forget connection action', 'compact layout', 'no real login or browser launch'] }, null, 2));
} finally { if (instance) await instance.close(); }
