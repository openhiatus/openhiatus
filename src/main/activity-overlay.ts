import type { BrowserWindow, Rectangle, WebContents } from 'electron';
import type { ActivityPresencePhase } from '../shared/activity-presence';
import { ACTIVITY_OVERLAY_MIN_SIZE, ACTIVITY_OVERLAY_MAX_SIZE, ACTIVITY_OVERLAY_DEFAULT_SIZE } from '../shared/workspace-preferences';

export { ACTIVITY_OVERLAY_MIN_SIZE, ACTIVITY_OVERLAY_MAX_SIZE, ACTIVITY_OVERLAY_DEFAULT_SIZE } from '../shared/workspace-preferences';
export const ACTIVITY_OVERLAY_RESIZE_CHANNEL = 'openhiatus:activity-overlay-resize';

export interface ActivityOverlayState { enabled: boolean; working: boolean; stopping?: boolean; phase?: ActivityPresencePhase; size: number; }
export type ActivityOverlayCommand = { phase: 'hover'; over: boolean }
  | { phase: 'start' | 'move' | 'end' | 'cancel'; pointerId: number; y: number }
  | { phase: 'key'; key: 'ArrowUp' | 'ArrowDown' | 'Home' | 'End' };
type OverlayWindow = Pick<BrowserWindow, 'isDestroyed' | 'hide' | 'destroy' | 'loadURL' | 'setBounds' | 'showInactive' | 'webContents' | 'setIgnoreMouseEvents'>;
export interface ActivityOverlayOptions {
  createWindow(): OverlayWindow;
  workArea(): Rectangle;
  canShow(): boolean;
  onSizeChange(size: number): void | Promise<void>;
  /** Test/native compositor port; production waits two display frames after hide. */
  afterHide?(): Promise<void>;
}
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

export function parseActivityOverlayCommand(value: unknown): ActivityOverlayCommand | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const command = value as Record<string, unknown>;
  if (command.phase === 'hover' && exact(command, ['phase', 'over']) && typeof command.over === 'boolean') return { phase: 'hover', over: command.over };
  if (command.phase === 'key' && exact(command, ['phase', 'key']) && typeof command.key === 'string' && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(command.key)) {
    return { phase: 'key', key: command.key as Extract<ActivityOverlayCommand, { phase: 'key' }>['key'] };
  }
  if (typeof command.phase !== 'string' || !['start', 'move', 'end', 'cancel'].includes(command.phase) || !exact(command, ['phase', 'pointerId', 'y'])
    || !Number.isSafeInteger(command.pointerId) || (command.pointerId as number) < 0 || (command.pointerId as number) > 2147483647
    || typeof command.y !== 'number' || !Number.isFinite(command.y) || Math.abs(command.y) > 100000) return;
  return { phase: command.phase as 'start' | 'move' | 'end' | 'cancel', pointerId: command.pointerId as number, y: command.y };
}

function size(value: number): number {
  return Number.isFinite(value) ? Math.max(ACTIVITY_OVERLAY_MIN_SIZE, Math.min(ACTIVITY_OVERLAY_MAX_SIZE, Math.round(value))) : ACTIVITY_OVERLAY_DEFAULT_SIZE;
}

const status: Record<ActivityPresencePhase, string> = {
  idle: 'Bereit', listening: 'Ich höre zu', transcribing: 'Verstehe', thinking: 'Denke nach', working: 'Arbeitet',
  speaking: 'Ich spreche', ready: 'Bereit', error: 'Hinweis', stopping: 'Stopp'
};
function phase(value: unknown, stopping: boolean): ActivityPresencePhase {
  return typeof value === 'string' && Object.hasOwn(status, value) ? value as ActivityPresencePhase : stopping ? 'stopping' : 'working';
}

