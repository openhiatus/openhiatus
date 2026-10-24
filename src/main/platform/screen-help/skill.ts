import { constants } from 'node:fs';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Seed only a missing file. User edits are authoritative and never upgraded by overwriting. */
export async function installHelpSkill(home: string, source: string): Promise<string> {
  const directory = join(home, 'skills', 'bildschirmhilfe');
  await mkdir(directory, { recursive: true }); const file = join(directory, 'SKILL.md');
  try { await copyFile(source, file, constants.COPYFILE_EXCL); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  return file;
}
export async function readHelpSkill(file: string): Promise<string> {
  const bytes = await readFile(file); if (bytes.length > 16000) throw Error('Der Hilfe-Skill ist zu groß (maximal 16 kB).');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!/^---\r?\n[\s\S]*?\bname:\s*bildschirmhilfe\s*\r?\n[\s\S]*?---\r?\n/.test(text)) throw Error('Der Hilfe-Skill benötigt gültige Metadaten und den Namen bildschirmhilfe.');
  return text;
}
