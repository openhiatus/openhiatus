import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryReportCoordinator, type MemoryReportPorts, type MemoryReportSettings, type MemoryReportTiming, type SummaryCallEvidence } from '../src/main/modules/memory-reports';
import type { MemorySnapshot, MemorySummaryInput, MemorySummaryResult, SummaryJobState } from '../src/shared/memory';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
async function until(check: () => boolean) { for (let i = 0; i < 100 && !check(); i++) await tick(); assert.ok(check()); }
function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>(done => { resolve = done; });
  return { promise, resolve };
}
function fixture(initial: Partial<MemoryReportSettings> = {}) {
  const settings: MemoryReportSettings = { memoryModel: 'api/memory', workModel: 'api/work', automatic: true, chatgptBackgroundUsage: false, ...initial };
  let now = new Date('2026-10-21T10:00:00Z'), blocked = false, pending = true, revision = 1, captures = 0;
  const timers: Array<{ fire(): void; cancelled: boolean; delay: number }> = [];
  const calls: Array<{ prompt: string; model: string; signal: AbortSignal; evidence: SummaryCallEvidence }> = [];
  const results: MemorySummaryResult[] = [], publications: SummaryJobState[] = [], events: Array<{ kind: string; title: string; detail?: string }> = [], errors: unknown[] = [];
  let complete = async (_prompt: string, _signal: AbortSignal): Promise<string> => JSON.stringify({ items: [{ category: 'open', text: 'Die Planung blieb offen.', sourceIds: ['original-source'] }] });
  const input = (): MemorySummaryInput => ({ documentId: 'day:2026-10-01', kind: 'day', title: 'Tag 2026-10-01', baseVersion: revision, inputHash: `revision-${revision}`, inputDocuments: [],
    sourceIds: ['original-source'], records: [{ id: 'original-source', kind: 'source', sourceIds: ['original-source'], role: 'user', at: '2026-10-01T10:00:00Z', text: 'Bitte erstelle einen Plan.' }] });
  const timing: MemoryReportTiming = {
    now: () => now,
    schedule(callback, delay) { const timer = { fire: callback, cancelled: false, delay }; timers.push(timer); return { cancel() { timer.cancelled = true; } }; },
  };
  const ports: MemoryReportPorts = {
    memory: {
      planSummaries: () => pending ? [{ documentId: 'day:2026-10-01', kind: 'day', title: 'Tag 2026-10-01', sourceCount: 1, blockedBy: [] }] : [],
      summaryInput: () => input(),
      applySummary(_input, result) { results.push(result); pending = false; return {} as MemorySnapshot; },
    },
    modelClient: { async complete(prompt, model, signal, evidence) { assert.ok(captures > 0); calls.push({ prompt, model, signal, evidence }); return complete(prompt, signal); } },
    settings: () => settings,
    availability: { assertIdle() { if (blocked) throw new Error('Arbeit läuft.'); }, blocked: () => blocked },
    capture() { captures++; },
    projection: { publish(state) { publications.push(state); }, changed() {} },
    effects: { clean: text => text.replaceAll('synthetic-secret', '[entfernt]'), activity: (kind, title, detail) => { events.push({ kind, title, detail }); }, reportError: error => { errors.push(error); } },
  };
  const reports = new MemoryReportCoordinator(ports, timing);
  return { reports, ports, settings, timers, calls, results, publications, events, errors,
    setComplete: (next: typeof complete) => { complete = next; }, time: (date: string) => { now = new Date(date); },
    block: (value: boolean) => { blocked = value; }, reopen: () => { pending = true; revision++; }, noPending: () => { pending = false; }, captures: () => captures };
}

test('memory reports freeze the selected direct model, own their projection and retain evidence across the public boundary', async () => {
  const f = fixture({ memoryModel: '', workModel: 'api/fallback' });
  let release!: (text: string) => void;
  f.setComplete(async () => new Promise<string>(resolve => { release = resolve; }));
  await f.reports.start(); await until(() => f.calls.length === 1);
  f.settings.workModel = 'api/later';
  assert.equal(f.reports.busy(), true);
  assert.equal(f.calls[0].model, 'api/fallback');
  assert.deepEqual(f.calls[0].evidence.sourceIds, ['original-source']);
  f.publications.at(-1)!.model = 'mutated-projection';
  assert.equal(f.reports.snapshot().model, 'api/fallback');
  release(JSON.stringify({ items: [{ category: 'open', text: 'Die Planung blieb offen.', sourceIds: ['original-source'] }] }));
  await until(() => f.reports.snapshot().status === 'completed');
  assert.equal(f.reports.busy(), false); assert.equal(f.results[0].model, 'api/fallback');
  assert.deepEqual(f.results[0].citations, ['original-source']);
  assert.equal(f.captures(), 1);
});

