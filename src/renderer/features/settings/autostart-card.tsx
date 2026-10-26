import { t } from '../../../shared/i18n';
import { useEffect, useRef, useState } from 'react';
import { Power } from 'lucide-react';
import type { AutostartSettings } from '../../../shared/autostart';

export function AutostartCard({ active, onError }: { active: boolean; onError(error: unknown): void }) {
  const [settings, setSettings] = useState<AutostartSettings>();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const changing = useRef(false), request = useRef(0), report = useRef(onError);
  report.current = onError;
  async function refresh() {
    if (changing.current) return;
    const current = ++request.current;
    try {
      const state = await window.openhiatus.autostartSettings();
      if (current === request.current) { setSettings(state); setFailed(false); }
    } catch (error) {
      if (current === request.current) { setFailed(true); report.current(error); }
    }
  }
  useEffect(() => {
    if (!active) return;
    void refresh(); window.addEventListener('focus', refresh);
    return () => { request.current++; window.removeEventListener('focus', refresh); };
  }, [active]);
  async function change(enabled: boolean) {
    if (changing.current) return;
    changing.current = true; request.current++; setPending(true);
    try { setSettings(await window.openhiatus.setAutostart(enabled)); setFailed(false); }
    catch (error) { report.current(error); }
    finally { changing.current = false; setPending(false); await refresh(); }
  }
  return <section className="settings-card settings-autostart" aria-busy={pending}>
    <div className="settings-card-head"><span className="service-icon"><Power size={22} aria-hidden="true" /></span><div><h2>{t("Windows-Autostart")}</h2><p>{t("Nach der Anmeldung für dich bereit")}</p></div></div>
    <label className="settings-toggle"><span><strong>{t("Mit Windows starten")}</strong><small>{t("Startet openHiatus nach deiner Anmeldung minimiert in der Taskleiste.")}</small></span>
      <input type="checkbox" checked={settings?.enabled === true} disabled={!settings?.available || pending || failed} onChange={event => void change(event.target.checked)} /></label>
    <p className="billing-note" role="status">{failed ? t("Autostart-Status konnte nicht gelesen werden.") : !settings ? t("Autostart-Status wird geladen …") : pending ? t("Windows-Autostart wird geändert …")
      : !settings.available ? t(settings.unavailableReason ?? "") : settings.disabledByWindows ? t("In Windows deaktiviert. Einschalten aktiviert den Autostart wieder.")
        : settings.enabled ? t("Autostart ist eingeschaltet. Ein Klick auf das Taskleistensymbol öffnet das Fenster.") : t("Autostart ist ausgeschaltet.")}</p>
    {failed && <button className="text-button" onClick={() => void refresh()}>{t("Erneut prüfen")}</button>}
    {settings?.available && <p className="billing-note">{t("Lass den App-Ordner an seinem Platz. Nach einem Verschieben oder Wechsel des Pakets hier erneut einschalten. Mikrofon und Aufträge starten erst durch deine Eingabe.")}</p>}
  </section>;
}
