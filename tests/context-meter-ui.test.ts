import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContextMeter } from '../src/renderer/ContextMeter';

const render = (props: Parameters<typeof ContextMeter>[0]) => renderToStaticMarkup(createElement(ContextMeter, props));

test('only an empty conversation without an active session is labelled fresh', () => {
  const empty = render({});
  assert.match(empty, /Frisches Gespräch/);
  assert.match(empty, /0 %/);
  for (const props of [{ hasConversation: true }, { threadId: 'active-thread' }]) {
    const pending = render(props);
    assert.match(pending, /Kontextverbrauch noch nicht gemeldet/);
    assert.doesNotMatch(pending, /Frisches Gespräch|0 %|aria-valuenow/);
  }
});

test('history with no matching measurement stays unknown instead of reusing another session', () => {
  const html = render({ threadId: 'current', hasConversation: true, context: { threadId: 'old', usedTokens: 45_000, windowTokens: 128_000, at: '2026-10-20T12:00:00Z' } });
  assert.match(html, /Kontextverbrauch noch nicht gemeldet/);
  assert.doesNotMatch(html, /45 k|Frisches Gespräch|0 %/);
});

test('small measured contexts show a nonzero indicator and the actual reported token count', () => {
  const html = render({ threadId: 'current', hasConversation: true, context: { threadId: 'current', usedTokens: 500, windowTokens: 128_000, at: '2026-10-20T12:00:00Z' } });
  assert.match(html, /&lt;1 %/);
  assert.match(html, /500 von 128 k Token/);
  assert.doesNotMatch(html, /Frisches Gespräch|nicht gemeldet/);
});
