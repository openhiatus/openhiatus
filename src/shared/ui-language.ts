export const UI_LANGUAGES = [
  { id: 'en', name: 'English', locale: 'en-US' },
  { id: 'es', name: 'Español', locale: 'es-ES' },
  { id: 'fr', name: 'Français', locale: 'fr-FR' },
  { id: 'de', name: 'Deutsch', locale: 'de-DE' },
  { id: 'zh-CN', name: '简体中文', locale: 'zh-CN' },
  { id: 'ja', name: '日本語', locale: 'ja-JP' },
  { id: 'pt-BR', name: 'Português (Brasil)', locale: 'pt-BR' },
] as const;
export type UiLanguage = typeof UI_LANGUAGES[number]['id'];
export function parseUiLanguage(value: unknown): UiLanguage {
  if (typeof value !== 'string' || !UI_LANGUAGES.some(language => language.id === value)) throw Error('Ungültige Sprache der Oberfläche.');
  return value as UiLanguage;
}
/** Map an OS locale to one of the explicitly supported writing systems/variants. */
export function resolveUiLanguage(value: string): UiLanguage {
  const base = value.toLowerCase().replaceAll('_', '-').split('-')[0];
  return base === 'zh' ? 'zh-CN' : base === 'pt' ? 'pt-BR' : (['de', 'en', 'es', 'fr', 'ja'] as const).find(item => item === base) ?? 'en';
}
export function languageLocale(language: UiLanguage): string { return UI_LANGUAGES.find(item => item.id === language)!.locale; }
