import { useEffect, useRef, useState } from 'react';
import { Monitor, Square, X } from 'lucide-react';
import type { ComputerFrame } from '../shared/contracts';

/** Render the image payloads themselves; CSS scaling never changes their screen coordinates. */
export function ComputerFrameContent({ frame }: { frame: ComputerFrame }) {
  const observation = frame.observation;
  if (!observation) return <figure className="computer-preview-view computer-preview-legacy">
    <figcaption><h3>Vollbild</h3><p>{frame.width} × {frame.height} Bildpixel · Vollbildaufnahme</p></figcaption>
    <div className="computer-view-image" style={{ width: frame.width }}><img src={frame.dataUrl} width={frame.width} height={frame.height}
      alt="Letzte von openHiatus verwendete Vollbildaufnahme" /></div>
  </figure>;
  const detail = observation.views.find(view => view.kind === 'detail');
  return <div className="computer-preview-content">
    <p className="computer-preview-geometry">Bildschirm: {observation.screenWidth} × {observation.screenHeight} Pixel · Windows-Skalierungsfaktor: {observation.scaleFactor} · Übersicht: 1:{observation.overviewScaleDivisor}</p>
    <ol className="computer-preview-views" aria-label="Bereitgestellte Modellbilder in Reihenfolge">
      {observation.views.map(view => <li key={view.viewId}><figure className={`computer-preview-view computer-preview-${view.kind}`}>
        <figcaption><h3>{view.kind === 'overview' ? (observation.overviewScaleDivisor === 1 ? 'Vollbild in Originalauflösung' : 'Übersicht')
          : (view.imageWidth === view.sourceRect.width && view.imageHeight === view.sourceRect.height ? 'Detail in Originalauflösung' : `Detail 1:${observation.detailScaleDivisor}`)}</h3>
          <p><code>{view.viewId}</code> · {view.imageWidth} × {view.imageHeight} Bildpixel</p>
          <p>Bildkoordinaten: (0, 0) bis ({view.imageWidth - 1}, {view.imageHeight - 1})</p>
          <p>Bildschirmursprung: ({view.sourceRect.x}, {view.sourceRect.y}) · Quellgröße: {view.sourceRect.width} × {view.sourceRect.height} Pixel</p>
        </figcaption>
        <div className="computer-view-image" style={{ width: view.imageWidth }}>
          <img src={view.dataUrl} width={view.imageWidth} height={view.imageHeight}
            alt={view.kind === 'overview' ? (observation.overviewScaleDivisor === 1 ? 'Zuletzt bereitgestellte Vollbildaufnahme in Originalauflösung' : 'Zuletzt bereitgestellte Bildschirmübersicht') : `Zuletzt bereitgestellter Detailausschnitt ab Bildschirmposition ${view.sourceRect.x}, ${view.sourceRect.y}`} />
          {view.kind === 'overview' && detail && <span className="computer-preview-detail-rect" aria-hidden="true" style={{
            left: `${detail.sourceRect.x / observation.screenWidth * 100}%`, top: `${detail.sourceRect.y / observation.screenHeight * 100}%`,
            width: `${detail.sourceRect.width / observation.screenWidth * 100}%`, height: `${detail.sourceRect.height / observation.screenHeight * 100}%`,
          }}><span>Detail</span></span>}
        </div>
      </figure></li>)}
    </ol>
  </div>;
}

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
        <p>{frame ? <time dateTime={frame.at}>{new Date(frame.at).toLocaleTimeString('de-DE')}</time> : 'Kein Bild verfügbar'} · Momentaufnahme, kein Livebild</p></div>
        <div><button className="stop-all" onClick={() => void onStop()}><Square size={12} fill="currentColor" /> Stopp</button>
          <button className="icon-button" aria-label="Bildschirmansicht schließen" onClick={() => setOpen(false)}><X size={18} /></button></div></div>
      {frame && <ComputerFrameContent frame={frame} />}
      <p className="computer-preview-note">Die Vorschau zeigt die zuletzt bereitgestellten Modellbilder. Eine Umrandung in der Übersicht markiert den Detailausschnitt; sie gehört nur zur Vorschau. Die lokale Vorschau bleibt bis zum Schließen von openHiatus erhalten. Dein Modellanbieter kann Bilder im Sitzungsverlauf speichern.</p>
    </dialog>
  </>;
}
