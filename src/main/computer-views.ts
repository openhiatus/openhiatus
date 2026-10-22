import { MAX_COMPUTER_DETAIL_PIXELS, type ComputerPoint, type ComputerRect, type ComputerSize, type ComputerViewDescriptor } from '../shared/computer-views.js';

function integer(value: number, minimum: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`Invalid computer ${name}.`);
}

function validateSize(size: ComputerSize): void {
  integer(size.width, 1, 'width');
  integer(size.height, 1, 'height');
}

function validateRect(rect: ComputerRect): void {
  validateSize(rect);
  integer(rect.x, 0, 'x');
  integer(rect.y, 0, 'y');
  if (!Number.isSafeInteger(rect.x + rect.width) || !Number.isSafeInteger(rect.y + rect.height)) {
    throw new Error('Computer rectangle edges exceed safe integer coordinates.');
  }
}

/** Both axes are rounded separately; Windows DPI never enters image geometry. */
export function overviewSize(size: ComputerSize, divisor: number): ComputerSize {
  validateSize(size);
  if (!Number.isFinite(divisor) || divisor < 1 || divisor > 64) throw new Error('Invalid computer overview divisor.');
  return { width: Math.max(1, Math.round(size.width / divisor)), height: Math.max(1, Math.round(size.height / divisor)) };
}

/** Reject a region that cannot be represented exactly; never clip a requested crop. */
export function validateSourceRect(rect: ComputerRect, size: ComputerSize, maxPixels = MAX_COMPUTER_DETAIL_PIXELS): ComputerRect {
  validateSize(size);
  validateRect(rect);
  integer(maxPixels, 1, 'pixel limit');
  if (rect.x + rect.width > size.width || rect.y + rect.height > size.height) throw new Error('Computer rectangle is outside its source image.');
  if (rect.width > maxPixels / rect.height) throw new Error('Computer rectangle exceeds the pixel limit.');
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

export function createViewDescriptor(
  kind: ComputerViewDescriptor['kind'], viewId: string, sourceRect: ComputerRect, imageSize: ComputerSize,
): ComputerViewDescriptor {
  if (kind !== 'overview' && kind !== 'detail') throw new Error('Invalid computer view kind.');
  if (typeof viewId !== 'string' || !viewId.trim()) throw new Error('Invalid computer view identifier.');
  validateRect(sourceRect);
  validateSize(imageSize);
  if (imageSize.width > sourceRect.width || imageSize.height > sourceRect.height) throw new Error('Computer views cannot enlarge their source image.');
  if (kind === 'detail' && (imageSize.width !== sourceRect.width || imageSize.height !== sourceRect.height)) {
    throw new Error('Computer detail images must retain their source pixels.');
  }
  return { kind, viewId, sourceRect: { x: sourceRect.x, y: sourceRect.y, width: sourceRect.width, height: sourceRect.height }, imageWidth: imageSize.width, imageHeight: imageSize.height };
}

function validateView(view: ComputerViewDescriptor): void {
  createViewDescriptor(view.kind, view.viewId, view.sourceRect, { width: view.imageWidth, height: view.imageHeight });
}

// Integer arithmetic keeps far edges exact even when the intermediate product is
// larger than Number.MAX_SAFE_INTEGER. All returned coordinates remain safe.
function ratio(value: number, source: number, image: number, rounding: 'floor' | 'ceil' | 'round'): number {
  const numerator = BigInt(value) * BigInt(source), denominator = BigInt(image);
  if (rounding === 'ceil') return Number((numerator + denominator - 1n) / denominator);
  if (rounding === 'round') return Number((numerator * 2n + denominator) / (denominator * 2n));
  return Number(numerator / denominator);
}

/** Map a view pixel into physical source pixels using its actual per-axis ratio. */
export function mapViewPoint(view: ComputerViewDescriptor, point: ComputerPoint): ComputerPoint {
  validateView(view);
  integer(point.x, 0, 'point x'); integer(point.y, 0, 'point y');
  if (point.x >= view.imageWidth || point.y >= view.imageHeight) throw new Error('Computer point is outside its view image.');
  return {
    x: view.sourceRect.x + Math.min(view.sourceRect.width - 1, ratio(point.x, view.sourceRect.width, view.imageWidth, 'round')),
    y: view.sourceRect.y + Math.min(view.sourceRect.height - 1, ratio(point.y, view.sourceRect.height, view.imageHeight, 'round')),
  };
}

/** Cover all source pixels touched by a contained image rectangle. */
export function mapViewRect(view: ComputerViewDescriptor, rect: ComputerRect): ComputerRect {
  validateView(view);
  validateRect(rect);
  if (rect.x + rect.width > view.imageWidth || rect.y + rect.height > view.imageHeight) throw new Error('Computer rectangle is outside its view image.');
  const left = ratio(rect.x, view.sourceRect.width, view.imageWidth, 'floor');
  const top = ratio(rect.y, view.sourceRect.height, view.imageHeight, 'floor');
  const right = ratio(rect.x + rect.width, view.sourceRect.width, view.imageWidth, 'ceil');
  const bottom = ratio(rect.y + rect.height, view.sourceRect.height, view.imageHeight, 'ceil');
  return { x: view.sourceRect.x + left, y: view.sourceRect.y + top, width: right - left, height: bottom - top };
}
