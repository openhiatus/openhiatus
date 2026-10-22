import test from 'node:test';
import assert from 'node:assert/strict';
import type { ToolResult } from '@trycua/cua-driver';
import { computerDriverDiagnostic, computerDriverFailed } from '../src/main/computer-driver-result';

const result = (values: Partial<ToolResult>): ToolResult => ({ text: '', images: [], isError: false, degraded: false, rawJson: '{}', ...values });

test('Windows click diagnostics distinguish before, partial and after input without exporting HWNDs or native text', () => {
  const cases = [
    ['foreground_unavailable: Windows did not activate exact target HWND 123', 'before-input', 'foreground-not-activated'],
    ['foreground_unavailable: exact target HWND 123 disappeared before mouse input could be sent', 'before-input', 'target-disappeared'],
    ['foreground_unavailable: exact target HWND 123 or a verified same-process post-action window was not foreground after the click (private title)', 'after-input', 'post-action-foreground-mismatch'],
    ['SendInput inserted fewer modifier or mouse events than expected for the foreground click. private suffix', 'input-delivery-unconfirmed', 'send-input-count-mismatch'],
    ['UIPI: target hwnd 123 private suffix', 'before-input', 'integrity-block'],
  ];
  for (const [text, stage, reason] of cases) {
    const diagnostic = computerDriverDiagnostic(result({ isError: true, text }), 'click');
    assert.equal(diagnostic.failureStage, stage); assert.equal(diagnostic.failureReason, reason);
    assert.equal(diagnostic.effect, undefined, 'a textual native error must not be invented as ActionEffect.Refused');
    assert.doesNotMatch(JSON.stringify(diagnostic), /123|private|HWND|UIPI/);
  }
  const typed = computerDriverDiagnostic(result({ isError: true, text: cases[2][0] }), 'type');
  assert.equal(typed.failureStage, undefined, 'mouse-specific delivery inference never applies to typed content');
  const embedded = computerDriverDiagnostic(result({ isError: true, text: `private input: ${cases[2][0]}` }), 'click');
  assert.equal(embedded.errorCode, undefined); assert.equal(embedded.failureReason, undefined, 'only anchored signatures are classified');
});

test('native envelope projection keeps delivery and verification enums but excludes input, observed values and unknown codes', () => {
  const diagnostic = computerDriverDiagnostic(result({ isError: true, degraded: true, errorCode: 'private_api_key', text: 'private input',
    rawJson: '{"password":"private input"}', structuredJson: '{"value":"private input"}',
    action: { effect: 1, route: 2, delivery: { mode: 1, deliveredCount: 2 }, escalation: { target: 1, reason: 2 } },
    verification: { status: 2, stable: false, elapsedMs: 120n, samples: 2n,
      predicates: [{ index: 0n, status: 2, unknownReason: 4, observedJson: 'private input' }, { index: 1n, status: 2, unknownReason: 4 }] },
  }), 'click');
  assert.deepEqual(diagnostic, { operation: 'click', isError: true, degraded: true, errorCode: 'unrecognized', errorCodeSource: 'envelope',
    effect: 'partial', route: 'global-input', delivery: { mode: 'foreground', deliveredCount: 2 },
    escalation: { target: 'foreground', reason: 'effect-unconfirmed' },
    verification: { status: 'unknown', stable: false, elapsedMs: 120, samples: 2, unknownReasons: ['target-missing'] } });
  assert.doesNotMatch(JSON.stringify(diagnostic), /private|password|value|observedJson/);
  assert.equal(computerDriverDiagnostic(result({ errorCode: 'foreground_unavailable' }), 'click').errorCode, 'foreground_unavailable');
  assert.equal(computerDriverFailed(result({ action: { effect: 4, route: 2 } })), true);
  for (const effect of [0, 1, 2, 3]) assert.equal(computerDriverFailed(result({ action: { effect, route: 2 } })), false);
});

test('unknown future enum values and oversized counters remain content-free and bounded', () => {
  // Deliberately cross the typed SDK boundary to simulate future enum values.
  const diagnostic = computerDriverDiagnostic(result({ action: { effect: 99, route: -1, delivery: { mode: 99, deliveredCount: NaN },
    escalation: { target: 99, reason: 99 } }, verification: { status: 99, stable: false, elapsedMs: 2n ** 80n, samples: -1n,
    predicates: Array.from({ length: 1000 }, () => ({ index: 0n, status: 99, unknownReason: 99, observedJson: 'secret'.repeat(1000) })) } } as unknown as Partial<ToolResult>), 'key');
  assert.equal(diagnostic.effect, 'unknown'); assert.equal(diagnostic.route, 'unknown');
  assert.deepEqual(diagnostic.delivery, { mode: 'unknown' });
  assert.deepEqual(diagnostic.verification, { status: 'unknown', stable: false, unknownReasons: ['unknown'] });
  assert.ok(JSON.stringify(diagnostic).length < 500);
});
