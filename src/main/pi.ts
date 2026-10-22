import { APP_DISPLAY_NAME } from '../shared/branding.js';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AgentAdapter, AgentEvent, AgentRunOptions, SkillCatalog } from '../shared/contracts.js';
import { createToolRegistry, type BoundToolset, type ToolRole, type ToolsetPort } from './modules/tools';
import { DIALOG_INSTRUCTIONS } from './dialog.js';
import { AGENT_INSTRUCTIONS } from './instructions.js';
import { ProcessTransport, MAX_PROMPT_CHARS, type AgentTransport, type TransportCallbacks, type HostPacket, type ProcessTransportOptions, type HostRequest, type HostRun } from './agent-protocol.js';
import { ProviderStore, redactError } from './providers.js';

// agent-host installs these SDK tools itself. Registered host handlers cannot replace them.
const WORKER_BUILTIN_TOOLS = new Set(['read', 'write', 'edit', 'powershell', 'grep', 'find', 'ls']);

export interface PiAdapterOptions {
  executable: string; processHost: string; hostEntry: string; home: string; workspace: string; providers: ProviderStore;
  getIdentityInstructions?: () => string;
  role?: ToolRole;
  tools?: ToolsetPort;
  onEvent(event: AgentEvent): void;
}
export interface PiAdapterDependencies { connect?(callbacks: TransportCallbacks, options: ProcessTransportOptions): AgentTransport; }
interface Active {
  id: string; abort: AbortController; threadId?: string; stopping: boolean; pending: Set<string>; credentialsPending: Set<string>;
  modelSelection: string; binding?: { provider: string; modelId: string; baseUrl?: string; authType?: string };
  tools?: BoundToolset;
}

