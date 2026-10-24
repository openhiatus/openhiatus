import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkspaceShell } from '../src/renderer/features/navigation/workspace-shell';
import { isSidebarCollapsed } from '../src/renderer/features/navigation/sidebar-layout';
import { presenceDiameter } from '../src/renderer/presence-size';
import { snapshotFixture } from './ipc-fixtures';

test('automatic navigation follows available room while either manual choice wins', () => {
  assert.equal(isSidebarCollapsed(undefined, true), true);
  assert.equal(isSidebarCollapsed('auto', false), false);
  assert.equal(isSidebarCollapsed('expanded', true), false);
  assert.equal(isSidebarCollapsed('collapsed', false), true);
});

test('the compact rail retains named destinations, state, controls and a way back to automatic sizing', () => {
  const state = snapshotFixture(); state.preferences.sidebarMode = 'collapsed';
  const html = renderToStaticMarkup(createElement(WorkspaceShell, {
    state, view: 'chat', ready: false, speechReady: false, newConversationDisabled: false,
    onNavigate: () => {}, onNewConversation: () => {}, onStop: async () => {}, onError: () => {}, children: 'Inhalt',
  }));
  assert.match(html, /workspace-shell sidebar-collapsed/);
  for (const label of ['Gespräch', 'Aufgaben', 'Dienste', 'Gedächtnis', 'Skills', 'Einstellungen', 'Neues Gespräch', 'Arbeitsordner öffnen']) {
    assert.ok(html.includes(`aria-label="${label}"`), `Compact navigation must retain an accessible name: ${label}`);
  }
  assert.match(html, /aria-current="page"/);
  assert.match(html, /aria-expanded="false" aria-controls="workspace-sidebar" aria-label="Navigation ausklappen"/);
  assert.match(html, /aria-label="Navigation automatisch anpassen"/);
  assert.doesNotMatch(html, /Gedächtnis &amp; Identität/);
});

test('the central symbol responds to each stage dimension and remains bounded at extreme sizes', () => {
  assert.ok(presenceDiameter(1100, 650) > presenceDiameter(600, 650), 'Width changes should affect the symbol');
  assert.ok(presenceDiameter(1100, 650) > presenceDiameter(1100, 300), 'Height changes should affect the symbol');
  assert.ok(presenceDiameter(310, 240) < 110, 'A small stage must leave room for speech controls');
  assert.ok(presenceDiameter(4000, 2000) <= 240, 'Large windows must not produce an excessive symbol');
  assert.ok(presenceDiameter(0, 0) >= 64, 'Hidden views need a stable minimum until they become visible');
});
