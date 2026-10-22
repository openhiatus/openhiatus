import { app, BrowserWindow, dialog, globalShortcut, ipcMain, powerMonitor, safeStorage, screen, session, shell } from 'electron';
import path from 'node:path';
import { mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ChatGPTAuth } from './chatgpt-auth';
import { AppController } from './controller';
import { PiAdapter } from './pi';
import { createToolRegistry, defineTool } from './modules/tools';
import { ServiceBroker } from './modules/services';
import { createComputerToolContribution } from './platform/tools';
import { createDelegatedComputerToolContribution } from './platform/tools/computer-delegation';
import { AGENT_INSTRUCTIONS, COMPUTER_PLANNER_INSTRUCTIONS } from './instructions';
import { ProviderStore, ModelClient } from './providers';
import { StateStore, CredentialStore } from './storage';
import { WorkerStateStore, WorkerMemoryStore } from './platform/persistence';
import { SpeechService } from './speech';
import { resolveDemoFile } from './resolve-demo-file';
import { redact } from './redact';
import { VoiceOverlay, parseVoiceOverlayState } from './voice-overlay';
import { startNativeVoiceHotkeys } from './native-hotkeys';
import { createIpcRouter } from './ipc';
import { decodeComputerFrame, decodeSnapshot, type IpcResponse } from '../shared/ipc';
import type { AgentEvent, BackgroundJob } from '../shared/contracts';
import { APP_DISPLAY_NAME, APP_SLUG } from '../shared/branding';

app.setName(APP_DISPLAY_NAME);
app.setAppUserModelId('local.openhiatus.assistant');
const profileArg = process.argv.find(arg => arg.startsWith('--data-dir='))?.slice('--data-dir='.length);
const dataDirectory = profileArg && path.isAbsolute(profileArg) ? profileArg : path.join(app.getPath('appData'), APP_SLUG);
app.setPath('userData', dataDirectory);
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
let window: BrowserWindow | undefined, controller: AppController | undefined, voiceOverlay: VoiceOverlay | undefined;
let services: ServiceBroker | undefined;
let stateWriter: WorkerStateStore | undefined;
let memoryWriter: WorkerMemoryStore | undefined;
let quitting = false, disposed = false;
let voiceHotkeys: Awaited<ReturnType<typeof startNativeVoiceHotkeys>> | undefined;

