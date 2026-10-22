import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionOperations, type OperationEffects } from '../src/renderer/features/session';

function deferred() {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  let request = 0;
  const session = new SessionOperations(() => `request-${++request}`);
  const ui = { draft: 'First draft', notice: '', error: '', sendBusy: false, actionBusy: '', cues: 0, navigations: 0 };
  const sendEffects = (text = ui.draft): OperationEffects => ({
    started: () => { ui.sendBusy = true; ui.error = ''; ui.notice = ''; },
    succeeded: () => { if (ui.draft === text) ui.draft = ''; ui.notice = 'Sent'; ui.cues++; },
    failed: error => { ui.error = (error as Error).message; ui.notice = ''; },
    settled: () => { ui.sendBusy = false; },
    cancelled: () => { ui.sendBusy = false; },
  });
  const newEffects: OperationEffects = {
    started: () => { ui.actionBusy = 'new'; ui.error = ''; ui.notice = ''; },
    succeeded: () => { ui.draft = ''; ui.navigations++; },
    failed: error => { ui.error = (error as Error).message; ui.notice = ''; },
    settled: () => { ui.actionBusy = ''; }, cancelled: () => { ui.actionBusy = ''; },
  };
  const stopEffects: OperationEffects = {
    started: () => { ui.notice = 'Stopped'; },
    failed: error => { ui.error = (error as Error).message; ui.notice = ''; },
  };
  return { session, ui, sendEffects, newEffects, stopEffects };
}

test('parallel send calls reserve submission synchronously and publish one receipt', async () => {
  const f = fixture(), admission = deferred(); let submissions = 0;
  const send = () => { submissions++; return admission.promise; };
  const first = f.session.send(f.ui.draft, send, f.sendEffects());
  const repeated = f.session.send(f.ui.draft, send, f.sendEffects());
  assert.equal(submissions, 1); assert.equal(f.ui.sendBusy, true);
  assert.equal(await repeated, false);
  admission.resolve(); assert.equal(await first, true);
  assert.equal(f.ui.draft, ''); assert.equal(f.ui.cues, 1); assert.equal(f.ui.sendBusy, false);
});

test('Stop reaches its port immediately and suppresses a late send receipt or failure', async () => {
  for (const fail of [false, true]) {
    const f = fixture(), admission = deferred(), stopped = deferred(); let stops = 0, forbidden = 0;
    const send = f.session.send(f.ui.draft, () => admission.promise, f.sendEffects());
    const stop = f.session.stop(() => { stops++; return stopped.promise; }, f.stopEffects);
    assert.equal(stops, 1); assert.equal(f.ui.sendBusy, false); assert.equal(f.ui.notice, 'Stopped');
    assert.equal(await f.session.send(f.ui.draft, async () => { forbidden++; }, f.sendEffects()), false);
    assert.equal(await f.session.action('new', async () => { forbidden++; }, f.newEffects), false);
    assert.equal(forbidden, 0);
    stopped.resolve(); assert.equal(await stop, true);
    f.ui.draft = 'A new unsent draft';
    if (fail) admission.reject(new Error('Late send failure')); else admission.resolve();
    assert.equal(await send, false);
    assert.deepEqual(f.ui, { draft: 'A new unsent draft', notice: 'Stopped', error: '', sendBusy: false, actionBusy: '', cues: 0, navigations: 0 });
  }
});

test('an old send cannot clear a newer submission after confirmed Stop', async () => {
  const f = fixture(), oldAdmission = deferred(), newAdmission = deferred();
  const oldSend = f.session.send(f.ui.draft, () => oldAdmission.promise, f.sendEffects());
  await f.session.stop(async () => {}, f.stopEffects);
  f.ui.draft = 'Second draft';
  const newSend = f.session.send(f.ui.draft, () => newAdmission.promise, f.sendEffects());
  oldAdmission.resolve(); assert.equal(await oldSend, false);
  assert.equal(f.ui.draft, 'Second draft'); assert.equal(f.ui.sendBusy, true); assert.equal(f.ui.cues, 0);
  newAdmission.resolve(); assert.equal(await newSend, true);
  assert.equal(f.ui.draft, ''); assert.equal(f.ui.sendBusy, false); assert.equal(f.ui.cues, 1);
});

