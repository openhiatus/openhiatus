import { app, BrowserWindow, dialog, globalShortcut, ipcMain, powerMonitor, safeStorage, screen, session, shell } from 'electron';
import path from 'node:path';
import { getUiLanguage, setUiLanguage, t, translateDiagnostic } from '../shared/i18n';
import { initialUiLanguage } from './windows-language';
import { mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ChatGPTAuth } from './chatgpt-auth';
import { AppController } from './controller';
import { PiAdapter } from './pi';
import { createToolRegistry, defineTool } from './modules/tools';
import { ServiceBroker } from './modules/services';
import { GoogleCalendarAuth } from './platform/services/google-calendar-auth';
import { GoogleCalendarService } from './platform/services/google-calendar';
import { createComputerToolContribution } from './platform/tools';
import { createDelegatedComputerToolContribution } from './platform/tools/computer-delegation';
import { AGENT_INSTRUCTIONS, COMPUTER_PLANNER_INSTRUCTIONS } from './instructions';
import { ProviderStore, ModelClient } from './providers';
import { StateStore, CredentialStore } from './storage';
import { WorkerStateStore, WorkerMemoryStore } from './platform/persistence';
import { SpeechService } from './speech';
import { resolveDemoFile } from './resolve-demo-file';
import { redact } from './redact';
import { ActivityOverlay, ACTIVITY_OVERLAY_RESIZE_CHANNEL } from './activity-overlay';
import { activityOverlayState } from './activity-overlay-state';
import { parseActivityPresence, type ActivityPresence } from '../shared/activity-presence';
import { startNativeVoiceHotkeys } from './native-hotkeys';
import { createIpcRouter } from './ipc';
import { decodeComputerFrame, decodeSnapshot, type IpcResponse } from '../shared/ipc';
import type { AgentEvent, BackgroundJob } from '../shared/contracts';
import { APP_DISPLAY_NAME, APP_SLUG } from '../shared/branding';
import { GuidanceOverlay } from './platform/screen-help/overlay';
import { ScreenHelpService } from './platform/screen-help/service';
import { ScreenMonitor } from './platform/screen-help/monitor';
import { captureHelpScreen } from './platform/screen-help/capture';
import { installHelpSkill, readHelpSkill } from './platform/screen-help/skill';
import { createScreenHelpTools } from './platform/tools/screen-help-tools';
import { createComputerImageProcessor } from './computer-images';
import { sharedDesktopCoordinator } from './desktop-coordinator';
import { DesktopControlOverlay } from './desktop-control-overlay';
import { startDesktopProtection, type ProtectDesktop } from './desktop-protection';
import { AUTOSTART_ARGUMENT, autostartUnavailableReason, WindowsAutostart } from './windows-autostart';

app.setName(APP_DISPLAY_NAME);
app.setAppUserModelId('local.openhiatus.assistant');
const profileArg = process.argv.find(arg => arg.startsWith('--data-dir='))?.slice('--data-dir='.length);
const dataDirectory = profileArg && path.isAbsolute(profileArg) ? profileArg : path.join(app.getPath('appData'), APP_SLUG);
app.setPath('userData', dataDirectory);
const autostart = new WindowsAutostart({ app, executable: process.execPath,
  unavailableReason: autostartUnavailableReason(process.platform, app.isPackaged, profileArg !== undefined) });
const startedAtLogin = process.argv.includes(AUTOSTART_ARGUMENT);
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
let window: BrowserWindow | undefined, controller: AppController | undefined;
let activityOverlay: ActivityOverlay | undefined;
let desktopControlOverlay: DesktopControlOverlay | undefined;
let unsubscribeDesktop: (() => void) | undefined;
let guidanceOverlay: GuidanceOverlay | undefined, screenHelp: ScreenHelpService | undefined, screenMonitor: ScreenMonitor | undefined;
let voicePresence: ActivityPresence = { phase: 'idle' };
function stopActivityPresence(): void { voicePresence = { phase: 'idle' }; activityOverlay?.stop(); screenHelp?.clear(); void googleCalendarAuth?.cancelLogin(); }
let services: ServiceBroker | undefined;
let googleCalendarAuth: GoogleCalendarAuth | undefined;
function syncCalendarConnection(): void {
  const snapshot = googleCalendarAuth?.snapshot();
  if (!services || !snapshot) return;
  if (snapshot.status !== 'ready') { services.removeConnection('google_calendar', 'google'); return; }
  const selected = googleCalendarAuth!.selected();
  services.setConnection({ provider: 'google_calendar', id: 'google', label: selected.title, account: snapshot.account!, status: 'ready', capabilities: ['calendar.read', ...(['owner', 'writer'].includes(selected.accessRole) ? ['calendar.write'] : [])] });
}
let stateWriter: WorkerStateStore | undefined;
let memoryWriter: WorkerMemoryStore | undefined;
let quitting = false, disposed = false;
let voiceHotkeys: Awaited<ReturnType<typeof startNativeVoiceHotkeys>> | undefined;
function stopDesktopControl(error?: Error): void {
  stopActivityPresence(); window?.webContents.send('openhiatus:emergency-stop');
  void controller?.stop().catch(failure => controller?.reportError(failure));
  if (error) controller?.reportError(error);
}

