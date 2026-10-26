import { APP_DISPLAY_NAME } from '../shared/branding';
import { parseUiLanguage } from '../shared/ui-language';
import { randomUUID } from 'node:crypto';
import { nextReceipt, RECEIPT_PHRASES } from '../shared/receipts';
import { favoriteLevel, parseSkillFavorites } from '../shared/skill-favorites';
import { computerDetailDivisor } from '../shared/computer-views';
import { computerImageRetentionCalls, computerWorkingMemoryCalls } from '../shared/computer-task-settings';
import { favoriteSkillsContext } from './skill-favorites-context';
import type { Activity, AudioClip, BackgroundJob, AgentAdapter, AgentEvent, ComputerFrame, Message, Preferences, SkillCatalog, Snapshot, SpeechCue, ProviderView, ProviderInput, DynamicFunctionTool, DynamicToolResponse, ChatGPTConnection } from '../shared/contracts';
import { redact } from './redact';
import { toSpokenText } from '../shared/spoken-text';
import { activityOverlaySize, sidebarMode, ACTIVITY_OVERLAY_DEFAULT_SIZE } from '../shared/workspace-preferences';
import { assistantProfileInstructions, DEFAULT_ASSISTANT_PROFILE, parseAssistantProfile, profileIdentityContent } from '../shared/assistant-profile';
import { hasIdentityFiles, identityFilesInstructions, identityName, isIdentityFile } from '../shared/identity-documents';
import type { CoreProposal, CoreProposalInput, MemoryContext, MemoryDocument, MemorySearchResult, MemorySnapshot, MemorySource, MemoryPeriodRequest, MemoryPeriodPage } from '../shared/memory';
import { parseMemoryReply, runtimeInstructions } from './instructions';
import { MemoryReportCoordinator, type SummaryBackend, type SummaryCallEvidence } from './modules/memory-reports';
import { DIALOG_TOOLS } from './dialog';
import { itSupporterInstructions } from './it-supporter-instructions';
import { BackgroundTaskCoordinator, recoverBackgroundJobs, validateUsage } from './modules/tasks';
import { ConversationCoordinator } from './modules/conversation';
import { ModelManagementCoordinator } from './modules/models';
import { DirectTaskCoordinator, recoverForegroundTask } from './modules/direct-task';
import { StateJournal } from './modules/state-journal';
import { WorkHistory } from './modules/work-history';
import { jobWorkId, requestWorkId } from '../shared/work-history';
import { openhiatusCapabilitiesPath, buildOpenhiatusCapabilities, writeOpenhiatusCapabilities, type OpenhiatusCapabilitiesDocument } from './capabilities';

type MemoryResult<T> = T | Promise<T>;
interface MemoryBackend extends Partial<SummaryBackend> {
  initialize?(): Promise<void>;
  flush?(): Promise<void>;
  snapshot(): MemoryResult<MemorySnapshot>;
  instructionDocuments?(): Array<Pick<MemoryDocument, 'id' | 'version' | 'content'>>;
  capture(messages: Message[], conversationId: string): MemoryResult<void>;
  retrieve(query: string, options?: { maxBytes?: number; maxChars?: number; includeInstructions?: boolean }): MemoryResult<MemoryContext>;
  rebuild(): MemoryResult<MemorySnapshot>;
  edit(id: string, content: string, expectedVersion: number): MemoryResult<MemorySnapshot>;
  propose(input: CoreProposalInput): MemoryResult<CoreProposal>;
  decide(id: string, decision: 'approve' | 'reject'): MemoryResult<MemorySnapshot>;
  source(id: string): MemoryResult<MemorySource | undefined>;
  search(query: string): MemoryResult<MemorySearchResult[]>;
  readPeriod?(request: MemoryPeriodRequest): MemoryResult<MemoryPeriodPage>;
}
interface CaptureBatch { messages: Message[]; firstId: string; sequence: number; }

type InternalSnapshot = Omit<Snapshot, 'jobs'> & { jobs?: BackgroundJob[] };
type SavedState = Pick<InternalSnapshot, 'messages' | 'activity' | 'task' | 'preferences' | 'jobs' | 'usage' | 'workItems'>;
interface Dependencies {
  version?: string;
  store: { load(): SavedState; save(state: SavedState): void | Promise<void> };
  credentials: { get(name: string): string | undefined; set(name: string, value: string): void; remove(name: string): void };
  speech: { transcribe(clip: AudioClip, signal?: AbortSignal): Promise<string>; synthesize(text: string, signal?: AbortSignal): Promise<AudioClip>; test(signal?: AbortSignal): Promise<AudioClip>; prewarm?(texts: readonly string[], signal?: AbortSignal): Promise<void> };
  /** Chooses the neutral receipt; injectable so tests stay deterministic. */
  receiptPhrase?(last?: string): string;
  serviceContext?: { instructions(): string; secrets(): string[] };
  agent: AgentAdapter;
  dialogAgent?: AgentAdapter;
  createWorker?(onEvent: (event: AgentEvent) => void, job: BackgroundJob): AgentAdapter;
  modelClient?: { complete(prompt: string, model: string, signal: AbortSignal, evidence?: SummaryCallEvidence): Promise<string> };
  chatgpt?: { snapshot(): ChatGPTConnection; signIn(): Promise<void>; cancelSignIn(): Promise<void>; signOut(): Promise<void> };
  providers?: { list(): ProviderView[]; save(input: ProviderInput): Promise<void>; test(id: string): Promise<void>; remove(id: string): Promise<void>; secrets(): string[] };
  memory?: MemoryBackend;
  publishComputerFrame?(frame: ComputerFrame): void;
  workspace: string;
  profileDirectory?: string;
  publish(state: Snapshot): void;
  now?(): number;
}

export class AppController {
  private state: InternalSnapshot;
  private secrets: string[] = [];
  private audio = new Set<AbortController>();
  private closing = false;
  private shuttingDown = false;
  private stopDeferrals = 0;
  private readonly deferredMemoryCaptures: CaptureBatch[] = [];
  private readonly conversationIds = new Map<string, string>();
  private captureTail: Promise<void> = Promise.resolve();
  private captureSequence = 0;
  private processesDisposed = false;
  private readonly stateJournal: StateJournal<SavedState>;
  private initialization?: Promise<void>;
  private initialized = false;
  private consent?: Promise<void>;
  private disposal?: Promise<void>;
  private readonly memoryReports: MemoryReportCoordinator;
  private readonly modelManagement: ModelManagementCoordinator;
  private directTask?: DirectTaskCoordinator;
  private workEpoch = 0;
  private tasks?: BackgroundTaskCoordinator;
  private skillCatalog?: SkillCatalog;
  private skillRefresh?: Promise<void>;
  private conversation?: ConversationCoordinator;
  private lastReceipt?: string;
  private receiptWarmup?: AbortController;
  private readonly workHistory: WorkHistory;
  private resettingConversation = false;

