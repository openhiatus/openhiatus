import test from 'node:test';
import assert from 'node:assert/strict';
import { ComputerImageHistory, EXPIRED_COMPUTER_IMAGE, COMPUTER_STATE_NOTE, COMPUTER_WORKING_MEMORY_REFRESH, computerImageHistoryInstructions } from '../src/main/computer-image-history';
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
  assert.equal(images(history.nextRequest([first, inspected])), 1);
  assert.equal(images(history.nextRequest([first, inspected, replacement])), 1);
  const expired = history.nextRequest([first, inspected, replacement, fresh]); assert.equal(images(expired), 1);
  assert.ok(JSON.stringify(expired).includes('image-fresh')); assert.ok(!JSON.stringify(expired).includes('image-inspect'));
});

test('two requests and two newest distinct captures are independent hard bounds, including many captures in one turn and restore', () => {
  const first = tool('first'), second = tool('second'), third = tool('third'), fourth = tool('fourth');
  const history = new ComputerImageHistory(2), all = [first, second, third, fourth], original = JSON.stringify(all);
  const projected = history.nextRequest(all);
  assert.equal(images(projected), 2); assert.ok(!JSON.stringify(projected).includes('image-first'));
  assert.deepEqual(history.snapshot().visible.map(row => row.callId), ['frame:frame-third', 'frame:frame-fourth']);
  assert.equal(images(history.nextRequest(all)), 2);
  assert.equal(images(history.nextRequest(all)), 0, 'third sighting removes both frames');
  const oversized = { version: 1, requestCount: 1, visible: all.map((_, index) => ({ callId: `frame:frame-${['first', 'second', 'third', 'fourth'][index]}`, firstRequest: 1 })) };
  const restored = new ComputerImageHistory(2, oversized, all);
  assert.equal(restored.snapshot().visible.length, 2); assert.equal(images(restored.nextRequest(all)), 2);
  assert.equal(images(restored.nextRequest(all)), 0);
  assert.equal(JSON.stringify(all), original);
});

test('late inspect cannot reintroduce an expired or count-evicted capture, including after restart', () => {
  const first = tool('first'), second = tool('second'), third = tool('third'), inspected = tool('inspect');
  inspected.content[1] = { type: 'text', text: 'OPENHIATUS_COMPUTER_METADATA_V2 {"frameId":"frame-first","views":[]}' };
  const history = new ComputerImageHistory(2); history.nextRequest([first, second, third]);
  const all = [first, second, third, inspected], restored = new ComputerImageHistory(2, history.snapshot(), [first, second, third]);
  const projected = restored.nextRequest(all);
  assert.equal(images(projected), 2); assert.ok(!JSON.stringify(projected).includes('image-inspect'));
  assert.equal(images(restored.nextRequest(all)), 0);
});

test('only the latest result image set per live capture survives; older text/errors and external images stay exact', () => {
  const first = tool('capture'), inspect = tool('inspect'), external = tool('file', 'read');
  inspect.content[1] = { type: 'text', text: 'OPENHIATUS_COMPUTER_METADATA_V2 {"frameId":"frame-capture","views":[]}' };
  inspect.content.push({ type: 'image', data: 'latest-detail', mimeType: 'image/png' });
  const history = new ComputerImageHistory(2), original = JSON.stringify([first, inspect, external]);
  const projected = history.nextRequest([first, inspect, external]);
  assert.equal(images(projected), 3); assert.ok(!JSON.stringify(projected).includes('image-capture'));
  assert.ok(JSON.stringify(projected[0]).includes('Observed exact value: 1234.56'));
  assert.equal(projected[0].isError, true); assert.deepEqual(projected[0].details, { success: false });
  assert.equal(projected[2], external); assert.equal(JSON.stringify([first, inspect, external]), original);
});

const noteCall = (id: string, stateNote: unknown, timestamp = 10, action = 'screenshot') => ({ role: 'assistant', timestamp,
  content: [{ type: 'toolCall', id, name: 'computer', arguments: { action, stateNote } }] });

