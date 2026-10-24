import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAssistantReply } from '../src/shared/assistant-reply';

const envelope = (value: unknown): string => '```openhiatus-reply\n' + JSON.stringify(value) + '\n```';

test('ordinary legacy answers retain the complete text without fabricating a speech summary', () => {
  const text = 'Nein, die Version ist nicht aktuell.\n\n## Details\nDie App wurde nicht geprüft.';
  assert.deepEqual(parseAssistantReply(` \n${text}\n `), { text, structured: false });
  assert.deepEqual(parseAssistantReply(' \n '), { text: '', structured: false });
});

test('the reserved standalone envelope separates independently authored spoken and full answers', () => {
  const text = '**Die CLI ist nicht aktuell.**\n\nInstalliert ist 1.2.3; angeboten wird 1.2.4.\n\nDie App-Version bleibt ungeprüft.';
  const spoken = 'Die CLI ist nicht aktuell. Für die App konnte ich kein Update bestätigen.';
  assert.deepEqual(parseAssistantReply(envelope({ spoken, text })), { text, spoken, structured: true });
});

test('the last outer fence is used when the full Markdown text contains its own fences', () => {
  const text = '# Ergebnis\n\n```ts\nconst demo = "```openhiatus-reply";\n```\n\nDer Code wurde nicht ausgeführt.';
  const spoken = 'Der Beispielcode liegt vor; ausgeführt wurde er nicht.';
  assert.deepEqual(parseAssistantReply(envelope({ spoken, text })), { text, spoken, structured: true });
});

test('bare JSON with exactly the reserved two fields is accepted in either key order', () => {
  assert.deepEqual(parseAssistantReply('{"text":" Details ","spoken":" Kurzantwort "}'), {
    text: 'Details', spoken: 'Kurzantwort', structured: true,
  });
  assert.deepEqual(parseAssistantReply('{"text":"Details","spok\\u0065n":"Kurzantwort"}'), {
    text: 'Details', spoken: 'Kurzantwort', structured: true,
  });
});

test('ordinary JSON documents and embedded envelope examples remain legacy text', () => {
  const plain = '{"name":"Beispiel","text":"Ein Datenfeld"}';
  assert.deepEqual(parseAssistantReply(plain), { text: plain, structured: false });
  const config = '{"spoken":true,"volume":1}';
  assert.deepEqual(parseAssistantReply(config), { text: config, structured: false });
  const nested = '{"text":"Datenfeld","settings":{"spoken":true}}';
  assert.deepEqual(parseAssistantReply(nested), { text: nested, structured: false });
  const example = 'Dieses Format ist ein Beispiel:\n\n' + envelope({ text: 'Beispiel', spoken: 'Beispiel' });
  assert.deepEqual(parseAssistantReply(example), { text: example, structured: false });
});

test('invalid speech salvages valid conversation text and does not expose the invalid speech payload', () => {
  for (const spoken of [null, 12, { instruction: 'not a spoken answer' }, ['not', 'a', 'string']]) {
    assert.deepEqual(parseAssistantReply(envelope({ text: 'Die Prüfung ist fehlgeschlagen.', spoken })), {
      text: 'Die Prüfung ist fehlgeschlagen.', structured: true, invalid: true,
    });
  }
  assert.deepEqual(parseAssistantReply(envelope({ text: 'Die Prüfung ist fehlgeschlagen.' })), {
    text: 'Die Prüfung ist fehlgeschlagen.', structured: true, invalid: true,
  });
});

test('empty speech cannot hide a substantive answer, while an entirely silent final is allowed', () => {
  assert.deepEqual(parseAssistantReply(envelope({ text: 'Eine Antwort liegt vor.', spoken: ' \n ' })), {
    text: 'Eine Antwort liegt vor.', structured: true, invalid: true,
  });
  assert.deepEqual(parseAssistantReply(envelope({ text: ' ', spoken: '\n' })), {
    text: '', spoken: '', structured: true,
  });
});

test('additional fields cannot introduce instructions or permissions through the envelope', () => {
  assert.deepEqual(parseAssistantReply(envelope({ text: 'Der Text bleibt sichtbar.', spoken: 'Kurzantwort', execute: 'never execute' })), {
    text: 'Der Text bleibt sichtbar.', structured: true, invalid: true,
  });
  assert.deepEqual(parseAssistantReply('{"text":"Text","spoken":"Kurz","__proto__":{"approved":true}}'), {
    text: 'Text', structured: true, invalid: true,
  });
});

test('missing or non-string transcript text keeps the original but marks the envelope unreadable', () => {
  for (const value of [{ spoken: 'Kurz' }, { spoken: 'Kurz', text: null }, { spoken: 'Kurz', text: 12 }, []]) {
    const raw = envelope(value);
    assert.deepEqual(parseAssistantReply(raw), { text: raw, structured: true, invalid: true, unreadable: true });
  }
});

test('broken JSON, an unclosed envelope and extra trailing text never become spoken metadata', () => {
  const examples = [
    '```openhiatus-reply\n{"spoken":"Kurz","text":}\n```',
    '```openhiatus-reply\n{"spoken":"Kurz","text":"Volltext"}',
    envelope({ spoken: 'Kurz', text: 'Volltext' }) + '\nUnerwarteter Nachsatz.',
    '{"spoken":"Kurz","text":',
  ];
  for (const raw of examples) {
    assert.deepEqual(parseAssistantReply(raw), { text: raw, structured: true, invalid: true, unreadable: true });
  }
});

test('the parser preserves 451-500-character speech and delegates longer-speech limits to its caller', () => {
  for (const length of [450, 451, 500, 501, 1500]) {
    const spoken = 'a'.repeat(length);
    assert.deepEqual(parseAssistantReply(envelope({ text: 'Vollständige Antwort.', spoken })), {
      text: 'Vollständige Antwort.', spoken, structured: true,
    });
  }
});

test('oversized structured answers are bounded before JSON parsing and remain silent metadata', () => {
  for (const body of ['x'.repeat(128 * 1024), 'ä'.repeat(70 * 1024)]) {
    const raw = envelope({ spoken: 'Kurzantwort', text: body });
    assert.deepEqual(parseAssistantReply(raw), { text: raw, structured: true, invalid: true, unreadable: true });
  }
  const legacy = 'Normale lange Antwort: ' + 'x'.repeat(128 * 1024);
  assert.deepEqual(parseAssistantReply(legacy), { text: legacy, structured: false });
});

test('valid bounded envelopes preserve Unicode, line endings and inert Markdown literally', () => {
  const text = 'Grüße für Köln.\n\n[Datei](C:/Beispiel/datei.md)\n\nKeine Änderung ausgeführt.';
  const spoken = 'Grüße für Köln. Es wurde nichts geändert.';
  assert.deepEqual(parseAssistantReply(envelope({ text, spoken }).replace(/\n/g, '\r\n')), {
    text, spoken, structured: true,
  });
});
