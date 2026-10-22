import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, FileText, FolderOpen, Info, LoaderCircle, Puzzle, RefreshCw, Search, Star, X } from 'lucide-react';
import type { SkillCatalog, SkillEntry } from '../shared/contracts';
import { favoriteLevel, nextFavoriteLevel, type SkillFavoriteLevel, type SkillFavorites } from '../shared/skill-favorites';

interface Props {
  onInsert: (skill: SkillEntry) => void;
  insertDisabledReason?: string;
  favorites?: SkillFavorites;
  onFavoriteChange?: (path: string, level: SkillFavoriteLevel | undefined) => void;
}

const scopeLabels: Record<SkillEntry['scope'], string> = { user: 'Persönlich', repo: 'Projekt', system: 'System', admin: 'Verwaltet' };
const starLabels = { none: 'kein Favorit', favorite: 'Favorit, geht immer mit', full: 'Favorit, wird immer vollständig mitgegeben' };
const starOrder = { full: 0, favorite: 1, none: 2 };

/** Empty star: nothing. Silver: always offered first. Gold: the full SKILL.md goes along. */
function FavoriteStar({ skill, level, onChange }: { skill: SkillEntry; level?: SkillFavoriteLevel; onChange?: Props['onFavoriteChange'] }) {
  const name = skill.displayName || skill.name;
  const next = nextFavoriteLevel(level);
  return <button className={`skill-star ${level ?? 'none'}`} disabled={!onChange || !skill.enabled} aria-label={`Favorit für ${name}: ${starLabels[level ?? 'none']}`}
    title={`${starLabels[level ?? 'none']}. Klicken: ${starLabels[next ?? 'none']}`} onClick={() => onChange?.(skill.path, next)}>
    <Star size={17} fill={level ? 'currentColor' : 'none'} strokeWidth={1.7} />
  </button>;
}

