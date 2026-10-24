import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import type { AgentAdapter, AgentEvent, AgentRunOptions, DynamicToolResponse, Usage } from '../src/shared/contracts';
import { ComputerDriverError, type ComputerAdapter, type ComputerResult } from '../src/main/computer';
import { createToolRegistry, type BoundToolset, type ToolsetPort } from '../src/main/modules/tools';
import { COMPUTER_DELEGATION_INSTRUCTIONS, createDelegatedComputerToolContribution, type DelegatedComputerOptions } from '../src/main/platform/tools/computer-delegation';

function deferred<Value>() { let resolve!: (value: Value) => void; const promise = new Promise<Value>(done => { resolve = done; }); return { promise, resolve }; }
const frame = (id = 'frame'): ComputerResult => ({ text: 'Synthetic visible state', frameId: id, width: 100, height: 80,
  image: { base64: 'synthetic', mimeType: 'image/png' } });
const usage = (inputTokens: number): Usage => ({ inputTokens, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 0 });
const report = (response: DynamicToolResponse): { status: string; result: string; verified: boolean; model: string; requestedServiceTier?: string; threadId: string; actionCount: number; elapsedMs: number } => {
  assert.equal(response.contentItems.length, 1); assert.equal(response.contentItems[0].type, 'inputText');
  return JSON.parse((response.contentItems[0] as { text: string }).text);
};
type Script = (tools: BoundToolset, emit: (event: AgentEvent) => void) => Promise<string>;
interface WorkerCapture { tools: ToolsetPort; instructions: string; model?: string; options?: AgentRunOptions; thread?: string; prompt?: string; stopped: number; disposed: number; emit: (event: AgentEvent) => void; }
function workerFactory(scripts: Script[], captures: WorkerCapture[]): DelegatedComputerOptions['createWorker'] {
  return (emit, tools, instructions) => {
    const script = scripts.shift(); assert.ok(script, 'a synthetic script must be provided for each subtask');
    const captured: WorkerCapture = { emit, tools, instructions, stopped: 0, disposed: 0 }; captures.push(captured);
    const abort = new AbortController(); let stopped = false;
    const worker: AgentAdapter = {
      start: async () => { emit({ type: 'models', models: [] }); emit({ type: 'connection', status: 'ready' }); },
      async run(prompt, model, thread, options) {
        captured.prompt = prompt; captured.model = model; captured.thread = thread; captured.options = options;
        const binding = tools.bind({ role: 'worker', runId: 'synthetic-child', signal: abort.signal, emit });
        emit({ type: 'started', threadId: `child-${captures.length}`, turnId: 'child-turn' });
        void script(binding, emit).then(async text => {
          if (stopped) return; await binding.stop(); if (!stopped) emit({ type: 'completed', status: 'completed', text });
        }).catch(error => { if (!stopped) emit({ type: 'completed', status: 'failed', error: String(error) }); });
      },
      async stop() { stopped = true; captured.stopped++; abort.abort(); await tools.stop(); },
      async dispose() { captured.disposed++; await worker.stop(); await tools.dispose(); },
    };
    return worker;
  };
}
function setup(scripts: Script[], extra: Partial<DelegatedComputerOptions> = {}) {
  const inputs: unknown[] = [], events: AgentEvent[] = [], captures: WorkerCapture[] = []; let stops = 0, disposes = 0;
  const computer: ComputerAdapter = { execute: async input => { inputs.push(input); return frame(`frame-${inputs.length}`); },
    stop: async () => { stops++; }, dispose: async () => { disposes++; } };
  const contribution = createDelegatedComputerToolContribution({ model: 'chatgpt/gpt-6-luna', createWorker: workerFactory(scripts, captures), computer, ...extra });
  const registry = createToolRegistry([contribution]), abort = new AbortController();
  const bind = () => registry.bind({ role: 'worker', runId: 'parent', signal: abort.signal, emit: event => events.push(event) });
  return { registry, bind, abort, inputs, events, captures, get stops() { return stops; }, get disposes() { return disposes; } };
}

