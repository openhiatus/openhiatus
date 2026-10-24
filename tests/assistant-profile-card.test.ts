import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssistantProfileCard } from '../src/renderer/features/settings/assistant-profile-card';
import { BUILTIN_PERSONALITIES, DEFAULT_ASSISTANT_PROFILE, type AssistantProfile } from '../src/shared/assistant-profile';

function render(profile: AssistantProfile = DEFAULT_ASSISTANT_PROFILE, ready = true) {
  const calls: unknown[] = [];
  const html = renderToStaticMarkup(createElement(AssistantProfileCard, {
    profile, ready, onSave: async value => { calls.push(value); }, onError: error => { calls.push(error); },
  }));
  assert.deepEqual(calls, [], 'Rendering must not save, report errors or start other work');
  return html;
}
const button = (html: string, text: string) => html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)!.find(markup => markup.includes(` ${text}</button>`))!;

test('the profile card exposes an independent optional name, four standard personalities and bounded editing fields', () => {
  const html = render();
  assert.match(html, /Name &amp; Persönlichkeit/);
  assert.match(html, /<label[^>]*>Rufname<\/label>/);
  assert.match(html, /maxLength="60" placeholder="Assistent"/);
  assert.match(html, /Die Anwendung heißt weiterhin openHiatus/);
  assert.equal((html.match(/<option /g) ?? []).length, 4);
  for (const personality of BUILTIN_PERSONALITIES) assert.ok(html.includes(`value="${personality.id}"`));
  assert.match(html, /value="balanced" selected=""/);
  assert.match(html, /<label[^>]*>Vorlagenname<\/label>/);
  assert.match(html, /<label[^>]*>Stilbeschreibung<\/label>/);
  assert.match(html, /<textarea[^>]*maxLength="2000"/);
  assert.match(html, /Standardvorlagen bleiben erhalten/);
  assert.match(button(html, 'Löschen'), /disabled=""/);
  assert.doesNotMatch(button(html, 'Als neue Vorlage speichern'), /disabled=""/);
});

test('a custom personality retains its own name and text while the assistant name stays separate', () => {
  const html = render({ name: 'Nova', personalityId: 'custom-synthetic', templates: [
    { id: 'custom-synthetic', label: 'Werkstatt', instructions: 'Antworte präzise & freundlich.\nErkläre wichtige Annahmen.' },
  ] });
  assert.match(html, /placeholder="Assistent"[^>]*value="Nova"/);
  assert.match(html, /value="custom-synthetic" selected=""[^>]*>Werkstatt/);
  assert.match(html, /value="Werkstatt"/);
  assert.match(html, /Antworte präzise &amp; freundlich\.\nErkläre wichtige Annahmen\./);
  assert.match(html, /Speichern aktualisiert diese eigene Vorlage/);
  assert.doesNotMatch(button(html, 'Löschen'), /disabled=""/);
});

test('a full template collection permits editing and deletion while preventing another saved copy', () => {
  const templates = Array.from({ length: 12 }, (_, index) => ({ id: `custom-${index}`, label: `Vorlage ${index}`, instructions: 'Kurz und freundlich.' }));
  const html = render({ name: 'Nova', personalityId: templates[0].id, templates });
  assert.match(html, /12 \/ 12 eigene Vorlagen/);
  assert.match(html, /Alle 12 Plätze sind belegt/);
  assert.match(button(html, 'Als neue Vorlage speichern'), /disabled=""/);
  assert.doesNotMatch(button(html, 'Löschen'), /disabled=""/);
});

test('before the first snapshot arrives all profile editing is unavailable', () => {
  const html = render(DEFAULT_ASSISTANT_PROFILE, false);
  assert.match(html, /<fieldset class="assistant-profile-fields" disabled="">/);
  for (const label of ['Speichern', 'Als neue Vorlage speichern', 'Löschen']) assert.match(button(html, label), /disabled=""/);
});
