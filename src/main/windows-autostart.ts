import type { App } from 'electron';
import type { AutostartSettings } from '../shared/autostart';

export const AUTOSTART_ARGUMENT = '--autostart';
export const AUTOSTART_NAME = 'openHiatus';
type LoginItems = Pick<App, 'getLoginItemSettings' | 'setLoginItemSettings'>;

export function autostartUnavailableReason(platform: string, packaged: boolean, separateProfile: boolean): string | undefined {
  if (platform !== 'win32') return 'Autostart ist nur unter Windows verfügbar.';
  if (!packaged) return 'Autostart ist im Windows-Paket verfügbar. Starte dafür openHiatus.exe.';
  if (separateProfile) return 'Ein separates Datenverzeichnis verändert den Windows-Autostart nicht. Öffne das Paket ohne separates Profil.';
}

/** Reads Windows every time. Merely opening the app never enables or rewrites a login item. */
export class WindowsAutostart {
  constructor(private readonly options: { app: LoginItems; executable: string; unavailableReason?: string; name?: string }) {}
  read(): AutostartSettings {
    const { app, executable, unavailableReason } = this.options;
    if (unavailableReason) return { available: false, enabled: false, disabledByWindows: false, unavailableReason };
    try {
      const settings = app.getLoginItemSettings({ path: executable });
      // launchItems reports Windows approval for the owned Run value. Its args may
      // omit command-line switches on Windows, so they are not an enabled-state test.
      const item = settings.launchItems.find(item => item.name === (this.options.name ?? AUTOSTART_NAME) && item.scope === 'user'
        && item.path.toLowerCase() === executable.toLowerCase());
      return { available: true, enabled: Boolean(item?.enabled), disabledByWindows: Boolean(item && !item.enabled) };
    } catch { throw Error('Der Windows-Autostart konnte nicht gelesen werden. Bitte erneut versuchen.'); }
  }
  set(enabled: boolean): AutostartSettings {
    if (typeof enabled !== 'boolean') throw Error('Ungültige Autostart-Einstellung.');
    if (this.options.unavailableReason) throw Error(this.options.unavailableReason);
    try {
      this.options.app.setLoginItemSettings({ name: this.options.name ?? AUTOSTART_NAME, path: this.options.executable,
        args: [AUTOSTART_ARGUMENT], openAtLogin: enabled, ...(enabled ? { enabled: true } : {}) });
    } catch { throw Error('Der Windows-Autostart konnte nicht geändert werden. Bitte erneut versuchen.'); }
    const actual = this.read();
    if (actual.enabled !== enabled || (!enabled && actual.disabledByWindows)) {
      throw Error('Windows hat die Autostart-Änderung nicht bestätigt. Bitte die Autostart-Apps in den Windows-Einstellungen prüfen.');
    }
    return actual;
  }
}
