import test from 'node:test';
import assert from 'node:assert/strict';
import { AppController } from '../src/main/controller';
import { defaultState } from '../src/main/storage';
import type { AgentAdapter, AgentEvent, ComputerFrame } from '../src/shared/contracts';

function fixture() {
  let saved = defaultState(); saved.preferences.fullAccessAcknowledged = true;
  const computerFrames: ComputerFrame[] = [];
  let runs = 0;
  let stops = 0;
  let key: string | undefined;
  let stopImplementation = async () => {};
  const agent: AgentAdapter = {
    async start() {}, async run() { runs++; }, async stop() { stops++; await stopImplementation(); }, async dispose() {}
  };
  const speech = {
    async transcribe(_clip: unknown, signal?: AbortSignal): Promise<string> {
      return new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('Abgebrochen')), { once: true }));
    },
    async synthesize() { return { base64: 'YQ==', mimeType: 'audio/mpeg' }; },
    async test() { return { base64: 'YQ==', mimeType: 'audio/mpeg' }; }
  };
  const options = {
    store: { load: () => structuredClone(saved), save: (state: typeof saved) => { saved = structuredClone(state); } },
    credentials: { get: () => key, set: (_name: string, value: string) => { key = value; }, remove: () => { key = undefined; } },
    speech, agent, workspace: 'C:\\demo', publish: () => {}, openAuth: async () => {}, publishComputerFrame: (frame: ComputerFrame) => { computerFrames.push(frame); }
  };
  const app = new AppController(options);
  app.handle({ type: 'connection', status: 'ready', account: 'Testkonto' });

  app.handle({ type: 'models', models: [{ id: 'test-model', label: 'Testmodell' }] });
  return { app, options, computerFrames, saved: () => saved, runs: () => runs, stops: () => stops, setStop: (fn: () => Promise<void>) => { stopImplementation = fn; } };
}

test('computer previews are transient and late frames after Stop are not published', async () => {
  const f = fixture();
  const frame: ComputerFrame = { dataUrl: 'data:image/png;base64,cHJpdmF0ZS1zY3JlZW4=', frameId: 'frame-test', width: 10, height: 10, at: new Date().toISOString() };
  f.app.handle({ type: 'computer-frame', frame });
  assert.equal(f.computerFrames.length, 0);
  await f.app.acknowledgeFullAccess();
  await f.app.send('Computer-Test', 'computer-preview');
  f.app.handle({ type: 'computer-frame', frame });
  assert.deepEqual(f.computerFrames, [frame]);
  assert.ok(!JSON.stringify(f.saved()).includes('cHJpdmF0ZS1zY3JlZW4='));
  assert.ok(!JSON.stringify(f.app.snapshot()).includes('frame-test'));
  await f.app.stop();
  f.app.handle({ type: 'computer-frame', frame });
  assert.equal(f.computerFrames.length, 1);
});

test('an accepted request is persisted before execution and cannot be duplicated or replayed', async () => {
  const f = fixture();
  await Promise.all([f.app.send('Erstelle aufgaben.md', 'request-1'), f.app.send('Erstelle aufgaben.md', 'request-1')]);
  assert.equal(f.runs(), 1);
  assert.equal(f.saved().task.status, 'running');
  await assert.rejects(f.app.send('Zweiter Auftrag', 'request-2'), /bereits/);
  f.app.handle({ type: 'completed', status: 'completed', text: 'Erledigt.' });
  await f.app.send('Erstelle aufgaben.md', 'request-1');
  assert.equal(f.runs(), 1);
});

test('direct conversations publish matching context without saving stale measurements', async () => {
  const f = fixture(); await f.app.send('Gespräch', 'context-request');
  f.app.handle({ type: 'started', threadId: 'context-thread', turnId: 'context-turn' });
  f.app.handle({ type: 'context', threadId: 'other-thread', usedTokens: 999, windowTokens: 1000 });
  assert.equal(f.app.snapshot().context, undefined);
  f.app.handle({ type: 'context', threadId: 'context-thread', usedTokens: 1000, windowTokens: 128000 });
  assert.equal(f.app.snapshot().context?.usedTokens, 1000);
  assert.ok(!('context' in f.saved()));
  f.app.handle({ type: 'completed', status: 'completed', text: 'Antwort.' });
  assert.equal(f.app.snapshot().messages.length, 2);
  await f.app.newConversation();
  f.app.handle({ type: 'context', threadId: 'context-thread', usedTokens: 9999 });
  assert.equal(f.app.snapshot().context?.usedTokens, 1000, 'A late report cannot change the previous measurement or attach it to a new conversation.');
  assert.equal(f.app.snapshot().task.threadId, undefined);
});