test('delegation is lazy, worker-only and validates tasks and parent observation authority before any desktop operation', async () => {
  const fixture = setup([]);
  const dialog = fixture.registry.bind({ role: 'dialog', runId: 'dialog', signal: new AbortController().signal, emit: () => {} });
  assert.deepEqual(dialog.definitions, []); await dialog.stop();
  const parent = fixture.bind(); assert.deepEqual(parent.definitions.map(tool => tool.name), ['computer_task', 'computer']);
  await assert.rejects(parent.call('computer_task', { objective: '', arbitrary: true }));
  await assert.rejects(parent.call('computer_task', { objective: 'Read visible status', context: 'x'.repeat(48001) }));
  await assert.rejects(parent.call('computer', { action: 'click', frameId: 'guessed', x: 1, y: 2 }), /Use computer_task/);
  assert.equal(fixture.captures.length, 0); assert.equal(fixture.inputs.length, 0);
  const picture = await parent.call('computer', { action: 'screenshot', resolution: 'original' });
  assert.equal(picture.contentItems.filter(item => item.type === 'inputImage').length, 1);
  await parent.call('computer', { action: 'inspect', frameId: 'frame-1', viewId: 'overview', x: 1, y: 2, width: 3, height: 4 });
  await fixture.registry.dispose(); assert.equal(fixture.disposes, 1);
});

test('a fresh Luna Fast child performs several observed inputs with only computer tools and returns an unverified text report', async () => {
  const fixture = setup([async (tools, emit) => {
    assert.deepEqual(tools.definitions.map(tool => tool.name), ['computer', 'report_computer_task']);
    await assert.rejects(tools.call('read', { path: 'private' }), /abgelehnt/);
    await assert.rejects(tools.call('computer', { action: 'click', frameId: 'guessed', x: 1, y: 2 }), /fresh screenshot/);
    const first = await tools.call('computer', { action: 'screenshot' });
    assert.equal(first.contentItems.filter(item => item.type === 'inputImage').length, 1);
    await tools.call('computer', { action: 'click', frameId: 'frame-1', viewId: 'detail-offset', x: 20, y: 30 });
    await tools.call('computer', { action: 'type', frameId: 'frame-2', text: 'Exact supplied value' });
    emit({ type: 'delta', text: 'Must remain inside child history' }); emit({ type: 'commentary', text: 'Private child commentary' });
    emit({ type: 'context', threadId: 'child', usedTokens: 100 });
    return JSON.stringify({ status: 'reported', summary: 'The supplied value is visible', observations: ['Field has the supplied text'] });
  }]);
  const parent = fixture.bind(), response = await parent.call('computer_task', { objective: 'Fill the observed field', instructions: 'Use this exact value', context: 'Exact supplied value' });
  const result = report(response); assert.equal(result.status, 'reported'); assert.equal(result.verified, false);
  assert.equal(result.model, 'chatgpt/gpt-6-luna'); assert.equal(result.requestedServiceTier, 'fast'); assert.equal(result.threadId, 'child-1'); assert.equal(result.actionCount, 3);
  assert.deepEqual(fixture.captures[0].options, { serviceTier: 'fast' }); assert.equal(fixture.captures[0].thread, undefined);
  assert.equal(fixture.captures[0].instructions, COMPUTER_DELEGATION_INSTRUCTIONS);
  assert.equal(JSON.parse(fixture.captures[0].prompt!).context, 'Exact supplied value');
  assert.equal(fixture.captures[0].disposed, 1); assert.ok(fixture.stops > 0);
  assert.deepEqual(fixture.inputs[1], { action: 'click', frameId: 'frame-1', viewId: 'detail-offset', x: 20, y: 30, button: 'left', count: 1 }, 'host keeps view-local coordinates for the shared computer mapper');
  assert.deepEqual(fixture.events.map(event => event.type), ['computer-frame', 'computer-frame', 'computer-frame']);
  assert.equal(response.contentItems.some(item => item.type === 'inputImage'), false, 'normal child screenshots do not enter the planner tool result');
  await parent.call('computer', { action: 'screenshot', resolution: 'original' });
  assert.equal(fixture.inputs.length, 4, 'planner can explicitly verify after child ownership has been released');
  await fixture.registry.dispose();
});

