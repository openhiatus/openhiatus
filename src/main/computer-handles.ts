import { randomBytes } from 'node:crypto';

// Observation IDs are local lifecycle handles, not credentials. A process namespace
// prevents old-session aliases from being reused after restart; the counter never wraps.
const namespace = randomBytes(6).toString('hex');
let sequence = 0n;

/** Short, exact-copy handles. Misspellings are still rejected; there is no fuzzy lookup. */
export function computerHandle(kind: 'frame' | 'view'): string {
  return `${kind === 'frame' ? 'f' : 'v'}${(++sequence).toString(36)}-${namespace}`;
}