/** Electron coordinates are DIP; a small/removed monitor cannot leave the overlay off-screen. */
export function activityOverlayBounds(workArea: Rectangle, requestedSize: number): Rectangle {
  const width = Math.max(1, Math.floor(Number.isFinite(workArea.width) ? workArea.width : 1));
  const height = Math.max(1, Math.floor(Number.isFinite(workArea.height) ? workArea.height : 1));
  const margin = Math.min(12, Math.floor((Math.min(width, height) - 1) / 4));
  const dimension = Math.max(1, Math.min(size(requestedSize), width - margin * 2, height - margin * 2));
  return { x: Math.round((Number.isFinite(workArea.x) ? workArea.x : 0) + width - margin - dimension),
    y: Math.round((Number.isFinite(workArea.y) ? workArea.y : 0) + margin), width: dimension, height: dimension };
}

const document = `<!doctype html><html lang="de"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'">
<style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;color:#dce9cd;font-family:system-ui,"Segoe UI",sans-serif;user-select:none}
body{--tint:176,201,131}body[data-phase=listening]{--tint:135,213,207}body[data-phase=transcribing],body[data-phase=thinking]{--tint:218,201,131}body[data-phase=speaking]{--tint:160,196,235}body[data-phase=error]{--tint:234,148,136}body[data-phase=stopping]{--tint:232,175,119}
#symbol{position:absolute;left:5px;top:5px;width:calc(100% - 25px);aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,rgba(var(--tint),.12),transparent 70%);display:grid;place-items:center}
.core{position:relative;width:78%;aspect-ratio:1;border:1px solid rgba(var(--tint),.6);border-radius:50%;background:radial-gradient(circle at 36% 30%,rgba(var(--tint),.25),#192117f5 70%);box-shadow:0 0 15px rgba(var(--tint),.18);animation:breathe 3.2s ease-in-out infinite;display:grid;place-items:center}
.ring{position:absolute;inset:2%;border:1px solid rgba(var(--tint),.25);border-radius:50%;animation:spin 3.2s linear infinite}.ring:before{content:'';position:absolute;top:-3px;left:50%;width:5px;height:5px;border-radius:50%;background:rgb(var(--tint));box-shadow:0 0 8px rgba(var(--tint),.8)}
svg{width:62%;height:62%;transform:translateY(-14%);fill:none;stroke:rgb(var(--tint));stroke-width:1.8}svg .point{fill:rgb(var(--tint));stroke:none}svg .satellite{fill:#273120}
#status{position:absolute;bottom:13%;left:4%;right:4%;margin:0;text-align:center;font-size:clamp(8px,6vw,12px);font-weight:600;line-height:1.2;white-space:nowrap;text-shadow:0 1px 4px #000}
#resize{position:absolute;right:0;top:25%;bottom:25%;width:16px;display:grid;place-items:center;border:0;background:transparent;cursor:ns-resize;touch-action:none;outline-offset:-3px}
#resize:before{content:'';width:2px;height:100%;max-height:60px;background:rgba(var(--tint),.55);border-radius:2px}
#resize:hover:before,#resize:focus-visible:before,#resize[data-dragging=true]:before{width:3px;background:rgb(var(--tint))}
body[data-phase=listening] .core{animation:listen 1.5s ease-in-out infinite}body[data-phase=speaking] .core{animation:voice .85s ease-in-out infinite}body[data-phase=thinking] .ring,body[data-phase=transcribing] .ring{animation-duration:1.8s}body[data-phase=ready] .ring,body[data-phase=idle] .ring,body[data-phase=error] .ring{animation-play-state:paused}
@keyframes breathe{50%{transform:scale(1.035)}}@keyframes listen{50%{transform:scale(1.055);box-shadow:0 0 20px rgba(var(--tint),.35)}}@keyframes voice{50%{transform:scale(1.045);border-color:rgb(var(--tint))}}@keyframes spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}}
</style></head><body data-phase="working"><div id="symbol"><span class="ring" aria-hidden="true"></span><span class="core"><svg aria-hidden="true" viewBox="0 0 100 100"><ellipse cx="50" cy="50" rx="21" ry="36" transform="rotate(29 50 50)"/><ellipse cx="50" cy="50" rx="21" ry="36" transform="rotate(-29 50 50)"/><circle class="point" cx="50" cy="50" r="3"/><circle class="satellite" cx="75" cy="32" r="4"/></svg><span id="status" role="status" aria-live="polite">Arbeitet</span></span></div><div id="resize" role="slider" aria-orientation="vertical" aria-label="Overlay-Größe" aria-valuemin="96" aria-valuemax="320" aria-valuenow="144" tabindex="0" title="Größe ändern: nach unten größer, nach oben kleiner"></div></body></html>`;

