import assert from 'node:assert/strict';
import test from 'node:test';
import { toSpokenReply } from '../src/shared/spoken-reply';
import { toSpokenText } from '../src/shared/spoken-text';

test('ordinary short answers retain their complete result and qualification', () => {
  const answer = '**Die CLI ist nicht aktuell:** Installiert ist **1.23.0**, verfügbar ist **1.24.0**.\n\nOb für die Desktop-App ein Update angeboten wird, konnte ich nicht feststellen. Ich habe nichts aktualisiert.';
  assert.equal(toSpokenReply(answer), toSpokenText(answer));
  assert.ok(toSpokenReply(answer).includes('nicht feststellen'));
});

test('the complete-answer threshold uses spoken content rather than long Markdown link targets', () => {
  const answer = `Die Version ist aktuell. [Offizielle Quelle](https://example.org/${'source/'.repeat(300)}) bestätigt das. Es wurde nichts geändert.`;
  assert.ok(answer.length > 1200);
  assert.equal(toSpokenReply(answer), 'Die Version ist aktuell. Offizielle Quelle bestätigt das. Es wurde nichts geändert.');
});

test('451 through 500 spoken characters are accepted unchanged without the former 450-character cliff', () => {
  const answer = 'Die Prüfung ist abgeschlossen. ' + 'Weitere belegte Angaben. '.repeat(18);
  assert.ok(answer.trim().length > 450 && answer.trim().length <= 500);
  assert.equal(toSpokenReply(answer), answer.trim());
  assert.equal(toSpokenReply('a'.repeat(500)), 'a'.repeat(500));
});

test('long replies speak the result and uncertainty before an optional details pointer', () => {
  const answer = 'Die CLI ist nicht aktuell: installiert ist 1.23.0, verfügbar ist 1.24.0. Für die Desktop-App konnte ich kein Update bestätigen. Ich habe nichts geändert.\n\n' + 'Ein weiterer geprüfter Hintergrundpunkt. '.repeat(60);
  const spoken = toSpokenReply(answer);
  assert.ok(spoken.startsWith('Die CLI ist nicht aktuell: installiert ist 1.23.0, verfügbar ist 1.24.0.'));
  assert.ok(spoken.includes('Für die Desktop-App konnte ich kein Update bestätigen.'));
  assert.ok(spoken.includes('Ich habe nichts geändert.'));
  assert.ok(spoken.length < 700);
  assert.ok(!spoken.includes('Ein weiterer geprüfter Hintergrundpunkt'));
});

test('a standalone heading or generic introduction does not replace the actual outcome', () => {
  const answer = '# Prüfergebnis\n\nIch habe die Angaben geprüft.\n\nDie Installation ist nicht aktuell. Ein Update wurde nicht durchgeführt.\n\n' + 'Die ausführlichen Hintergrundinformationen folgen hier. '.repeat(40);
  const spoken = toSpokenReply(answer);
  assert.ok(spoken.startsWith('Prüfergebnis: Die Installation ist nicht aktuell.'));
  assert.ok(spoken.includes('Ein Update wurde nicht durchgeführt.'));
  assert.ok(!spoken.includes('Ich habe die Angaben geprüft.'));
});

test('a model-authored sentence inside the technical margin retains its final negation', () => {
  const sentence = 'Die ausführliche Prüfung von ' + 'mehreren dokumentierten Einzelpunkten '.repeat(11) + 'belegt den behaupteten Erfolg nicht.';
  const spoken = toSpokenReply(sentence);
  assert.ok(sentence.length > 450 && sentence.length <= 500);
  assert.equal(spoken, sentence);
  assert.ok(spoken.includes('Erfolg nicht.'));
  assert.ok(spoken.length <= 500);
});

test('fenced code and tool-like JSON are not read aloud or chosen over the result', () => {
  const answer = '# Ergebnis\n\n```json\n{"secretLookingToolData":"' + 'do-not-read '.repeat(200) + '"}\n```\n\nDie Datei wurde gespeichert und geprüft.\n\n' + 'Weitere Prüfergebnisse. '.repeat(80);
  const spoken = toSpokenReply(answer);
  assert.ok(spoken.includes('Die Datei wurde gespeichert und geprüft.'));
  assert.ok(!spoken.includes('secretLookingToolData'));
  assert.ok(!spoken.includes('do-not-read'));
});

test('ordinary tables retain their value labels instead of speaking Markdown separators', () => {
  const spoken = toSpokenReply('| Komponente | Installiert | Verfügbar |\n| --- | --- | --- |\n| CLI | 1.23.0 | 1.24.0 |\n\nDie Desktop-App konnte nicht geprüft werden.');
  assert.ok(spoken.includes('Komponente: CLI; Installiert: 1.23.0; Verfügbar: 1.24.0.'));
  assert.ok(spoken.includes('Die Desktop-App konnte nicht geprüft werden.'));
  assert.ok(!spoken.includes('|'));
});

test('an extreme unsplittable answer is marked as an excerpt within the technical budget', () => {
  const spoken = toSpokenReply('Ein sehr langer ungeteilter Abschnitt ' + 'ohne Satzende '.repeat(250));
  assert.ok(spoken.startsWith('Ein sehr langer ungeteilter Abschnitt'));
  assert.ok(spoken.includes('…'));
  assert.ok(spoken.length <= 500);
  assert.ok((('T'.repeat(160) + ': ' + spoken).length) < 2000);
  assert.ok(!/[\uD800-\uDFFF]/u.test(toSpokenReply('😀'.repeat(2000))));
});

test('empty input remains silent and short code output retains only its safe pointer', () => {
  assert.equal(toSpokenReply(' \n\t '), '');
  assert.equal(toSpokenReply('```ts\nconst toolData = true;\n```'), 'Der Code steht im Gespräch.');
});
