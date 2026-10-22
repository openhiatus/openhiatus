import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MemoryStore } from '../src/main/memory';

test('instruction views retain current protected versions and sanitization without exposing or modifying archive state', () => {
  mkdirSync('.test-data', { recursive: true });
  const directory = mkdtempSync(resolve('.test-data/memory-instructions-'));
  let hidden = '';
  const memory = new MemoryStore(directory, { sanitize: value => hidden ? value.replaceAll(hidden, '[hidden]') : value });
  memory.capture([{ id: 'source', role: 'user', text: 'Private historische Quelle.', at: '2026-10-21T10:00:00Z' }], 'conversation');
  memory.edit('identity', 'Präzise Grüße mit synthetic-private-term.', 1);
  hidden = 'synthetic-private-term';
  const file = join(directory, 'memory.json'), stored = readFileSync(file, 'utf8');
  const view = memory.instructionDocuments();
  assert.deepEqual(view.map(document => document.id).sort(), ['core', 'identity']);
  assert.ok(view.every(document => Object.keys(document).sort().join(',') === 'content,id,version'));
  assert.deepEqual(view.find(document => document.id === 'identity'), { id: 'identity', version: 2, content: 'Präzise Grüße mit [hidden].' });
  view[0].content = 'Manipulated'; view[0].version = 999; view.push({ id: 'fake', version: 1, content: 'fake' });
  const again = memory.instructionDocuments();
  assert.equal(again.length, 2); assert.ok(again.every(document => document.version < 999 && document.content !== 'Manipulated'));
  assert.equal(readFileSync(file, 'utf8'), stored, 'a read neither writes nor changes the durable archive');
  assert.equal(memory.source('source')?.text, 'Private historische Quelle.');
});