test('delegated actions and planner observations both use the desktop visibility guard', async () => {
  let hidden = false, guarded = 0, executed = 0;
  const fixture = setup([async tools => {
    await tools.call('computer', { action: 'screenshot' });
    await tools.call('computer', { action: 'click', frameId: 'guarded-1', x: 10, y: 20 });
    return JSON.stringify({ status: 'reported', summary: 'Synthetic input completed' });
  }], {
    runDesktopOperation: async operation => { guarded++; hidden = true; try { return await operation(); } finally { hidden = false; } },
    computer: { execute: async () => { assert.equal(hidden, true); return frame(`guarded-${++executed}`); }, stop: async () => {}, dispose: async () => {} },
  });
  const parent = fixture.bind();
  await parent.call('computer_task', { objective: 'Synthetic guarded input' });
  await parent.call('computer', { action: 'screenshot', resolution: 'original' });
  assert.equal(executed, 3); assert.equal(guarded, 3); assert.equal(hidden, false);
  await fixture.registry.dispose();
});

test('blocked and failed child reports stay distinct from verified completion and Fast can explicitly be disabled', async () => {
  const fixture = setup([async () => JSON.stringify({ status: 'blocked', summary: 'Need exact destination' }), async () => { throw new Error('Synthetic worker failure'); }], { fast: false });
  const parent = fixture.bind();
  const blocked = await parent.call('computer_task', { objective: 'Locate the destination' });
  assert.equal(blocked.success, false); assert.equal(report(blocked).status, 'blocked');
  assert.equal(fixture.captures[0].options, undefined); assert.equal(report(blocked).requestedServiceTier, undefined);
  const failed = await parent.call('computer_task', { objective: 'Locate another destination' });
  assert.equal(failed.success, false); assert.equal(report(failed).status, 'error'); assert.equal(fixture.captures.length, 2);
  await fixture.registry.dispose();
});

test('the host action budget includes observations and prevents later inputs even if the child ignores the limit', async () => {
  const attempted = deferred<void>();
  const fixture = setup([async tools => {
    await tools.call('computer', { action: 'screenshot' });
    await tools.call('computer', { action: 'key', frameId: 'frame-1', key: 'tab' });
    await assert.rejects(tools.call('computer', { action: 'key', frameId: 'frame-2', key: 'enter' }));
    await assert.rejects(tools.call('computer', { action: 'screenshot' })); attempted.resolve(); return 'Unexpected';
  }], { maxActions: 2 });
  const response = await fixture.bind().call('computer_task', { objective: 'Bounded navigation' }); await attempted.promise;
  assert.equal(report(response).status, 'limit'); assert.equal(report(response).actionCount, 2); assert.equal(response.success, false);
  assert.equal(fixture.inputs.length, 2); assert.equal(fixture.captures[0].disposed, 1);
  await fixture.registry.dispose();
});

test('the deadline stops the child and waits for an already started native input to settle before returning', async () => {
  const entered = deferred<void>(), release = deferred<void>(); let nativeSettled = false, stopped = 0, frameId = 0;
  const computer: ComputerAdapter = {
    async execute(input) {
      if ((input as { action: string }).action !== 'screenshot') { entered.resolve(); await release.promise; nativeSettled = true; }
      return frame(`native-${++frameId}`);
    }, async stop() { stopped++; if (frameId) await release.promise; }, dispose: async () => {},
  };
  const fixture = setup([async tools => { await tools.call('computer', { action: 'screenshot' }); await tools.call('computer', { action: 'key', frameId: 'native-1', key: 'tab' }); return 'Should not complete'; }],
    { computer, maxDurationMs: 30 });
  let returned = false; const call = fixture.bind().call('computer_task', { objective: 'Observe bounded navigation' }).then(value => { returned = true; return value; });
  await entered.promise; await delay(60); assert.ok(stopped > 0); assert.equal(returned, false); assert.equal(nativeSettled, false);
  release.resolve(); const response = await call;
  assert.equal(nativeSettled, true); assert.equal(report(response).status, 'limit'); assert.equal(fixture.events.filter(event => event.type === 'computer-frame').length, 1, 'late post-action image is suppressed');
  await fixture.registry.dispose();
});

