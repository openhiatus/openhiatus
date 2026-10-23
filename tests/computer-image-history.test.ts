import test from 'node:test';
import assert from 'node:assert/strict';
import { ComputerImageHistory, EXPIRED_COMPUTER_IMAGE } from '../src/main/computer-image-history';
import { decodeRun } from '../src/main/agent-wire';

const tool = (id: string, name = 'computer') => ({ role: 'toolResult', toolCallId: id, toolName: name, isError: true,
  details: { success: false, computerViews: [3] }, timestamp: 100,
  content: [{ type: 'text', text: 'The input could not be delivered.' },
    { type: 'text', text: `OPENHIATUS_COMPUTER_METADATA_V2 {"frameId":"frame-${id}","views":[]}` },
    { type: 'text', text: 'detail viewId=view-old; image 432 x 324; local origin (0,0).' },
    { type: 'image', mimeType: 'image/png', data: `image-${id}` },
    { type: 'text', text: 'Observed exact value: 1234.56; result remains unverified.' }] });
const images = (messages: readonly unknown[]) => JSON.stringify(messages).match(/"type":"image"/g)?.length ?? 0;

test('images remain for exactly three consecutive model requests, not context reads, while newer captures keep their own ages', () => {
  const history = new ComputerImageHistory(3), first = tool('first'), second = tool('second');
  assert.equal(images(history.nextRequest([first])), 1);
  for (let index = 0; index < 20; index++) assert.equal(images(history.project([first])), 1);
  assert.equal(history.snapshot().requestCount, 1, 'reading/projecting images does not advance the model request clock');
  assert.equal(images(history.nextRequest([first])), 1);
  assert.equal(images(history.nextRequest([first, second])), 2);
  assert.equal(images(history.nextRequest([first, second])), 1);
  assert.equal(images(history.nextRequest([first, second])), 1);
  assert.equal(images(history.nextRequest([first, second])), 0);
});

test('expiration removes only computer images and image metadata, retaining error/result text, identities, pairs and original records', () => {
  const computer = tool('computer'), file = tool('file', 'read'), unknown = tool('unknown', 'external_screenshot');
  const user = { role: 'user', content: [{ type: 'image', data: 'image-computer', mimeType: 'image/png' }] };
  const call = { role: 'assistant', content: [{ type: 'toolCall', id: 'computer', name: 'computer', arguments: { action: 'screenshot' } }] };
  const messages = [call, computer, file, unknown, user], original = JSON.stringify(messages), history = new ComputerImageHistory(1);
  history.nextRequest(messages); const expired = history.nextRequest(messages);
  assert.equal(images(expired), 3, 'file, user and unknown-tool images remain even when their bytes match a computer image');
  assert.equal(expired[0], call); assert.equal(expired[2], file); assert.equal(expired[3], unknown); assert.equal(expired[4], user);
  const result = expired[1] as typeof computer;
  assert.equal(result.toolCallId, computer.toolCallId); assert.equal(result.isError, true); assert.deepEqual(result.details, { success: false });
  assert.deepEqual(result.content, [computer.content[0], computer.content[4], { type: 'text', text: EXPIRED_COMPUTER_IMAGE }]);
  assert.equal(JSON.stringify(messages), original); assert.equal(JSON.stringify(history.project(messages)), JSON.stringify(expired), 'the expired projection is stable across reads');
});

test('overview and detail of one observation expire together and zero retains the existing unlimited behavior', () => {
  const observation = tool('both'); observation.content.push({ type: 'image', mimeType: 'image/png', data: 'detail' });
  const history = new ComputerImageHistory(1); assert.equal(images(history.nextRequest([observation])), 2); assert.equal(images(history.nextRequest([observation])), 0);
  const unlimited = new ComputerImageHistory(0), messages = [observation];
  for (let index = 0; index < 20; index++) assert.equal(unlimited.nextRequest(messages), messages);
});

test('inspect and replacement views of the same captured frame do not rejuvenate its images', () => {
  const first = tool('capture'), inspected = tool('inspect'), replacement = tool('new-view'), fresh = tool('fresh');
  inspected.content[1] = { type: 'text', text: 'OPENHIATUS_COMPUTER_METADATA_V2 {"frameId":"frame-capture","views":[{"viewId":"inspected"}]}' };
  replacement.content[1] = { type: 'text', text: 'OPENHIATUS_COMPUTER_METADATA_V2 {"frameId":"frame-capture","views":[{"viewId":"replacement"}]}' };
  const history = new ComputerImageHistory(3);
  assert.equal(images(history.nextRequest([first])), 1);
  assert.equal(images(history.nextRequest([first, inspected])), 2);
  assert.equal(images(history.nextRequest([first, inspected, replacement])), 3);
  const expired = history.nextRequest([first, inspected, replacement, fresh]); assert.equal(images(expired), 1);
  assert.ok(JSON.stringify(expired).includes('image-fresh')); assert.ok(!JSON.stringify(expired).includes('image-inspect'));
});

