import { contextBridge, ipcRenderer } from 'electron';
import { createOpenhiatusApi } from '../shared/ipc';

const api = createOpenhiatusApi({
  invoke: async (name, args): Promise<unknown> => {
    const response: unknown = await ipcRenderer.invoke('openhiatus:call', name, args);
    return response;
  },
  subscribe: (channel, listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => listener(payload);
    ipcRenderer.on(channel, handler);
    return () => { ipcRenderer.removeListener(channel, handler); };
  },
  publishActivityPresence: state => { ipcRenderer.send('openhiatus:activity-presence', state); },
});
contextBridge.exposeInMainWorld('openhiatus', api);
