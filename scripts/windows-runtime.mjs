import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Official Microsoft redistributable, verified before extracting any content.
// No system-wide installation, elevation, or DLL copied from the build machine.
export const runtimeVersion = '14.44.35211.0';
const digest = 'cc0ff0eb1dc3f5188ae6300faef32bf5beeba4bdd6e8e445a9184072096b713b';
const url = 'https://download.visualstudio.microsoft.com/download/pr/990c720a-46ce-4dc7-87b9-c2eb615d34b9/CC0FF0EB1DC3F5188AE6300FAEF32BF5BEEBA4BDD6E8E445A9184072096B713B/VC_redist.x64.exe';
export const runtimeFiles = {
  'vcruntime140.dll': 'd5e4d9a3e835fa679450145d6a7d94e36573a509317111904d9b3712c30d9066',
};
const sha256 = data => createHash('sha256').update(data).digest('hex');

export async function copyWindowsRuntime(output) {
  const directory = path.resolve('.tmp/build-tools', `vc-runtime-${runtimeVersion}`);
  await mkdir(directory, { recursive: true });
  const downloaded = path.join(directory, 'VC_redist.x64.exe');
  let data;
  try { data = await readFile(downloaded); } catch {
    const response = await fetch(url);
    if (!response.ok) throw Error(`Microsoft runtime download failed (${response.status}).`);
    data = Buffer.from(await response.arrayBuffer());
  }
  if (sha256(data) !== digest) throw Error('Microsoft runtime checksum does not match the pinned release.');
  await writeFile(downloaded, data);
  const expand = path.join(process.env.SystemRoot || 'C:/Windows', 'System32/expand.exe');
  // CAB offsets and member names belong to the exact hash-pinned Burn bundle.
  // expand only extracts archives; the redistributable installer is never run.
  for (const [offset, name, member] of [[479744, 'license.cab', 'u4'], [686152, 'payload.cab', 'a12']]) {
    if (data.toString('ascii', offset, offset + 4) !== 'MSCF') throw Error('Invalid runtime cabinet.');
    const cabinet = path.join(directory, name);
    await writeFile(cabinet, data.subarray(offset, offset + data.readUInt32LE(offset + 8)));
    execFileSync(expand, [cabinet, `-F:${member}`, directory], { windowsHide: true, stdio: 'pipe' });
  }
  for (const [name, hash] of Object.entries(runtimeFiles)) {
    execFileSync(expand, [path.join(directory, 'a12'), `-F:${name}_amd64`, directory], { windowsHide: true, stdio: 'pipe' });
    const file = path.join(directory, `${name}_amd64`);
    if (sha256(await readFile(file)) !== hash) throw Error(`Invalid Microsoft runtime file: ${name}`);
    await copyFile(file, path.join(output, name));
    // Node loads native addons with an altered DLL search path. Keep the runtime
    // next to that addon too; an EXE-adjacent DLL alone can fall back to System32.
    await copyFile(file, path.join(output, 'resources/app/node_modules/@ubjs/node-win32-x64-msvc', name));
  }
  await copyFile(path.join(directory, 'u4'), path.join(output, 'LICENSE.vc-runtime.rtf'));
}
