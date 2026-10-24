import test from 'node:test';
import assert from 'node:assert/strict';
import type { Snapshot } from '../src/shared/contracts';
import { memoryFixture, snapshotFixture } from './ipc-fixtures';
import { createOpenhiatusApi, createIpcInvoker, decodeComputerFrame, decodeResponse, decodeSnapshot, isCommandName, type CommandName, type IpcClientTransport, type IpcEvents } from '../src/shared/ipc';

test('response envelopes and command-specific payloads are validated before client results are typed', async () => {
  for (const raw of [null, [], {}, { ok: 'yes', value: undefined }, { ok: true }, { ok: false, error: 42 }, { ok: true, value: undefined, apiKey: 'secret' }]) {
    assert.throws(() => decodeResponse('stop', raw), /Ungültige/);
  }
  assert.throws(() => decodeResponse('transcribe', { ok: true, value: { text: 'wrong shape' } }), /Ungültige/);
  assert.throws(() => decodeResponse('snapshot', { ok: true, value: { ...snapshotFixture(), messages: [{ role: 'tool' }] } }), /Ungültige/);
  assert.throws(() => decodeResponse('snapshot', { ok: true, value: { ...snapshotFixture(), messages: new Array(1) } }), /Ungültige/);
  assert.throws(() => decodeResponse('readMemoryPeriod', { ok: true, value: { found: true, text: 'missing fields' } }), /Ungültige/);
  assert.throws(() => decodeResponse('saveProvider', { ok: false, error: 'Bereinigte Meldung' }), /Bereinigte Meldung/);
  const call = createIpcInvoker(async () => ({ ok: true, value: 99 })); await assert.rejects(call('transcribe', { base64: '', mimeType: 'audio/wav' }));
  assert.equal(isCommandName('__proto__'), false); assert.equal(isCommandName('constructor'), false); assert.equal(isCommandName('send'), true);
});

test('snapshot projection strips private fields at every exposed row while preserving public source and usage context', () => {
  const raw = { ...snapshotFixture(), credentials: { key: 'private' },
    messages: [{ ...snapshotFixture().messages[0], providerToken: 'private', source: 'agent', jobId: 'job' }],
    providers: [{ id: 'openai', label: 'OpenAI', configured: true, verified: false, models: [], apiKey: 'private', auth: { refreshToken: 'private' } }],
    jobs: [{ id: 'job', requestId: 'request', title: 'Auftrag', prompt: 'Quelle', status: 'completed', createdAt: '', updatedAt: '', model: 'local/test', resources: ['desktop'],
      runtimeRetained: true, result: 'Ergebnis', identityInstructions: 'private', process: { pid: 42 }, usage: { inputTokens: 2, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.1, apiKey: 'private' } }],
  };
  const projected = decodeSnapshot(raw); assert.ok(!JSON.stringify(projected).includes('private'));
  assert.equal(projected.messages[0].source, 'agent'); assert.equal(projected.messages[0].jobId, 'job');
  assert.equal(projected.jobs?.[0].runtimeRetained, true); assert.equal(projected.jobs?.[0].usage?.costUsd, 0.1);
  assert.equal(projected.jobs?.[0].prompt, 'Quelle'); assert.equal(projected.jobs?.[0].result, 'Ergebnis');
  assert.equal(Object.hasOwn(projected.jobs?.[0] ?? {}, 'identityInstructions'), false);
  assert.deepEqual(decodeResponse('snapshot', { ok: true, value: projected }), projected);
});

test('memory DTO projection preserves versions/provenance and discards undeclared store fields', () => {
  const raw = memoryFixture();
  const projected = decodeResponse('memorySnapshot', { ok: true, value: { ...raw, sources: [{ token: 'private' }], documents: raw.documents.map(document => ({ ...document,
    secret: 'private', history: document.history.map(revision => ({ ...revision, token: 'private' })) })) } });
  assert.deepEqual(projected, raw); assert.ok(!JSON.stringify(projected).includes('private'));
  assert.equal(decodeResponse('memorySource', { ok: true, value: undefined }), undefined);
  assert.throws(() => decodeResponse('memorySnapshot', { ok: true, value: { ...raw, documents: [{ ...raw.documents[0], version: 'one' }] } }));
});

test('the public client keeps the existing wire shape and event subscriptions expose only validated DTOs', async () => {
  const invocations: { name: CommandName; args: readonly unknown[] }[] = [], listeners = new Map<keyof IpcEvents, (payload: unknown) => void>();
  let unsubscriptions = 0;
  const transport: IpcClientTransport = {
    invoke: async (name, args) => { invocations.push({ name, args }); return { ok: true, value: name === 'snapshot' ? snapshotFixture() : name === 'editMemory' ? memoryFixture() : undefined }; },
    subscribe: (channel, listener) => { listeners.set(channel, listener); return () => { unsubscriptions++; listeners.delete(channel); }; },
    publishActivityPresence: () => {},
  };
  const api = createOpenhiatusApi(transport); await api.snapshot(); await api.send('Hallo', 'request'); await api.editMemory('core', 'Neue Fassung', 1);
  assert.deepEqual(invocations.map(call => call.name), ['snapshot', 'send', 'editMemory']);
  assert.deepEqual(invocations[2].args, [{ id: 'core', content: 'Neue Fassung', expectedVersion: 1 }]);
  const snapshots: Snapshot[] = []; const unsubscribe = api.subscribe(state => { snapshots.push(state); });
  listeners.get('openhiatus:state')?.({ invalid: true }); assert.equal(snapshots.length, 0);
  listeners.get('openhiatus:state')?.({ ...snapshotFixture(), credential: 'private' }); assert.deepEqual(snapshots, [snapshotFixture()]);
  let callbackArguments: unknown[] = [];
  const stop = api.onStop((...args: unknown[]) => { callbackArguments = args; });
  listeners.get('openhiatus:emergency-stop')?.(undefined); assert.deepEqual(callbackArguments, []);
  listeners.get('openhiatus:emergency-stop')?.({ sender: 'not exposed' }); assert.deepEqual(callbackArguments, []);
  unsubscribe(); stop(); assert.equal(unsubscriptions, 2); assert.equal(listeners.size, 0);
});

test('computer frames project metadata and reject malformed geometry or non-image URLs', () => {
  const frame = { dataUrl: 'data:image/png;base64,synthetic', frameId: 'frame', width: 2, height: 3, at: '' };
  assert.deepEqual(decodeComputerFrame({ ...frame, nativeSession: 'private' }), frame);
  assert.throws(() => decodeComputerFrame({ ...frame, dataUrl: 'file:///secret' }));
  assert.throws(() => decodeComputerFrame({ ...frame, width: -1 })); assert.throws(() => decodeComputerFrame({ ...frame, height: 0 }));
});

test('the frame transport accepts the complete native image limit including its PNG data URL prefix', () => {
  const base64 = 'A'.repeat(56_000_000), frame = { dataUrl: `data:image/png;base64,${base64}`, frameId: 'frame', width: 1, height: 1, at: '' };
  assert.equal(decodeComputerFrame(frame).dataUrl.length, base64.length + 'data:image/png;base64,'.length);
  assert.throws(() => decodeComputerFrame({ ...frame, dataUrl: `${frame.dataUrl}A` }));
});
