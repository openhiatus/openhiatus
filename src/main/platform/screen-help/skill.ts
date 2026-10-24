import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

// Only the byte-known, unedited 0.0.16 factory instruction may be upgraded.
const LEGACY_FACTORY_SHA256 = '27bf393e296435a5d973cdc6efeb19e7f74a238b9d9a2b3f8ef233fe14df7f29';
const digest = (text: string) => createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex');

/** Seed missing instructions or upgrade a known unedited factory copy; preserve every user edit. */
export async function installHelpSkill(home: string, source: string): Promise<string> {
  const directory = join(home, 'skills', 'bildschirmhilfe');
  await mkdir(directory, { recursive: true }); const file = join(directory, 'SKILL.md');
  try { await copyFile(source, file, constants.COPYFILE_EXCL); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16000) return file;
    const before = await readFile(file, 'utf8');
    if (digest(before) !== LEGACY_FACTORY_SHA256) return file;
    const updated = await readFile(source, 'utf8'); if (updated === before) return file;
    try { await copyFile(file, join(directory, 'SKILL.factory-0.0.16.md'), constants.COPYFILE_EXCL); }
    catch (backupError) { if ((backupError as NodeJS.ErrnoException).code !== 'EEXIST') throw backupError; }
    const temporary = join(directory, `.skill-update-${randomUUID()}.tmp`);
    await writeFile(temporary, updated, { encoding: 'utf8', flag: 'wx' });
    try { if (await readFile(file, 'utf8') === before) await rename(temporary, file); }
    finally { try { await unlink(temporary); } catch (cleanupError) { if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') throw cleanupError; } }
  }
  return file;
}
export async function readHelpSkill(file: string): Promise<string> {
  const bytes = await readFile(file); if (bytes.length > 16000) throw Error('Der Hilfe-Skill ist zu groß (maximal 16 kB).');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!/^---\r?\n[\s\S]*?\bname:\s*bildschirmhilfe\s*\r?\n[\s\S]*?---\r?\n/.test(text)) throw Error('Der Hilfe-Skill benötigt gültige Metadaten und den Namen bildschirmhilfe.');
  return text;
}
