import type { AgentEvent, DynamicFunctionTool, DynamicToolResponse } from '../../../shared/contracts';

export type ToolRole = 'dialog' | 'worker';
export interface ToolRunContext {
  readonly runId: string;
  readonly role: ToolRole;
  readonly signal: AbortSignal;
  emit(event: AgentEvent): void;
}
export interface ToolRegistration<Input> {
  readonly definition: DynamicFunctionTool;
  /** Omitted audience is worker-only; attaching a contribution cannot widen the dialog. */
  readonly audience?: ToolRole;
  validate(args: unknown): Input;
  execute(args: Input, context: ToolRunContext): Promise<DynamicToolResponse>;
}

/** RegisteredTool can only be constructed through defineTool's typed validation boundary. */
export const invokeRegisteredTool: unique symbol = Symbol('invoke registered tool');
export interface RegisteredTool {
  readonly definition: DynamicFunctionTool;
  readonly audience: ToolRole;
  readonly [invokeRegisteredTool]: (args: unknown, context: ToolRunContext) => Promise<DynamicToolResponse>;
}
export interface ToolContributionBinding {
  readonly tools: readonly RegisteredTool[];
  /** Abort is already signaled. Confirm release of resources owned by this run. Failures may be retried. */
  stop?(): Promise<void>;
}
export interface ToolContribution {
  /** Bind only captures authority/handlers; external operations begin in execute. */
  bind(context: ToolRunContext): ToolContributionBinding;
  dispose?(): Promise<void>;
}
export interface BoundToolset {
  readonly definitions: readonly DynamicFunctionTool[];
  call(name: string, args: unknown): Promise<DynamicToolResponse>;
  stop(): Promise<void>;
}
export interface ToolsetPort {
  bind(context: ToolRunContext): BoundToolset;
  /** Includes partial bindings whose setup failed before a BoundToolset could be returned. */
  stop(): Promise<void>;
  dispose(): Promise<void>;
}