test('one bounded latest unverified note replaces earlier arguments without mutating logs or claiming failed actions succeeded', () => {
  const old = noteCall('old', 'Old value 10'), current = noteCall('current', 'Current value 20\nAction remains uncertain', 20);
  const failed = tool('current'), messages = [old, tool('old'), current, failed], original = JSON.stringify(messages);
  const history = new ComputerImageHistory(2), projected = history.nextRequest(messages), text = JSON.stringify(projected);
  assert.equal(text.split(COMPUTER_STATE_NOTE).length - 1, 1);
  assert.ok(!text.includes('Old value 10')); assert.ok(!text.includes('"stateNote"'));
  assert.ok(text.includes('Current value 20')); assert.ok(text.includes('Action remains uncertain'));
  assert.equal((projected.at(-1) as typeof failed).isError, true);
  assert.equal(history.snapshot().stateNote, 'Current value 20\nAction remains uncertain');
  assert.equal(JSON.stringify(messages), original); assert.equal(JSON.stringify(history.project(projected)), text, 'projection is idempotent');
});

test('invalid or unknown computer arguments cannot replace the note; valid failed-result notes remain unverified and missing results do not imply success', () => {
  const messages = [noteCall('good', 'Value 20'), tool('good'), noteCall('unknown', 'Claimed success', 20, 'launchShell'),
    noteCall('bad', 'x'.repeat(241), 30)];
  const history = new ComputerImageHistory(2), text = JSON.stringify(history.nextRequest(messages));
  assert.equal(history.snapshot().stateNote, 'Value 20'); assert.ok(!text.includes('Claimed success'));
  assert.ok(!text.includes('"stateNote"')); assert.equal(text.split(COMPUTER_STATE_NOTE).length - 1, 1);
  assert.ok(!EXPIRED_COMPUTER_IMAGE.toLowerCase().includes('screenshot'));
});

test('state note survives restart and context pruning, uses an ephemeral data message without tools, and leaves user/file text exact', () => {
  const old = noteCall('old', 'Old state', 10), current = noteCall('new', 'New state', 20), history = new ComputerImageHistory(2);
  history.nextRequest([old, current]);
  const snapshot = history.snapshot(), restored = new ComputerImageHistory(2, snapshot, [old]);
  const user = { role: 'user', timestamp: 100, content: [{ type: 'text', text: 'Quoted stateNote and full business instructions stay exact.' }] };
  const file = { role: 'toolResult', toolName: 'read', toolCallId: 'file', content: [{ type: 'text', text: 'File observation: New state.' }] };
  const projected = restored.nextRequest([user, file]);
  assert.equal(projected[0], user); assert.equal(projected[1], file);
  assert.equal(JSON.stringify(projected).split(COMPUTER_STATE_NOTE).length - 1, 1);
  assert.equal(restored.snapshot().stateNote, 'New state'); assert.ok(JSON.stringify(projected.at(-1)).includes('"role":"user"'));
  const newerAfterLastSnapshot = noteCall('later', 'Later recovered state', 30);
  const resumed = new ComputerImageHistory(2, snapshot, [old, current, newerAfterLastSnapshot]);
  assert.equal(resumed.snapshot().stateNote, 'Later recovered state');
  const unlimited = new ComputerImageHistory(0), original = [current, user, file];
  assert.equal(unlimited.nextRequest(original), original); assert.equal(unlimited.project(original), original);
});