test('manual reports block foreground preemption while automatic reports abort uncooperative model calls without late commits', async () => {
  for (const mode of ['manual', 'auto'] as const) {
    const f = fixture(); let release!: (text: string) => void;
    f.setComplete(async () => new Promise<string>(resolve => { release = resolve; }));
    await f.reports.start(mode); await until(() => f.calls.length === 1);
    if (mode === 'manual') {
      await assert.rejects(f.reports.prepareForUserWork(), /abwarten oder Stopp/);
      assert.equal(f.calls[0].signal.aborted, false);
      const first = f.reports.stop(); assert.equal(f.reports.stop(), first); await first;
    } else await f.reports.prepareForUserWork();
    assert.equal(f.calls[0].signal.aborted, true);
    assert.equal(f.reports.snapshot().status, 'interrupted');
    assert.ok(f.publications.some(state => state.status === 'stopping'));
    release('{"items":[]}'); await tick();
    assert.equal(f.results.length, 0); assert.equal(f.calls.length, 1); assert.equal(f.reports.busy(), false);
  }
});

test('automatic scheduling rechecks work and available periods before spending the Berlin day allowance', async () => {
  const f = fixture();
  f.reports.queueAutomatic(); f.reports.queueAutomatic();
  assert.equal(f.timers.length, 1); assert.equal(f.timers[0].delay, 5000);
  f.block(true); f.timers[0].fire(); await tick();
  assert.equal(f.calls.length, 0);
  f.block(false); f.noPending(); f.reports.queueAutomatic(); f.timers[1].fire(); await tick();
  assert.equal(f.calls.length, 0);
  f.reopen(); f.reports.queueAutomatic(); f.timers[2].fire();
  await until(() => f.reports.snapshot().status === 'completed');
  assert.equal(f.calls.length, 1); assert.equal(f.reports.snapshot().mode, 'auto');
  f.reopen(); f.reports.queueAutomatic(); assert.equal(f.timers.length, 3);
  f.time('2026-10-21T22:01:00Z'); f.reports.queueAutomatic();
  assert.equal(f.timers.length, 4, 'a new Berlin day begins before midnight UTC');
  f.timers[3].fire(); await until(() => f.results.length === 2);
  await f.reports.dispose();
});

test('a timer crossing Berlin midnight charges its execution day and global Stop invalidates cancelled callbacks', async () => {
  const f = fixture(); f.time('2026-10-21T21:59:59Z'); f.reports.queueAutomatic();
  f.time('2026-10-21T22:00:01Z'); f.timers[0].fire();
  await until(() => f.reports.snapshot().status === 'completed');
  f.reopen(); f.reports.queueAutomatic(); assert.equal(f.timers.length, 1);
  f.time('2026-10-22T22:00:01Z'); f.reports.queueAutomatic(); assert.equal(f.timers.length, 2);
  f.reports.suppressAutomaticForToday(); assert.equal(f.timers[1].cancelled, true);
  f.timers[1].fire(); await tick(); assert.equal(f.calls.length, 1);
  f.reports.queueAutomatic(); assert.equal(f.timers.length, 2);
  f.time('2026-10-23T22:00:01Z'); f.reports.queueAutomatic(); assert.equal(f.timers.length, 3);
  await f.reports.dispose();
});

