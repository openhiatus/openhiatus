import { useEffect, useRef, useState } from 'react';
import { Monitor, Square, X } from 'lucide-react';
import type { ComputerFrame } from '../shared/contracts';

export function ComputerPreview({ enabled, onStop }: { enabled: boolean; onStop(): Promise<void> }) {
  const [frame, setFrame] = useState<ComputerFrame>();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => window.openhiatus.onComputerFrame(setFrame), []);
  useEffect(() => { if (!enabled) { setFrame(undefined); setOpen(false); } }, [enabled]);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return <>
    <button ref={trigger} className={`icon-button computer-preview-trigger ${frame ? 'available' : ''}`} disabled={!frame}
      aria-label="openHiatus’ letzte Bildschirmansicht" title={frame ? 'Letztes Bildschirmbild ansehen' : 'Noch kein Bildschirmbild in dieser Sitzung'}
      onClick={() => setOpen(true)}><Monitor size={18} /></button>
    <dialog ref={dialog} className="computer-preview" aria-labelledby="computer-preview-title"
      onClose={() => { setOpen(false); trigger.current?.focus(); }} onCancel={() => setOpen(false)}>
      <div className="computer-preview-heading"><div><h2 id="computer-preview-title">Was openHiatus zuletzt gesehen hat</h2>
        <p>{frame ? `${new Date(frame.at).toLocaleTimeString('de-DE')} · ${frame.width} × ${frame.height} Pixel` : 'Kein Bild verfügbar'} · Momentaufnahme</p></div>
        <div><button className="stop-all" onClick={() => void onStop()}><Square size={12} fill="currentColor" /> Stopp</button>
          <button className="icon-button" aria-label="Bildschirmansicht schließen" onClick={() => setOpen(false)}><X size={18} /></button></div></div>
      {frame && <img src={frame.dataUrl} alt="Letzte von openHiatus verwendete Bildschirmaufnahme" />}
      <p className="computer-preview-note">Diese Aufnahme wurde von deinem gewählten Arbeitsmodell ausgewertet. Die lokale Vorschau bleibt bis zum Schließen von openHiatus erhalten. Dein Modellanbieter kann Bilder im Sitzungsverlauf speichern.</p>
    </dialog>
  </>;
}