test('parent Stop cancels child ownership, suppresses late events and confirms pending native input settlement', async () => {
  const entered = deferred<void>(), release = deferred<void>(); let nativeSignal: AbortSignal | undefined, delivered = false;
  const computer: ComputerAdapter = {
    async execute(input, signal) {
      if ((input as { action: string }).action !== 'screenshot') { nativeSignal = signal; entered.resolve(); await release.promise; delivered = true; }
      return frame();
    }, async stop() { if (nativeSignal) await release.promise; }, dispose: async () => {},
  };
  const fixture = setup([async tools => { await tools.call('computer', { action: 'screenshot' }); await tools.call('computer', { action: 'click', frameId: 'frame', x: 2, y: 3 }); return 'Late'; }], { computer });
  const parent = fixture.bind();
  const call = parent.call('computer_task', { objective: 'Click the observed control' }); const rejected = assert.rejects(call, /unterbrochen/);
  await entered.promise; fixture.abort.abort(); let released = false;
  const stopping = parent.stop().then(() => { released = true; }); await delay(5);
  assert.equal(nativeSignal?.aborted, true); assert.equal(released, false);
  fixture.captures[0].emit({ type: 'usage', usage: usage(999) }); fixture.captures[0].emit({ type: 'completed', status: 'completed', text: 'Late completion' });
  release.resolve(); await stopping; await rejected; assert.equal(delivered, true);
  assert.deepEqual(fixture.events.map(event => event.type), ['computer-frame']); await fixture.registry.dispose();
});

test('a deadline during delayed worker startup prevents a late model run and includes confirmed cleanup in elapsed time', async () => {
  const startup = deferred<void>(); let runs = 0, disposed = 0;
  const fixture = setup([], { maxDurationMs: 10, createWorker: () => ({ start: () => startup.promise,
    run: async () => { runs++; }, stop: async () => {}, dispose: async () => { await delay(20); disposed++; } }) });
  const response = await fixture.bind().call('computer_task', { objective: 'Inspect a control' });
  assert.equal(report(response).status, 'limit'); assert.ok(report(response).elapsedMs >= 25); assert.equal(disposed, 1);
  startup.resolve(); await delay(5); assert.equal(runs, 0); assert.equal(fixture.inputs.length, 0); await fixture.registry.dispose();
});

test('a redacted provider startup failure stays diagnosable and does not retry using a different tier', async () => {
  let runs = 0;
  const fixture = setup([], { createWorker: () => ({ start: async () => {},
    run: async () => { runs++; throw new Error('Synthetic service tier request rejected'); }, stop: async () => {}, dispose: async () => {} }) });
  const response = await fixture.bind().call('computer_task', { objective: 'Inspect a control' });
  assert.equal(report(response).status, 'error'); assert.match(report(response).result, /service tier request rejected/);
  assert.equal(runs, 1); assert.equal(fixture.inputs.length, 0); await fixture.registry.dispose();
});

test('the shared executor rejects concurrent subtasks, parent observations and concurrent child inputs', async () => {
  const entered = deferred<void>(), release = deferred<void>();
  const fixture = setup([async tools => {
    const observation = tools.call('computer', { action: 'screenshot' });
    await assert.rejects(tools.call('computer', { action: 'screenshot' }), /Parallel/);
    await observation; entered.resolve(); await release.promise; return '{"status":"reported","summary":"Observed the control"}';
  }]);
  const parent = fixture.bind(), call = parent.call('computer_task', { objective: 'Observe one control' }); await entered.promise;
  await assert.rejects(parent.call('computer_task', { objective: 'Competing task' }), /Another computer operation/);
  await assert.rejects(parent.call('computer', { action: 'screenshot' }), /Another computer operation/);
  release.resolve(); assert.equal(report(await call).status, 'reported'); assert.equal(fixture.inputs.length, 1); await fixture.registry.dispose();
});

