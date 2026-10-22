import type { MemoryPeriodPage, MemorySearchResult, MemorySnapshot, MemorySource } from '../memory';
import { array, boolean, choice, integer, number, object, optional, text, type Decoder } from './decode';
import { messageFields, summary } from './snapshot';

const id = text(1024), at = text(100), body = text(20000), references = array(id, 50000);
const metadata = object({ method: choice(['ai']), model: text(4096), generatedAt: at, inputHash: id,
  inputDocuments: array(object({ id, version: integer }), 15000), citations: references, stale: boolean });
export const decodeMemorySnapshot: Decoder<MemorySnapshot> = object({
  documents: array(object({ id, kind: choice(['identity', 'core', 'day', 'week', 'month']), title: text(512), content: body, version: integer, updatedAt: at,
    sourceIds: references, edited: boolean, summary: optional(metadata), history: array(object({ version: integer, content: body, updatedAt: at, sourceIds: references,
      reason: choice(['created', 'capture', 'rebuild', 'user-edit', 'approved-proposal', 'ai-summary']), summary: optional(metadata) }), 10000) }), 15000),
  proposals: array(object({ id, documentId: choice(['identity', 'core']), baseVersion: integer, content: body, reason: body, sourceIds: references,
    status: choice(['pending', 'approved', 'rejected', 'stale']), createdAt: at, decidedAt: optional(at) }), 50000),
  lastRetrieval: optional(object({ query: body, at, documentIds: array(id, 15000), sourceIds: references, text: text(24000) })),
  storagePath: text(4096), sourceCount: integer, recovered: boolean, summary: optional(summary),
  runtimeInstructions: optional(array(object({ id, title: text(), content: text(), appliesTo: optional(text()) }), 1000)),
});
export const decodeMemorySource: Decoder<MemorySource | undefined> = optional(object({ ...messageFields, conversationId: id }));
export const decodeMemorySearch: Decoder<MemorySearchResult[]> = array(object({ id, type: choice(['document', 'source']), title: body, excerpt: body, score: number }));
export const decodeMemoryPeriod: Decoder<MemoryPeriodPage> = object({ found: boolean, documentId: id, version: optional(integer), text: text(20000), sourceIds: references,
  sourceCount: integer, offset: integer, totalBytes: integer, nextCursor: optional(text(2000)) });
