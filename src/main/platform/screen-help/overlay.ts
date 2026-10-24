import type { BrowserWindow, Rectangle } from 'electron';
import { guidanceGeometry } from '../../../shared/screen-help';
import type { ComputerRect, ComputerSize } from '../../../shared/computer-views';

type HintWindow = Pick<BrowserWindow, 'loadURL' | 'webContents' | 'isDestroyed' | 'hide' | 'destroy' | 'setBounds' | 'showInactive'>;
const document = `<!doctype html><html lang="de"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'"><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;pointer-events:none}svg{width:100%;height:100%;overflow:hidden}circle,.arrow{fill:none;stroke:#ffd437;stroke-width:4;filter:drop-shadow(0 1px 2px #000)}text{font:600 16px 'Segoe UI',sans-serif;fill:white;paint-order:stroke;stroke:#172015;stroke-width:6;stroke-linejoin:round}marker path{fill:#ffd437}
</style></head><body><svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Hinweis auf das gesuchte Bedienelement"><defs><marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z"/></marker></defs><circle id="target"/><path class="arrow" id="arrow" marker-end="url(#arrowhead)"/><text id="label"/></svg></body></html>`;

/** Own window; no app API, preload, input handlers or focus acquisition. */
export class GuidanceOverlay {
  private window?: HintWindow; private loaded?: Promise<void>; private revision = 0; private timer?: ReturnType<typeof setTimeout>; private disposed = false;
  constructor(private readonly createWindow: () => HintWindow) {}
  clear(): void { this.revision++; clearTimeout(this.timer); this.timer = undefined; if (this.window && !this.window.isDestroyed()) this.window.hide(); }
  async show(rect: ComputerRect, image: ComputerSize, bounds: Rectangle, label: string): Promise<void> {
    this.clear(); if (this.disposed) throw Error('Bildschirmhilfe wird beendet.');
    const revision = this.revision, geometry = guidanceGeometry(rect, image, bounds);
    if (!this.window || this.window.isDestroyed()) { this.window = this.createWindow(); this.loaded = this.window.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(document)}`); }
    const window = this.window; await this.loaded;
    if (this.disposed || revision !== this.revision || window.isDestroyed()) throw Error('Hinweis wurde verworfen.');
    window.setBounds(bounds);
    await window.webContents.executeJavaScript(`(() => {const g=${JSON.stringify(geometry)};const c=document.getElementById('target');c.setAttribute('cx',g.cx);c.setAttribute('cy',g.cy);c.setAttribute('r',g.radius);document.getElementById('arrow').setAttribute('d','M '+g.arrowX+' '+g.arrowY+' L '+g.tipX+' '+g.tipY);const t=document.getElementById('label');t.setAttribute('x',g.labelX);t.setAttribute('y',g.labelY);t.textContent=${JSON.stringify(label).replace(/</g, '\\u003c')};})()`);
    if (this.disposed || revision !== this.revision || window.isDestroyed()) throw Error('Hinweis wurde verworfen.');
    window.showInactive(); this.timer = setTimeout(() => this.clear(), 30000); this.timer.unref?.();
  }
  dispose(): void { this.clear(); this.disposed = true; if (this.window && !this.window.isDestroyed()) this.window.destroy(); }
}