test('ChatGPT consent is checked at timer execution and revocation cancels the bound automatic model despite later selection changes', async () => {
  const f = fixture(); f.reports.queueAutomatic();
  f.settings.memoryModel = 'chatgpt/memory'; f.timers[0].fire(); await tick();
  assert.equal(f.calls.length, 0);
  await assert.rejects(f.reports.start('auto'), /ausdrückliche Freigabe/);
  f.settings.chatgptBackgroundUsage = true;
  f.setComplete(async () => new Promise<string>(() => {}));
  await f.reports.preferencesChanged({ chatgptBackgroundUsage: true });
  assert.equal(f.timers.length, 2); f.timers[1].fire(); await until(() => f.calls.length === 1);
  f.settings.memoryModel = 'api/later-selection'; f.settings.chatgptBackgroundUsage = false;
  await f.reports.preferencesChanged({ chatgptBackgroundUsage: false });
  assert.equal(f.calls[0].model, 'chatgpt/memory'); assert.equal(f.calls[0].signal.aborted, true);
  assert.equal(f.reports.snapshot().status, 'interrupted');
});

test('preference changes cancel queued timers while preserving explicit reports and automatic API reports', async () => {
  const queued = fixture(); queued.reports.queueAutomatic(); queued.settings.automatic = false;
  await queued.reports.preferencesChanged({ automatic: false });
  assert.equal(queued.timers[0].cancelled, true); queued.timers[0].fire(); await tick();
  assert.equal(queued.calls.length, 0);
  for (const [mode, model] of [['manual', 'chatgpt/memory'], ['auto', 'api/memory']] as const) {
    const f = fixture({ memoryModel: model, chatgptBackgroundUsage: true });
    f.setComplete(async () => new Promise<string>(() => {}));
    await f.reports.start(mode); await until(() => f.calls.length === 1);
    f.settings.automatic = false; f.settings.chatgptBackgroundUsage = false;
    await f.reports.preferencesChanged({ automatic: false, chatgptBackgroundUsage: false });
    assert.equal(f.calls[0].signal.aborted, false); assert.equal(f.reports.snapshot().status, 'running');
    await f.reports.dispose();
  }
});

test('planning failures consume one daily attempt and rejected archival admission leaves no active report', async () => {
  const f = fixture(); f.ports.memory!.planSummaries = () => { throw new Error('Archiv nicht lesbar'); };
  f.reports.queueAutomatic(); f.timers[0].fire();
  await until(() => f.errors.length === 1);
  assert.equal(f.errors.length, 1); assert.equal(f.calls.length, 0);
  f.reports.queueAutomatic(); assert.equal(f.timers.length, 1);
  f.time('2026-10-22T10:00:00Z'); f.reports.queueAutomatic(); assert.equal(f.timers.length, 2);
  await f.reports.dispose();
  const archival = fixture(); archival.ports.capture = () => { throw new Error('Archiv voll'); };
  await assert.rejects(archival.reports.start(), /Archiv voll/);
  assert.equal(archival.reports.busy(), false); assert.equal(archival.reports.snapshot().status, 'idle'); assert.equal(archival.calls.length, 0);
});

test('model errors are sanitized and shutdown cancels queued work before any future callback can restart it', async () => {
  const f = fixture(); f.setComplete(async () => { throw new Error('Failure synthetic-secret'); });
  await f.reports.start(); await until(() => f.reports.snapshot().status === 'failed');
  assert.equal(f.reports.snapshot().error, 'Failure [entfernt]');
  assert.ok(!JSON.stringify(f.events).includes('synthetic-secret'));
  f.reports.queueAutomatic(); assert.equal(f.timers.length, 1);
  await f.reports.dispose(); assert.equal(f.timers[0].cancelled, true);
  f.timers[0].fire(); f.reports.queueAutomatic(); await tick();
  assert.equal(f.calls.length, 1); assert.equal(f.timers.length, 1);
  await assert.rejects(f.reports.start(), /beendet/);
});

test('capture reserves admission before awaiting memory; Stop settles immediately while disposal drains the old capture', async () => {
  const f = fixture(), capture = deferred<void>(); let captures = 0;
  f.ports.capture = () => { captures++; return capture.promise; };
  const starting = f.reports.start(), rejected = assert.rejects(starting, /gestoppt/);
  await until(() => captures === 1);
  assert.equal(f.reports.busy(), true);
  await assert.rejects(f.reports.start(), /laufenden KI/);
  await f.reports.stop(); await rejected;
  assert.equal(f.reports.busy(), false); assert.equal(f.reports.snapshot().status, 'interrupted');
  let disposed = false;
  const disposal = f.reports.dispose().then(() => { disposed = true; });
  await tick(); assert.equal(disposed, false); assert.equal(f.calls.length, 0);
  capture.resolve(); await disposal;
  assert.equal(f.calls.length, 0); assert.equal(f.results.length, 0);
});

