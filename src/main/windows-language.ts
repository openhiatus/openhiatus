import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { parseUiLanguage, resolveUiLanguage, type UiLanguage } from '../shared/ui-language';

/** Installer language only seeds a new normal profile; saved app choices always win. */
export function initialUiLanguage(osLocale: string, readInstaller: () => string = () => execFileSync(
  path.join(process.env.SystemRoot || 'C:/Windows', 'System32/reg.exe'),
  ['query', 'HKCU\\Software\\openhiatus.desktop', '/v', 'InstallerLanguage', '/reg:64'],
  { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
)): UiLanguage {
  try { const value = /InstallerLanguage\s+REG_SZ\s+(\S+)/.exec(readInstaller())?.[1]; if (value) return parseUiLanguage(value); }
  catch { /* No Setup registration, or a value from an unsupported future version. */ }
  return resolveUiLanguage(osLocale);
}