test('initial guidance gives both hard bounds and a small replacement note, with no separate summaries or memory documents', () => {
  const text = computerImageHistoryInstructions(2);
  assert.match(text, /2 newest distinct captures/); assert.match(text, /2 consecutive model requests/);
  assert.match(text, /240 characters/); assert.match(text, /three short lines/); assert.match(text, /extra documents\/sheets solely as memory aids/);
  assert.equal(computerImageHistoryInstructions(0), '');
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

test('compaction after restart strips old note arguments and preserves exactly one current note outside serialized messages', async () => {
  const pi = await import('@earendil-works/pi-coding-agent');
  const older = noteCall('older', 'Older fact', 10), latest = noteCall('latest', 'Latest fact', 20);
  const source = [older, tool('older'), latest, tool('latest')], history = new ComputerImageHistory(2);
  history.nextRequest(source);
  const restored = new ComputerImageHistory(2, history.snapshot(), [latest, tool('latest')]);
  const serialize = (message: unknown) => pi.serializeConversation(pi.convertToLlm([message as Parameters<typeof pi.convertToLlm>[0][number]]));
  const context = [{ role: 'system', content: 'You are a context summarization assistant. Synthetic test.', timestamp: 1 },
    { role: 'user', content: [{ type: 'text', text: `<conversation>\n${source.map(serialize).join('\n\n')}\n</conversation>` }], timestamp: 1 }];
  const messages = restored.nextRequest(context), projected = restored.projectSummary(messages, source, serialize), text = JSON.stringify(projected);
  assert.equal(text.split(COMPUTER_STATE_NOTE).length - 1, 1);
  assert.equal(restored.snapshot().stateNote, 'Latest fact', 'previously compacted old source cannot roll the note back after restart');
  assert.ok(!text.includes('Older fact')); assert.ok(!text.includes('stateNote'));
  assert.equal(text.split('Latest fact').length - 1, 1, 'the current note is outside the serialized individual messages');
  assert.equal((source[0] as typeof older).content[0].arguments.stateNote, 'Older fact', 'canonical source remains complete');
});

test('rolling working memory keeps exactly the last fifteen request ages and one stale note while preserving user/file/service data', () => {
  const history = new ComputerImageHistory(2, undefined, [], { workingMemoryCalls: 15 });
  const user = { role: 'user', content: [{ type: 'text', text: 'Exact original business requirements.' }] };
  const file = tool('file', 'read'), service = tool('service', 'service_status');
  const canonical: unknown[] = [{ role: 'system', content: 'Original instructions' }, user, file, service];
  for (let request = 1; request <= 17; request++) {
    const call = noteCall(`rolling-${request}`, request === 1 ? 'Opening value 20' : undefined, request);
    canonical.push({ ...call, content: [{ type: 'thinking', thinking: `old thinking ${request}` },
      { type: 'text', text: `old computer comment ${request}` }, ...call.content] }, tool(`rolling-${request}`));
    const original = JSON.stringify(canonical), projected = history.nextRequest(canonical), text = JSON.stringify(projected);
    const results = projected.filter(value => (value as { toolName?: string }).toolName === 'computer');
    assert.equal(results.length, Math.min(15, request));
    assert.equal(projected.find(value => value === user), user); assert.ok(projected.includes(file)); assert.ok(projected.includes(service));
    assert.equal(text.split(COMPUTER_STATE_NOTE).length - 1, 1);
    assert.equal(text.split(COMPUTER_WORKING_MEMORY_REFRESH).length - 1, request === 16 ? 1 : 0);
    if (request >= 16) {
      assert.ok(!text.includes('old thinking 1"')); assert.ok(!text.includes('old computer comment 1"'));
      assert.ok(text.includes('[stale; refresh required] Opening value 20'));
      assert.ok(!text.includes('"toolCallId":"rolling-1"')); assert.ok(!text.includes('"id":"rolling-1"'));
    }
    assert.equal(JSON.stringify(canonical), original);
  }
  canonical.push(noteCall('fresh-note', 'Complete refreshed snapshot', 18), tool('fresh-note'));
  const refreshed = JSON.stringify(history.nextRequest(canonical));
  assert.ok(refreshed.includes('Complete refreshed snapshot')); assert.ok(!refreshed.includes('Opening value 20'));
  assert.ok(!refreshed.includes('[stale; refresh required]')); assert.ok(!refreshed.includes(COMPUTER_WORKING_MEMORY_REFRESH));
});

test('working-memory multi-call turns expire as pairs; mixed calls keep non-computer data and pending calls remain paired', () => {
  const computerOnly = { role: 'assistant', content: [{ type: 'thinking', thinking: 'computer-only thinking' },
    { type: 'text', text: 'computer-only comment' }, ...noteCall('a', undefined).content, ...noteCall('b', undefined).content] };
  const mixed = { role: 'assistant', content: [{ type: 'thinking', thinking: 'mixed thinking' }, ...noteCall('c', undefined).content,
    { type: 'toolCall', id: 'file', name: 'read', arguments: { path: 'synthetic business file' } }] };
  const pending = noteCall('pending', undefined), file = tool('file', 'read');
  const messages = [computerOnly, tool('a'), tool('b'), mixed, tool('c'), file, pending];
  const history = new ComputerImageHistory(0, undefined, [], { workingMemoryCalls: 15 });
  assert.equal(images(history.nextRequest(messages)), 4, 'image TTL zero keeps all images in the young computer pairs');
  for (let request = 2; request <= 15; request++) history.nextRequest(messages);
  const projected = history.nextRequest(messages), text = JSON.stringify(projected);
  assert.equal(images(projected), 1, 'old computer pair images leave with the text; the file image remains');
  assert.ok(!text.includes('computer-only')); assert.ok(!text.includes('"toolCallId":"a"')); assert.ok(!text.includes('"id":"c"'));
  assert.ok(text.includes('mixed thinking')); assert.ok(text.includes('synthetic business file')); assert.ok(projected.includes(file));
  assert.ok(text.includes('"id":"pending"'), 'an incomplete tool call is not split from a future result');
  assert.equal(history.snapshot().computerCalls?.length, 0);
});

test('working-memory restore preserves request ages and conservatively removes old completed pairs without a valid clock', () => {
  const call = noteCall('old-pair', 'Current bounded note', 1), result = tool('old-pair'), file = tool('file', 'read');
  const messages = [call, result, file], history = new ComputerImageHistory(0, undefined, [], { workingMemoryCalls: 15 });
  for (let request = 1; request <= 15; request++) history.nextRequest(messages);
  const restored = new ComputerImageHistory(0, history.snapshot(), messages, { workingMemoryCalls: 15 });
  assert.equal(images(restored.nextRequest(messages)), 1); assert.equal(restored.snapshot().stateNote, 'Current bounded note');
  assert.ok(JSON.stringify(restored.project(messages)).includes('[stale; refresh required]'));
  for (const saved of [undefined, { version: 1, requestCount: 'corrupt', visible: [] }]) {
    const legacy = new ComputerImageHistory(0, saved, messages, { workingMemoryCalls: 15 });
    const fresh = noteCall('fresh-pair', undefined), freshResult = tool('fresh-pair');
    const projected = legacy.nextRequest([...messages, fresh, freshResult]);
    assert.equal(images(projected), 2); assert.ok(!JSON.stringify(projected).includes('"toolCallId":"old-pair"'));
    assert.ok(projected.includes(file));
  }
  const unlimited = new ComputerImageHistory(0, undefined, [], { workingMemoryCalls: 0 });
  assert.equal(unlimited.nextRequest(messages), messages);
});

test('working-memory compaction drops old computer spans, preserves quoted user data and keeps the current note once', async () => {
  const pi = await import('@earendil-works/pi-coding-agent');
  const old = noteCall('old', 'Current snapshot', 1), result = tool('old');
  const user = { role: 'user', content: [{ type: 'text', text: 'Exact user quote: computer({stateNote: "literal"}); retain this.' }], timestamp: 1 };
  const source = [user, old, result], history = new ComputerImageHistory(0, undefined, [], { workingMemoryCalls: 15 });
  for (let request = 1; request <= 15; request++) history.nextRequest(source);
  const serialize = (message: unknown) => pi.serializeConversation(pi.convertToLlm([message as Parameters<typeof pi.convertToLlm>[0][number]]));
  const context = [{ role: 'system', content: 'You are a context summarization assistant. Synthetic test.', timestamp: 1 },
    { role: 'user', content: [{ type: 'text', text: `<conversation>\n${source.map(serialize).join('\n\n')}\n</conversation>` }], timestamp: 1 }];
  const projected = history.projectSummary(history.nextRequest(context), source, serialize), text = JSON.stringify(projected);
  assert.equal(text.split(COMPUTER_STATE_NOTE).length - 1, 1); assert.equal(text.split(COMPUTER_WORKING_MEMORY_REFRESH).length - 1, 1);
  assert.ok(text.includes('Exact user quote')); assert.ok(text.includes('retain this.'));
  assert.ok(!text.includes('frame-old')); assert.ok(!text.includes('Observed exact value'));
  assert.equal(text.split('Current snapshot').length - 1, 1);
  assert.ok(computerImageHistoryInstructions(0, 15).includes('last 15 model requests'));
});
