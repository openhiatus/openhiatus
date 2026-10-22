import test from 'node:test';
import assert from 'node:assert/strict';
import { StateJournal, StateWriteInvalidatedError } from '../src/main/modules/state-journal';

const turn = () => new Promise<void>(resolve => setImmediate(resolve));
async function until(check: () => boolean) { for (let attempt = 0; attempt < 30 && !check(); attempt++) await turn(); assert.ok(check()); }

test('checkpoint bursts keep one immutable latest snapshot while UI delivery remains immediate', async () => {
  let state = { value: 0 }, publications = 0;
  const written: Array<{ value: number }> = [];
  const journal = new StateJournal({ snapshot: () => state, commit: value => { written.push(value); },
    publish: () => { publications++; }, checkpointsBlocked: () => false, checkpointFailed: () => {} });
  for (let value = 0; value < 100; value++) { state.value = value; journal.checkpoint(); }
  state.value = 999;
  assert.equal(publications, 100); assert.deepEqual(written, []);
  await journal.flush(); assert.deepEqual(written, [{ value: 99 }]);
});

test('durable snapshots retain FIFO order and newer barriers supersede only earlier ordinary checkpoints', async () => {
  let state = 0, active = false;
  const writes: Array<{ state: number; done(): void }> = [];
  const journal = new StateJournal({ snapshot: () => state, commit: value => {
    assert.equal(active, false); active = true;
    return new Promise<void>(resolve => writes.push({ state: value, done: () => { active = false; resolve(); } }));
  }, publish() {}, checkpointsBlocked: () => false, checkpointFailed() {} });
  const first = journal.durableCommit(); state = 1; journal.checkpoint();
  state = 2; const second = journal.durableCommit(); state = 3; journal.checkpoint(); state = 999;
  const flushed = journal.flush();
  await until(() => writes.length === 1); assert.equal(writes[0].state, 0); writes[0].done(); await first;
  await until(() => writes.length === 2); assert.equal(writes[1].state, 2); writes[1].done(); await second;
  await until(() => writes.length === 3); assert.equal(writes[2].state, 3); writes[2].done(); await flushed;
  assert.equal(writes.length, 3);
});

test('Stop pauses ordinary queued writes without waiting for an in-flight write and resumes from current state', async () => {
  let state = 'running', blocked = false;
  const writes: Array<{ state: string; done(): void }> = [];
  const journal = new StateJournal({ snapshot: () => state, commit: value => new Promise<void>(resolve => writes.push({ state: value, done: resolve })),
    publish() {}, checkpointsBlocked: () => blocked, checkpointFailed() {} });
  journal.checkpoint(); journal.flushCheckpoint(); await until(() => writes.length === 1);
  blocked = true; state = 'stopping'; journal.checkpoint();
  assert.equal(journal.flushCheckpoint(), undefined); writes[0].done(); await turn();
  assert.equal(writes.length, 1, 'no ordinary write starts while termination is unconfirmed');
  state = 'interrupted'; blocked = false; journal.flushCheckpoint();
  await until(() => writes.length === 2); assert.equal(writes[1].state, 'interrupted'); writes[1].done(); await journal.flush();
});

test('failed barriers invalidate speculative queued states and recapture only after asynchronous rollback wrappers settle', async () => {
  const state = { first: false, second: false, retry: false }, written: Array<typeof state> = [];
  let failFirst!: (error: Error) => void;
  const failure = new Error('disk failed');
  const journal = new StateJournal({ snapshot: () => state, commit: value => {
    written.push(value);
    if (written.length === 1) return new Promise<void>((_resolve, reject) => { failFirst = reject; });
  }, publish() {}, checkpointsBlocked: () => false, checkpointFailed() {} });
  const wrapped = async () => { await (async () => { await journal.durableCommit(); })(); };
  const admit = async (key: 'first' | 'second') => {
    state[key] = true;
    try { await wrapped(); }
    catch (error) { state[key] = false; journal.checkpoint(); throw error; }
  };
  const first = assert.rejects(admit('first'), error => error === failure);
  const second = assert.rejects(admit('second'), StateWriteInvalidatedError);
  await until(() => Boolean(failFirst)); failFirst(failure); await Promise.all([first, second]);
  await journal.ready(); state.retry = true; await journal.durableCommit(); await journal.flush();
  assert.deepEqual(written, [{ first: true, second: false, retry: false }, { first: false, second: false, retry: true }]);
});

test('a synchronous commit failure also fences later snapshots until rollback completes', async () => {
  let state = 'speculative', fail = true;
  const written: string[] = [];
  const journal = new StateJournal({ snapshot: () => state, commit: value => { if (fail) throw new Error('failure'); written.push(value); },
    publish() {}, checkpointsBlocked: () => false, checkpointFailed() {} });
  await assert.rejects(async () => {
    try { await (async () => { await journal.durableCommit(); })(); }
    catch (error) { state = 'rolled back'; journal.checkpoint(); throw error; }
  });
  await journal.ready(); fail = false; await journal.durableCommit(); await journal.flush();
  assert.deepEqual(written, ['rolled back']);
});
