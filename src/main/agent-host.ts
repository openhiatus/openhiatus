import { APP_DISPLAY_NAME } from '../shared/branding.js';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentSession, ToolDefinition, AgentToolResult, DefaultResourceLoader, SettingsManager } from '@earendil-works/pi-coding-agent';
import type { Api, Model } from '@earendil-works/pi-ai';
import type { DynamicFunctionTool, DynamicToolResponse } from '../shared/contracts.js';
import { MAX_PACKET_BYTES, MAX_PROMPT_CHARS, PacketReader } from './agent-protocol.js';
import { decodeParentMessage, decodeHostResult, decodeToolResponse, isWireRecord, ProtocolError,
  type CommandResponseArgs, type HostToParent, type HostRun, type HostEvent, type CredentialResult } from './agent-wire.js';
import { piModel, redactError } from './providers.js';
import { applyComputerImageDetail } from './computer-image-payload.js';
import { applyRequestedServiceTier, assertFastModel, ModelRequestDiagnostics } from './model-request-diagnostics.js';
import { ComputerImageHistory, computerImageHistoryInstructions } from './computer-image-history.js';
export type { HostRun } from './agent-wire.js';
interface SessionReference { file: string; dialog: boolean; workspace: string; computerOnly?: boolean; }
const BUILTIN_TOOLS = ['read', 'write', 'edit', 'powershell', 'grep', 'find', 'ls'];
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value);

export function hostToolNames(input: Pick<HostRun, 'dialog' | 'computerOnly' | 'tools'>): string[] {
  if (input.dialog && input.computerOnly) throw new Error('Ungültige Agent-Rolle.');
  const registered = input.tools.map(tool => tool.name);
  if (input.computerOnly && registered.some(name => BUILTIN_TOOLS.includes(name))) throw new Error('SDK-Arbeitswerkzeuge sind im Computeradapter gesperrt.');
  return input.dialog || input.computerOnly ? registered : [...BUILTIN_TOOLS, ...registered];
}

/** Legacy references are ordinary workers; they can never be resumed by a restricted computer worker. */
export function matchingSessionReference(value: unknown, input: Pick<HostRun, 'dialog' | 'computerOnly' | 'workspace'>, sessionsDirectory: string): SessionReference | undefined {
  if (!isWireRecord(value) || typeof value.file !== 'string' || typeof value.dialog !== 'boolean' || typeof value.workspace !== 'string'
    || (value.computerOnly !== undefined && typeof value.computerOnly !== 'boolean')) return;
  if (value.dialog !== input.dialog || Boolean(value.computerOnly) !== Boolean(input.computerOnly) || resolve(value.workspace) !== resolve(input.workspace)
    || !resolve(value.file).startsWith(resolve(sessionsDirectory) + '\\')) return;
  return { file: value.file, dialog: value.dialog, workspace: value.workspace, ...(value.computerOnly ? { computerOnly: true } : {}) };
}

/** Explicit discovery switches are a security boundary for dialog and computer agents. */
export function resourceOptions(input: Pick<HostRun, 'workspace' | 'home' | 'instructions'>, settingsManager?: SettingsManager): ConstructorParameters<typeof DefaultResourceLoader>[0] {
  return { cwd: input.workspace, agentDir: input.home, settingsManager,
    noExtensions: true, noSkills: true, noContextFiles: true, noPromptTemplates: true, noThemes: true,
    additionalExtensionPaths: [], extensionFactories: [], additionalSkillPaths: [],
    additionalPromptTemplatePaths: [], additionalThemePaths: [],
    agentsFilesOverride: () => ({ agentsFiles: [] }), appendSystemPromptOverride: () => [],
    systemPrompt: input.instructions,
  };
}
export function imageContent(response: DynamicToolResponse, toolName?: string): AgentToolResult<{ success: boolean; computerViews?: number[] }> & { isError?: boolean } {
  const verified = decodeToolResponse(response);
  const content: AgentToolResult<{ success: boolean }>['content'] = verified.contentItems.map(item => {
    if (item.type === 'inputText') {
      if (typeof item.text !== 'string' || item.text.length > 2_000_000) throw new Error('Werkzeugtext ist zu groß.');
      return { type: 'text', text: item.text };
    }
    const match = typeof item.imageUrl === 'string' && /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]*={0,2})$/.exec(item.imageUrl);
    if (!match || match[2].length > 56_000_000 || match[2].length % 4 !== 0) throw new Error('Ungültiges Werkzeugbild.');
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.toString('base64') !== match[2] || (match[1] === 'png' && !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))) throw new Error('Ungültiges Werkzeugbild.');
    return { type: 'image', mimeType: `image/${match[1]}`, data: match[2] };
  });
  const computerViews = toolName === 'computer' ? verified.contentItems.flatMap((item, index) => item.type === 'inputImage' && item.computerView ? [index] : []) : [];
  return { content, details: { success: response.success, ...(computerViews.length ? { computerViews } : {}) }, ...(response.success ? {} : { isError: true }) };
}

