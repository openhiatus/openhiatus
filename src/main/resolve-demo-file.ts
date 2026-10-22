import path from 'node:path';
import { realpath, stat } from 'node:fs/promises';

/** Resolve existing result files, including links, before allowing an Explorer reveal. */
export async function resolveDemoFile(workspace: string, input: string, additionalRoots: string[] = [], fullAccess = false): Promise<string> {
  if (!input || input.length > 4096 || /[\x00-\x1f]/.test(input)) throw new Error('Ungültiger Dateiverweis.');
  let target = input.trim();
  if (/^\/[A-Za-z]:[\\/]/.test(target)) target = target.slice(1);
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(target) && !/^[A-Za-z]:[\\/]/.test(target)) throw new Error('Dieser Verweis ist keine Datei in einem freigegebenen Ordner.');
  try {
    const resolved = await realpath(path.resolve(workspace, target));
    let allowed = fullAccess;
    for (const directory of [workspace, ...additionalRoots]) {
      const root = await realpath(directory).catch(() => undefined);
      if (!root) continue;
      const relative = path.relative(root, resolved);
      if (relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) allowed = true;
    }
    if (!allowed || !(await stat(resolved)).isFile()) throw new Error('outside');
    return resolved;
  } catch { throw new Error('Die Datei ist nicht vorhanden oder liegt außerhalb der freigegebenen Ordner.'); }
}
