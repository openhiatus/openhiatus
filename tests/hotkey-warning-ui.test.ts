import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HotkeyWarning } from '../src/renderer/HotkeyWarning';

const render = (hotkeys?: Parameters<typeof HotkeyWarning>[0]['hotkeys']) => renderToStaticMarkup(createElement(HotkeyWarning, { hotkeys }));

test('unknown or registered hotkeys never imply a conflict', () => {
  assert.equal(render(), '');
  assert.equal(render({ recording: true, submit: true, stop: true }), '');
});

test('recording and submit conflicts explain how to use the current window and recover registration', () => {
  const html = render({ recording: false, submit: false, stop: true });
  assert.match(html, /F8 · F9 sind systemweit nicht verfügbar/);
  assert.match(html, /Möglicherweise belegt/);
  assert.match(html, /ein anderes Programm/);
  assert.match(html, /starte openHiatus neu/);
  assert.match(html, /Sprechen und Senden funktionieren über die Schaltflächen/);
  assert.doesNotMatch(html, /Strg \+ Alt \+ F12/);
});

test('a stop-only conflict does not claim that speech shortcuts are blocked', () => {
  const html = render({ recording: true, submit: true, stop: false });
  assert.match(html, /Strg \+ Alt \+ F12 ist systemweit nicht verfügbar/);
  assert.match(html, /Mit Stopp oder Esc im openHiatus-Fenster/);
  assert.doesNotMatch(html, /F8|F9|Sprechen und Senden/);
});