test('native hotkey status is published without persisting another process ownership across restart', () => {
  const f = fixture(); assert.equal(f.app.snapshot().hotkeys, undefined);
  const status = { recording: false, submit: false, stop: true };
  f.app.updateHotkeys(status); status.recording = true;
  assert.deepEqual(f.app.snapshot().hotkeys, { recording: false, submit: false, stop: true });
  assert.ok(!('hotkeys' in f.saved()));
  assert.equal(new AppController(f.options).snapshot().hotkeys, undefined);
});

test('restart marks in-flight state interrupted without replaying work', async () => {
  const f = fixture(); await f.app.send('Auftrag', '1');
  const restarted = new AppController(f.options);
  assert.equal(restarted.snapshot().task.status, 'interrupted');
  assert.equal(f.runs(), 1);
  assert.equal(restarted.snapshot().messages[0].text, 'Auftrag');
});

test('Stop stays stopping until confirmed, ignores late output and blocks new work', async () => {
  const f = fixture(); await f.app.send('Auftrag', '1');
  let resolve!: () => void;
  f.setStop(() => new Promise<void>(r => { resolve = r; }));
  const stopping = f.app.stop();
  assert.equal(f.app.snapshot().task.status, 'stopping');
  f.app.handle({ type: 'delta', text: 'Diese verspätete Antwort darf nicht sprechen.' });
  assert.equal(f.app.snapshot().messages[1].text, '');
  await assert.rejects(f.app.send('Neue Arbeit', '2'), /bereits/);
  resolve(); await stopping;
  assert.equal(f.app.snapshot().task.status, 'interrupted');
  f.app.handle({ type: 'completed', status: 'completed', text: 'Zu spät.' });
  assert.equal(f.app.snapshot().task.status, 'interrupted');
  assert.equal(f.app.snapshot().messages[1].text, 'Auftrag gestoppt.');
});

test('failed Stop never claims success and can be retried', async () => {
  const f = fixture(); await f.app.send('Auftrag', '1');
  f.setStop(async () => { throw new Error('Prozessende unbekannt'); });
  await assert.rejects(f.app.stop(), /unbekannt/);
  assert.equal(f.app.snapshot().task.status, 'stopping');
  f.setStop(async () => {}); await f.app.stop();
  assert.equal(f.stops(), 2);
  assert.equal(f.app.snapshot().task.status, 'interrupted');
});

test('Stop cancels provider work even without a connected agent', async () => {
  const f = fixture();
  f.app.handle({ type: 'connection', status: 'missing' });
  const transcription = f.app.transcribe({ base64: '', mimeType: 'audio/wav' });
  const rejected = assert.rejects(transcription, /Abgebrochen/);
  await f.app.stop(); await rejected;
  assert.equal(f.stops(), 1);
});

test('explicit Stop reaches retained agent processes after a completed answer', async () => {
  const f = fixture(); await f.app.acknowledgeFullAccess();
  await f.app.send('Starte Hintergrundarbeit', '1');
  f.app.handle({ type: 'completed', status: 'completed', text: 'Gestartet.' });
  const before = f.stops();
  await f.app.stop();
  assert.equal(f.stops(), before + 1); assert.equal(f.app.snapshot().task.status, 'completed');
  assert.equal(f.app.snapshot().messages.at(-1)?.text, 'Gestartet.');
});

test('known secrets are removed from snapshots and persisted activity', async () => {
  const f = fixture(); const secret = 'YWJjZGVmZ2hpamtsbW5vcA==';
  await f.app.saveSpeechKey(secret);
  f.app.reportError(new Error(`Fehler mit ${secret}`));
  assert.ok(!JSON.stringify(f.app.snapshot()).includes(secret));
  assert.ok(!JSON.stringify(f.saved()).includes(secret));
});

test('disk failure cannot prevent Stop or process disposal', async () => {
  const f = fixture(); await f.app.send('Auftrag', '1');
  let disposals = 0; f.options.agent.dispose = async () => { disposals++; };
  f.options.store.save = () => { throw new Error('Datenträger voll'); };
  await f.app.stop();
  assert.equal(f.stops(), 1);
  assert.equal(f.app.snapshot().task.status, 'interrupted');
  await assert.rejects(f.app.dispose(), /Datenträger/);
  assert.equal(disposals, 1, 'disk failure is reported only after the process has been disposed');
  assert.ok(f.app.snapshot().activity.some(e => e.title.includes('nicht gespeichert')));
});

test('failed intent persistence never submits work and preserves retryability', async () => {
  const f = fixture(); const save = f.options.store.save;
  f.options.store.save = () => { throw new Error('Schreibfehler'); };
  await assert.rejects(f.app.send('Auftrag', '1'), /Schreibfehler/);
  assert.equal(f.runs(), 0); assert.equal(f.app.snapshot().messages.length, 0);
  f.options.store.save = save; await f.app.send('Auftrag', '1');
  assert.equal(f.runs(), 1);
});