test('Stop gives the same draft a fresh request ID and an old receipt cannot erase its retry ID', async () => {
  const f = fixture(), oldAdmission = deferred(), newAdmission = deferred(), ids: string[] = [];
  const text = f.ui.draft;
  const oldSend = f.session.send(text, id => { ids.push(id); return oldAdmission.promise; }, f.sendEffects());
  await f.session.stop(async () => {}, f.stopEffects);
  const newSend = f.session.send(text, id => { ids.push(id); return newAdmission.promise; }, f.sendEffects());
  oldAdmission.resolve(); assert.equal(await oldSend, false);
  newAdmission.reject(new Error('Retryable admission failure')); assert.equal(await newSend, false);
  assert.equal(await f.session.send(text, async id => { ids.push(id); }, f.sendEffects()), true);
  assert.deepEqual(ids, ['request-1', 'request-2', 'request-2']);
  f.ui.draft = text;
  assert.equal(await f.session.send(text, async id => { ids.push(id); }, f.sendEffects()), true);
  assert.equal(ids.at(-1), 'request-3');
});

test('a late New conversation receipt or failure cannot navigate or erase the draft after Stop', async () => {
  for (const fail of [false, true]) {
    const f = fixture(), admission = deferred();
    const create = f.session.action('new', () => admission.promise, f.newEffects);
    assert.equal(f.ui.actionBusy, 'new');
    await f.session.stop(async () => {}, f.stopEffects);
    f.ui.draft = 'Keep this draft';
    if (fail) admission.reject(new Error('Late new failure')); else admission.resolve();
    assert.equal(await create, false);
    assert.equal(f.ui.draft, 'Keep this draft'); assert.equal(f.ui.navigations, 0);
    assert.equal(f.ui.notice, 'Stopped'); assert.equal(f.ui.error, ''); assert.equal(f.ui.actionBusy, '');
  }
});

test('Send and New conversation exclude each other before a render in either order', async () => {
  for (const first of ['send', 'new'] as const) {
    const f = fixture(), admission = deferred(); let conflictingCalls = 0;
    const pending = first === 'send'
      ? f.session.send(f.ui.draft, () => admission.promise, f.sendEffects())
      : f.session.action('new', () => admission.promise, f.newEffects);
    const conflict = async () => { conflictingCalls++; };
    const accepted = first === 'send'
      ? f.session.action('new', conflict, f.newEffects)
      : f.session.send(f.ui.draft, conflict, f.sendEffects());
    assert.equal(await accepted, false); assert.equal(conflictingCalls, 0);
    admission.resolve(); assert.equal(await pending, true);
  }
});

test('repeated Stop shares confirmation and a failed Stop permits an explicit retry', async () => {
  const f = fixture(), stopped = deferred(); let calls = 0;
  const first = f.session.stop(() => { calls++; return stopped.promise; }, f.stopEffects);
  const repeated = f.session.stop(async () => { calls++; }, f.stopEffects);
  assert.equal(first, repeated); assert.equal(calls, 1);
  stopped.reject(new Error('Stop failed'));
  assert.equal(await first, false); assert.equal(f.ui.error, 'Stop failed'); assert.equal(f.session.isStopping(), false);
  assert.equal(await f.session.stop(async () => { calls++; }, f.stopEffects), true); assert.equal(calls, 2);
});

test('a current failed send reports once, retains the draft, and releases submission for retry', async () => {
  const f = fixture(); let reports = 0;
  const effects = f.sendEffects(), failed = effects.failed;
  effects.failed = error => { reports++; failed?.(error); };
  assert.equal(await f.session.send(f.ui.draft, () => { throw new Error('Admission failed'); }, effects), false);
  assert.equal(reports, 1); assert.equal(f.ui.error, 'Admission failed'); assert.equal(f.ui.draft, 'First draft');
  assert.equal(f.ui.sendBusy, false);
  assert.equal(await f.session.send(f.ui.draft, async () => {}, f.sendEffects()), true);
  assert.equal(f.ui.error, ''); assert.equal(f.ui.cues, 1);
});

test('disposing a session drops late effects without poisoning a replacement lifetime', async () => {
  const f = fixture(), admission = deferred();
  const send = f.session.send(f.ui.draft, () => admission.promise, f.sendEffects());
  f.session.dispose(); const atDispose = { ...f.ui };
  admission.reject(new Error('Late disposed failure')); assert.equal(await send, false);
  assert.deepEqual(f.ui, atDispose);
  assert.equal(await f.session.send(f.ui.draft, async () => assert.fail('disposed send'), f.sendEffects()), false);
  assert.equal(await f.session.action('new', async () => assert.fail('disposed action'), f.newEffects), false);
  assert.equal(await f.session.stop(async () => assert.fail('disposed stop'), f.stopEffects), false);
  const replacement = new SessionOperations();
  assert.equal(await replacement.send('replacement', async () => {}, f.sendEffects()), true);
  assert.equal(f.ui.cues, 1);
});
