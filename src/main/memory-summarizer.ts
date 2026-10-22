/** Compatibility entry point; memory report implementation belongs to its feature module. */
export { MemorySummarizer, parseSummaryOutput, summaryChunks } from './modules/memory-reports';
export type { SummaryBackend, SummaryCallEvidence, SummaryItem, SummaryProgress } from './modules/memory-reports';
