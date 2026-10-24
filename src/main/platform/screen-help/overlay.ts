import type { BrowserWindow, Rectangle } from 'electron';
import { guidanceGeometry, SCREEN_HELP_COLORS, type ScreenHelpColor } from '../../../shared/screen-help';
import type { ComputerRect, ComputerSize } from '../../../shared/computer-views';

type HintWindow = Pick<BrowserWindow, 'loadURL' | 'webContents' | 'isDestroyed' | 'hide' | 'destroy' | 'setBounds' | 'showInactive'>;
const document = `<!doctype html><html lang="de"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'"><style>
:root{--hint-color:#ef2525;--hint-halo:#fff}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;pointer-events:none}svg{width:100%;height:100%;overflow:hidden}circle,.arrow{fill:none;stroke:var(--hint-color);stroke-width:7;stroke-linecap:round;stroke-linejoin:round}.outline{stroke:var(--hint-halo);stroke-width:12}text{font:700 17px 'Segoe UI',sans-serif;fill:var(--hint-color);paint-order:stroke;stroke:var(--hint-halo);stroke-width:5;stroke-linejoin:round}marker path{fill:var(--hint-color);stroke:var(--hint-halo);stroke-width:.7}
</style></head><body><svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Hinweis auf das gesuchte Bedienelement"><defs><marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z"/></marker></defs><circle id="target-outline" class="outline"/><path class="arrow outline" id="arrow-outline"/><circle id="target"/><path class="arrow" id="arrow" marker-end="url(#arrowhead)"/><text id="label"/></svg></body></html>`;

/** Own window; no app API, preload, input handlers or focus acquisition. */
export class GuidanceOverlay {
  private window?: HintWindow; private loaded?: Promise<void>; private revision = 0; private timer?: ReturnType<typeof setTimeout>; private disposed = false;
  constructor(private readonly createWindow: () => HintWindow) {}
  clear(): void { this.revision++; clearTimeout(this.timer); this.timer = undefined; if (this.window && !this.window.isDestroyed()) this.window.hide(); }
  async show(rect: ComputerRect, image: ComputerSize, bounds: Rectangle, label: string, color: ScreenHelpColor = 'red'): Promise<void> {
    this.clear(); if (this.disposed) throw Error('Bildschirmhilfe wird beendet.');
    const revision = this.revision, geometry = guidanceGeometry(rect, image, bounds), palette = SCREEN_HELP_COLORS[color];
    if (!palette) throw Error('Ungültige Hinweisfarbe.');
    if (!this.window || this.window.isDestroyed()) { this.window = this.createWindow(); this.loaded = this.window.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(document)}`); }
    const window = this.window; await this.loaded;
    if (this.disposed || revision !== this.revision || window.isDestroyed()) throw Error('Hinweis wurde verworfen.');
    window.setBounds(bounds);
    await window.webContents.executeJavaScript(`(() => {const g=${JSON.stringify(geometry)},p=${JSON.stringify(palette)};document.documentElement.style.setProperty('--hint-color',p.stroke);document.documentElement.style.setProperty('--hint-halo',p.halo);for(const id of ['target','target-outline']){const c=document.getElementById(id);c.setAttribute('cx',g.cx);c.setAttribute('cy',g.cy);c.setAttribute('r',g.radius);}for(const id of ['arrow','arrow-outline'])document.getElementById(id).setAttribute('d','M '+g.arrowX+' '+g.arrowY+' L '+g.tipX+' '+g.tipY);const t=document.getElementById('label');t.setAttribute('x',g.labelX);t.setAttribute('y',g.labelY);t.textContent=${JSON.stringify(label).replace(/</g, '\\u003c')};})()`);
    if (this.disposed || revision !== this.revision || window.isDestroyed()) throw Error('Hinweis wurde verworfen.');
    window.showInactive(); this.timer = setTimeout(() => this.clear(), 30000); this.timer.unref?.();
  }
  dispose(): void { this.clear(); this.disposed = true; if (this.window && !this.window.isDestroyed()) this.window.destroy(); }
}
