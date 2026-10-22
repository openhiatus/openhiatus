import { build as bundle } from 'esbuild';
import { build as renderer } from 'vite';
import { mkdir, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
await mkdir('dist', { recursive: true });
await mkdir('dist/native', { recursive: true });
execFileSync(path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
  ['/nologo', '/target:exe', `/out:${path.resolve('dist/native/openhiatus-process-host.exe')}`, path.resolve('src/main/openhiatus-process-host.cs')], { windowsHide: true, stdio: 'inherit' });
execFileSync(path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
  ['/nologo', '/target:exe', `/out:${path.resolve('dist/native/openhiatus-hotkeys.exe')}`, path.resolve('src/main/openhiatus-hotkeys.cs')], { windowsHide: true, stdio: 'inherit' });
await bundle({ entryPoints: ['src/main/main.ts'], bundle: true, platform: 'node', target: 'node24', format: 'cjs', external: ['electron', '@trycua/cua-driver', '@earendil-works/*'], outfile: 'dist/main.cjs', sourcemap: true });
await bundle({ entryPoints: ['src/main/agent-host.ts'], bundle: true, platform: 'node', target: 'node24', format: 'esm', external: ['@earendil-works/*', '@trycua/cua-driver'], outfile: 'dist/agent-host.mjs', sourcemap: true });
await bundle({ entryPoints: ['src/main/state-worker.ts'], bundle: true, platform: 'node', target: 'node24', format: 'cjs', outfile: 'dist/state-worker.cjs', sourcemap: true });
await bundle({ entryPoints: ['src/main/memory-worker.ts'], bundle: true, platform: 'node', target: 'node24', format: 'cjs', outfile: 'dist/memory-worker.cjs', sourcemap: true });
await bundle({ entryPoints: ['src/main/preload.ts'], bundle: true, platform: 'node', target: 'node24', format: 'cjs', external: ['electron'], outfile: 'dist/preload.cjs' });
await renderer({ base: './', build: { outDir: 'dist/renderer', emptyOutDir: true }, esbuild: { jsx: 'automatic' } });
await mkdir('dist/demo', { recursive: true });
await copyFile('demo/projektnotizen.md', 'dist/demo/projektnotizen.md');
