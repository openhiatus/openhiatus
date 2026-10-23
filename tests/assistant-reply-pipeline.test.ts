import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMemoryReply } from '../src/main/instructions';
import { toSpokenAssistantReply } from '../src/shared/spoken-reply';

const envelope = (spoken: unknown, text: string) => '```openhiatus-reply\n' + JSON.stringify({ spoken, text }) + '\n```';
const proposal = '```openhiatus-memory-proposal\n' + JSON.stringify({ documentId: 'core', baseVersion: 1, content: 'Neue nutzergewünschte Vorliebe.', reason: 'Ausdrücklicher Nutzerwunsch.' }) + '\n```';

test('structured speech and a separate final memory proposal retain independent roles', () => {
  const parsed = parseMemoryReply(envelope('Der Vorschlag wartet auf deine Freigabe.', 'Die Änderung wurde vorgeschlagen, aber noch nicht übernommen.') + '\n\n' + proposal);
  assert.equal(parsed.spoken, 'Der Vorschlag wartet auf deine Freigabe.');
  assert.equal(parsed.text, 'Die Änderung wurde vorgeschlagen, aber noch nicht übernommen.');
  assert.equal(parsed.proposals.length, 1);
  assert.equal(parsed.proposals[0].documentId, 'core');
  assert.deepEqual(parsed.errors, []);
});

test('a quoted proposal inside the written field remains text rather than becoming an actionable proposal', () => {
  const text = `Hier ist ein Beispiel, keine beantragte Änderung:\n\n${proposal}`;
  const parsed = parseMemoryReply(envelope('Das ist ein unverbindliches Beispiel.', text));
  assert.equal(parsed.text, text);
  assert.deepEqual(parsed.proposals, []);
  assert.deepEqual(parsed.errors, []);
});

test('speech over the technical budget shortens without a format error or loss of the written answer', () => {
  const text = 'Der vollständige Bericht bleibt erhalten.';
  const parsed = parseMemoryReply(envelope('Ein Ergebnis ist noch nicht bestätigt. '.repeat(20), text));
  assert.equal(parsed.text, text);
  assert.deepEqual(parsed.errors, []);
  const spoken = toSpokenAssistantReply(parsed);
  assert.ok(spoken.startsWith('Ein Ergebnis ist noch nicht bestätigt.'));
  assert.ok(spoken.length <= 500);
});

test('invalid speech metadata preserves valid written text and uses a compatible spoken fallback', () => {
  const parsed = parseMemoryReply(envelope({ invalid: true }, 'Die Prüfung ist noch nicht abgeschlossen.'));
  assert.equal(parsed.text, 'Die Prüfung ist noch nicht abgeschlossen.');
  assert.equal(parsed.errors.length, 1);
  assert.equal(toSpokenAssistantReply(parsed), parsed.text);
});

test('unreadable structured output is retained for inspection and its raw metadata is never spoken', () => {
  const raw = '```openhiatus-reply\n{"spoken":invalid-json}\n```';
  const parsed = parseMemoryReply(raw);
  assert.equal(parsed.text, raw);
  assert.equal(parsed.errors.length, 1);
  const spoken = toSpokenAssistantReply(parsed);
  assert.ok(spoken.includes('nicht vollständig aufbereitet'));
  assert.ok(!spoken.includes('invalid-json') && !spoken.includes('openhiatus-reply'));
});
