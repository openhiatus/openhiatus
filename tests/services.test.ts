import test from 'node:test';
import assert from 'node:assert/strict';
import { ServiceBroker, defineServiceOperation, type ServiceOperationContext } from '../src/main/modules/services';
import { createToolRegistry } from '../src/main/modules/tools';
import type { DynamicToolResponse } from '../src/shared/contracts';
import type { ServiceConnection, ServiceResult } from '../src/shared/services';

const read = (response: DynamicToolResponse) => JSON.parse(response.contentItems.filter(item => item.type === 'inputText').map(item => item.text).join(''));
const tick = () => new Promise<void>(done => setImmediate(done));
function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>(done => { resolve = done; });
  return { promise, resolve };
}
function query(input: unknown): { query: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(name => name !== 'query')
    || !('query' in input) || typeof input.query !== 'string' || !input.query.trim()) throw new Error('Adapter-private validation detail');
  return { query: input.query };
}
const schema = { type: 'object', additionalProperties: false, required: ['query'], properties: { query: { type: 'string' } } };
const connection = (provider: string, id: string, capabilities: string[]): ServiceConnection => ({ provider, id, account: `${id}@synthetic.example`,
  label: `Testkonto ${id}`, status: 'ready', capabilities });

function fixture() {
  const broker = new ServiceBroker();
  const calls: { input: string; context: ServiceOperationContext }[] = [];
  const writes: string[] = [];
  let answer: (input: { query: string }, context: ServiceOperationContext) => Promise<ServiceResult> = async (input, context) => ({
    data: { subject: `Ergebnis: ${input.query}` }, resources: [{ provider: context.provider, connectionId: context.connectionId, kind: 'message', id: 'message-1' }],
  });
  broker.register({ provider: 'mail', operations: [defineServiceOperation({
    id: 'search', capability: 'mail.read', effect: 'read', description: 'Durchsucht gezielt Nachrichten.', inputSchema: schema, validate: query,
    execute: async (input, context) => { calls.push({ input: input.query, context }); return answer(input, context); },
  }), defineServiceOperation({ id: 'send', capability: 'mail.send', effect: 'write', description: 'Sendet eine Nachricht.', inputSchema: schema, validate: query,
    execute: async input => { writes.push(input.query); return { data: 'sent' }; },
  })] });
  broker.register({ provider: 'calendar', operations: [defineServiceOperation({
    id: 'events', capability: 'events.read', effect: 'read', description: 'Liest Kalenderereignisse.', inputSchema: schema, validate: query,
    execute: async (input, context) => ({ data: [{ title: input.query, startsAt: '2026-10-21T10:00:00Z' }],
      resources: [{ provider: context.provider, connectionId: context.connectionId, kind: 'event', id: 'event-1' }] }),
  })] });
  broker.setConnection(connection('mail', 'private', ['mail.read', 'mail.send']));
  broker.setConnection(connection('mail', 'work', ['mail.read']));
  broker.setConnection(connection('calendar', 'shared', ['events.read']));
  const registry = createToolRegistry([broker.createReadTools('durable-job-1')]);
  const bind = (runId = 'run-1', role: 'worker' | 'dialog' = 'worker', signal = new AbortController().signal) => registry.bind({ runId, role, signal, emit: () => {} });
  return { broker, registry, bind, calls, writes, answer: (next: typeof answer) => { answer = next; } };
}

test('two services and multiple accounts use the same tool contract with fixed resource and job ownership', async t => {
  const f = fixture(); t.after(() => f.registry.dispose());
  const bound = f.bind();
  assert.equal(bound.definitions.length, 3);
  const mail = bound.definitions.find(tool => tool.description.includes('private@'))!;
  const calendar = bound.definitions.find(tool => tool.name.startsWith('service_calendar_'))!;
  const result = read(await bound.call(mail.name, { query: 'Grüße und Termine' }));
  assert.equal(result.connectionId, 'private'); assert.equal(result.jobId, 'durable-job-1'); assert.equal(result.operation, 'search');
  assert.equal(result.resources[0].id, 'message-1'); assert.equal(result.data.subject, 'Ergebnis: Grüße und Termine');
  assert.equal(f.calls[0].context.runId, 'run-1'); assert.equal(f.calls[0].context.connectionId, 'private');
  const event = read(await bound.call(calendar.name, { query: 'Besprechung' }));
  assert.equal(event.provider, 'calendar'); assert.equal(event.resources[0].kind, 'event');
  assert.equal(bound.definitions.some(tool => tool.name.includes('_send_')), false);
  assert.deepEqual(f.writes, []);
  await assert.rejects(bound.call(mail.name, { query: 'Test', connectionId: 'work', jobId: 'foreign' }));
  assert.equal(f.calls.length, 1, 'Model arguments cannot redirect the pinned account or host job.');
  const dialog = f.bind('dialog-run', 'dialog'); assert.deepEqual(dialog.definitions, []);
  await assert.rejects(dialog.call(mail.name, { query: 'Test' }));
});

test('public connection projection excludes auth objects and callers cannot mutate account capabilities', () => {
  const f = fixture();
  const internal = { ...connection('mail', 'private', ['mail.read', 'unknown']), accessToken: 'never-publish', refreshToken: 'private-refresh' };
  f.broker.setConnection(internal);
  const published = f.broker.connections();
  assert.ok(!JSON.stringify(published).includes('never-publish')); assert.ok(!JSON.stringify(published).includes('refreshToken'));
  const account = published.find(item => item.id === 'private')!;
  assert.deepEqual(account.capabilities, ['mail.read']); account.capabilities.push('mail.send'); account.account = 'changed';
  assert.deepEqual(f.broker.connections().find(item => item.id === 'private')!.capabilities, ['mail.read']);
  f.broker.dispose();
});

