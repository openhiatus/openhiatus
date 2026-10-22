import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { favoriteKey, favoriteLevel, MAX_SKILL_FAVORITES, nextFavoriteLevel, parseSkillFavorites, withFavoriteLevel } from '../src/shared/skill-favorites';
import { favoriteSkillsContext, FULL_SKILL_MAX_BYTES } from '../src/main/skill-favorites-context';
import { StateStore, defaultState } from '../src/main/storage';
import type { OpenhiatusCapabilitySkill } from '../src/main/capabilities';

const skill = (name: string): OpenhiatusCapabilitySkill => ({ name, description: `${name} beschreibt etwas.`, path: `C:\\Skills\\${name}\\SKILL.md`, scope: 'user' });

test('the star cycles empty → silver → gold → empty and paths match case- and separator-insensitively', () => {
  assert.equal(nextFavoriteLevel(undefined), 'favorite');
  assert.equal(nextFavoriteLevel('favorite'), 'full');
  assert.equal(nextFavoriteLevel('full'), undefined);
  let favorites = withFavoriteLevel(undefined, 'C:\\Skills\\Codex\\SKILL.md', 'favorite');
  assert.equal(favoriteLevel(favorites, 'c:/skills/codex/SKILL.md'), 'favorite');
  favorites = withFavoriteLevel(favorites, 'c:/skills/codex/skill.md', undefined);
  assert.deepEqual(favorites, {});
});

test('favourite settings reject invalid levels, control characters and oversized lists', () => {
  assert.deepEqual(parseSkillFavorites({ 'C:\\A\\SKILL.md': 'full' }), { [favoriteKey('C:\\A\\SKILL.md')]: 'full' });
  assert.throws(() => parseSkillFavorites({ 'C:\\A\\SKILL.md': 'always' }));
  assert.throws(() => parseSkillFavorites({ 'C:\\A\n\\SKILL.md': 'favorite' }));
  assert.throws(() => parseSkillFavorites([]));
  assert.throws(() => parseSkillFavorites(Object.fromEntries(Array.from({ length: MAX_SKILL_FAVORITES + 1 }, (_, i) => [`C:\\S${i}\\SKILL.md`, 'favorite']))));
});

test('silver favourites are offered without their text; gold ones carry the full SKILL.md within limits', () => {
  const skills = [skill('alpha'), skill('beta'), skill('gamma'), skill('delta'), skill('ohne')];
  const favorites = parseSkillFavorites({ [skills[0].path]: 'favorite', [skills[1].path]: 'full', [skills[2].path]: 'full', [skills[3].path]: 'full' });
  const reads: string[] = [];
  const context = favoriteSkillsContext(skills, favorites, text => text, path => {
    reads.push(path);
    if (path.includes('gamma')) return 'x'.repeat(FULL_SKILL_MAX_BYTES + 1);
    if (path.includes('delta')) throw new Error('gesperrt');
    return '# Beta\nSchritt eins.';
  });
  assert.deepEqual(reads, [skills[1].path, skills[2].path, skills[3].path], 'silver skills are never read');
  assert.match(context, /Bevorzuge sie, wenn sie zum Auftrag passen/);
  assert.match(context, /"name":"alpha"[^}]*"anleitung":"bei Bedarf lesen"/);
  assert.ok(context.includes(`### beta (${skills[1].path})\n# Beta\nSchritt eins.`), 'gold text is handed over verbatim');
  assert.match(context, /"name":"gamma"[^}]*zu groß zum Mitgeben/);
  assert.doesNotMatch(context, /xxxx/);
  assert.match(context, /"name":"delta"[^}]*nicht lesbar/);
  assert.doesNotMatch(context, /"name":"ohne"/);
  assert.equal(favoriteSkillsContext(skills, {}, text => text), '');
});

test('favourites and the earcon choice survive a restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'openhiatus-favorites-'));
  const state = defaultState();
  state.preferences.earcons = false;
  state.preferences.skillFavorites = parseSkillFavorites({ 'C:\\Skills\\codex\\SKILL.md': 'favorite' });
  new StateStore(directory).save(state);
  const loaded = new StateStore(directory).load();
  assert.equal(loaded.preferences.earcons, false);
  assert.deepEqual(loaded.preferences.skillFavorites, { 'c:\\skills\\codex\\skill.md': 'favorite' });
});
