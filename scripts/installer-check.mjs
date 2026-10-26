import { _electron as electron } from '@playwright/test';
import { access, copyFile, mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { buildInstaller } from './installer.mjs';
import { run } from './inno-compiler.mjs';
import { inspectInstaller } from './installer-ui-check.mjs';
import { checkPackagedRuntime } from './package-runtime-check.mjs';

await mkdir('.test-data', { recursive: true }); await mkdir('artifacts', { recursive: true });
const directory = await mkdtemp(path.resolve('.test-data/installer-'));
const id = `openhiatus.installer.test.${path.basename(directory)}`, name = `openHiatus Setup Test ${path.basename(directory)}`;
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const installDirectory = path.join(directory, 'Programme ä', 'openHiatus'), profile = path.join(directory, 'Profil ä');
const manualProfile = path.join(directory, 'Erster Start');
const executable = path.join(installDirectory, 'openHiatus.exe');
const waitScript = path.join(directory, 'wait-for-app-exit.ps1');
await writeFile(waitScript, `param([string]$Executable)
$deadline = [DateTime]::UtcNow.AddSeconds(15)
while ([DateTime]::UtcNow -lt $deadline) {
  try { $stream = [IO.File]::Open($Executable, 'Open', 'ReadWrite', 'None'); $stream.Dispose(); exit 0 }
  catch { Start-Sleep -Milliseconds 100 }
}
throw 'The owned test application did not release its executable.'
`);
const waitForAppExit = () => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', waitScript, '-Executable', executable]);
const closeLaunchedAppScript = path.join(directory, 'close-finished-app.ps1');
await writeFile(closeLaunchedAppScript, `param([string]$Executable,[string]$Profile)
$deadline = [DateTime]::UtcNow.AddSeconds(30)
while ([DateTime]::UtcNow -lt $deadline) {
  $owned = @(Get-CimInstance Win32_Process -Filter "Name='openHiatus.exe'" | Where-Object { $_.ExecutablePath -eq $Executable -and $_.CommandLine.Contains('--data-dir="' + $Profile + '"') -and !$_.CommandLine.Contains('--type=') })
  if ($owned.Count -gt 1) { throw 'Ambiguous test app process.' }
  if ($owned.Count -eq 1) {
    $process = Get-Process -Id $owned[0].ProcessId
    if ($process.MainWindowHandle -ne 0 -and (Test-Path -LiteralPath (Join-Path $Profile 'Arbeitsbereich'))) {
      if (!$process.CloseMainWindow()) { throw 'Owned test app refused the close request.' }
      if (!$process.WaitForExit(15000)) { throw 'Owned test app did not finish closing.' }
      Write-Output 'Finish launched the installed application with the isolated profile.'
      exit 0
    }
  }
  Start-Sleep -Milliseconds 100
}
throw 'Finish did not launch the installed application with its isolated profile.'
`);
const reg = path.join(process.env.SystemRoot || 'C:/Windows', 'System32/reg.exe');
const uninstallKey = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${id}_is1`;
const languageKey = `HKCU\\Software\\${id}`;
const runKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const approvedKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';
const query = (key, value) => spawnSync(reg, ['query', key, ...(value ? ['/v', value] : []), '/reg:64'], { windowsHide: true, encoding: 'utf8' });
// reg.exe uses the console code page; read Unicode string values through .NET.
const readRegistryString = (key, value) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
  `[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); [Microsoft.Win32.Registry]::GetValue('${key.replace('HKCU', 'HKEY_CURRENT_USER')}', '${value}', '')`],
  { windowsHide: true, encoding: 'utf8' }).trim();
const registeredUninstaller = () => {
  const file = /^"([^"]+)"$/.exec(readRegistryString(uninstallKey, 'UninstallString'))?.[1];
  assert.ok(file && path.dirname(file).toLowerCase() === installDirectory.toLowerCase() && /^unins\d+\.exe$/.test(path.basename(file)), 'uninstaller must belong to the test installation');
  return file;
};
for (const [key, value] of [[uninstallKey], [languageKey], [runKey, id], [approvedKey, id]]) assert.equal(query(key, value).status, 1);
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
for (const key of Object.keys(env)) if (key.toLowerCase() === 'path' || /^(?:OPENAI|ANTHROPIC|GEMINI|GOOGLE|OPENROUTER|XAI)_API_KEY$/.test(key)) delete env[key];
env.PATH = [env.SystemRoot || 'C:\\Windows', path.join(env.SystemRoot || 'C:\\Windows', 'System32')].join(';');
let instance, holding;
let operation = 0;
async function setup(file, extra = []) {
  const args = ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', `/DIR=${installDirectory}`, '/TASKS=desktopicon', `/LOG=${path.join(directory, `setup-${++operation}.log`)}`, ...extra];
  const child = spawn(file, args, { windowsHide: true, stdio: 'ignore' });
  return await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
}
const exists = async file => { try { await access(file); return true; } catch { return false; } };
const legacy = path.join(directory, 'legacy-package');
await mkdir(path.join(legacy, 'resources/app'), { recursive: true }); await mkdir(path.join(legacy, 'resources/native'), { recursive: true });
await writeFile(path.join(legacy, 'resources/app/package.json'), JSON.stringify({ name: manifest.name, version: manifest.version }));
const stub = path.join(directory, 'synthetic-old-app.cs');
await writeFile(stub, 'using System;class SyntheticInstallerApp{static void Main(string[] args){if(args.Length>0)System.Threading.Thread.Sleep(System.Threading.Timeout.Infinite);}}');
execFileSync(path.join(process.env.WINDIR || 'C:/Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'), ['/nologo', '/target:winexe', `/out:${path.join(legacy, 'openHiatus.exe')}`, stub], { windowsHide: true });
await copyFile(path.join(legacy, 'openHiatus.exe'), path.join(legacy, 'resources/native/openhiatus-input-guard.exe'));
await writeFile(path.join(legacy, 'obsolete-owned.txt'), 'synthetic former application asset');
const config = { appId: id, displayName: name, autostartName: id, outputDirectory: path.join(directory, 'setups') };
for (const options of [
  { testProfileDirectory: manualProfile },
  { appId: id, testProfileDirectory: path.resolve('not-test-data') },
  { appId: id, testProfileDirectory: path.resolve('.test-data') },
]) await assert.rejects(buildInstaller(options), /isolated test installer/);
const older = await buildInstaller({ ...config, packageDirectory: legacy, version: '0.0.0', suffix: '-old-fixture' });
const current = await buildInstaller({ ...config, suffix: '-test', testProfileDirectory: manualProfile });
assert.ok((await readFile(current)).includes(Buffer.from('level="asInvoker"')), 'installer must not request elevation');
const installedManifest = path.join(installDirectory, '.openhiatus-install-files.txt');
let uninstaller;
try {
  // The tiny package exercises every actual Setup-to-profile language mapping.
  for (const [language, expected] of [['english', 'en'], ['spanish', 'es'], ['french', 'fr'], ['german', 'de'],
    ['chinesesimp', 'zh-CN'], ['japanese', 'ja'], ['brazilianportuguese', 'pt-BR']]) {
    assert.equal(await setup(older, [`/LANG=${language}`]), 0);
    assert.equal(readRegistryString(languageKey, 'InstallerLanguage'), expected);
    assert.equal(await setup(registeredUninstaller()), 0);
    assert.equal(query(languageKey).status, 1, 'uninstall cleans only the test language registration');
  }
  // One continuous path: real wizard installation, installed app, first-run setup and first reply.
  await inspectInstaller(current, name, directory, { installDirectory });
  assert.equal(await exists(executable), true);
  assert.equal(readRegistryString(languageKey, 'InstallerLanguage'), 'de');
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', closeLaunchedAppScript, '-Executable', executable, '-Profile', manualProfile]);
  await waitForAppExit();
  await run(process.execPath, [path.resolve('scripts/onboarding-ui-check.mjs')], { env: { ...env, OPENHIATUS_TEST_APP: executable, OPENHIATUS_TEST_PROFILE: manualProfile } });
  await waitForAppExit();
  // Archive only the owned synthetic test profile, leaving a fresh start for the user.
  const archivedProfile = path.join(directory, 'Automatischer Einrichtungsnachweis');
  for (const target of [manualProfile, archivedProfile]) assert.ok(path.resolve(target).startsWith(path.resolve('.test-data') + path.sep));
  await rename(manualProfile, archivedProfile);
  assert.equal(await setup(registeredUninstaller()), 0);
  assert.equal(query(uninstallKey).status, 1);
  assert.equal(await setup(older), 0);
  assert.equal(query(uninstallKey).status, 0); assert.equal(query(uninstallKey.replace('HKCU', 'HKLM')).status, 1);
  uninstaller = registeredUninstaller();
  holding = spawn(executable, ['hold'], { windowsHide: true, stdio: 'ignore' });
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.notEqual(await setup(current), 0, 'update must not kill a running app');
  assert.equal(holding.exitCode, null); assert.equal(await exists(path.join(installDirectory, 'obsolete-owned.txt')), true);
  assert.notEqual(await setup(uninstaller), 0, 'uninstall must also wait for the app to close');
  holding.kill(); await new Promise(resolve => holding.once('close', resolve)); holding = undefined;

  await mkdir(profile, { recursive: true }); const personal = path.join(profile, 'Meine Notizen.txt');
  await writeFile(personal, 'Synthetic personal data must survive setup and uninstall.');
  const unknown = path.join(installDirectory, 'user-added.txt'); await writeFile(unknown, 'Not an installed application file.');
  // A corrupt previous manifest must never escape the install directory or follow a junction.
  const outside = path.join(directory, 'outside'); await mkdir(outside); const sentinel = path.join(outside, 'keep.txt'); await writeFile(sentinel, 'keep');
  const { symlink } = await import('node:fs/promises'); await symlink(outside, path.join(installDirectory, 'junction'), 'junction');
  await writeFile(installedManifest, (await readFile(installedManifest, 'utf8')) + '..\\outside\\keep.txt\r\n' + sentinel + '\r\njunction\\keep.txt\r\n', { flag: 'r+' });
  const command = `"${executable}" --autostart`;
  await run(reg, ['add', runKey, '/v', id, '/t', 'REG_SZ', '/d', command, '/f', '/reg:64']);
  await run(reg, ['add', approvedKey, '/v', id, '/t', 'REG_BINARY', '/d', '030000000000000000000000', '/f', '/reg:64']);
  const approval = query(approvedKey, id).stdout;
  assert.equal(await setup(current), 0);
  assert.equal(await exists(path.join(installDirectory, 'obsolete-owned.txt')), false);
  assert.equal(await readFile(unknown, 'utf8'), 'Not an installed application file.'); assert.equal(await readFile(sentinel, 'utf8'), 'keep');
  assert.equal(readRegistryString(runKey, id), command); assert.equal(query(approvedKey, id).stdout, approval, 'update must preserve Windows-disabled autostart');
  assert.notEqual(await setup(older), 0, 'an older Setup must not downgrade the installed version');
  assert.ok(query(uninstallKey, 'DisplayVersion').stdout.includes(manifest.version));

  const inspectLinks = path.join(directory, 'links.ps1');
  await writeFile(inspectLinks, `param([string]$Name)\n[Console]::OutputEncoding = [Text.UTF8Encoding]::new()\n$ws = New-Object -ComObject WScript.Shell\n$paths = @((Join-Path ([Environment]::GetFolderPath('Programs')) ($Name + '.lnk')), (Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) ($Name + '.lnk')))\n$result = foreach ($p in $paths) { if (!(Test-Path -LiteralPath $p)) { throw 'Missing test shortcut' }; $l = $ws.CreateShortcut($p); @{ path=$p; target=$l.TargetPath; workdir=$l.WorkingDirectory; arguments=$l.Arguments } }\nConvertTo-Json -InputObject @($result) -Compress\n`);
  const links = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', inspectLinks, '-Name', name], { windowsHide: true, encoding: 'utf8' }));
  assert.equal(links.length, 2); for (const link of links) { assert.equal(link.target.toLowerCase(), executable.toLowerCase()); assert.equal(link.workdir.toLowerCase(), installDirectory.toLowerCase()); assert.equal(link.arguments, `--data-dir="${manualProfile}"`); }

  const launch = { executablePath: executable, args: [`--data-dir=${profile}`], env };
  instance = await electron.launch(launch); let page = await instance.firstWindow();
  await page.getByRole('button', { name: 'Verstanden, Vollzugriff bestätigen', exact: true }).click();
  await page.evaluate(() => window.openhiatus.savePreferences({ activityOverlaySize: 188, uiLanguage: 'ja' }));
  await instance.close(); instance = undefined;
  await waitForAppExit();
  const stateBefore = await readFile(path.join(profile, 'state.json'), 'utf8');
  assert.equal(await setup(current, ['/LANG=french']), 0); assert.equal(await readFile(path.join(profile, 'state.json'), 'utf8'), stateBefore);
  assert.equal(readRegistryString(languageKey, 'InstallerLanguage'), 'fr');
  instance = await electron.launch(launch); page = await instance.firstWindow();
  assert.equal((await page.evaluate(() => window.openhiatus.snapshot())).preferences.activityOverlaySize, 188);
  assert.equal((await page.evaluate(() => window.openhiatus.snapshot())).preferences.uiLanguage, 'ja', 'Setup language cannot overwrite an existing app choice');
  assert.equal(await page.getByRole('button', { name: 'Verstanden, Vollzugriff bestätigen', exact: true }).count(), 0);
  await instance.close(); instance = undefined;
  // Use the installed, unmodified application with no global Node or Codex on its PATH.
  await checkPackagedRuntime(installDirectory);
  for (const check of ['scripts/installation-recovery-check.mjs', 'scripts/ui-workflow-check.mjs', 'scripts/desktop-control-ui-check.mjs']) await run(process.execPath, [path.resolve(check)], { env: { ...env, OPENHIATUS_TEST_APP: executable } });
  // Electron closes its test connection before every child has released its image.
  await waitForAppExit();
  assert.equal(await setup(registeredUninstaller()), 0);
  assert.equal(query(uninstallKey).status, 1); assert.equal(query(runKey, id).status, 1); assert.equal(query(approvedKey, id).status, 1);
  for (const link of links) assert.equal(await exists(link.path), false);
  assert.equal(await exists(executable), false); assert.equal(await readFile(personal, 'utf8'), 'Synthetic personal data must survive setup and uninstall.');
  assert.equal(await readFile(unknown, 'utf8'), 'Not an installed application file.'); assert.equal(await readFile(sentinel, 'utf8'), 'keep');

  assert.equal(await setup(current, ['/TASKS=']), 0, 'clean install must work without a previous registration');
  assert.equal(await exists(links[0].path), true); assert.equal(await exists(links[1].path), false, 'desktop shortcut is optional');
  assert.equal(query(runKey, id).status, 1, 'installation must not opt into autostart');
  await run(reg, ['add', runKey, '/v', id, '/t', 'REG_SZ', '/d', '"C:\\Synthetic Other Copy\\openHiatus.exe" --autostart', '/f', '/reg:64']);
  assert.equal(await setup(registeredUninstaller()), 0); assert.equal(query(runKey, id).status, 0, 'uninstall must not remove another copy\'s autostart');
  const evidence = { status: 'passed', version: manifest.version, checks: ['asInvoker per-user installation', 'Start menu and optional Desktop shortcuts target installed executable', 'upgrade from synthetic older installation', 'running application blocks update and uninstall without being killed', 'downgrade rejected', 'obsolete owned files removed', 'unknown files, personal profile and Windows-disabled autostart preserved', 'corrupt manifest cannot escape or follow a junction', 'installed UI persists settings', 'installed real dialog/worker and native desktop workflows without global Node/Codex', 'uninstall removes owned shortcuts, registration, program and matching autostart', 'personal files survive uninstall', 'clean reinstall with no desktop shortcut', 'another copy\'s autostart is retained'], limitation: 'Tested locally in isolated folders and registrations; not a clean Windows VM or a signed distribution.' };
  await inspectInstaller(current, name, directory); evidence.checks.push('seven actual wizard languages: welcome, optional Desktop icon, direct Install and Cancel', 'all seven registry language mappings and uninstall cleanup', 'updates preserve a different saved app language');
  evidence.checks.push('real wizard Install and Finish buttons complete installation', 'installed app first-run setup: consent, account, optional voice, first answer, failures, Escape, restart and resume', 'test installer launches and shortcuts use only a separate test profile');
  assert.equal(await exists(manualProfile), false, 'a fresh profile remains available for the subsequent hands-on test');
  const manualInstallDirectory = path.join(directory, 'Manueller Test', 'openHiatus');
  assert.equal(await exists(manualInstallDirectory), false);
  await writeFile('artifacts/openhiatus-installation-handson.json', JSON.stringify({ version: manifest.version, setup: current, name, id, directory, installDirectory: manualInstallDirectory, executable: path.join(manualInstallDirectory, 'openHiatus.exe'), profile: manualProfile }, null, 2));
  await writeFile('artifacts/openhiatus-installer.json', JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  console.error('Installer lifecycle check failed:', error);
  throw error;
} finally {
  if (instance) await instance.close(); if (holding) holding.kill();
  if (query(uninstallKey).status === 0) {
    if (await exists(executable)) await waitForAppExit();
    await setup(registeredUninstaller());
  }
  for (const key of [runKey, approvedKey]) if (query(key, id).status === 0) await run(reg, ['delete', key, '/v', id, '/f', '/reg:64']);
  assert.equal(query(uninstallKey).status, 1, 'test uninstall registration must be cleaned');
  assert.equal(query(languageKey).status, 1, 'test language registration must be cleaned');
}
