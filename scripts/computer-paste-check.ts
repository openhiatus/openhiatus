/** Opt-in native paste check; starts its own auto-closing fixture, never targets existing windows. */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadComputerDriver } from '../src/main/computer-driver-loader.js';
import { pasteComputerText } from '../src/main/computer.js';

assert.equal(process.env.OPENHIATUS_COMPUTER_PASTE_CHECK, '1', 'Opt-in required: uses system clipboard and its own visible fixture.');
const directory = path.resolve('.test-data', 'clipboard-' + new Date().toISOString().replace(/[:.]/g, '-'));
const executable = path.join(directory, 'openhiatus Clipboard-Test.exe');
const statePath = path.join(directory, 'Clipboard-Fixture-State.json');
await mkdir(directory, { recursive: true });
await mkdir('artifacts', { recursive: true });
const compiler = path.join(process.env.SystemRoot || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
execFileSync(compiler, ['/nologo', '/target:winexe', '/utf8output', '/codepage:65001', `/out:${executable}`,
  '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', '/reference:System.Web.Extensions.dll',
  fileURLToPath(new URL('./fixtures/OpenhiatusClipboardFixture.cs', import.meta.url)),
], { windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const child = spawn(executable, [directory], { cwd: directory, windowsHide: false, stdio: 'ignore' });
await new Promise<void>((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
child.unref();
type State = { pid: number; processStartedAt: string; foreground: boolean; inputFocused: boolean;
  handle: string; foregroundHandle: string; text: string; pasteCount: number; enterCount: number; sample: number; focusChanges: unknown[];
  inputX: number; inputY: number; ownInputAtPoint: boolean };
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function state(): Promise<State> { return JSON.parse(await readFile(statePath, 'utf8')); }
async function waitState(predicate: (value: State) => boolean, timeoutMs = 5000): Promise<State> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const current = await state(); if (predicate(current)) return current; } catch { /* Atomic fixture writes can briefly race a read. */ }
    await sleep(30);
  }
  throw new Error('Own fixture did not reach the expected state; no further keyboard action admitted.');
}
const evidence: Record<string, unknown> = { started: new Date().toISOString(), executable, pid: child.pid };
const sdk = await loadComputerDriver();
const mode = sdk.SessionPermissionMode.Unrestricted;
const runtime = sdk.CuaDriver.createConfigured({ claudeCodeCompatibility: false, authorization: {
  allowedModes: [mode], compatibilityMode: mode, unrestrictedAcknowledged: true,
  maxSessionTtlSeconds: 3600n, maxIdleTtlSeconds: 300n,
} });
const session = sdk.createTrustedSession(runtime, { publicSession: 'openhiatus-paste-check', mode, ttlSeconds: 60n, idleTtlSeconds: 60n });
const common = { session: 'openhiatus-paste-check', target: sdk.ActionTarget.Desktop.new({ displayId: 'primary' }) };
const controller = new AbortController();
try {
  const ready = await waitState(value => value.pid === child.pid && value.foreground && value.inputFocused);
  const provenance = JSON.parse(execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-Command',
    `Get-CimInstance Win32_Process -Filter 'ProcessId=${child.pid}' | Select-Object ExecutablePath,CreationDate | ConvertTo-Json -Compress`],
  { windowsHide: true, encoding: 'utf8' }));
  assert.equal(provenance.ExecutablePath.toLowerCase(), executable.toLowerCase());
  const creationDate = /^\/Date\((\d+)\)\/$/.exec(provenance.CreationDate);
  assert.ok(creationDate, 'Expected a precise CIM creation date for the newly launched process.');
  assert.ok(Math.abs(Number(creationDate[1]) - Date.parse(ready.processStartedAt)) <= 2,
    'Fixture PID was reused or its process start does not match the independently queried process.');
  evidence.provenance = provenance;
  async function ownFocus(): Promise<State> {
    const current = await state();
    assert.equal(current.pid, ready.pid);
    assert.equal(current.processStartedAt, ready.processStartedAt);
    assert.equal(current.foreground, true, 'Clipboard path changed foreground; refuse Ctrl+V.');
    assert.equal(current.inputFocused, true, 'Own fixture input lost focus; refuse Ctrl+V.');
    return current;
  }
  await session.startSession({ session: common.session }, { signal: controller.signal });
  const beforeScreenshot = await ownFocus();
  const capture = await session.getDesktopState({ session: common.session }, { signal: controller.signal });
  assert.equal(capture.isError, false);
  await waitState(value => value.sample > beforeScreenshot.sample);
  const afterScreenshot = await ownFocus();
  assert.equal(afterScreenshot.ownInputAtPoint, true, 'No click when another window covers the fixture point.');
  const click = await session.click({ ...common, x: afterScreenshot.inputX, y: afterScreenshot.inputY,
    button: sdk.ClickButton.Left, count: 1 }, { signal: controller.signal });
  assert.equal(click.isError, false);
  await waitState(value => value.sample > afterScreenshot.sample);
  await ownFocus();
  const afterClickCapture = await session.getDesktopState({ session: common.session }, { signal: controller.signal });
  assert.equal(afterClickCapture.isError, false);
  await ownFocus();
  evidence.screenshotAndClickPreserveFocus = true;
  const text = 'Grüße äöü ÄÖÜ ß € 😀 „Zitat“\\Pfad\t Leerzeichen  \r\n' + 'Prüftext '.repeat(1100) + 'Ende  ';
  const checkpoints: Record<string, unknown>[] = [];
  const guarded = {
    async clipboardWrite(input: Parameters<typeof session.clipboardWrite>[0], options?: Parameters<typeof session.clipboardWrite>[1]) {
      const before = await ownFocus();
      const result = await session.clipboardWrite(input, options);
      const written = JSON.parse(result.structuredJson ?? '{}');
      checkpoints.push({ phase: 'clipboard', supported: written.supported, writtenType: written.written_type });
      // Await a fresh fixture sample so clipboard-induced focus changes cannot be hidden by stale evidence.
      await waitState(value => value.sample > before.sample);
      const after = await ownFocus();
      checkpoints.push({ phase: 'after-clipboard', foreground: after.foreground, focused: after.inputFocused });
      return result;
    },
    async pressKey(input: Parameters<typeof session.pressKey>[0], options?: Parameters<typeof session.pressKey>[1]) {
      await ownFocus();
      checkpoints.push({ phase: 'paste', key: input.key, modifiers: input.modifiers });
      return session.pressKey(input, options);
    },
  };
  const begin = Date.now();
  const result = await pasteComputerText(guarded, common, text, controller.signal);
  evidence.pasteMs = Date.now() - begin;
  evidence.actionEffect = result.action?.effect;
  evidence.checkpoints = checkpoints;
  assert.equal(result.isError, false);
  const pasted = await waitState(value => value.text.length === text.length);
  assert.equal(pasted.text, text);
  assert.equal(pasted.pasteCount, 1);
  assert.equal(pasted.enterCount, 0);
  assert.equal(pasted.foreground, true);
  assert.equal(pasted.inputFocused, true);
  evidence.characters = text.length;
  evidence.afterPaste = { pasteCount: pasted.pasteCount, enterCount: pasted.enterCount, foreground: pasted.foreground,
    inputFocused: pasted.inputFocused, exactText: true, focusChanges: pasted.focusChanges };
  const abort = new AbortController();
  let secondPasteAttempted = false;
  await assert.rejects(pasteComputerText({
    async clipboardWrite(input, options) { const result = await guarded.clipboardWrite(input, options); abort.abort(); return result; },
    async pressKey(input, options) { secondPasteAttempted = true; return guarded.pressKey(input, options); },
  }, common, 'Stopp: nicht einfügen', abort.signal), /unterbrochen/);
  await sleep(100);
  const afterStop = await ownFocus();
  assert.equal(secondPasteAttempted, false);
  assert.equal(afterStop.text, text);
  assert.equal(afterStop.pasteCount, 1);
  assert.equal(afterStop.enterCount, 0);
  evidence.stopBetweenClipboardAndPaste = true;
  evidence.status = 'passed';
} catch (error) {
  evidence.status = 'failed'; evidence.error = error instanceof Error ? error.message : String(error);
  try { const current = await state(); evidence.failureState = { ...current, text: undefined, characters: current.text.length }; } catch { /* fixture may be unavailable */ }
  process.exitCode = 1;
} finally {
  await session.endSession({ session: common.session }).catch(() => undefined);
  session.close();
  await runtime.shutdown();
  (runtime as { uniffiDestroy?: () => void }).uniffiDestroy?.();
  evidence.finished = new Date().toISOString();
  await writeFile('artifacts/computer-paste-check.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
  // Fixture closes itself after 30 seconds; no broad process termination or foreign-window input.
}
