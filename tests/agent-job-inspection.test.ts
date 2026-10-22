import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

// Native, provider-free regression. Node copies emulate only executable names,
// parent relationships and job ownership; no model endpoint is contacted.
// A private host build avoids replacing the executable used by an open openhiatus.
const source = resolve('src/main/openhiatus-process-host.cs');
const compiler = join(process.env.SystemRoot ?? 'C:/Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
const native = process.platform === 'win32' && existsSync(compiler) && existsSync(source);
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let directory: string; let host: string; let controlExe: string; let helperExe: string; let otherHelperExe: string; let fakeConsoleExe: string;

async function command(executable: string, args: string[]): Promise<{ code: number | null; output: string; error: string }> {
  const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', error = '';
  child.stdout.on('data', chunk => { output += chunk.toString('utf8'); });
  child.stderr.on('data', chunk => { error += chunk.toString('utf8'); });
  const code = await new Promise<number | null>((done, failed) => { child.once('error', failed); child.once('close', done); });
  return { code, output, error };
}
before(async () => {
  if (!native) return;
  directory = await mkdtemp(join(tmpdir(), 'openhiatus-job-inspection-test-'));
  host = join(directory, 'openhiatus-process-host.exe');
  const built = await command(compiler, ['/nologo', '/optimize+', `/out:${host}`, source]);
  assert.equal(built.code, 0, `Private native host compile failed: ${built.output}${built.error}`);
  const bin = join(directory, 'bin'), other = join(directory, 'other');
  await mkdir(bin); await mkdir(other);
  controlExe = join(bin, 'agent.exe'); helperExe = join(bin, 'agent-helper.exe');
  otherHelperExe = join(other, 'agent-helper.exe'); fakeConsoleExe = join(other, 'conhost.exe');
  for (const executable of [controlExe, helperExe, otherHelperExe, fakeConsoleExe]) await copyFile(process.execPath, executable);
});
after(async () => {
  if (!directory) return;
  assert.equal(dirname(resolve(directory)).toLowerCase(), resolve(tmpdir()).toLowerCase());
  assert.ok(basename(directory).startsWith('openhiatus-job-inspection-test-'));
  await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

function alive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch { return false; } }
async function until(read: () => boolean, reason: string): Promise<void> {
  for (let n = 0; n < 320; n++) { if (read()) return; await pause(25); }
  assert.fail(reason);
}
type Scenario = 'idle' | 'sibling' | 'helper-service' | 'outside-bin' | 'wrong-parent' | 'fake-console' | 'duplicate-helper';
interface Fixture {
  proc: ChildProcessWithoutNullStreams; control: string; job: string; pids: Record<string, number>;
  stop(): Promise<void>; inspect(rootPid?: number): Promise<{ code: number | null; output: string; error: string }>;
}
async function launch(t: any, scenario: Scenario): Promise<Fixture> {
  const control = randomUUID(); const job = `Local\\openhiatusWork-${control.replaceAll('-', '')}`;
  const leafCode = `console.log(JSON.stringify({kind:'service',pid:process.pid}));setInterval(()=>{},1000);`;
  const helperCode = `const {spawn}=require('node:child_process');console.log(JSON.stringify({kind:'helper',pid:process.pid}));`
    + (scenario === 'helper-service' ? `spawn(${JSON.stringify(process.execPath)},['-e',${JSON.stringify(leafCode)}],{stdio:['ignore','inherit','inherit'],windowsHide:true});` : '')
    + `setInterval(()=>{},1000);`;
  const helper = scenario === 'outside-bin' ? otherHelperExe : helperExe;
  const spawnHelper = `spawn(${JSON.stringify(helper)},['-e',${JSON.stringify(helperCode)}],{stdio:['ignore','inherit','inherit'],windowsHide:true});`;
  const bridgeCode = `const {spawn}=require('node:child_process');console.log(JSON.stringify({kind:'bridge',pid:process.pid}));${spawnHelper}setInterval(()=>{},1000);`;
  const fakeConsoleCode = `console.log(JSON.stringify({kind:'fakeConsole',pid:process.pid}));setInterval(()=>{},1000);`;
  const secondHelperCode = `console.log(JSON.stringify({kind:'secondHelper',pid:process.pid}));setInterval(()=>{},1000);`;
  const rootCode = `const {spawn}=require('node:child_process');console.log(JSON.stringify({kind:'root',pid:process.pid}));`
    + (scenario === 'idle' ? '' : scenario === 'wrong-parent'
      ? `spawn(${JSON.stringify(process.execPath)},['-e',${JSON.stringify(bridgeCode)}],{stdio:['ignore','inherit','inherit'],windowsHide:true});` : spawnHelper)
    + (scenario === 'fake-console' ? `spawn(${JSON.stringify(fakeConsoleExe)},['-e',${JSON.stringify(fakeConsoleCode)}],{stdio:['ignore','inherit','inherit'],windowsHide:true});` : '')
    + (scenario === 'duplicate-helper' ? `spawn(${JSON.stringify(helperExe)},['-e',${JSON.stringify(secondHelperCode)}],{stdio:['ignore','inherit','inherit'],windowsHide:true});` : '')
    + `setInterval(()=>{},1000);`;
  const proc = spawn(host, ['--parent', String(process.pid), '--control', control, '--allow-handoff', '--', controlExe, '-e', rootCode],
    { cwd: directory, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const pids: Record<string, number> = {}; let stderr = ''; let exited = false;
  const finished = new Promise<number | null>((done, failed) => {
    proc.once('error', failed); proc.once('close', code => { exited = true; done(code); });
  });
  proc.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
  const lines = createInterface({ input: proc.stdout });
  lines.on('line', line => {
    try {
      const data = JSON.parse(line);
      if (data.method === 'openhiatus/host/child' && data.params.control === control) pids.nativeRoot = data.params.pid;
      else if (typeof data.kind === 'string' && Number.isSafeInteger(data.pid)) pids[data.kind] = data.pid;
    } catch {}
  });
  let stopped: Promise<void> | undefined;
  const fixture: Fixture = { proc, control, job, pids,
    stop() { return stopped ??= (async () => {
      if (!exited) {
        const result = await command(host, ['--stop', control]);
        assert.equal(result.code, 0, result.error);
      }
      assert.equal(await finished, 0, stderr);
      await until(() => Object.values(pids).every(pid => !alive(pid)), 'Fixture-owned process tree survived confirmed Stop.');
      lines.close();
    })(); },
    inspect(rootPid = pids.root) { return command(host, ['--inspect-job', job, String(rootPid)]); },
  };
  t.after(async () => { await fixture.stop(); });
  const ready = () => pids.root && pids.nativeRoot && (scenario === 'idle' || pids.helper)
    && (scenario !== 'helper-service' || pids.service) && (scenario !== 'wrong-parent' || pids.bridge)
    && (scenario !== 'fake-console' || pids.fakeConsole) && (scenario !== 'duplicate-helper' || pids.secondHelper);
  await until(() => { assert.equal(exited, false, `Fixture exited before readiness: ${stderr}`); return Boolean(ready()); }, 'Synthetic job did not initialize.');
  assert.equal(pids.nativeRoot, pids.root, 'The private pre-resume ownership record must match the actual root.');
  // Let Windows finish any console startup before taking a membership snapshot.
  await pause(100);
  return fixture;
}
async function inspect(fixture: Fixture): Promise<{ activeProcesses: number; managedProcesses: number }> {
  const result = await fixture.inspect(); assert.equal(result.code, 0, result.error);
  const value = JSON.parse(result.output);
  assert.ok(Number.isSafeInteger(value.activeProcesses) && value.activeProcesses >= 1);
  assert.ok(Number.isSafeInteger(value.managedProcesses) && value.managedProcesses >= 1 && value.managedProcesses <= value.activeProcesses);
  return value;
}

for (const scenario of ['idle'] as const) test(`native inspection treats ${scenario} agent as one idle worker`, { skip: !native, timeout: 20_000 }, async t => {
  const fixture = await launch(t, scenario); const count = await inspect(fixture);
  assert.equal(count.managedProcesses, 1);
  assert.equal(alive(fixture.pids.root), true); if (fixture.pids.helper) assert.equal(alive(fixture.pids.helper), true);
});
for (const scenario of ['sibling', 'helper-service', 'outside-bin', 'wrong-parent', 'fake-console', 'duplicate-helper'] as const) test(`native inspection preserves real or unverified work: ${scenario}`, { skip: !native, timeout: 20_000 }, async t => {
  const fixture = await launch(t, scenario); const count = await inspect(fixture);
  assert.ok(count.managedProcesses > 1, `Inspection must retain ${scenario}: ${JSON.stringify(count)}`);
  assert.ok(Object.values(fixture.pids).every(alive), 'Inspection must never stop a fixture-owned process.');
});
test('native inspection rejects a different job root and targeted Stop leaves the other job alive', { skip: !native, timeout: 25_000 }, async t => {
  const first = await launch(t, 'sibling'); const second = await launch(t, 'helper-service');
  const wrongRoot = await first.inspect(second.pids.root);
  assert.notEqual(wrongRoot.code, 0); assert.equal(wrongRoot.output, '');
  assert.ok(Object.values(first.pids).every(alive)); assert.ok(Object.values(second.pids).every(alive));
  await first.stop();
  assert.ok(Object.values(second.pids).every(alive), 'Stopping one job must preserve every process in the other job.');
  assert.ok((await inspect(second)).managedProcesses > 1);
});