/** A separate, passive background indicator; only its own size handle accepts mouse input. */
export class ActivityOverlay {
  private window?: OverlayWindow;
  private loaded?: Promise<void>;
  private state: ActivityOverlayState = { enabled: false, working: false, size: ACTIVITY_OVERLAY_DEFAULT_SIZE };
  private preferenceSize = ACTIVITY_OVERLAY_DEFAULT_SIZE;
  private localSize = ACTIVITY_OVERLAY_DEFAULT_SIZE;
  private expectedSize?: number;
  private drag?: { pointerId: number; y: number; size: number };
  private hovered = false;
  private visible = false;
  private disposed = false;
  private suspensions = 0;
  private revision = 0;
  private commitRevision = 0;
  private commitTimer?: ReturnType<typeof setTimeout>;
  private hiddenBarrier?: Promise<void>;

  constructor(private readonly options: ActivityOverlayOptions) {}

  update(state: ActivityOverlayState): void {
    if (this.disposed) return;
    const next = { enabled: state.enabled === true, working: state.working === true, stopping: state.stopping === true, phase: phase(state.phase, state.stopping === true), size: size(state.size) };
    const changed = next.enabled !== this.state.enabled || next.working !== this.state.working || next.stopping !== this.state.stopping || next.phase !== this.state.phase || next.size !== this.state.size;
    this.state = next;
    const acknowledged = this.expectedSize === next.size;
    if (acknowledged) this.expectedSize = undefined;
    if (next.size !== this.preferenceSize || acknowledged) {
      this.preferenceSize = next.size;
      if (!this.drag && this.expectedSize === undefined) this.localSize = next.size;
    }
    if (!this.canShow()) this.hide();
    else if (changed || !this.visible) this.render();
  }

  refresh(): void { if (!this.disposed) { if (this.canShow()) this.render(); else this.hide(); } }

  /** The caller releases once its complete capture/input/recovery operation has finished. */
  suspend(): () => void {
    this.suspensions++;
    this.hide();
    let released = false;
    return () => { if (released) return; released = true; this.suspensions = Math.max(0, this.suspensions - 1); if (!this.disposed && this.suspensions === 0) this.refresh(); };
  }

  async runHidden<T>(operation: () => Promise<T>): Promise<T> {
    const wasVisible = this.visible;
    const release = this.suspend();
    try {
      if (wasVisible && !this.hiddenBarrier) {
        const barrier = (async () => { await (this.options.afterHide?.() ?? new Promise<void>(resolve => setTimeout(resolve, 32))); })();
        this.hiddenBarrier = barrier;
        const clear = () => { if (this.hiddenBarrier === barrier) this.hiddenBarrier = undefined; };
        void barrier.then(clear, clear);
      }
      await this.hiddenBarrier;
      return await operation();
    } finally { release(); }
  }

