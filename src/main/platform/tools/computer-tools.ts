import { COMPUTER_TOOL, ComputerDriverError, NativeComputer, computerReplyMetadata, parseComputerInput, type ComputerAdapter, type ComputerResult } from '../../computer';
import { defineTool, type ToolContribution } from '../../modules/tools';

/** Concrete desktop contribution. Every adapter owns its lazy computer and confirms turn release. */
export function createComputerToolContribution(options: { computer?: ComputerAdapter; createComputer?: () => ComputerAdapter; getOverviewScaleDivisor?: () => number; getDetailScaleDivisor?: () => number;
  runDesktopOperation?: <T>(operation: () => Promise<T>) => Promise<T> } = {}): ToolContribution {
  let computer = options.computer;
  return {
    bind(context) {
      if (context.role !== 'worker') return { tools: [] };
      return {
        tools: [defineTool({
          definition: { type: 'function', name: COMPUTER_TOOL.name, description: COMPUTER_TOOL.description, inputSchema: COMPUTER_TOOL.inputSchema },
          audience: 'worker', validate: parseComputerInput,
          async execute(args, context) {
            computer ??= options.createComputer?.() ?? new NativeComputer({ getOverviewScaleDivisor: options.getOverviewScaleDivisor, getDetailScaleDivisor: options.getDetailScaleDivisor });
            let result: ComputerResult, failure: ComputerDriverError | undefined;
            try { result = await (options.runDesktopOperation ? options.runDesktopOperation(() => computer!.execute(args, context.signal)) : computer.execute(args, context.signal)); }
            catch (error) {
              if (!(error instanceof ComputerDriverError) || !error.recovery) throw error;
              failure = error; result = error.recovery;
            }
            if (context.signal.aborted) throw new Error('Bildschirmauftrag wurde unterbrochen.');
            const imageUrl = `data:image/png;base64,${result.image.base64}`;
            const observation = result.observation;
            context.emit({ type: 'computer-frame', frame: { dataUrl: imageUrl, frameId: result.frameId,
              width: observation?.views[0].imageWidth ?? result.width, height: observation?.views[0].imageHeight ?? result.height,
              at: observation?.at ?? new Date().toISOString(), ...(observation ? { observation } : {}) } });
            const errorContent = failure ? [{ type: 'inputText' as const, text: failure.summary }] : [];
            if (observation) return { success: !failure, contentItems: [
              ...errorContent,
              { type: 'inputText', text: computerReplyMetadata(result, result.text) },
              ...observation.views.flatMap(view => [
                { type: 'inputText' as const, text: `${view.kind} viewId=${view.viewId}; image ${view.imageWidth} x ${view.imageHeight}; local origin (0,0).` },
                { type: 'inputImage' as const, imageUrl: view.dataUrl, computerView: view.kind },
              ]),
            ] };
            return { success: !failure, contentItems: [...errorContent, { type: 'inputText', text: computerReplyMetadata(result, result.text) },
              { type: 'inputImage', imageUrl, ...(args.action === 'screenshot' && args.resolution === 'original' ? { computerView: 'overview' as const } : {}) }] };
          },
        })],
        stop: () => computer?.stop() ?? Promise.resolve(),
      };
    },
    dispose: () => computer?.dispose() ?? Promise.resolve(),
  };
}
