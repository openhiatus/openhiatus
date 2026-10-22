import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppController } from '../src/main/controller';
import { MemoryStore } from '../src/main/memory';
import { defaultState } from '../src/main/storage';
import type { AgentAdapter, AgentEvent } from '../src/shared/contracts';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture(dialog = false, consent = true, memory?: MemoryStore) {
  let saved = defaultState(); saved.preferences.fullAccessAcknowledged = consent;
  let delayed = false, starts = 0, runs = 0, stops = 0, disposals = 0;
  const writes: Array<{ release(): void; fail(error: Error): void }> = [];
  let app!: AppController;
  const adapter = (emit: (event: AgentEvent) => void): AgentAdapter => ({
    async start() { starts++; }, async run() { runs++; emit({ type: 'started', threadId: 'thread', turnId: 'turn' }); },
    async stop() { stops++; }, async dispose() { disposals++; },
  });
  app = new AppController({
    store: {
      load: () => structuredClone(saved),
      save(state) {
        const snapshot = structuredClone(state);
        if (!delayed) { saved = snapshot; return; }
        return new Promise<void>((resolve, reject) => writes.push({ release() { saved = snapshot; resolve(); }, fail: reject }));
      },
    },
    credentials: { get() { return undefined; }, set() {}, remove() {} },
    speech: { async transcribe() { return ''; }, async synthesize() { return { base64: '', mimeType: '' }; }, async test() { return { base64: '', mimeType: '' }; } },
    agent: adapter(event => app.handle(event)), ...(dialog ? { dialogAgent: adapter(event => app.handleDialog(event)), createWorker() { throw new Error('Unexpected worker creation'); } } : {}),
    workspace: 'C:\\synthetic', publish() {}, memory,
  });
  app.handle({ type: 'connection', status: 'ready' }); app.handle({ type: 'models', models: [{ id: 'test/model', label: 'Test' }] });
  return { app, writes, delay(value = true) { delayed = value; }, saved: () => saved, counts: () => ({ starts, runs, stops, disposals }) };
}

test('initialization is shared and Stop cancels startup while the bootstrap write is pending', async () => {
  const f = fixture(); f.delay();
  const ready = f.app.initialize(); assert.equal(f.app.initialize(), ready);
  const starting = f.app.start(); await tick(); assert.equal(f.writes.length, 1); assert.equal(f.counts().starts, 0);
  await f.app.stop(); assert.equal(f.counts().stops, 1); assert.equal(f.counts().starts, 0);
  f.delay(false); f.writes[0].release(); await ready; await starting;
  assert.equal(f.counts().starts, 0); await f.app.dispose();
});

test('pending consent blocks work, shares failure and rolls back only its own preference', async () => {
  const f = fixture(false, false); await f.app.initialize(); f.delay();
  const consent = f.app.acknowledgeFullAccess(), repeated = f.app.acknowledgeFullAccess(); assert.equal(consent, repeated);
  const failed = Promise.all([assert.rejects(consent, /Schreibfehler/), assert.rejects(repeated, /Schreibfehler/)]);
  await tick(); assert.equal(f.writes.length, 1);
  await assert.rejects(f.app.send('Noch nicht angenommen', 'early'), /Vollzugriff/);
  await f.app.savePreferences({ earcons: false }); f.writes[0].fail(new Error('Schreibfehler')); await failed;
  assert.equal(f.app.snapshot().preferences.fullAccessAcknowledged, false); assert.equal(f.app.snapshot().preferences.earcons, false); assert.equal(f.counts().runs, 0);
  f.delay(false); await f.app.acknowledgeFullAccess(); await f.app.send('Jetzt angenommen', 'accepted');
  assert.equal(f.counts().runs, 1); assert.equal(f.saved().preferences.earcons, false); await f.app.dispose();
});

for (const dialog of [false, true]) test(`${dialog ? 'dialogue' : 'direct'} shutdown stops processes before the write and never archives or replays failed admission`, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'openhiatus-async-admission-'));
  const memory = new MemoryStore(directory), f = fixture(dialog, true, memory);
  try {
    await f.app.initialize(); f.delay();
    const sending = f.app.send('Nie dauerhaft angenommen', 'pending'); await tick();
    const rejected = assert.rejects(sending, /Schreibfehler/);
    assert.equal(f.writes.length, 1); assert.equal(f.counts().runs, 0);
    await f.app.stop(); assert.ok(f.counts().stops >= 1); assert.equal(memory.source('pending'), undefined);
    let settled = false;
    const disposal = f.app.dispose().then(() => { settled = true; }); await tick();
    assert.ok(f.counts().disposals >= 1); assert.equal(settled, false);
    await assert.rejects(f.app.send('Zu spät', 'late'), /beendet/);
    f.delay(false); f.writes[0].fail(new Error('Schreibfehler')); await rejected; await disposal;
    assert.equal(memory.source('pending'), undefined); assert.deepEqual(f.saved().messages, []); assert.equal(f.counts().runs, 0);
  } finally { f.delay(false); await f.app.dispose().catch(() => undefined); rmSync(directory, { recursive: true, force: true }); }
});
