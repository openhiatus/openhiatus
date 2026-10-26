import { _electron as electron, expect } from '@playwright/test';
import { build } from 'esbuild';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createUiAppFixture } from './helpers/ui-app-fixture.mjs';

await mkdir('.test-data', { recursive: true }); await mkdir('artifacts', { recursive: true });
const directory = await mkdtemp(path.resolve('.test-data/autostart-'));
const name = `openHiatus-check-${path.basename(directory)}`;
const reg = path.join(process.env.SystemRoot || 'C:/Windows', 'System32/reg.exe');
const keys = ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'];
const registry = (action, key) => spawnSync(reg, [action, key, '/v', name, ...(action === 'delete' ? ['/f'] : [])], { windowsHide: true, encoding: 'utf8' });
for (const key of keys) assert.equal(registry('query', key).status, 1, 'unique test registration must not exist');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const electronExe = path.resolve('node_modules/electron/dist/electron.exe');
const windowProbe = path.join(directory, 'window-state.exe'), probeSource = path.join(directory, 'window-state.cs');
await writeFile(probeSource, `using System;using System.Runtime.InteropServices;class Probe {
[DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr h);[DllImport("user32.dll")]static extern bool IsIconic(IntPtr h);
[DllImport("user32.dll")]static extern IntPtr GetWindowLongPtr(IntPtr h,int i);[DllImport("user32.dll")]static extern IntPtr GetWindow(IntPtr h,uint command);
static void Main(string[] args){var h=new IntPtr(long.Parse(args[0]));Console.WriteLine(IsWindowVisible(h)+","+IsIconic(h)+","+((GetWindowLongPtr(h,-20).ToInt64()&0x80)!=0)+","+(GetWindow(h,4)==IntPtr.Zero));}}`);
execFileSync(path.join(process.env.WINDIR || 'C:/Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'), ['/nologo', '/target:exe', `/out:${windowProbe}`, probeSource], { windowsHide: true });
const quote = file => JSON.stringify(path.resolve(file));
const bundle = (contents, outfile, platform = 'node', loader = 'ts') => build({ stdin: { contents, loader, resolveDir: process.cwd() },
  bundle: true, platform, format: platform === 'node' ? 'cjs' : 'iife', jsx: 'automatic', external: platform === 'node' ? ['electron'] : [], outfile: path.join(directory, outfile), logLevel: 'silent' });
