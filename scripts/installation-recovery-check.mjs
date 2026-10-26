import { _electron as electron, expect } from '@playwright/test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createUiAppFixture } from './helpers/ui-app-fixture.mjs';

await mkdir('.test-data', { recursive: true }); await mkdir('artifacts', { recursive: true });
const directory = await mkdtemp(path.resolve('.test-data/installation-recovery-'));
const fixture = process.env.OPENHIATUS_TEST_APP ? undefined : await createUiAppFixture('installation-recovery');
const lockerSource = path.join(directory, 'hold-file.cs'), lockerExe = path.join(directory, 'hold-file.exe');
await writeFile(lockerSource, `using System;using System.IO;class HoldFile{static void Main(string[] args){using(var held=File.Open(args[0],FileMode.Open,FileAccess.Read,FileShare.Read)){Console.WriteLine("ready");Console.ReadLine();}}}`);
execFileSync(path.join(process.env.SystemRoot || 'C:/Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),
  ['/nologo', '/target:exe', `/out:${lockerExe}`, lockerSource], { windowsHide: true });
const env = { ...process.env }; for (const key of Object.keys(env)) if (key.toLowerCase() === 'path' || key === 'ELECTRON_RUN_AS_NODE' || /_API_KEY$/.test(key)) delete env[key];
env.PATH = [process.env.SystemRoot, path.join(process.env.SystemRoot, 'System32')].join(';');
let instance, locker;
async function releaseLock() {
  if (!locker) return;
  const child = locker; locker = undefined;
  if (child.exitCode !== null) return;
  const closed = new Promise(resolve => child.once('exit', resolve)); child.stdin.end('\n'); await closed;
}
async function lock(profile) {
  locker = spawn(lockerExe, [path.join(profile, 'state.json')], { windowsHide: true, stdio: 'pipe' });
  await new Promise((resolve, reject) => { locker.once('error', reject); locker.once('exit', () => reject(Error('File lock helper exited'))); locker.stdout.once('data', data => data.toString().includes('ready') ? resolve() : reject(Error('No file lock'))); });
}
const scenarios = [];
try {
  for (const mode of ['transient', 'retry', 'force']) {
    const profile = path.join(directory, mode);
    instance = await electron.launch({ executablePath: process.env.OPENHIATUS_TEST_APP || path.resolve('node_modules/electron/dist/electron.exe'),
      args: [...(fixture ? [fixture.appDirectory] : []), `--data-dir=${profile}`], env, timeout: 30000 });
    const page = await instance.firstWindow();
    const consent = page.getByRole('button', { name: 'Verstanden, Vollzugriff bestätigen', exact: true });
    await expect(consent).toBeEnabled({ timeout: 30000 });
    await lock(profile);
    await consent.click();
    if (mode === 'transient') {
      // A scanner holding the old file longer than the former 150ms retry budget.
      await new Promise(resolve => setTimeout(resolve, 500)); await releaseLock();
      await page.evaluate(() => window.openhiatus.acknowledgeFullAccess());
      await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).preferences.fullAccessAcknowledged)).toBe(true);
      await expect(page.locator('.onboarding-error')).toHaveCount(0);
      await instance.close(); instance = undefined; scenarios.push(mode); continue;
    }
    const error = page.locator('.onboarding-error');
    await expect(error).toContainText('Die Bestätigung konnte nicht im lokalen Profil gespeichert werden.');
    await expect(error).toBeFocused();
    await expect(error).toBeInViewport();
    await expect(error.locator('details')).toHaveAttribute('open', '');
    await expect(error).toContainText(/EPERM|EBUSY|EACCES/);
    assert.equal((await page.evaluate(() => window.openhiatus.snapshot())).preferences.fullAccessAcknowledged, false);
    assert.equal(JSON.parse(await readFile(path.join(profile, 'state.json'), 'utf8')).state.preferences.fullAccessAcknowledged, false);
    if (mode === 'retry') {
      await releaseLock(); await consent.click();
      await page.evaluate(() => window.openhiatus.acknowledgeFullAccess());
      await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).preferences.fullAccessAcknowledged)).toBe(true);
      await instance.close(); instance = undefined;
      assert.equal(JSON.parse(await readFile(path.join(profile, 'state.json'), 'utf8')).state.preferences.fullAccessAcknowledged, true);
    } else {
      await page.screenshot({ path: 'artifacts/openhiatus-installation-storage-error.png' });
      // Intercept only the native choice; Main's actual close, controller and disk
      // failure paths stay unchanged. Record options outside the dying process.
      const prompt = path.join(directory, 'close-dialog.json');
      await instance.evaluate(({ dialog }, file) => {
        const fs = process.getBuiltinModule('fs');
        dialog.showMessageBox = async options => { fs.writeFileSync(file, JSON.stringify(options)); return { response: 1, checkboxChecked: false }; };
      }, prompt);
      const child = instance.process();
      const exited = new Promise(resolve => child.once('exit', resolve));
      const main = await instance.browserWindow(page); await main.evaluate(window => { window.close(); });
      let timer; const code = await Promise.race([exited, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('App remained trapped in shutdown')), 15000); })]).finally(() => clearTimeout(timer));
      assert.equal(code, 1); instance = undefined;
      const options = JSON.parse(await readFile(prompt, 'utf8'));
      assert.ok(options.buttons.includes('Trotzdem beenden')); assert.equal(options.defaultId, 0); assert.equal(options.cancelId, 2);
      assert.match(options.detail, /ungespeicherte Änderungen/);
      await releaseLock();
      assert.equal(JSON.parse(await readFile(path.join(profile, 'state.json'), 'utf8')).state.preferences.fullAccessAcknowledged, false);
    }
    scenarios.push(mode);
  }
  const evidence = { status: 'passed', scenarios, checks: ['real Windows sharing lock during full-access confirmation', 'brief scanner-style lock recovers without repeating the action', 'consent stays false after failed durable write', 'visible storage error details', 'retry after releasing lock', 'explicit force exit despite permanently failed write', 'no Node on application PATH', 'isolated synthetic profiles only'] };
  await writeFile('artifacts/openhiatus-installation-recovery.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} catch (error) {
  if (instance) console.error(await instance.windows()[0]?.locator('body').innerText().catch(() => 'Renderer unavailable'));
  throw error;
} finally {
  await releaseLock(); if (instance) {
    // Failed test teardown must not get stuck on the very dialog under test.
    await instance.evaluate(({ app }) => app.exit(97)).catch(() => {});
    await instance.close().catch(() => {});
  }
}
