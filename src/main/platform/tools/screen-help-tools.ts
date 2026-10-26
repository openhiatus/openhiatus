import { parseScreenHelpInput } from '../../../shared/screen-help';
import { defineTool, type ToolContribution } from '../../modules/tools';
import type { ScreenHelpService } from '../screen-help/service';

export function createScreenHelpTools(help: ScreenHelpService): ToolContribution {
  return { bind(context) {
    if (context.role !== 'dialog') return { tools: [] };
    help.begin();
    return { tools: [defineTool({ audience: 'dialog', validate: parseScreenHelpInput,
      definition: { type: 'function', name: 'screen_help', description: 'Help the user find something in their current visible Windows program. Start with {"action":"observe"}; optionally add "resolution":"original". observe loads the local bildschirmhilfe SKILL.md together with the screenshot. Then inspect or mark using the returned frameId/viewId and view-local rectangle. mark draws a circle and arrow without focus changes or input. clear removes the hint. Omit fields unused by the chosen action or set them to null; they are ignored. Never invent frame/view IDs before observing. No background task is needed for a help question.',
        inputSchema: { type: 'object', additionalProperties: false, properties: {
          action: { type: 'string', enum: ['observe', 'inspect', 'mark', 'clear'] },
          resolution: { type: ['string', 'null'], enum: ['original', null], description: 'observe only: original requests full resolution; omit or null for an overview.' },
          frameId: { type: ['string', 'null'], description: 'inspect/mark only: exact frameId returned by observe. Unused by observe/clear.' },
          viewId: { type: ['string', 'null'], description: 'inspect/mark only: exact viewId returned by observe/inspect. Unused by observe/clear.' },
          x: { type: ['integer', 'null'], minimum: 0, description: 'inspect/mark only: left edge in the selected view, in pixels.' },
          y: { type: ['integer', 'null'], minimum: 0, description: 'inspect/mark only: top edge in the selected view, in pixels.' },
          width: { type: ['integer', 'null'], minimum: 1, description: 'inspect/mark only: rectangle width in view pixels.' },
          height: { type: ['integer', 'null'], minimum: 1, description: 'inspect/mark only: rectangle height in view pixels.' },
          label: { type: ['string', 'null'], maxLength: 100, description: 'mark only: optional short label; omit, null or empty for the default.' },
          color: { type: ['string', 'null'], enum: ['red', 'black', 'white', null], description: 'Required for mark; ignored for other actions. Choose the color with best visibility against the observed background around the target. Red is prominent on many backgrounds; black on light areas, white on dark areas. The host adds a contrasting halo.' },
        }, required: ['action'] } },
      execute: (args, context) => help.execute(args, context.signal),
    })] };
  } };
}