test('split secret deltas never appear in snapshots; complete reply is redacted', async () => {
  const f = fixture(); const key = 'YWJjZGVmZ2hpamtsbW5vcA==';
  await f.app.saveSpeechKey(key); await f.app.send('Auftrag', '1');
  f.app.handle({ type: 'delta', text: `Hier: ${key.slice(0, 12)}` });
  assert.ok(!JSON.stringify(f.app.snapshot()).includes(key.slice(0, 12)));
  f.app.handle({ type: 'delta', text: key.slice(12) });
  assert.equal(f.saved().messages[1].text, '');
  f.app.handle({ type: 'completed', status: 'completed', text: `Hier: ${key}` });
  assert.ok(!JSON.stringify(f.app.snapshot()).includes(key));
});

test('full access requires explicit durable consent and cannot be enabled through preference patches', async () => {
  const f = fixture(); const state = f.saved(); state.preferences.fullAccessAcknowledged = false;
  const app = new AppController({ ...f.options, store: { ...f.options.store, load: () => state } });
  app.handle({ type: 'connection', status: 'ready' }); app.handle({ type: 'models', models: [{ id: 'test-model', label: 'Test' }] });
  await assert.rejects(app.send('Auftrag', 'before-consent'), /Vollzugriff/);
  await assert.rejects(app.savePreferences({ fullAccessAcknowledged: true }), /ausdrücklich/);
  await app.acknowledgeFullAccess(); await app.acknowledgeFullAccess();
  assert.equal(f.saved().preferences.fullAccessAcknowledged, true);
  await app.send('Auftrag', 'after-consent'); assert.equal(f.runs(), 1);
});

test('failed consent persistence never enables full access', async () => {
  const f = fixture(); const state = f.saved(); state.preferences.fullAccessAcknowledged = false;
  const broken = f.options.store;
  const other = new AppController({ ...f.options, store: { load: () => structuredClone(state), save: value => broken.save(value) } });
  broken.save = () => { throw new Error('Datenträger voll'); };
  await assert.rejects(other.acknowledgeFullAccess(), /Datenträger/);
  assert.equal(other.snapshot().preferences.fullAccessAcknowledged, false);
});

test('provider changes refresh public models, isolate secrets and cannot race an admitted task', async () => {
  const f = fixture(); let key = ''; let configured = false; let verified = false;
  let release: (() => void) | undefined;
  const options = { ...f.options, providers: {
    list: () => [{ id: 'test', label: 'Testanbieter', configured, verified, models: [{ id: 'test/model', label: 'Modell', provider: 'test' }] }],
    async save(input: { apiKey?: string }) { key = input.apiKey ?? key; if (release === undefined) await new Promise<void>(done => { release = done; }); configured = true; },
    async test() { verified = true; }, async remove() { configured = false; key = ''; }, secrets: () => key ? [key] : [],
  } };
  const app = new AppController(options);
  assert.equal(app.snapshot().connections.agent, 'missing');
  const saving = app.saveProvider({ id: 'test', apiKey: 'synthetic-secret-provider-token' });
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(app.send('Während Einrichtung', 'race'), /geändert/);
  await assert.rejects(app.removeProvider('test'), /geändert/);
  release!(); await saving;
  assert.equal(app.snapshot().preferences.dialogModel, 'test/model');
  assert.equal(app.snapshot().preferences.memoryModel, 'test/model');
  assert.equal(app.snapshot().connections.agent, 'ready');
  await app.testProvider('test'); assert.equal(app.snapshot().providers![0].verified, true);
  app.reportError(new Error('Problem synthetic-secret-provider-token'));
  assert.ok(!JSON.stringify(app.snapshot()).includes('synthetic-secret-provider-token'));
  assert.ok(!JSON.stringify(f.saved()).includes('synthetic-secret-provider-token'));
  await app.send('Autorisiert', 'accepted');
  await assert.rejects(app.removeProvider('test'), /laufenden Auftrag/);
  await app.stop(); await app.removeProvider('test');
  assert.equal(app.snapshot().connections.agent, 'missing'); assert.deepEqual(app.snapshot().models, []);
});

test('a racing completed answer cannot turn an unconfirmed Stop into permission for new work', async () => {
  const f = fixture(); await f.app.send('Auftrag', 'one');
  let fail!: (error: Error) => void;
  f.setStop(async () => new Promise<void>((_resolve, reject) => { fail = reject; }));
  const stopping = f.app.stop();
  f.app.handle({ type: 'completed', status: 'completed', text: 'Zu spät.' });
  assert.equal(f.app.snapshot().task.status, 'stopping');
  fail(new Error('Ende nicht bestätigt')); await assert.rejects(stopping, /nicht bestätigt/);
  await assert.rejects(f.app.send('Neue Arbeit', 'two'), /bereits|Stopp/);
  assert.equal(f.app.snapshot().task.status, 'stopping');
  f.setStop(async () => {}); await f.app.stop();
  assert.equal(f.app.snapshot().task.status, 'interrupted');
});
