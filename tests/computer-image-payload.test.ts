import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { imageContent } from '../src/main/agent-host';
import { applyComputerImageDetail } from '../src/main/computer-image-payload';
import { decodeToolResponse } from '../src/main/agent-wire';
import { createToolRegistry } from '../src/main/modules/tools';
import { createComputerToolContribution } from '../src/main/platform/tools';
import { COMPUTER_METADATA_PREFIX, COMPUTER_VIEWS_METADATA_PREFIX } from '../src/main/computer';
import type { AgentEvent, ComputerFrame, DynamicToolResponse } from '../src/shared/contracts';
import type { ComputerObservation } from '../src/shared/computer-views';
import { decodeComputerFrame } from '../src/shared/ipc';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7N8AAAAASUVORK5CYII=';
const imageUrl = `data:image/png;base64,${PNG}`;
const requestModel = { api: 'openai-responses', provider: 'openai', id: 'gpt-6.1-sol', baseUrl: 'https://api.openai.com/v1' };
const response: DynamicToolResponse = { success: true, contentItems: [
  { type: 'inputText', text: 'Computer views metadata' }, { type: 'inputImage', imageUrl, computerView: 'overview' },
] };
const message = () => ({ role: 'toolResult', toolName: 'computer', toolCallId: 'call_1', timestamp: 1, ...imageContent(response, 'computer') });
const payload = () => ({ input: [{ type: 'function_call_output', call_id: 'call_1', output: [
  { type: 'input_text', text: 'metadata' }, { type: 'input_image', image_url: imageUrl, detail: 'auto' },
  { type: 'input_image', image_url: 'data:image/png;base64,other', detail: 'auto' },
] }], stream: true, service_tier: 'priority', reasoning: { effort: 'medium' } });