test('failed child release remains visible and blocks reuse until Stop retries the same cleanup', async () => {
  const captures: WorkerCapture[] = []; const normalFactory = workerFactory([async () => '{"status":"reported","summary":"Observed the control"}', async () => '{"status":"reported","summary":"Observed the next control"}'], captures);
  let fail = true, attempts = 0;
  const fixture = setup([], { createWorker: (emit, tools, instructions) => {
    const worker = normalFactory(emit, tools, instructions), dispose = worker.dispose.bind(worker);
    worker.dispose = async () => { attempts++; if (fail) throw new Error('Synthetic unconfirmed process release'); await dispose(); }; return worker;
  } });
  const parent = fixture.bind(); await assert.rejects(parent.call('computer_task', { objective: 'Observe one control' }), /release is unconfirmed/);
  assert.equal(attempts, 1, 'failed cleanup is retained for explicit Stop retry');
  await assert.rejects(parent.call('computer_task', { objective: 'Do not start while release is unknown' }), /unconfirmed release/);
  await assert.rejects(parent.stop(), /release is unconfirmed/);
  fail = false; await parent.stop(); assert.equal(attempts, 3);
  const next = fixture.bind(); assert.equal(report(await next.call('computer_task', { objective: 'Fresh task after confirmed cleanup' })).status, 'reported');
  await fixture.registry.dispose();
});

test('child cumulative usage accumulates across subtasks without replacing planner usage or forwarding child lifecycle', async () => {
  const fixture = setup([async (_tools, emit) => {
    emit({ type: 'usage', usage: usage(10) }); emit({ type: 'usage', usage: usage(20) });
    emit({ type: 'model-request', request: { role: 'computer', model: 'gpt-6-luna', elapsedMs: 12, status: 'completed', requestedServiceTier: 'fast', actualServiceTier: 'default', usage: usage(20) } });
    emit({ type: 'model-request', request: { role: 'worker', model: 'wrong-role', elapsedMs: 12, status: 'completed' } });
    emit({ type: 'activity', kind: 'command', title: 'Observed control', detail: 'Not relayed detail' });
    return '{"status":"reported","summary":"Observed the first control"}';
  }, async (_tools, emit) => { emit({ type: 'usage', usage: usage(5) }); return '{"status":"reported","summary":"Observed the next control"}'; }]);
  const parent = fixture.bind(); await parent.call('computer_task', { objective: 'First observation' }); await parent.call('computer_task', { objective: 'Second observation' });
  const counts = fixture.events.filter((event): event is Extract<AgentEvent, { type: 'computer-usage' }> => event.type === 'computer-usage');
  assert.deepEqual(counts.map(event => event.usage.inputTokens), [10, 20, 25]); assert.equal(counts.at(-1)?.usage.outputTokens, 4);
  assert.equal(fixture.events.filter(event => event.type === 'usage' || event.type === 'started' || event.type === 'completed').length, 0);
  const requests = fixture.events.filter((event): event is Extract<AgentEvent, { type: 'model-request' }> => event.type === 'model-request');
  assert.equal(requests.length, 1); assert.equal(requests[0].request.actualServiceTier, 'default', 'requested Fast is never substituted for the actual returned tier');
  assert.deepEqual(fixture.events.find(event => event.type === 'activity'), { type: 'activity', kind: 'command', title: 'Computer worker: Observed control' });
  await fixture.registry.dispose();
});