  handleResize(sender: WebContents | unknown, value: unknown): boolean {
    if (!this.window || this.window.isDestroyed() || sender !== this.window.webContents || !this.visible || !this.canShow()) return false;
    const command = parseActivityOverlayCommand(value);
    if (!command) return false;
    if (command.phase === 'hover') { this.hovered = command.over; this.mousePolicy(); return true; }
    if (command.phase === 'key') {
      if (this.drag) return false;
      this.localSize = command.key === 'Home' ? ACTIVITY_OVERLAY_MIN_SIZE : command.key === 'End' ? ACTIVITY_OVERLAY_MAX_SIZE
        : size(this.localSize + (command.key === 'ArrowDown' ? 16 : -16));
      this.render();
      clearTimeout(this.commitTimer); this.commitTimer = setTimeout(() => { this.commitTimer = undefined; this.commitSize(); }, 150);
      return true;
    }
    if (command.phase === 'start') {
      if (this.drag) return false;
      this.drag = { pointerId: command.pointerId, y: command.y, size: this.localSize };
      this.mousePolicy(); this.render(); return true;
    }
    if (!this.drag || this.drag.pointerId !== command.pointerId) return false;
    if (command.phase === 'cancel') { this.localSize = this.drag.size; this.drag = undefined; this.hovered = false; this.mousePolicy(); this.render(); return true; }
    this.localSize = size(this.drag.size + command.y - this.drag.y);
    if (command.phase === 'end') { this.drag = undefined; this.commitSize(); }
    this.mousePolicy(); this.render(); return true;
  }

  stop(): void { this.state = { ...this.state, working: false, stopping: false }; this.hide(); }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; clearTimeout(this.commitTimer); this.commitTimer = undefined; this.hide();
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = undefined; this.loaded = undefined;
  }

  private canShow(): boolean { return !this.disposed && !this.suspensions && this.state.enabled && this.state.working && this.options.canShow(); }
  private current(revision: number, overlay: OverlayWindow): boolean { return revision === this.revision && this.window === overlay && !overlay.isDestroyed() && this.canShow(); }
  private mousePolicy(): void { if (this.window && !this.window.isDestroyed()) this.window.setIgnoreMouseEvents(!this.drag && !this.hovered, { forward: true }); }
  private hide(): void {
    this.revision++; this.visible = false;
    if (this.drag) { this.localSize = this.drag.size; this.drag = undefined; }
    this.hovered = false; this.mousePolicy();
    if (this.window && !this.window.isDestroyed()) this.window.hide();
  }
  private commitSize(): void {
    clearTimeout(this.commitTimer); this.commitTimer = undefined;
    if (this.localSize === (this.expectedSize ?? this.preferenceSize)) return;
    const value = this.localSize, revision = ++this.commitRevision;
    this.expectedSize = value;
    void Promise.resolve().then(() => this.options.onSizeChange(value)).catch(() => {
      if (this.disposed || revision !== this.commitRevision) return;
      this.expectedSize = undefined; this.localSize = this.preferenceSize; this.refresh();
    });
  }
  private render(): void {
    if (!this.canShow()) { this.hide(); return; }
    const revision = ++this.revision;
    if (!this.window || this.window.isDestroyed()) {
      this.window = this.options.createWindow(); this.visible = false; this.mousePolicy();
      this.loaded = this.window.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(document)}`);
    }
    const overlay = this.window;
    void this.loaded!.then(async () => {
      if (!this.current(revision, overlay)) return;
      overlay.setBounds(activityOverlayBounds(this.options.workArea(), this.localSize));
      const currentPhase = phase(this.state.phase, !!this.state.stopping);
      const state = JSON.stringify({ phase: currentPhase, status: status[currentPhase], size: this.localSize, dragging: !!this.drag });
      await overlay.webContents.executeJavaScript(`(() => { const state=${state}; document.body.dataset.phase=state.phase; document.getElementById('status').textContent=state.status; const handle=document.getElementById('resize'); handle.setAttribute('aria-valuenow',String(state.size)); handle.dataset.dragging=String(state.dragging); if(!state.dragging)document.dispatchEvent(new Event('openhiatus:activity-overlay-reset')); })()`);
      if (!this.current(revision, overlay)) return;
      this.visible = true; this.mousePolicy(); overlay.showInactive();
    }).catch(() => {
      if (revision !== this.revision || this.window !== overlay) return;
      this.hide(); if (!overlay.isDestroyed()) overlay.destroy(); this.window = undefined; this.loaded = undefined;
    });
  }
}