async function createApp(): Promise<void> {
  const workspace = path.join(dataDirectory, 'Arbeitsbereich'), home = path.join(dataDirectory, 'pi');
  mkdirSync(workspace, { recursive: true }); mkdirSync(path.join(home, 'skills'), { recursive: true });
  const demoFile = path.join(workspace, 'projektnotizen.md');
  if (!existsSync(demoFile)) copyFileSync(path.join(__dirname, 'demo', 'projektnotizen.md'), demoFile);
  const initialStore = new StateStore(dataDirectory), credentials = new CredentialStore(dataDirectory, safeStorage);
  const initialState = initialStore.load();
  stateWriter = new WorkerStateStore(dataDirectory, { workerPath: path.join(__dirname, 'state-worker.cjs') });
  const writer = stateWriter;
  const store = { load: () => structuredClone(initialState), save: (state: ReturnType<StateStore['load']>) => writer.commit(state) };
  const chatgpt = new ChatGPTAuth(dataDirectory, credentials, {
    openBrowser: async value => {
      const url = new URL(value);
      if (url.origin !== 'https://auth.openai.com' || url.pathname !== '/api/accounts/authorize' || url.username || url.password || url.hash) throw new Error('Unzulässige ChatGPT-Anmeldeadresse.');
      await shell.openExternal(url.href);
    },
    onChange: () => controller?.refreshChatGPT(),
  });
  const providers = new ProviderStore(dataDirectory, credentials, chatgpt), initialSecrets = providers.secrets();
  try { const key = credentials.get('inworld'); if (key) initialSecrets.push(key); } catch { /* Never expose unavailable credentials. */ }
  const memory = new WorkerMemoryStore(path.join(dataDirectory, 'Gedächtnis'), {
    workerPath: path.join(__dirname, 'memory-worker.cjs'),
    getSecrets: () => controller?.redactionSecrets() ?? initialSecrets,
    sanitize: value => controller?.sanitizeMemory(value) ?? redact(value, initialSecrets),
  });
  memoryWriter = memory;
  const processHost = app.isPackaged ? path.join(process.resourcesPath, 'native', 'openhiatus-process-host.exe') : path.join(__dirname, 'native', 'openhiatus-process-host.exe');
  const runtimeOptions = { executable: process.execPath, hostEntry: path.join(__dirname, 'agent-host.mjs'), processHost, home, workspace, providers };
  services = new ServiceBroker();
  const serviceBroker = services;
  const computerTools = () => createComputerToolContribution({ getOverviewScaleDivisor: () => controller?.snapshot().preferences.computerOverviewScaleDivisor ?? 1 });
  const runtime = new PiAdapter({ ...runtimeOptions, role: 'worker', tools: createToolRegistry([computerTools()]),
    getIdentityInstructions: () => controller?.identityInstructions() ?? '', onEvent: event => controller?.handle(event) });
  const dialogRuntime = new PiAdapter({ ...runtimeOptions, role: 'dialog', getIdentityInstructions: () => controller?.identityInstructions() ?? '',
    tools: createToolRegistry([{ bind: () => ({ tools: (controller?.dialogTools() ?? []).map(definition => defineTool({
      definition, audience: 'dialog', validate: args => args, execute: async (args, context) => {
        if (!controller) throw new Error(`${APP_DISPLAY_NAME} wird noch vorbereitet.`);
        return controller.dialogTool(definition.name, args, context.signal);
      },
    })) }) }]), onEvent: event => controller?.handleDialog(event),
  });
  const createWorker = (onEvent: (event: AgentEvent) => void, job: BackgroundJob) => {
    // Admission captured these values before asynchronous memory lookup/queueing.
    const computer = job.computer;
    const desktop = computer?.delegationEnabled ? createDelegatedComputerToolContribution({ model: computer.model, fast: computer.fast,
      getOverviewScaleDivisor: () => computer.overviewScaleDivisor,
      createWorker: (onEvent, tools, instructions) => new PiAdapter({ ...runtimeOptions, role: 'worker', computerOnly: true, instructions, tools, onEvent }),
    }) : createComputerToolContribution({ getOverviewScaleDivisor: () => computer?.overviewScaleDivisor ?? 1 });
    return new PiAdapter({ ...runtimeOptions, role: 'worker',
      ...(computer?.delegationEnabled ? { instructions: `${AGENT_INSTRUCTIONS}\n\n${COMPUTER_PLANNER_INSTRUCTIONS}` } : {}),
      tools: createToolRegistry([desktop, serviceBroker.createReadTools(job.id)]),
      getIdentityInstructions: () => job.identityInstructions ?? '', onEvent });
  };
  const speech = new SpeechService({ getKey: () => credentials.get('inworld'), getVoice: () => controller?.snapshot().preferences.voiceId || 'Dennis', cacheDirectory: path.join(dataDirectory, 'speech-cache') });
  controller = new AppController({ version: app.getVersion(), store, credentials, speech, memory, providers, chatgpt, modelClient: new ModelClient(providers), agent: runtime, dialogAgent: dialogRuntime, createWorker, workspace, profileDirectory: dataDirectory,
    publishComputerFrame: frame => { if (window && !window.isDestroyed()) window.webContents.send('openhiatus:computer-frame', decodeComputerFrame(frame)); },
    publish: state => { if (window && !window.isDestroyed()) window.webContents.send('openhiatus:state', decodeSnapshot(state)); },
  });
  await controller.initialize();
  const rendererFile = path.join(__dirname, 'renderer', 'index.html'), rendererUrl = pathToFileURL(rendererFile).href;
  window = new BrowserWindow({ width: 1360, height: 900, minWidth: 980, minHeight: 700, title: APP_DISPLAY_NAME, backgroundColor: '#131714', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false, backgroundThrottling: false } });
  window.removeMenu();
  voiceOverlay = new VoiceOverlay({
    canShow: () => !!window && !window.isDestroyed() && (window.isMinimized() || !window.isVisible() || !window.isFocused()) && !quitting,
    bounds: () => { const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea; const width = Math.min(520, area.width - 32), height = Math.min(300, area.height - 32); return { x: area.x + area.width - width - 16, y: area.y + area.height - height - 16, width, height }; },
    createWindow: () => {
      const overlay = new BrowserWindow({ width: 520, height: 300, title: `${APP_DISPLAY_NAME} · Sprache`, show: false, frame: false, focusable: false, alwaysOnTop: true, skipTaskbar: true, resizable: false, movable: false, minimizable: false, maximizable: false, closable: false, backgroundColor: '#16201c', autoHideMenuBar: true, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false } });
      overlay.removeMenu(); overlay.setIgnoreMouseEvents(true); overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); overlay.webContents.on('will-navigate', event => event.preventDefault()); return overlay;
    },
  });
  window.on('close', event => {
    // Keep the window available until process termination and both durable stores
    // confirm shutdown; a failed flush must leave a visible way to retry closing.
    if (!disposed) { event.preventDefault(); if (!quitting) app.quit(); }
  });
  window.on('focus', () => voiceOverlay?.hide());
  window.on('closed', () => { voiceOverlay?.dispose(); void voiceHotkeys?.dispose().catch(() => {}); });
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(contents === window?.webContents && contents.getURL() === rendererUrl && permission === 'media' && 'mediaTypes' in details && !!details.mediaTypes?.includes('audio') && !details.mediaTypes.includes('video'));
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission) => contents === window?.webContents && contents.getURL() === rendererUrl && permission === 'media');
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('render-process-gone', () => { voiceOverlay?.stop(); void controller?.stop().catch(() => {}); });
  powerMonitor.on('suspend', () => { voiceOverlay?.stop(); void controller?.stop().catch(() => {}); });
  const ipcController = controller;
  const ipc = createIpcRouter({ controller: ipcController, reportError: error => ipcController.reportError(error), platform: {
    stopVoiceOverlay: () => voiceOverlay?.stop(),
    openChatGPTUsage: () => shell.openExternal('https://chatgpt.com/settings/usage'),
    openWorkspace: async () => { const error = await shell.openPath(workspace); if (error) throw new Error('Arbeitsordner konnte nicht geöffnet werden.'); },
    openSkillsFolder: async () => { const error = await shell.openPath(path.join(home, 'skills')); if (error) throw new Error('Der Skill-Ordner konnte nicht geöffnet werden.'); },
    revealFile: async file => { shell.showItemInFolder(await resolveDemoFile(workspace, file, [], true)); },
  } });
  const trustedRenderer = (event: { sender: unknown; senderFrame: { url: string } | null }): boolean => {
    if (!controller || quitting || !window || window.isDestroyed()) return false;
    return event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === rendererUrl;
  };
  ipcMain.on('openhiatus:voice-overlay', (event, value: unknown) => {
    if (!trustedRenderer(event)) return;
    const state = parseVoiceOverlayState(value); if (state) voiceOverlay?.update(state);
  });
  ipcMain.handle('openhiatus:call', async (event, method: unknown, args: unknown): Promise<IpcResponse> => {
    if (!trustedRenderer(event)) return { ok: false, error: 'Unzulässiger Aufruf.' };
    return ipc.dispatch(method, args);
  });
  await window.loadFile(rendererFile); void controller.start();
  let registered = false;
  try { registered = globalShortcut.register('CommandOrControl+Alt+F12', () => { voiceOverlay?.stop(); window?.webContents.send('openhiatus:emergency-stop'); void controller?.stop().catch(() => {}); }); } catch { /* Local Stop remains available. */ }
  if (!registered) controller.reportError(new Error('Globaler Stopp-Hotkey ist belegt. Stopp im Fenster und Escape bleiben verfügbar.'));
  let registeredVoiceKeys = { F8: false, F9: false }, voiceHotkeyFailed = false;
  try {
    const executable = app.isPackaged ? path.join(process.resourcesPath, 'native', 'openhiatus-hotkeys.exe') : path.join(__dirname, 'native', 'openhiatus-hotkeys.exe');
    voiceHotkeys = await startNativeVoiceHotkeys({ executable, onPress: key => {
      if (quitting || !window || window.isDestroyed() || window.webContents.isLoading()) return;
      if (window.isFocused() && window.isVisible() && !window.isMinimized()) voiceOverlay?.hide(); else voiceOverlay?.arm();
      window.webContents.send(key === 'F8' ? 'openhiatus:toggle-recording' : 'openhiatus:submit-draft');
    }, onError: error => {
      voiceHotkeyFailed = true; registeredVoiceKeys = { F8: false, F9: false };
      if (!quitting) { controller?.updateHotkeys({ recording: false, submit: false, stop: registered }); controller?.reportError(error); }
    } });
    if (quitting || window.isDestroyed()) { await voiceHotkeys.dispose(); return; }
    registeredVoiceKeys = voiceHotkeyFailed ? { F8: false, F9: false } : voiceHotkeys.registered;
    const missing = (['F8', 'F9'] as const).filter(key => !registeredVoiceKeys[key]);
    if (missing.length) controller.reportError(new Error(`${missing.join(' und ')} konnte nicht systemweit registriert werden. Möglicherweise belegt ein anderes Programm die Taste. Die Schaltflächen im ${APP_DISPLAY_NAME}-Fenster bleiben verfügbar.`));
  } catch { controller.reportError(new Error(`F8 und F9 konnten nicht systemweit eingerichtet werden. Die Schaltflächen im ${APP_DISPLAY_NAME}-Fenster bleiben verfügbar.`)); }
  controller.updateHotkeys({ recording: registeredVoiceKeys.F8, submit: registeredVoiceKeys.F9, stop: registered });
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') { voiceOverlay?.stop(); window?.webContents.send('openhiatus:emergency-stop'); void controller?.stop().catch(() => {}); }
    if ((input.key === 'F8' || input.key === 'F9') && registeredVoiceKeys[input.key] && !input.control && !input.alt && !input.shift && !input.meta) event.preventDefault();
  });
}
app.on('second-instance', () => { window?.restore(); window?.focus(); });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (disposed) return; event.preventDefault(); if (quitting) return; quitting = true; voiceOverlay?.stop();
  void (controller?.dispose() ?? Promise.resolve()).then(async () => { await memoryWriter?.dispose(); await stateWriter?.dispose(); services?.dispose(); voiceOverlay?.dispose(); await voiceHotkeys?.dispose(); disposed = true; globalShortcut.unregisterAll(); app.quit(); }).catch(() => {
    quitting = false; void dialog.showMessageBox({ type: 'error', title: `${APP_DISPLAY_NAME} konnte die Arbeit nicht sicher beenden`, message: `Die laufende Arbeit oder das Speichern konnte nicht sicher abgeschlossen werden. ${APP_DISPLAY_NAME} bleibt geöffnet. Bitte erneut versuchen.` });
  });
});
if (locked) app.whenReady().then(createApp).catch(() => { void dialog.showMessageBox({ type: 'error', title: APP_DISPLAY_NAME, message: `${APP_DISPLAY_NAME} konnte nicht starten. Bitte prüfen, ob das vollständige App-Paket und das lokale Datenverzeichnis zugänglich sind.` }).then(async () => { await Promise.allSettled([memoryWriter?.dispose(), stateWriter?.dispose()]); disposed = true; app.quit(); }); });
