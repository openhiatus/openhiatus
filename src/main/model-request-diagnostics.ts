import type { AgentEvent, Usage } from '../shared/contracts';
import { MODEL_SERVICE_TIERS } from '../shared/model-requests';
import { isWireRecord } from './agent-wire';

type RequestDiagnostic = Extract<AgentEvent, { type: 'model-request' }>['request'];
type RequestModel = { api: string; provider: string };
const SERVICE_TIERS: ReadonlySet<string> = new Set(MODEL_SERVICE_TIERS);

/** Unknown provider strings are omitted rather than copied from a potentially sensitive response. */
export function safeServiceTier(value: unknown): string | undefined {
  return typeof value === 'string' && SERVICE_TIERS.has(value) ? value : undefined;
}

export function assertFastModel(model: RequestModel): void {
  if (model.api !== 'openai-responses' || model.provider !== 'openai') {
    throw new Error('Fast ist nur mit OpenAI Responses verfügbar.');
  }
}

/** Apply after the SDK builds the request; never silently ignore an unsupported requested tier. */
export function applyRequestedServiceTier(payload: unknown, model: RequestModel, tier?: 'fast'): unknown {
  if (!tier) return payload;
  assertFastModel(model);
  if (!isWireRecord(payload)) throw new Error('Die Fast-Anforderung konnte nicht gesetzt werden.');
  // Fast and priority are equivalent in the public API. Some ChatGPT direct routes
  // reject the fast spelling; keep logical diagnostics as fast.
  // https://developers.openai.com/api/docs/guides/fast-mode
  payload.service_tier = 'priority';
  return payload;
}

/** One serial Pi stream at a time. No prompt, response text, identifiers or credentials are retained. */
export class ModelRequestDiagnostics {
  private pending?: { started: number; model: string; actualServiceTier?: string; providerStatus?: 'failed' | 'aborted' };
  constructor(private readonly role: RequestDiagnostic['role'], private readonly requestedServiceTier: 'fast' | undefined,
    private readonly emit: (request: RequestDiagnostic) => void, private readonly now: () => number = () => performance.now()) {}

  start(model: string): void {
    // A replaced stream is an unfinished request, never a successful Fast response.
    this.finish('failed');
    this.pending = { started: this.now(), model };
  }
  observe(value: unknown): void {
    if (!this.pending || !isWireRecord(value) || !isWireRecord(value.response)) return;
    if (typeof value.type !== 'string' || !['response.completed', 'response.incomplete', 'response.failed', 'response.cancelled'].includes(value.type)) return;
    if (value.type === 'response.cancelled') this.pending.providerStatus = 'aborted';
    else if (value.type !== 'response.completed' || (value.response.status !== undefined && value.response.status !== 'completed')) this.pending.providerStatus = 'failed';
    const actualServiceTier = safeServiceTier(value.response.service_tier);
    if (actualServiceTier) this.pending.actualServiceTier = actualServiceTier;
  }
  finish(status: RequestDiagnostic['status'], usage?: Usage): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = undefined;
    this.emit({ role: this.role, model: pending.model, elapsedMs: Math.max(0, this.now() - pending.started), status: status === 'aborted' ? status : pending.providerStatus ?? status,
      ...(this.requestedServiceTier ? { requestedServiceTier: this.requestedServiceTier } : {}),
      ...(pending.actualServiceTier ? { actualServiceTier: pending.actualServiceTier } : {}), ...(usage ? { usage } : {}) });
  }
}
