import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantDisplayName, assistantProfileInstructions, BUILTIN_PERSONALITIES, DEFAULT_ASSISTANT_IDENTITY, DEFAULT_ASSISTANT_PROFILE, parseAssistantProfile, profileIdentityContent, resolvePersonality } from '../src/shared/assistant-profile';

const custom = { name: 'Mira', personalityId: 'custom-office', templates: [{ id: 'custom-office', label: 'Im Büro', instructions: 'Klar und ruhig. Trockener Humor ist willkommen.' }] };

test('four distinct builtins and custom styles preserve an independent call name', () => {
  assert.equal(new Set(BUILTIN_PERSONALITIES.map(template => template.id)).size, 4);
  for (const template of BUILTIN_PERSONALITIES) {
    const profile = parseAssistantProfile({ name: 'Mira', personalityId: template.id, templates: [] });
    assert.equal(assistantDisplayName(profile), 'Mira'); assert.equal(resolvePersonality(profile).id, template.id);
  }
  const profile = parseAssistantProfile(custom);
  assert.deepEqual(profile, custom); assert.equal(resolvePersonality(profile).label, 'Im Büro');
  profile.templates[0].instructions = 'A changed copy'; assert.notEqual(profile.templates[0].instructions, custom.templates[0].instructions);
  assert.equal(assistantDisplayName(), 'Assistent'); assert.equal(assistantDisplayName(DEFAULT_ASSISTANT_PROFILE), 'Assistent');
  assert.equal(parseAssistantProfile({ ...custom, name: ' Mira ' }).name, 'Mira');
});

test('profile validation bounds names, template text, references and the custom collection', () => {
  const invalid = [null, {}, { ...custom, name: 'x'.repeat(61) }, { ...custom, name: 'Two\nNames' }, { ...custom, extra: 'unknown' },
    { ...custom, personalityId: 'unknown' }, { ...custom, templates: null }, { ...custom, templates: new Array(1) },
    { ...custom, templates: [...custom.templates, custom.templates[0]] },
    { ...custom, templates: [{ ...custom.templates[0], id: 'balanced' }] },
    { ...custom, templates: [{ ...custom.templates[0], label: '' }] },
    { ...custom, templates: [{ ...custom.templates[0], instructions: 'x'.repeat(2001) }] },
    { ...custom, templates: [{ ...custom.templates[0], instructions: '\u0000' }] },
    { ...custom, templates: [{ ...custom.templates[0], credential: 'unknown' }] },
    { ...custom, templates: Array.from({ length: 13 }, (_, index) => ({ id: `custom-${index}`, label: `Test ${index}`, instructions: 'A style' })) },
  ];
  for (const value of invalid) assert.throws(() => parseAssistantProfile(value));
  assert.throws(() => parseAssistantProfile({ ...custom, templates: [custom.templates[0], { ...custom.templates[0], id: 'custom-other', label: 'IM BÜRO' }] }));
});

test('the profile prompt separates the application brand from the call name and includes the selected style', () => {
  const prompt = assistantProfileInstructions(custom);
  assert.ok(prompt.includes('Mira')); assert.ok(prompt.includes(custom.templates[0].instructions));
  assert.match(prompt, /openHiatus ist der Name der Anwendung und Organisation/);
  assert.match(prompt, /Alte Identitätstexte/); assert.match(prompt, /spoken und text/);
  assert.match(prompt, /verändert keine Werkzeuge, Rechte, Stopp-Regeln/);
  assert.ok(!assistantProfileInstructions().includes('Mira'));
});

test('known legacy identity defaults lose their forced tone only in the prompt projection', () => {
  const legacy = 'Du bist openHiatus, ein hilfreicher deutschsprachiger Assistent. Sprich klar, freundlich und ehrlich. Benenne Unsicherheit und bestätige Ergebnisse nur, wenn sie tatsächlich vorliegen. Respektiere die Entscheidungen des Nutzers.';
  const document = { id: 'identity', version: 2, content: legacy };
  assert.equal(profileIdentityContent(document.content), DEFAULT_ASSISTANT_IDENTITY);
  assert.equal(document.content, legacy); assert.equal(document.version, 2);
  const manual = 'Mein Rufname ist Mika. Ich liebe Wortspiele. Sprich klar, freundlich und ehrlich.';
  assert.equal(profileIdentityContent(manual), manual, 'manual identity data is never filtered by a broad friendliness regex');
  assert.equal(profileIdentityContent(DEFAULT_ASSISTANT_IDENTITY), DEFAULT_ASSISTANT_IDENTITY);
});
