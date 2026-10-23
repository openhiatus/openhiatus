import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolRegistry } from '../src/main/modules/tools';
import { createComputerToolContribution } from '../src/main/platform/tools';
import { COMPUTER_METADATA_PREFIX, COMPUTER_VIEWS_METADATA_PREFIX, ComputerDriverError, type ComputerAdapter, type ComputerResult } from '../src/main/computer';
import { imageContent } from '../src/main/agent-host';
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

test('native input failure keeps error status and the same fresh control images through the Pi transport and preview', async () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7N8AAAAASUVORK5CYII=';
  const dataUrl = `data:image/png;base64,${png}`;
  for (const withViews of [false, true]) {
    const events: AgentEvent[] = [];
    const diagnostic = { operation: 'click' as const, isError: true, degraded: false,
      errorCode: 'foreground_unavailable' as const, failureStage: 'after-input' as const, failureReason: 'post-action-foreground-mismatch' as const };
    const frame: ComputerResult = { text: JSON.stringify({ action: 'click', driverFailure: diagnostic }),
      frameId: 'new-frame', width: 1, height: 1, image: { base64: png, mimeType: 'image/png' },
      ...(withViews ? { observation: { version: 2 as const, frameId: 'new-frame', at: '2026-01-01T00:00:00.000Z', displayId: 'primary' as const,
        screenWidth: 1, screenHeight: 1, scaleFactor: 1, overviewScaleDivisor: 16, selection: { reason: 'none' as const },
        timings: { imageProcessingMs: 0, regionSelectionMs: 0 }, views: [{ kind: 'overview' as const, viewId: 'new-view', imageWidth: 1, imageHeight: 1,
          sourceRect: { x: 0, y: 0, width: 1, height: 1 }, dataUrl }] } } : {}) };
    const registry = createToolRegistry([createComputerToolContribution({ computer: { execute: async () => { throw new ComputerDriverError(diagnostic, frame); },
      stop: async () => {}, dispose: async () => {} } })]);
    const binding = registry.bind({ role: 'worker', runId: 'test', signal: new AbortController().signal, emit: event => events.push(event) });
    const response = await binding.call('computer', { action: 'click', frameId: 'old-frame', x: 0, y: 0 });
    assert.equal(response.success, false, 'an observed state is never relabelled as native input success');
    assert.equal(events.length, 1); assert.equal(events[0].type, 'computer-frame');
    if (events[0].type === 'computer-frame') { assert.equal(events[0].frame.dataUrl, dataUrl); assert.equal(events[0].frame.frameId, 'new-frame'); }
    const wire = imageContent(response, 'computer');
    assert.equal(wire.isError, true); assert.equal(wire.details.success, false);
    assert.equal(wire.content.filter(content => content.type === 'image').length, 1);
    const metadata = response.contentItems.find(item => item.type === 'inputText' && item.text.startsWith(withViews ? COMPUTER_VIEWS_METADATA_PREFIX : COMPUTER_METADATA_PREFIX));
    assert.ok(metadata && metadata.type === 'inputText'); assert.match(metadata.text, /new-frame|foreground_unavailable/);
    if (withViews) assert.deepEqual(wire.details.computerViews, [3], 'the preceding failure text must not shift marked image indices incorrectly');
    else assert.equal(wire.details.computerViews, undefined);
    await binding.stop(); await registry.dispose();
  }
});
