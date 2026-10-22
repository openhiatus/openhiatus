import assert from 'node:assert/strict';
import test from 'node:test';
import { toSpokenText } from '../src/shared/spoken-text';

test('speech reads spaced Windows file links by their meaningful label', () => {
  const message = 'Erstellt: [Sprachdemo](</C:/Users/Example/AppData/Roaming/openhiatus/Demo-Arbeitsbereich/Sprachdemo>). Öffne [Aufgaben](<C:\\Demo Ordner\\aufgaben.md>).';
  assert.equal(toSpokenText(message), 'Erstellt: Sprachdemo. Öffne Aufgaben.');
});

test('speech keeps website link labels without reading targets', () => {
  assert.equal(toSpokenText('Die [Dokumentation](https://example.org/docs?q=1) erklärt es. Siehe [Abschnitt](https://example.org/docs_(neu)).'), 'Die Dokumentation erklärt es. Siehe Abschnitt.');
});

test('fenced code is replaced by a brief spoken pointer while German prose stays intact', () => {
  assert.equal(toSpokenText('Fertig für Grüße und Spaß.\n```ts\nconst geheim = "nicht vorlesen";\n```\nÄnderungen geprüft.'), 'Fertig für Grüße und Spaß.\n\nDer Code steht im Gespräch.\n\nÄnderungen geprüft.');
  assert.equal(toSpokenText('```inline code```'), 'Der Code steht im Gespräch.');
});

test('inline markup, headings and checklists become readable prose', () => {
  assert.equal(toSpokenText('## Überblick\n- [x] **Äpfel** und *Öl* gekauft.\n- `aufgaben.md` für Grüße geändert.\n> __Fertig!__'), 'Überblick\nÄpfel und Öl gekauft.\naufgaben.md für Grüße geändert.\nFertig!');
});

test('ordinary German text and non-Markdown underscores remain intact', () => {
  const text = 'Fünf größere Änderungen, 3 × 5 = 15. Die Datei heißt demo_notizen.md!';
  assert.equal(toSpokenText(text), text);
});
