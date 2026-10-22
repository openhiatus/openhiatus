import test from 'node:test';
import assert from 'node:assert/strict';
import { StateJournal } from '../src/main/modules/state-journal';

function fixture() {
  const events: string[] = [], errors: unknown[] = [];
  let blocked = false, currentState = 'initial', failure: unknown;
  const journal = new StateJournal({
    snapshot: () => currentState,
    commit: state => { if (failure) throw failure; events.push(`commit:${state}`); },
    publish: () => { events.push(`publish:${currentState}`); },
    checkpointsBlocked: () => blocked,
    checkpointFailed: error => { errors.push(error); },
  });
  return { journal, events, errors, block: (value: boolean) => { blocked = value; },
    state: (value: string) => { currentState = value; }, fail: (value?: unknown) => { failure = value; } };
}

test('durable admission failures propagate before work and do not become best-effort checkpoints', async () => {
  const f = fixture(), failure = new Error('disk unavailable'); f.fail(failure);
  await assert.rejects(async () => { await f.journal.durableCommit(); f.events.push('start external work'); }, error => error === failure);
  assert.deepEqual([...f.events], []); assert.deepEqual(f.errors, []);
  await f.journal.ready(); f.fail(); await f.journal.durableCommit(); f.events.push('start external work');
  assert.deepEqual(f.events, ['commit:initial', 'start external work']);
});

test('checkpoint failures are reported while current state still reaches the UI', async () => {
  const f = fixture(), failure = new Error('disk full'); f.fail(failure);
  f.journal.checkpoint();
  assert.deepEqual(f.events, ['publish:initial']);
  await assert.rejects(f.journal.flush(), error => error === failure);
  assert.deepEqual(f.errors, [failure]);
  f.fail(); f.journal.checkpoint(); await f.journal.flush();
  assert.equal(f.events.at(-1), 'commit:initial');
});

test('transient UI publication never writes or creates deferred checkpoints', async () => {
  const f = fixture(); f.block(true); f.journal.publish(); f.journal.checkpoint(false);
  f.block(false); f.journal.flushCheckpoint(); await f.journal.flush();
  assert.deepEqual(f.events, ['publish:initial', 'publish:initial']);
});

test('blocked checkpoints coalesce and flush the latest state only after confirmed work termination', async () => {
  const f = fixture(); f.block(true); f.journal.checkpoint();
  f.state('stopping'); f.journal.checkpoint(); f.journal.flushCheckpoint();
  assert.deepEqual(f.events, ['publish:initial', 'publish:stopping']);
  f.state('interrupted'); f.block(false); f.journal.flushCheckpoint(); f.journal.flushCheckpoint(); await f.journal.flush();
  assert.deepEqual(f.events, ['publish:initial', 'publish:stopping', 'commit:interrupted']);
});

test('a deferred checkpoint does not weaken a separately requested durable barrier', async () => {
  const f = fixture(); f.block(true); f.journal.checkpoint(); await f.journal.durableCommit();
  assert.deepEqual(f.events, ['publish:initial', 'commit:initial']);
  f.block(false); f.journal.flushCheckpoint(); await f.journal.flush();
  assert.deepEqual(f.events.slice(2), []);
});
