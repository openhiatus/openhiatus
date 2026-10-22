import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelManagementCoordinator, type ModelManagementPorts, type ModelManagementState } from '../src/main/modules/models';
import type { ChatGPTConnection, ProviderView } from '../src/shared/contracts';

function fixture(withProvider = true) {
  let roster: ProviderView[] = [{ id: 'api', label: 'API', configured: true, verified: true, models: [{ id: 'api/one', label: 'One' }] }];
  let keys = ['synthetic-old-key'], auth: ChatGPTConnection = { status: 'signed-out', planUsage: true };
  let active = false, closed = false, revision = 0, invalidations = 0, starts = 0, stops = 0;
  let save = async (_key?: string) => {}, signIn = async () => {}, cancel = async () => {};
  const published: ModelManagementState[] = [];
  let models!: ModelManagementCoordinator;
  const ports: ModelManagementPorts = {
    providers: withProvider ? {
      list: () => roster, secrets: () => keys,
      async save(input) { await save(input.apiKey); if (input.apiKey) keys = [input.apiKey]; }, async test() {}, async remove() { roster = []; keys = []; },
    } : undefined,
    chatgpt: { snapshot: () => auth, signIn: () => signIn(), cancelSignIn: () => cancel(), async signOut() { auth = { status: 'signed-out', planUsage: true }; } },
    lifecycle: {
      assertIdle() { if (active) throw new Error('Bitte zuerst den laufenden Auftrag stoppen.'); }, closed: () => closed,
      workRevision: () => revision, taskActive: () => active, invalidateThread: () => { invalidations++; },
      async stopIdleRuntimes() { stops++; }, async restart() { starts++; },
    },
    projection: { publish(state) { published.push(state); }, changed() {} },
    clean(text) { assert.ok(models, 'composition assigns the owner before initialization invokes redaction'); for (const secret of models.secrets()) text = text.replaceAll(secret, '[entfernt]'); return text; },
  };
  models = new ModelManagementCoordinator({ model: 'saved-missing', dialogModel: '', memoryModel: '' }, ports);
  return { models, ports, published, auth: (next: ChatGPTConnection) => { auth = next; }, active: (value: boolean) => { active = value; },
    advanceWork: () => { revision++; }, closed: () => { closed = true; }, counts: () => ({ starts, stops, invalidations }),
    save: (next: typeof save) => { save = next; }, signIn: (next: typeof signIn) => { signIn = next; }, cancel: (next: typeof cancel) => { cancel = next; } };
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test('model initialization discovers secrets before auth projection and retains removed keys while owning copied state', async () => {
  const f = fixture(); assert.equal(f.published.length, 0);
  f.auth({ status: 'error', planUsage: true, account: 'synthetic-old-key', error: 'Failure synthetic-old-key' });
  f.models.initialize();
  assert.equal(f.models.snapshot().chatgpt?.account, '[entfernt]'); assert.equal(f.models.snapshot().chatgpt?.error, 'Failure [entfernt]');
  f.published[0].models[0].id = 'external-mutation';
  assert.equal(f.models.snapshot().models[0].id, 'api/one');
  await f.models.removeProvider('api');
  f.models.refreshChatGPT();
  assert.ok(f.models.secrets().includes('synthetic-old-key')); assert.equal(f.models.snapshot().chatgpt?.error, 'Failure [entfernt]');
});

test('runtime models and connection events work without a provider adapter and preserve independent role selections', () => {
  const f = fixture(false); f.models.initialize();
  f.models.handle({ type: 'models', models: [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }] });
  f.models.select({ model: 'two' });
  assert.deepEqual(f.models.snapshot().selections, { model: 'two', dialogModel: 'one', memoryModel: 'one' });
  assert.throws(() => f.models.select({ memoryModel: 'unknown' }), /nicht verfügbar/);
  f.models.handle({ type: 'connection', status: 'ready', account: 'Test account' });
  f.models.offline(); assert.equal(f.models.snapshot().account, 'Test account'); assert.equal(f.models.snapshot().agent, 'offline');
  f.models.handle({ type: 'models', models: [{ id: 'two', label: 'Two' }] });
  assert.deepEqual(f.models.snapshot().selections, { model: 'two', dialogModel: 'two', memoryModel: 'two' });
});

test('provider mutations own the update lock and release it after success or failure without losing captured secrets', async () => {
  const f = fixture(); f.models.initialize(); let release!: () => void;
  f.save(async () => new Promise<void>(resolve => { release = resolve; }));
  const saving = f.models.saveProvider({ id: 'api', apiKey: 'synthetic-new-key' }); await tick();
  assert.equal(f.models.snapshot().agent, 'connecting'); assert.throws(() => f.models.assertUnlocked(), /geändert/);
  await assert.rejects(f.models.removeProvider('api'), /geändert/); assert.ok(f.models.secrets().includes('synthetic-new-key'));
  release(); await saving; f.models.assertUnlocked(); assert.equal(f.counts().starts, 1); assert.equal(f.counts().stops, 1);
  f.save(async () => { throw new Error('Save failed'); }); await assert.rejects(f.models.saveProvider({ id: 'api' }), /Save failed/);
  f.models.assertUnlocked(); assert.equal(f.counts().starts, 1);
});

test('account refresh never invalidates an active turn and cancelled sign-in cannot restart a runtime', async () => {
  const f = fixture(); f.models.initialize(); f.active(true);
  f.auth({ status: 'signed-in', planUsage: true, account: 'refreshed' }); f.models.refreshChatGPT();
  assert.equal(f.counts().invalidations, 0); await assert.rejects(f.models.signInChatGPT(), /laufenden Auftrag/);
  f.active(false); let release!: () => void;
  f.signIn(async () => new Promise<void>(resolve => { release = resolve; })); f.cancel(async () => { release(); });
  const signing = f.models.signInChatGPT(); await f.models.cancelChatGPTSignIn(); await signing;
  assert.equal(f.counts().starts, 0); f.models.assertUnlocked();
});

test('work interruption prevents late account and provider completions from restarting the runtime', async () => {
  for (const operation of ['account', 'provider'] as const) {
    const f = fixture(); f.models.initialize(); let release!: () => void;
    if (operation === 'account') f.signIn(async () => new Promise<void>(resolve => { release = resolve; }));
    else f.save(async () => new Promise<void>(resolve => { release = resolve; }));
    const changing = operation === 'account' ? f.models.signInChatGPT() : f.models.saveProvider({ id: 'api' }); await tick();
    f.advanceWork(); release(); await changing;
    assert.equal(f.counts().starts, 0); f.models.assertUnlocked();
  }
});
