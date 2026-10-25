import { Monitor, Square } from 'lucide-react';
import type { Snapshot } from '../../shared/contracts';
import { desktopControlCopy } from '../../shared/desktop-control';

export function DesktopControlNotice({ state, onStop }: { state?: Snapshot; onStop(): void | Promise<void> }) {
  const phase = state?.desktopControl ?? 'free';
  const active = phase !== 'free';
  const background = [state?.task.status, state?.summary?.status, ...(state?.jobs ?? []).map(job => job.status)]
    .some(status => status === 'running' || status === 'queued' || status === 'stopping');
  if (!active && !background) return null;
  return <section className={`desktop-control-notice ${active ? 'reserved' : 'background'} ${phase}`} role="status" aria-live={active ? 'assertive' : 'polite'}>
    <Monitor size={22} aria-hidden="true" />
    <div><strong>{active ? desktopControlCopy[phase].title : 'Hintergrundarbeit · Arbeitsplatz frei'}</strong>
      <span>{active ? desktopControlCopy[phase].detail : 'Maus und Tastatur bleiben für dich verfügbar.'}</span></div>
    {active && <button onClick={() => void onStop()}><Square size={13} fill="currentColor" /> Stopp &amp; übernehmen <kbd>Esc</kbd></button>}
  </section>;
}
