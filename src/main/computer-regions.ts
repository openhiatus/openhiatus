import {
  MAX_COMPUTER_DETAIL_PIXELS,
  type ComputerPixels,
  type ComputerPoint,
  type ComputerRect,
  type ComputerRegionSelection,
} from '../shared/computer-views';

export interface ComputerRegionInput {
  current: ComputerPixels;
  /** The last original frame shown to the model, never an intermediate paint capture. */
  previous?: ComputerPixels;
  retained?: ComputerRect;
  actionPoint?: ComputerPoint;
  modelHint?: ComputerRect;
  strategy?: 'changes' | 'manual';
  maxDetailPixels?: number;
}

// The scan visits every original pixel once. Grouping has a separate, bounded grid.
const MAX_FRAME_PIXELS = 67_108_864;
const MAX_FRAME_DIMENSION = 32_768;
const MAX_ANALYSIS_CELLS = 16_384;
const RGB_CHANGE_THRESHOLD = 18;

interface Component { rect: ComputerRect; changedPixels: number; }
interface Changes {
  components: Component[];
  changedPixels: number;
  changedFraction: number;
  cellSize: number;
  broad: boolean;
}

function validatePixels(frame: ComputerPixels, name: string): void {
  if (!frame || !Number.isSafeInteger(frame.width) || !Number.isSafeInteger(frame.height)
    || frame.width <= 0 || frame.height <= 0
    || frame.width > MAX_FRAME_DIMENSION || frame.height > MAX_FRAME_DIMENSION
    || frame.width * frame.height > MAX_FRAME_PIXELS) {
    throw new RangeError(`${name} has invalid or unsupported pixel geometry.`);
  }
  if (!(frame.data instanceof Uint8Array) || frame.data.length !== frame.width * frame.height * 4) {
    throw new RangeError(`${name} must contain exactly width * height * 4 BGRA bytes.`);
  }
}

function validateRect(rect: ComputerRect, frame: ComputerPixels, name: string): void {
  if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isSafeInteger)
    || rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0
    || rect.x + rect.width > frame.width || rect.y + rect.height > frame.height) {
    throw new RangeError(`${name} must be an integer rectangle inside its original frame.`);
  }
}

function validatePoint(point: ComputerPoint, frame: ComputerPixels): void {
  if (!point || !Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y)
    || point.x < 0 || point.y < 0 || point.x >= frame.width || point.y >= frame.height) {
    throw new RangeError('actionPoint must be an integer point inside the current original frame.');
  }
}

function area(rect: ComputerRect): number { return rect.width * rect.height; }

function pointDistance(point: ComputerPoint, rect: ComputerRect): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width - 1));
  const dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height - 1));
  return Math.hypot(dx, dy);
}