test('automatic planning follows capture, owns its gate and cannot spend after Stop', async () => {
  const f = fixture(), plan = deferred<Awaited<ReturnType<NonNullable<typeof f.ports.memory>['planSummaries']>>>();
  let plans = 0;
  f.ports.memory!.planSummaries = () => { assert.equal(f.captures(), 1); plans++; return plan.promise; };
  f.reports.queueAutomatic(); f.timers[0].fire(); await until(() => plans === 1);
  assert.equal(f.reports.busy(), true); await assert.rejects(f.reports.start(), /laufenden KI/);
  f.reports.suppressAutomaticForToday(); await f.reports.stop();
  plan.resolve([{ documentId: 'day:2026-10-01', kind: 'day', title: 'Tag', sourceCount: 1, blockedBy: [] }]);
  await f.reports.dispose();
  assert.equal(f.captures(), 1); assert.equal(f.calls.length, 0); assert.deepEqual(f.errors, []);
});

test('a stopped input request cannot publish into a later report lease or start a late model call', async () => {
  const f = fixture(), input = deferred<MemorySummaryInput>(), original = f.ports.memory!.summaryInput;
  let reads = 0;
  f.ports.memory!.summaryInput = () => { reads++; return input.promise; };
  await f.reports.start(); await until(() => reads === 1); await f.reports.stop();
  f.ports.memory!.summaryInput = original; f.settings.memoryModel = 'api/new-lease';
  await f.reports.start(); await until(() => f.reports.snapshot().status === 'completed');
  const completed = f.reports.snapshot();
  input.resolve(await original('day:2026-10-01')); await f.reports.dispose();
  assert.deepEqual(f.reports.snapshot(), completed); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].model, 'api/new-lease');
});

test('an already submitted apply may ACK after Stop without completion publication or another input/model submission', async () => {
  const f = fixture(), apply = deferred<MemorySnapshot>(); let writes = 0, reads = 0;
  const original = f.ports.memory!.summaryInput;
  f.ports.memory!.planSummaries = () => [0, 1].map(index => ({ documentId: `day:2026-10-0${index + 1}`, kind: 'day' as const, title: 'Tag', sourceCount: 1, blockedBy: [] }));
  f.ports.memory!.summaryInput = id => { reads++; return original(id); };
  f.ports.memory!.applySummary = () => { writes++; return apply.promise; };
  await f.reports.start(); await until(() => writes === 1); await f.reports.stop();
  const stopped = f.reports.snapshot(); apply.resolve({} as MemorySnapshot); await f.reports.dispose();
  assert.equal(reads, 1); assert.equal(writes, 1); assert.equal(f.calls.length, 1); assert.deepEqual(f.reports.snapshot(), stopped);
});

test('abort listener reentrancy shares the reserved Stop promise', async () => {
  const f = fixture(); let nested: Promise<void> | undefined;
  f.setComplete(async (_prompt, signal) => {
    signal.addEventListener('abort', () => { nested = f.reports.stop(); }, { once: true });
    return new Promise<string>(() => {});
  });
  await f.reports.start(); await until(() => f.calls.length === 1);
  const stopping = f.reports.stop(); assert.equal(nested, stopping); await stopping; await f.reports.dispose();
});

test('ChatGPT consent revocation stops the model bound before a delayed capture even after selection changes', async () => {
  const f = fixture({ memoryModel: 'chatgpt/preparing', chatgptBackgroundUsage: true }), capture = deferred<void>(); let captures = 0;
  f.ports.capture = () => { captures++; return capture.promise; };
  const starting = f.reports.start('auto'), rejected = assert.rejects(starting, /gestoppt/);
  await until(() => captures === 1);
  f.settings.memoryModel = 'api/later-selection'; f.settings.chatgptBackgroundUsage = false;
  await f.reports.preferencesChanged({ chatgptBackgroundUsage: false }); await rejected;
  capture.resolve(); await f.reports.dispose();
  assert.equal(f.calls.length, 0); assert.equal(f.reports.snapshot().status, 'interrupted');
});
