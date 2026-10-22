import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolRegistry } from '../src/main/modules/tools';
import { createComputerToolContribution } from '../src/main/platform/tools';
import { COMPUTER_METADATA_PREFIX, type ComputerAdapter } from '../src/main/computer';
import type { AgentEvent } from '../src/shared/contracts';

test('computer contributes a validated worker-only tool without acquiring native resources at binding', async () => {
  let created = 0, called = 0, stopped = 0, disposed = 0, seenSignal: AbortSignal | undefined;
  const events: AgentEvent[] = [], abort = new AbortController();
  const computer: ComputerAdapter = {
    execute: async (_args, signal) => { called++; seenSignal = signal; return { text: 'visible', frameId: 'frame', width: 2, height: 3, image: { base64: 'synthetic', mimeType: 'image/png' } }; },
    stop: async () => { stopped++; }, dispose: async () => { disposed++; },
  };
  const registry = createToolRegistry([createComputerToolContribution({ createComputer: () => { created++; return computer; } })]);
  const context = { runId: 'run', signal: abort.signal, emit: (event: AgentEvent) => { events.push(event); } };
  const dialog = registry.bind({ ...context, role: 'dialog' });
  assert.deepEqual(dialog.definitions, []); await assert.rejects(dialog.call('computer', { action: 'screenshot' }));
  await dialog.stop(); assert.equal(created, 0);
  const worker = registry.bind({ ...context, role: 'worker' }); assert.equal(created, 0);
  await assert.rejects(worker.call('computer', { action: 'screenshot', script: 'unrelated' })); assert.equal(created, 0);
  const response = await worker.call('computer', { action: 'screenshot' });
  assert.equal(created, 1); assert.equal(called, 1); assert.equal(seenSignal?.aborted, false);
  assert.equal(events[0].type, 'computer-frame');
  assert.equal(response.contentItems[0].type, 'inputText');
  if (response.contentItems[0].type === 'inputText') assert.match(response.contentItems[0].text, new RegExp(`^${COMPUTER_METADATA_PREFIX}`));
  assert.deepEqual(response.contentItems[1], { type: 'inputImage', imageUrl: 'data:image/png;base64,synthetic' });
  await worker.stop(); assert.equal(seenSignal?.aborted, true); assert.equal(stopped, 1);
  await registry.dispose(); assert.equal(disposed, 1);
});
