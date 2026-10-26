import test from 'node:test';
import assert from 'node:assert/strict';
import { initialIdentityFiles, identityFilesInstructions, identityName, type IdentityDocument } from '../src/shared/identity-documents';
import { readSetupIdentity, REPLY_STYLES, saveSetupIdentity, setupIdentityChanges } from '../src/shared/onboarding-identity';

function documents(): IdentityDocument[] { return Object.entries(initialIdentityFiles()).map(([id, content]) => ({ id, content, version: 1 })); }
function fixture() {
  const baseline = documents(); let disk = structuredClone(baseline); const calls: string[] = [];
  const api = {
    async memorySnapshot() { return { documents: structuredClone(disk) }; },
    async editMemory(id: string, content: string, version: number) {
      const current = disk.find(document => document.id === id)!;
      assert.equal(current.version, version);
      calls.push(id); disk = disk.map(document => document.id === id ? { id, content, version: version + 1 } : document);
      return { documents: structuredClone(disk) };
    },
  };
  return { baseline, api, calls, disk: () => disk };
}

test('optional identity edits retain custom instructions, update the existing identity and roundtrip Unicode', async () => {
  const f = fixture();
  const draft = { ...readSetupIdentity(f.baseline), agentName: '小光', userName: 'Élodie', agentRole: 'Geduldige Hilfe', userContext: 'Synthetic work context', replyStyle: 'guided' as const, replyNotes: 'Use short paragraphs.' };
  await saveSetupIdentity(f.baseline, draft, f.api);
  assert.deepEqual(readSetupIdentity(f.disk()), draft); assert.equal(identityName(f.disk()), '小光');
  assert.deepEqual(f.calls, ['agent', 'user', 'soul']);
  const instructions = identityFilesInstructions(f.disk())!;
  for (const expected of ['小光', 'Élodie', 'Synthetic work context', REPLY_STYLES.guided, 'Use short paragraphs.']) assert.ok(instructions.includes(expected));
  assert.deepEqual(f.disk().find(doc => doc.id === 'core'), documents().find(doc => doc.id === 'core'));
  await saveSetupIdentity(f.baseline, draft, f.api); assert.equal(f.calls.length, 3);
});

test('existing freeform content survives adding, changing and removing setup fields', () => {
  const original = documents();
  for (const doc of original) doc.content += '\n## Custom notes\nKeep this exact user content.\n';
  const before = readSetupIdentity(original), changes = setupIdentityChanges(original, { ...before, agentName: 'Nova', userContext: 'Example', replyStyle: 'brief', replyNotes: 'Please explain acronyms.' });
  const saved = original.map(doc => changes.find(change => change.id === doc.id) ?? doc);
  for (const doc of saved) assert.ok(doc.content.includes('## Custom notes\nKeep this exact user content.\n'));
  assert.ok(saved.find(doc => doc.id === 'soul')!.content.startsWith(initialIdentityFiles().soul));
  const removed = setupIdentityChanges(saved, before);
  const reset = saved.map(doc => removed.find(change => change.id === doc.id) ?? doc);
  assert.deepEqual(readSetupIdentity(reset), before);
  for (const doc of reset) assert.ok(doc.content.includes('Keep this exact user content.'));
  assert.equal(reset.some(doc => doc.content.includes('<!-- openhiatus:')), false);
});

test('leaving optional fields unchanged performs no reads or writes', async () => {
  const docs = documents();
  await saveSetupIdentity(docs, readSetupIdentity(docs), { async memorySnapshot() { throw Error('Unexpected read'); }, async editMemory() { throw Error('Unexpected write'); } });
});

test('stale identity edits are rejected before any file is changed', async () => {
  const f = fixture(), draft = { ...readSetupIdentity(f.baseline), agentName: 'Nova', userName: 'Alex' };
  await f.api.editMemory('user', '# USER.md\n- **Anrede:** Updated elsewhere', 1);
  await assert.rejects(saveSetupIdentity(f.baseline, draft, f.api), /inzwischen geändert/);
  assert.deepEqual(f.calls, ['user']); assert.equal(identityName(f.disk()), '');
});

test('retry after a partial storage failure saves only the remaining identity files', async () => {
  const f = fixture(), draft = { ...readSetupIdentity(f.baseline), agentName: 'Nova', userName: 'Alex', replyStyle: 'brief' as const };
  const write = f.api.editMemory;
  f.api.editMemory = async (id, content, version) => { if (id === 'user') throw Error('Synthetic disk failure'); return write(id, content, version); };
  await assert.rejects(saveSetupIdentity(f.baseline, draft, f.api), /disk failure/);
  assert.deepEqual(f.calls, ['agent']); assert.equal(identityName(f.baseline), 'Nova');
  f.api.editMemory = write;
  await saveSetupIdentity(f.baseline, draft, f.api);
  assert.deepEqual(f.calls, ['agent', 'user', 'soul']); assert.deepEqual(readSetupIdentity(f.disk()), draft);
});

test('invalid, ambiguous or oversized edits fail before writes and preserve drafts', async () => {
  const f = fixture(), before = readSetupIdentity(f.baseline);
  for (const patch of [{ agentName: 'Bad\nName' }, { agentName: 'x'.repeat(61) }, { userName: 'Bad\u0000Name' }, { userContext: '<!-- openhiatus:setup-context:start -->' }, { replyStyle: '__proto__' }]) {
    await assert.rejects(saveSetupIdentity(f.baseline, { ...before, ...patch } as typeof before, f.api));
  }
  f.baseline.find(doc => doc.id === 'agent')!.content += '\n- **Rufname:** Duplicate';
  await assert.rejects(saveSetupIdentity(f.baseline, { ...before, agentName: 'Nova' }, f.api), /Mehrdeutig/);
  f.baseline.find(doc => doc.id === 'user')!.content += 'x'.repeat(8000);
  await assert.rejects(saveSetupIdentity(f.baseline, { ...before, userContext: 'Hello' }, f.api), /zu lang/);
  f.baseline.find(doc => doc.id === 'soul')!.content += '<!-- openhiatus:setup-style:start -->';
  assert.throws(() => readSetupIdentity(f.baseline), /verändert/);
  assert.deepEqual(f.calls, []);
});
