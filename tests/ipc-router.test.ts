import test from 'node:test';
import assert from 'node:assert/strict';
import { createIpcRouter, type IpcControllerPort, type IpcPorts } from '../src/main/ipc';
import { createOpenhiatusApi, decodeResponse, isCommandName, type CommandArgs, type CommandName } from '../src/shared/ipc';
import type { MemoryPeriodPage } from '../src/shared/memory';
import { memoryFixture, snapshotFixture } from './ipc-fixtures';

function fixture() {
  const calls: { name: string; args: readonly unknown[] }[] = [], errors: unknown[] = [];
  const capture = (name: string) => async (...args: readonly unknown[]) => { calls.push({ name, args }); };
  const memory = memoryFixture(), snapshot = snapshotFixture(), period: MemoryPeriodPage = { found: false, documentId: 'day:2026-10-20', text: 'Nicht vorhanden', sourceIds: [], sourceCount: 0, offset: 0, totalBytes: 0 };
  const audio = { base64: 'synthetic', mimeType: 'audio/mpeg' };
  const controller: IpcControllerPort = {
    snapshot: () => snapshot, send: capture('send'), stop: capture('stop'), stopJob: capture('stopJob'), savePreferences: capture('savePreferences'), acknowledgeFullAccess: capture('acknowledgeFullAccess'),
    signInChatGPT: capture('signInChatGPT'), cancelChatGPTSignIn: capture('cancelChatGPTSignIn'), signOutChatGPT: capture('signOutChatGPT'),
    saveProvider: capture('saveProvider'), testProvider: capture('testProvider'), removeProvider: capture('removeProvider'),
    listSkills: () => ({ skills: [], errors: [], directory: 'C:\\Skills' }), saveSpeechKey: capture('saveSpeechKey'), removeSpeechKey: capture('removeSpeechKey'),
    testSpeech: () => audio, transcribe: async clip => { await capture('transcribe')(clip); return 'Präzise Grüße'; }, synthesize: () => audio, newConversation: capture('newConversation'),
    memorySnapshot: () => memory, rebuildMemory: () => memory, startMemorySummary: capture('startMemorySummary'), readMemoryPeriod: () => period, memorySource: () => undefined, searchMemory: () => [],
    editMemory: (id, content, expectedVersion) => { calls.push({ name: 'editMemory', args: [id, content, expectedVersion] }); return memory; }, decideMemoryProposal: () => memory,
  };
  const ports: IpcPorts = { controller, reportError: error => { errors.push(error); return 'Bereinigte Meldung'; }, platform: {
    stopActivityPresence: () => { calls.push({ name: 'stopActivityPresence', args: [] }); },
    openWorkspace: capture('openWorkspace'), openSkillsFolder: capture('openSkillsFolder'), openChatGPTUsage: capture('openChatGPTUsage'), revealFile: capture('revealFile'),
  } };
  return { ports, controller, calls, errors, snapshot, memory, router: createIpcRouter(ports) };
}

const validArgs: { [Name in CommandName]: CommandArgs<Name> } = {
  snapshot: [], send: ['Hallo', 'request'], stop: [], stopJob: ['job'], savePreferences: [{ speakReplies: false }], acknowledgeFullAccess: [],
  signInChatGPT: [], cancelChatGPTSignIn: [], signOutChatGPT: [], openChatGPTUsage: [], saveProvider: [{ id: 'local', models: ['test'] }], testProvider: ['local'], removeProvider: ['local'],
  listSkills: [], openSkillsFolder: [], saveSpeechKey: ['key'], removeSpeechKey: [], testSpeech: [], transcribe: [{ base64: '', mimeType: 'audio/wav' }], synthesize: ['Hallo'],
  openWorkspace: [], revealFile: ['result.txt'], newConversation: [], memorySnapshot: [], rebuildMemory: [], startMemorySummary: [], readMemoryPeriod: [{}],
  editMemory: [{ id: 'core', content: 'Neue Fassung', expectedVersion: 1 }], decideMemoryProposal: ['proposal', 'approve'], memorySource: ['source'], searchMemory: ['Grüße'],
};

