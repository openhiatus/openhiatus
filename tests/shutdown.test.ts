import test from 'node:test';
import assert from 'node:assert/strict';
import { ShutdownCoordinator, type ShutdownChoice } from '../src/main/shutdown';

test('normal close waits for durable shutdown and shares repeated close requests', async () => {
  let release!: () => void, calls = 0; const finishes: boolean[] = [];
  const shutdown = new ShutdownCoordinator({
    shutdown: () => { calls++; return new Promise<void>(done => { release = done; }); },
    choose: async () => { assert.fail('No prompt during normal shutdown'); }, busy: () => {}, finish: force => { finishes.push(force); },
  });
  const first = shutdown.close(); assert.equal(shutdown.close(), first);
  await Promise.resolve(); assert.equal(calls, 1); assert.deepEqual(finishes, []);
  release(); await first; assert.deepEqual(finishes, [false]);
});

test('permanent write failures offer a real force exit; cancel never loses data silently', async () => {
  const choices: ShutdownChoice[] = ['cancel', 'retry', 'force']; const finishes: boolean[] = []; let calls = 0;
  const busy: boolean[] = [];
  const shutdown = new ShutdownCoordinator({
    shutdown: async () => { calls++; throw Error('synthetic failed disk'); },
    choose: async reason => { assert.equal(reason, 'failed'); return choices.shift()!; },
    busy: value => { busy.push(value); }, finish: force => { finishes.push(force); },
  });
  await shutdown.close(); assert.deepEqual(finishes, []); assert.equal(calls, 1);
  await shutdown.close(); assert.deepEqual(finishes, [true]); assert.equal(calls, 3);
  assert.deepEqual(busy, [true, false, true, false]);
});

test('a stalled shutdown can be forced without waiting forever', async () => {
  const shutdown = new ShutdownCoordinator({ shutdown: () => new Promise(() => {}),
    choose: async reason => { assert.equal(reason, 'timeout'); return 'force'; },
    busy: () => {}, finish: force => { assert.equal(force, true); },
  }, 10);
  await shutdown.close();
});

test('waiting again reuses the in-flight shutdown and accepts its late durable result', async () => {
  let calls = 0, release!: () => void, finished = false;
  const shutdown = new ShutdownCoordinator({
    shutdown: () => { calls++; return new Promise<void>(done => { release = done; }); },
    choose: async reason => { assert.equal(reason, 'timeout'); release(); return 'retry'; },
    busy: () => {}, finish: force => { assert.equal(force, false); finished = true; },
  }, 10);
  await shutdown.close(); assert.equal(calls, 1); assert.equal(finished, true);
});
