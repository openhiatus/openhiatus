// Local, synthetic profiling in isolated storage. No existing profiles, account access, agent processes or network.
import { cpSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { build } from 'esbuild';
import { StateStore, defaultState, type SavedState } from '../src/main/storage';
import { WorkerStateStore, WorkerMemoryStore } from '../src/main/platform/persistence';
import { MemoryStore } from '../src/main/memory';
import { AppController } from '../src/main/controller';
import { decodeSnapshot } from '../src/shared/ipc';
import type { AgentAdapter, BackgroundJob, Message, Snapshot } from '../src/shared/contracts';

const directory = resolve('.test-data', `storage-baseline-${Date.now()}-${process.pid}`);
const artifact = resolve('artifacts/openhiatus-speicher-baseline.json');
mkdirSync(directory, { recursive: true });
const workerPath = join(directory, 'state-worker.cjs');
const memoryWorkerPath = join(directory, 'memory-worker.cjs');
await Promise.all([
  build({ entryPoints: ['src/main/state-worker.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node24', outfile: workerPath }),
  build({ entryPoints: ['src/main/memory-worker.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node24', outfile: memoryWorkerPath }),
]);
const fixedNow = new Date('2026-10-21T10:00:00.000Z');
const text = ('Synthetische Projektnotiz: Messung lokaler Speicherung, Verlauf und Kontext. Grüße aus dem Test. '.repeat(15)).slice(0, 1000);
const noRuntime: AgentAdapter = { start: async () => {}, run: async () => {}, stop: async () => {}, dispose: async () => {} };
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const round = (value: number) => Number(value.toFixed(3));
type Metric = Awaited<ReturnType<typeof measure>> | Awaited<ReturnType<typeof measureAcknowledgement>>;
async function measure(action: () => unknown, samples = 7) {
  const timings: number[] = [], delays: number[] = [];
  for (let sample = 0; sample < samples; sample++) {
    await new Promise<void>(done => setImmediate(done));
    const queuedAt = performance.now();
    const queued = new Promise<number>(done => setImmediate(() => done(performance.now() - queuedAt)));
    const start = performance.now();
    action();
    timings.push(performance.now() - start);
    delays.push(await queued);
  }
  return { samples, medianMs: round(median(timings)), minMs: round(Math.min(...timings)), maxMs: round(Math.max(...timings)),
    queuedImmediateMedianMs: round(median(delays)), queuedImmediateMaxMs: round(Math.max(...delays)), allMs: timings.map(round) };
}
async function measureAcknowledgement(action: () => Promise<void>, samples = 3) {
  const acknowledged: number[] = [], submissions: number[] = [], delays: number[] = [];
  for (let sample = 0; sample < samples; sample++) {
    await new Promise<void>(done => setImmediate(done));
    const start = performance.now();
    const queued = new Promise<number>(done => setImmediate(() => done(performance.now() - start)));
    const write = action(); submissions.push(performance.now() - start);
    await write; acknowledged.push(performance.now() - start); delays.push(await queued);
  }
  return { samples, acknowledgedMedianMs: round(median(acknowledged)), submissionMedianMs: round(median(submissions)),
    queuedImmediateMedianMs: round(median(delays)), acknowledgedAllMs: acknowledged.map(round) };
}
function messages(count: number): Message[] {
  return Array.from({ length: count }, (_, index) => ({ id: `synthetic-message-${index}`, role: index % 2 ? 'assistant' : 'user', text,
    at: new Date(Date.UTC(2026, 5, 1 + Math.floor(index / 10), 10, index % 10)).toISOString(), ...(index % 2 ? { source: 'agent' as const } : {}) }));
}
function jobs(): BackgroundJob[] {
  return Array.from({ length: 5 }, (_, index) => ({ id: `synthetic-job-${index}`, requestId: `synthetic-job-request-${index}`,
    title: `Synthetischer Auftrag ${index}`, prompt: text, status: 'completed', createdAt: fixedNow.toISOString(), updatedAt: fixedNow.toISOString(),
    model: 'synthetic/model', resources: ['synthetic-resource'], result: text, identityInstructions: text,
    usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 } }));
}
const report: { source: string; node: string; platform: string; date: string; notes: string[]; cases: unknown[] } = {
  source: 'current working tree', node: process.version, platform: `${process.platform}/${process.arch}`, date: new Date().toISOString(),
  notes: ['Synthetic public store methods and real controller handlers; no Electron IPC, renderer, network, or agent processes.',
    'Warm local OS cache; disk operations include production fsync and backup behavior. 3 samples for disk operations, 7 for CPU paths.',
    'Controller state and memory use real worker adapters. Synchronous stores remain references; acknowledgement and main-thread delivery are measured separately.',
    'Memory worker opens a separate copy of the synthetic archive after synchronous measurements; only its acknowledged small identity/core projection remains in main.',
    'Activity write counts are collected after 50 ms for checkpoint coalescing and a worker flush, outside measured event delivery.',
    'No explicit JIT warmup or OS/background-work isolation. Three disk samples do not estimate p95 or explain storage/GC/antivirus outliers.',
    '1000 characters per message, 10 messages/day; 5 completed jobs; no AI summary lineage; results are local wall times, not general SLOs.',
    'The changed-capture samples append three sources in total; later memory measurements include these sources. Controller history retains its initial 100/1000 messages.',
    'A queued setImmediate measures event-loop blockage by each synchronous operation; no memory/RSS attribution is attempted.',
    'Controller disposal runs in finally after observations and is excluded from all measurements.'], cases: [],
};
for (const count of [100, 1000]) {
  const caseDirectory = join(directory, String(count));
  const stateStore = new StateStore(join(caseDirectory, 'state'));
  const state: SavedState = { ...defaultState(), messages: messages(count), jobs: jobs(),
    task: { id: 'synthetic-task', status: 'completed', threadId: 'synthetic-thread' },
    activity: Array.from({ length: 100 }, (_, index) => ({ id: `synthetic-activity-${index}`, at: fixedNow.toISOString(), kind: 'system', title: `Synthetisches Ereignis ${index}` })) };
  state.preferences.memoryAutoSummarize = false;
  stateStore.save(state);
  const metrics: Record<string, Metric> = {};
  metrics.stateLoad = await measure(() => stateStore.load());
  metrics.stateJsonOnly = await measure(() => JSON.stringify({ version: 1, state }, null, 2));
  metrics.stateSaveExisting = await measure(() => stateStore.save(state), 3);
  const snapshot: Snapshot = { ...state, connections: { agent: 'ready', account: '', speech: 'missing' }, models: [], workspace: 'synthetic-workspace', version: 'synthetic' };
  metrics.controllerProjectionOnly = await measure(() => decodeSnapshot(structuredClone(snapshot)));

  const memory = new MemoryStore(join(caseDirectory, 'memory'), { now: () => fixedNow });
  memory.capture(state.messages, 'synthetic-conversation');
  metrics.memorySnapshot = await measure(() => memory.snapshot());
  metrics.memoryInstructionDocuments = await measure(() => memory.instructionDocuments());
  metrics.memoryCaptureUnchanged = await measure(() => memory.capture(state.messages, 'synthetic-conversation'));
  metrics.memorySearch = await measure(() => memory.search('Projektnotiz Speicherung'));
  let appended = count;
  metrics.memoryCaptureOneNew = await measure(() => {
    state.messages.push({ id: `synthetic-message-${appended++}`, role: 'user', text, at: fixedNow.toISOString() });
    memory.capture(state.messages, 'synthetic-conversation');
  }, 3);
  metrics.memoryRetrieve = await measure(() => memory.retrieve('Projektnotiz Speicherung', { maxBytes: 2400 }), 3);

  let saves = 0, publications = 0;
  const writer = new WorkerStateStore(join(caseDirectory, 'async-state'), { workerPath });
  const asyncMemoryDirectory = join(caseDirectory, 'async-memory');
  cpSync(join(caseDirectory, 'memory'), asyncMemoryDirectory, { recursive: true });
  const memoryWorker = new WorkerMemoryStore(asyncMemoryDirectory, { workerPath: memoryWorkerPath });
  const asyncBaselineState = stateStore.load();
  await writer.commit(asyncBaselineState);
  await memoryWorker.initialize();
  metrics.workerCommit = await measureAcknowledgement(() => writer.commit(asyncBaselineState));
  metrics.memoryWorkerRetrieve = await measureAcknowledgement(() => memoryWorker.retrieve('Projektnotiz Speicherung', { maxBytes: 2400 }).then(() => {}));
  metrics.memoryWorkerCaptureUnchanged = await measureAcknowledgement(() => memoryWorker.capture(state.messages, 'synthetic-conversation'));
  metrics.memoryWorkerInstructionDocuments = await measure(() => memoryWorker.instructionDocuments());
  const controller = new AppController({
    store: { load: () => stateStore.load(), save: value => { saves++; return writer.commit(value); } },
    credentials: { get: () => undefined, set: () => {}, remove: () => {} },
    speech: { transcribe: async () => '', synthesize: async () => ({ base64: '', mimeType: 'audio/mpeg' }), test: async () => ({ base64: '', mimeType: 'audio/mpeg' }) },
    agent: noRuntime, memory: memoryWorker, workspace: 'synthetic-workspace', publish: value => { decodeSnapshot(value); publications++; },
  });
  try {
    await controller.initialize();
    saves = 0; publications = 0;
    metrics.controllerContextEvent = await measure(() => controller.handle({ type: 'context', threadId: 'synthetic-thread', usedTokens: 2000, windowTokens: 128000 }));
    const contextCounts = { saves, publications };
    saves = 0; publications = 0;
    let activityNumber = 0;
    metrics.controllerActivityEvent = await measure(() => controller.handle({ type: 'activity', kind: 'system', title: `Synthetic event ${activityNumber++}` }), 3);
    await new Promise<void>(done => setTimeout(done, 50)); await writer.flush();
    const activityCounts = { saves, publications };
    const memorySnapshot = memory.snapshot();
    report.cases.push({ initialMessages: count, messageCharacters: 1000, jobs: 5, memoryDocuments: memorySnapshot.documents.length,
      stateBytes: statSync(join(caseDirectory, 'state/state.json')).size, memoryBytes: statSync(join(caseDirectory, 'memory/memory.json')).size,
      contextCounts, activityCounts, metrics });
  } finally {
    try { await controller.dispose(); } finally { await Promise.all([writer.dispose(), memoryWorker.dispose()]); }
  }
}
mkdirSync(resolve('artifacts'), { recursive: true });
writeFileSync(artifact, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
