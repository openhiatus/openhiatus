import type { AgentEvent, ChatGPTConnection, Connections, ModelOption, ProviderInput, ProviderView } from '../../../shared/contracts';

export interface ModelSelections { model: string; dialogModel: string; memoryModel: string; computerModel?: string; }
export interface ModelManagementState {
  selections: ModelSelections;
  models: ModelOption[];
  providers: ProviderView[];
  agent: Connections['agent'];
  account: string;
  chatgpt?: ChatGPTConnection;
}
export interface ModelManagementPorts {
  providers?: { list(): ProviderView[]; save(input: ProviderInput): Promise<void>; test(id: string): Promise<void>; remove(id: string): Promise<void>; secrets(): string[]; };
  chatgpt?: { snapshot(): ChatGPTConnection; signIn(): Promise<void>; cancelSignIn(): Promise<void>; signOut(): Promise<void>; };
  lifecycle: {
    assertIdle(): void;
    closed(): boolean;
    workRevision(): number;
    taskActive(): boolean;
    invalidateThread(): void;
    stopIdleRuntimes(): Promise<void>;
    restart(): Promise<void>;
  };
  projection: { publish(state: ModelManagementState): void; changed(save?: boolean): void; };
  clean(text: string): string;
}

/** Public model availability and account-management lifetime, independent of auth/store adapters. */
export class ModelManagementCoordinator {
  private state: ModelManagementState;
  private updating = false;
  private authEpoch = 0;
  private closed = false;
  private readonly knownSecrets = new Set<string>();
  private computerSelectionInitialized = false;
  constructor(initial: ModelSelections, private readonly ports: ModelManagementPorts) {
    this.state = { selections: { ...initial }, providers: [], models: [], agent: 'offline', account: '' };
  }
  snapshot(): ModelManagementState { return structuredClone(this.state); }
  secrets(): string[] { return [...new Set([...this.knownSecrets, ...(this.ports.providers?.secrets() ?? [])])]; }
  assertUnlocked(): void {
    if (this.updating) throw new Error('Ein Modellanbieter wird gerade geändert. Bitte kurz warten.');
  }
  private project(): void { this.ports.projection.publish(this.snapshot()); }
  private changed(save = true): void { this.project(); this.ports.projection.changed(save); }
  private rememberSecrets(): void { for (const key of this.ports.providers?.secrets() ?? []) this.knownSecrets.add(key); }
  private normalizeSelections(): void {
    for (const key of ['model', 'dialogModel', 'memoryModel'] as const) {
      if (!this.state.models.some(model => model.id === this.state.selections[key])) this.state.selections[key] = this.state.models[0]?.id ?? '';
    }
    // Computer delegation is optional. Never replace a missing role with an
    // unrelated first model; only offer Luna once for a new, empty selection.
    if (this.state.selections.computerModel !== undefined) {
      const selected = this.state.selections.computerModel;
      if (!this.computerSelectionInitialized && !selected && this.state.models.length) {
        this.state.selections.computerModel = this.state.models.find(model => /(?:^|\/)gpt-6-luna$/.test(model.id))?.id ?? '';
      } else if (selected && (this.state.models.length || this.computerSelectionInitialized) && !this.state.models.some(model => model.id === selected)) this.state.selections.computerModel = '';
      if (this.state.models.length) this.computerSelectionInitialized = true;
    }
  }
  private refreshProviders(): void {
    if (!this.ports.providers) return;
    this.rememberSecrets();
    this.state.providers = structuredClone(this.ports.providers.list());
    this.state.models = this.state.providers.filter(provider => provider.configured).flatMap(provider => provider.models);
    this.normalizeSelections();
    this.state.agent = this.state.models.length ? 'ready' : 'missing';
    this.state.account = this.state.providers.filter(provider => provider.configured).map(provider => provider.label).join(', ');
  }
  private refreshAuth(): void {
    if (!this.ports.chatgpt) return;
    this.rememberSecrets();
    const snapshot = this.ports.chatgpt.snapshot();
    this.state.chatgpt = { status: snapshot.status, planUsage: snapshot.planUsage,
      ...(snapshot.account ? { account: this.ports.clean(snapshot.account) } : {}), ...(snapshot.error ? { error: this.ports.clean(snapshot.error) } : {}) };
  }
  /** Explicitly called after composition assigns the coordinator, so redaction can consult its secrets. */
  initialize(): void { this.refreshProviders(); this.refreshAuth(); this.project(); }
  refreshChatGPT(): void {
    if (this.closed || this.ports.lifecycle.closed()) return;
    this.refreshAuth(); this.refreshProviders(); this.changed(false);
  }
  handle(event: Extract<AgentEvent, { type: 'models' | 'connection' }>): void {
    if (event.type === 'models') { this.state.models = structuredClone(event.models); this.normalizeSelections(); }
    else { this.state.agent = event.status; this.state.account = event.account ? this.ports.clean(event.account) : ''; }
    this.changed();
  }
  offline(): void { this.state.agent = 'offline'; this.project(); }
  validateSelections(patch: Partial<ModelSelections>): void {
    for (const key of ['model', 'dialogModel', 'memoryModel'] as const) if (patch[key] !== undefined && !this.state.models.some(model => model.id === patch[key])) throw new Error('Dieses Modell ist nicht verfügbar.');
    if (patch.computerModel !== undefined && patch.computerModel !== '' && !this.state.models.some(model => model.id === patch.computerModel)) throw new Error('Dieses Computer-Modell ist nicht verfügbar.');
  }
  select(patch: Partial<ModelSelections>): void {
    this.validateSelections(patch);
    for (const key of ['model', 'dialogModel', 'memoryModel'] as const) if (patch[key] !== undefined) this.state.selections[key] = patch[key];
    if (patch.computerModel !== undefined) { this.state.selections.computerModel = patch.computerModel; this.computerSelectionInitialized = true; }
    this.project();
  }
  private assertIdle(): void { this.assertUnlocked(); this.ports.lifecycle.assertIdle(); }
  private async authChange(change: () => Promise<void>): Promise<void> {
    this.assertIdle();
    const authEpoch = ++this.authEpoch, workRevision = this.ports.lifecycle.workRevision();
    this.updating = true;
    try { await change(); }
    finally {
      this.updating = false;
      this.refreshChatGPT();
      if (!this.ports.lifecycle.taskActive()) this.ports.lifecycle.invalidateThread();
      this.changed();
    }
    if (authEpoch === this.authEpoch && workRevision === this.ports.lifecycle.workRevision() && !this.closed && !this.ports.lifecycle.closed()) await this.ports.lifecycle.restart();
  }
  async signInChatGPT(): Promise<void> {
    if (!this.ports.chatgpt) throw new Error('Die ChatGPT-Anmeldung ist in diesem Build nicht verfügbar.');
    await this.authChange(() => this.ports.chatgpt!.signIn());
  }
  async cancelChatGPTSignIn(): Promise<void> {
    ++this.authEpoch;
    if (!this.ports.chatgpt) return;
    await this.ports.chatgpt.cancelSignIn(); this.refreshChatGPT();
  }
  async signOutChatGPT(): Promise<void> {
    if (!this.ports.chatgpt) throw new Error('Die ChatGPT-Anmeldung ist in diesem Build nicht verfügbar.');
    await this.authChange(() => this.ports.chatgpt!.signOut());
  }
  private async providerChange(change: () => Promise<void>): Promise<void> {
    this.assertIdle(); this.updating = true;
    const workRevision = this.ports.lifecycle.workRevision();
    this.state.agent = 'connecting'; this.changed(false);
    try { await this.ports.lifecycle.stopIdleRuntimes(); await change(); }
    finally { this.updating = false; this.refreshProviders(); this.ports.lifecycle.invalidateThread(); this.changed(); }
    if (workRevision === this.ports.lifecycle.workRevision() && !this.closed && !this.ports.lifecycle.closed()) await this.ports.lifecycle.restart();
  }
  async saveProvider(input: ProviderInput): Promise<void> {
    if (!this.ports.providers) throw new Error('Anbieter-Verwaltung ist nicht verfügbar.');
    if (input.apiKey) this.knownSecrets.add(input.apiKey);
    await this.providerChange(() => this.ports.providers!.save(input));
  }
  async testProvider(id: string): Promise<void> {
    if (!this.ports.providers) throw new Error('Anbieter-Verwaltung ist nicht verfügbar.');
    await this.providerChange(() => this.ports.providers!.test(id));
  }
  async removeProvider(id: string): Promise<void> {
    if (!this.ports.providers) throw new Error('Anbieter-Verwaltung ist nicht verfügbar.');
    await this.providerChange(() => this.ports.providers!.remove(id));
  }
  dispose(): void { this.closed = true; ++this.authEpoch; }
}
