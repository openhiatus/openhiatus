import type { ToolResult } from '@trycua/cua-driver';

export const COMPUTER_DIAGNOSTICS_PREFIX = 'OPENHIATUS_COMPUTER_DIAGNOSTICS_V1 ';
export type ComputerDriverOperation = 'screenshot' | 'screen-size' | 'clipboard-write' | 'click' | 'type' | 'key' | 'scroll' | 'move' | 'drag';

const effects = ['confirmed', 'partial', 'unverifiable', 'suspected-noop', 'refused'] as const;
const routes = ['accessibility', 'synthetic-events', 'global-input', 'system-api', 'dom', 'trusted-input'] as const;
const deliveryModes = ['background', 'foreground', 'not-applicable', 'unknown'] as const;
const escalationTargets = ['pixel', 'foreground', 'page', 'session'] as const;
const escalationReasons = ['route-unavailable', 'delivery-failed', 'effect-unconfirmed', 'suspected-noop', 'permission-required'] as const;
const verificationStates = ['satisfied', 'unsatisfied', 'unknown'] as const;
const unknownReasons = ['invalid-predicate', 'unsupported-predicate', 'untrusted-source', 'multi-match', 'target-missing', 'observation-unavailable', 'stability-unproven'] as const;

// Only fixed, reviewed driver identifiers may leave the native boundary. In
// particular, accepting arbitrary identifier-shaped strings could leak input.
const errorCodes = ['foreground_unavailable', 'background_unavailable', 'desktop_coordinate_scope_required', 'element_not_visible',
  'invalid_arguments', 'menu_path_unavailable', 'protected_resource_scope_stale', 'window_minimized', 'window_target_mismatch',
  'window_target_not_found', 'invalid_action_target', 'ambiguous_window_target', 'window_target_resolution_failed',
  'permission_denied', 'authorization_required', 'authorization_declined', 'facility_unavailable', 'stale_element_token', 'generation_mismatch'] as const;
type ErrorCode = typeof errorCodes[number] | 'unrecognized';
const label = <T extends string>(values: readonly T[], index: number): T | 'unknown' =>
  Number.isInteger(index) && index >= 0 && index < values.length ? values[index] : 'unknown';
const count = (value: unknown): number | undefined => {
  const number = typeof value === 'bigint' ? Number(value) : value;
  return typeof number === 'number' && Number.isSafeInteger(number) && number >= 0 ? number : undefined;
};

export interface ComputerDriverDiagnostic {
  operation: ComputerDriverOperation;
  isError: boolean;
  degraded: boolean;
  errorCode?: ErrorCode;
  errorCodeSource?: 'envelope' | 'text-prefix';
  failureStage?: 'before-input' | 'after-input' | 'input-delivery-unconfirmed';
  failureReason?: 'foreground-not-activated' | 'target-disappeared' | 'post-action-foreground-mismatch' | 'send-input-count-mismatch' | 'integrity-block';
  effect?: typeof effects[number] | 'unknown';
  route?: typeof routes[number] | 'unknown';
  delivery?: { mode: typeof deliveryModes[number]; deliveredCount?: number };
  escalation?: { target: typeof escalationTargets[number] | 'unknown'; reason: typeof escalationReasons[number] | 'unknown' };
  verification?: { status: typeof verificationStates[number]; stable: boolean; elapsedMs?: number; samples?: number; unknownReasons: string[] };
}

