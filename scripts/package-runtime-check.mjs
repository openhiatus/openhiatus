import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { checkWindowsPackageDependencies } from './windows-package-dependencies.mjs';

/** Initialize the actual shipped DLLs with the shipped Electron/Node executable. */
export async function checkPackagedRuntime(directory) {
  const dependencies = await checkWindowsPackageDependencies(directory);
  await mkdir('.test-data', { recursive: true });
  const profile = await mkdtemp(path.resolve('.test-data/native-runtime-'));
  const windows = process.env.SystemRoot || 'C:/Windows';
  const env = { SystemRoot: windows, WINDIR: windows, PATH: `${windows};${path.join(windows, 'System32')}`,
    TEMP: profile, TMP: profile, USERPROFILE: profile, APPDATA: profile, LOCALAPPDATA: profile, ELECTRON_RUN_AS_NODE: '1' };
  const child = spawn(path.join(directory, 'openHiatus.exe'), ['--input-type=module', '-e',
    `await import('@trycua/cua-driver'); await import('@ubjs/node'); console.log('native-ready'); process.stdin.resume(); process.stdin.once('data', () => process.exit(0));`],
  { cwd: path.join(directory, 'resources/app'), env, windowsHide: true, stdio: 'pipe' });
  let timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(Error('Packaged native runtime did not initialize.')), 20000);
      let output = '';
      child.once('error', reject); child.once('exit', code => reject(Error(`Packaged native runtime exited before ready (${code}).`)));
      child.stderr.on('data', data => { output += data; });
      child.stdout.on('data', data => { if (data.toString().includes('native-ready')) resolve(); });
      child.once('close', () => { if (output) console.error(output.slice(0, 2000)); });
    });
    clearTimeout(timer);
    const command = `[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); (Get-Process -Id ${child.pid}).Modules | Where-Object { $_.ModuleName -ieq 'vcruntime140.dll' } | ForEach-Object { $_.FileName }`;
    const loaded = execFileSync(path.join(windows, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, encoding: 'utf8' }).trim();
    assert.equal(loaded.toLowerCase(), path.join(directory, 'resources/app/node_modules/@ubjs/node-win32-x64-msvc/vcruntime140.dll').toLowerCase(), 'The native addon must load the shipped DLL, not a global developer prerequisite.');
    return { dependencies, appLocalRuntimeLoaded: true };
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null) {
      const ended = new Promise(resolve => child.once('exit', resolve)); child.stdin.end('\n');
      const killTimer = setTimeout(() => child.kill(), 2000);
      await ended; clearTimeout(killTimer);
    }
  }
}