await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'synthetic-autostart-check', main: 'main.cjs' }));
await bundle(`
import { app, BrowserWindow, ipcMain } from 'electron';
import { WindowsAutostart } from ${quote('src/main/windows-autostart.ts')};
import { settingsHandlers } from ${quote('src/main/ipc/settings.ts')};
app.setPath('userData', ${JSON.stringify(path.join(directory, 'native-profile'))});
app.whenReady().then(async () => {
  const service = new WindowsAutostart({ app, executable: process.execPath, name: ${JSON.stringify(name)} });
  const handlers = settingsHandlers({ platform: { autostartSettings: () => service.read(), setAutostart: enabled => service.set(enabled) } } as any);
  ipcMain.handle('check', async (_event, method, args) => {
    try { if (!['autostartSettings', 'setAutostart'].includes(method)) throw Error('Unknown check command'); return { ok: true, value: await handlers[method](args) }; }
    catch(error) { return { ok: false, error: error.message }; }
  });
  const window = new BrowserWindow({ width: 820, height: 520, webPreferences: { preload: ${JSON.stringify(path.join(directory, 'preload.cjs'))}, contextIsolation: true, sandbox: true } });
  await window.loadFile(${JSON.stringify(path.join(directory, 'index.html'))});
});
app.on('window-all-closed', () => app.quit());`, 'main.cjs');
await bundle(`import { contextBridge, ipcRenderer } from 'electron'; import { createOpenhiatusApi } from ${quote('src/shared/ipc/client.ts')};
contextBridge.exposeInMainWorld('openhiatus', createOpenhiatusApi({ invoke: (method,args) => ipcRenderer.invoke('check',method,args), subscribe: () => () => {}, publishActivityPresence: () => {} }));`, 'preload.cjs');
await bundle(`import React, {useState} from 'react'; import {createRoot} from 'react-dom/client'; import {AutostartCard} from ${quote('src/renderer/features/settings/autostart-card.tsx')};
import ${quote('src/renderer/styles.css')}; import ${quote('src/renderer/features/settings/index.css')};
function Check(){const [error,setError]=useState('');return <div style={{padding:24,width:'100%'}}><AutostartCard active={true} onError={e=>setError(e.message)}/><p id="error">{error}</p></div>}
createRoot(document.getElementById('root')).render(<Check/>);`, 'renderer.js', 'browser', 'tsx');
await writeFile(path.join(directory, 'index.html'), '<!doctype html><html lang="de"><head><meta charset="UTF-8"><link rel="stylesheet" href="renderer.css"></head><body><div id="root"></div><script src="renderer.js"></script></body></html>');
let instance;
try {
  const helperOptions = { executablePath: electronExe, args: [directory], env };
  instance = await electron.launch(helperOptions); let page = await instance.firstWindow();
  const checkbox = () => page.getByRole('checkbox', { name: /^Mit Windows starten/ });
  await expect(checkbox()).toBeEnabled(); await expect(checkbox()).not.toBeChecked();
  assert.equal(registry('query', keys[0]).status, 1, 'opening settings must not write a login item');
  await checkbox().click(); await expect(checkbox()).toBeChecked(); await expect(checkbox()).toBeEnabled();
  await expect(page.locator('#error')).toBeEmpty();
  const entry = await instance.evaluate(({ app }, name) => app.getLoginItemSettings({ path: process.execPath, args: ['--autostart'] }).launchItems.find(item => item.name === name), name);
  assert.equal(entry.enabled, true); assert.equal(entry.scope, 'user');
  assert.equal(entry.path.toLowerCase(), electronExe.toLowerCase());
  const command = registry('query', keys[0]); assert.equal(command.status, 0);
  assert.ok(command.stdout.includes(electronExe)); assert.match(command.stdout, /--autostart\s*$/);
  assert.doesNotMatch(command.stdout, /--inspect|--remote-debugging|--data-dir/);
  await instance.close(); instance = undefined;
  instance = await electron.launch(helperOptions); page = await instance.firstWindow();
  await expect(checkbox()).toBeChecked();
  await instance.evaluate(({ app }, name) => app.setLoginItemSettings({ name, path: process.execPath, args: ['--autostart'], openAtLogin: true, enabled: false }), name);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(checkbox()).not.toBeChecked(); await expect(page.getByRole('status')).toContainText('In Windows deaktiviert');
  await checkbox().click(); await expect(checkbox()).toBeChecked(); await expect(checkbox()).toBeEnabled();
  await page.screenshot({ path: 'artifacts/openhiatus-autostart.png' });
  await checkbox().click(); await expect(checkbox()).not.toBeChecked(); await expect(checkbox()).toBeEnabled();
  assert.equal(registry('query', keys[0]).status, 1, 'turning off removes the test Run value');
  await instance.close(); instance = undefined;

  // The unmodified app gets a separate profile and cannot alter the user's real login item.
  const fixture = process.env.OPENHIATUS_TEST_APP ? undefined : await createUiAppFixture('autostart-build');
  const profile = path.join(directory, 'app-profile');
  const executablePath = process.env.OPENHIATUS_TEST_APP || electronExe;
  const args = [...(fixture ? [fixture.appDirectory] : []), `--data-dir=${profile}`];
  const options = { executablePath, args, env };
  instance = await electron.launch(options); page = await instance.firstWindow();
  let main = await instance.browserWindow(page);
  assert.equal(await main.evaluate(w => w.isMinimized()), false);
  await page.getByRole('button', { name: 'Verstanden, Vollzugriff bestätigen', exact: true }).click();
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.getByRole('tab', { name: 'Bedienung', exact: true }).click();
  await expect(checkbox()).toBeDisabled();
  assert.equal((await page.evaluate(() => window.openhiatus.autostartSettings())).available, false);
  assert.equal(await page.evaluate(async () => { try { await window.openhiatus.setAutostart(true); return false; } catch { return true; } }), true);
  await instance.close(); instance = undefined;
  instance = await electron.launch({ ...options, args: [...args, '--autostart'] }); page = await instance.firstWindow(); main = await instance.browserWindow(page);
  await expect.poll(() => main.evaluate(w => w.isMinimized())).toBe(true);
  const handle = await main.evaluate(w => w.getNativeWindowHandle().readBigUInt64LE().toString());
  assert.equal(execFileSync(windowProbe, [handle], { windowsHide: true, encoding: 'utf8' }).trim(), 'True,True,False,True',
    'native window must be visible, minimized, a normal taskbar window and unowned');
  assert.equal(await main.evaluate(w => w.isFocused()), false);
  const state = await page.evaluate(() => window.openhiatus.snapshot());
  assert.equal(state.desktopControl, 'free'); assert.equal(state.messages.length, 0); assert.equal(state.jobs.length, 0);
  const second = async extra => {
    const child = spawn(executablePath, [...args, ...extra], { env, windowsHide: true, stdio: 'ignore' });
    const timer = setTimeout(() => child.kill(), 10000);
    try { assert.equal(await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); }), 0); }
    finally { clearTimeout(timer); }
  };
  await second(['--autostart']); assert.equal(await main.evaluate(w => w.isMinimized()), true);
  await second([]); await expect.poll(() => main.evaluate(w => w.isMinimized())).toBe(false);
  assert.equal(await main.evaluate(w => w.isVisible()), true);
  const proof = { status: 'passed', checks: ['real Windows login registration under a unique test name', 'actual settings component and typed IPC', 'no write on opening', 'enable and disable', 'state survives restart', 'external Windows disable and explicit reenable', 'only the executable and --autostart are registered', 'development/separate profiles cannot modify personal autostart', 'actual production entry starts minimized in taskbar', 'no automatic task or desktop takeover', 'duplicate autostart does not restore window', 'manual second launch restores window'], limitation: 'Windows registration and launch behavior are tested without signing the user out or rebooting.' };
  await writeFile('artifacts/openhiatus-autostart.json', JSON.stringify(proof, null, 2)); console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  if (instance) console.error(await instance.evaluate(async ({ app, BrowserWindow }, name) => {
    const state = app.getLoginItemSettings({ path: process.execPath, args: ['--autostart'] });
    return { openAtLogin: state.openAtLogin, willLaunch: state.executableWillLaunchAtLogin,
      own: state.launchItems.filter(item => item.name === name).map(item => ({ ...item, path: item.path === process.execPath ? 'matches-executable' : JSON.stringify(item.path) })),
      errors: await Promise.all(BrowserWindow.getAllWindows().map(w => w.webContents.executeJavaScript('document.getElementById("error")?.textContent'))) };
  }, name).catch(() => 'Diagnostic unavailable'));
  throw error;
} finally {
  try { if (instance) await instance.close(); }
  finally {
    // Only this unique test name is removed, including Windows' approval metadata.
    for (const key of keys) { if (registry('query', key).status === 0) assert.equal(registry('delete', key).status, 0); assert.equal(registry('query', key).status, 1); }
  }
}
