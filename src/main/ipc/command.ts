import { decodeResult, type CommandArgs, type CommandName, type CommandResult } from '../../shared/ipc';
import type { MaybePromise } from './ports';

export type CommandHandler<Name extends CommandName> = (rawArgs: unknown) => Promise<CommandResult<Name>>;
export type HandlerMap = { [Name in CommandName]: CommandHandler<Name> };
/** The command literal fixes both the validated argument tuple and the actual handler result. */
export function command<Name extends CommandName>(name: Name, arity: number,
  parse: (values: readonly unknown[]) => CommandArgs<NoInfer<Name>>,
  execute: (...args: CommandArgs<NoInfer<Name>>) => MaybePromise<CommandResult<NoInfer<Name>>>,
): CommandHandler<Name> {
  return async raw => {
    if (!Array.isArray(raw) || raw.length !== arity) throw new Error('Ungültige Aufrufargumente.');
    const values: readonly unknown[] = raw;
    return decodeResult(name, await execute(...parse(values)));
  };
}
export function noArgs(): [] { return []; }
export function inputText(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label} ist leer oder zu lang.`);
  return value.trim();
}
export function inputObject(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new Error(label);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(label);
  return value as Record<string, unknown>;
}
