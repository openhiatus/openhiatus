import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppController } from '../src/main/controller';
import { MemoryStore } from '../src/main/memory';
import { defaultState } from '../src/main/storage';
import type { ChatGPTConnection, ProviderView } from '../src/shared/contracts';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
async function until(check: () => boolean) { for (let i = 0; i < 100 && !check(); i++) await tick(); assert.ok(check()); }
function authFixture() {
  let saved = defaultState(); saved.preferences.fullAccessAcknowledged = true;
  let status: ChatGPTConnection = { status: 'signed-out', planUsage: true };
  let app!: AppController, finish: (() => void) | undefined;
  let starts = 0, stops = 0, signIns = 0, signOuts = 0, cancellations = 0, runs = 0;
  const secret = 'synthetic-oauth-secret-do-not-publish';
  const chatgpt = {
    snapshot: () => structuredClone(status),
    async signIn() { signIns++; status = { status: 'signing-in', planUsage: true }; app.refreshChatGPT(); await new Promise<void>(resolve => { finish = resolve; }); },
    async cancelSignIn() { cancellations++; if (status.status === 'signing-in') { status = { status: 'signed-out', planUsage: true }; app.refreshChatGPT(); finish?.(); } },
    async signOut() { signOuts++; status = { status: 'signed-out', planUsage: true }; app.refreshChatGPT(); },
  };
  app = new AppController({
    store: { load: () => structuredClone(saved), save: value => { saved = structuredClone(value); } },
    credentials: { get() { return undefined; }, set() {}, remove() {} },
    speech: { async transcribe() { return ''; }, async synthesize() { return { base64: '', mimeType: '' }; }, async test() { return { base64: '', mimeType: '' }; } },
    agent: { async start() { starts++; }, async run() { runs++; }, async stop() { stops++; }, async dispose() {} }, chatgpt,
    providers: { list: (): ProviderView[] => [
      { id: 'api', label: 'API', configured: true, verified: true, authType: 'api-key', models: [{ id: 'api/model', label: 'API-Modell' }] },
      { id: 'chatgpt', label: 'ChatGPT', configured: status.status === 'signed-in', verified: status.status === 'signed-in', authType: 'chatgpt', account: status.account, models: [{ id: 'chatgpt/model', label: 'ChatGPT-Modell' }] },
    ], async save() {}, async test() {}, async remove() {}, secrets: () => [secret] },
    workspace: 'C:\\demo', publish() {},
  });
  return { app, saved: () => saved, counts: () => ({ starts, stops, signIns, signOuts, cancellations, runs }), secret,
    finish() { status = { status: 'signed-in', account: 'test@example.invalid', planUsage: true }; app.refreshChatGPT(); finish?.(); },
    refresh(value: ChatGPTConnection) { status = value; app.refreshChatGPT(); } };
}

test('ChatGPT sign-in state and cancellation stay public while token data and agent work remain isolated', async () => {
  const f = authFixture(); assert.equal(f.app.snapshot().chatgpt?.status, 'signed-out');
  assert.equal(f.app.snapshot().preferences.chatgptBackgroundUsage, false);
  const login = f.app.signInChatGPT(); assert.equal(f.app.snapshot().chatgpt?.status, 'signing-in');
  await assert.rejects(f.app.send('Noch nicht starten', 'during-login'), /geändert/);
  await f.app.cancelChatGPTSignIn(); await login;
  assert.equal(f.app.snapshot().chatgpt?.status, 'signed-out'); assert.equal(f.counts().stops, 0); assert.equal(f.counts().starts, 0);
  const second = f.app.signInChatGPT(); f.finish(); await second;
  assert.equal(f.app.snapshot().chatgpt?.status, 'signed-in'); assert.equal(f.app.snapshot().chatgpt?.account, 'test@example.invalid');
  assert.ok(f.app.snapshot().models.some(model => model.id === 'chatgpt/model'));
  f.refresh({ status: 'error', error: 'Failure ' + f.secret, planUsage: true });
  assert.ok(!JSON.stringify(f.app.snapshot()).includes(f.secret)); assert.ok(!JSON.stringify(f.saved()).includes(f.secret));
});

