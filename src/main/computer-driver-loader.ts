import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Native DLL loading needs real filesystem paths, including the SDK's own resolver. */
export async function loadComputerDriver(): Promise<typeof import('@trycua/cua-driver')> {
  const resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resources) {
    const entry = path.join(resources, 'app.asar.unpacked', 'node_modules', '@trycua', 'cua-driver', 'dist', 'index.js');
    if (existsSync(entry)) return import(pathToFileURL(entry).href);
  }
  return import('@trycua/cua-driver');
}
