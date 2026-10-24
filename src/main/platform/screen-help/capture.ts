import { desktopCapturer, screen } from 'electron';
import type { HelpCapture } from './service';

/** Screen-only Electron capture. No mouse, keyboard, window activation or CUA action capability. */
export async function captureHelpScreen(stamp: () => Promise<string>, signal: AbortSignal): Promise<HelpCapture> {
  const before = await stamp(); signal.throwIfAborted(); const display = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(display.size.width * display.scaleFactor), height: Math.round(display.size.height * display.scaleFactor) }, fetchWindowIcons: false });
  signal.throwIfAborted();
  const source = sources.find(s => s.display_id === String(display.id));
  if (!source || source.thumbnail.isEmpty()) throw Error('Bildschirmaufnahme nicht verfügbar.');
  const size = source.thumbnail.getSize(1), afterDisplay = screen.getPrimaryDisplay();
  if (String(afterDisplay.id) !== String(display.id) || JSON.stringify(afterDisplay.bounds) !== JSON.stringify(display.bounds) || afterDisplay.scaleFactor !== display.scaleFactor
    || await stamp() !== before) throw Error('Bildschirm wurde während der Aufnahme geändert. Bitte erneut beobachten.');
  signal.throwIfAborted();
  return { png: source.thumbnail.toPNG({ scaleFactor: 1 }).toString('base64'), ...size, stamp: before, displayId: String(display.id), bounds: { ...display.bounds } };
}
