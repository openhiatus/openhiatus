import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { access, readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const sourceManifest = JSON.parse(await readFile('package.json', 'utf8'));
const directory = path.resolve(process.argv[2] || path.join('release', sourceManifest.version, `${sourceManifest.productName}-win32-x64`));
const executable = path.join(directory, `${sourceManifest.productName}.exe`);
const appDirectory = path.join(directory, 'resources', 'app');
const manifest = JSON.parse(await readFile(path.join(appDirectory, 'package.json'), 'utf8'));
assert.equal(manifest.name, 'openhiatus');
assert.equal(manifest.productName, 'openHiatus');
assert.equal(manifest.version, sourceManifest.version);
assert.equal(manifest.dependencies['@earendil-works/pi-coding-agent'], '1.3.0');
assert.ok(!existsSync(path.join(appDirectory, 'skills')), 'Repository skills must not ship with the app.');
for (const file of ['.github', 'resources/windows-installer.iss', 'resources/openhiatus-icon.cs']) {
  assert.ok(!existsSync(path.join(appDirectory, file)), 'Build-only installer files must not ship with the app.');
}
for (const file of ['dist/openhiatus.ico', 'dist/openhiatus.png']) await access(path.join(appDirectory, file));
for (const file of [executable, path.join(appDirectory, 'dist', 'agent-host.mjs'), path.join(appDirectory, 'dist', 'activity-overlay-preload.cjs'), path.join(directory, 'resources', 'native', 'openhiatus-process-host.exe'), path.join(directory, 'resources', 'native', 'openhiatus-input-guard.exe')]) await access(file);
async function inventory(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await inventory(target));
    else files.push(target);
  }
  return files;
}
const files = await inventory(directory);
assert.ok(!files.some(file => /(?:^|[\\/])codex(?:\.exe)?$/i.test(file) || /[\\/]node_modules[\\/]@openai[\\/]codex(?:[-\\/])/i.test(file)), 'The package must not contain a Codex runtime.');
assert.ok(files.some(file => /cua_driver_sdk\.dll$/i.test(file)), 'The native desktop library must ship with the package.');
const env = { ...process.env, OPENHIATUS_TEST_APP: executable };
for (const key of Object.keys(env)) if (key.toLowerCase() === 'path' || key === 'ELECTRON_RUN_AS_NODE' || /^(?:OPENAI|ANTHROPIC|GEMINI|GOOGLE|OPENROUTER|XAI)_API_KEY$/.test(key)) delete env[key];
env.PATH = [env.SystemRoot || 'C:\\Windows', path.join(env.SystemRoot || 'C:\\Windows', 'System32')].join(';');
for (const check of [['scripts/ui-workflow-check.mjs'], ['scripts/conversation-ui-check.mjs', '--require-context'], ['scripts/audio-devices-ui-check.mjs'], ['scripts/activity-overlay-ui-check.mjs'], ['scripts/assistant-profile-ui-check.mjs'], ['scripts/fast-model-ui-check.mjs'], ['scripts/google-calendar-setup-ui-check.mjs'], ['scripts/screen-help-ui-check.mjs', '--supporter', '--color=black'], ['scripts/desktop-control-ui-check.mjs'], ['scripts/autostart-ui-check.mjs'], ['scripts/i18n-ui-check.mjs'], ['scripts/onboarding-ui-check.mjs']]) {
  const child = spawn(process.execPath, [path.resolve(check[0]), ...check.slice(1)], { env, stdio: 'inherit', windowsHide: true });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  assert.equal(code, 0, `Packaged ${check[0]} must pass with no Node or Codex on PATH.`);
}
await mkdir('artifacts', { recursive: true });
const evidence = { status: 'passed', version: manifest.version, executable, files: files.length, asar: false,
  checks: ['own Electron runtime', 'pinned Pi SDK', 'native desktop libraries and input guard', 'no personal repository skills', 'no Codex runtime', 'fresh profile', 'packaged guided setup, resume, text check and cancellation', 'no global Node or Codex on PATH', 'packaged dialog and worker file workflow', 'packaged conversation history and context across restart', 'packaged pinned audio device selection, disconnect/reconnect and restart', 'packaged background activity and isolated resize preload', 'packaged assistant name and custom personality templates', 'packaged Fast-model selection', 'packaged Google Calendar client setup', 'packaged screen-help circle/arrow, focus and real native click-through', 'packaged mandatory desktop takeover, input guard, capture exclusion, agent click and release', 'isolated Windows autostart registration and packaged minimized/manual launch', 'seven packaged UI languages, draft preservation and live task continuity'] };
await writeFile('artifacts/openhiatus-paketpruefung.json', JSON.stringify(evidence, null, 2), 'utf8');
console.log(JSON.stringify(evidence, null, 2));