test('device identity metadata is accepted and validated before preferences reach the application', async () => {
  const f = fixture();
  const patch = { inputDeviceId: 'usb-mic', inputDeviceLabel: 'USB Studio Microphone', inputDeviceGroupId: 'usb-group', outputDeviceId: 'usb-speaker', outputDeviceLabel: 'USB Studio Headphones', outputDeviceGroupId: 'usb-group' };
  assert.equal((await f.router.dispatch('savePreferences', [patch])).ok, true);
  assert.deepEqual(f.calls.at(-1), { name: 'savePreferences', args: [patch] });
  for (const value of [42, null, {}, 'x'.repeat(1001)]) {
    assert.equal((await f.router.dispatch('savePreferences', [{ inputDeviceLabel: value }])).ok, false);
  }
  assert.equal(f.calls.length, 1);
});

test('workspace appearance preferences cross the typed boundary only with valid values', async () => {
  const f = fixture(), patch = { sidebarMode: 'collapsed', activityOverlayEnabled: true, activityOverlaySize: 160 };
  assert.equal((await f.router.dispatch('savePreferences', [patch])).ok, true);
  assert.deepEqual(f.calls.at(-1), { name: 'savePreferences', args: [patch] });
  for (const invalid of [{ sidebarMode: 'small' }, { sidebarMode: undefined }, { activityOverlayEnabled: 1 },
    { activityOverlaySize: 95 }, { activityOverlaySize: 321 }, { activityOverlaySize: 120.5 }]) {
    assert.equal((await f.router.dispatch('savePreferences', [invalid])).ok, false);
  }
  assert.equal(f.calls.length, 1);
  Object.assign(f.snapshot.preferences, patch);
  assert.deepEqual(decodeResponse('snapshot', await f.router.dispatch('snapshot', [])).preferences, f.snapshot.preferences);
});

test('the selected personality and complete custom templates cross the profile boundary atomically', async () => {
  const f = fixture(), profile = { name: 'Mira', personalityId: 'custom-office', templates: [{ id: 'custom-office', label: 'Büro', instructions: 'Klar und knapp.' }] };
  assert.equal((await f.router.dispatch('savePreferences', [{ assistantProfile: profile }])).ok, true);
  assert.deepEqual(f.calls.at(-1), { name: 'savePreferences', args: [{ assistantProfile: profile }] });
  for (const invalid of [null, undefined, { ...profile, personalityId: 'unknown' }, { ...profile, templates: [] }, { ...profile, extra: 'unknown' }]) {
    assert.equal((await f.router.dispatch('savePreferences', [{ assistantProfile: invalid }])).ok, false);
  }
  assert.equal(f.calls.length, 1); f.snapshot.preferences.assistantProfile = profile;
  assert.deepEqual(decodeResponse('snapshot', await f.router.dispatch('snapshot', [])).preferences.assistantProfile, profile);
});

test('every known command validates and produces its declared result through the same router/client contract', async () => {
  const f = fixture();
  for (const name of Object.keys(validArgs)) {
    assert.ok(isCommandName(name));
    const result = await f.router.dispatch(name, validArgs[name]); assert.equal(result.ok, true, name);
    assert.doesNotThrow(() => decodeResponse(name, result), name);
  }
  const api = createOpenhiatusApi({ invoke: (name, args) => f.router.dispatch(name, args), subscribe: () => () => {}, publishActivityPresence: () => {} });
  assert.deepEqual(await api.snapshot(), f.snapshot); assert.deepEqual(await api.memorySnapshot(), f.memory);
  assert.equal(await api.transcribe({ base64: '', mimeType: 'audio/wav' }), 'Präzise Grüße');
  await api.editMemory('core', 'Geändert', 1); assert.deepEqual(f.calls.at(-1), { name: 'editMemory', args: ['core', 'Geändert', 1] });
});

