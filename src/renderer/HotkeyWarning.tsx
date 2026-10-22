import { CircleHelp } from 'lucide-react';
import type { Snapshot } from '../shared/contracts';

export function HotkeyWarning({ hotkeys }: { hotkeys?: Snapshot['hotkeys'] }) {
  if (!hotkeys) return null;
  const blocked = [hotkeys.recording === false ? 'F8' : '', hotkeys.submit === false ? 'F9' : '', hotkeys.stop === false ? 'Strg + Alt + F12' : ''].filter(Boolean);
  if (!blocked.length) return null;
  const speechBlocked = hotkeys.recording === false || hotkeys.submit === false;
  return <div className="hotkey-warning" role="alert"><CircleHelp size={18} /><div><strong>{blocked.join(' · ')} {blocked.length === 1 ? 'ist systemweit nicht verfügbar' : 'sind systemweit nicht verfügbar'}.</strong><p>Möglicherweise belegt ein anderes Programm die Tasten. Beende bei Bedarf die andere Anwendung und starte openHiatus neu. {speechBlocked ? 'Sprechen und Senden funktionieren über die Schaltflächen im Fenster. ' : ''}{hotkeys.stop === false ? 'Mit Stopp oder Esc im openHiatus-Fenster kannst du Aufträge beenden.' : ''}</p></div></div>;
}
