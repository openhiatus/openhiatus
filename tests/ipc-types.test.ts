import test from 'node:test';
import assert from 'node:assert/strict';
import { createIpcInvoker } from '../src/shared/ipc';
import { command } from '../src/main/ipc/command';
import type { Snapshot } from '../src/shared/contracts';

// Compiled by the repository typecheck. Each expected error protects command/result correlation.
if (false) {
  const call = createIpcInvoker(async () => ({ ok: true, value: undefined }));
  // @ts-expect-error Unknown commands are not callable.
  void call('reportError');
  // @ts-expect-error Send requires its request ID.
  void call('send', 'message');
  // @ts-expect-error Stop accepts no arguments.
  void call('stop', 'extra');
  // @ts-expect-error Snapshot is a typed DTO rather than any.
  const wrong: Promise<number> = call('snapshot');
  // @ts-expect-error Wire editMemory retains one typed request object.
  void call('editMemory', 'core', 'text', 1);
  // @ts-expect-error The actual result must match transcribe's string result.
  command('transcribe', 1, () => [{ base64: '', mimeType: 'audio/wav' }], () => ({ base64: '', mimeType: 'audio/wav' }));
  // @ts-expect-error A validated send tuple cannot contain a numeric request ID.
  command('send', 2, () => ['message', 42], () => {});
  // @ts-expect-error Full access is set only by acknowledgeFullAccess.
  void call('savePreferences', { fullAccessAcknowledged: true });
  void call('snapshot').then((state: Snapshot) => {
    // @ts-expect-error Frozen runtime instructions are not part of the UI job contract.
    void state.jobs?.[0].identityInstructions;
  });
}
test('a known command produces its declared result through an unknown transport response', async () => {
  const call = createIpcInvoker(async () => ({ ok: true, value: 'Präzise Grüße' }));
  const result: Promise<string> = call('transcribe', { base64: '', mimeType: 'audio/wav' });
  assert.equal(await result, 'Präzise Grüße');
});