test('empty, malformed or incomplete reports cannot become a reported completion claim', async () => {
  const malformed = ['', 'All done', '{"status":"reported"}', '{"status":"reported","summary":""}', '{"status":"verified","summary":"Visible"}'];
  const fixture = setup(malformed.map(text => async () => text).concat(async () => '```json\n{"status":"reported","summary":"Visible supplied text","observations":["Field contains supplied text"]}\n```'));
  const parent = fixture.bind();
  for (const _text of malformed) {
    const response = await parent.call('computer_task', { objective: 'Inspect an observed field' });
    assert.equal(report(response).status, 'error'); assert.equal(report(response).verified, false); assert.equal(response.success, false);
  }
  const response = await parent.call('computer_task', { objective: 'Inspect an observed field' });
  assert.equal(report(response).status, 'reported'); assert.equal(report(response).verified, false);
  await fixture.registry.dispose();
});

test('rich legacy reports and terminal handoffs preserve object observations, complete row arrays and additional data fields', async () => {
  const rows = Array.from({ length: 21 }, (_, index) => `Synthetic row ${index + 1}: ${index * 7}`);
  const examples = [
    { status: 'reported', summary: 'Observed sources', observations: [{ file: 'source.csv', visible_columns: ['ID', 'Amount'], visible_data: rows, row_count: 21 }], unverified: { dateType: true } },
    { status: 'blocked', summary: 'Destination must be supplied', observations: { source: { columns: ['ID'], rows } }, unverified: ['Destination missing'] },
    { status: 'reported', summary: 'All visible rows', observations: rows, visible_observations: ['Selected table is visible'], other_data: { count: 21 } },
    { status: 'reported', summary: 'Long but bounded observations', observations: ['a'.repeat(12000), 'b'.repeat(12000)], unverified: null },
  ];
  const scripts: Script[] = examples.flatMap(example => [async () => JSON.stringify(example), async tools => {
    await assert.rejects(tools.call('report_computer_task', example), /unterbrochen/);
    return 'The terminal handoff must not need this final prose.';
  }]);
  const fixture = setup(scripts), parent = fixture.bind();
  for (const example of examples) for (const _mode of ['legacy', 'tool']) {
    const response = await parent.call('computer_task', { objective: 'Read exact visible data and report every relevant row' });
    const result = report(response); assert.equal(result.status, example.status); assert.equal(result.verified, false);
    assert.deepEqual(JSON.parse(result.result), example, 'all bounded observed data must survive the handoff unchanged');
    assert.equal(result.actionCount, 0, 'handoff is not a native operation');
  }
  assert.equal(fixture.inputs.length, 0); assert.ok(fixture.captures.every(capture => capture.disposed === 1));
  await fixture.registry.dispose();
});

test('terminal report bounds reject invalid data without desktop input and allow a corrected bounded handoff', async () => {
  let deep: unknown = null; for (let i = 0; i < 9; i++) deep = { nested: deep };
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
  const invalid = [
    { status: 'reported', summary: ' ', observations: [] },
    { status: 'verified', summary: 'Wrong status' },
    { status: 'reported', summary: 'Too deep', observations: deep },
    { status: 'reported', summary: 'Too many array entries', observations: Array(257).fill(null) },
    { status: 'reported', summary: 'Too many object fields', observations: Object.fromEntries(Array.from({ length: 129 }, (_, index) => [`key${index}`, null])) },
    { status: 'reported', summary: 'Key too long', observations: { ['k'.repeat(201)]: true } },
    { status: 'reported', summary: 'String too long', observations: 'x'.repeat(16001) },
    { status: 'reported', summary: 'Too many nodes', observations: Array.from({ length: 32 }, () => Array(128).fill(null)) },
    { status: 'reported', summary: 'Serialized payload too large', observations: Array(6).fill('x'.repeat(12000)) },
    { status: 'reported', summary: 'Embedded data URL', observations: 'data:image/png;base64,YQ==' },
    { status: 'reported', summary: 'Embedded text data URL', observations: 'data:text/plain,a' },
    { status: 'reported', summary: 'Non JSON number', observations: Number.NaN },
    { status: 'reported', summary: 'Cyclic data', observations: cyclic },
  ];
  const accepted = { status: 'blocked', summary: 'Exact target was not supplied', observations: { found: 21 }, unverified: { target: null } };
  const fixture = setup([async tools => {
    for (const value of invalid) await assert.rejects(tools.call('report_computer_task', value), /Computer report/);
    await assert.rejects(tools.call('report_computer_task', accepted), /unterbrochen/); return 'Not used';
  }]);
  const response = await fixture.bind().call('computer_task', { objective: 'Inspect a destination if one is supplied' });
  assert.equal(report(response).status, 'blocked'); assert.deepEqual(JSON.parse(report(response).result), accepted); assert.equal(fixture.inputs.length, 0);
  await fixture.registry.dispose();
});