test('computer image markers cross the wire and only the computer tool records them in Pi details', () => {
  assert.deepEqual(decodeToolResponse(response), response);
  assert.deepEqual(imageContent(response, 'computer').details, { success: true, computerViews: [1] });
  assert.deepEqual(imageContent(response, 'other').details, { success: true });
  assert.throws(() => decodeToolResponse({ ...response, contentItems: [{ type: 'inputImage', imageUrl, computerView: 'original' }] }));
});
test('supported OpenAI Responses image detail changes only marked computer images and preserves other settings', () => {
  const request = payload(); applyComputerImageDetail(request, [message()], requestModel);
  assert.equal(request.input[0].output[1].detail, 'original'); assert.equal(request.input[0].output[2].detail, 'auto');
  assert.equal(request.stream, true); assert.equal(request.service_tier, 'priority'); assert.deepEqual(request.reasoning, { effort: 'medium' });
});
test('Luna computer requests preserve marked overview and native detail dimensions', () => {
  for (const id of ['gpt-6-luna', 'gpt-6-luna-2026-10-01']) {
    const request = payload(); applyComputerImageDetail(request, [message()], { ...requestModel, id });
    assert.equal(request.input[0].output[1].detail, 'original'); assert.equal(request.input[0].output[2].detail, 'auto');
  }
});
test('unmarked legacy images and unrelated tools/providers/models keep their existing detail behavior', () => {
  const unmarked = { ...message(), details: { success: true } };
  for (const [messages, model] of [
    [[unmarked], requestModel], [[{ ...message(), toolName: 'read' }], requestModel],
    [[message()], { ...requestModel, provider: 'local' }], [[message()], { ...requestModel, baseUrl: 'http://localhost/v1' }],
    [[message()], { ...requestModel, id: 'gpt-4o' }], [[message()], { ...requestModel, api: 'openai-completions' }],
  ] as const) {
    const request = payload(); applyComputerImageDetail(request, messages, model);
    assert.equal(request.input[0].output[1].detail, 'auto');
  }
});
test('identical images in unrelated attachments and other tool outputs are not rewritten', () => {
  const request = payload();
  const unrelated = { type: 'input_image', image_url: imageUrl, detail: 'auto' };
  const userImage = { ...unrelated };
  const value = { input: [...request.input, { type: 'function_call_output', call_id: 'unrelated', output: [unrelated] }, { role: 'user', content: [userImage] }] };
  applyComputerImageDetail(value, [message()], requestModel);
  assert.equal(request.input[0].output[1].detail, 'original'); assert.equal(unrelated.detail, 'auto'); assert.equal(userImage.detail, 'auto');
});
test('the installed Pi converter produces real image inputs that the scoped hook can preserve at original detail', async () => {
  const module = await import(pathToFileURL(resolve('node_modules/@earendil-works/pi-ai/dist/api/openai-responses-shared.js')).href);
  const model = { ...requestModel, input: ['text', 'image'], reasoning: false };
  const messages = [message()];
  const input = module.convertResponsesMessages(model, { messages }, new Set(['openai']));
  const request = { input }; applyComputerImageDetail(request, messages, requestModel);
  const encoded = JSON.stringify(request);
  assert.ok(encoded.includes('"type":"input_image"')); assert.ok(encoded.includes('"detail":"original"'));
  assert.equal(encoded.split(PNG).length - 1, 1, 'one real image block, no duplicate encoded text');
});
test('v2 tool transport contains exactly overview/detail images and preview gets the same capture metadata', async () => {
  const observation: ComputerObservation = { version: 2, frameId: 'frame', at: '2026-10-22T12:00:00.000Z', displayId: 'primary',
    screenWidth: 8, screenHeight: 8, scaleFactor: 1.5, overviewScaleDivisor: 8,
    views: [
      { kind: 'overview', viewId: 'overview', imageWidth: 1, imageHeight: 1, sourceRect: { x: 0, y: 0, width: 8, height: 8 }, dataUrl: imageUrl },
      { kind: 'detail', viewId: 'detail', imageWidth: 1, imageHeight: 1, sourceRect: { x: 3, y: 4, width: 1, height: 1 }, dataUrl: imageUrl },
    ], selection: { reason: 'manual', rect: { x: 3, y: 4, width: 1, height: 1 } }, timings: { imageProcessingMs: 2, regionSelectionMs: 1 } };
  const events: AgentEvent[] = [];
  const computer = { execute: async () => ({ text: 'captured', frameId: 'frame', width: 8, height: 8,
    image: { base64: PNG, mimeType: 'image/png' as const }, observation }), stop: async () => {}, dispose: async () => {} };
  const registry = createToolRegistry([createComputerToolContribution({ computer })]);
  const worker = registry.bind({ runId: 'run', role: 'worker', signal: new AbortController().signal, emit: event => { events.push(event); } });
  const reply = await worker.call('computer', { action: 'screenshot' });
  assert.equal(reply.contentItems.length, 5);
  assert.deepEqual(reply.contentItems.filter(item => item.type === 'inputImage'), [
    { type: 'inputImage', imageUrl, computerView: 'overview' }, { type: 'inputImage', imageUrl, computerView: 'detail' },
  ]);
  const metadata = reply.contentItems[0]; assert.equal(metadata.type, 'inputText');
  if (metadata.type === 'inputText') { assert.ok(metadata.text.startsWith(COMPUTER_VIEWS_METADATA_PREFIX)); assert.ok(!metadata.text.includes(PNG)); }
  const event = events[0]; assert.equal(event.type, 'computer-frame');
  if (event.type === 'computer-frame') assert.deepEqual(decodeComputerFrame(event.frame), event.frame);
  await worker.stop(); await registry.dispose();
});
test('explicit original screenshot also marks the image for supported provider detail handling in legacy full-screen mode', async () => {
  const computer = { execute: async () => ({ text: 'captured', frameId: 'frame', width: 1, height: 1,
    image: { base64: PNG, mimeType: 'image/png' as const } }), stop: async () => {}, dispose: async () => {} };
  const registry = createToolRegistry([createComputerToolContribution({ computer })]);
  const worker = registry.bind({ runId: 'run', role: 'worker', signal: new AbortController().signal, emit: () => {} });
  const reply = await worker.call('computer', { action: 'screenshot', resolution: 'original' });
  assert.equal(reply.contentItems.length, 2);
  assert.deepEqual(reply.contentItems[1], { type: 'inputImage', imageUrl, computerView: 'overview' });
  const metadata = reply.contentItems[0]; assert.equal(metadata.type, 'inputText');
  if (metadata.type === 'inputText') assert.ok(metadata.text.startsWith(COMPUTER_METADATA_PREFIX));
  assert.deepEqual(imageContent(reply, 'computer').details, { success: true, computerViews: [1] });
  await worker.stop(); await registry.dispose();
});
