import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { UI_LANGUAGES, parseUiLanguage, resolveUiLanguage } from '../src/shared/ui-language';
import { messageCatalog, TRANSLATION_LANGUAGES, translate, setUiLanguage, localized, numberFormatter } from '../src/shared/i18n';
import { initialUiLanguage } from '../src/main/windows-language';
import { StateStore, defaultState } from '../src/main/storage';
import { decodeSnapshot } from '../src/shared/ipc';
import { snapshotFixture } from './ipc-fixtures';

test('seven strict language values roundtrip IPC, while OS locales map to supported variants', () => {
  for (const { id } of UI_LANGUAGES) {
    assert.equal(parseUiLanguage(id), id);
    const snapshot = snapshotFixture(); snapshot.preferences.uiLanguage = id;
    assert.equal(decodeSnapshot(snapshot).preferences.uiLanguage, id);
  }
  for (const invalid of [null, undefined, '', 'en-US', 'zh', 'pt', '__proto__', 1, {}]) assert.throws(() => parseUiLanguage(invalid));
  const snapshot = snapshotFixture(); Object.assign(snapshot.preferences, { uiLanguage: 'invalid' });
  assert.throws(() => decodeSnapshot(snapshot));
  for (const [os, expected] of [['de-AT', 'de'], ['en-GB', 'en'], ['es-MX', 'es'], ['fr-CA', 'fr'], ['zh-TW', 'zh-CN'], ['ja-JP', 'ja'], ['pt_PT', 'pt-BR'], ['nl-NL', 'en']]) assert.equal(resolveUiLanguage(os), expected);
});

test('a Setup choice seeds new profiles, with OS fallback for absent or unsupported registration', () => {
  for (const { id } of UI_LANGUAGES) assert.equal(initialUiLanguage('de-DE', () => `HKCU\\Synthetic\n    InstallerLanguage    REG_SZ    ${id}\r\n`), id);
  assert.equal(initialUiLanguage('fr-FR', () => { throw Error('No registration'); }), 'fr');
  assert.equal(initialUiLanguage('ja-JP', () => 'InstallerLanguage REG_SZ future'), 'ja');
  assert.equal(initialUiLanguage('unknown', () => ''), 'en');
});

test('legacy profiles retain German; language saves preserve user content and reject invalid writes', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'openhiatus-languages-'));
  const state = defaultState(); delete state.preferences.uiLanguage;
  const userText = 'Speichern <b>日本語</b> {0}';
  state.messages.push({ id: 'synthetic', role: 'user', text: userText, at: '2026-10-25T12:00:00Z' });
  writeFileSync(path.join(directory, 'state.json'), JSON.stringify({ version: 1, state }));
  const store = new StateStore(directory), restored = store.load();
  assert.equal(restored.preferences.uiLanguage, 'de');
  for (const { id } of UI_LANGUAGES) {
    restored.preferences.uiLanguage = id; store.save(restored);
    const reread = new StateStore(directory).load();
    assert.equal(reread.preferences.uiLanguage, id); assert.equal(reread.messages.at(-1)?.text, userText);
  }
  const before = readFileSync(path.join(directory, 'state.json'), 'utf8');
  Object.assign(restored.preferences, { uiLanguage: 'future' }); assert.throws(() => store.save(restored));
  assert.equal(readFileSync(path.join(directory, 'state.json'), 'utf8'), before);
});

test('every catalog row supplies six complete translations with the same parameter occurrences', () => {
  const markers = (value: string) => [...value.matchAll(/\{\d+\}/g)].map(match => match[0]).sort();
  assert.ok(Object.keys(messageCatalog).length > 800);
  for (const [source, row] of Object.entries(messageCatalog)) {
    assert.equal(source, source.replace(/\s+/g, ' ').trim());
    assert.equal(row.length, TRANSLATION_LANGUAGES.length, source);
    for (const target of row) {
      assert.ok(target.trim(), source); assert.ok(!target.includes('\ufffd'), source);
      assert.ok(!/\?\?/.test(target), `${source}: lossy text encoding`);
      assert.deepEqual(markers(target), markers(source), source);
    }
  }
});

test('parameters remain verbatim, fallback is safe, and static labels and formatters follow live changes', () => {
  const content = '<script>"Speichern" {1} 日本語</script>';
  assert.equal(translate('en', 'Aufgabe: {0}', content), 'Task: ' + content);
  assert.equal(translate('en', '__proto__'), '__proto__');
  assert.equal(translate('ja', 'unknown user text'), 'unknown user text');
  assert.equal(translate('de', ' Speichern '), ' Speichern ');
  const table = localized([{ id: 'stable-id', label: 'Speichern' }]); const entry = table[0]; const number = numberFormatter();
  try {
    setUiLanguage('en'); assert.equal(table[0].label, 'Save'); assert.equal(number.format(1234.5), '1,234.5');
    setUiLanguage('de'); assert.equal(table[0].label, 'Speichern'); assert.equal(number.format(1234.5), '1.234,5');
    assert.equal(table[0], entry); assert.equal(entry.id, 'stable-id');
  } finally { setUiLanguage('de'); }
});

test('literal application messages cannot ship without translations', () => {
  function files(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(directory, entry.name))
      : /\.tsx?$/.test(entry.name) ? [path.join(directory, entry.name)] : []);
  }
  const missing: string[] = [];
  for (const file of files('src')) {
    const tree = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && node.expression.getText(tree) === 't' && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
        const source = node.arguments[0].text.replace(/\s+/g, ' ').trim();
        if (source && !Object.hasOwn(messageCatalog, source)) missing.push(`${file}: ${source}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
  assert.deepEqual(missing, []);
});
