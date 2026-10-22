import { COMPUTER_TOOL, NativeComputer, computerReplyMetadata, parseComputerInput, type ComputerAdapter } from '../../computer';
import { defineTool, type ToolContribution } from '../../modules/tools';

/** Concrete desktop contribution. Every adapter owns its lazy computer and confirms turn release. */
export function createComputerToolContribution(options: { computer?: ComputerAdapter; createComputer?: () => ComputerAdapter } = {}): ToolContribution {
  let computer = options.computer;
  return {
    bind(context) {
      if (context.role !== 'worker') return { tools: [] };
      return {
        tools: [defineTool({
          definition: { type: 'function', name: COMPUTER_TOOL.name, description: COMPUTER_TOOL.description, inputSchema: COMPUTER_TOOL.inputSchema },
          audience: 'worker', validate: parseComputerInput,
          async execute(args, context) {
            computer ??= options.createComputer?.() ?? new NativeComputer();
            const result = await computer.execute(args, context.signal);
            if (context.signal.aborted) throw new Error('Bildschirmauftrag wurde unterbrochen.');
            const imageUrl = `data:image/png;base64,${result.image.base64}`;
            context.emit({ type: 'computer-frame', frame: { dataUrl: imageUrl, frameId: result.frameId, width: result.width, height: result.height, at: new Date().toISOString() } });
            return { success: true, contentItems: [{ type: 'inputText', text: computerReplyMetadata(result, result.text) }, { type: 'inputImage', imageUrl }] };
          },
        })],
        stop: () => computer?.stop() ?? Promise.resolve(),
      };
    },
    dispose: () => computer?.dispose() ?? Promise.resolve(),
  };
}