export class PiAdapter implements AgentAdapter {
  private transport?: AgentTransport;
  private connecting?: Promise<AgentTransport>;
  private active?: Active;
  private disposed = false;
  private blocked = false;
  private stopping?: Promise<void>;
  private readonly tools: ToolsetPort;
  private readonly options: PiAdapterOptions;
  constructor(options: PiAdapterOptions, private readonly dependencies: PiAdapterDependencies = {}) {
    this.options = { ...options, home: resolve(options.home), workspace: resolve(options.workspace) };
    this.tools = options.tools ?? createToolRegistry([]);
  }
  private emit(event: AgentEvent): void { if (!this.disposed) this.options.onEvent(event); }
  private clean(error: unknown): string { return redactError(error, this.options.providers.secrets()); }
  async start(): Promise<void> {
    if (this.disposed) throw new Error(`${APP_DISPLAY_NAME} wird beendet.`);
    await Promise.all([mkdir(this.options.home, { recursive: true }), mkdir(this.options.workspace, { recursive: true })]);
    const configured = this.options.providers.list().filter(provider => provider.configured);
    this.emit({ type: 'models', models: configured.flatMap(provider => provider.models) });
    this.emit({ type: 'connection', status: configured.length ? 'ready' : 'missing', account: configured.map(provider => provider.label).join(', ') });
  }
  private connect(): Promise<AgentTransport> {
    if (this.disposed || this.blocked || this.stopping) return Promise.reject(new Error('Agent ist gestoppt oder sein Prozessende ist unbestätigt.'));
    if (this.transport) return Promise.resolve(this.transport);
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      this.emit({ type: 'connection', status: 'connecting' });
      await this.start();
      if (this.disposed || this.stopping) throw new Error('Agent wurde gestoppt.');
      let transport: AgentTransport;
      const callbacks: TransportCallbacks = {
        packet: packet => { if (this.transport === transport) this.packet(transport, packet); },
        closed: confirmed => {
          if (this.transport !== transport) return;
          this.transport = undefined; this.blocked = !confirmed;
          const active = this.active; active?.abort.abort();
          if (active && !active.stopping) void this.finishTurn(active, { type: 'completed', status: 'failed', error: confirmed ? 'Der Agent-Prozess wurde beendet. Es erfolgt keine automatische Wiederholung.' : 'Das Ende des Agent-Prozessbaums ist unbestätigt.' });
          this.emit({ type: 'connection', status: 'offline' });
        },
      };
      const hostOptions = { allowHandoff: this.options.role !== 'dialog' };
      transport = this.dependencies.connect?.(callbacks, hostOptions) ?? new ProcessTransport(this.options.executable, this.options.hostEntry,
        this.options.processHost, this.options.workspace, this.options.home, callbacks, hostOptions);
      this.transport = transport;
      try {
        const hello = await transport.request('hello');
        if (hello?.protocol !== 1) throw new Error('Agent-Protokoll stimmt nicht überein.');
        return transport;
      } catch (error) { await transport.terminate().catch(() => { this.blocked = true; }); if (this.transport === transport) this.transport = undefined; throw error; }
    })().finally(() => { this.connecting = undefined; });
    return this.connecting;
  }
  async run(text: string, model: string, threadId?: string, options?: AgentRunOptions): Promise<void> {
    if (this.active || this.stopping) throw new Error('Ein Auftrag läuft bereits oder wird gestoppt.');
    if (!text.trim() || text.length > MAX_PROMPT_CHARS) throw new Error('Der Auftrag ist leer oder zu groß.');
    if (/^\s*\/goal(?:\s|$)/i.test(text)) throw new Error(`/goal wird in ${APP_DISPLAY_NAME} nicht unterstützt. Bitte einen normalen Arbeitsauftrag formulieren.`);
    const active: Active = { id: randomUUID(), abort: new AbortController(), threadId, stopping: false, pending: new Set(), credentialsPending: new Set(), modelSelection: model };
    this.active = active;
    try {
      const resolved = await this.options.providers.resolveForRun(model, active.abort.signal);
      if (active.abort.signal.aborted || this.active !== active) throw new Error('Auftrag wurde unterbrochen.');
      active.binding = { provider: resolved.provider, modelId: resolved.modelId, baseUrl: resolved.baseUrl, authType: resolved.authType };
      const transport = await this.connect();
      if (active.abort.signal.aborted || this.active !== active) throw new Error('Auftrag wurde unterbrochen.');
      const dialog = this.options.role === 'dialog';
      if (options?.purpose === 'dialog' && !dialog) throw new Error('Der Dialog braucht einen eigenen Adapter mit Gesprächswerkzeugen.');
      active.tools = this.tools.bind({ runId: active.id, role: dialog ? 'dialog' : 'worker', signal: active.abort.signal,
        emit: event => { if (this.active === active && !active.abort.signal.aborted && !active.stopping) this.emit(event); } });
      if (!dialog && active.tools.definitions.some(tool => WORKER_BUILTIN_TOOLS.has(tool.name))) throw new Error('Ein registrierter Werkzeugname ist für ein SDK-Arbeitswerkzeug reserviert.');
      // A ChatGPT host receives fresh access tokens only for the currently bound request.
      // Refresh credentials remain exclusively in the protected main-process store.
      const input: HostRun = { runId: active.id, text, model: resolved.authType === 'chatgpt' ? { ...resolved, apiKey: '' } : resolved, threadId, home: this.options.home, workspace: this.options.workspace,
        dialog, tools: [...active.tools.definitions], instructions: `${dialog ? DIALOG_INSTRUCTIONS : AGENT_INSTRUCTIONS}\n\n${this.options.getIdentityInstructions?.() ?? ''}`,
        freshThreadContext: options?.freshThreadContext };
      await transport.request('run', input, 60_000);
    } catch (error) {
      if (this.active === active && !active.stopping) {
        active.abort.abort();
        try { await this.tools.stop(); }
        catch (cleanup) { this.blocked = true; throw new Error(this.clean(cleanup)); }
        if (this.active === active) this.active = undefined;
      }
      throw new Error(this.clean(error));
    }
  }
  private packet(transport: AgentTransport, packet: HostPacket): void {
    const active = this.active;
    if (!active || packet.params?.runId !== active.id || active.stopping || active.abort.signal.aborted) return;
    if (packet.method === 'event') {
      const event = packet.params.event;
      if (event.type === 'started') active.threadId = event.threadId;
      if (event.type === 'completed') {
        active.abort.abort();
        void this.finishTurn(active, event);
        return;
      }
      if (event.type === 'activity') { this.emit({ ...event, title: this.clean(event.title), ...(event.detail ? { detail: this.clean(event.detail) } : {}) }); return; }
      this.emit(event);
    } else if (packet.method === 'tool') void this.tool(transport, packet, active);
    else if (packet.method === 'credential') void this.credential(transport, packet, active);
  }
  private async finishTurn(active: Active, event: Extract<AgentEvent, { type: 'completed' }>): Promise<void> {
    // Interactive ownership ends with the turn, independently of retained servers
    // or other managed child processes. Do not publish completion before cleanup.
    try { await active.tools?.stop(); }
    catch (error) {
      if (this.active !== active || active.stopping || this.disposed) return;
      this.blocked = true;
      // Keep the runtime visible and stoppable while resource release is unconfirmed.
      this.emit({ type: 'completed', status: 'failed', error: this.clean(error) });
      return;
    }
    if (this.active !== active || active.stopping || this.disposed) return;
    this.active = undefined;
    this.emit({ ...event, ...(event.error ? { error: this.clean(event.error) } : {}) });
  }
  private async credential(transport: AgentTransport, packet: HostRequest<'credential'>, active: Active): Promise<void> {
    const id = packet.id;
    if (active.binding?.authType !== 'chatgpt' || active.credentialsPending.has(id) || active.credentialsPending.size >= 8) {
      transport.respond(packet, { error: 'Zugangsabruf für diesen Auftrag abgelehnt.' }); return;
    }
    active.credentialsPending.add(id);
    try {
      const resolved = await this.options.providers.resolveForRun(active.modelSelection, active.abort.signal);
      const binding = active.binding;
      if (resolved.authType !== 'chatgpt' || resolved.provider !== binding.provider || resolved.modelId !== binding.modelId || resolved.baseUrl !== binding.baseUrl) throw new Error('Die Modellverbindung hat sich während des Auftrags geändert.');
      if (this.active === active && !active.abort.signal.aborted && this.transport === transport) transport.respond(packet, { apiKey: resolved.apiKey });
    } catch (error) {
      if (this.active === active && !active.abort.signal.aborted && this.transport === transport) transport.respond(packet, { error: this.clean(error) });
    } finally { active.credentialsPending.delete(id); }
  }
  private async tool(transport: AgentTransport, packet: HostRequest<'tool'>, active: Active): Promise<void> {
    const { name, toolCallId, args } = packet.params;
    const allowed = active.tools?.definitions.some(tool => tool.name === name);
    if (!allowed || active.pending.has(toolCallId) || active.pending.size >= 128) {
      transport.respond(packet, { success: false, contentItems: [{ type: 'inputText', text: 'Werkzeugaufruf abgelehnt.' }] }); return;
    }
    active.pending.add(toolCallId);
    try {
      const response = await active.tools!.call(name, args);
      if (this.active === active && !active.abort.signal.aborted && this.transport === transport) transport.respond(packet, response);
    } catch (error) {
      if (this.active === active && !active.abort.signal.aborted && this.transport === transport) transport.respond(packet,
        { success: false, contentItems: [{ type: 'inputText', text: this.clean(error) }] });
    } finally { active.pending.delete(toolCallId); }
  }
  async steer(text: string, expectedTurnId?: string): Promise<void> {
    const active = this.active;
    if (!active || active.stopping || (expectedTurnId && expectedTurnId !== active.id)) throw new Error('Dieser Auftrag ist nicht mehr aktiv.');
    if (!text.trim() || text.length > MAX_PROMPT_CHARS) throw new Error('Ungültige Ergänzung.');
    await this.transport?.request('steer', { runId: active.id, text });
  }
  async hasManagedWork(): Promise<boolean> { return this.active !== undefined || Boolean(this.transport && await this.transport.managedProcessCount() > 0); }
  stop(): Promise<void> { return this.stopping ??= this.stopAll().finally(() => { this.stopping = undefined; }); }
  private async stopAll(): Promise<void> {
    const active = this.active;
    if (active) { active.stopping = true; active.abort.abort(); }
    // Stop the input side immediately; a noncooperative SDK tool cannot delay killing its process tree.
    const toolsStop = this.tools.stop();
    const transport = this.transport ?? await this.connecting?.catch(() => undefined);
    const results = await Promise.allSettled([toolsStop, transport?.terminate() ?? Promise.resolve()]);
    const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failed) { this.blocked = true; throw new Error(this.clean(failed.reason)); }
    if (this.transport === transport) this.transport = undefined;
    if (this.active === active) this.active = undefined;
    if (active) this.emit({ type: 'completed', status: 'interrupted' });
  }
  async dispose(): Promise<void> {
    await this.stop(); await this.tools.dispose(); this.disposed = true;
  }
  async listSkills(): Promise<SkillCatalog> {
    const directory = join(this.options.home, 'skills'); await mkdir(directory, { recursive: true });
    const { loadSkillsFromDir } = await import('@earendil-works/pi-coding-agent');
    const loaded = loadSkillsFromDir({ dir: directory, source: APP_DISPLAY_NAME });
    return { directory, skills: loaded.skills.map(skill => ({ name: skill.name, description: skill.description, path: skill.filePath, enabled: !skill.disableModelInvocation, scope: 'user' })),
      errors: loaded.diagnostics.map(diagnostic => ({ path: diagnostic.path ?? directory, message: diagnostic.message })) };
  }
}
