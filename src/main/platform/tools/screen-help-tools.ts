import { parseScreenHelpInput } from '../../../shared/screen-help';
import { defineTool, type ToolContribution } from '../../modules/tools';
import type { ScreenHelpService } from '../screen-help/service';

export function createScreenHelpTools(help: ScreenHelpService): ToolContribution {
  return { bind(context) {
    if (context.role !== 'dialog') return { tools: [] };
    help.begin();
    return { tools: [defineTool({ audience: 'dialog', validate: parseScreenHelpInput,
      definition: { type: 'function', name: 'screen_help', description: 'Help the user find something in their current visible Windows program. Observe/inspect only, then mark the actual element with a circle and arrow directly on the desktop without focus changes or input. observe loads the local bildschirmhilfe SKILL.md together with the screenshot. No background task is needed for a help question.',
        inputSchema: { type: 'object', additionalProperties: false, properties: {
          action: { type: 'string', enum: ['observe', 'inspect', 'mark', 'clear'] }, resolution: { type: 'string', enum: ['original'] },
          frameId: { type: 'string' }, viewId: { type: 'string' }, x: { type: 'integer', minimum: 0 }, y: { type: 'integer', minimum: 0 },
          width: { type: 'integer', minimum: 1 }, height: { type: 'integer', minimum: 1 }, label: { type: 'string', maxLength: 100 },
        }, required: ['action'] } },
      execute: (args, context) => help.execute(args, context.signal),
    })] };
  } };
}