test('auth management refuses active work and token refresh never resets its session', async () => {
  const f = authFixture(); await f.app.send('Arbeit', 'work');
  f.app.handle({ type: 'started', threadId: 'active-thread', turnId: 'active-turn' });
  await assert.rejects(f.app.signInChatGPT(), /laufenden Auftrag/); await assert.rejects(f.app.signOutChatGPT(), /laufenden Auftrag/);
  assert.equal(f.counts().signIns, 0); assert.equal(f.counts().signOuts, 0); assert.equal(f.counts().stops, 0);
  f.refresh({ status: 'signed-in', account: 'refreshed@example.invalid', planUsage: true });
  assert.equal(f.app.snapshot().task.threadId, 'active-thread'); assert.equal(f.app.snapshot().task.turnId, 'active-turn');
  assert.equal(f.app.snapshot().task.status, 'running'); await f.app.stop();
  await f.app.signOutChatGPT(); assert.equal(f.counts().signOuts, 1);
});

test('global Stop and dispose cancel an outstanding browser login without restarting an agent afterward', async () => {
  for (const operation of ['stop', 'dispose'] as const) {
    const f = authFixture(); const login = f.app.signInChatGPT(); await f.app[operation](); await login;
    assert.ok(f.counts().cancellations >= 1); assert.equal(f.counts().starts, 0);
    assert.equal(f.app.snapshot().chatgpt?.status, 'signed-out');
  }
});

function summaryFixture(t: any, model: string, memoryModel: string) {
  const directory = mkdtempSync(join(tmpdir(), 'openhiatus-chatgpt-consent-'));
  const memory = new MemoryStore(directory);
  memory.capture([{ id: 'source', role: 'user', at: '2026-10-01T12:00:00.000Z', text: 'Eine synthetische offene Aufgabe.' }], 'test');
  let saved = defaultState(); saved.preferences = { ...saved.preferences, model, memoryModel, dialogModel: model, fullAccessAcknowledged: true, memoryAutoSummarize: false };
  const calls: Array<{ model: string; signal: AbortSignal }> = [];
  let agentStops = 0;
  const app = new AppController({ memory, store: { load: () => saved, save: value => { saved = structuredClone(value); } },
    credentials: { get() { return undefined; }, set() {}, remove() {} },
    speech: { async transcribe() { return ''; }, async synthesize() { return { base64: '', mimeType: '' }; }, async test() { return { base64: '', mimeType: '' }; } },
    agent: { async start() {}, async run() {}, async stop() { agentStops++; }, async dispose() {} },
    modelClient: { async complete(_prompt, selection, signal) { calls.push({ model: selection, signal }); return new Promise<string>(() => {}); } },
    workspace: directory, publish() {},
  });
  t.after(async () => { await app.dispose(); rmSync(directory, { recursive: true, force: true }); });
  return { app, calls, agentStops: () => agentStops };
}

test('automatic ChatGPT reports need separate opt-in, including fallback to the work model', async t => {
  for (const memory of ['chatgpt/model', '']) {
    const f = summaryFixture(t, 'chatgpt/model', memory);
    await assert.rejects(f.app.startMemorySummary('auto'), /ausdrückliche Freigabe/); assert.equal(f.calls.length, 0);
    await f.app.savePreferences({ chatgptBackgroundUsage: true }); await f.app.startMemorySummary('auto');
    await until(() => f.calls.length === 1); assert.equal(f.calls[0].model, 'chatgpt/model');
    await f.app.savePreferences({ chatgptBackgroundUsage: false });
    assert.equal(f.calls[0].signal.aborted, true); assert.equal(f.app.snapshot().summary?.status, 'interrupted');
    assert.equal(f.agentStops(), 0); await tick(); assert.equal(f.calls.length, 1);
  }
});

test('the ChatGPT background toggle never cancels explicit reports or automatic reports of other providers', async t => {
  const manual = summaryFixture(t, 'chatgpt/model', 'chatgpt/model');
  await manual.app.startMemorySummary(); await until(() => manual.calls.length === 1);
  await manual.app.savePreferences({ chatgptBackgroundUsage: false });
  assert.equal(manual.calls[0].signal.aborted, false); assert.equal(manual.app.snapshot().summary?.status, 'running');
  const api = summaryFixture(t, 'api/model', 'api/model');
  await api.app.startMemorySummary('auto'); await until(() => api.calls.length === 1);
  await api.app.savePreferences({ chatgptBackgroundUsage: false });
  assert.equal(api.calls[0].signal.aborted, false); assert.equal(api.app.snapshot().summary?.status, 'running');
});
