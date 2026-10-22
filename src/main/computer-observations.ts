import { computerHandle } from './computer-handles';
import type { ComputerObservation, ComputerPoint, ComputerRect, ComputerRegionSelection, ComputerViewImage } from '../shared/computer-views';
import type { ComputerAction, ComputerInput } from './computer-input';
import { ComputerError } from './computer-input';
import { createComputerImageProcessor, type ComputerImageProcessor, type DecodedComputerImage } from './computer-images';
import { createViewDescriptor, mapViewPoint, mapViewRect, overviewSize, validateSourceRect } from './computer-views';
import { selectComputerRegion } from './computer-regions';

interface SourceImage { frameId: string; width: number; height: number; scale: number; image: { base64: string }; }
interface Context { actionPoint?: ComputerPoint; modelHint?: ComputerRect; }
const check = (signal: AbortSignal): void => { if (signal.aborted) throw new Error('Computer image preparation aborted.'); };

/** Owns only the last original and its current views, never desktop input or provider APIs. */
export class ComputerObservations {
  private divisor = 1;
  private processor?: ComputerImageProcessor;
  private source?: DecodedComputerImage;
  private observation?: ComputerObservation;
  constructor(private readonly createProcessor = createComputerImageProcessor) {}

  configure(divisor: number): void {
    overviewSize({ width: 1, height: 1 }, divisor);
    this.reset(); this.divisor = divisor;
  }
  reset(): void { this.source = undefined; this.observation = undefined; this.processor = undefined; }

  mapAction(input: ComputerAction, size: { width: number; height: number }): { input: ComputerAction } & Context {
    const { viewId, nextDetail, ...rest } = input;
    const view = viewId ? this.observation?.views.find(view => view.viewId === viewId) : undefined;
    if (viewId && !view) throw new ComputerError('Unknown or replaced computer view. Request a screenshot.');
    if (this.divisor > 1 && 'x' in input && !view) throw new ComputerError('Coordinate actions require the current viewId.');
    const modelHint = nextDetail && view ? validateSourceRect(mapViewRect(view, nextDetail), size) : undefined;
    if (nextDetail && !modelHint) throw new ComputerError('A detail prediction requires a current view.');
    if (!('x' in rest)) return { input: rest, ...(modelHint ? { modelHint } : {}) };
    const point = view ? mapViewPoint(view, rest) : { x: rest.x, y: rest.y };
    if (point.x >= size.width || point.y >= size.height) throw new ComputerError('Computer point outside the screen.');
    if (rest.action === 'drag') {
      const { fromViewId, ...drag } = rest;
      const startView = fromViewId ? this.observation?.views.find(view => view.viewId === fromViewId) : view;
      if (fromViewId && !startView) throw new ComputerError('Unknown or replaced drag source view.');
      const from = startView ? mapViewPoint(startView, { x: rest.fromX, y: rest.fromY }) : { x: rest.fromX, y: rest.fromY };
      if (from.x >= size.width || from.y >= size.height) throw new ComputerError('Drag source outside the screen.');
      return { input: { ...drag, ...point, fromX: from.x, fromY: from.y }, actionPoint: point, ...(modelHint ? { modelHint } : {}) };
    }
    return { input: { ...rest, ...point }, actionPoint: point, ...(modelHint ? { modelHint } : {}) };
  }

  async prepare(image: SourceImage, at: string, signal: AbortSignal, context: Context = {}, originalResolution = false): Promise<ComputerObservation | undefined> {
    if (this.divisor === 1) return undefined;
    const divisor = originalResolution ? 1 : this.divisor;
    check(signal);
    this.processor ??= await this.createProcessor();
    check(signal);
    const began = performance.now();
    const source = this.processor.decode(image.image.base64, image);
    const before = this.observation;
    const sameGeometry = before?.screenWidth === image.width && before.screenHeight === image.height && before.scaleFactor === image.scale;
    const selectedAt = performance.now();
    const selection: ComputerRegionSelection = originalResolution ? { reason: 'none' } : selectComputerRegion({ current: source, ...(sameGeometry ? {
      previous: this.source, retained: before.views.find(view => view.kind === 'detail')?.sourceRect, ...context,
    } : {}) });
    const regionSelectionMs = performance.now() - selectedAt;
    // A requested full image is the complete original, never another detail crop.
    // Keep the configured divisor unchanged for subsequent ordinary observations.
    const overview = this.processor.overview(source, divisor);
    const views: ComputerViewImage[] = [{ ...createViewDescriptor('overview', computerHandle('view'),
      { x: 0, y: 0, width: image.width, height: image.height }, overview), dataUrl: `data:image/png;base64,${overview.base64}` }];
    if (selection.rect) views.push(this.detail(source, selection.rect));
    check(signal);
    const observation: ComputerObservation = { version: 2, frameId: image.frameId, at, displayId: 'primary',
      screenWidth: image.width, screenHeight: image.height, scaleFactor: image.scale,
      overviewScaleDivisor: divisor, views, selection,
      timings: { imageProcessingMs: Math.max(0, performance.now() - began - regionSelectionMs), regionSelectionMs } };
    this.source = source; this.observation = observation;
    return observation;
  }

  inspect(input: Extract<ComputerInput, { action: 'inspect' }>): ComputerObservation {
    const current = this.observation, source = this.source;
    if (!current || !source || current.frameId !== input.frameId) throw new ComputerError('No original retained for this frame. Request a screenshot in overview mode.');
    const view = current.views.find(view => view.viewId === input.viewId);
    if (!view) throw new ComputerError('Unknown or replaced computer view.');
    const rect = validateSourceRect(mapViewRect(view, input), source);
    const began = performance.now();
    const detail = this.detail(source, rect);
    const selection: ComputerRegionSelection = { rect, reason: 'manual' };
    // The overview, frame identifier and capture time remain unchanged. Old detail IDs are retired.
    this.observation = { ...current, views: [current.views[0], detail], selection,
      timings: { imageProcessingMs: performance.now() - began, regionSelectionMs: 0 } };
    return this.observation;
  }

  private detail(source: DecodedComputerImage, rect: ComputerRect): ComputerViewImage {
    const image = this.processor!.crop(source, rect);
    return { ...createViewDescriptor('detail', computerHandle('view'), rect, image), dataUrl: `data:image/png;base64,${image.base64}` };
  }
}
