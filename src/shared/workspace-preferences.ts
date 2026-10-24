export type SidebarMode = 'auto' | 'expanded' | 'collapsed';
export const ACTIVITY_OVERLAY_MIN_SIZE = 96;
export const ACTIVITY_OVERLAY_MAX_SIZE = 320;
export const ACTIVITY_OVERLAY_DEFAULT_SIZE = 144;

export function sidebarMode(value: unknown): SidebarMode {
  if (value !== 'auto' && value !== 'expanded' && value !== 'collapsed') throw new Error('Ungültige Einstellung für die Navigation.');
  return value;
}

export function activityOverlaySize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < ACTIVITY_OVERLAY_MIN_SIZE || value > ACTIVITY_OVERLAY_MAX_SIZE) {
    throw new Error('Ungültige Größe für die Arbeitsanzeige.');
  }
  return value;
}
