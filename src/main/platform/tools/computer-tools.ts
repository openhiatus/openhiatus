import { COMPUTER_TOOL, NativeComputer, computerReplyMetadata, parseComputerInput, type ComputerAdapter } from '../../computer';
import { defineTool, type ToolContribution } from '../../modules/tools';

/** Concrete desktop contribution. Every adapter owns its lazy computer and confirms turn release. */
export function createComputerToolContribution(options: { computer?: ComputerAdapter; createComputer?: () => ComputerAdapter; getOverviewScaleDivisor?: () => number } = {}): ToolContribution {
  let computer = options.computer;
  return {
    bind(context) {
      if (context.role !== 'worker') return { tools: [] };
      return {
        tools: [defineTool({
          definition: { type: 'function', name: COMPUTER_TOOL.name, description: COMPUTER_TOOL.description, inputSchema: COMPUTER_TOOL.inputSchema },
          audience: 'worker', validate: parseComputerInput,
          async execute(args, context) {
            computer ??= options.createComputer?.() ?? new NativeComputer({ getOverviewScaleDivisor: options.getOverviewScaleDivisor });
            const result = await computer.execute(args, context.signal);
            if (context.signal.aborted) throw new Error('Bildschirmauftrag wurde unterbrochen.');
            const imageUrl = `data:image/png;base64,${result.image.base64}`;
            const observation = result.observation;
            context.emit({ type: 'computer-frame', frame: { dataUrl: imageUrl, frameId: result.frameId,
              width: observation?.views[0].imageWidth ?? result.width, height: observation?.views[0].imageHeight ?? result.height,
              at: observation?.at ?? new Date().toISOString(), ...(observation ? { observation } : {}) } });
            if (observation) return { success: true, contentItems: [
              { type: 'inputText', text: computerReplyMetadata(result, result.text) },
              ...observation.views.flatMap(view => [
                { type: 'inputText' as const, text: `${view.kind} viewId=${view.viewId}; image ${view.imageWidth} x ${view.imageHeight}; local origin (0,0).` },
                { type: 'inputImage' as const, imageUrl: view.dataUrl, computerView: view.kind },
              ]),
            ] };
            return { success: true, contentItems: [{ type: 'inputText', text: computerReplyMetadata(result, result.text) },
              { type: 'inputImage', imageUrl, ...(args.action === 'screenshot' && args.resolution === 'original' ? { computerView: 'overview' as const } : {}) }] };
          },
        })],
        stop: () => computer?.stop() ?? Promise.resolve(),
      };
    },
    dispose: () => computer?.dispose() ?? Promise.resolve(),
  };
}
