import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolRegistry, defineTool, type RegisteredTool, type ToolRunContext } from '../src/main/modules/tools';
import type { AgentEvent, DynamicFunctionTool, DynamicToolResponse } from '../src/shared/contracts';

const definition = (name = 'example'): DynamicFunctionTool => ({ type: 'function', name, description: 'Synthetic tool', inputSchema: { type: 'object', properties: { value: { type: 'string' } } } });
const response = (text = 'done'): DynamicToolResponse => ({ success: true, contentItems: [{ type: 'inputText', text }] });
const context = (role: ToolRunContext['role'] = 'worker', signal = new AbortController().signal): ToolRunContext => ({ runId: 'run', role, signal, emit: () => {} });
function deferred<Value>() { let resolve!: (value: Value) => void; const promise = new Promise<Value>(done => { resolve = done; }); return { promise, resolve }; }

test('each run captures immutable definitions and handlers from the admitted catalog', async () => {
  const original = definition('first');
  const catalog: RegisteredTool[] = [defineTool({ definition: original, validate: value => value, execute: async () => response('first') })];
  const registry = createToolRegistry([{ bind: () => ({ tools: catalog }) }]), bound = registry.bind(context());
  original.name = 'mutated'; (original.inputSchema as { properties: object }).properties = {};
  catalog.push(defineTool({ definition: definition('second'), validate: value => value, execute: async () => response('second') }));
  assert.deepEqual(bound.definitions.map(tool => tool.name), ['first']);
  assert.throws(() => { bound.definitions[0].name = 'changed'; });
  assert.ok(Object.isFrozen(bound.definitions)); assert.ok(Object.isFrozen(bound.definitions[0].inputSchema));
  assert.equal((await bound.call('first', {})).contentItems[0].type, 'inputText');
  await assert.rejects(bound.call('second', {}), /abgelehnt/);
  await bound.stop(); const next = registry.bind(context());
  assert.deepEqual(next.definitions.map(tool => tool.name), ['first', 'second']); await registry.dispose();
});

test('worker-only is the default and accidental mixed contributions cannot expose worker tools to a dialog', async () => {
  let workerCalls = 0, dialogCalls = 0;
  const registry = createToolRegistry([{ bind: () => ({ tools: [
    defineTool({ definition: definition('worker'), validate: value => value, execute: async () => { workerCalls++; return response(); } }),
    defineTool({ definition: definition('dialog'), audience: 'dialog', validate: value => value, execute: async () => { dialogCalls++; return response(); } }),
  ] }) }]);
  const dialog = registry.bind(context('dialog'));
  assert.deepEqual(dialog.definitions.map(tool => tool.name), ['dialog']); await assert.rejects(dialog.call('worker', {}));
  await dialog.call('dialog', {}); assert.equal(workerCalls, 0); assert.equal(dialogCalls, 1);
  const worker = registry.bind(context());
  assert.deepEqual(worker.definitions.map(tool => tool.name), ['worker']); await assert.rejects(worker.call('dialog', {}));
  await registry.dispose();
});

test('validation runs before the typed handler and cancellation blocks new or late executions and events', async () => {
  const result = deferred<DynamicToolResponse>(), abort = new AbortController(), events: AgentEvent[] = [];
  const admitted: { value: number; context: ToolRunContext }[] = [];
  const registry = createToolRegistry([{ bind: () => ({ tools: [defineTool({
    definition: definition(),
    validate: input => { if (!input || typeof input !== 'object' || !('value' in input) || typeof input.value !== 'number') throw new Error('Invalid input'); return input.value * 2; },
    execute: async (value, run) => { admitted.push({ value, context: run }); return result.promise; },
  })] }) }]);
  const bound = registry.bind({ ...context('worker', abort.signal), emit: event => { events.push(event); } });
  await assert.rejects(bound.call('example', 'bad'), /Invalid/); assert.equal(admitted.length, 0);
  const call = bound.call('example', { value: 3 });
  assert.equal(admitted[0].value, 6); assert.equal(admitted[0].context.runId, 'run');
  abort.abort(); assert.equal(admitted[0].context.signal.aborted, true);
  admitted[0].context.emit({ type: 'activity', kind: 'system', title: 'late' }); result.resolve(response());
  await assert.rejects(call, /unterbrochen/); await assert.rejects(bound.call('example', { value: 4 }), /unterbrochen/);
  assert.deepEqual(events, []); await registry.dispose();
});

test('Stop starts all contribution cleanups together, retains failures and retries before disposal', async () => {
  const release = deferred<void>(); let fail = true, firstStops = 0, secondStops = 0, disposed = 0;
  const registry = createToolRegistry([
    { bind: () => ({ tools: [], stop: async () => { firstStops++; if (fail) throw new Error('Unconfirmed cleanup'); } }), dispose: async () => { disposed++; } },
    { bind: () => ({ tools: [], stop: async () => { secondStops++; await release.promise; } }), dispose: async () => { disposed++; } },
  ]);
  const bound = registry.bind(context()), stopping = bound.stop();
  assert.equal(firstStops, 1); assert.equal(secondStops, 1); assert.equal(bound.stop(), stopping);
  release.resolve(); await assert.rejects(stopping, /Unconfirmed/); assert.equal(disposed, 0);
  fail = false; await registry.dispose(); assert.equal(firstStops, 2); assert.equal(secondStops, 2); assert.equal(disposed, 2);
  await registry.dispose(); assert.equal(disposed, 2); assert.throws(() => registry.bind(context()), /beendet/);
});

test('duplicate names fail at binding and partial contribution cleanup is still retained', async () => {
  let stopped = 0;
  const tool = defineTool({ definition: definition(), validate: value => value, execute: async () => response() });
  const registry = createToolRegistry([{ bind: () => ({ tools: [tool, tool], stop: async () => { stopped++; } }) }]);
  assert.throws(() => registry.bind(context()), /doppelt/); await registry.dispose(); assert.equal(stopped, 1);
});

test('a failed partial binding blocks further runs until its cleanup is confirmed through the port', async () => {
  let failCleanup = true, failBind = true, cleanups = 0;
  const registry = createToolRegistry([
    { bind: () => ({ tools: [], stop: async () => { cleanups++; if (failCleanup) throw new Error('Unconfirmed partial cleanup'); } }) },
    { bind: () => { if (failBind) throw new Error('Contribution setup failed'); return { tools: [] }; } },
  ]);
  assert.throws(() => registry.bind(context()), /setup failed/);
  assert.throws(() => registry.bind(context()), /unbestätigt/);
  await assert.rejects(registry.stop(), /Unconfirmed partial/);
  assert.throws(() => registry.bind(context()), /unbestätigt/);
  failCleanup = false; await registry.stop(); assert.equal(cleanups, 2);
  failBind = false; const next = registry.bind(context()); assert.deepEqual(next.definitions, []); await registry.dispose();
});
