import { spawn, execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
import assert from 'node:assert/strict';

await mkdir('.test-data', { recursive: true }); await mkdir('artifacts', { recursive: true });
const directory = await mkdtemp(path.resolve('.test-data/input-guard-'));
const policyExe = path.join(directory, 'policy.exe');
execFileSync(path.join(process.env.WINDIR || 'C:/Windows', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),
  ['/nologo', '/target:exe', '/main:InputGuardPolicyTests', `/out:${policyExe}`, path.resolve('src/main/openhiatus-input-guard.cs'), path.resolve('tests/fixtures/input-guard-policy.cs')], { windowsHide: true });
execFileSync(policyExe, [], { windowsHide: true, stdio: 'inherit' });
const executable = path.resolve('dist/native/openhiatus-input-guard.exe');
async function lifecycle(mode) {
  const parent = mode === 'parent-exit' ? spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { windowsHide: true, stdio: 'ignore' }) : undefined;
  const child = spawn(executable, ['--parent-pid', String(parent?.pid ?? process.pid)], { windowsHide: true, stdio: 'pipe' });
  let heartbeat, ready = false; const lines = [];
  const deadline = setTimeout(() => child.kill(), 7000);
  const closed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => resolve(code)); });
  const reader = createInterface({ input: child.stdout });
  reader.on('line', line => {
    lines.push(line);
    if (line !== 'ready') return;
    ready = true;
    if (mode === 'eof') child.stdin.end();
    if (mode === 'halt') child.stdin.write('halt\n');
    if (mode === 'parent-exit') parent.kill();
  });
  child.stderr.resume(); child.stdin.on('error', () => {});
  if (mode !== 'heartbeat-loss') heartbeat = setInterval(() => { if (!child.stdin.destroyed) child.stdin.write('ping\n'); }, 200);
  const began = Date.now();
  try {
    const code = await closed;
    assert.equal(ready, true, `${mode}: helper must confirm both hooks after keys are released`);
    assert.ok(Date.now() - began < 6500, `${mode}: native watchdog must restore input`);
    assert.ok([0, 5, 6].includes(code), `${mode}: expected shutdown, got ${code}`);
    assert.ok(lines.every(line => ['ready', 'alive'].includes(line)), 'helper emits no input data');
    return { mode, code, elapsedMs: Date.now() - began };
  } finally { clearTimeout(deadline); clearInterval(heartbeat); reader.close(); child.kill(); parent?.kill(); }
}
const checks = [];
for (const mode of ['eof', 'heartbeat-loss', 'halt', 'parent-exit']) checks.push(await lifecycle(mode));
const evidence = { status: 'passed', checks, policy: 'production keyboard/mouse decisions, physical Esc, injected Esc, voice keys, stop quarantine and release events', limitation: 'Physical-key branches are exercised by the compiled policy harness, not by sending hardware input.' };
await writeFile('artifacts/openhiatus-input-guard.json', JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