export class AgentHost {
  private session?: AgentSession;
  private active?: { input: HostRun; aborted: boolean; abort: AbortController; diagnostics: Set<ModelRequestDiagnostics> };
  private readonly pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void; cleanup(): void }>();
  private keys: string[] = [];
  constructor(private readonly send: (packet: HostToParent) => void) {}
  async receive(value: unknown): Promise<void> {
    const packet = decodeParentMessage(value);
    if (packet.method === undefined) {
      const entry = this.pending.get(packet.id); if (!entry) return;
      this.pending.delete(packet.id); entry.cleanup();
      if (packet.error !== undefined) entry.reject(new Error(packet.error));
      else { try { entry.resolve(packet.result); } catch { entry.reject(new ProtocolError()); throw new ProtocolError(); } }
      return;
    }
    try {
      switch (packet.method) {
        case 'hello': this.reply(packet, { protocol: 1 }); break;
        case 'run': await this.run(packet.params); this.reply(packet, { accepted: true }); break;
        case 'steer':
          if (!this.active || this.active.aborted || packet.params?.runId !== this.active.input.runId || typeof packet.params?.text !== 'string' || packet.params.text.length > MAX_PROMPT_CHARS) throw new Error('Kein passender aktiver Auftrag.');
          await this.session?.steer(packet.params.text); this.reply(packet, { accepted: true }); break;
        case 'abort': await this.abort(); this.reply(packet, { stopped: true }); break;
      }
    } catch (error) { if (packet.id) this.send({ id: packet.id, error: redactError(error, this.keys) }); }
  }
  private reply(...[request, result]: CommandResponseArgs): void { if (request.id) this.send({ id: request.id, result }); }
  private emit(runId: string, event: HostEvent): void { this.send({ method: 'event', params: { runId, event } }); }
  private async requestCredential(input: HostRun, signal?: AbortSignal): Promise<string> {
    const active = this.active;
    if (!active || active.input !== input || active.aborted || signal?.aborted) throw new Error('Auftrag wurde unterbrochen.');
    if (this.pending.size >= 128) throw new Error('Zu viele ausstehende Agent-Anfragen.');
    const operation = signal ? AbortSignal.any([signal, active.abort.signal]) : active.abort.signal;
    const id = randomUUID();
    const result = await new Promise<CredentialResult>((resolveResult, reject) => {
      const cancel = () => { const pending = this.pending.get(id); if (!pending) return; this.pending.delete(id); pending.cleanup(); reject(new Error('Zugangsabruf wurde unterbrochen.')); };
      const timer = setTimeout(cancel, 30_000);
      const cleanup = () => { clearTimeout(timer); operation.removeEventListener('abort', cancel); };
      this.pending.set(id, { resolve: value => resolveResult(decodeHostResult('credential', value)), reject, cleanup }); operation.addEventListener('abort', cancel, { once: true });
      this.send({ id, method: 'credential', params: { runId: input.runId } });
    });
    if (operation.aborted) throw new Error('Zugangsabruf wurde unterbrochen.');
    if (result?.error) throw new Error(result.error);
    if (typeof result?.apiKey !== 'string' || !result.apiKey || result.apiKey.length > 32_000 || /[\r\n\0]/.test(result.apiKey)) throw new Error('Ungültiger ChatGPT-Zugang.');
    if (!this.keys.includes(result.apiKey)) this.keys.push(result.apiKey);
    return result.apiKey;
  }
  private tool(input: HostRun, definition: DynamicFunctionTool): ToolDefinition {
    const parameters = definition.inputSchema;
    if (!isWireRecord(parameters)) throw new ProtocolError();
    return {
      name: definition.name, label: definition.name, description: definition.description, parameters,
      execute: async (toolCallId, args, signal) => {
        if (!this.active || this.active.input.runId !== input.runId || this.active.aborted || signal?.aborted) throw new Error('Auftrag wurde unterbrochen.');
        if (this.pending.size >= 128 || typeof toolCallId !== 'string' || toolCallId.length > 512) throw new Error('Zu viele ausstehende Werkzeugaufrufe.');
        const id = randomUUID();
        const response = await new Promise<DynamicToolResponse>((resolveResult, reject) => {
          const cancel = () => {
            const pending = this.pending.get(id); if (!pending) return;
            this.pending.delete(id); pending.cleanup(); reject(new Error('Werkzeug wurde unterbrochen.'));
          };
          const timer = setTimeout(cancel, 10 * 60_000);
          const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); };
          this.pending.set(id, { resolve: value => resolveResult(decodeHostResult('tool', value)), reject, cleanup }); signal?.addEventListener('abort', cancel, { once: true });
          this.send({ id, method: 'tool', params: { runId: input.runId, toolCallId, name: definition.name, args } });
        });
        return imageContent(response, definition.name);
      },
    };
  }
  private async run(input: HostRun): Promise<void> {
    if (this.active) throw new Error('Ein Auftrag läuft bereits.');
    this.keys = input.model.apiKey ? [input.model.apiKey] : [];
    const active: NonNullable<AgentHost['active']> = { input, aborted: false, abort: new AbortController(), diagnostics: new Set() }; this.active = active;
    try {
      const tools = hostToolNames(input);
      this.session?.dispose(); this.session = undefined;
      const pi = await import('@earendil-works/pi-coding-agent');
      const ai = await import('@earendil-works/pi-ai');
      const sessionsDirectory = join(input.home, 'sessions');
      await mkdir(sessionsDirectory, { recursive: true });
      const referenceDirectory = join(input.home, 'session-index');
      await mkdir(referenceDirectory, { recursive: true });
      let sessionManager;
      if (input.threadId) {
        if (!identifier(input.threadId)) throw new Error('Ungültige Sitzungskennung.');
        let saved: SessionReference | undefined;
        try {
          const value: unknown = JSON.parse(await readFile(join(referenceDirectory, `${input.threadId}.json`), 'utf8'));
          saved = matchingSessionReference(value, input, sessionsDirectory);
        } catch { /* unknown session */ }
        if (!saved) throw new Error(`Diese Sitzung gehört nicht zu diesem ${APP_DISPLAY_NAME}-Auftrag.`);
        sessionManager = pi.SessionManager.open(saved.file, sessionsDirectory, input.workspace);
      } else sessionManager = pi.SessionManager.create(input.workspace, sessionsDirectory);
      const model: Model<Api> = await piModel(input.model);
      if (input.serviceTier) assertFastModel(model);
      const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
      let totalCost = 0;
      const subscription = input.model.authType === 'chatgpt';
      // The SDK's static price table does not account for the returned Fast tier.
      const knownPrice = !subscription && !input.serviceTier && input.model.provider !== 'local' && Object.values(model.cost ?? {}).some(value => typeof value === 'number' && value > 0);
      const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
      const stored = new ai.InMemoryCredentialStore();
      await stored.modify(input.model.provider, async () => ({ type: 'api_key', key: subscription ? 'openhiatus-managed-chatgpt' : input.model.apiKey }));
      const credentials: import('@earendil-works/pi-ai').CredentialStore = subscription ? {
        read: async (provider, options) => provider === input.model.provider ? { type: 'api_key', key: await this.requestCredential(input, options?.signal) } : undefined,
        list: options => stored.list(options),
        modify: (provider, update, options) => stored.modify(provider, update, options),
        delete: (provider, options) => stored.delete(provider, options),
      } : stored;
      const modelRuntime = await pi.ModelRuntime.create({ credentials, modelsPath: null, refreshOnCreate: false, allowModelNetwork: false,
        modelsStorePath: join(input.home, 'models-cache.json') });
      modelRuntime.registerProvider(input.model.provider, { baseUrl: model.baseUrl, api: model.api, ...(!subscription ? { apiKey: input.model.apiKey } : {}), models: [model] });
      if (!subscription) await modelRuntime.setRuntimeApiKey(input.model.provider, input.model.apiKey);
      const settingsManager = pi.SettingsManager.inMemory({ packages: [], extensions: [], skills: [], prompts: [], themes: [],
        retry: { enabled: false, provider: { maxRetries: 0 } }, cacheWarming: 'off' }, { projectTrusted: false });
      const imageRetention = input.computerImageRetentionCalls ?? 0;
      const resourceLoader = new pi.DefaultResourceLoader({ ...resourceOptions({ ...input,
        instructions: `${input.instructions}${imageRetention ? `\n\n${computerImageHistoryInstructions(imageRetention)}` : ''}` }, settingsManager),
        skillsOverride: () => input.dialog || input.computerOnly ? { skills: [], diagnostics: [] } : pi.loadSkillsFromDir({ dir: join(input.home, 'skills'), source: APP_DISPLAY_NAME }),
      });
      await resourceLoader.reload();
      const customTools = input.tools.map(definition => this.tool(input, definition));
      const { session } = await pi.createAgentSession({ cwd: input.workspace, agentDir: input.home, modelRuntime, model,
        settingsManager, sessionManager, resourceLoader, tools, customTools, thinkingLevel: 'medium' });
      this.session = session;
      const threadId = session.sessionId, imageHistoryPath = join(referenceDirectory, `${threadId}.computer-images.json`);
      let savedImages: unknown;
      if (imageRetention) { try { savedImages = JSON.parse(await readFile(imageHistoryPath, 'utf8')); } catch { /* old screenshots remain expired on a legacy resume */ } }
      const imageHistory = imageRetention ? new ComputerImageHistory(imageRetention, savedImages, input.threadId ? session.messages : []) : undefined;
      const onPayload = session.agent.onPayload;
      session.agent.onPayload = async (payload, requestModel) => {
        const transformed = await onPayload?.(payload, requestModel);
        return applyComputerImageDetail(transformed === undefined ? payload : transformed, session.messages, requestModel);
      };
      const stream = session.agent.streamFunction;
      session.agent.streamFunction = async (requestModel, context, options) => {
        const diagnostics = new ModelRequestDiagnostics(input.computerOnly ? 'computer' : input.dialog ? 'dialog' : 'worker', input.serviceTier,
          request => this.emit(input.runId, { type: 'model-request', request }));
        active.diagnostics.add(diagnostics);
        diagnostics.start(`${input.model.provider}/${requestModel.id}`);
        const finish = (status: 'completed' | 'failed' | 'aborted', reported?: import('@earendil-works/pi-ai').Usage) => {
          diagnostics.finish(status, reported ? { inputTokens: finite(reported.input), outputTokens: finite(reported.output), cacheReadTokens: finite(reported.cacheRead), cacheWriteTokens: finite(reported.cacheWrite),
            ...(knownPrice ? { costUsd: finite(reported.cost?.total) } : {}) } : undefined);
          active.diagnostics.delete(diagnostics);
        };
        try {
          let requestContext = context;
          if (imageHistory && !active.aborted && !options?.signal?.aborted) {
            const messages = imageHistory.nextRequest(context.messages);
            const source = sessionManager.getBranch().flatMap(pi.sessionEntryToContextMessages);
            requestContext = { ...context, messages: imageHistory.projectSummary(messages, source,
              message => pi.serializeConversation(pi.convertToLlm([message as Parameters<typeof pi.convertToLlm>[0][number]]))) };
            const temporary = `${imageHistoryPath}.${input.runId}.tmp`;
            await writeFile(temporary, JSON.stringify(imageHistory.snapshot()), 'utf8'); await rename(temporary, imageHistoryPath);
          }
          // Compaction uses the same stream function without the agent's payload/event hooks.
          // Install request-scoped hooks here so it also carries Fast and complete diagnostics.
          if (active.aborted || active.abort.signal.aborted || options?.signal?.aborted) throw new Error('Auftrag wurde unterbrochen.');
          const result = await stream(requestModel, requestContext, { ...options, ...(subscription ? { cacheRetention: 'none' } : {}), maxRetries: 0,
            onPayload: async (payload, actualModel) => {
              const transformed = await options?.onPayload?.(payload, actualModel);
              return applyRequestedServiceTier(transformed === undefined ? payload : transformed, actualModel, input.serviceTier);
            },
            onProviderStreamEvent: async (data, actualModel) => {
              diagnostics.observe(data);
              const event = isWireRecord(data) ? data : undefined;
              if (subscription && (event?.type === 'response.incomplete' || (event?.type === 'response.completed' && (!isWireRecord(event.response) || event.response.status !== 'completed')))) {
                throw new Error('Die ChatGPT-Antwort wurde nicht vollständig abgeschlossen. Bitte erneut versuchen.');
              }
              await options?.onProviderStreamEvent?.(data, actualModel);
            },
          });
          void result.result().then(message => finish(active.aborted || message.stopReason === 'aborted' ? 'aborted' : message.stopReason === 'error' ? 'failed' : 'completed', message.usage),
            () => finish(active.aborted ? 'aborted' : 'failed'));
          return result;
        } catch (error) {
          finish(active.abort.signal.aborted ? 'aborted' : 'failed'); throw error;
        }
      };
      const names = session.getActiveToolNames();
      if ((input.dialog || input.computerOnly) && names.some(name => !input.tools.some(tool => tool.name === name))) { session.dispose(); throw new Error('Agent-Werkzeuggrenze konnte nicht bestätigt werden.'); }
      const indexPath = join(referenceDirectory, `${threadId}.json`);
      const reference: SessionReference = { file: sessionManager.getSessionFile()!, dialog: input.dialog, workspace: input.workspace, ...(input.computerOnly ? { computerOnly: true } : {}) };
      const temporary = `${indexPath}.${input.runId}.tmp`;
      await writeFile(temporary, JSON.stringify(reference), 'utf8'); await rename(temporary, indexPath);
      session.subscribe(event => {
        if (this.active !== active || active.aborted) return;
        if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') this.emit(input.runId, { type: 'delta', text: event.assistantMessageEvent.delta });
        if (event.type === 'message_end' && event.message.role === 'assistant') {
          const reported = event.message.usage;
          usage.inputTokens += finite(reported.input); usage.outputTokens += finite(reported.output);
          usage.cacheReadTokens += finite(reported.cacheRead); usage.cacheWriteTokens += finite(reported.cacheWrite);
          totalCost += finite(reported.cost?.total);
          this.emit(input.runId, { type: 'usage', usage: { ...usage, ...(knownPrice ? { costUsd: totalCost } : {}) } });
        }
        if (event.type === 'tool_execution_start') this.emit(input.runId, { type: 'activity', kind: ['read', 'write', 'edit'].includes(event.toolName) ? 'file' : 'command', title: `Werkzeug: ${event.toolName}` });
      });
      if (active.aborted) { await session.abort(); throw new Error('Auftrag wurde unterbrochen.'); }
      this.emit(input.runId, { type: 'started', threadId, turnId: input.runId });
      const prompt = !input.threadId && input.freshThreadContext ? `${input.freshThreadContext}\n\n${input.text}` : input.text;
      void session.prompt(prompt, { expandPromptTemplates: false }).then(() => {
        if (this.active !== active || active.aborted) return;
        const last = [...session.messages].reverse().find(message => message.role === 'assistant');
        const context = session.getContextUsage();
        if (context?.tokens !== null && context?.tokens !== undefined) this.emit(input.runId, { type: 'context', threadId, usedTokens: context.tokens, windowTokens: context.contextWindow });
        if (last?.role === 'assistant' && (last.stopReason === 'error' || last.stopReason === 'aborted')) throw new Error(last.errorMessage || 'Der Modellaufruf wurde nicht abgeschlossen.');
        if (subscription && input.model.api === 'openai-responses' && (last?.role !== 'assistant' || last.rawStopReason !== 'completed')) throw new Error('Die ChatGPT-Antwort wurde nicht vollständig abgeschlossen.');
        this.emit(input.runId, { type: 'completed', status: 'completed', text: session.getLastAssistantText() ?? '' });
      }).catch(error => {
        if (this.active === active && !active.aborted) this.emit(input.runId, { type: 'completed', status: 'failed', error: redactError(error, this.keys) });
      }).finally(() => { for (const diagnostics of active.diagnostics) diagnostics.finish(active.aborted ? 'aborted' : 'failed'); active.diagnostics.clear(); if (this.active === active) this.active = undefined; });
    } catch (error) { for (const diagnostics of active.diagnostics) diagnostics.finish(active.aborted ? 'aborted' : 'failed'); active.diagnostics.clear(); if (this.active === active) this.active = undefined; throw error; }
  }
  async abort(): Promise<void> {
    if (this.active) { this.active.aborted = true; this.active.abort.abort(); for (const diagnostics of this.active.diagnostics) diagnostics.finish('aborted'); this.active.diagnostics.clear(); }
    for (const entry of this.pending.values()) { entry.cleanup(); entry.reject(new Error('Auftrag wurde unterbrochen.')); }
    this.pending.clear(); await this.session?.abort();
  }
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === resolve(fileURLToPath(import.meta.url)).toLowerCase()) {
  // The flag is needed only while booting Electron's Node runtime. Child applications
  // launched by PowerShell must receive their normal GUI/runtime behavior.
  delete process.env.ELECTRON_RUN_AS_NODE;
  const send = (packet: HostToParent) => {
    const line = `${JSON.stringify(packet)}\n`;
    if (Buffer.byteLength(line) > MAX_PACKET_BYTES) { process.exitCode = 2; process.stdin.destroy(); return; }
    process.stdout.write(line);
  };
  const host = new AgentHost(send), reader = new PacketReader();
  process.stdin.on('data', (chunk: Buffer) => {
    try { reader.push(chunk, packet => { void host.receive(packet).catch(() => host.abort().finally(() => process.exit(2))); }); }
    catch { void host.abort().finally(() => process.exit(2)); }
  });
  process.stdin.once('end', () => { void host.abort().finally(() => process.exit(0)); });
}