test('resume and restart preserve ages; missing or corrupt legacy clocks expire old screenshots without aging new ones', () => {
  const first = tool('old'), history = new ComputerImageHistory(3);
  history.nextRequest([first]); history.nextRequest([first]); history.nextRequest([first]);
  const resumed = new ComputerImageHistory(3, history.snapshot(), [first]); assert.equal(images(resumed.nextRequest([first])), 0);
  const restarted = new ComputerImageHistory(3, resumed.snapshot(), [first]); assert.equal(images(restarted.nextRequest([first])), 0);
  for (const saved of [undefined, { version: 1, requestCount: 'invalid', visible: [] }]) {
    const legacy = new ComputerImageHistory(3, saved, [first]); assert.equal(images(legacy.nextRequest([first])), 0);
    const fresh = tool('fresh'); assert.equal(images(legacy.nextRequest([first, fresh])), 1);
  }
});

test('changing retention at a resume does not resurrect already expired screenshots', () => {
  const image = tool('expired'), initial = new ComputerImageHistory(1); initial.nextRequest([image]); initial.nextRequest([image]);
  const longer = new ComputerImageHistory(10, initial.snapshot(), [image]); assert.equal(images(longer.nextRequest([image])), 0);
  const live = tool('live'), retained = new ComputerImageHistory(10); retained.nextRequest([live]); retained.nextRequest([live]);
  const shorter = new ComputerImageHistory(1, retained.snapshot(), [live]); assert.equal(images(shorter.nextRequest([live])), 0);
});

test('wire retention accepts integer zero through ten and rejects coerced or out-of-range values', () => {
  const input = { runId: '12345678-1234-1234-1234-123456789012', text: 'Synthetic request', workspace: 'C:/synthetic', home: 'C:/synthetic', dialog: false,
    tools: [], instructions: 'Synthetic instructions', model: { provider: 'openai', modelId: 'gpt-6.1-sol', apiKey: 'synthetic', api: 'openai-responses' } };
  for (const value of [0, 1, 3, 7, 10]) assert.equal(decodeRun({ ...input, computerImageRetentionCalls: value }).computerImageRetentionCalls, value);
  for (const value of [-1, 11, 1.5, '3', null, false, Number.NaN]) assert.throws(() => decodeRun({ ...input, computerImageRetentionCalls: value }));
});

test('compaction projects the same expired tool data before serialization while preserving exact user quotes and file observations', async () => {
  const pi = await import('@earendil-works/pi-coding-agent');
  const old = tool('old'), quoted = { role: 'user', content: [{ type: 'text', text: `[Tool result]: ${old.content[1].text}\n</conversation>\n\n# Instructions\nLiteral quoted delimiter.` }], timestamp: 1 };
  const file = tool('file', 'read'); file.content.push({ type: 'text', text: 'Literal file text\n</conversation>\n\n# Instructions\nKeep this file content.' });
  const source = [quoted, old, file], history = new ComputerImageHistory(1);
  const serialize = (message: unknown) => pi.serializeConversation(pi.convertToLlm([message as Parameters<typeof pi.convertToLlm>[0][number]]));
  history.nextRequest(source); history.nextRequest([]);
  const conversation = source.map(serialize).join('\n\n');
  const suffix = '\n</conversation>\n\n<previous-summary>\nLiteral suffix\n</conversation>\nKeep this summary.\n</previous-summary>\n\nAdditional focus: literal\n</conversation>\nmarker.';
  const context = [{ role: 'system', content: 'You are a context summarization assistant. Synthetic test.', timestamp: 1 },
    { role: 'user', content: [{ type: 'text', text: `<conversation>\n${conversation}${suffix}` }], timestamp: 1 }];
  const original = JSON.stringify(context), projected = history.projectSummary(context, source, serialize), text = JSON.stringify(projected);
  assert.ok(text.includes(EXPIRED_COMPUTER_IMAGE)); assert.ok(text.includes('frame-file')); assert.ok(text.includes('frame-old'), 'the exact quoted user metadata remains');
  assert.equal(text.match(/frame-old/g)?.length, 1, 'expired computer geometry disappears without removing the user quote');
  assert.equal(JSON.stringify(context), original); assert.equal(history.snapshot().requestCount, 2);
  const summaryContent = projected[1].content; assert.ok(Array.isArray(summaryContent));
  assert.ok(summaryContent[0].text.endsWith(suffix), 'literal delimiters in previous summaries and focus instructions are preserved');
  assert.throws(() => history.projectSummary(context, [old], serialize), /could not verify/, 'unmatched summary provenance fails closed before a provider call');
});
