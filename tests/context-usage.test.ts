import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contextFill, formatTokens } from '../src/shared/context-usage';

const at = '2026-10-20T12:00:00.000Z';

test('context fill is relative to the reported window and only for the current thread', () => {
  assert.deepEqual(contextFill(undefined, 'thread-a'), { fresh: true, usedTokens: 0, level: 'ok' });
  assert.equal(contextFill({ threadId: 'thread-a', usedTokens: 50_000, windowTokens: 100_000, at }, undefined).fresh, true, 'a new conversation starts empty');
  assert.equal(contextFill({ threadId: 'thread-a', usedTokens: 50_000, windowTokens: 100_000, at }, 'thread-b').fresh, true, 'an older thread does not count');
  assert.deepEqual(contextFill({ threadId: 'thread-a', usedTokens: 30_000, windowTokens: 128_000, at }, 'thread-a'),
    { fresh: false, usedTokens: 30_000, windowTokens: 128_000, percent: 23, level: 'ok' });
  assert.equal(contextFill({ threadId: 'a', usedTokens: 70_000, windowTokens: 100_000, at }, 'a').level, 'warn');
  assert.equal(contextFill({ threadId: 'a', usedTokens: 90_000, windowTokens: 100_000, at }, 'a').level, 'full');
  assert.equal(contextFill({ threadId: 'a', usedTokens: 140_000, windowTokens: 100_000, at }, 'a').percent, 100);
  const unknown = contextFill({ threadId: 'a', usedTokens: 12_000, at }, 'a');
  assert.equal(unknown.percent, undefined); assert.equal(unknown.level, 'ok'); assert.equal(unknown.fresh, false);
});

test('token counts read naturally in German', () => {
  assert.equal(formatTokens(840), '840');
  assert.equal(formatTokens(1_250), '1,3 k');
  assert.equal(formatTokens(30_400), '30 k');
  assert.equal(formatTokens(272_000), '272 k');
});
