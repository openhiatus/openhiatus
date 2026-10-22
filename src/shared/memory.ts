import type { Message } from './contracts';

export type MemoryKind = 'identity' | 'core' | 'day' | 'week' | 'month';
export type MemoryRevisionReason = 'created' | 'capture' | 'rebuild' | 'user-edit' | 'approved-proposal' | 'ai-summary';
export interface MemorySummaryMetadata {
  method: 'ai';
  model: string;
  generatedAt: string;
  inputHash: string;
  inputDocuments: Array<{ id: string; version: number }>;
  citations: string[];
  stale: boolean;
}
export interface MemoryRevision {
  version: number;
  content: string;
  updatedAt: string;
  sourceIds: string[];
  reason: MemoryRevisionReason;
  summary?: MemorySummaryMetadata;
}
export interface MemoryDocument {
  id: string;
  kind: MemoryKind;
  title: string;
  content: string;
  version: number;
  updatedAt: string;
  sourceIds: string[];
  history: MemoryRevision[];
  /** User corrections survive automatic and manual regeneration. */
  edited: boolean;
  /** Absent on the backwards-compatible local interim excerpts. */
  summary?: MemorySummaryMetadata;
}
export interface MemorySummaryRecord {
  id: string;
  text: string;
  kind: 'source' | 'report';
  sourceIds: string[];
  at?: string;
  role?: Message['role'];
  version?: number;
  edited?: boolean;
}
export interface MemorySummaryInput {
  documentId: string;
  kind: 'day' | 'week' | 'month';
  title: string;
  baseVersion: number;
  inputHash: string;
  sourceIds: string[];
  inputDocuments: Array<{ id: string; version: number }>;
  records: MemorySummaryRecord[];
}
export interface MemorySummaryPlanJob {
  documentId: string;
  kind: 'day' | 'week' | 'month';
  title: string;
  blockedBy: string[];
  sourceCount: number;
}
export interface MemorySummaryResult { content: string; model: string; citations?: string[]; }
export interface SummaryJobState {
  status: 'idle' | 'running' | 'stopping' | 'completed' | 'interrupted' | 'failed';
  mode: 'auto' | 'manual';
  model: string;
  calls: number;
  maxCalls: number;
  completed: number;
  total: number;
  remaining: number;
  currentDocumentId?: string;
  currentTitle?: string;
  error?: string;
  startedAt?: string;
}
export interface MemoryPeriodRequest { documentId?: string; date?: string; cursor?: string; maxBytes?: number; }
export interface MemoryPeriodPage {
  found: boolean;
  documentId: string;
  version?: number;
  text: string;
  sourceIds: string[];
  sourceCount: number;
  offset: number;
  totalBytes: number;
  nextCursor?: string;
}
export interface MemorySource extends Message { conversationId: string; }
export interface CoreProposal {
  id: string;
  documentId: 'identity' | 'core';
  baseVersion: number;
  content: string;
  reason: string;
  sourceIds: string[];
  status: 'pending' | 'approved' | 'rejected' | 'stale';
  createdAt: string;
  decidedAt?: string;
}
export interface CoreProposalInput {
  documentId: 'identity' | 'core';
  baseVersion: number;
  content: string;
  reason: string;
  sourceIds?: string[];
}
export interface MemoryRetrieval {
  query: string;
  at: string;
  documentIds: string[];
  sourceIds: string[];
  /** Exact text supplied to the agent, after redaction. */
  text: string;
}
export interface MemorySearchResult {
  id: string;
  type: 'document' | 'source';
  title: string;
  excerpt: string;
  score: number;
}
export interface MemorySnapshot {
  documents: MemoryDocument[];
  proposals: CoreProposal[];
  lastRetrieval?: MemoryRetrieval;
  storagePath: string;
  sourceCount: number;
  recovered: boolean;
  /** Ephemeral background job, supplied by the controller rather than persisted. */
  summary?: SummaryJobState;
  /** Effective fixed runtime instructions, supplied by the controller, not the memory store. */
  runtimeInstructions?: Array<{ id: string; title: string; content: string; appliesTo?: string }>;
}
export interface MemoryContext { text: string; retrieval: MemoryRetrieval; }
