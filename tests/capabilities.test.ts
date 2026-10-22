import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { OPENHIATUS_CAPABILITIES_FILENAME, openhiatusCapabilitiesPath, buildOpenhiatusCapabilities, writeOpenhiatusCapabilities } from '../src/main/capabilities';
import type { SkillCatalog, SkillEntry } from '../src/shared/contracts';

const skill = (name: string, patch: Partial<SkillEntry> = {}): SkillEntry => ({ name, enabled: true, scope: 'user',
  description: 'Erstellt Dokumente mit Äpfeln und Grüßen. Prüft das fertige Ergebnis. Weitere Details stehen in der Anleitung.',
  path: `C:\\Anleitungen\\${name}\\SKILL.md`, ...patch });
const catalog = (skills: SkillEntry[], errors: SkillCatalog['errors'] = []): SkillCatalog => ({ skills, errors, directory: 'C:\\Anleitungen' });
const promptData = (prompt: string): any => JSON.parse(prompt.slice(prompt.indexOf('\n') + 1));
async function profile(t: any): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'openhiatus-capabilities-test-'));
  t.after(async () => {
    assert.equal(dirname(resolve(directory)).toLowerCase(), resolve(tmpdir()).toLowerCase());
    assert.ok(basename(directory).startsWith('openhiatus-capabilities-test-'));
    await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  return directory;
}

test('all 39 active catalog skills reach readable and parsable capabilities; exact paths live in the overview file', () => {
  const entries = Array.from({ length: 39 }, (_, index) => skill(`skill-${index}`, { displayName: `Anleitung ${index}`, path: `C:\\Nutzer\\Übung mit Leerzeichen\\${index}\\SKILL.md` }));
  const source = catalog(entries); const original = JSON.stringify(source);
  const document = buildOpenhiatusCapabilities(source, { catalogPath: 'C:\\Profil\\Fähigkeiten von openhiatus.md' });
  assert.equal(document.filename, 'Fähigkeiten von openhiatus.md'); assert.equal(document.data.skills.length, 39);
  assert.equal(JSON.stringify(source), original, 'Building must not mutate the discovery catalog.');
  const data = promptData(document.prompt); assert.deepEqual(data.skills.columns, ['name', 'description']);
  assert.equal(data.skills.rows.length, 39);
  assert.match(document.prompt, /alle Pfade stehen in C:\\Profil\\Fähigkeiten von openhiatus\.md/);
  for (const entry of entries) {
    const row = data.skills.rows.find((row: string[]) => row[0] === entry.name);
    assert.equal(row.length, 2); assert.equal(document.prompt.includes(entry.path), false, 'the frozen catalogue omits long paths');
    assert.ok(document.markdown.includes(entry.path)); assert.ok(document.markdown.includes(entry.displayName!));
  }
  const withoutFile = buildOpenhiatusCapabilities(source, {});
  assert.deepEqual(promptData(withoutFile.prompt).skills.columns, ['name', 'description', 'path'], 'without an overview file paths stay inline');
  assert.ok(document.bytes.prompt < withoutFile.bytes.prompt - 39 * 30);
  assert.equal(data.catalogPath, 'C:\\Profil\\Fähigkeiten von openhiatus.md');
  assert.ok(document.bytes.prompt < 16 * 1024); assert.equal(document.bytes.markdown, Buffer.byteLength(document.markdown, 'utf8'));
  assert.equal(document.bytes.prompt, Buffer.byteLength(document.prompt, 'utf8'));
});
test('disabled, unavailable, malformed and duplicate entries are not advertised', () => {
  const good = skill('available');
  const source = catalog([good, skill('disabled', { enabled: false }), skill('broken'), skill('relative', { path: 'skills/relative/SKILL.md' }),
    skill('folder', { path: 'C:\\Anleitungen\\folder' }), skill('invalid-scope', { scope: 'toString' as SkillEntry['scope'] }),
    { ...good, name: 'duplicate', path: good.path.toLowerCase() }], [{ path: skill('broken').path, message: 'Unreadable skill.' }]);
  const document = buildOpenhiatusCapabilities(source);
  assert.deepEqual(document.data.skills.map(entry => entry.name), ['available']);
  assert.deepEqual(document.data.excluded, { disabled: 1, unavailable: 4, duplicates: 1 }); assert.equal(document.data.discoveryErrors, 1);
  for (const name of ['disabled', 'broken', 'relative', 'folder', 'invalid-scope', 'duplicate']) {
    assert.equal(promptData(document.prompt).skills.rows.some((row: string[]) => row[0] === name), false);
    assert.equal(document.markdown.includes(`### ${name}`), false);
  }
});
test('a disabled conflicting path stays disabled and refresh replaces the previous inventory', () => {
  const first = skill('enabled-before'); const second = skill('new-skill');
  const before = buildOpenhiatusCapabilities(catalog([first]));
  const after = buildOpenhiatusCapabilities(catalog([{ ...first, enabled: false }, { ...first, name: 'conflicting-enabled' }, second]));
  assert.deepEqual(before.data.skills.map(entry => entry.name), ['enabled-before']);
  assert.deepEqual(after.data.skills.map(entry => entry.name), ['new-skill']);
  assert.equal(after.prompt.includes('enabled-before'), false); assert.equal(after.prompt.includes('conflicting-enabled'), false);
});
test('unloaded discovery and a confirmed empty catalog remain distinguishable', () => {
  const unknown = buildOpenhiatusCapabilities(undefined); const empty = buildOpenhiatusCapabilities(catalog([]));
  assert.equal(unknown.data.status, 'not-loaded'); assert.match(unknown.markdown, /noch nicht geladen/);
  assert.equal(empty.data.status, 'ready'); assert.match(empty.markdown, /keine aktivierten verfügbaren Skills/);
  assert.equal(unknown.data.skills.length, 0); assert.equal(empty.data.skills.length, 0);
});
test('descriptions use at most two original sentences and text truncation preserves UTF-8 codepoints', () => {
  const document = buildOpenhiatusCapabilities(catalog([skill('normal'), skill('long', { description: 'Äpfel 🍎 und Grüße '.repeat(1000) })]));
  assert.equal(document.data.skills.find(entry => entry.name === 'normal')!.description, 'Erstellt Dokumente mit Äpfeln und Grüßen. Prüft das fertige Ergebnis.');
  const long = document.data.skills.find(entry => entry.name === 'long')!.description;
  assert.ok(Buffer.byteLength(long, 'utf8') <= 240); assert.ok(long.endsWith('…'));
  assert.equal(long.includes('\uFFFD'), false); assert.equal(Buffer.from(long, 'utf8').toString('utf8'), long);
  assert.equal(document.data.skills.find(entry => entry.name === 'long')!.path, skill('long').path);
});
test('metadata remains quoted data, markdown stays readable and secrets are redacted', () => {
  const document = buildOpenhiatusCapabilities(catalog([skill('quoting', { displayName: 'Dokumente *und* <Bilder>',
    description: 'Text mit "Anführungszeichen" und Bearer sensitive-token sowie sk-abcdefghijklmnop. Zweiter Satz.', path: 'C:\\Skills\\mit `Code` und Ü\\SKILL.md' })]));
  const row = promptData(document.prompt).skills.rows[0];
  assert.equal(row[2], 'C:\\Skills\\mit `Code` und Ü\\SKILL.md');
  assert.equal(document.prompt.includes('sensitive-token'), false); assert.equal(document.markdown.includes('sk-abcdefghijklmnop'), false);
  assert.ok(document.markdown.includes('Dokumente \\*und\\* \\<Bilder\\>')); assert.ok(document.markdown.includes('`` C:\\Skills\\mit `Code` und Ü\\SKILL.md ``'));
});
test('catalog describes actual full access, dialog isolation and unavailable goals', () => {
  const document = buildOpenhiatusCapabilities(catalog([skill('service-anleitung')]));
  assert.match(document.markdown, /STT → LLM → TTS/);
  assert.match(document.data.limits.access, /Windows-Benutzers.*nur Dialogwerkzeuge/);
  assert.match(document.data.limits.skills, /Voraussetzungen.*tatsächlich vorhandener Werkzeuge/);
  assert.match(document.data.limits.goals, /noch nicht verfügbar/);
  assert.match(document.prompt, /lies ihre angegebene SKILL.md/);
});

test('oversized complete catalogs fail explicitly without truncating instruction paths', () => {
  const entry = skill('too-long', { path: `C:\\${'ä'.repeat(10000)}\\SKILL.md` });
  assert.throws(() => buildOpenhiatusCapabilities(catalog([entry]), { maxBytes: 4096 }), /vollständige Fähigkeitenkatalog überschreitet.*nicht still gekürzt/);
  assert.throws(() => buildOpenhiatusCapabilities(catalog([]), { maxBytes: Number.NaN }), /Ungültige Grenzen/);
  assert.throws(() => buildOpenhiatusCapabilities(catalog([]), { catalogPath: 'relative.md' }), /absoluten Dateipfad/);
});
test('generated profile file writes exact UTF-8, updates on refresh and leaves unchanged content untouched', async t => {
  const directory = await profile(t); const target = openhiatusCapabilitiesPath(directory);
  assert.equal(basename(target), OPENHIATUS_CAPABILITIES_FILENAME);
  const first = buildOpenhiatusCapabilities(catalog([skill('erster')]), { catalogPath: target });
  assert.deepEqual(writeOpenhiatusCapabilities(directory, first), { path: target, changed: true });
  const bytes = await readFile(target); assert.deepEqual(bytes, Buffer.from(first.markdown, 'utf8')); assert.equal(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false);
  const before = await stat(target); assert.equal(writeOpenhiatusCapabilities(directory, first).changed, false); assert.equal((await stat(target)).mtimeMs, before.mtimeMs);
  const second = buildOpenhiatusCapabilities(catalog([skill('zweiter')]), { catalogPath: target });
  assert.equal(writeOpenhiatusCapabilities(directory, second).changed, true); assert.equal(await readFile(target, 'utf8'), second.markdown);
  assert.deepEqual(await readdir(directory), [OPENHIATUS_CAPABILITIES_FILENAME]);
});
test('write boundary rejection preserves the previous complete file and cannot choose a different filename', async t => {
  const directory = await profile(t); const document = buildOpenhiatusCapabilities(catalog([skill('existing')]));
  writeOpenhiatusCapabilities(directory, document);
  assert.throws(() => writeOpenhiatusCapabilities(directory, { ...document, markdown: 'ä'.repeat(40000) }), /Ungültige Fähigkeitenübersicht/);
  assert.throws(() => writeOpenhiatusCapabilities(directory, { ...document, filename: '../other.md' as typeof OPENHIATUS_CAPABILITIES_FILENAME }), /Ungültige Fähigkeitenübersicht/);
  assert.throws(() => openhiatusCapabilitiesPath('relative-profile'), /absoluten Pfad/);
  assert.equal(await readFile(openhiatusCapabilitiesPath(directory), 'utf8'), document.markdown);
  assert.deepEqual(await readdir(directory), [OPENHIATUS_CAPABILITIES_FILENAME]);
});
