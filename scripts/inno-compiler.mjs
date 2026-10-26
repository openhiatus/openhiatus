import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const version = '7.1.0';
const digest = '0362a383ed217d4c4239b5933866dd96d3eb2102737da92f80f6057a4b40df2f';
const url = `https://github.com/jrsoftware/issrc/releases/download/is-7_1_0/innosetup-${version}-x64.exe`;
export async function run(file, args, options = {}) {
  const child = spawn(file, args, { windowsHide: true, stdio: 'inherit', ...options });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  if (code !== 0) throw Error(`${path.basename(file)} exited with code ${code}.`);
}
/** Official, hash-pinned compiler in portable mode: no global install, file associations or shortcuts. */
export async function innoCompiler() {
  if (process.platform !== 'win32') throw Error('Building the Windows installer requires Windows.');
  if (process.env.OPENHIATUS_ISCC) { await access(process.env.OPENHIATUS_ISCC); return path.resolve(process.env.OPENHIATUS_ISCC); }
  const directory = path.resolve(`.tmp/build-tools/inno-${version}`), compiler = path.join(directory, 'ISCC.exe');
  try { await access(compiler); return compiler; } catch { /* Bootstrap once. */ }
  await mkdir(directory, { recursive: true });
  const downloaded = path.join(directory, `innosetup-${version}-x64.exe`);
  let data;
  try { data = await readFile(downloaded); } catch {
    const response = await fetch(url); if (!response.ok) throw Error(`Inno Setup download failed (${response.status}).`);
    data = Buffer.from(await response.arrayBuffer());
  }
  if (createHash('sha256').update(data).digest('hex') !== digest) throw Error('Inno Setup download checksum does not match the pinned release.');
  await writeFile(downloaded, data);
  await run(downloaded, ['/PORTABLE=1', '/CURRENTUSER', '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/NOICONS', `/DIR=${directory}`]);
  await access(compiler); return compiler;
}