function intersects(a: ComputerRect, b: ComputerRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width
    && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Keep the whole component; reduce surrounding context before reducing coverage. */
function contextRect(target: ComputerRect, frame: ComputerPixels, budget: number): ComputerRect | undefined {
  if (area(target) > budget) return undefined;
  const shortSide = Math.min(frame.width, frame.height);
  const padding = Math.max(1, Math.ceil(shortSide / 40));
  let width = Math.min(frame.width, Math.max(target.width + padding * 2, Math.ceil(shortSide * 0.4)));
  let height = Math.min(frame.height, Math.max(target.height + padding * 2, Math.ceil(shortSide * 0.3)));
  if (width * height > budget) {
    const factor = Math.sqrt(budget / (width * height));
    width = Math.max(target.width, Math.floor(width * factor));
    height = Math.max(target.height, Math.floor(height * factor));
    if (width * height > budget) {
      if (Math.floor(budget / height) >= target.width) width = Math.floor(budget / height);
      else height = Math.floor(budget / width);
    }
  }
  return {
    x: Math.max(0, Math.min(frame.width - width, Math.floor(target.x + (target.width - width) / 2))),
    y: Math.max(0, Math.min(frame.height - height, Math.floor(target.y + (target.height - height) / 2))),
    width,
    height,
  };
}

function comparePixels(current: ComputerPixels, previous: ComputerPixels): Changes {
  const { width, height, data } = current;
  let cellSize = Math.max(1, Math.ceil(Math.sqrt(width * height / MAX_ANALYSIS_CELLS)),
    Math.ceil(width / 256), Math.ceil(height / 256));
  while (Math.ceil(width / cellSize) * Math.ceil(height / cellSize) > MAX_ANALYSIS_CELLS) cellSize++;
  const columns = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  const cellCount = columns * rows;
  const counts = new Uint32Array(cellCount);
  const minX = new Uint32Array(cellCount).fill(width);
  const minY = new Uint32Array(cellCount).fill(height);
  const maxX = new Uint32Array(cellCount);
  const maxY = new Uint32Array(cellCount);
  let changedPixels = 0;
  let offset = 0;
  for (let y = 0; y < height; y++) {
    const rowOffset = Math.floor(y / cellSize) * columns;
    for (let x = 0; x < width; x++, offset += 4) {
      // Alpha alone does not represent a visible desktop change. Do not subsample RGB.
      if (Math.abs(data[offset] - previous.data[offset]) <= RGB_CHANGE_THRESHOLD
        && Math.abs(data[offset + 1] - previous.data[offset + 1]) <= RGB_CHANGE_THRESHOLD
        && Math.abs(data[offset + 2] - previous.data[offset + 2]) <= RGB_CHANGE_THRESHOLD) continue;
      const cell = rowOffset + Math.floor(x / cellSize);
      counts[cell]++;
      changedPixels++;
      minX[cell] = Math.min(minX[cell], x);
      minY[cell] = Math.min(minY[cell], y);
      maxX[cell] = Math.max(maxX[cell], x);
      maxY[cell] = Math.max(maxY[cell], y);
    }
  }

  // A one-cell neighborhood joins nearby glyph/checkbox changes without using OCR.
  // Exact changed-pixel bounds are retained separately from these grouping cells.
  const active = new Uint8Array(cellCount);
  let occupiedCells = 0;
  for (let cell = 0; cell < cellCount; cell++) {
    if (!counts[cell]) continue;
    occupiedCells++;
    const x = cell % columns;
    const y = Math.floor(cell / columns);
    for (let row = Math.max(0, y - 1); row <= Math.min(rows - 1, y + 1); row++) {
      for (let column = Math.max(0, x - 1); column <= Math.min(columns - 1, x + 1); column++) {
        active[row * columns + column] = 1;
      }
    }
  }

  const queue = new Uint32Array(cellCount);
  const components: Component[] = [];
  for (let seed = 0; seed < cellCount; seed++) {
    if (!active[seed]) continue;
    let read = 0;
    let write = 1;
    queue[0] = seed;
    active[seed] = 0;
    let left = width;
    let top = height;
    let right = 0;
    let bottom = 0;
    let pixels = 0;
    while (read < write) {
      const cell = queue[read++];
      if (counts[cell]) {
        pixels += counts[cell];
        left = Math.min(left, minX[cell]);
        top = Math.min(top, minY[cell]);
        right = Math.max(right, maxX[cell]);
        bottom = Math.max(bottom, maxY[cell]);
      }
      const x = cell % columns;
      const y = Math.floor(cell / columns);
      for (let row = Math.max(0, y - 1); row <= Math.min(rows - 1, y + 1); row++) {
        for (let column = Math.max(0, x - 1); column <= Math.min(columns - 1, x + 1); column++) {
          const neighbor = row * columns + column;
          if (active[neighbor]) { active[neighbor] = 0; queue[write++] = neighbor; }
        }
      }
    }
    components.push({ rect: { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }, changedPixels: pixels });
  }
  const changedFraction = changedPixels / (width * height);
  return {
    components,
    changedPixels,
    changedFraction,
    cellSize,
    // Diffuse text scrolling can occupy most cells without changing most pixels.
    broad: changedFraction > 0.45 || occupiedCells / cellCount > 0.6,
  };
}

/**
 * Application/provider-independent, deterministic local region policy.
 * This detects visible changes, not their meaning or the correctness of an action.
 */
export function selectComputerRegion(input: ComputerRegionInput): ComputerRegionSelection {
  const { current, previous, modelHint, actionPoint } = input;
  validatePixels(current, 'current');
  if (previous !== undefined) validatePixels(previous, 'previous');
  const budget = input.maxDetailPixels ?? MAX_COMPUTER_DETAIL_PIXELS;
  if (!Number.isSafeInteger(budget) || budget <= 0 || budget > MAX_COMPUTER_DETAIL_PIXELS) {
    throw new RangeError(`maxDetailPixels must be an integer from 1 to ${MAX_COMPUTER_DETAIL_PIXELS}.`);
  }
  if (input.strategy !== undefined && input.strategy !== 'changes' && input.strategy !== 'manual') {
    throw new RangeError('Unknown computer region strategy.');
  }
  if (actionPoint !== undefined) validatePoint(actionPoint, current);
  const sameGeometry = previous === undefined || (previous.width === current.width && previous.height === current.height);
  if (input.retained !== undefined) validateRect(input.retained, previous ?? current, 'retained');
  const retained = sameGeometry && input.retained && area(input.retained) <= budget ? input.retained : undefined;
  if (modelHint !== undefined) {
    validateRect(modelHint, current, 'modelHint');
    if (area(modelHint) > budget) throw new RangeError('modelHint exceeds the detail pixel budget.');
    return { rect: { ...modelHint }, reason: input.strategy === 'manual' ? 'manual' : 'model-hint' };
  }

  const fallback = (): ComputerRegionSelection => {
    if (retained) return { rect: { ...retained }, reason: 'retained' };
    if (actionPoint) return { rect: contextRect({ ...actionPoint, width: 1, height: 1 }, current, budget), reason: 'action-point' };
    return { reason: 'none' };
  };
  if (!previous || !sameGeometry || input.strategy === 'manual') return fallback();

  const changes = comparePixels(current, previous);
  const diagnostics = {
    changedPixels: changes.changedPixels,
    changedFraction: changes.changedFraction,
    candidates: changes.components.length,
  };
  if (!changes.changedPixels || changes.broad) return { ...fallback(), ...diagnostics };

  const shortSide = Math.min(current.width, current.height);
  const padding = Math.max(1, Math.ceil(shortSide / 40));
  const localityBonus = Math.sqrt(Math.ceil(shortSide * 0.4) * Math.ceil(shortSide * 0.3)) * 0.3;
  const candidates: { component: Component; rect: ComputerRect; score: number }[] = [];
  for (const component of changes.components) {
    const bounds = component.rect;
    // A full viewport/scroll is already visible in the overview. Avoid presenting
    // an arbitrary budget-sized fragment as coverage of a larger component.
    if (area(bounds) > current.width * current.height * 0.6
      || (bounds.width >= current.width * 0.8 && bounds.height >= current.height * 0.6)) continue;
    const rect = contextRect(bounds, current, budget);
    if (!rect) continue;
    const actionDistance = actionPoint ? pointDistance(actionPoint, bounds) : Infinity;
    const nearAction = actionDistance <= padding * 2;
    const inRetained = retained !== undefined && intersects(retained, bounds);
    const tiny = component.changedPixels <= changes.cellSize ** 2 * 2
      && Math.min(bounds.width, bounds.height) <= Math.max(1, changes.cellSize / 2);
    // Without a hint/action at that location, a remote caret should not displace
    // useful retained detail. Tiny changes still qualify on the first comparison.
    if (retained && tiny && !nearAction && !inRetained) continue;
    const score = Math.sqrt(Math.max(component.changedPixels, area(bounds) / 4))
      + (nearAction ? localityBonus / (1 + actionDistance / (padding + 1)) : 0)
      + (inRetained ? localityBonus / 4 : 0);
    candidates.push({ component, rect, score });
  }
  candidates.sort((a, b) => b.score - a.score || b.component.changedPixels - a.component.changedPixels
    || a.component.rect.y - b.component.rect.y || a.component.rect.x - b.component.rect.x
    || a.component.rect.width - b.component.rect.width || a.component.rect.height - b.component.rect.height);
  const selected = candidates[0];
  return selected ? { rect: selected.rect, reason: 'visual-change', ...diagnostics } : { ...fallback(), ...diagnostics };
}
