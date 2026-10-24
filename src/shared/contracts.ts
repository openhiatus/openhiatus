import type { SkillFavorites } from './skill-favorites';
import type { SidebarMode } from './workspace-preferences';
import type { ActivityPresence } from './activity-presence';
import type { AssistantProfile } from './assistant-profile';
import type { GoogleCalendarApi } from './calendar';
import type { MemorySnapshot, MemorySource, MemorySearchResult, MemoryPeriodRequest, MemoryPeriodPage, SummaryJobState } from './memory';

export interface Usage { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; costUsd?: number; }
/** Immutable desktop configuration captured when a task is admitted. */
export interface ComputerTaskSettings {
  delegationEnabled: boolean; model: string; fast: boolean; overviewScaleDivisor: number;
  /** Older jobs keep native details, unlimited image history and the previous tool history. */
  detailScaleDivisor?: number; imageRetentionCalls?: number; workingMemoryCalls?: number;
}
export interface ModelRequest {
  role: 'dialog' | 'worker' | 'computer'; model: string;
  requestedServiceTier?: 'fast'; actualServiceTier?: string;
  elapsedMs: number; status: 'completed' | 'failed' | 'aborted'; usage?: Usage;
}
/** Bounded aggregates, grouped by role, model and requested/returned service tier. */
export interface ModelRequestSummary extends Omit<ModelRequest, 'status'> { requests: number; completed: number; failed: number; aborted: number; }
export type TaskStatus = 'idle' | 'running' | 'stopping' | 'completed' | 'interrupted' | 'failed';
export interface Message { id: string; role: 'user' | 'assistant'; text: string; at: string; source?: 'agent'; jobId?: string; }
export interface Activity { id: string; at: string; kind: 'system' | 'command' | 'file' | 'error'; title: string; detail?: string; }
export interface Task { id: string; status: TaskStatus; threadId?: string; turnId?: string; error?: string; }
export interface Preferences {
  assistantProfile?: AssistantProfile;
  itSupporter?: boolean;
  sidebarMode?: SidebarMode; activityOverlayEnabled?: boolean; activityOverlaySize?: number;
  inputDeviceId: string; outputDeviceId: string;
  inputDeviceLabel?: string; inputDeviceGroupId?: string; outputDeviceLabel?: string; outputDeviceGroupId?: string;
  computerOverviewScaleDivisor?: number;
  computerDetailScaleDivisor?: number; computerImageRetentionCalls?: number; computerWorkingMemoryCalls?: number;
  computerDelegationEnabled?: boolean; computerModel?: string; computerFast?: boolean;
  speakReplies: boolean; voiceId: string; model: string; memoryAutoSummarize?: boolean; voiceConversation?: boolean; earcons?: boolean; skillFavorites?: SkillFavorites; dialogModel: string; memoryModel: string; fullAccessAcknowledged?: boolean; chatgptBackgroundUsage?: boolean;
}
export type PreferencesPatch = Partial<Omit<Preferences, 'fullAccessAcknowledged'>>;
export interface BackgroundJob {
  id: string; requestId: string; title: string; prompt: string;
  status: 'queued' | 'running' | 'stopping' | 'completed' | 'interrupted' | 'failed';
  createdAt: string; updatedAt: string; model: string; resources: string[];
  computer?: ComputerTaskSettings; modelRequests?: ModelRequestSummary[];
  threadId?: string; turnId?: string; result?: string; error?: string; runtimeRetained?: boolean; identityInstructions?: string; usage?: Usage;
}
export type BackgroundJobView = Omit<BackgroundJob, 'identityInstructions'>;
export interface SpeechCue { id: string; text: string; at: string; jobId?: string; kind?: 'progress' | 'receipt'; }
export interface Connections { agent: 'offline' | 'missing' | 'ready' | 'connecting'; account: string; speech: 'missing' | 'saved' | 'verified'; }
export interface ModelOption { id: string; label: string; provider?: string; }
export interface ChatGPTConnection { status: 'signed-out' | 'signing-in' | 'signed-in' | 'error'; account?: string; planUsage: boolean; error?: string; }
export interface ProviderView { id: string; label: string; configured: boolean; verified: boolean; baseUrl?: string; models: ModelOption[]; error?: string; authType?: 'api-key' | 'chatgpt'; account?: string; }
export interface ProviderInput { id: string; apiKey?: string; baseUrl?: string; models?: string[]; }
export interface SkillEntry { name: string; displayName?: string; description: string; path: string; enabled: boolean; scope: 'user' | 'repo' | 'system' | 'admin'; }
export interface SkillIssue { path: string; message: string; }
export interface SkillCatalog { skills: SkillEntry[]; errors: SkillIssue[]; directory: string; }
export interface Snapshot { messages: Message[]; activity: Activity[]; task: Task; preferences: Preferences; connections: Connections; models: ModelOption[]; providers?: ProviderView[]; chatgpt?: ChatGPTConnection; hotkeys?: { recording: boolean; submit: boolean; stop: boolean }; workspace: string; version: string; jobs?: BackgroundJobView[]; speech?: SpeechCue[]; summary?: SummaryJobState; context?: ContextUsage; usage?: Usage; }
/** Fill of the conversation thread's model context, as last reported by the agent. */
export interface ContextUsage { threadId: string; usedTokens: number; windowTokens?: number; at: string; }
export interface AudioClip { base64: string; mimeType: string; }
export interface ComputerFrame { dataUrl: string; frameId: string; width: number; height: number; at: string; observation?: import('./computer-views').ComputerObservation; }
export interface OpenhiatusApi extends GoogleCalendarApi {
  snapshot(): Promise<Snapshot>;
  subscribe(listener: (state: Snapshot) => void): () => void;
  onStop(listener: () => void): () => void;
  onToggleRecording(listener: () => void): () => void;
  onSubmitDraft(listener: () => void): () => void;
  publishActivityPresence(state: ActivityPresence): void;
  onComputerFrame(listener: (frame: ComputerFrame) => void): () => void;
  send(text: string, requestId: string): Promise<void>;
  stop(): Promise<void>;
  stopJob(id: string): Promise<void>;
  savePreferences(preferences: PreferencesPatch): Promise<void>;
  acknowledgeFullAccess(): Promise<void>;
  signInChatGPT(): Promise<void>;
  cancelChatGPTSignIn(): Promise<void>;
  signOutChatGPT(): Promise<void>;
  openChatGPTUsage(): Promise<void>;
  saveProvider(input: ProviderInput): Promise<void>;
  testProvider(id: string): Promise<void>;
  removeProvider(id: string): Promise<void>;
  listSkills(): Promise<SkillCatalog>;
  openSkillsFolder(): Promise<void>;
  saveSpeechKey(key: string): Promise<void>;
  removeSpeechKey(): Promise<void>;
  testSpeech(): Promise<AudioClip>;
  transcribe(clip: AudioClip): Promise<string>;
  synthesize(text: string): Promise<AudioClip>;
  openWorkspace(): Promise<void>;
  revealFile(path: string): Promise<void>;
  newConversation(): Promise<void>;
  memorySnapshot(): Promise<MemorySnapshot>;
  rebuildMemory(): Promise<MemorySnapshot>;
  startMemorySummary(): Promise<void>;
  readMemoryPeriod(request: MemoryPeriodRequest): Promise<MemoryPeriodPage>;
  editMemory(id: string, content: string, expectedVersion: number): Promise<MemorySnapshot>;
  decideMemoryProposal(id: string, decision: 'approve' | 'reject'): Promise<MemorySnapshot>;
  memorySource(id: string): Promise<MemorySource | undefined>;
  searchMemory(query: string): Promise<MemorySearchResult[]>;

}
declare global { interface Window { openhiatus: OpenhiatusApi; } }

