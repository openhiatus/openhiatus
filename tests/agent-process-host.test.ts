import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const host = process.env.OPENHIATUS_PROCESS_HOST ?? resolve('dist/native/openhiatus-process-host.exe');
const native = process.platform === 'win32' && existsSync(host);
const leafCode = `console.log(JSON.stringify({kind:'leaf',pid:process.pid})); setInterval(()=>{},1000);`;
const rootCode = `const {spawn}=require('node:child_process');
console.log(JSON.stringify({kind:'root',pid:process.pid}));
spawn(process.execPath,['-e',${JSON.stringify(leafCode)}],{stdio:['ignore','inherit','inherit'],detached:true});
process.stdin.on('data',()=>process.exit(23)); setInterval(()=>{},1000);`;
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function alive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch { return false; } }
async function gone(pids: number[]): Promise<void> {
  for (let n = 0; n < 200; n++) { if (pids.every(pid => !alive(pid))) return; await pause(25); }
  assert.fail(`Synthetic processes are still alive: ${pids.filter(alive).join(', ')}`);
}

function hostedResult(output: string, control: string): { code: number; output: string; error: string } {
  const rows = output.trim().split(/\r?\n/).map(line => JSON.parse(line));
  assert.equal(rows.length, 2, 'The host emits one private ownership record before the synthetic child result.');
  assert.equal(rows[0].method, 'openhiatus/host/child');
  assert.equal(rows[0].params.control, control);
  assert.ok(Number.isSafeInteger(rows[0].params.pid) && rows[0].params.pid > 0);
  return rows[1];
}

async function launch(t: any, throughParent = false) {
  const control = randomUUID();
  const args = ['--parent', String(process.pid), '--control', control, '--', process.execPath, '-e', rootCode];
  const parentCode = `const {spawn}=require('node:child_process');
const args=${JSON.stringify(args)}; args[1]=String(process.pid);
const child=spawn(${JSON.stringify(host)},args,{stdio:'inherit',windowsHide:true});
console.log(JSON.stringify({kind:'host',pid:child.pid})); setInterval(()=>{},1000);`;
  const proc = throughParent ? spawn(process.execPath, ['-e', parentCode], { windowsHide: true, stdio: ['pipe','pipe','pipe'] })
    : spawn(host, args, { windowsHide: true, stdio: ['pipe','pipe','pipe'] });
  const pids: Record<string, number> = {};
  let stderr = '';
  proc.stderr.on('data', data => { stderr += data.toString(); });
  const lines = createInterface({ input: proc.stdout });
  lines.on('line', line => { try { const value = JSON.parse(line); pids[value.kind] = value.pid; } catch {} });
  const exited = new Promise<number | null>((resolve, reject) => { proc.once('error', reject); proc.once('close', resolve); });
  t.after(async () => {
    if (proc.exitCode === null) proc.kill();
    // Recovery affects only PIDs emitted by these synthetic test workers.
    for (const pid of Object.values(pids)) if (alive(pid)) { try { process.kill(pid); } catch {} }
    lines.close();
  });
  for (let n = 0; n < 200 && !pids.leaf; n++) {
    if (proc.exitCode !== null) assert.fail(`Host exited early: ${stderr}`);
    await pause(25);
  }
  assert.ok(pids.root && pids.leaf, `Synthetic child tree did not initialize: ${stderr}`);
  return { proc, pids, control, exited };
}

test('Windows job Stop confirms zero live root/descendant processes', { skip: !native, timeout: 15_000 }, async t => {
  const { proc, pids, control, exited } = await launch(t);
  const stopper = spawn(host, ['--stop', control], { windowsHide: true, stdio: 'ignore' });
  assert.equal(await new Promise(resolve => stopper.once('close', resolve)), 0);
  assert.equal(await exited, 0);
  await gone([pids.root, pids.leaf]); assert.equal(alive(proc.pid!), false);
});

test('unexpected child exit cleans detached descendant before host reports exit', { skip: !native, timeout: 15_000 }, async t => {
  const { proc, pids, exited } = await launch(t);
  proc.stdin.write('exit');
  assert.equal(await exited, 23);
  await gone([pids.root, pids.leaf]);
});

test('abrupt host crash closes job and kills descendants', { skip: !native, timeout: 15_000 }, async t => {
  const { proc, pids, exited } = await launch(t);
  proc.kill(); await exited;
  await gone([pids.root, pids.leaf]);
});

test('abrupt openhiatus parent exit is detected and kills its entire hosted tree', { skip: !native, timeout: 15_000 }, async t => {
  const { proc, pids, exited } = await launch(t, true);
  proc.kill(); await exited;
  await gone([pids.host, pids.root, pids.leaf]);
});