  constructor(private readonly deps: Dependencies) {
    const saved = deps.store.load();
    saved.preferences.assistantProfile = parseAssistantProfile(saved.preferences.assistantProfile ?? DEFAULT_ASSISTANT_PROFILE);
    saved.preferences.voiceConversation ??= true;
    saved.preferences.fullAccessAcknowledged = saved.preferences.fullAccessAcknowledged === true;
    saved.preferences.dialogModel ??= '';
    saved.preferences.memoryModel ??= '';
    saved.preferences.computerModel ??= '';
    saved.preferences.computerDelegationEnabled = saved.preferences.computerDelegationEnabled === true;
    saved.preferences.computerFast ??= true;
    saved.preferences.sidebarMode ??= 'auto';
    saved.preferences.activityOverlayEnabled ??= false;
    saved.preferences.activityOverlaySize ??= ACTIVITY_OVERLAY_DEFAULT_SIZE;
    saved.preferences.computerDetailScaleDivisor = computerDetailDivisor(saved.preferences.computerDetailScaleDivisor ?? 1);
    saved.preferences.computerImageRetentionCalls = computerImageRetentionCalls(saved.preferences.computerImageRetentionCalls ?? 0);
    saved.preferences.computerWorkingMemoryCalls = computerWorkingMemoryCalls(saved.preferences.computerWorkingMemoryCalls ?? 0);
    saved.preferences.chatgptBackgroundUsage = saved.preferences.chatgptBackgroundUsage === true;
    saved.task = recoverForegroundTask(saved.task);
    if ((!deps.dialogAgent || !deps.createWorker) && saved.jobs) saved.jobs = recoverBackgroundJobs(saved.jobs);
    let hasSpeech = false;
    try { const key = deps.credentials.get('inworld'); if (key) { this.secrets.push(key); hasSpeech = true; } } catch { /* credential read fails closed */ }
    this.state = { ...saved, connections: { agent: 'offline', account: '', speech: hasSpeech ? 'saved' : 'missing' }, models: [], providers: [], workspace: deps.workspace, version: deps.version ?? 'Entwicklung' };
    this.workHistory = new WorkHistory(saved.workItems, text => this.clean(text));
    delete this.state.workItems; // The journal owns this projection; avoid cloning a stale second copy.
    if ((!deps.dialogAgent || !deps.createWorker) && saved.jobs) this.workHistory.jobs(saved.jobs);
    this.stateJournal = new StateJournal({
      snapshot: () => {
        const { messages, activity, task, preferences, jobs, usage } = this.state;
        return { messages, activity, task, preferences, workItems: this.workHistory.snapshot(), ...(usage ? { usage } : {}), ...(jobs ? { jobs } : {}) };
      },
      commit: snapshot => deps.store.save(snapshot),
      publish: () => { if (!this.closing) deps.publish(this.snapshot()); },
      checkpointsBlocked: () => this.stopPending(),
      checkpointFailed: error => this.activity('error', 'Verlauf konnte nicht gespeichert werden', error instanceof Error ? error.message : 'Lokaler Schreibfehler'),
    });
    this.modelManagement = new ModelManagementCoordinator({ model: saved.preferences.model, dialogModel: saved.preferences.dialogModel, memoryModel: saved.preferences.memoryModel, computerModel: saved.preferences.computerModel }, {
      providers: deps.providers, chatgpt: deps.chatgpt,
      lifecycle: {
        assertIdle: () => this.ensureIdle(), closed: () => this.closing, workRevision: () => this.workEpoch,
        taskActive: () => ['running', 'stopping'].includes(this.state.task.status), invalidateThread: () => this.invalidateThread(),
        stopIdleRuntimes: async () => { await Promise.all([deps.agent.stop(), deps.dialogAgent?.stop()]); }, restart: () => this.start(),
      },
      projection: { publish: state => {
        this.state.providers = state.providers; this.state.models = state.models; this.state.connections.agent = state.agent; this.state.connections.account = state.account;
        this.state.preferences = { ...this.state.preferences, ...state.selections };
        if (!state.models.some(model => model.id === state.selections.computerModel)) this.state.preferences.computerDelegationEnabled = false;
        if (state.chatgpt) this.state.chatgpt = state.chatgpt;
      }, changed: save => this.changed(save) },
      clean: text => this.clean(text),
    });
    this.modelManagement.initialize();
    this.memoryReports = new MemoryReportCoordinator({
      memory: deps.memory?.planSummaries && deps.memory.summaryInput && deps.memory.applySummary ? deps.memory as SummaryBackend : undefined,
      modelClient: deps.modelClient,
      settings: () => ({ memoryModel: this.state.preferences.memoryModel, workModel: this.state.preferences.model,
        automatic: this.state.preferences.memoryAutoSummarize === true, chatgptBackgroundUsage: this.state.preferences.chatgptBackgroundUsage === true }),
      availability: {
        assertIdle: () => this.ensureWorkIdle(),
        blocked: () => this.closing || this.shuttingDown || this.stopPending() || this.jobsBusy() || this.state.task.status === 'running',
      },
      capture: () => this.captureMemory(true),
      projection: { publish: state => { this.state.summary = state; }, changed: save => this.changed(save) },
      effects: { clean: text => this.clean(text), activity: (kind, title, detail) => this.activity(kind, title, detail), reportError: error => this.reportError(error) },
    });
    this.state.summary = this.memoryReports.snapshot();
    if (deps.dialogAgent && deps.createWorker) {
      // Dynamic dialogue tools belong to a newly created thread. A persisted
      // worker/older dialogue thread cannot acquire them through thread/resume.
      // Keep its messages as factual context and start this app's dialogue fresh.
      delete this.state.task.threadId;
      delete this.state.task.turnId;
      this.state.speech = [];
      this.tasks = new BackgroundTaskCoordinator(saved.jobs ?? [], {
        createWorker: deps.createWorker,
        access: { assertFullAccess: () => this.requireFullAccess(), blocked: () => this.closing || this.shuttingDown || this.stopPending() },
        settings: () => ({ model: this.state.preferences.model, progressSpeech: this.state.preferences.speakReplies && this.state.preferences.voiceConversation !== false,
          computerDelegationEnabled: this.state.preferences.computerDelegationEnabled === true, computerModel: this.state.preferences.computerModel ?? '',
          computerFast: this.state.preferences.computerFast !== false, computerOverviewScaleDivisor: this.state.preferences.computerOverviewScaleDivisor ?? 1,
          computerDetailScaleDivisor: this.state.preferences.computerDetailScaleDivisor ?? 1,
          computerImageRetentionCalls: this.state.preferences.computerImageRetentionCalls ?? 0,
          computerWorkingMemoryCalls: this.state.preferences.computerWorkingMemoryCalls ?? 0 }),
        context: { skills: (query, max) => this.skillContext(query, max), persona: () => this.assistantProfileInstructions(), capabilities: () => [this.capabilitiesDocument().prompt, this.deps.serviceContext?.instructions()].filter(Boolean).join('\n\n'), favorites: () => this.favoriteContext() },
        memory: deps.memory ? {
          documents: () => this.instructionDocuments(), retrieve: (query, max) => this.retrieveMemory(query, max),
          readPeriod: request => this.readMemoryPeriod(request), propose: proposal => this.memory().propose(proposal),
        } : undefined,
        parseReply: parseMemoryReply,
        journal: {
          publish: jobs => { this.state.jobs = jobs; this.workHistory.jobs(jobs); }, prepare: () => this.stateJournal.ready(), persist: () => this.stateJournal.durableCommit(), changed: () => this.changed(),
          appendMessage: message => { if (this.conversation) this.conversation.appendMessage(message); else this.state.messages.push(message); },
          capture: strict => this.captureMemory(strict),
        },
        effects: { clean: text => this.clean(text), activity: (kind, title, detail) => this.activity(kind, title, detail),
          workAction: (id, event) => this.workHistory.action(jobWorkId(id), event),
          speak: (text, jobId, kind) => this.speechCue(text, jobId, kind), frame: frame => deps.publishComputerFrame?.(frame), idle: () => this.memoryReports.queueAutomatic() },
        now: deps.now,
      });
      this.state.jobs = this.tasks.snapshot();
      this.workHistory.jobs(this.state.jobs);
      this.conversation = new ConversationCoordinator({ messages: this.state.messages, task: this.state.task }, {
        agent: deps.dialogAgent,
        availability: {
          blocked: () => this.closing || this.shuttingDown || this.stopPending(),
          configuration: () => ({ ready: this.state.connections.agent === 'ready', model: this.state.preferences.dialogModel, workspace: deps.workspace }),
          prepare: async () => {
            this.requireFullAccess();
            if (this.memoryReports.busy()) {
              const epoch = this.workEpoch; await this.memoryReports.prepareForUserWork();
              if (epoch !== this.workEpoch || this.stopPending()) throw new Error('Der neue Gesprächsauftrag wurde durch Stopp abgebrochen.');
            }
          },
        },
        journal: {
          project: (state, answerId) => {
            if (!this.resettingConversation) this.workHistory.rollbackMissing(this.state.messages, state.messages);
            this.state.messages = state.messages; this.state.task = state.task;
            this.workHistory.foreground(state.messages, state.task, 'conversation', answerId);
          },
          prepare: () => this.stateJournal.ready(), persist: () => this.stateJournal.durableCommit(), changed: save => this.changed(save),
        },
        context: {
          identity: () => [this.identityInstructions(), itSupporterInstructions(this.state.preferences.itSupporter === true)].filter(Boolean).join('\n\n'), memory: (query, max) => this.retrieveMemory(query, max),
          skills: (query, max) => this.skillContext(query, max), capture: () => this.captureMemory(),
          started: () => { this.workEpoch++; delete this.state.usage; },
          finished: () => this.captureMemory(), idle: () => this.memoryReports.queueAutomatic(),
        },
        jobs: {
          list: () => this.tasks!.list(), accept: (input, onAdmitted) => this.tasks!.accept({ ...input, sourceMessageId: this.state.task.id }, onAdmitted),
          waitReason: job => this.tasks!.waitReason(job), get: id => this.tasks!.get(id),
          stop: id => this.stopJob(id), steer: (id, instruction, resources) => this.tasks!.steer(id, instruction, resources),
        },
        effects: {
          clean: text => this.clean(text), receipt: text => this.messageReceipt(text), speak: (text, jobId) => this.speechCue(text, jobId),
          runtimeEvent: event => this.handleDialogRuntimeEvent(event), reportError: error => this.reportError(error),
        },
      });
    }
    if (!this.conversation) {
      this.directTask = new DirectTaskCoordinator({ messages: this.state.messages, task: this.state.task, usage: this.state.usage, context: this.state.context }, {
        agent: deps.agent, access: { assertAdmission: () => { this.requireFullAccess(); this.modelManagement.assertUnlocked(); }, blocked: () => this.closing || this.shuttingDown || this.stopPending() },
        configuration: () => ({ ready: this.state.connections.agent === 'ready', model: this.state.preferences.model }), reports: this.memoryReports,
        trackRuntimeMetrics: !deps.dialogAgent, context: { identity: () => this.identityInstructions(), started: () => { this.workEpoch++; } },
        memory: deps.memory ? {
          documents: () => this.instructionDocuments(), retrieve: query => this.retrieveMemory(query), readPeriod: request => this.readMemoryPeriod(request), propose: proposal => this.memory().propose(proposal),
        } : undefined,
        parseReply: parseMemoryReply,
        journal: {
          publish: (state, answerId) => {
            if (!this.resettingConversation) this.workHistory.rollbackMissing(this.state.messages, state.messages);
            this.state.messages = state.messages; this.state.task = state.task;
            this.workHistory.foreground(state.messages, state.task, 'direct', answerId);
            if (state.usage === undefined) delete this.state.usage; else this.state.usage = state.usage;
            if (state.context === undefined) delete this.state.context; else this.state.context = state.context; },
          publishContext: context => { this.state.context = context; },
          prepare: () => this.stateJournal.ready(), persist: () => this.stateJournal.durableCommit(), changed: save => this.changed(save), capture: strict => this.captureMemory(strict),
        },
        effects: { clean: text => this.clean(text), activity: (kind, title, detail) => this.activity(kind, title, detail), reportError: error => this.reportError(error), frame: frame => deps.publishComputerFrame?.(frame), idle: () => this.memoryReports.queueAutomatic() },
      });
    }
  }