// Internal main-process boundaries. Credentials never cross back into the renderer.
export type AgentEvent =
  | { type: 'computer-frame'; frame: ComputerFrame }
  | { type: 'connection'; status: Connections['agent']; account?: string }
  | { type: 'models'; models: ModelOption[] }
  | { type: 'started'; threadId: string; turnId: string }
  | { type: 'delta'; text: string }
  | { type: 'commentary'; text: string; itemId?: string }
  | { type: 'context'; threadId: string; usedTokens: number; windowTokens?: number }
  | { type: 'usage'; usage: Usage }
  /** Cumulative computer usage within the current parent turn; separate from planner usage. */
  | { type: 'computer-usage'; usage: Usage }
  | { type: 'model-request'; request: ModelRequest }
  | { type: 'activity'; kind: Activity['kind']; title: string; detail?: string }
  | { type: 'completed'; status: 'completed' | 'interrupted' | 'failed'; text?: string; error?: string }
;
export interface AgentAdapter {
  listSkills?(): Promise<SkillCatalog>;
  start(): Promise<void>;
  run(text: string, model: string, threadId?: string, options?: AgentRunOptions): Promise<void>;
  steer?(text: string, expectedTurnId?: string): Promise<void>;
  hasManagedWork?(): Promise<boolean>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
}

export interface AgentRunOptions {
  purpose?: 'dialog';
  serviceTier?: 'fast';
  /** Prepended only for a new session; a resumed session already holds this context. */
  freshThreadContext?: string;
}

/** Provider-neutral openHiatus tool boundary. Image data must remain image content. */
export interface DynamicFunctionTool { type: 'function'; name: string; description: string; inputSchema: unknown; deferLoading?: boolean; }
export interface DynamicToolResponse { success: boolean; contentItems: ({ type: 'inputText'; text: string } | { type: 'inputImage'; imageUrl: string; computerView?: 'overview' | 'detail' })[]; }
