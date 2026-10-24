import { command, inputText, noArgs, type HandlerMap } from './command';
import type { IpcPorts } from './ports';

export function conversationHandlers({ controller, platform }: IpcPorts): Pick<HandlerMap, 'snapshot' | 'send' | 'stop' | 'stopJob' | 'newConversation' | 'acknowledgeFullAccess'> {
  return {
    snapshot: command('snapshot', 0, noArgs, () => controller.snapshot()),
    send: command('send', 2, args => [inputText(args[0], 12000, 'Nachricht'), inputText(args[1], 100, 'Auftragskennung')], (text, id) => controller.send(text, id)),
    stop: command('stop', 0, noArgs, () => { platform.stopActivityPresence(); return controller.stop(); }),
    stopJob: command('stopJob', 1, args => [inputText(args[0], 100, 'Aufgabenkennung')], id => controller.stopJob(id)),
    newConversation: command('newConversation', 0, noArgs, () => controller.newConversation()),
    acknowledgeFullAccess: command('acknowledgeFullAccess', 0, noArgs, () => controller.acknowledgeFullAccess()),
  };
}