for (const ending of ['stop', 'server-exit', 'host-crash', 'parent-exit'] as const) {
  test(`explicit independent handoff survives ${ending} while the control worker ends`, { skip: !native, timeout: 20_000 }, async t => {
    const root = await mkdtemp(join(tmpdir(), 'openhiatus-handoff-test-'));
    const marker = join(root, 'independent-worker.json');
    const delayed = join(root, 'unexpected-control-input.txt');
    const control = randomUUID();
    const expectedArgs = ['Umlaute äöü ß', 'quoted "argument"', 'C:\\trailing slash\\'];
    const independentCode = `const fs=require('node:fs'); const marker=${JSON.stringify(marker)}; fs.writeFileSync(marker+'.tmp',JSON.stringify({pid:process.pid,cwd:process.cwd(),args:process.argv.slice(1)})); fs.renameSync(marker+'.tmp',marker); setInterval(()=>{},1000);`;
    const controlCode = `setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(delayed)},'must not occur'),3000); setInterval(()=>{},1000);`;
    const rootCode = `const {spawn,spawnSync}=require('node:child_process');
console.log(JSON.stringify({kind:'root',pid:process.pid}));
const managed=spawn(process.execPath,['-e',${JSON.stringify(controlCode)}],{stdio:'ignore',detached:true}); console.log(JSON.stringify({kind:'managed',pid:managed.pid}));
const handed=spawnSync(${JSON.stringify(host)},['--launch-independent','--hidden','--',process.execPath,'-e',${JSON.stringify(independentCode)},${expectedArgs.map(value => JSON.stringify(value)).join(',')}],{encoding:'utf8',windowsHide:true});
console.log(JSON.stringify({kind:'launch',code:handed.status,output:handed.stdout,error:handed.stderr}));
process.stdin.on('data',()=>process.exit(23)); setInterval(()=>{},1000);`;
    const args = ['--parent', String(process.pid), '--control', control, '--allow-handoff', '--', process.execPath, '-e', rootCode];
    const parentCode = `const {spawn}=require('node:child_process'); const args=${JSON.stringify(args)};args[1]=String(process.pid);const hosted=spawn(${JSON.stringify(host)},args,{stdio:'inherit',windowsHide:true});console.log(JSON.stringify({kind:'host',pid:hosted.pid}));setInterval(()=>{},1000);`;
    const proc = ending === 'parent-exit' ? spawn(process.execPath, ['-e', parentCode], { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
      : spawn(host, args, { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const pids: Record<string, number> = {};
    let launchResult: { code: number; output: string; error: string } | undefined;
    const lines = createInterface({ input: proc.stdout });
    lines.on('line', line => { try { const value = JSON.parse(line); if (value.kind === 'launch') launchResult = value; else if (value.pid) pids[value.kind] = value.pid; } catch {} });
    const exited = new Promise<number | null>((done, failed) => { proc.once('error', failed); proc.once('close', done); });
    proc.stderr.resume();
    let independentPid: number | undefined;
    t.after(async () => {
      if (proc.exitCode === null) proc.kill();
      if (!independentPid && existsSync(marker)) independentPid = JSON.parse(await readFile(marker, 'utf8')).pid;
      for (const pid of [...Object.values(pids), ...(independentPid ? [independentPid] : [])]) if (alive(pid)) { try { process.kill(pid); } catch {} }
      lines.close();
      assert.equal(dirname(resolve(root)).toLowerCase(), resolve(tmpdir()).toLowerCase());
      assert.ok(basename(root).startsWith('openhiatus-handoff-test-'));
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    });
    for (let attempt = 0; attempt < 200 && (!launchResult || !existsSync(marker)); attempt++) await pause(20);
    assert.equal(launchResult?.code, 0, launchResult?.error);
    independentPid = JSON.parse(launchResult!.output).pid;
    const details = JSON.parse(await readFile(marker, 'utf8'));
    assert.equal(details.pid, independentPid); assert.deepEqual(details.args, expectedArgs);
    assert.equal(details.cwd.toLowerCase(), root.toLowerCase());
    if (ending === 'stop') {
      const stopper = spawn(host, ['--stop', control], { windowsHide: true, stdio: 'ignore' });
      assert.equal(await new Promise(done => stopper.once('close', done)), 0);
    } else if (ending === 'server-exit') proc.stdin.write('exit');
    else proc.kill();
    await exited; await gone(Object.values(pids));
    assert.equal(alive(independentPid!), true);
    await pause(3100);
    assert.equal(existsSync(delayed), false, 'No delayed automation input may run after Stop.');
    assert.equal(alive(independentPid!), true);
  });
}

test('host without handoff permission rejects explicit independent launch before the child starts', { skip: !native, timeout: 15_000 }, async t => {
  const control = randomUUID();
  const code = `const {spawnSync}=require('node:child_process');process.env.OPENHIATUS_HANDOFF_JOB=${JSON.stringify(`Local\\openhiatusWork-${control.replaceAll('-', '')}`)};const result=spawnSync(${JSON.stringify(host)},['--launch-independent','--hidden','--',process.execPath,'-e','process.exit(19)'],{encoding:'utf8',windowsHide:true});console.log(JSON.stringify({code:result.status,output:result.stdout,error:result.stderr}));`;
  const proc = spawn(host, ['--parent', String(process.pid), '--control', control, '--', process.execPath, '-e', code], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (proc.exitCode === null) proc.kill(); });
  let output = ''; proc.stdout.on('data', data => { output += data; }); proc.stderr.resume();
  assert.equal(await new Promise(done => proc.once('close', done)), 0);
  const result = hostedResult(output, control);
  assert.equal(result.code, 66); assert.equal(result.output, '');
  assert.match(result.error, /requires an openHiatus host with explicit handoff enabled/);
});

for (const scenario of [
  { commandSwitch: '/c', scriptArgument: 'Start-Agent.cmd', excludeCurrentDirectory: false, expected: true },
  { commandSwitch: '/k', scriptArgument: 'Start-Agent.cmd', excludeCurrentDirectory: false, expected: true },
  { commandSwitch: '/c', scriptArgument: 'Start-Agent.cmd', excludeCurrentDirectory: true, expected: false },
  { commandSwitch: '/c', scriptArgument: '.\\Start-Agent.cmd', excludeCurrentDirectory: true, expected: true },
  { commandSwitch: '/k', scriptArgument: '.\\Start-Agent.cmd', excludeCurrentDirectory: true, expected: true },
]) {
test(`independent CMD ${scenario.commandSwitch} bootstrap ${scenario.scriptArgument} with current-directory lookup ${scenario.excludeCurrentDirectory ? 'disabled' : 'enabled'}`, { skip: !native, timeout: 15_000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'openhiatus-cmd-handoff-test-'));
  const marker = join(root, 'cmd-bootstrap-marker.txt');
  await writeFile(join(root, 'Start-Agent.cmd'), '@echo off\r\n>cmd-bootstrap-marker.txt echo CMD_BOOTSTRAP_OK:%~1\r\nexit 0\r\n', 'ascii');
  const control = randomUUID();
  const commandProcessor = join(process.env.SystemRoot!, 'System32', 'cmd.exe');
  const code = `const {spawnSync}=require('node:child_process');const result=spawnSync(${JSON.stringify(host)},['--launch-independent','--hidden','--',${JSON.stringify(commandProcessor)},'/d',${JSON.stringify(scenario.commandSwitch)},${JSON.stringify(scenario.scriptArgument)},'bootstrap-argument'],{encoding:'utf8',windowsHide:true});console.log(JSON.stringify({code:result.status,output:result.stdout,error:result.stderr}));`;
  const proc = spawn(host, ['--parent', String(process.pid), '--control', control, '--allow-handoff', '--', process.execPath, '-e', code], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NoDefaultCurrentDirectoryInExePath: scenario.excludeCurrentDirectory ? '1' : undefined },
  });
  let output = ''; proc.stdout.on('data', data => { output += data; }); proc.stderr.resume();
  let independentPid: number | undefined;
  t.after(async () => {
    if (proc.exitCode === null) proc.kill();
    if (independentPid && alive(independentPid)) { try { process.kill(independentPid); } catch {} }
    assert.equal(dirname(resolve(root)).toLowerCase(), resolve(tmpdir()).toLowerCase());
    assert.ok(basename(root).startsWith('openhiatus-cmd-handoff-test-'));
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  assert.equal(await new Promise(done => proc.once('close', done)), 0);
  const result = hostedResult(output, control);
  assert.equal(result.code, 0, result.error);
  independentPid = JSON.parse(result.output).pid;
  assert.ok(Number.isSafeInteger(independentPid) && independentPid! > 0);
  for (let attempt = 0; attempt < 100 && !existsSync(marker); attempt++) await pause(20);
  assert.equal(existsSync(marker), scenario.expected, 'A successful process launch alone must not count as a successful CMD bootstrap.');
  if (scenario.expected) assert.equal((await readFile(marker, 'utf8')).trim(), 'CMD_BOOTSTRAP_OK:bootstrap-argument');
  await gone([independentPid!]);
});
}
