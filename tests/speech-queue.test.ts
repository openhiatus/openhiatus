import test from 'node:test';
import assert from 'node:assert/strict';
import { SpeechCueQueue } from '../src/renderer/speech-queue';
import type { SpeechCue } from '../src/shared/contracts';

const cue = (id: string, text = id): SpeechCue => ({ id, text, at: '2026-10-07T12:00:00Z' });

test('initial stored cues never replay, including an initially absent cue array', () => {
  const restored = new SpeechCueQueue();
  restored.ingest([cue('old')], true);
  assert.equal(restored.take(), undefined);
  restored.ingest([cue('old'), cue('new')], true);
  assert.equal(restored.take()?.id, 'new');
  const fresh = new SpeechCueQueue();
  fresh.ingest(undefined, true);
  fresh.ingest([cue('first')], true);
  assert.equal(fresh.take()?.id, 'first');
});

test('snapshot updates deduplicate IDs and keep ordered cues while input is busy', () => {
  const queue = new SpeechCueQueue();
  queue.ingest([], true);
  queue.ingest([cue('accepted'), cue('question')], true);
  queue.ingest([cue('accepted'), cue('question'), cue('finished')], true);
  assert.equal(queue.length, 3);
  assert.deepEqual([queue.take()?.id, queue.take()?.id, queue.take()?.id], ['accepted', 'question', 'finished']);
  queue.ingest([cue('accepted'), cue('finished')], true);
  assert.equal(queue.length, 0);
});

test('canceled current cues and disabled speech are consumed without replay', () => {
  const queue = new SpeechCueQueue();
  queue.ingest([], true);
  queue.ingest([cue('interrupted'), cue('pending')], true);
  assert.equal(queue.take()?.id, 'interrupted');
  queue.ingest([cue('interrupted'), cue('pending'), cue('muted')], false);
  assert.equal(queue.length, 0);
  queue.ingest([cue('interrupted'), cue('pending'), cue('muted'), cue('future')], true);
  assert.equal(queue.take()?.id, 'future');
  queue.clear();
  queue.ingest([cue('future')], true);
  assert.equal(queue.length, 0);
});

test('queued progress expires with its job while acknowledgements and final results keep their order', () => {
  const queue = new SpeechCueQueue(); queue.ingest([], true, new Set());
  const progress = { ...cue('progress'), jobId: 'one', kind: 'progress' as const };
  queue.ingest([cue('accepted'), progress], true, new Set(['one']));
  assert.equal(queue.length, 2);
  queue.ingest([cue('accepted'), progress, cue('finished')], true, new Set());
  assert.deepEqual([queue.take()?.id, queue.take()?.id], ['accepted', 'finished']);
  queue.ingest([progress], true, new Set(['one']));
  assert.equal(queue.length, 0, 'expired progress cannot replay when a later job starts');
  const other = { ...cue('other-progress'), jobId: 'two', kind: 'progress' as const };
  queue.ingest([other], true, new Set(['two']));
  assert.equal(queue.take()?.id, 'other-progress');
});
