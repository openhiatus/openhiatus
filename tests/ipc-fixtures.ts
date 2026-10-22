import type { Snapshot } from '../src/shared/contracts';
import type { MemorySnapshot } from '../src/shared/memory';

export const snapshotFixture = (): Snapshot => ({ messages: [{ id: 'user', role: 'user', text: 'Präzise Grüße', at: '2026-10-21T12:00:00Z' }],
  activity: [], task: { id: 'task', status: 'idle' },
  preferences: { inputDeviceId: 'default', outputDeviceId: 'default', speakReplies: false, voiceId: 'Dennis', model: 'local/test', dialogModel: 'local/test', memoryModel: 'local/test' },
  connections: { agent: 'ready', account: 'Lokal', speech: 'missing' }, models: [], workspace: 'C:\\openhiatus', version: 'test' });
export const memoryFixture = (): MemorySnapshot => ({ documents: [{ id: 'core', kind: 'core', title: 'Kern', content: 'Präzise Grüße', version: 1,
  updatedAt: '2026-10-21T12:00:00Z', sourceIds: [], edited: false,
  history: [{ version: 1, content: 'Präzise Grüße', updatedAt: '2026-10-21T12:00:00Z', sourceIds: [], reason: 'created' }] }],
  proposals: [], sourceCount: 0, recovered: false, storagePath: 'C:\\Gedächtnis' });
