import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { innoCompiler, run } from './inno-compiler.mjs';

export async function buildInstaller({ packageDirectory, outputDirectory, appId = 'openhiatus.desktop', displayName = 'openHiatus', autostartName = 'openHiatus', version, suffix = '' } = {}) {
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  version ??= manifest.version;
  if (!/^\d+\.\d+\.\d+$/.test(version) || !/^[\w.-]+$/.test(appId) || /["\r\n{}]/.test(displayName + autostartName + suffix)) throw Error('Invalid installer identity.');
  packageDirectory = path.resolve(packageDirectory ?? path.join('release', manifest.version, `${manifest.productName}-win32-x64`));
  outputDirectory = path.resolve(outputDirectory ?? path.join('release', manifest.version, 'installer'));
  const packaged = JSON.parse(await readFile(path.join(packageDirectory, 'resources/app/package.json'), 'utf8'));
  if (packaged.name !== manifest.name || packaged.version !== manifest.version) throw Error('Build the matching Windows package before creating Setup.');
  const files = [];
  async function inventory(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (entry.isSymbolicLink()) throw Error('Installer input cannot contain symbolic links.');
      if (entry.isDirectory()) await inventory(path.join(directory, entry.name), relative + '\\'); else files.push(relative);
    }
  }
  await inventory(packageDirectory); files.sort();
  if (!files.includes('openHiatus.exe') || !files.includes('resources\\native\\openhiatus-input-guard.exe')) throw Error('Incomplete Windows package.');
  await mkdir(outputDirectory, { recursive: true });
  const manifestFile = path.join(outputDirectory, 'installed-files.txt');
  await writeFile(manifestFile, '\ufeff# openhiatus:' + appId + '\r\n' + files.join('\r\n') + '\r\n', 'utf8');
  const basename = `openHiatus-Setup-${version}-x64${suffix}`;
  await run(await innoCompiler(), ['/Qp', `/DAppVersion=${version}`, `/DSetupAppId=${appId}`, `/DProductName=${displayName}`, `/DAutostartValueName=${autostartName}`,
    `/DPackageDir=${packageDirectory}`, `/DOutputDir=${outputDirectory}`, `/DOutputName=${basename}`, `/DManifestFile=${manifestFile}`, path.resolve('resources/windows-installer.iss')]);
  const executable = path.join(outputDirectory, basename + '.exe');
  const digest = createHash('sha256').update(await readFile(executable)).digest('hex');
  await writeFile(executable + '.sha256', `${digest}  ${path.basename(executable)}\n`, 'utf8');
  console.log(executable); return executable;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildInstaller();