/** Content-free projection. Never serialize text, raw/structured JSON or observed values. */
export function computerDriverDiagnostic(result: ToolResult, operation: ComputerDriverOperation): ComputerDriverDiagnostic {
  const action = result.action, verification = result.verification;
  const text = result.isError ? result.text.slice(0, 1024) : '';
  const knownCode = errorCodes.find(code => result.errorCode === code);
  // SDK 0.22.0's Windows click error often has no errorCode/action envelope.
  // Classify ONLY an anchored, known prefix; do not retain the remaining text.
  const textCode = !knownCode && result.isError
    ? errorCodes.find(code => text.startsWith(`${code}:`)) : undefined;
  // Exact 0.22.0 Windows mouse error paths. A post-click foreground change can
  // produce isError AFTER SendInput; this is not a refused/undelivered click.
  let failure: Pick<ComputerDriverDiagnostic, 'failureStage' | 'failureReason'> | undefined;
  if (operation === 'click' && result.isError) {
    if (text.startsWith('foreground_unavailable: Windows did not activate exact target HWND ')) {
      failure = { failureStage: 'before-input', failureReason: 'foreground-not-activated' };
    } else if (text.startsWith('foreground_unavailable: exact target HWND ')) {
      if (text.includes(' disappeared before mouse input could be sent')) failure = { failureStage: 'before-input', failureReason: 'target-disappeared' };
      else if (text.includes(' or a verified same-process post-action window was not foreground after the click ')) {
        failure = { failureStage: 'after-input', failureReason: 'post-action-foreground-mismatch' };
      }
    } else if (text.startsWith('SendInput inserted fewer modifier or mouse events than expected for the foreground click.')) {
      failure = { failureStage: 'input-delivery-unconfirmed', failureReason: 'send-input-count-mismatch' };
    } else if (text.startsWith('UIPI: target hwnd ')) failure = { failureStage: 'before-input', failureReason: 'integrity-block' };
  }
  const deliveredCount = count(action?.delivery?.deliveredCount);
  const elapsedMs = count(verification?.elapsedMs), samples = count(verification?.samples);
  return { operation, isError: result.isError === true, degraded: result.degraded === true,
    ...failure,
    ...(knownCode || textCode || result.errorCode ? { errorCode: knownCode ?? textCode ?? 'unrecognized',
      errorCodeSource: knownCode || !textCode ? 'envelope' : 'text-prefix' } : {}),
    ...(action ? { effect: label(effects, action.effect), route: label(routes, action.route) } : {}),
    ...(action?.delivery ? { delivery: { mode: label(deliveryModes, action.delivery.mode),
      ...(deliveredCount !== undefined ? { deliveredCount } : {}) } } : {}),
    ...(action?.escalation ? { escalation: { target: label(escalationTargets, action.escalation.target), reason: label(escalationReasons, action.escalation.reason) } } : {}),
    ...(verification ? { verification: { status: label(verificationStates, verification.status), stable: verification.stable === true,
      ...(elapsedMs !== undefined ? { elapsedMs } : {}), ...(samples !== undefined ? { samples } : {}),
      unknownReasons: [...new Set(verification.predicates.slice(0, 32).flatMap(predicate => predicate.unknownReason === undefined ? [] : [label(unknownReasons, predicate.unknownReason)]))] } } : {}),
  };
}

export const computerDriverFailed = (result: ToolResult): boolean => result.isError || result.action?.effect === 4;

export function computerDriverFailureSummary(diagnostic: ComputerDriverDiagnostic, hasImage: boolean): string {
  const reason = diagnostic.failureStage === 'after-input'
    ? 'Der Klick wurde gesendet; der Desktop-Treiber konnte danach das erwartete Vordergrundfenster nicht bestätigen.'
    : diagnostic.errorCode === 'foreground_unavailable'
    ? 'Der Desktop-Treiber konnte das erwartete Vordergrundfenster nicht bestätigen.'
    : diagnostic.effect === 'refused' ? 'Der Desktop-Treiber meldet eine Ablehnung.' : 'Der Desktop-Treiber meldet einen Fehler.';
  const delivery = diagnostic.failureStage === 'before-input'
    ? 'In diesem bekannten Treiberpfad wurde die Eingabe vor dem Senden verweigert. '
      + (diagnostic.failureReason === 'foreground-not-activated'
        ? 'Nach Bildprüfung einen zulässigen sichtbaren Bedienweg wählen, etwa Tastaturnavigation in einem geöffneten Menü. '
        : 'Aktuelles Ziel und zulässigen Zugriff anhand des Bilds prüfen; Schutzmechanismen nicht umgehen. ')
    : 'Eine bereits begonnene Eingabe kann trotzdem gewirkt haben. Nicht automatisch wiederholen. ';
  return `${reason} ${delivery}`
    + (hasImage ? 'Das mitgelieferte aktuelle Kontrollbild prüfen; wenn der gewünschte Zustand erreicht ist, von dort weiterarbeiten.'
      : 'Es liegt kein aktuelles Kontrollbild vor. Vor weiteren Eingaben screenshot aufrufen und den Zustand prüfen.');
}
