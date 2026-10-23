import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPUTER_TOOL, ComputerError, parseComputerInput, parseComputerStateNote, readComputerStateNote } from '../src/main/computer-input';

test('computer stateNote is optional bounded tool data and is stripped from all native action variants', () => {
  const schema = COMPUTER_TOOL.inputSchema.properties.stateNote;
  assert.equal(schema.type, 'string'); assert.equal(schema.minLength, 1); assert.equal(schema.maxLength, 240);
  assert.ok(!Object.hasOwn(schema, 'pattern'), 'simple provider-neutral schema; detailed checks stay in the runtime validator');
  const actions = [
    { action: 'screenshot', resolution: 'original' },
    { action: 'inspect', frameId: 'frame', viewId: 'view', x: 0, y: 0, width: 10, height: 10 },
    { action: 'click', frameId: 'frame', viewId: 'view', x: 0, y: 0 },
    { action: 'type', frameId: 'frame', text: 'Exact business input remains longer if needed.' },
    { action: 'key', frameId: 'frame', key: 'enter' },
    { action: 'scroll', frameId: 'frame', x: 0, y: 0, direction: 'down', amount: 1 },
    { action: 'move', frameId: 'frame', x: 0, y: 0 },
    { action: 'drag', frameId: 'frame', x: 0, y: 0, fromX: 1, fromY: 1 },
  ];
  for (const action of actions) {
    const original = { ...action, stateNote: 'Observed value 20\nSave unverified' };
    assert.deepEqual(parseComputerInput(original), parseComputerInput(action));
    assert.equal(readComputerStateNote(original), original.stateNote);
    assert.equal(original.stateNote, 'Observed value 20\nSave unverified');
  }
});

test('stateNote accepts the exact 240-character boundary and up to three nonempty short lines', () => {
  const boundary = `${'a'.repeat(78)}\n${'b'.repeat(79)}\n${'c'.repeat(81)}`;
  assert.equal(boundary.length, 240); assert.equal(parseComputerStateNote(boundary), boundary);
  assert.equal(parseComputerStateNote('Größe 20; Zahlung 30; geprüft?'), 'Größe 20; Zahlung 30; geprüft?');
  assert.equal(readComputerStateNote(JSON.stringify({ action: 'screenshot', stateNote: boundary })), boundary);
});

test('invalid notes fail hard before native input and cannot enter history through the tolerant reader', () => {
  const invalid: unknown[] = [undefined, null, false, 10, {}, [], '', ' ', '\n', 'a\n\nb', 'a\nb\nc\nd', 'x'.repeat(241),
    'a\tb', 'a\rb', 'a\u0000b', 'a\u000bb', 'a\u007fb', 'a\u0085b', 'a\u200bb', 'a\u202eb', 'a\u2028b', 'a\u2029b',
    'a\u0600b', 'DATA:image/png;base64,AA==', 'data:,hello', 'x Data :text/plain,hello'];
  for (const stateNote of invalid) {
    assert.throws(() => parseComputerStateNote(stateNote), ComputerError);
    if (stateNote !== undefined) assert.throws(() => parseComputerInput({ action: 'screenshot', stateNote }), ComputerError);
    assert.equal(readComputerStateNote({ action: 'screenshot', stateNote }), undefined);
  }
  for (const action of ['unknown', undefined, 'launchShell']) assert.equal(readComputerStateNote({ action, stateNote: 'Success claim' }), undefined);
  assert.equal(readComputerStateNote({ action: 'click', stateNote: 'Success claim' }), undefined, 'an invalid missing frame/point cannot supply a note');
  assert.equal(readComputerStateNote({ action: 'screenshot', stateNote: 'Claim', extra: true }), undefined);
  assert.equal(readComputerStateNote('{not-json'), undefined);
  assert.equal(readComputerStateNote(' '.repeat(64001)), undefined);
});
