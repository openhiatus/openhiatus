import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redact } from '../src/main/redact';

test('redacts known credentials including encoded forms without revealing partial values', () => {
  const secret = 'synthetic/key+with=padding';
  assert.equal(redact(`failure ${secret} ${encodeURIComponent(secret)}`, [secret]), 'failure [geschützt] [geschützt]');
});
test('redacts authorization, known token formats and credential assignments', () => {
  const text = `{"Authorization":"Basic c3ludGhldGljOnRva2Vu","api_key":"private-value"} Bearer secret-token access_token=another-token sk-proj-synthetic0000000000000000 eyJhbGciOiJIUzI1NiJ9.eyJ0ZXN0Ijp0cnVlfQ.abcxyz`;
  const result = redact(text);
  for (const value of ['c3ludGhldGljOnRva2Vu', 'private-value', 'secret-token', 'another-token', 'sk-proj-', 'eyJhbGci']) assert.ok(!result.includes(value));
  assert.ok(result.includes('[geschützt]'));
});
test('retains normal German task and command text', () => {
  const text = 'Erstelle eine Übersicht für Köln. Führe npm test aus.';
  assert.equal(redact(text), text);
});

test('redacts supported provider token formats without a configured key list', () => {
  for (const token of ['AIza' + 'a'.repeat(35), 'sk-ant-' + 'b'.repeat(40), 'sk-or-v1-' + 'c'.repeat(40), 'gsk_' + 'd'.repeat(30), 'hf_' + 'e'.repeat(30)]) {
    assert.equal(redact(`Fehler: ${token}`), 'Fehler: [geschützt]');
  }
});
