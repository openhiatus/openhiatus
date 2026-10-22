import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveDemoFile } from '../src/main/resolve-demo-file';

test('result files support spaced UTF-8 paths but reject traversal, URLs and junction escapes', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'openhiatus-file-boundary-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(root)).toLowerCase(), path.resolve(tmpdir()).toLowerCase());
    assert.ok(path.basename(root).startsWith('openhiatus-file-boundary-'));
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const workspace = path.join(root, 'Demo Ordner'); const outside = path.join(root, 'outside');
  await mkdir(workspace); await mkdir(outside);
  const file = path.join(workspace, 'Schöne Notizen.md');
  await writeFile(file, 'Äpfel und Grüße', 'utf8');
  await writeFile(path.join(outside, 'privat.txt'), 'synthetic sentinel', 'utf8');
  assert.equal((await resolveDemoFile(workspace, 'Schöne Notizen.md')).toLowerCase(), file.toLowerCase());
  if (process.platform === 'win32') assert.equal((await resolveDemoFile(workspace, '/' + file.replaceAll('\\', '/'))).toLowerCase(), file.toLowerCase());
  await assert.rejects(resolveDemoFile(workspace, '../outside/privat.txt'), /außerhalb/);
  await assert.rejects(resolveDemoFile(workspace, 'https://example.com'), /keine Datei/);
  await assert.rejects(resolveDemoFile(workspace, 'missing.md'), /nicht vorhanden/);
  await symlink(outside, path.join(workspace, 'shortcut'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(resolveDemoFile(workspace, 'shortcut/privat.txt'), /außerhalb/);
  const approvedFile = path.join(outside, 'privat.txt');
  assert.equal((await resolveDemoFile(workspace, approvedFile, [outside])).toLowerCase(), approvedFile.toLowerCase());
  await assert.rejects(resolveDemoFile(workspace, approvedFile, []), /außerhalb/);
  assert.equal((await resolveDemoFile(workspace, approvedFile, [], true)).toLowerCase(), approvedFile.toLowerCase());
  await assert.rejects(resolveDemoFile(workspace, 'https://example.com', [], true), /keine Datei/);
  await assert.rejects(resolveDemoFile(workspace, outside, [], true), /nicht vorhanden/);
});
