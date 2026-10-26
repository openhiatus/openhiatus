import { t } from '../shared/i18n';
import { ShieldCheck } from 'lucide-react';

export function FullAccessNotice({ acknowledged, busy, onAcknowledge }: { acknowledged: boolean; busy: boolean; onAcknowledge(): void }) {
  if (acknowledged) return <span className="full-access-badge" title={t("openHiatus arbeitet mit den Rechten deines Windows-Benutzerkontos.")}><ShieldCheck size={14} />{t(" Vollzugriff")}</span>;
  return <section className="full-access-notice" aria-labelledby="full-access-title"><ShieldCheck size={22} /><div><h2 id="full-access-title">{t("openHiatus arbeitet mit Vollzugriff")}</h2><p>{t("openHiatus kann Dateien lesen und ändern, Programme und Befehle ausführen, das Netzwerk nutzen und deinen Desktop bedienen. Dabei gelten die Rechte deines Windows-Benutzerkontos. Beauftragte Inhalte und Bildschirmaufnahmen können an deine gewählten Modellanbieter gesendet werden.")}</p><p>{t("Mit Stopp, Esc oder Strg + Alt + F12 kannst du laufende openHiatus-Aufträge beenden.")}</p><button className="primary-button" disabled={busy} onClick={onAcknowledge}>{t("Verstanden, Vollzugriff bestätigen")}</button></div></section>;
}
