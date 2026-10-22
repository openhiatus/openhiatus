import { ShieldCheck } from 'lucide-react';

export function FullAccessNotice({ acknowledged, busy, onAcknowledge }: { acknowledged: boolean; busy: boolean; onAcknowledge(): void }) {
  if (acknowledged) return <span className="full-access-badge" title="openHiatus arbeitet mit den Rechten deines Windows-Benutzerkontos."><ShieldCheck size={14} /> Vollzugriff</span>;
  return <section className="full-access-notice" aria-labelledby="full-access-title"><ShieldCheck size={22} /><div><h2 id="full-access-title">openHiatus arbeitet mit Vollzugriff</h2><p>openHiatus kann Dateien lesen und ändern, Programme und Befehle ausführen, das Netzwerk nutzen und deinen Desktop bedienen. Dabei gelten die Rechte deines Windows-Benutzerkontos. Beauftragte Inhalte und Bildschirmaufnahmen können an deine gewählten Modellanbieter gesendet werden.</p><p>Mit Stopp, Esc oder Strg + Alt + F12 kannst du laufende openHiatus-Aufträge beenden.</p><button className="primary-button" disabled={busy} onClick={onAcknowledge}>Verstanden, Vollzugriff bestätigen</button></div></section>;
}
