import type { AgentEvent, DynamicFunctionTool, DynamicToolResponse } from '../../../shared/contracts';
import { invokeRegisteredTool, type BoundToolset, type RegisteredTool, type ToolContribution, type ToolContributionBinding, type ToolRegistration, type ToolRunContext, type ToolsetPort } from './contracts';

function aborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('Werkzeugauftrag wurde unterbrochen.');
}
function freeze<Value>(value: Value, seen = new WeakSet<object>()): Value {
  if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    for (const child of Object.values(value)) freeze(child, seen);
    Object.freeze(value);
  }
  return value;
}
function definitionCopy(value: DynamicFunctionTool): DynamicFunctionTool {
  if (value?.type !== 'function' || typeof value.name !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_.-]{0,127}$/.test(value.name)
    || typeof value.description !== 'string' || !value.inputSchema || typeof value.inputSchema !== 'object') throw new Error('Ungültige Werkzeugdefinition.');
  return freeze(structuredClone({ type: 'function' as const, name: value.name, description: value.description, inputSchema: value.inputSchema,
    ...(value.deferLoading === undefined ? {} : { deferLoading: value.deferLoading }) }));
}

export function defineTool<Input>(registration: ToolRegistration<Input>): RegisteredTool {
  const definition = definitionCopy(registration.definition), audience = registration.audience ?? 'worker';
  if (audience !== 'dialog' && audience !== 'worker') throw new Error('Ungültige Werkzeugrolle.');
  const validate = registration.validate.bind(registration), execute = registration.execute.bind(registration);
  return Object.freeze({ definition, audience, [invokeRegisteredTool]: async (args: unknown, context: ToolRunContext): Promise<DynamicToolResponse> => {
    aborted(context.signal);
    if (audience !== context.role) throw new Error('Werkzeug ist für diese Rolle nicht freigegeben.');
    const input = validate(args);
    aborted(context.signal);
    const result = await execute(input, context);
    aborted(context.signal);
    return result;
  } });
}

async function settled(operations: Promise<void>[]): Promise<void> {
  const results = await Promise.allSettled(operations);
  const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failed) throw failed.reason;
}
const invokeCleanup = (operation: (() => Promise<void>) | undefined): Promise<void> => {
  try { return operation?.() ?? Promise.resolve(); } catch (error) { return Promise.reject(error); }
};

/** Registry instances are explicit adapter dependencies; definitions and dispatch are captured once per run. */
export function createToolRegistry(contributions: readonly ToolContribution[]): ToolsetPort {
  const sources = [...contributions], bindings = new Set<BoundToolset>(), awaitingRelease = new Set<BoundToolset>();
  let disposed = false, disposing: Promise<void> | undefined, stopping: Promise<void> | undefined;
  const stop = () => stopping ??= settled([...bindings].map(binding => binding.stop())).finally(() => { stopping = undefined; });
  return {
    bind(parent): BoundToolset {
      if (disposed || disposing) throw new Error('Werkzeugregistrierung wird beendet.');
      if (stopping || awaitingRelease.size) throw new Error('Die Freigabe einer Werkzeugbindung ist noch unbestätigt.');
      aborted(parent.signal);
      const abort = new AbortController();
      const relayAbort = () => abort.abort(); parent.signal.addEventListener('abort', relayAbort, { once: true });
      const context: ToolRunContext = Object.freeze({ runId: parent.runId, role: parent.role, signal: abort.signal,
        emit: (event: AgentEvent) => { if (!abort.signal.aborted) parent.emit(event); } });
      const parts: ToolContributionBinding[] = [], tools = new Map<string, RegisteredTool>();
      let stopped = false, stoppingBinding: Promise<void> | undefined;
      const bound: BoundToolset = {
        definitions: [],
        async call(name, args) {
          aborted(abort.signal);
          const tool = tools.get(name);
          if (!tool) throw new Error('Werkzeugaufruf abgelehnt.');
          return tool[invokeRegisteredTool](args, context);
        },
        stop() {
          abort.abort();
          if (stopped) return Promise.resolve();
          awaitingRelease.add(bound);
          return stoppingBinding ??= settled(parts.map(part => invokeCleanup(part.stop?.bind(part)))).then(() => {
            stopped = true; bindings.delete(bound); awaitingRelease.delete(bound); parent.signal.removeEventListener('abort', relayAbort);
          }).finally(() => { stoppingBinding = undefined; });
        },
      };
      // Retain a failed/partial binding until cleanup succeeds or the owning adapter retries dispose.
      bindings.add(bound);
      try {
        for (const source of sources) {
          const part = source.bind(context); parts.push(part);
          for (const tool of part.tools) {
            if (tool.audience !== parent.role) continue;
            const definition = definitionCopy(tool.definition);
            if (tools.has(definition.name)) throw new Error(`Werkzeug ist doppelt registriert: ${definition.name}`);
            tools.set(definition.name, tool);
          }
        }
        Object.defineProperty(bound, 'definitions', { value: Object.freeze([...tools.values()].map(tool => definitionCopy(tool.definition))), writable: false });
        return Object.freeze(bound);
      } catch (error) {
        abort.abort(); void bound.stop().catch(() => {}); throw error;
      }
    },
    stop,
    dispose() {
      if (disposed) return Promise.resolve();
      return disposing ??= stop().then(() =>
        settled(sources.map(source => invokeCleanup(source.dispose?.bind(source))))).then(() => { disposed = true; })
        .finally(() => { disposing = undefined; });
    },
  };
}