test('accepted terminal handoff blocks follow-up actions and waits for pending native input settlement', async () => {
  const entered = deferred<void>(), release = deferred<void>(); let inputSettled = false, signal: AbortSignal | undefined;
  const actions: string[] = [], computer: ComputerAdapter = { async execute(input, abort) {
    const action = (input as { action: string }).action; actions.push(action);
    if (action === 'key') { signal = abort; entered.resolve(); await release.promise; inputSettled = true; }
    return frame('latest');
  }, stop: async () => { if (signal) await release.promise; }, dispose: async () => {} };
  const attempted = deferred<void>();
  const fixture = setup([async tools => {
    await tools.call('computer', { action: 'screenshot' });
    const input = assert.rejects(tools.call('computer', { action: 'key', frameId: 'latest', key: 'tab' }), /unterbrochen/);
    await entered.promise;
    const handoff = assert.rejects(tools.call('report_computer_task', { status: 'reported', summary: 'Input was requested; final state remains unverified', unverified: ['Pending input'] }), /unterbrochen/);
    await assert.rejects(tools.call('computer', { action: 'screenshot' })); attempted.resolve();
    await Promise.all([input, handoff]); return 'Not used';
  }], { computer });
  let returned = false; const call = fixture.bind().call('computer_task', { objective: 'Navigate one visible field' }).then(value => { returned = true; return value; });
  await attempted.promise; await delay(5); assert.equal(signal?.aborted, true); assert.equal(returned, false); assert.equal(inputSettled, false);
  release.resolve(); const result = report(await call); assert.equal(result.status, 'reported'); assert.equal(result.verified, false);
  assert.equal(inputSettled, true); assert.deepEqual(actions, ['screenshot', 'key']); assert.equal(fixture.events.filter(event => event.type === 'computer-frame').length, 1);
  await fixture.registry.dispose();
});

test('a native input failure preserves its recovery image inside the child and never replays the input', async () => {
  const actions: string[] = [], recovered = deferred<void>();
  const computer: ComputerAdapter = { async execute(input) {
    const action = (input as { action: string }).action; actions.push(action);
    if (action === 'click') throw new ComputerDriverError({ operation: 'click', isError: true, degraded: false,
      errorCode: 'foreground_unavailable', failureStage: 'after-input', failureReason: 'post-action-foreground-mismatch' }, frame('fresh-error-frame'));
    return frame('before-input');
  }, stop: async () => {}, dispose: async () => {} };
  const fixture = setup([async tools => {
    await tools.call('computer', { action: 'screenshot' });
    const failure = await tools.call('computer', { action: 'click', frameId: 'before-input', x: 2, y: 3 });
    assert.equal(failure.success, false); assert.equal(failure.contentItems.filter(item => item.type === 'inputImage').length, 1);
    assert.ok(failure.contentItems.some(item => item.type === 'inputText' && item.text.includes('fresh-error-frame'))); recovered.resolve();
    return '{"status":"blocked","summary":"Need to inspect the delivered-input state"}';
  }], { computer });
  const response = await fixture.bind().call('computer_task', { objective: 'Click one observed control' }); await recovered.promise;
  assert.equal(report(response).status, 'blocked'); assert.deepEqual(actions, ['screenshot', 'click']);
  assert.equal(response.contentItems.some(item => item.type === 'inputImage'), false); assert.equal(fixture.events.filter(event => event.type === 'computer-frame').length, 2);
  await fixture.registry.dispose();
});