test('rights changes and reconnects revoke already bound tools; only a fresh run sees newly granted accounts', async t => {
  const f = fixture(); t.after(() => f.registry.dispose());
  const first = f.bind(), tool = first.definitions.find(item => item.description.includes('private@'))!;
  f.broker.setConnection(connection('mail', 'private', ['mail.read']));
  await assert.rejects(first.call(tool.name, { query: 'Old generation' })); assert.equal(f.calls.length, 0);
  const second = f.bind('run-2'); await second.call(tool.name, { query: 'New generation' });
  f.broker.setConnection({ ...connection('mail', 'private', []), status: 'reauth-required' });
  await assert.rejects(second.call(tool.name, { query: 'Expired' })); assert.equal(f.calls.length, 1);
  const third = f.bind('run-3'); assert.equal(third.definitions.some(item => item.name === tool.name), false);
  f.broker.setConnection(connection('mail', 'private', ['mail.read']));
  await assert.rejects(third.call(tool.name, { query: 'New accounts are not added mid-run' }));
});

test('disconnect, run Stop and broker disposal settle a noncooperative pending read and discard late results', async t => {
  for (const reason of ['disconnect', 'stop', 'dispose'] as const) {
    const f = fixture(); t.after(() => f.registry.dispose());
    const late = deferred<ServiceResult>(); f.answer(() => late.promise);
    const abort = new AbortController(), bound = f.bind('run', 'worker', abort.signal);
    const tool = bound.definitions.find(item => item.description.includes('private@'))!;
    const pending = bound.call(tool.name, { query: 'Wait' }); await tick();
    assert.equal(f.calls.length, 1);
    if (reason === 'disconnect') f.broker.removeConnection('mail', 'private');
    if (reason === 'stop') abort.abort();
    if (reason === 'dispose') f.broker.dispose();
    await assert.rejects(pending);
    assert.equal(f.calls[0].context.signal.aborted, true);
    late.resolve({ data: 'Do not publish' }); await tick();
    await assert.rejects(bound.call(tool.name, { query: 'Late retry' }));
  }
});

test('service failures do not expose private adapter exceptions; results are bounded and account-scoped', async t => {
  const f = fixture(); t.after(() => f.registry.dispose());
  const bound = f.bind(), tool = bound.definitions.find(item => item.description.includes('private@'))!;
  f.answer(async () => { throw new Error('Authorization: Bearer synthetic-private-secret'); });
  await assert.rejects(bound.call(tool.name, { query: 'Test' }), error => error instanceof Error && !error.message.includes('synthetic-private-secret'));
  f.answer(async () => ({ data: 'ä'.repeat(40000) })); await assert.rejects(bound.call(tool.name, { query: 'Too large' }), /begrenztes Ergebnis/);
  f.answer(async () => ({ data: { value: NaN } })); await assert.rejects(bound.call(tool.name, { query: 'Not JSON' }));
  for (const nested of [false, true]) {
    const failing = { get data(): ServiceResult['data'] { throw new Error('Authorization: Bearer synthetic-private-secret'); } };
    f.answer(async () => nested ? { data: failing } : failing);
    await assert.rejects(bound.call(tool.name, { query: 'Private projection failure' }),
      error => error instanceof Error && /begrenztes Ergebnis/.test(error.message) && !error.message.includes('synthetic-private-secret'));
  }
  f.answer(async () => ({ data: {}, resources: [{ provider: 'mail', connectionId: 'work', kind: 'message', id: 'foreign' }] }));
  await assert.rejects(bound.call(tool.name, { query: 'Wrong account' }));
  const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
  f.answer(async () => ({ data: cyclic as ServiceResult['data'] })); await assert.rejects(bound.call(tool.name, { query: 'Cycle' }));
  f.answer(async () => ({ data: { readable: true }, nextCursor: 'next-page', accessToken: 'not-domain-data' }));
  const result = read(await bound.call(tool.name, { query: 'Projected' }));
  assert.equal(result.nextCursor, 'next-page'); assert.equal(JSON.stringify(result).includes('not-domain-data'), false);
});

test('a read operation obeys the service time budget and duplicate registration is atomic', async t => {
  const broker = new ServiceBroker({ timeoutMs: 5 });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const operation = defineServiceOperation({ id: 'slow', capability: 'read', effect: 'read', description: 'Synthetic slow read', inputSchema: schema, validate: query,
    execute: async () => new Promise<ServiceResult>(done => { timer = setTimeout(() => done({ data: 'late' }), 100); }),
  });
  const adapter = { provider: 'synthetic', operations: [operation] };
  broker.register(adapter); assert.throws(() => broker.register(adapter));
  broker.setConnection(connection('synthetic', 'account', ['read']));
  const registry = createToolRegistry([broker.createReadTools('job')]);
  t.after(async () => { if (timer) clearTimeout(timer); broker.dispose(); await registry.dispose(); });
  const bound = registry.bind({ runId: 'run', role: 'worker', signal: new AbortController().signal, emit: () => {} });
  await assert.rejects(bound.call(bound.definitions[0].name, { query: 'Slow' }));
});
