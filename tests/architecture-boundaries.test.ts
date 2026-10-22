import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { checkArchitecture, inspectImports } from '../scripts/architecture-rules';

const root = resolve('.');
function inspect(file: string, source: string) { return inspectImports(root, resolve(file), source); }

test('source imports respect process boundaries and the extracted module APIs', () => {
  assert.deepEqual(checkArchitecture(root), []);
});

test('privileged imports are rejected through static, type, export and dynamic syntax', () => {
  const file = 'src/renderer/features/example/view.ts';
  for (const source of [
    "import { ipcRenderer } from 'electron';",
    "import type { Secrets } from '../../../main/storage';",
    "export { AppController } from '../../../main/controller';",
    "const fs = await import('node:fs');",
    "const driver = require('@trycua/cua-driver');",
    "type Secrets = import('../../../main/storage').Secret;",
    'const module = await import(selectedModule);',
  ]) assert.ok(inspect(file, source).length > 0, source);
  assert.equal(inspect(file, "// import 'electron';\nconst label = \"import('node:fs')\";").length, 0);
});

test('shared contracts and application modules cannot reach concrete adapters', () => {
  assert.ok(inspect('src/shared/services/contracts.ts', "import { readFile } from 'node:fs';").length);
  assert.ok(inspect('src/shared/services/contracts.ts', "import { PiAdapter } from '../../main/pi';").length);
  assert.ok(inspect('src/main/modules/conversation/coordinator.ts', "import { AppController } from '../../controller';").length);
  assert.ok(inspect('src/main/modules/conversation/coordinator.ts', "import type { BrowserWindow } from 'electron';").length);
  assert.equal(inspect('src/main/modules/conversation/coordinator.ts', "import type { Message } from '../../../shared/contracts';").length, 0);
});

test('cross-feature imports use the public index and voice state stays independent', () => {
  assert.ok(inspect('src/main/controller.ts', "import { Coordinator } from './modules/conversation/coordinator';").length);
  assert.equal(inspect('src/main/controller.ts', "import { Coordinator } from './modules/conversation/index';").length, 0);
  assert.ok(inspect('src/renderer/App.tsx', "import { VoiceSession } from './features/voice/voice-session';").length);
  assert.equal(inspect('src/renderer/App.tsx', "import { useVoiceSession } from './features/voice/index';").length, 0);
  assert.ok(inspect('src/renderer/features/voice/voice-session.ts', "import { useState } from 'react';").length);
  assert.ok(inspect('src/renderer/features/voice/voice-session.ts', "import { MicrophoneRecorder } from '../../audio';").length);
});

test('IPC handlers cannot import their controller or privileged implementations', () => {
  const file = 'src/main/ipc/tasks.ts';
  for (const source of ["import { AppController } from '../controller';", "import { ipcMain } from 'electron';",
    "import { StateStore } from '../storage';", "import type { PiAdapter } from '../pi';"]) assert.ok(inspect(file, source).length, source);
  assert.equal(inspect(file, "import type { CommandArgs } from '../../shared/ipc';").length, 0);
  assert.equal(inspect(file, "import { command } from './command';").length, 0);
});

test('feature styles expose a public index without opening private code or style imports', () => {
  assert.deepEqual(inspect('src/renderer/main.tsx', "import './features/tasks/index.css';"), []);
  assert.ok(inspect('src/renderer/main.tsx', "import './features/tasks/tasks.css';").length);
  assert.ok(inspect('src/renderer/main.tsx', "import './features/tasks/presentation';").length);
  assert.ok(inspect('src/main/controller.ts', "import './modules/tasks/index.css';").length);
});