export function SkillsView({ onInsert, insertDisabledReason, favorites, onFavoriteChange }: Props) {
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [catalog, setCatalog] = useState<SkillCatalog>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [opening, setOpening] = useState(false);
  const request = useRef(0);
  const mounted = useRef(false);

  const refresh = useCallback(async () => {
    const currentRequest = ++request.current;
    setLoading(true); setError('');
    try {
      const next = await window.openhiatus.listSkills();
      if (mounted.current && currentRequest === request.current) setCatalog(next);
    } catch (err) {
      if (mounted.current && currentRequest === request.current) {
        setCatalog(undefined);
        setError(err instanceof Error ? err.message : 'Die Skills konnten nicht geladen werden.');
      }
    } finally {
      if (mounted.current && currentRequest === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; request.current++; };
  }, [refresh]);

  async function openFolder() {
    if (opening) return;
    setOpening(true); setError('');
    try { await window.openhiatus.openSkillsFolder(); }
    catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : 'Der Skill-Ordner konnte nicht geöffnet werden.'); }
    finally { if (mounted.current) setOpening(false); }
  }

  const search = query.trim().toLocaleLowerCase('de');
  const level = (skill: SkillEntry) => favoriteLevel(favorites, skill.path) ?? 'none';
  const favoriteCount = catalog?.skills.filter(skill => level(skill) !== 'none').length ?? 0;
  // Favourites lead the list; the catalog order stays otherwise unchanged.
  const skills = (catalog?.skills.filter(skill => (!onlyFavorites || level(skill) !== 'none')
    && (!search || [skill.name, skill.displayName, skill.description, skill.path].some(value => value?.toLocaleLowerCase('de').includes(search)))) ?? [])
    .map((skill, index) => ({ skill, index })).sort((a, b) => starOrder[level(a.skill)] - starOrder[level(b.skill)] || a.index - b.index).map(({ skill }) => skill);
  const activeCount = catalog?.skills.filter(skill => skill.enabled).length ?? 0;

  return <main className="skills-scroll" aria-labelledby="skills-heading">
    <div className="skills-content">
      <div className="skills-heading"><div><div className="eyebrow">DAS PASSENDE WISSEN FÜR DEINEN AUFTRAG.</div><h1 id="skills-heading">Deine Skills.</h1><p>openHiatus kennt deine aktiven Skills und wählt passende Anleitungen selbst.<br />Du kannst eine Anleitung auch gezielt in deinen Auftrag einfügen.</p></div><span className="skills-heading-icon" aria-hidden="true"><Puzzle size={31} /></span></div>

      <div className="skills-toolbar">
        <label className="skills-search"><Search size={16} /><input aria-label="Skills durchsuchen" placeholder="Name, Beschreibung oder Pfad suchen" value={query} onChange={event => setQuery(event.target.value)} />{query && <button aria-label="Skill-Suche leeren" onClick={() => setQuery('')}><X size={14} /></button>}</label>
        <button className="secondary-button" disabled={loading} onClick={() => void refresh()}><RefreshCw size={14} className={loading ? 'spin' : ''} /> Aktualisieren</button>
      </div>
      {error && <div className="skills-error" role="alert"><Info size={16} /><div><strong>Skills konnten nicht vollständig geladen oder geöffnet werden.</strong><p>{error}</p></div></div>}
      {insertDisabledReason && <p className="skills-pending" role="status"><Info size={14} />{insertDisabledReason}</p>}

      {loading ? <div className="skills-empty" role="status"><LoaderCircle size={25} className="spin" /><h2>Skills werden geladen …</h2><p>openHiatus liest die verfügbaren Anleitungen aus deinem Skill-Ordner.</p></div> : !catalog ? <div className="skills-empty"><Puzzle size={28} /><h2>Die Skill-Liste ist noch nicht verfügbar.</h2><p>Du kannst sie erneut laden. Dein Gespräch und dein Entwurf bleiben erhalten.</p><button className="secondary-button" onClick={() => void refresh()}><RefreshCw size={14} /> Erneut laden</button></div> : <>
        <div className="skills-list-heading"><h2>{search || onlyFavorites ? `${skills.length} Treffer` : 'Verfügbare Anleitungen'}</h2><button className={`skills-favorite-filter ${onlyFavorites ? 'selected' : ''}`} aria-pressed={onlyFavorites} onClick={() => setOnlyFavorites(!onlyFavorites)}><Star size={12} fill={onlyFavorites ? 'currentColor' : 'none'} /> Nur Favoriten · {favoriteCount}</button><span>{activeCount} aktiv · {catalog.skills.length} insgesamt</span></div>
        <p className="skills-star-legend"><span className="skill-star none"><Star size={13} /></span> kein Favorit <span className="skill-star favorite"><Star size={13} fill="currentColor" /></span> geht als Favorit mit <span className="skill-star full"><Star size={13} fill="currentColor" /></span> wird immer vollständig mitgegeben (höchstens 12 KB je Skill, 24 KB gesamt) · gilt ab der nächsten Nachricht</p>
        {skills.length ? <ul className="skills-list">{skills.map(skill => <li className={`skill-card ${skill.enabled ? '' : 'disabled'}`} key={skill.path}>
          <div className="skill-card-top"><span className="skill-card-icon" aria-hidden="true"><FileText size={21} /></span><div className="skill-title"><h3>{skill.displayName || skill.name}</h3>{skill.displayName && skill.displayName !== skill.name && <span>{skill.name}</span>}</div><span className={`skill-state ${skill.enabled ? 'enabled' : ''}`}>{skill.enabled && <Check size={11} />}{skill.enabled ? 'Aktiv' : 'Deaktiviert'}</span><FavoriteStar skill={skill} level={favoriteLevel(favorites, skill.path)} onChange={onFavoriteChange} /></div>
          <p className="skill-description">{skill.description || 'Für diesen Skill ist keine Beschreibung hinterlegt.'}</p>
          <div className="skill-file"><span>SKILL-DATEI</span><code>{skill.path}</code></div>
          <div className="skill-card-actions"><span className="skill-scope">{scopeLabels[skill.scope]}</span><button className="secondary-button" aria-label={`Pfad für ${skill.displayName || skill.name} in Auftrag einfügen`} disabled={!skill.enabled || !!insertDisabledReason} title={!skill.enabled ? 'Dieser Skill ist in openHiatus deaktiviert.' : insertDisabledReason} onClick={() => onInsert(skill)}>In Auftrag einfügen <ArrowUpRight size={14} /></button></div>
          {!skill.enabled && <p className="skill-disabled-note">Dieser Skill ist in openHiatus deaktiviert und kann deshalb hier nicht ausgewählt werden.</p>}
        </li>)}</ul> : <div className="skills-empty"><Puzzle size={28} /><h2>{search ? 'Kein passender Skill gefunden.' : 'Hier ist Platz für deine ersten Skills.'}</h2><p>{search ? 'Versuche einen anderen Suchbegriff oder leere die Suche.' : 'Lege jede Anleitung mit ihrer SKILL.md in einen eigenen Unterordner des Skill-Ordners. Danach kannst du die Liste aktualisieren.'}</p>{search && <button className="secondary-button" onClick={() => setQuery('')}>Suche leeren</button>}</div>}
        {!!catalog.errors.length && <details className="skills-load-issues"><summary><Info size={14} />{catalog.errors.length} {catalog.errors.length === 1 ? 'Anleitung konnte' : 'Anleitungen konnten'} nicht geladen werden</summary><ul>{catalog.errors.map((issue, index) => <li key={`${issue.path}-${index}`}><code>{issue.path}</code><p>{issue.message}</p></li>)}</ul></details>}
      </>}

      <section className="skills-folder"><div><FolderOpen size={18} /><div><h2>Dein Skill-Ordner</h2><p>Hier liegen deine eigenen Anleitungen für openHiatus.</p></div></div>{catalog?.directory && <code>{catalog.directory}</code>}<button className="text-button" disabled={opening} onClick={() => void openFolder()}>{opening ? <LoaderCircle size={13} className="spin" /> : <FolderOpen size={13} />} Ordner öffnen</button></section>
      <p className="skills-footnote"><Info size={14} /><span>Der Pfad ergänzt deinen vorhandenen Entwurf. Du bestimmst den Auftrag und sendest ihn selbst.</span></p>
    </div>
  </main>;
}
