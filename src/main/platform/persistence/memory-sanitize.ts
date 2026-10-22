import type { CoreProposal, MemoryContext, MemorySnapshot, MemorySummaryMetadata } from '../../../shared/memory.js';
import type { InstructionDocuments, MemoryMethod, MemoryResult } from './memory-protocol.js';

type Clean = (value: string) => string;
type Sanitize<T> = (value: T, clean: Clean) => T;

export function sanitizeInstructions(documents: InstructionDocuments, clean: Clean): InstructionDocuments {
  return documents.map(document => ({ id: document.id, version: document.version, content: clean(document.content) }));
}
function metadata(value: MemorySummaryMetadata, clean: Clean): MemorySummaryMetadata {
  // MemoryStore already treats the recorded model name as redigible provenance
  // text. Its hash, citations and input-document identities remain opaque.
  return { ...value, model: clean(value.model) };
}
function proposal(value: CoreProposal, clean: Clean): CoreProposal { return { ...value, content: clean(value.content), reason: clean(value.reason) }; }
function context(value: MemoryContext, clean: Clean): MemoryContext {
  return { text: clean(value.text), retrieval: { ...value.retrieval, query: clean(value.retrieval.query), text: clean(value.retrieval.text) } };
}
function snapshot(value: MemorySnapshot, clean: Clean): MemorySnapshot {
  return { ...value,
    documents: value.documents.map(document => ({ ...document, title: clean(document.title), content: clean(document.content),
      ...(document.summary ? { summary: metadata(document.summary, clean) } : {}),
      history: document.history.map(revision => ({ ...revision, content: clean(revision.content),
        ...(revision.summary ? { summary: metadata(revision.summary, clean) } : {}) })) })),
    proposals: value.proposals.map(row => proposal(row, clean)),
    ...(value.lastRetrieval ? { lastRetrieval: { ...value.lastRetrieval, query: clean(value.lastRetrieval.query), text: clean(value.lastRetrieval.text) } } : {}),
    ...(value.summary ? { summary: { ...value.summary, model: clean(value.summary.model),
      ...(value.summary.currentTitle === undefined ? {} : { currentTitle: clean(value.summary.currentTitle) }),
      ...(value.summary.error === undefined ? {} : { error: clean(value.summary.error) }) } } : {}),
    ...(value.runtimeInstructions ? { runtimeInstructions: value.runtimeInstructions.map(instruction => ({ ...instruction, title: clean(instruction.title), content: clean(instruction.content) })) } : {}),
  };
}

const results: { [M in MemoryMethod]: Sanitize<MemoryResult<M>> } = {
  capture: value => value,
  snapshot,
  source: (value, clean) => value === undefined ? undefined : { ...value, text: clean(value.text) },
  retrieve: context,
  rebuild: snapshot,
  edit: snapshot,
  propose: proposal,
  decide: snapshot,
  search: (value, clean) => value.map(row => ({ ...row, title: clean(row.title), excerpt: clean(row.excerpt) })),
  // Offsets/totalBytes refer to the worker's fingerprinted source view. Late
  // redaction can change display-text length; never rewrite those coordinates.
  readPeriod: (value, clean) => ({ ...value, text: clean(value.text) }),
  planSummaries: (value, clean) => value.map(row => ({ ...row, title: clean(row.title) })),
  summaryInput: (value, clean) => ({ ...value, title: clean(value.title), records: value.records.map(row => ({ ...row, text: clean(row.text) })) }),
  applySummary: snapshot,
};

/** Redact human-readable fields, preserving every machine identity and cursor. */
export function sanitizeMemoryResult<M extends MemoryMethod>(method: M, value: MemoryResult<M>, clean: Clean): MemoryResult<M> {
  return results[method](value, clean);
}
