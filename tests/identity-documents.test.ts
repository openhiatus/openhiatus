import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, renameSync, mkdirSync, rmdirSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../src/main/memory';
import { DEFAULT_ASSISTANT_PROFILE } from '../src/shared/assistant-profile';
import { IDENTITY_FILES, identityFilesInstructions, identityName } from '../src/shared/identity-documents';

function fixture(t: { after(action: () => void): void }, sanitize?: (text: string) => string) {
  const directory = mkdtempSync(join(tmpdir(), 'openhiatus-identity-files-'));
  t.after(() => { assert.equal(dirname(directory).toLowerCase(), resolve(tmpdir()).toLowerCase()); assert.ok(basename(directory).startsWith('openhiatus-identity-files-')); rmSync(directory, { recursive: true, force: true }); });
  return { directory, store: new MemoryStore(directory, { sanitize }) };
}
const profile = { name: 'Juno', personalityId: 'custom-office', templates: [{ id: 'custom-office', label: 'Büro', instructions: 'Antworte knapp und trocken. Keine Floskeln.' }] };

test('migration creates the four real files from the selected style and retains legacy documents, facts and history', t => {
  const { directory, store } = fixture(t);
  store.edit('core', 'Die Übergabe ist am Dienstag.', 1);
  const before = store.snapshot();
  writeFileSync(join(directory, 'USER.md'), '# USER.md\nName: Sam\nVorliebe: kurze Antworten.', 'utf8');
  const snapshot = store.initializeProfile(profile);
  for (const file of IDENTITY_FILES) assert.equal(readFileSync(join(directory, file.filename), 'utf8'), snapshot.documents.find(document => document.id === file.id)!.content);
  assert.equal(identityName(snapshot.documents), 'Juno');
  assert.match(snapshot.documents.find(document => document.id === 'soul')!.content, /knapp und trocken/);
  assert.match(snapshot.documents.find(document => document.id === 'user')!.content, /Name: Sam/);
  assert.deepEqual(snapshot.documents.find(document => document.id === 'identity'), before.documents.find(document => document.id === 'identity'));
  assert.deepEqual(snapshot.documents.find(document => document.id === 'core'), before.documents.find(document => document.id === 'core'));
  const prompt = identityFilesInstructions(store.instructionDocuments())!;
  for (const file of IDENTITY_FILES) assert.ok(prompt.includes(file.filename));
  assert.ok(prompt.includes('knapp und trocken')); assert.ok(!prompt.includes('Warm & direkt'));
  assert.equal(JSON.parse(readFileSync(join(directory, 'memory.json'), 'utf8')).version, 2);
  assert.deepEqual(store.initializeProfile(DEFAULT_ASSISTANT_PROFILE).documents, snapshot.documents, 'migration never reapplies defaults');
});

test('external UTF-8 edits are versioned before a UI save, reject stale drafts and survive restart', t => {
  const { directory, store } = fixture(t); const initial = store.initializeProfile(profile);
  const user = initial.documents.find(document => document.id === 'user')!;
  const external = '# USER.md\nName: Sam\nOrt: Köln, Grüße äöü ß 🌙';
  writeFileSync(join(directory, 'USER.md'), external, 'utf8');
  assert.throws(() => store.edit('user', 'Stale UI draft', user.version), /inzwischen/);
  const changed = store.snapshot().documents.find(document => document.id === 'user')!;
  assert.equal(changed.content, external); assert.equal(changed.version, user.version + 1); assert.equal(changed.history.at(-1)!.reason, 'external-edit');
  const soul = store.snapshot().documents.find(document => document.id === 'soul')!;
  store.edit('soul', '# SOUL.md\nAntworte nüchtern.', soul.version);
  assert.equal(readFileSync(join(directory, 'SOUL.md'), 'utf8'), '# SOUL.md\nAntworte nüchtern.');
  const restarted = new MemoryStore(directory); restarted.initializeProfile(DEFAULT_ASSISTANT_PROFILE);
  assert.equal(restarted.snapshot().documents.find(document => document.id === 'user')!.content, external);
  assert.equal(restarted.snapshot().documents.find(document => document.id === 'soul')!.content, '# SOUL.md\nAntworte nüchtern.');
});

test('a pending Markdown export repairs the old file without importing it over the saved new version', t => {
  const { directory, store } = fixture(t); store.initializeProfile(profile);
  const target = join(directory, 'SOUL.md'), retained = join(directory, 'SOUL.retained.md');
  renameSync(target, retained); mkdirSync(target);
  const before = store.snapshot().documents.find(document => document.id === 'soul')!;
  const changed = store.edit('soul', '# SOUL.md\nNeue gespeicherte Werte.', before.version);
  assert.ok(changed.fileSyncWarnings!.length); assert.equal(changed.documents.find(document => document.id === 'soul')!.version, before.version + 1);
  rmdirSync(target); renameSync(retained, target);
  const restarted = new MemoryStore(directory), repaired = restarted.snapshot();
  assert.equal(repaired.documents.find(document => document.id === 'soul')!.content, '# SOUL.md\nNeue gespeicherte Werte.');
  assert.equal(repaired.documents.find(document => document.id === 'soul')!.version, before.version + 1);
  assert.equal(readFileSync(target, 'utf8'), '# SOUL.md\nNeue gespeicherte Werte.'); assert.deepEqual(repaired.fileSyncWarnings, []);
});

test('invalid external files remain intact and known credentials never enter Markdown or model context', t => {
  const secret = 'synthetic-secret-identity-123456';
  const { directory, store } = fixture(t, value => value.split(secret).join('[entfernt]'));
  store.initializeProfile(profile);
  const invalid = Buffer.from([0xff, 0xfe, 0xff]); writeFileSync(join(directory, 'USER.md'), invalid);
  const snapshot = store.snapshot(); assert.ok(snapshot.fileSyncWarnings!.some(warning => warning.startsWith('USER.md:')));
  assert.deepEqual(readFileSync(join(directory, 'USER.md')), invalid);
  writeFileSync(join(directory, 'USER.md'), '# USER.md\n' + secret, 'utf8');
  const safe = store.snapshot(); assert.ok(!identityFilesInstructions(safe.documents)!.includes(secret));
  assert.ok(!readFileSync(join(directory, 'USER.md'), 'utf8').includes(secret));
  assert.ok(!readFileSync(join(directory, 'memory.json'), 'utf8').includes(secret));
});

test('external MEMORY edits invalidate older proposals and rebuild never overwrites identity files', t => {
  const { directory, store } = fixture(t); store.initializeProfile(profile);
  const proposal = store.propose({ documentId: 'core', baseVersion: 1, content: 'Alter Vorschlag', reason: 'Synthetischer Test' });
  writeFileSync(join(directory, 'MEMORY.md'), '# MEMORY.md\nNeue Entscheidung.', 'utf8');
  assert.throws(() => store.decide(proposal.id, 'approve'), /veraltet|bereits|verändert/);
  const before = store.snapshot().documents.filter(document => ['soul', 'agent', 'user', 'core'].includes(document.id));
  store.rebuild();
  assert.deepEqual(store.snapshot().documents.filter(document => ['soul', 'agent', 'user', 'core'].includes(document.id)), before);
});
