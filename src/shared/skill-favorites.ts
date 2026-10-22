/** `favorite` (silver) is always offered first; `full` (gold) additionally hands over the complete SKILL.md. */
export type SkillFavoriteLevel = 'favorite' | 'full';
export type SkillFavorites = Record<string, SkillFavoriteLevel>;
export const MAX_SKILL_FAVORITES = 32;

/** Windows paths compare case-insensitively and with either separator. */
export function favoriteKey(path: string): string { return path.replace(/\//g, '\\').toLowerCase(); }

export function favoriteLevel(favorites: SkillFavorites | undefined, path: string): SkillFavoriteLevel | undefined {
  return favorites?.[favoriteKey(path)];
}

/** Empty → silver → gold → empty. */
export function nextFavoriteLevel(level: SkillFavoriteLevel | undefined): SkillFavoriteLevel | undefined {
  return level === undefined ? 'favorite' : level === 'favorite' ? 'full' : undefined;
}

export function withFavoriteLevel(favorites: SkillFavorites | undefined, path: string, level: SkillFavoriteLevel | undefined): SkillFavorites {
  const next = { ...favorites };
  if (level) next[favoriteKey(path)] = level; else delete next[favoriteKey(path)];
  return next;
}

export function parseSkillFavorites(value: unknown): SkillFavorites {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ungültige Skill-Favoriten.');
  const entries = Object.entries(value);
  if (entries.length > MAX_SKILL_FAVORITES) throw new Error(`Höchstens ${MAX_SKILL_FAVORITES} Skill-Favoriten sind möglich.`);
  const favorites: SkillFavorites = {};
  for (const [path, level] of entries) {
    if (!path || path.length > 1024 || /[\u0000-\u001f\u007f]/u.test(path) || (level !== 'favorite' && level !== 'full')) throw new Error('Ungültige Skill-Favoriten.');
    favorites[favoriteKey(path)] = level;
  }
  return favorites;
}
