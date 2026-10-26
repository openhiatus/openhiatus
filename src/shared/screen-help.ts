import type { ComputerRect } from './computer-views';

export type ScreenHelpColor = 'red' | 'black' | 'white';
export const SCREEN_HELP_COLORS: Record<ScreenHelpColor, { stroke: string; halo: string }> = {
  red: { stroke: '#ef2525', halo: '#ffffff' }, black: { stroke: '#111111', halo: '#ffffff' }, white: { stroke: '#ffffff', halo: '#111111' },
};
type HelpRectangle = { frameId: string; viewId: string; x: number; y: number; width: number; height: number };
export type ScreenHelpInput = { action: 'observe'; resolution?: 'original' }
  | ({ action: 'inspect' } & HelpRectangle)
  | ({ action: 'mark'; color: ScreenHelpColor; label?: string } & HelpRectangle)
  | { action: 'clear' };
export function parseScreenHelpInput(value: unknown): ScreenHelpInput {
  const invalid = () => new Error('Ungültige Bildschirmhilfe. Aktion, Bildkennung und Zielrechteck prüfen.');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const v = value as Record<string, unknown>;
  // The flat tool schema exposes fields for all four actions. Models can fill
  // inactive fields too; only the selected action's fields reach the service.
  const keys = ['action', 'resolution', 'frameId', 'viewId', 'x', 'y', 'width', 'height', 'label', 'color'];
  if (!['observe', 'inspect', 'mark', 'clear'].includes(v.action as string) || Object.keys(v).some(k => !keys.includes(k))) throw invalid();
  if (v.action === 'clear') return { action: 'clear' };
  if (v.action === 'observe') {
    if (v.resolution != null && v.resolution !== 'original') throw new Error('Für observe resolution weglassen, null oder "original" verwenden.');
    return { action: 'observe', ...(v.resolution === 'original' ? { resolution: 'original' } : {}) };
  }
  if (typeof v.frameId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(v.frameId)
    || typeof v.viewId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(v.viewId)) throw invalid();
  for (const k of ['x', 'y', 'width', 'height']) if (!Number.isSafeInteger(v[k]) || (v[k] as number) < (k === 'x' || k === 'y' ? 0 : 1) || (v[k] as number) > 32768) throw invalid();
  const rect = { frameId: v.frameId, viewId: v.viewId, x: v.x as number, y: v.y as number, width: v.width as number, height: v.height as number };
  if (v.action === 'inspect') return { action: 'inspect', ...rect };
  if (v.label != null && (typeof v.label !== 'string' || v.label.length > 100 || /[\x00-\x1f\x7f]/.test(v.label))) throw invalid();
  if (v.color !== 'red' && v.color !== 'black' && v.color !== 'white') throw new Error('Für mark die am besten sichtbare Farbe mit color: red, black oder white wählen.');
  return { action: 'mark', ...rect, color: v.color, ...(typeof v.label === 'string' && v.label.trim() ? { label: v.label.trim() } : {}) };
}
export interface GuidanceGeometry { cx: number; cy: number; radius: number; arrowX: number; arrowY: number; tipX: number; tipY: number; labelX: number; labelY: number; }
/** Image coordinates become display-local DIP exactly once, using actual captured dimensions. */
export function guidanceGeometry(rect: ComputerRect, image: { width: number; height: number }, display: { width: number; height: number }): GuidanceGeometry {
  if (![image.width, image.height, display.width, display.height, rect.width, rect.height].every(n => Number.isFinite(n) && n > 0)
    || ![rect.x, rect.y].every(n => Number.isFinite(n) && n >= 0) || rect.x + rect.width > image.width || rect.y + rect.height > image.height) throw new Error('Ungültige Hinweisgeometrie.');
  const cx = (rect.x + rect.width / 2) * display.width / image.width, cy = (rect.y + rect.height / 2) * display.height / image.height;
  const radius = Math.hypot(rect.width * display.width / image.width, rect.height * display.height / image.height) / 2 + 7;
  const directionX = cx < display.width / 2 ? 1 : -1, directionY = cy < display.height / 2 ? 1 : -1;
  const arrowX = Math.max(16, Math.min(display.width - 16, cx + directionX * (radius + 90)));
  const arrowY = Math.max(16, Math.min(display.height - 16, cy + directionY * (radius + 65)));
  const length = Math.hypot(arrowX - cx, arrowY - cy) || 1;
  return { cx, cy, radius, arrowX, arrowY, tipX: cx + (arrowX - cx) / length * (radius + 3), tipY: cy + (arrowY - cy) / length * (radius + 3),
    labelX: Math.max(12, Math.min(Math.max(12, display.width - 240), arrowX - 20)), labelY: Math.max(24, Math.min(display.height - 20, arrowY + 27)) };
}
