import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessageBody } from '../src/renderer/App';

test('local Markdown links render as filename buttons without leaking raw path syntax', () => {
  const markup = renderToStaticMarkup(createElement(MessageBody, { text: 'Erstellt: [Sprachdemo](</C:/Users/Example/openhiatus/Sprachdemo>).', onError: () => {} }));
  assert.match(markup, /<button[^>]*message-file-link/);
  assert.match(markup, /Sprachdemo/);
  assert.ok(!markup.includes('/C:/'));
  assert.ok(!markup.includes('[Sprachdemo]'));
});

test('web and unknown-protocol links remain text, never browser navigation', () => {
  const markup = renderToStaticMarkup(createElement(MessageBody, { text: '[Web](https://example.org) und [Unbekannt](custom:payload)', onError: () => {} }));
  assert.ok(markup.includes('https://example.org'));
  assert.ok(markup.includes('custom:payload'));
  assert.ok(!markup.includes('<a '));
  assert.ok(!markup.includes('<button'));
});

test('literal code containing link syntax does not create interactive controls', () => {
  const markup = renderToStaticMarkup(createElement(MessageBody, { text: '`[Datei](aufgaben.md)`\n```md\n[Datei](aufgaben.md)\n```', onError: () => {} }));
  assert.ok(!markup.includes('<button'));
  assert.ok(markup.includes('<code>'));
});