  /** Startup recovery is durable before any controller-triggered agent work. */
  initialize(): Promise<void> {
    if (this.initialized) return Promise.resolve();
    if (this.initialization) return this.initialization;
    const initialization = (async () => {
      await this.deps.memory?.initialize?.();
      await this.captureMemory();
      await this.stateJournal.ready();
      await this.stateJournal.durableCommit();
      this.initialized = true;
    })();
    this.initialization = initialization;
    void initialization.finally(() => { if (this.initialization === initialization) this.initialization = undefined; }).catch(() => undefined);
    return initialization;
  }

  snapshot(): Snapshot {
    const snapshot = structuredClone(this.state);
    snapshot.workItems = this.workHistory.snapshot();
    try {
      const name = this.deps.memory?.instructionDocuments ? identityName(this.deps.memory.instructionDocuments()) : undefined;
      if (name !== undefined) snapshot.preferences.assistantProfile = { ...(snapshot.preferences.assistantProfile ?? structuredClone(DEFAULT_ASSISTANT_PROFILE)), name };
    } catch { /* The asynchronous memory cache may still be starting. */ }
    return snapshot;
  }
  updateHotkeys(hotkeys: NonNullable<Snapshot['hotkeys']>): void {
    this.state.hotkeys = { ...hotkeys }; this.changed(false);
  }
  updateDesktopControl(phase: NonNullable<Snapshot['desktopControl']>): void {
    if (this.state.desktopControl === phase) return;
    this.state.desktopControl = phase; this.changed(false);
  }
  jobsBusy(): boolean { return this.tasks?.busy() ?? false; }
  async listSkills(): Promise<SkillCatalog> {
    if (this.closing || this.shuttingDown) throw new Error(`${APP_DISPLAY_NAME} wird beendet.`);
    if (!this.deps.agent.listSkills) throw new Error('Die Skill-Liste ist in diesem Build nicht verfügbar.');
    const catalog = await this.deps.agent.listSkills();
    this.skillCatalog = catalog;
    this.saveCapabilities();
    return catalog;
  }
  private capabilitiesDocument(): OpenhiatusCapabilitiesDocument {
    let catalogPath: string | undefined;
    try { if (this.deps.profileDirectory) catalogPath = openhiatusCapabilitiesPath(this.deps.profileDirectory); } catch { /* File errors must not hide known skills. */ }
    const options = { ...(catalogPath ? { catalogPath } : {}) };
    try { return buildOpenhiatusCapabilities(this.skillCatalog, options); }
    catch { return buildOpenhiatusCapabilities(undefined, options); }
  }
  private saveCapabilities(): void {
    if (!this.deps.profileDirectory) return;
    try {
      const document = buildOpenhiatusCapabilities(this.skillCatalog, { catalogPath: openhiatusCapabilitiesPath(this.deps.profileDirectory) });
      writeOpenhiatusCapabilities(this.deps.profileDirectory, document);
    } catch (error) {
      this.activity('error', 'Fähigkeitenübersicht konnte nicht aktualisiert werden', this.clean(error instanceof Error ? error.message : 'Lokaler Dateifehler.'));
    }
  }
  dialogTools(): DynamicFunctionTool[] { return structuredClone(DIALOG_TOOLS); }
  private warmSkills(): Promise<void> {
    if (!this.deps.agent.listSkills) return Promise.resolve();
    if (!this.skillRefresh) this.skillRefresh = this.listSkills().then(() => {}).catch(error => {
      this.activity('error', 'Skill-Liste konnte nicht aktualisiert werden', this.clean(error instanceof Error ? error.message : 'Die Skill-Liste ist gerade nicht erreichbar.'));
    }).finally(() => { this.skillRefresh = undefined; });
    return this.skillRefresh;
  }
  private speechCue(text: string, jobId?: string, kind?: SpeechCue['kind']): void {
    const spoken = this.clean(toSpokenText(text)).trim();
    if (!spoken) return;
    this.state.speech ??= [];
    this.state.speech.push({ id: randomUUID(), text: spoken, at: new Date().toISOString(), ...(jobId ? { jobId } : {}), ...(kind ? { kind } : {}) });
    this.state.speech = this.state.speech.slice(-100);
  }
  private messageReceipt(text: string): void {
    if (this.state.preferences.voiceConversation === false || !this.state.preferences.speakReplies
      || this.closing || this.shuttingDown || this.conversation?.isStopping() || this.stopPending() || /^\/goal(?:\s|$)/i.test(text)) return;
    // A durable utterance has arrived. This does not claim that a worker was
    // accepted or that its requested action has started or succeeded.
    this.lastReceipt = (this.deps.receiptPhrase ?? nextReceipt)(this.lastReceipt);
    this.speechCue(this.lastReceipt, undefined, 'receipt');
    this.emit();
  }
  /** Vertont die Bestätigungssätze vorab im Hintergrund. Fehler bleiben still; dann wird bei Bedarf direkt vertont. */
  private prewarmReceipts(): void {
    if (!this.deps.speech.prewarm || this.state.connections.speech === 'missing' || this.closing || this.shuttingDown) return;
    this.receiptWarmup?.abort();
    const control = new AbortController(); this.receiptWarmup = control; this.audio.add(control);
    void this.deps.speech.prewarm(RECEIPT_PHRASES, control.signal).catch(() => {}).finally(() => {
      this.audio.delete(control); if (this.receiptWarmup === control) this.receiptWarmup = undefined;
    });
  }
  private skillContext(query: string, maxBytes = 5000): string {
    const lowered = query.toLowerCase();
    const words = lowered.split(/[^\p{L}\p{N}]+/u).filter(word => word.length > 3);
    const enabled = this.capabilitiesDocument().data.skills;
    const favorites = this.state.preferences.skillFavorites;
    // User favourites always lead; the word match only orders the remaining skills.
    const ranked = enabled.map(skill => ({ skill, score: (favoriteLevel(favorites, skill.path) ? 1000 : 0) + (lowered.includes(skill.name.toLowerCase()) ? 100 : 0)
      + words.filter(word => `${skill.name} ${skill.description} ${skill.displayName ?? ''}`.toLowerCase().includes(word)).length }))
      .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name));
    const selected: Array<{ name: string; description: string; path: string }> = [];
    for (const { skill } of ranked) {
      const entry = { name: skill.name, description: skill.description.slice(0, 300), path: skill.path };
      if (JSON.stringify([...selected, entry]).length <= maxBytes) selected.push(entry);
    }
    return JSON.stringify({ available: selected, omitted: enabled.length - selected.length });
  }
  private favoriteContext(): string {
    try { return favoriteSkillsContext(this.capabilitiesDocument().data.skills, this.state.preferences.skillFavorites, text => this.clean(text)); }
    catch { return ''; }
  }
  async dialogTool(name: string, value: unknown, signal: AbortSignal): Promise<DynamicToolResponse> {
    if (this.conversation) return this.conversation.tool(name, value, signal);
    return { success: false, contentItems: [{ type: 'inputText', text: JSON.stringify({ error: 'Der Gesprächsmodus ist nicht verfügbar.' }) }] };
  }
  async stopJob(id: string): Promise<void> {
    if (!this.tasks) throw new Error('Die Aufgabenverwaltung ist nicht verfügbar.');
    await this.tasks.stop(id);
  }
  acknowledgeFullAccess(): Promise<void> {
    if (this.consent) return this.consent;
    if (this.state.preferences.fullAccessAcknowledged) return Promise.resolve();
    const epoch = this.workEpoch;
    const consent = (async () => {
      await this.initialize();
      await this.stateJournal.ready();
      if (epoch !== this.workEpoch || this.closing || this.shuttingDown || this.stopPending()) throw new Error('Bitte zuerst den laufenden Stopp abschließen lassen.');
      this.state.preferences = { ...this.state.preferences, fullAccessAcknowledged: true };
      try { await this.stateJournal.durableCommit(); }
      catch (error) { this.state.preferences = { ...this.state.preferences, fullAccessAcknowledged: false }; this.changed(); throw error; }
      if (epoch !== this.workEpoch || this.closing || this.shuttingDown || this.stopPending()) {
        this.state.preferences = { ...this.state.preferences, fullAccessAcknowledged: false }; this.changed();
        throw new Error('Bitte zuerst den laufenden Stopp abschließen lassen.');
      }
      this.activity('system', 'Vollzugriff bestätigt', 'Aufträge arbeiten mit den Rechten des Windows-Benutzers. Stopp beendet den verwalteten Prozessbaum.');
      this.changed();
    })();
    this.consent = consent;
    void consent.finally(() => { if (this.consent === consent) this.consent = undefined; }).catch(() => undefined);
    return consent;
  }
  private requireFullAccess(): void {
    if (this.closing || this.shuttingDown) throw new Error(`${APP_DISPLAY_NAME} wird beendet.`);
    if (this.consent || !this.state.preferences.fullAccessAcknowledged) throw new Error('Bitte den Vollzugriff unter Verbindungen einmalig bestätigen.');
  }
  refreshChatGPT(): void { this.modelManagement.refreshChatGPT(); }
  async signInChatGPT(): Promise<void> { await this.modelManagement.signInChatGPT(); }
  async cancelChatGPTSignIn(): Promise<void> { await this.modelManagement.cancelChatGPTSignIn(); }
  async signOutChatGPT(): Promise<void> { await this.modelManagement.signOutChatGPT(); }
  async saveProvider(input: ProviderInput): Promise<void> { await this.modelManagement.saveProvider(input); }
  async testProvider(id: string): Promise<void> { await this.modelManagement.testProvider(id); }
  async removeProvider(id: string): Promise<void> { await this.modelManagement.removeProvider(id); }
  sanitizeMemory(value: string): string { return this.clean(value); }
  private stopPending(): boolean { return this.stopDeferrals > 0 || this.state.task.status === 'stopping' || this.memoryReports?.isStopping() === true; }
  private memory(): MemoryBackend {
    if (this.stopPending()) throw new Error('Bitte zuerst den laufenden Stopp abschließen lassen.');
    if (this.closing || this.shuttingDown) throw new Error(`${APP_DISPLAY_NAME} wird beendet.`);
    if (!this.deps.memory) throw new Error('Das Gedächtnis ist in diesem Build nicht verfügbar.');
    return this.deps.memory;
  }
  async memorySnapshot(): Promise<MemorySnapshot> {
    const before = this.deps.memory?.instructionDocuments ? JSON.stringify(this.deps.memory.instructionDocuments()) : undefined;
    const result = await this.memory().snapshot();
    if (before !== undefined && JSON.stringify(this.deps.memory!.instructionDocuments!()) !== before) { this.identityChanged(); this.changed(false); }
    return { ...result, runtimeInstructions: runtimeInstructions(), summary: structuredClone(this.state.summary) };
  }
  async readMemoryPeriod(request: MemoryPeriodRequest): Promise<MemoryPeriodPage> {
    const memory = this.memory(); if (!memory.readPeriod) throw new Error('Der Zeitraumzugriff ist nicht verfügbar.');
    return await memory.readPeriod(structuredClone(request));
  }
  async memorySource(id: string): Promise<MemorySource | undefined> { return await this.memory().source(id); }
  async searchMemory(query: string): Promise<MemorySearchResult[]> { return await this.memory().search(this.clean(query)); }
  async startMemorySummary(mode: 'manual' | 'auto' = 'manual'): Promise<void> { await this.memoryReports.start(mode); }
  async rebuildMemory(): Promise<MemorySnapshot> {
    const epoch = this.workEpoch;
    await this.captureMemory(true);
    if (epoch !== this.workEpoch || this.stopPending() || this.shuttingDown) throw new Error('Der Gedächtnisabruf wurde durch neue Arbeit oder Stopp abgebrochen.');
    const result = await this.memory().rebuild(); this.activity('system', 'Gedächtnisauszüge neu erstellt', 'Manuelle Korrekturen bleiben erhalten.'); this.changed();
    return { ...result, runtimeInstructions: runtimeInstructions() };
  }
  async editMemory(id: string, content: string, expectedVersion: number): Promise<MemorySnapshot> {
    const result = await this.memory().edit(id, this.clean(content), expectedVersion);
    if (id === 'identity' || isIdentityFile(id)) this.identityChanged();
    this.activity('system', 'Gedächtnis vom Nutzer bearbeitet', `${id} · neue Version ${result.documents.find(document => document.id === id)?.version}`); this.changed();
    return { ...result, runtimeInstructions: runtimeInstructions() };
  }
  async decideMemoryProposal(id: string, decision: 'approve' | 'reject'): Promise<MemorySnapshot> {
    const epoch = this.workEpoch;
    const backend = this.memory();
    const before = (await backend.snapshot()).proposals.find(proposal => proposal.id === id);
    // The explicit change remains accepted once it has been submitted to the store.
    this.memory();
    if (epoch !== this.workEpoch) throw new Error('Die Gedächtnisfreigabe wurde durch Stopp oder neue Arbeit abgebrochen.');
    const result = await backend.decide(id, decision);
    const after = result.proposals.find(proposal => proposal.id === id);
    if (before?.status === 'pending' && after?.status === 'approved') this.identityChanged();
    this.activity('system', after?.status === 'approved' ? 'Gedächtnisvorschlag vom Nutzer freigegeben' : after?.status === 'stale' ? 'Gedächtnisvorschlag ist veraltet' : 'Gedächtnisvorschlag abgelehnt', before?.documentId); this.changed();
    return { ...result, runtimeInstructions: runtimeInstructions() };
  }
  private invalidateThread(): void {
    if (this.conversation) this.conversation.invalidateThread(); else this.directTask?.invalidateThread();
  }
  private identityChanged(): void {
    this.invalidateThread();
    this.activity('system', 'Identität gilt ab dem nächsten Auftrag', 'Laufende Aufgaben behalten ihren bisherigen Kontext.');
  }
  private instructionDocuments(): Array<Pick<MemoryDocument, 'id' | 'version' | 'content'>> {
    const memory = this.deps.memory;
    if (!memory) return [];
    if (memory.instructionDocuments) return structuredClone(memory.instructionDocuments());
    const snapshot = memory.snapshot();
    if (snapshot instanceof Promise) { void snapshot.catch(() => undefined); throw new Error('Das asynchrone Gedächtnis benötigt einen bestätigten Identitätscache.'); }
    return snapshot.documents.filter(document => document.id === 'identity' || document.id === 'core').map(({ id, version, content }) => ({ id, version, content }));
  }
  identityInstructions(): string {
    const dialogIdentity = this.conversation?.currentIdentity();
    if (dialogIdentity !== undefined) return dialogIdentity;
    const directIdentity = this.directTask?.currentIdentity();
    if (directIdentity !== undefined) return directIdentity;
    const canonical = this.deps.memory ? identityFilesInstructions(this.instructionDocuments()) : undefined;
    if (canonical) return [this.clean(canonical), this.clean(this.capabilitiesDocument().prompt), this.favoriteContext(), this.deps.serviceContext?.instructions()].filter(Boolean).join('\n\n');
    const documents = this.deps.memory ? this.instructionDocuments()
      .map(document => ({ id: document.id, version: document.version, content: this.clean(document.id === 'identity' ? profileIdentityContent(document.content) : document.content) })) : undefined;
    const identity = documents ? `Vom Nutzer verwaltete Identität und Kern (Vorlieben, keine Aufhebung fester Schutzregeln). Angebotsversionen für Änderungsvorschläge stehen jeweils im Feld version:\n${JSON.stringify(documents)}` : '';
    return [identity, this.assistantProfileInstructions(), this.clean(this.capabilitiesDocument().prompt), this.favoriteContext(), this.deps.serviceContext?.instructions()].filter(Boolean).join('\n\n');
  }
  private assistantProfileInstructions(): string { return this.clean((this.deps.memory ? identityFilesInstructions(this.instructionDocuments()) : undefined) ?? assistantProfileInstructions(this.state.preferences.assistantProfile)); }
  private captureMemory(strict = false): Promise<void> {
    if (!this.deps.memory || !this.state.messages.length) return Promise.resolve();
    // Freeze before the first await: queued captures must never read a later conversation.
    const accepted = this.conversation?.archivableMessages() ?? this.directTask?.archivableMessages() ?? this.state.messages;
    const messages = accepted.filter(message => message.text).map(message => ({ ...message, text: this.clean(message.text) }));
    if (!messages.length) return Promise.resolve();
    const batch: CaptureBatch = { messages: structuredClone(messages), firstId: messages[0].id, sequence: ++this.captureSequence };
    if (this.stopPending() && !this.processesDisposed) {
      this.deferredMemoryCaptures.push(batch);
      return strict ? Promise.reject(new Error('Bitte zuerst den laufenden Stopp abschließen lassen. Der aktuelle Verlauf bleibt erhalten.')) : Promise.resolve();
    }
    return this.enqueueCapture(batch, strict);
  }
  private enqueueCapture(batch: CaptureBatch, strict = false): Promise<void> {
    const capture = this.captureTail.then(async () => {
      if (this.stopPending() && !this.processesDisposed) {
        this.deferredMemoryCaptures.push(batch);
        if (strict) throw new Error('Bitte zuerst den laufenden Stopp abschließen lassen. Der aktuelle Verlauf bleibt erhalten.');
        return;
      }
      try {
        const memory = this.deps.memory!;
        let conversationId = this.conversationIds.get(batch.firstId);
        if (!conversationId) {
          conversationId = (await memory.source(batch.firstId))?.conversationId ?? `conversation-${batch.firstId}`;
          this.conversationIds.set(batch.firstId, conversationId);
        }
        if (this.stopPending() && !this.processesDisposed) {
          this.deferredMemoryCaptures.push(batch);
          if (strict) throw new Error('Bitte zuerst den laufenden Stopp abschließen lassen. Der aktuelle Verlauf bleibt erhalten.');
          return;
        }
        await memory.capture(batch.messages, conversationId);
      } catch (error) {
        this.activity('error', 'Gespräch konnte nicht ins Gedächtnis übernommen werden', error instanceof Error ? error.message : 'Lokaler Gedächtnisfehler'); this.changed();
        if (strict) throw new Error('Das Gespräch konnte nicht archiviert werden. Der aktuelle Verlauf bleibt erhalten.');
      }
    });
    this.captureTail = capture.catch(() => undefined);
    return capture;
  }
  private flushDeferredCaptures(): void {
    for (const batch of this.deferredMemoryCaptures.splice(0).sort((left, right) => left.sequence - right.sequence)) void this.enqueueCapture(batch);
  }
  private async retrieveMemory(query: string, maxBytes = 10000): Promise<string> {
    if (!this.deps.memory) return '';
    try {
      const context = await this.deps.memory.retrieve(this.clean(query), { maxBytes, includeInstructions: false });
      this.activity('system', 'Gedächtnis für diesen Auftrag gelesen', `Dokumente: ${context.retrieval.documentIds.join(', ') || 'keine'}\nQuellen: ${context.retrieval.sourceIds.join(', ') || 'keine'}`);
      return this.clean(context.text);
    } catch (error) {
      this.activity('error', 'Gedächtnisauszug nicht verfügbar', error instanceof Error ? error.message : 'Lokaler Gedächtnisfehler');
      return '';
    }
  }
  /** Internal worker redaction input, including keys removed during this session. */
  redactionSecrets(): string[] { return [...this.secrets, ...(this.modelManagement?.secrets() ?? this.deps.providers?.secrets() ?? []), ...(this.deps.serviceContext?.secrets() ?? [])]; }
  private clean(value: string): string { return redact(value, this.redactionSecrets()); }
  private emit(): void { this.stateJournal.publish(); }
  private changed(save = true): void { this.stateJournal.checkpoint(save); }
  private flushAfterStop(): void {
    if (this.stopPending()) return;
    this.flushDeferredCaptures();
    this.stateJournal.flushCheckpoint();
  }
  private activity(kind: Activity['kind'], title: string, detail?: string): void {
    const cleanTitle = this.clean(title);
    const cleanDetail = detail ? this.clean(detail).slice(0, 16000) : undefined;
    const previous = this.state.activity.at(-1);
    if (previous?.kind === kind && previous.title === cleanTitle && previous.detail === cleanDetail) return;
    this.state.activity.push({ id: randomUUID(), at: new Date().toISOString(), kind, title: cleanTitle, detail: cleanDetail });
    this.state.activity = this.state.activity.slice(-200);
  }
  reportError(error: unknown): string {
    const message = this.clean(error instanceof Error ? error.message : 'Unbekannter Fehler.');
    this.activity('error', message); this.changed(); return message;
  }
  async start(): Promise<void> {
    const epoch = this.workEpoch;
    await this.initialize();
    if (epoch !== this.workEpoch || this.closing || this.shuttingDown || this.stopPending()) return;
    this.prewarmReceipts();
    try {
      await this.deps.agent.start();
      if (epoch !== this.workEpoch || this.closing || this.shuttingDown || this.stopPending()) return;
      await this.deps.dialogAgent?.start();
      if (epoch !== this.workEpoch || this.closing || this.shuttingDown || this.stopPending()) return;
      await this.warmSkills();
    }
    catch (error) { this.modelManagement.offline(); this.reportError(error); }
  }
  handleDialog(event: AgentEvent): void {
    if (!this.conversation || this.closing) return;
    this.conversation.handle(event);
  }
  private recordForegroundAction(event: Extract<AgentEvent, { type: 'work-action' }>): void {
    if (this.state.task.status !== 'running' || this.stopPending()) return;
    this.workHistory.action(requestWorkId(this.state.task.id), event); this.changed();
  }
  private handleDialogRuntimeEvent(event: Exclude<AgentEvent, { type: 'started' | 'completed' }>): void {
    if (event.type === 'work-action') { this.recordForegroundAction(event); return; }
    if (['connection', 'models'].includes(event.type)) { this.handle(event); return; }
    if (event.type === 'activity') { this.activity(event.kind, event.title, event.detail); this.changed(); return; }
    if (event.type === 'context') {
      this.state.context = { threadId: event.threadId, usedTokens: event.usedTokens, ...(event.windowTokens ? { windowTokens: event.windowTokens } : {}), at: new Date().toISOString() };
      this.changed(false); return;
    }
    if (event.type === 'usage' && this.state.task.status === 'running') { this.state.usage = validateUsage(event.usage); this.changed(); }
  }
  handle(event: AgentEvent): void {
    if (this.closing) return;
    if (event.type === 'work-action') { this.recordForegroundAction(event); return; }
    if (event.type === 'models' || event.type === 'connection') { this.modelManagement.handle(event); this.memoryReports.queueAutomatic(); return; }
    if (this.directTask) { this.directTask.handle(event); return; }
    if (event.type === 'computer-frame') { if (this.state.task.status === 'running') this.deps.publishComputerFrame?.(event.frame); return; }
    if (event.type === 'usage' || event.type === 'context' || event.type === 'delta' || event.type === 'started' || event.type === 'completed') return;
    if (event.type === 'activity') this.activity(event.kind, event.title, event.detail);
    this.changed(); this.memoryReports.queueAutomatic();
  }
  async send(text: string, requestId: string): Promise<void> {
    if (/^\/goal(?:\s|$)/i.test(text.trim())) throw new Error(`Zielaufträge mit /goal sind in ${APP_DISPLAY_NAME} noch nicht verfügbar. Bitte einen einzelnen konkreten Auftrag formulieren.`);
    this.requireFullAccess();
    this.modelManagement.assertUnlocked();
    if (!text.trim() || text.length > 26000) throw new Error('Bitte einen Auftrag mit 1 bis 26.000 Zeichen eingeben.');
    const epoch = this.workEpoch;
    await this.initialize();
    if (this.deps.memory && hasIdentityFiles(this.instructionDocuments())) await this.memorySnapshot();
    if (epoch !== this.workEpoch || this.closing || this.shuttingDown) throw new Error('Der neue Auftrag wurde durch Stopp abgebrochen.');
    this.requireFullAccess(); this.modelManagement.assertUnlocked();
    if (this.conversation) { await this.conversation.send(text, requestId); return; }
    await this.directTask!.send(text, requestId);
  }
  async stop(): Promise<void> {
    this.stopDeferrals++;
    this.workEpoch++;
    this.memoryReports.suppressAutomaticForToday();
    try {
      for (const request of this.audio) request.abort();
      this.audio.clear();
      // Initiate work termination first. Neither synchronous callbacks nor
      // disk writes may delay the interrupt or its watchdog while confirmation is pending.
      const work = this.conversation && this.tasks
        ? [this.conversation.stop(), this.tasks.stopAll(), this.memoryReports.stop(), this.deps.agent.stop()]
        : [this.directTask!.stop(), this.memoryReports.stop()];
      const results = await Promise.allSettled([...work, this.cancelChatGPTSignIn()]);
      for (const result of results) if (result.status === 'rejected') throw result.reason;
    } finally { this.stopDeferrals--; this.flushAfterStop(); }
  }
  async savePreferences(patch: Partial<Preferences>): Promise<void> {
    if (Object.hasOwn(patch, 'uiLanguage')) patch = { ...patch, uiLanguage: parseUiLanguage(patch.uiLanguage) };
    if (Object.hasOwn(patch, 'itSupporter') && typeof patch.itSupporter !== 'boolean') throw new Error('Ungültiger IT-Supporter-Modus.');
    if (Object.hasOwn(patch, 'assistantProfile')) patch = { ...patch, assistantProfile: parseAssistantProfile(patch.assistantProfile) };
    if (patch.chatgptBackgroundUsage !== undefined && typeof patch.chatgptBackgroundUsage !== 'boolean') throw new Error('Ungültige Einstellung für automatische ChatGPT-Nutzung.');
    if ('fullAccessAcknowledged' in patch) throw new Error('Den Vollzugriff bitte ausdrücklich in Verbindungen bestätigen.');
    if (patch.inputDeviceId !== undefined && patch.inputDeviceId !== this.state.preferences.inputDeviceId) {
      patch = { ...patch, inputDeviceLabel: patch.inputDeviceLabel ?? '', inputDeviceGroupId: patch.inputDeviceGroupId ?? '' };
    }
    if (patch.outputDeviceId !== undefined && patch.outputDeviceId !== this.state.preferences.outputDeviceId) {
      patch = { ...patch, outputDeviceLabel: patch.outputDeviceLabel ?? '', outputDeviceGroupId: patch.outputDeviceGroupId ?? '' };
    }
    this.modelManagement.validateSelections(patch);
    if (patch.computerDelegationEnabled !== undefined && typeof patch.computerDelegationEnabled !== 'boolean') throw new Error('Ungültige Einstellung für das Computer-Modell.');
    if (patch.computerFast !== undefined && typeof patch.computerFast !== 'boolean') throw new Error('Ungültige Fast-Einstellung für das Computer-Modell.');
    if (Object.hasOwn(patch, 'activityOverlayEnabled') && typeof patch.activityOverlayEnabled !== 'boolean') throw new Error('Ungültige Einstellung für die Arbeitsanzeige.');
    if (Object.hasOwn(patch, 'sidebarMode')) patch = { ...patch, sidebarMode: sidebarMode(patch.sidebarMode) };
    if (Object.hasOwn(patch, 'activityOverlaySize')) patch = { ...patch, activityOverlaySize: activityOverlaySize(patch.activityOverlaySize) };
    if (Object.hasOwn(patch, 'computerDetailScaleDivisor')) computerDetailDivisor(patch.computerDetailScaleDivisor);
    if (Object.hasOwn(patch, 'computerImageRetentionCalls')) computerImageRetentionCalls(patch.computerImageRetentionCalls);
    if (Object.hasOwn(patch, 'computerWorkingMemoryCalls')) computerWorkingMemoryCalls(patch.computerWorkingMemoryCalls);
    const computerModel = patch.computerModel ?? this.state.preferences.computerModel;
    if ((patch.computerDelegationEnabled ?? this.state.preferences.computerDelegationEnabled) && !this.state.models.some(model => model.id === computerModel)) throw new Error('Bitte zuerst ein verfügbares Computer-Modell auswählen.');
    const dialogChanged = patch.dialogModel !== undefined && patch.dialogModel !== this.state.preferences.dialogModel;
    const supportChanged = patch.itSupporter !== undefined && patch.itSupporter !== this.state.preferences.itSupporter;
    const workChanged = !this.deps.dialogAgent && patch.model !== undefined && patch.model !== this.state.preferences.model;
    if (patch.voiceConversation !== undefined && typeof patch.voiceConversation !== 'boolean') throw new Error('Ungültige Einstellung für den Sprachdialog.');
    if (patch.earcons !== undefined && typeof patch.earcons !== 'boolean') throw new Error('Ungültige Einstellung für Signaltöne.');
    if (patch.skillFavorites !== undefined) patch = { ...patch, skillFavorites: parseSkillFavorites(patch.skillFavorites) };
    const favoritesChanged = patch.skillFavorites !== undefined && JSON.stringify(patch.skillFavorites) !== JSON.stringify(this.state.preferences.skillFavorites ?? {});
    const previousProfile = structuredClone(this.state.preferences.assistantProfile);
    const profileChanged = patch.assistantProfile !== undefined && JSON.stringify(patch.assistantProfile) !== JSON.stringify(this.state.preferences.assistantProfile);
    this.state.preferences = { ...this.state.preferences, ...patch }; this.modelManagement.select(patch); this.changed();
    if (patch.memoryAutoSummarize !== undefined || patch.chatgptBackgroundUsage !== undefined) {
      await this.memoryReports.preferencesChanged({ automatic: patch.memoryAutoSummarize, chatgptBackgroundUsage: patch.chatgptBackgroundUsage });
    }
    if (patch.voiceId !== undefined) this.prewarmReceipts();
    if (favoritesChanged || dialogChanged || workChanged || profileChanged || supportChanged) {
      // The dialogue keeps its developer context per thread; a fresh thread picks up the new favourites.
      this.invalidateThread();
      this.activity('system', 'Gesprächseinstellungen gelten ab der nächsten Nachricht', 'Laufende Aufgaben behalten ihren bisherigen Kontext.'); this.changed();
    }
    if (profileChanged) {
      try { await this.stateJournal.durableCommit(); }
      catch (error) {
        if (JSON.stringify(this.state.preferences.assistantProfile) === JSON.stringify(patch.assistantProfile)) {
          this.state.preferences.assistantProfile = previousProfile; this.invalidateThread(); this.changed();
        }
        throw error;
      }
    }
  }
  async saveSpeechKey(key: string): Promise<void> {
    this.secrets.push(key); this.deps.credentials.set('inworld', key);
    this.state.connections.speech = 'saved'; this.activity('system', 'Inworld-Zugang geschützt gespeichert'); this.changed();
    this.prewarmReceipts();
  }
  async removeSpeechKey(): Promise<void> {
    for (const request of this.audio) request.abort();
    this.deps.credentials.remove('inworld'); this.state.connections.speech = 'missing'; this.changed();
  }
  private async speechRequest<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const control = new AbortController(); this.audio.add(control);
    try {
      const result = await fn(control.signal);
      if (control.signal.aborted) throw new Error('Sprachanfrage gestoppt.');
      this.state.connections.speech = 'verified'; this.changed(false); return result;
    } catch (error) { throw new Error(this.clean(error instanceof Error ? error.message : 'Sprachanfrage fehlgeschlagen.')); }
    finally { this.audio.delete(control); }
  }
  transcribe(clip: AudioClip): Promise<string> { return this.speechRequest(signal => this.deps.speech.transcribe(clip, signal)); }
  synthesize(text: string): Promise<AudioClip> { return this.speechRequest(signal => this.deps.speech.synthesize(text, signal)); }
  testSpeech(): Promise<AudioClip> { return this.speechRequest(signal => this.deps.speech.test(signal)); }
  private ensureIdle(): void {
    this.modelManagement.assertUnlocked();
    this.memoryReports.assertIdle(); this.ensureWorkIdle();
  }
  private ensureWorkIdle(): void {
    if (this.closing || this.shuttingDown) throw new Error(`${APP_DISPLAY_NAME} wird beendet.`);
    this.modelManagement.assertUnlocked();
    if (this.stopPending() || this.state.task.status === 'running') throw new Error('Bitte zuerst den laufenden Auftrag stoppen.');
    if (this.jobsBusy() || this.conversation?.hasPending()) throw new Error('Bitte zuerst die laufenden Aufgaben stoppen oder abwarten.');
  }
  async newConversation(): Promise<void> {
    this.ensureIdle();
    const epoch = ++this.workEpoch;
    await this.captureMemory(true);
    if (epoch !== this.workEpoch) throw new Error('Das neue Gespräch wurde durch neue Arbeit oder Stopp abgebrochen.');
    this.ensureIdle();
    for (const request of this.audio) request.abort(); this.audio.clear();
    delete this.state.usage;
    this.resettingConversation = true;
    try { if (this.conversation) this.conversation.reset(); else this.directTask!.reset(); }
    finally { this.resettingConversation = false; }
    if (this.state.speech) this.state.speech = [];
    this.activity('system', 'Neues Gespräch'); this.changed();
    this.memoryReports.queueAutomatic();
  }
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.shuttingDown = true;
    let processesDisposed = false;
    const disposal = (async () => {
      await this.stop().catch(() => {});
      // Drain writes only after every managed process has confirmed termination.
      if (this.directTask) await this.directTask.dispose(); else await this.deps.agent.dispose();
      await this.deps.dialogAgent?.dispose();
      await this.tasks?.dispose();
      this.processesDisposed = true; processesDisposed = true;
      await this.memoryReports.dispose();
      await Promise.allSettled([this.initialization, this.consent, this.conversation?.settleWrites(), this.directTask?.settleWrites(), this.conversation?.settleMemory(), this.directTask?.settleMemory()]);
      this.flushDeferredCaptures();
      await this.captureMemory();
      await this.captureTail;
      await this.deps.memory?.flush?.();
      this.modelManagement.dispose(); this.closing = true; processesDisposed = true;
      await this.stateJournal.ready();
      await this.stateJournal.durableCommit();
      await this.stateJournal.flush();
    })();
    this.disposal = disposal;
    void disposal.catch(() => {
      if (this.disposal === disposal) { this.disposal = undefined; if (!processesDisposed) { this.closing = false; this.shuttingDown = false; } }
    });
    return disposal;
  }
}
