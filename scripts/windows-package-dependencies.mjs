import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { runtimeFiles } from './windows-runtime.mjs';

/** Read PE import and delay-import tables; no native executable is loaded. */
export function peImports(bytes) {
  if (bytes.toString('ascii', 0, 2) !== 'MZ') throw Error('Expected a Windows PE binary.');
  const pe = bytes.readUInt32LE(60);
  if (bytes.toString('ascii', pe, pe + 4) !== 'PE\0\0') throw Error('Invalid PE header.');
  const sectionCount = bytes.readUInt16LE(pe + 6), optionalSize = bytes.readUInt16LE(pe + 20), optional = pe + 24;
  const directories = optional + (bytes.readUInt16LE(optional) === 0x20b ? 112 : 96);
  const offset = rva => {
    for (let i = 0; i < sectionCount; i++) {
      const section = optional + optionalSize + i * 40, base = bytes.readUInt32LE(section + 12);
      const size = Math.max(bytes.readUInt32LE(section + 8), bytes.readUInt32LE(section + 16));
      if (rva >= base && rva < base + size) return bytes.readUInt32LE(section + 20) + rva - base;
    }
    throw Error('PE import address is outside its sections.');
  };
  const imports = new Set();
  for (const [index, stride, nameOffset] of [[1, 20, 12], [13, 32, 4]]) {
    const rva = bytes.readUInt32LE(directories + index * 8); if (!rva) continue;
    for (let entry = offset(rva); bytes.readUInt32LE(entry + nameOffset); entry += stride) {
      const start = offset(bytes.readUInt32LE(entry + nameOffset)), end = bytes.indexOf(0, start);
      if (end < start || end - start > 256) throw Error('Invalid PE dependency name.');
      imports.add(bytes.toString('ascii', start, end).toLowerCase());
    }
  }
  return [...imports];
}

export async function checkWindowsPackageDependencies(directory) {
  const dependencies = [];
  async function visit(root) {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const file = path.join(root, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (/\.(?:exe|dll|node)$/i.test(file)) {
        const bytes = await readFile(file);
        // Some SDKs publish their macOS/Linux prebuilds in the same package.
        if (file.endsWith('.node') && ['7f454c46', 'cffaedfe', 'cefaedfe', 'cafebabe'].includes(bytes.subarray(0, 4).toString('hex'))) continue;
        if (bytes.toString('ascii', 0, 2) !== 'MZ') throw Error(`Invalid Windows binary: ${path.relative(directory, file)}`);
        for (const dependency of peImports(bytes)) {
          if (/^(?:vcruntime|msvcp|concrt)\d.*\.dll$/.test(dependency)) {
            if (!Object.hasOwn(runtimeFiles, dependency)) throw Error(`Unbundled C++ runtime ${dependency} required by ${path.relative(directory, file)}.`);
            dependencies.push({ file: path.relative(directory, file), dependency });
          }
        }
      }
    }
  }
  await visit(directory);
  for (const [name, digest] of Object.entries(runtimeFiles)) {
    const locations = new Set([path.join(directory, name), ...dependencies.filter(item => item.dependency === name).map(item => path.join(directory, path.dirname(item.file), name))]);
    for (const file of locations) {
      const actual = createHash('sha256').update(await readFile(file)).digest('hex');
      if (actual !== digest) throw Error(`Missing or invalid app-local runtime: ${path.relative(directory, file)}`);
    }
  }
  await readFile(path.join(directory, 'LICENSE.vc-runtime.rtf'));
  return dependencies;
}
