import { mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './inno-compiler.mjs';
export async function inspectInstaller(executable, name, directory) {
  const root = path.resolve('.test-data') + path.sep;
  if (!path.resolve(executable).startsWith(root) || !path.resolve(directory).startsWith(root) || !name.startsWith('openHiatus Setup Test ')) throw Error('UI check requires an isolated test installer.');
  const framework = path.join(process.env.WINDIR || 'C:/Windows', 'Microsoft.NET/Framework64/v4.0.30319');
  const probe = path.join(directory, 'installer-ui.exe');
  execFileSync(path.join(framework, 'csc.exe'), ['/nologo', '/target:exe', '/reference:System.Drawing.dll',
    ...['UIAutomationClient.dll', 'UIAutomationTypes.dll', 'WindowsBase.dll'].map(file => `/reference:${path.join(framework, 'WPF', file)}`),
    `/out:${probe}`, path.resolve('tests/fixtures/installer-ui.cs')], { windowsHide: true, stdio: 'inherit' });
  await mkdir('artifacts', { recursive: true });
  await run(probe, [path.resolve(executable), name, path.resolve('artifacts')]);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await inspectInstaller(process.argv[2], process.argv[3], process.argv[4]);
