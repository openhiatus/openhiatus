import { APP_DISPLAY_NAME } from '../shared/branding';
import type { BrowserWindow, Rectangle } from 'electron';
import type { VoiceOverlayState } from '../shared/contracts';

const phases = new Set(['idle', 'opening', 'recording', 'transcribing', 'ready', 'sending', 'sent', 'error']);
const emptyState: VoiceOverlayState = { phase: 'idle', text: '', detail: '', canSend: false };

export function parseVoiceOverlayState(value: unknown): VoiceOverlayState | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const state = value as Record<string, unknown>;
  if (Object.keys(state).length !== 4 || Object.keys(state).some(key => !['phase', 'text', 'detail', 'canSend'].includes(key))
    || typeof state.phase !== 'string' || !phases.has(state.phase)
    || typeof state.text !== 'string' || state.text.length > 12000
    || typeof state.detail !== 'string' || state.detail.length > 500
    || typeof state.canSend !== 'boolean') return;
  return { phase: state.phase as VoiceOverlayState['phase'], text: state.text, detail: state.detail, canSend: state.canSend };
}

const document = `<!doctype html><html lang="de"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'">
<style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#16201c;color:#edf7f0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
body{border:1px solid #42594b;border-radius:14px;padding:18px 20px;display:flex;flex-direction:column;gap:9px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px}strong{font-size:16px}#phase{font-size:12px;color:#bbddc4}
#detail{margin:0;font-size:13px;color:#b9c9bf;min-height:18px;white-space:pre-wrap;overflow:hidden;max-height:38px}
#text{margin:0;font-size:15px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere;overflow:hidden;flex:1;min-height:0}
#notice{margin:0;font-size:11px;color:#f3d392}footer{border-top:1px solid #35463c;padding-top:10px;font-size:11px;color:#c6d3cb}
#send{color:#9defb0}#send[aria-disabled="true"]{color:#9baaa1}#notice[hidden]{display:none}
</style></head><body><header><strong>${APP_DISPLAY_NAME} · Sprache</strong><span id="phase"></span></header><p id="detail"></p><p id="text"></p><p id="notice" hidden>Langer Entwurf: Im ${APP_DISPLAY_NAME}-Fenster vollständig lesen und bearbeiten.</p><footer><span id="send">F9 senden</span> · F8 sprechen · Strg+Alt+F12 Stopp</footer></body></html>`;

type OverlayWindow = Pick<BrowserWindow, 'isDestroyed' | 'hide' | 'destroy' | 'loadURL' | 'setBounds' | 'showInactive' | 'webContents'>;
interface Options {
  createWindow(): OverlayWindow;
  bounds(): Rectangle;
  canShow(): boolean;
}

/** Transient, display-only UI. It has no preload, Node access, IPC, or keyboard focus. */
export class VoiceOverlay {
  private window?: OverlayWindow;
  private loaded?: Promise<void>;
  private state: VoiceOverlayState = emptyState;
  private armed = false;
  private disposed = false;
  private revision = 0;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(private readonly options: Options) {}

  arm(): void {
    if (this.disposed || !this.options.canShow()) { this.hide(); return; }
    this.armed = true;
    this.render();
  }

  update(state: VoiceOverlayState): void {
    const changed = JSON.stringify(state) !== JSON.stringify(this.state);
    this.state = state;
    if (state.phase === 'idle') { this.hide(); return; }
    if (this.armed && changed) this.render();
  }

  hide(): void {
    this.armed = false;
    this.revision++;
    this.clearTimer();
    if (this.window && !this.window.isDestroyed()) this.window.hide();
  }

  stop(): void {
    this.state = emptyState;
    this.hide();
    // Destruction also clears the last transcript from the overlay's renderer.
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = undefined;
    this.loaded = undefined;
  }

  dispose(): void { this.disposed = true; this.stop(); }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private render(): void {
    const revision = ++this.revision;
    this.clearTimer();
    if (this.state.phase === 'idle' || !this.armed || this.disposed || !this.options.canShow()) return;
    if (!this.window || this.window.isDestroyed()) {
      this.window = this.options.createWindow();
      this.loaded = this.window.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(document)}`);
    }
    const overlay = this.window;
    const state = this.state;
    // JSON is inserted only as a JS value. User text reaches the page exclusively
    // through textContent; markup, handlers and URLs cannot be created from it.
    const payload = JSON.stringify(state).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    void this.loaded!.then(async () => {
      if (!this.current(revision, overlay)) return;
      overlay.setBounds(this.options.bounds());
      await overlay.webContents.executeJavaScript(`(() => {
        const state = ${payload};
        const titles = { opening: 'Mikrofon startet', recording: 'Aufnahme läuft', transcribing: 'Wird transkribiert', ready: 'Zum Senden bereit', sending: 'Wird gesendet', sent: 'Gesendet', error: 'Hinweis' };
        document.getElementById('phase').textContent = titles[state.phase] || '';
        document.getElementById('detail').textContent = state.detail;
        const text = document.getElementById('text');
        text.textContent = state.text;
        document.getElementById('send').setAttribute('aria-disabled', String(!state.canSend));
        const notice = document.getElementById('notice');
        notice.hidden = true;
        notice.hidden = text.scrollHeight <= text.clientHeight;
      })()`);
      if (!this.current(revision, overlay)) return;
      overlay.showInactive();
      const delay = state.phase === 'sent' ? 3000 : ['ready', 'error'].includes(state.phase) ? 12000 : 0;
      if (delay) this.timer = setTimeout(() => { if (revision === this.revision) this.hide(); }, delay);
    }).catch(() => { if (revision === this.revision) this.stop(); });
  }

  private current(revision: number, overlay: OverlayWindow): boolean {
    return revision === this.revision && this.armed && !this.disposed && !overlay.isDestroyed() && this.options.canShow();
  }
}
