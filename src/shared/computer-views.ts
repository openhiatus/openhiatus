/** Screen pixels, image pixels and Windows DPI are separate coordinate spaces. */
export interface ComputerSize { width: number; height: number; }
export interface ComputerRect extends ComputerSize { x: number; y: number; }
export interface ComputerPoint { x: number; y: number; }
export const COMPUTER_OVERVIEW_FACTORS = [1, 4, 8, 16, 32] as const;
export const MAX_COMPUTER_DETAIL_PIXELS = 1_048_576;
export function computerOverviewDivisor(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > 64) throw new Error('Invalid computer overview divisor.');
  return value;
}
export interface ComputerViewDescriptor {
  viewId: string;
  kind: 'overview' | 'detail';
  imageWidth: number;
  imageHeight: number;
  sourceRect: ComputerRect;
}
export interface ComputerViewImage extends ComputerViewDescriptor { dataUrl: string; }
export type ComputerRegionReason = 'manual' | 'model-hint' | 'visual-change' | 'retained' | 'action-point' | 'none';
export interface ComputerRegionSelection {
  rect?: ComputerRect;
  reason: ComputerRegionReason;
  changedPixels?: number;
  changedFraction?: number;
  candidates?: number;
}
export interface ComputerObservation {
  version: 2;
  frameId: string;
  at: string;
  displayId: 'primary';
  screenWidth: number;
  screenHeight: number;
  scaleFactor: number;
  overviewScaleDivisor: number;
  views: ComputerViewImage[];
  selection: ComputerRegionSelection;
  timings: { imageProcessingMs: number; regionSelectionMs: number; };
}
/** BGRA pixels at scale 1; provider-independent, and never sent as an image. */
export interface ComputerPixels extends ComputerSize { data: Uint8Array; }