async function createApp(): Promise<void> {
  const workspace = path.join(dataDirectory, 'Arbeitsbereich'), home = path.join(dataDirectory, 'pi');
  mkdirSync(workspace, { recursive: true }); mkdirSync(path.join(home, 'skills'), { recursive: true });
  const helpSkill = await installHelpSkill(home, path.join(__dirname, 'bildschirmhilfe', 'SKILL.md'));
  const demoFile = path.join(workspace, 'projektnotizen.md');
  if (!existsSync(demoFile)) copyFileSync(path.join(__dirname, 'demo', 'projektnotizen.md'), demoFile);
  const initialStore = new StateStore(dataDirectory), credentials = new CredentialStore(dataDirectory, safeStorage);
  const initialState = initialStore.load();
  if (!['state.json', 'state.backup.json', 'state.json.tmp'].some(file => existsSync(path.join(dataDirectory, file)))) {
    initialState.preferences.uiLanguage = profileArg ? 'de' : initialUiLanguage(app.getLocale());
  }
  setUiLanguage(initialState.preferences.uiLanguage ?? 'de');
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
  const calendarAuth = new GoogleCalendarAuth(credentials, { openBrowser: async value => {
    const url = new URL(value); if (url.origin !== 'https://accounts.google.com' || url.pathname !== '/o/oauth2/v2/auth' || url.username || url.password) throw Error('Ungültige Google-Anmeldeadresse.');
    await shell.openExternal(url.href);
  }, onChange: syncCalendarConnection });
  googleCalendarAuth = calendarAuth;
  const calendar = new GoogleCalendarService(calendarAuth); initialSecrets.push(...calendarAuth.secrets());
  for (const provider of ['inworld', 'elevenlabs']) {
    try { const key = credentials.get(provider); if (key) initialSecrets.push(key); } catch { /* Never expose unavailable credentials. */ }
  }
  const memory = new WorkerMemoryStore(path.join(dataDirectory, 'Gedächtnis'), {
    workerPath: path.join(__dirname, 'memory-worker.cjs'),
    getSecrets: () => controller?.redactionSecrets() ?? initialSecrets,
    sanitize: value => controller?.sanitizeMemory(value) ?? redact(value, initialSecrets),
  });
  memoryWriter = memory;
  const processHost = app.isPackaged ? path.join(process.resourcesPath, 'native', 'openhiatus-process-host.exe') : path.join(__dirname, 'native', 'openhiatus-process-host.exe');
  const runtimeOptions = { executable: process.execPath, hostEntry: path.join(__dirname, 'agent-host.mjs'), processHost, home, workspace, providers, getSecrets: () => calendarAuth.secrets() };
  services = new ServiceBroker();
  const serviceBroker = services;
  serviceBroker.register(calendar.adapter()); syncCalendarConnection();
  const nativeDirectory = app.isPackaged ? path.join(process.resourcesPath, 'native') : path.join(__dirname, 'native');
  const protectDesktop: ProtectDesktop = async signal => {
    if (!desktopControlOverlay || quitting) throw Error('Die Desktopübernahme ist noch nicht verfügbar.');
    await desktopControlOverlay.ready(); signal.throwIfAborted();
    return startDesktopProtection({ executable: path.join(nativeDirectory, 'openhiatus-input-guard.exe'), signal,
      voiceKeys: controller?.snapshot().hotkeys, onStop: stopDesktopControl,
      onVoice: key => { if (!quitting && window && !window.isDestroyed()) window.webContents.send(key === 'F8' ? 'openhiatus:toggle-recording' : 'openhiatus:submit-draft'); } });
  };
  const monitor = screenMonitor = new ScreenMonitor(path.join(nativeDirectory, 'openhiatus-screen-watch.exe'), () => screenHelp?.clear());
  const help = screenHelp = new ScreenHelpService({
    skill: async () => redact(await readHelpSkill(helpSkill), controller?.redactionSecrets() ?? initialSecrets), processor: createComputerImageProcessor, busy: () => sharedDesktopCoordinator.isBusy,
    currentStamp: () => monitor.current(), clear: () => guidanceOverlay?.clear(),
    capture: async signal => {
      guidanceOverlay?.clear();
      const capture = async () => { await new Promise(resolve => setTimeout(resolve, 45)); signal.throwIfAborted(); return captureHelpScreen(() => monitor.current(), signal); };
      return activityOverlay ? activityOverlay.runHidden(capture) : capture();
    },
    show: async (rect, image, bounds, label, color) => { if (!guidanceOverlay || quitting) throw Error('Bildschirmhilfe nicht verfügbar.'); await guidanceOverlay.show(rect, image, bounds, label, color); },
  });
  const runDesktopOperation = <T>(operation: () => Promise<T>): Promise<T> => { help.clear(); return activityOverlay?.runHidden(operation) ?? operation(); };
  const computerTools = () => createComputerToolContribution({
    protectDesktop,
    getOverviewScaleDivisor: () => controller?.snapshot().preferences.computerOverviewScaleDivisor ?? 1,
    getDetailScaleDivisor: () => controller?.snapshot().preferences.computerDetailScaleDivisor ?? 1,
    runDesktopOperation,
  });
  const runtime = new PiAdapter({ ...runtimeOptions, role: 'worker', tools: createToolRegistry([computerTools()]),
    getComputerImageRetentionCalls: () => controller?.snapshot().preferences.computerImageRetentionCalls ?? 0,
    getComputerWorkingMemoryCalls: () => controller?.snapshot().preferences.computerWorkingMemoryCalls ?? 0,
    getIdentityInstructions: () => controller?.identityInstructions() ?? '', onEvent: event => controller?.handle(event) });
  const dialogRuntime = new PiAdapter({ ...runtimeOptions, role: 'dialog', computerImageRetentionCalls: 2, getIdentityInstructions: () => controller?.identityInstructions() ?? '',
    tools: createToolRegistry([{ bind: () => ({ tools: (controller?.dialogTools() ?? []).map(definition => defineTool({
      definition, audience: 'dialog', validate: args => args, execute: async (args, context) => {
        if (!controller) throw new Error(`${APP_DISPLAY_NAME} wird noch vorbereitet.`);
        return controller.dialogTool(definition.name, args, context.signal);
      },
    })) }) }, createScreenHelpTools(help)]), onEvent: event => { if (event.type === 'completed' && event.status !== 'completed') help.clear(); controller?.handleDialog(event); },
  });
  const createWorker = (onEvent: (event: AgentEvent) => void, job: BackgroundJob) => {
    // Admission captured these values before asynchronous memory lookup/queueing.
    const computer = job.computer;
    const desktop = computer?.delegationEnabled ? createDelegatedComputerToolContribution({ model: computer.model, fast: computer.fast, thinkingLevel: computer.thinkingLevel, protectDesktop,
      getOverviewScaleDivisor: () => computer.overviewScaleDivisor,
      getDetailScaleDivisor: () => computer.detailScaleDivisor ?? 1,
      runDesktopOperation,
      createWorker: (onEvent, tools, instructions) => new PiAdapter({ ...runtimeOptions, role: 'worker', computerOnly: true, instructions, tools,
        computerImageRetentionCalls: computer.imageRetentionCalls ?? 0,
        computerWorkingMemoryCalls: computer.workingMemoryCalls ?? 0, onEvent }),
    }) : createComputerToolContribution({ protectDesktop, getOverviewScaleDivisor: () => computer?.overviewScaleDivisor ?? 1,
      getDetailScaleDivisor: () => computer?.detailScaleDivisor ?? 1, runDesktopOperation });
    return new PiAdapter({ ...runtimeOptions, role: 'worker',
      computerImageRetentionCalls: computer?.imageRetentionCalls ?? 0,
      computerWorkingMemoryCalls: computer?.workingMemoryCalls ?? 0,
      ...(computer?.delegationEnabled ? { instructions: `${AGENT_INSTRUCTIONS}\n\n${COMPUTER_PLANNER_INSTRUCTIONS}` } : {}),
      tools: createToolRegistry([desktop, serviceBroker.createTools(job.id, ['read', 'write'])]),
      getIdentityInstructions: () => job.identityInstructions ?? '', onEvent });
  };
  const speech = new SpeechService({ getKey: provider => credentials.get(provider), getProvider: () => controller?.snapshot().preferences.speechProvider ?? 'inworld',
    getVoice: provider => (provider === 'elevenlabs' ? controller?.snapshot().preferences.elevenlabsVoiceId : controller?.snapshot().preferences.voiceId) ?? '', cacheDirectory: path.join(dataDirectory, 'speech-cache') });
  controller = new AppController({ version: app.getVersion(), store, credentials, speech, memory, providers, chatgpt, modelClient: new ModelClient(providers), agent: runtime, dialogAgent: dialogRuntime, createWorker, workspace, profileDirectory: dataDirectory,
    serviceContext: { instructions: () => calendar.instructions(), secrets: () => calendarAuth.secrets() },
    publishComputerFrame: frame => { if (window && !window.isDestroyed()) window.webContents.send('openhiatus:computer-frame', decodeComputerFrame(frame)); },
    publish: state => {
      const language = state.preferences.uiLanguage ?? 'de';
      const languageChanged = getUiLanguage() !== language;
      setUiLanguage(language);
      if (languageChanged) void desktopControlOverlay?.refresh().catch(error => stopDesktopControl(error));
      activityOverlay?.update(activityOverlayState(state, voicePresence));
      if (languageChanged) activityOverlay?.refresh();
      if (window && !window.isDestroyed()) window.webContents.send('openhiatus:state', decodeSnapshot(state));
    },
  });
  await controller.initialize();
  await memory.initializeProfile(controller.snapshot().preferences.assistantProfile ?? { name: '', personalityId: 'balanced', templates: [] });
  const rendererFile = path.join(__dirname, 'renderer', 'index.html'), rendererUrl = pathToFileURL(rendererFile).href;
  window = new BrowserWindow({ width: 1360, height: 900, minWidth: 560, minHeight: 440, show: !startedAtLogin, title: APP_DISPLAY_NAME, icon: path.join(__dirname, 'openhiatus.png'), backgroundColor: '#131714', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false, backgroundThrottling: false } });
  window.removeMenu();
  guidanceOverlay = new GuidanceOverlay(() => {
    const overlay = new BrowserWindow({ title: t('{0} · Bildschirmhilfe', APP_DISPLAY_NAME), show: false, transparent: true,
      frame: false, focusable: false, alwaysOnTop: true, skipTaskbar: true, hasShadow: false,
      resizable: false, movable: false, minimizable: false, maximizable: false, backgroundColor: '#00000000',
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false, backgroundThrottling: false } });
    overlay.removeMenu(); overlay.setIgnoreMouseEvents(true); overlay.setAlwaysOnTop(true, 'screen-saver');
    overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); overlay.webContents.on('will-navigate', event => event.preventDefault());
    return overlay;
  });
  activityOverlay = new ActivityOverlay({
    canShow: () => !!window && !window.isDestroyed() && !window.webContents.isDestroyed() && !quitting
      && (window.isMinimized() || !window.isVisible() || !window.isFocused()),
    workArea: () => window && !window.isDestroyed() ? screen.getDisplayMatching(window.getBounds()).workArea : screen.getPrimaryDisplay().workArea,
    onSizeChange: async size => { try { await controller?.savePreferences({ activityOverlaySize: size }); } catch (error) { controller?.reportError(error); throw error; } },
    createWindow: () => {
      const overlay = new BrowserWindow({ width: 144, height: 144, title: t('{0} · Arbeitsanzeige', APP_DISPLAY_NAME),
        show: false, transparent: true, frame: false, focusable: false, alwaysOnTop: true, skipTaskbar: true,
        resizable: false, movable: false, minimizable: false, maximizable: false, closable: false, backgroundColor: '#00000000', autoHideMenuBar: true,
        webPreferences: { preload: path.join(__dirname, 'activity-overlay-preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false } });
      overlay.removeMenu(); overlay.setIgnoreMouseEvents(true, { forward: true });
      overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      overlay.webContents.on('will-navigate', event => event.preventDefault());
      return overlay;
    },
  });
  activityOverlay.update(activityOverlayState(controller.snapshot(), voicePresence));
  desktopControlOverlay = new DesktopControlOverlay({ displays: () => screen.getAllDisplays(), createWindow: () => {
    const overlay = new BrowserWindow({ title: t('{0} · Desktopübernahme', APP_DISPLAY_NAME), show: false, transparent: true,
      frame: false, focusable: false, alwaysOnTop: true, skipTaskbar: true, hasShadow: false,
      resizable: false, movable: false, minimizable: false, maximizable: false, closable: false, backgroundColor: '#00000000',
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false, backgroundThrottling: false } });
    overlay.removeMenu(); overlay.setIgnoreMouseEvents(true); overlay.setAlwaysOnTop(true, 'screen-saver'); overlay.setContentProtection(true);
    overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); overlay.webContents.on('will-navigate', event => event.preventDefault());
    overlay.webContents.on('render-process-gone', () => stopDesktopControl(Error('Die Übernahmeanzeige wurde unterbrochen.')));
    return overlay;
  } });
  unsubscribeDesktop = sharedDesktopCoordinator.subscribe(phase => {
    controller?.updateDesktopControl(phase);
    void desktopControlOverlay?.update(phase).catch(error => stopDesktopControl(error));
  });
  window.on('close', event => {
    // Keep the window available until process termination and both durable stores
    // confirm shutdown; a failed flush must leave a visible way to retry closing.
    if (!disposed) { event.preventDefault(); if (!quitting) app.quit(); }
  });
  window.on('focus', () => activityOverlay?.refresh());
  const refreshActivityOverlay = () => activityOverlay?.refresh();
  window.on('blur', refreshActivityOverlay); window.on('minimize', refreshActivityOverlay); window.on('restore', refreshActivityOverlay);
  window.on('show', refreshActivityOverlay); window.on('hide', refreshActivityOverlay); window.on('move', refreshActivityOverlay); window.on('resize', refreshActivityOverlay);
  const displayChanged = () => { help.clear(); refreshActivityOverlay(); if (sharedDesktopCoordinator.isBusy) stopDesktopControl(); void desktopControlOverlay?.refresh().catch(error => stopDesktopControl(error)); };
  screen.on('display-added', displayChanged); screen.on('display-removed', displayChanged); screen.on('display-metrics-changed', displayChanged);
  window.on('closed', () => { unsubscribeDesktop?.(); desktopControlOverlay?.dispose(); activityOverlay?.dispose(); void voiceHotkeys?.dispose().catch(() => {}); });
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(contents === window?.webContents && contents.getURL() === rendererUrl && permission === 'media' && 'mediaTypes' in details && !!details.mediaTypes?.includes('audio') && !details.mediaTypes.includes('video'));
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission) => contents === window?.webContents && contents.getURL() === rendererUrl && permission === 'media');
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('did-start-loading', () => stopActivityPresence());
  window.webContents.on('render-process-gone', () => { stopActivityPresence(); void controller?.stop().catch(() => {}); });
  powerMonitor.on('suspend', () => { stopActivityPresence(); window?.webContents.send('openhiatus:emergency-stop'); void controller?.stop().catch(() => {}); });
  const ipcController = controller;
  const ipc = createIpcRouter({ controller: ipcController, reportError: error => ipcController.reportError(error), calendar: {
    googleCalendarSnapshot: async () => calendarAuth.snapshot(), saveGoogleCalendarClient: client => calendarAuth.configure(client),
    connectGoogleCalendar: async () => { await calendarAuth.connect(); return calendarAuth.snapshot(); }, cancelGoogleCalendarLogin: () => calendarAuth.cancelLogin(),
    disconnectGoogleCalendar: () => calendarAuth.disconnect(), selectGoogleCalendar: async id => calendarAuth.select(id), googleCalendarEvents: query => calendar.list(query, AbortSignal.timeout(30000)),
    openGoogleCalendarSetup: () => shell.openExternal('https://console.cloud.google.com/apis/library/calendar-json.googleapis.com'),
  }, platform: {
    autostartSettings: () => autostart.read(), setAutostart: enabled => autostart.set(enabled),
    stopActivityPresence,
    openChatGPTUsage: () => shell.openExternal('https://chatgpt.com/settings/usage'),
    openWorkspace: async () => { const error = await shell.openPath(workspace); if (error) throw new Error('Arbeitsordner konnte nicht geöffnet werden.'); },
    openSkillsFolder: async () => { const error = await shell.openPath(path.join(home, 'skills')); if (error) throw new Error('Der Skill-Ordner konnte nicht geöffnet werden.'); },
    revealFile: async file => { shell.showItemInFolder(await resolveDemoFile(workspace, file, [], true)); },
  } });
  const trustedRenderer = (event: { sender: unknown; senderFrame: { url: string } | null }): boolean => {
    if (!controller || quitting || !window || window.isDestroyed()) return false;
    return event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === rendererUrl;
  };
  ipcMain.on('openhiatus:activity-presence', (event, value: unknown) => {
    if (!trustedRenderer(event)) return;
    const presence = parseActivityPresence(value);
    if (presence && controller) { if (presence.phase === 'listening') help.clear(); voicePresence = presence; activityOverlay?.update(activityOverlayState(controller.snapshot(), voicePresence)); }
  });
  ipcMain.on(ACTIVITY_OVERLAY_RESIZE_CHANNEL, (event, value: unknown) => {
    if (!quitting && event.senderFrame === event.sender.mainFrame) activityOverlay?.handleResize(event.sender, value);
  });
  ipcMain.handle('openhiatus:call', async (event, method: unknown, args: unknown): Promise<IpcResponse> => {
    if (!trustedRenderer(event)) return { ok: false, error: 'Unzulässiger Aufruf.' };
    const response = await ipc.dispatch(method, args);
    return response.ok ? response : { ...response, error: translateDiagnostic(response.error) };
  });
  await window.loadFile(rendererFile);
  // Show without taking focus, then keep the normal window minimized in the taskbar.
  if (startedAtLogin) { window.showInactive(); window.minimize(); }
  void controller.start();
  let registered = false;
  try { registered = globalShortcut.register('CommandOrControl+Alt+F12', () => { stopActivityPresence(); window?.webContents.send('openhiatus:emergency-stop'); void controller?.stop().catch(() => {}); }); } catch { /* Local Stop remains available. */ }
  if (!registered) controller.reportError(new Error('Globaler Stopp-Hotkey ist belegt. Stopp im Fenster und Escape bleiben verfügbar.'));
  let registeredVoiceKeys = { F8: false, F9: false }, voiceHotkeyFailed = false;
  try {
    const executable = app.isPackaged ? path.join(process.resourcesPath, 'native', 'openhiatus-hotkeys.exe') : path.join(__dirname, 'native', 'openhiatus-hotkeys.exe');
    voiceHotkeys = await startNativeVoiceHotkeys({ executable, onPress: key => {
      if (quitting || !window || window.isDestroyed() || window.webContents.isLoading()) return;
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
    if (input.type === 'keyDown' && input.key === 'Escape') { stopActivityPresence(); window?.webContents.send('openhiatus:emergency-stop'); void controller?.stop().catch(() => {}); }
    if ((input.key === 'F8' || input.key === 'F9') && registeredVoiceKeys[input.key] && !input.control && !input.alt && !input.shift && !input.meta) event.preventDefault();
  });
}
app.on('second-instance', (_event, argv) => {
  if (argv.includes(AUTOSTART_ARGUMENT)) return;
  window?.show(); window?.restore(); window?.focus();
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (disposed) return; event.preventDefault(); if (quitting) return; quitting = true; stopActivityPresence();
  void (controller?.dispose() ?? Promise.resolve()).then(async () => { await googleCalendarAuth?.dispose(); await memoryWriter?.dispose(); await stateWriter?.dispose(); services?.dispose(); guidanceOverlay?.dispose(); activityOverlay?.dispose(); await screenMonitor?.dispose(); await voiceHotkeys?.dispose(); disposed = true; globalShortcut.unregisterAll(); app.quit(); }).catch(() => {
    quitting = false; if (controller) activityOverlay?.update(activityOverlayState(controller.snapshot(), voicePresence));
    void dialog.showMessageBox({ type: 'error', title: t('{0} konnte die Arbeit nicht sicher beenden', APP_DISPLAY_NAME), message: t('Die laufende Arbeit oder das Speichern konnte nicht sicher abgeschlossen werden. {0} bleibt geöffnet. Bitte erneut versuchen.', APP_DISPLAY_NAME) });
  });
});
if (locked) app.whenReady().then(createApp).catch(() => { void dialog.showMessageBox({ type: 'error', title: APP_DISPLAY_NAME, message: t('{0} konnte nicht starten. Bitte prüfen, ob das vollständige App-Paket und das lokale Datenverzeichnis zugänglich sind.', APP_DISPLAY_NAME) }).then(async () => { await Promise.allSettled([memoryWriter?.dispose(), stateWriter?.dispose()]); disposed = true; app.quit(); }); });
