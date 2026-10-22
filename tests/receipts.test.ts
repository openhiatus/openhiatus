import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isReceiptPhrase, nextReceipt, RECEIPT_PHRASES } from '../src/shared/receipts';

test('receipts vary, never repeat back to back and stay within the neutral pool', () => {
  let last: string | undefined;
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const phrase = nextReceipt(last);
    assert.notEqual(phrase, last);
    assert.ok(isReceiptPhrase(phrase));
    seen.add(phrase); last = phrase;
  }
  assert.ok(seen.size > RECEIPT_PHRASES.length / 2, 'the pool is actually used');
  assert.equal(nextReceipt(undefined, () => 0.9999), RECEIPT_PHRASES.at(-1));
  assert.equal(nextReceipt(RECEIPT_PHRASES[0], () => 0), RECEIPT_PHRASES[1]);
});

test('receipts never claim that work started or succeeded', () => {
  for (const phrase of RECEIPT_PHRASES) assert.doesNotMatch(phrase, /fertig|erledigt|gestartet|geschafft|erfolgreich/i);
});
