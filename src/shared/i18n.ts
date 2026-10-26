import messages from './locales/messages.json';
import { languageLocale, type UiLanguage } from './ui-language';

export const TRANSLATION_LANGUAGES = ['en', 'es', 'fr', 'zh-CN', 'ja', 'pt-BR'] as const;
export const messageCatalog: Readonly<Record<string, readonly string[]>> = messages;
const normalized = (value: string) => value.replace(/\s+/g, ' ').trim();
/** Values are substituted once, as text. User content is never a translation key. */
export function translate(language: UiLanguage, source: string, ...values: readonly unknown[]): string {
  const key = normalized(source);
  const row = Object.hasOwn(messageCatalog, key) ? messageCatalog[key] : undefined;
  const index = TRANSLATION_LANGUAGES.indexOf(language as typeof TRANSLATION_LANGUAGES[number]);
  const target = language === 'de' || !row ? source : (row[index] ?? row[0]);
  const prefix = /^\s+/.exec(source)?.[0] ?? '', suffix = /\s+$/.exec(source)?.[0] ?? '';
  const text = language === 'de' || !row ? target : prefix + target + suffix;
  return text.replace(/\{(\d+)\}/g, (marker, index: string) => +index < values.length ? String(values[+index]) : marker);
}

// Each app process owns one profile. Set at its snapshot boundary, before rendering.
// No component is remounted and asynchronous callbacks read the latest display language.
let currentLanguage: UiLanguage = 'de';
export function setUiLanguage(language: UiLanguage): void { currentLanguage = language; }
export function getUiLanguage(): UiLanguage { return currentLanguage; }
export function uiLocale(): string { return languageLocale(currentLanguage); }
export function numberFormatter(options?: Intl.NumberFormatOptions): Pick<Intl.NumberFormat, 'format'> {
  return { format: value => new Intl.NumberFormat(uiLocale(), options).format(value) };
}
export function dateFormatter(options?: Intl.DateTimeFormatOptions): Pick<Intl.DateTimeFormat, 'format'> {
  return { format: value => new Intl.DateTimeFormat(uiLocale(), options).format(value) };
}
export function t(source: string, ...values: readonly unknown[]): string { return translate(currentLanguage, source, ...values); }

/** Static UI tables retain stable identities and translate their copy at read time. */
export function localized<T extends object>(source: T): T {
  const cache = new WeakMap<object, object>();
  function wrap(value: object): object {
    const previous = cache.get(value); if (previous) return previous;
    const proxy = new Proxy(value, { get(target, key, receiver) {
      const item: unknown = Reflect.get(target, key, receiver);
      return typeof item === 'string' ? t(item) : item && typeof item === 'object' ? wrap(item) : item;
    } });
    cache.set(value, proxy); return proxy;
  }
  return wrap(source) as T;
}

/** Only known application diagnostics are localized; external errors remain verbatim. */
export function translateDiagnostic(source: string): string {
  if (Object.hasOwn(messageCatalog, normalized(source))) return t(source);
  return source;
}