test('unknown names, non-array arguments and wrong arity cannot reach any application or platform operation', async () => {
  const f = fixture();
  for (const name of ['__proto__', 'constructor', 'reportError', 'dispose', 'dialogTool', null, {}, 42]) assert.equal((await f.router.dispatch(name, [])).ok, false);
  for (const args of [undefined, null, {}, 'text']) assert.equal((await f.router.dispatch('stop', args)).ok, false);
  for (const [name, args] of Object.entries(validArgs)) {
    const invalid = [...args, 'unexpected']; assert.equal((await f.router.dispatch(name, invalid)).ok, false, name);
  }
  assert.deepEqual(f.calls, []); assert.ok(f.errors.length > 0);
});

test('feature validation rejects malformed inputs and reserved preference writes before side effects', async () => {
  const f = fixture();
  const invalid: [CommandName, unknown][] = [
    ['send', ['', 'id']], ['send', ['text', 1]], ['send', ['x'.repeat(12001), 'id']],
    ['savePreferences', [{ fullAccessAcknowledged: true }]], ['savePreferences', [{ model: false }]], ['savePreferences', [{ earcons: 'yes' }]], ['savePreferences', [new Date()]],
    ['savePreferences', [{ skillFavorites: { bad: 'unknown' } }]], ['saveProvider', [{ id: 'local', token: 'extra' }]], ['saveProvider', [{ id: 'local', models: [42] }]],
    ['saveProvider', [{ id: 'local', models: new Array(1) }]],
    ['transcribe', [{ base64: 'x', mimeType: 'video/webm' }]], ['transcribe', [{ base64: 'x', mimeType: 'audio/wav', script: 'extra' }]],
    ['readMemoryPeriod', [{ maxBytes: 511 }]], ['readMemoryPeriod', [{ maxBytes: 10001 }]], ['readMemoryPeriod', [{ cursor: 42 }]], ['readMemoryPeriod', [{ token: 'extra' }]],
    ['editMemory', [{ id: 'core', content: 'text', expectedVersion: 0 }]], ['editMemory', [{ id: 'core', content: 'text', expectedVersion: 1, approve: true }]],
    ['decideMemoryProposal', ['proposal', 'anything']], ['searchMemory', [42]], ['revealFile', ['   ']],
  ];
  for (const [name, args] of invalid) assert.deepEqual(await f.router.dispatch(name, args), { ok: false, error: 'Bereinigte Meldung' }, name);
  assert.deepEqual(f.calls, []);
});

test('validated handlers preserve normalization, explicit acknowledgement and Stop overlay ordering', async () => {
  const f = fixture();
  await f.router.dispatch('send', [' Grüße ', ' request ']);
  assert.deepEqual(f.calls.at(-1), { name: 'send', args: ['Grüße', 'request'] });
  await f.router.dispatch('saveProvider', [{ id: ' local ', apiKey: ' key ', baseUrl: ' http://localhost ', models: [' model '] }]);
  assert.deepEqual(f.calls.at(-1), { name: 'saveProvider', args: [{ id: 'local', apiKey: 'key', baseUrl: 'http://localhost', models: ['model'] }] });
  await f.router.dispatch('stop', []); assert.deepEqual(f.calls.slice(-2).map(call => call.name), ['stopActivityPresence', 'stop']);
  await f.router.dispatch('acknowledgeFullAccess', []); assert.equal(f.calls.at(-1)?.name, 'acknowledgeFullAccess');
});

test('outbound projection happens in the main handler before the transport receives the envelope', async () => {
  const f = fixture();
  f.controller.snapshot = () => ({ ...f.snapshot, credentials: { token: 'private' }, jobs: [{ id: 'job', requestId: 'request', title: '', prompt: '', status: 'completed',
    createdAt: '', updatedAt: '', model: '', resources: [], identityInstructions: 'private' }] });
  const result = await f.router.dispatch('snapshot', []); assert.equal(result.ok, true); assert.ok(!JSON.stringify(result).includes('private'));
  f.controller.testSpeech = () => { throw new Error('private-provider-secret'); };
  assert.deepEqual(await f.router.dispatch('testSpeech', []), { ok: false, error: 'Bereinigte Meldung' });
});
