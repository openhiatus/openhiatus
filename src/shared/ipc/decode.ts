export type Decoder<Value> = (value: unknown) => Value;
export function invalidPayload(): never { throw new Error('Ungültige lokale App-Antwort.'); }
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalidPayload();
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalidPayload();
  return value as Record<string, unknown>;
}
export const text = (max = 200000): Decoder<string> => value => typeof value === 'string' && value.length <= max ? value : invalidPayload();
export const boolean: Decoder<boolean> = value => typeof value === 'boolean' ? value : invalidPayload();
export const number: Decoder<number> = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : invalidPayload();
export const integer: Decoder<number> = value => { const result = number(value); return Number.isSafeInteger(result) ? result : invalidPayload(); };
export const nothing: Decoder<undefined> = value => value === undefined ? undefined : invalidPayload();
export function optional<Value>(decode: Decoder<Value>): Decoder<Value | undefined> { return value => value === undefined ? undefined : decode(value); }
export function choice<const Values extends readonly string[]>(values: Values): Decoder<Values[number]> {
  return value => typeof value === 'string' && values.includes(value) ? value as Values[number] : invalidPayload();
}
export function array<Value>(decode: Decoder<Value>, max = 50000): Decoder<Value[]> {
  return value => {
    if (!Array.isArray(value) || value.length > max) return invalidPayload();
    const values: unknown[] = value;
    return Array.from(values, decode);
  };
}
type ObjectShape = Record<string, Decoder<unknown>>;
type DecodedObject<Shape extends ObjectShape> = { [Key in keyof Shape]: ReturnType<Shape[Key]> };
/** Project only declared DTO fields. Storage/business invariants remain in their owning modules. */
export function object<Shape extends ObjectShape>(shape: Shape): Decoder<DecodedObject<Shape>> {
  return value => {
    const source = record(value), result: Record<string, unknown> = {};
    for (const key of Object.keys(shape)) {
      const parsed = shape[key](source[key]);
      if (parsed !== undefined || Object.hasOwn(source, key)) result[key] = parsed;
    }
    // Every projected field above was decoded by the corresponding shape entry.
    return result as DecodedObject<Shape>;
  };
}
