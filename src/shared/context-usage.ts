import { uiLocale } from './i18n';
import type { ContextUsage } from './contracts';

export const CONTEXT_WARN_PERCENT = 60;
export const CONTEXT_FULL_PERCENT = 85;

export interface ContextFill { fresh: boolean; usedTokens: number; windowTokens?: number; percent?: number; level: 'ok' | 'warn' | 'full'; }

/** A report from an earlier thread says nothing about the current conversation, which then counts as fresh. */
export function contextFill(context: ContextUsage | undefined, threadId: string | undefined): ContextFill {
  if (!context || !threadId || context.threadId !== threadId) return { fresh: true, usedTokens: 0, level: 'ok' };
  const percent = context.windowTokens ? Math.min(100, Math.round(context.usedTokens / context.windowTokens * 100)) : undefined;
  const level = percent === undefined || percent < CONTEXT_WARN_PERCENT ? 'ok' : percent < CONTEXT_FULL_PERCENT ? 'warn' : 'full';
  return { fresh: false, usedTokens: context.usedTokens, ...(context.windowTokens ? { windowTokens: context.windowTokens } : {}), ...(percent !== undefined ? { percent } : {}), level };
}

export function formatTokens(tokens: number): string {
  return tokens < 1000 ? String(tokens) : `${new Intl.NumberFormat(uiLocale(), { maximumFractionDigits: tokens < 10_000 ? 1 : 0 }).format(tokens / 1000)} k`;
}
