import type { BrowserWindow, Rectangle } from 'electron';
import { desktopControlCopy, type DesktopControlPhase } from '../shared/desktop-control';

type ControlWindow = Pick<BrowserWindow, 'loadURL' | 'webContents' | 'isDestroyed' | 'hide' | 'destroy' | 'setBounds' | 'showInactive'>;
interface Display { id: number; bounds: Rectangle; }
const document = `<!doctype html><html lang="de"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'"><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;font-family:'Segoe UI',system-ui,sans-serif;pointer-events:none;color:#fff5de}
body{--accent:#ffbf47}body[data-phase=error]{--accent:#ff8f87}#frame{position:fixed;inset:0;border:6px solid var(--accent);box-shadow:inset 0 0 0 2px #211b13,inset 0 0 24px #ffbf4722}
#notice{position:absolute;top:20px;left:50%;transform:translateX(-50%);width:calc(100% - 40px);max-width:720px;display:flex;align-items:center;gap:20px;padding:20px 24px;background:#211b13fa;border:2px solid var(--accent);border-radius:16px;box-shadow:0 8px 32px #0008}
#copy{flex:1;min-width:0}.eyebrow{color:var(--accent);font-size:11px;letter-spacing:2px;font-weight:800}h1{margin:5px 0 7px;font-size:25px;line-height:1.15}p{margin:0;color:#e5d9c5;font-size:14px;line-height:1.45}#escape{flex:none;text-align:center;border-left:1px solid #ffbf4740;padding-left:20px}kbd{display:inline-block;border:1px solid #ffe1a3;border-bottom-width:3px;background:#fff3d6;color:#211b13;border-radius:8px;padding:5px 15px;font:bold 25px 'Segoe UI',sans-serif}#escape span{display:block;font-size:12px;font-weight:700;color:#fff3d6;margin-top:7px}body[data-phase=error] #escape{display:none}
@media(max-width:560px){#notice{padding:14px;gap:12px;top:12px;width:calc(100% - 24px)}h1{font-size:19px}p{font-size:12px}#escape{padding-left:12px}kbd{font-size:21px;padding:4px 10px}.eyebrow{font-size:9px;letter-spacing:1px}}
</style></head><body data-phase="preparing"><div id="frame"></div><section id="notice" role="status" aria-live="assertive"><div id="copy"><span class="eyebrow">OPENHIATUS · PC-ÜBERNAHME</span><h1 id="title"></h1><p id="detail"></p></div><div id="escape"><kbd>Esc</kbd><span>Stoppen &amp;<br>übernehmen</span></div></section></body></html>`;

/** Mandatory, passive notice on every display. It never hides around a computer operation. */
export class DesktopControlOverlay {
  private readonly windows = new Map<number, { window: ControlWindow; loaded: Promise<void> }>();
  private phase: DesktopControlPhase = 'free';
  private revision = 0;
  private disposed = false;
  private pending = Promise.resolve();
  constructor(private readonly options: { displays(): Display[]; createWindow(): ControlWindow; afterShow?(): Promise<void> }) {}
  update(phase: DesktopControlPhase): Promise<void> {
    this.phase = phase;
    return this.refresh();
  }
  refresh(): Promise<void> {
    const revision = ++this.revision;
    if (this.disposed || this.phase === 'free') {
      for (const { window } of this.windows.values()) if (!window.isDestroyed()) window.hide();
      this.pending = Promise.resolve(); return this.pending;
    }
    const phase = this.phase, copy = desktopControlCopy[phase], displays = this.options.displays();
    for (const [id, entry] of this.windows) if (!displays.some(display => display.id === id)) {
      if (!entry.window.isDestroyed()) entry.window.destroy(); this.windows.delete(id);
    }
    this.pending = (async () => {
      if (!displays.length) throw Error('Die Übernahmeanzeige benötigt einen verfügbaren Bildschirm.');
      await Promise.all(displays.map(async display => {
        let entry = this.windows.get(display.id);
        if (!entry || entry.window.isDestroyed()) {
          const window = this.options.createWindow();
          entry = { window, loaded: window.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(document)}`) };
          this.windows.set(display.id, entry);
        }
        const { window, loaded } = entry; await loaded;
        if (this.disposed || revision !== this.revision || window.isDestroyed()) return;
        window.setBounds(display.bounds);
        await window.webContents.executeJavaScript(`(() => {document.body.dataset.phase=${JSON.stringify(phase)};document.getElementById('title').textContent=${JSON.stringify(copy.title)};document.getElementById('detail').textContent=${JSON.stringify(copy.detail)};})()`);
        if (!this.disposed && revision === this.revision && !window.isDestroyed()) window.showInactive();
      }));
      // WDA_EXCLUDEFROMCAPTURE is applied by the next Windows desktop composition.
      await (this.options.afterShow?.() ?? new Promise<void>(resolve => setTimeout(resolve, 50)));
    })();
    return this.pending;
  }
  async ready(): Promise<void> {
    for (;;) { const pending = this.pending; await pending; if (pending === this.pending) break; }
    if (this.disposed || this.phase === 'free' || this.phase === 'error') throw Error('Die Desktopübernahme wurde abgebrochen.');
  }
  dispose(): void {
    this.disposed = true; this.revision++;
    for (const { window } of this.windows.values()) if (!window.isDestroyed()) window.destroy();
    this.windows.clear();
  }
}
