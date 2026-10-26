import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { replaceStateFile } from '../src/main/platform/persistence/state-file-replace';
import { defaultState, StateStore } from '../src/main/storage';

function fsError(code: string) { return Object.assign(new Error(`synthetic ${code}`), { code }); }
function removeTestDirectory(directory: string) {
  const target = resolve(directory);
  assert.equal(dirname(target), resolve(tmpdir()));
  assert.ok(basename(target).startsWith('openhiatus-state-replace-'));
  rmSync(target, { recursive: true, force: true, maxRetries: 3 });
}

test('Windows state replacement retries only the same rename and acknowledges the completed interrupted state', t => {
  const directory = mkdtempSync(join(tmpdir(), 'openhiatus-state-replace-'));
  t.after(() => removeTestDirectory(directory));
  const running = defaultState(); running.task = { id: 'held-request', status: 'running' };
  new StateStore(directory).save(running);
  const primary = join(directory, 'state.json'), backup = join(directory, 'state.backup.json');
  const before = readFileSync(primary, 'utf8'), pauses: number[] = [], replacements: string[] = [];
  let blockedRenames = 0;
  const store = new StateStore(directory, { replaceFile: (temporary, target) => replaceStateFile(temporary, target, {
    platform: 'win32',
    rename: (source, destination) => {
      replacements.push(destination);
      assert.equal(source, `${destination}.tmp`);
      if (destination === primary && blockedRenames++ < 2) {
        assert.equal(readFileSync(primary, 'utf8'), before, 'a failed replacement preserves the primary');
        assert.equal(JSON.parse(readFileSync(source, 'utf8')).state.task.status, 'interrupted', 'the completed temp file stays ready');
        throw fsError(blockedRenames === 1 ? 'EPERM' : 'EBUSY');
      }
      renameSync(source, destination);
    },
    wait: milliseconds => { pauses.push(milliseconds); },
  }) });
  const interrupted = structuredClone(running); interrupted.task.status = 'interrupted';
  store.save(interrupted);
  assert.deepEqual(pauses, [10, 20]); assert.deepEqual(replacements, [backup, primary, primary, primary]);
  assert.equal(JSON.parse(readFileSync(primary, 'utf8')).state.task.status, 'interrupted');
  assert.equal(readFileSync(backup, 'utf8'), before, 'rename retries never rotate the backup again');
});

test('a persistent Windows lock has a bounded delay and preserves the last error and target', t => {
  const directory = mkdtempSync(join(tmpdir(), 'openhiatus-state-replace-'));
  t.after(() => removeTestDirectory(directory));
  const original = defaultState(); new StateStore(directory).save(original);
  const primary = join(directory, 'state.json'), before = readFileSync(primary, 'utf8');
  const failure = fsError('EPERM'), pauses: number[] = []; let attempts = 0;
  const store = new StateStore(directory, { replaceFile: (temporary, target) => replaceStateFile(temporary, target, {
    platform: 'win32', rename: (source, destination) => { if (destination !== primary) { renameSync(source, destination); return; } attempts++; throw failure; },
    wait: milliseconds => { pauses.push(milliseconds); },
  }) });
  const changed = structuredClone(original); changed.task = { id: 'held-request', status: 'interrupted' };
  assert.throws(() => store.save(changed), error => error === failure);
  assert.equal(attempts, 8); assert.deepEqual(pauses, [10, 20, 40, 80, 160, 320, 640]); assert.equal(pauses.reduce((sum, value) => sum + value, 0), 1270);
  assert.equal(readFileSync(primary, 'utf8'), before);
  assert.equal(JSON.parse(readFileSync(`${primary}.tmp`, 'utf8')).state.task.status, 'interrupted');
});

test('non-transient errors and other platforms never wait or retry state replacement', () => {
  for (const [platform, code] of [['win32', 'EACCES'], ['win32', 'ENOENT'], ['win32', 'ENOSPC'], ['linux', 'EPERM'], ['darwin', 'EBUSY']] as const) {
    const failure = fsError(code); let attempts = 0;
    assert.throws(() => replaceStateFile('state.json.tmp', 'state.json', {
      platform, rename: () => { attempts++; throw failure; }, wait: () => assert.fail('Unexpected wait'),
    }), error => error === failure);
    assert.equal(attempts, 1);
  }
});
