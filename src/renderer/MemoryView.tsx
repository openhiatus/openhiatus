import { localized, t, uiLocale } from '../shared/i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, CalendarDays, Check, ChevronDown, FileText, History, Info, Layers, LoaderCircle, LockKeyhole, Pencil, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import type { Snapshot } from '../shared/contracts';
import { IDENTITY_FILES, isIdentityFile, soulFromStyle, hasIdentityFiles } from '../shared/identity-documents';
import { resolvePersonality } from '../shared/assistant-profile';
import { AssistantProfileCard } from './features/settings';
import type { CoreProposal, MemoryDocument, MemoryKind, MemorySearchResult, MemorySnapshot, MemorySource, MemorySummaryMetadata, SummaryJobState } from '../shared/memory';

type Section = 'memories' | 'identity' | 'proposals' | 'instructions';
type Period = 'day' | 'week' | 'month';
type Draft = { content: string; original: string; version: number };
const kindLabels: Record<MemoryKind, string> = localized({ day: 'Tagesgedächtnis', week: 'Wochengedächtnis', month: 'Monatsgedächtnis', identity: 'Frühere Hintergrundnotiz', core: 'Langzeitgedächtnis', soul: 'Persönlichkeit & Werte', agent: 'Agentenidentität', user: 'Benutzerprofil' });
const revisionLabels = localized({ created: 'Angelegt', capture: 'Gespräch übernommen', rebuild: 'Lokale Auszüge aktualisiert', 'user-edit': 'Von dir bearbeitet', 'external-edit': 'Markdown-Datei bearbeitet', 'approved-proposal': 'Vorschlag freigegeben', 'ai-summary': 'Bericht mit openHiatus erstellt' });
const date = (value: string) => new Date(value).toLocaleString(uiLocale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const message = (error: unknown) => error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '') : t("Der Eintrag konnte nicht geladen werden.");

export function memoryDocumentTitle(document: { id: string; title: string }): string {
  return document.id === 'identity' ? t("Frühere Hintergrundnotiz") : IDENTITY_FILES.find(file => file.id === document.id)?.filename ?? document.title;
}

export function memoryLongTermDocuments(documents: MemoryDocument[], showAdvanced: boolean, backgroundDraft?: Pick<Draft, 'content' | 'original'>): MemoryDocument[] {
  const keepDraftVisible = !!backgroundDraft && backgroundDraft.content !== backgroundDraft.original;
  const position = (id: string) => IDENTITY_FILES.findIndex(file => file.id === id);
  return documents.filter(item => isIdentityFile(item.id) || item.kind === 'identity' && (showAdvanced || keepDraftVisible))
    .sort((a, b) => (position(a.id) < 0 ? 99 : position(a.id)) - (position(b.id) < 0 ? 99 : position(b.id)));
}

export function memoryDayIdentifier(value: string): string | undefined {
  const input = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  const german = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(input);
  if (!iso && !german) return;
  const year = iso?.[1] ?? german![3];
  const month = (iso?.[2] ?? german![2]).padStart(2, '0');
  const day = (iso?.[3] ?? german![1]).padStart(2, '0');
  const key = `${year}-${month}-${day}`;
  const parsed = new Date(`${key}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === key ? `day:${key}` : undefined;
}

export function ReportProvenance({ summary, edited = false }: { summary?: MemorySummaryMetadata; edited?: boolean }) {
  return <div className={`memory-report-provenance ${edited ? 'corrected' : summary?.stale ? 'stale' : summary ? 'generated' : 'interim'}`}>
    <div>{edited ? <Pencil size={13} /> : summary ? <Sparkles size={13} /> : <History size={13} />}<strong>{edited ? t("Von dir korrigiert") : summary?.stale ? t("KI-Bericht · Aktualisierung ausstehend") : summary ? t("KI-Bericht mit openHiatus") : t("Vorläufige Auszüge · noch kein KI-Bericht")}</strong></div>
    {summary ? <p>{edited ? t("Berichtsgrundlage: ") : t("Erstellt mit ")}openHiatus · {summary.model} · {date(summary.generatedAt)}{edited ? t(". Deine Korrektur bleibt bei automatischen Aktualisierungen erhalten.") : summary.stale ? t(". Die vorhandene Fassung bleibt bis zur nächsten erfolgreichen Aktualisierung lesbar.") : '.'}</p>
      : <p>{edited ? t("Deine Fassung wird nicht automatisch überschrieben. Die Originalquellen bleiben erhalten.") : t("Diese lokalen Auszüge zeigen den bisherigen Inhalt. Ein inhaltlich zusammengefasster Bericht wurde noch nicht erstellt.")}</p>}
  </div>;
}

export function RelatedReports({ inputs, documents, onOpen }: { inputs: MemorySummaryMetadata['inputDocuments']; documents: MemoryDocument[]; onOpen: (id: string) => void }) {
  if (!inputs.length) return null;
  return <details className="memory-disclosure"><summary><Layers size={14} />{t(" Verwendete Berichte ")}<span>{inputs.length}</span><ChevronDown size={14} /></summary><div className="memory-related-reports">{inputs.map(input => {
    const document = documents.find(item => item.id === input.id);
    const revision = document?.version === input.version ? document : document?.history.find(item => item.version === input.version);
    return <details key={`${input.id}:${input.version}`}><summary><FileText size={13} /><span>{memoryDocumentTitle(document ?? { id: input.id, title: input.id })}<small>{t("Verwendete Version ")}{input.version}{document && document.version !== input.version ? t(" · aktuell Version {0}", document.version) : ''}</small></span><ChevronDown size={13} /></summary><pre>{revision?.content ?? t("Die verwendete Berichtsfassung ist nicht verfügbar.")}</pre>{document && <button className="text-button" onClick={() => onOpen(document.id)}>{t("Aktuelle Fassung öffnen")}</button>}</details>;
  })}</div></details>;
}

export function MemorySummaryProgress({ job }: { job?: SummaryJobState }) {
  if (!job || job.status === 'idle') return null;
  const running = job.status === 'running' || job.status === 'stopping';
  const title = job.status === 'running' ? t("openHiatus erstellt deine Berichte") : job.status === 'stopping' ? t("Berichterstellung wird gestoppt") : job.status === 'failed' ? t("Berichterstellung unterbrochen: Fehler") : job.status === 'interrupted' ? t("Berichterstellung gestoppt") : job.remaining > 0 ? t("Durchlauf beendet · weitere Berichte offen") : t("Letzter Durchlauf abgeschlossen");
  return <section className={`memory-summary-progress ${job.status}`} aria-label={t("Fortschritt der Gedächtnisberichte")}>
    <div className="memory-summary-progress-heading"><span className="memory-summary-progress-icon">{running ? <LoaderCircle size={17} className="spin" /> : job.status === 'completed' ? <Check size={17} /> : <Info size={17} />}</span><div><h2>{title}</h2><p>{job.mode === 'auto' ? t("Automatische Aufbereitung") : t("Manuell gestartet")} · {job.model}</p></div><span className="memory-job-count">{job.completed} / {job.total}</span></div>
    {running && <><div className="memory-progress-track" role="progressbar" aria-label={t("Fertige Berichte")} aria-valuemin={0} aria-valuemax={Math.max(1, job.total)} aria-valuenow={job.completed}><span style={{ width: `${Math.min(100, job.total ? job.completed / job.total * 100 : 0)}%` }} /></div><p className="memory-current-report">{job.currentTitle ?? t("Nächster Bericht wird vorbereitet …")}</p></>}
    <div className="memory-summary-counts"><span><b>{job.completed}</b>{t(" Berichte gespeichert")}</span><span><b>{job.remaining}</b>{t(" noch offen")}</span><span><b>{job.calls} / {job.maxCalls}</b>{t(" Modellaufrufe")}</span></div>
    {job.error && <p className="memory-summary-error" role="alert">{job.error}</p>}
    <p className="memory-summary-footnote">{running ? t("Stopp oben oder Esc beendet auch diese Arbeit. Bereits gespeicherte Berichte bleiben erhalten.") : t("Bereits gespeicherte Berichte und sämtliche Originalquellen bleiben erhalten.")}</p>
  </section>;
}

/** A proposal is approvable only against the exact protected version it describes. */
export function proposalIsCurrent(proposal: CoreProposal, document: MemoryDocument | undefined): boolean {
  return proposal.status === 'pending' && document?.version === proposal.baseVersion;
}

function SourceItem({ id, index }: { id: string; index: number }) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<MemorySource>();
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open || source) return;
    let disposed = false;
    void window.openhiatus.memorySource(id).then(value => {
      if (!disposed) { if (value) setSource(value); else setError(t("Die ursprüngliche Nachricht ist nicht verfügbar.")); }
    }).catch(error => { if (!disposed) setError(message(error)); });
    return () => { disposed = true; };
  }, [id, open, source]);
  return <div className={`memory-source ${open ? 'open' : ''}`}>
    <button className="memory-source-head" onClick={() => setOpen(!open)} aria-expanded={open}>
      <FileText size={13} /><span>{source ? `${source.role === 'user' ? t("Du") : 'openHiatus'} · ${date(source.at)}` : t("Originalnachricht {0}", index + 1)}</span><ChevronDown size={13} />
    </button>
    {open && <div className="memory-source-body">{error ? <p role="alert">{error}</p> : source ? <><pre>{source.text}</pre><span className="memory-source-id">{t("Nachricht: ")}{source.id}{t(" · Gespräch: ")}{source.conversationId}</span></> : <span className="memory-loading-inline"><LoaderCircle size={13} className="spin" />{t(" Quelle wird geladen …")}</span>}</div>}
  </div>;
}

function SourceList({ ids }: { ids: string[] }) {
  const [all, setAll] = useState(false);
  const unique = [...new Set(ids)];
  if (!unique.length) return <p className="memory-subtle">{t("Keine Gesprächsquelle hinterlegt. Dieser Inhalt wurde direkt festgelegt.")}</p>;
  return <div className="memory-source-list">{(all ? unique : unique.slice(0, 8)).map((id, index) => <SourceItem key={id} id={id} index={index} />)}{unique.length > 8 && <button className="text-button memory-show-more" onClick={() => setAll(!all)}>{all ? t("Weniger Quellen anzeigen") : t("Alle {0} Quellen anzeigen", unique.length)}</button>}</div>;
}

export function ProposalCard({ proposal, document, busy, onDecide, onOpenDocument }: { proposal: CoreProposal; document?: MemoryDocument; busy: boolean; onDecide: (decision: 'approve' | 'reject') => void; onOpenDocument?: (id: string) => void }) {
  const current = proposalIsCurrent(proposal, document);
  const stale = proposal.status === 'stale' || (proposal.status === 'pending' && !current);
  const before = document?.version === proposal.baseVersion ? document.content : document?.history.find(item => item.version === proposal.baseVersion)?.content;
  const label = stale ? t("Überholt") : ({ pending: t("Deine Entscheidung"), approved: t("Freigegeben"), rejected: t("Abgelehnt"), stale: t("Überholt") }[proposal.status]);
  return <article className="memory-proposal">
    <div className="memory-proposal-heading"><div><span className="memory-kicker">{t("ÄNDERUNGSVORSCHLAG")}</span><h2>{memoryDocumentTitle(document ?? { id: proposal.documentId, title: proposal.documentId })}</h2></div><span className={`memory-badge ${current ? 'pending' : ''}`}>{label}</span></div>
    {document && onOpenDocument && <button className="text-button" onClick={() => onOpenDocument(document.id)}>{t("Notiz öffnen")}</button>}
    <p className="memory-proposal-reason">{proposal.reason}</p>
    <div className="memory-compare"><div><h3>{t("Bisher · Version ")}{proposal.baseVersion}</h3><pre>{before ?? t("Die Ausgangsversion ist nicht mehr verfügbar.")}</pre></div><div><h3>{t("Vorgeschlagene Fassung")}</h3><pre>{proposal.content}</pre></div></div>
    <details className="memory-disclosure"><summary><FileText size={13} />{t(" Quellen des Vorschlags ")}<span>{proposal.sourceIds.length}</span><ChevronDown size={13} /></summary><SourceList ids={proposal.sourceIds} /></details>
    {stale && <p className="memory-inline-warning"><Info size={14} />{t(" Der Eintrag hat sich seit diesem Vorschlag geändert. Eine Freigabe dieser alten Fassung ist gesperrt.")}</p>}
    {proposal.status === 'pending' && <div className="memory-proposal-actions"><button className="primary-button" disabled={busy || !current} onClick={() => onDecide('approve')}><Check size={14} />{t(" Genau diese Fassung freigeben")}</button><button className="secondary-button" disabled={busy} onClick={() => onDecide('reject')}><X size={14} />{t(" Ablehnen")}</button></div>}
    <p className="memory-subtle">{t("Vorgeschlagen am ")}{date(proposal.createdAt)}{proposal.decidedAt ? t(" · entschieden am {0}", date(proposal.decidedAt)) : ''}</p>
  </article>;
}

export function MemoryView({ state, active = true, navigationRequest }: { state?: Snapshot; active?: boolean; navigationRequest?: { requestId: number } }) {
  const [snapshot, setSnapshot] = useState<MemorySnapshot>();
  const [section, setSection] = useState<Section>('memories');
  const [period, setPeriod] = useState<Period>('day');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [searchResults, setSearchResults] = useState<MemorySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [dayInput, setDayInput] = useState('');
  const [dayNotice, setDayNotice] = useState('');
  const [dayLookupId, setDayLookupId] = useState('');
  useEffect(() => { if (navigationRequest) { setSection('identity'); setSelectedId('soul'); setQuery(''); setDayLookupId(''); } }, [navigationRequest?.requestId]);
  const request = useRef(0);
  const mounted = useRef(true);
  const stopPending = state?.task.status === 'stopping' || state?.summary?.status === 'stopping';
  const stopPendingRef = useRef(stopPending); stopPendingRef.current = stopPending;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current++; }; }, []);
  const refresh = useCallback(async () => {
    if (stopPendingRef.current) return;
    const revision = ++request.current;
    try { const value = await window.openhiatus.memorySnapshot(); if (mounted.current && revision === request.current) setSnapshot(value); }
    catch (error) { if (mounted.current && revision === request.current && !stopPendingRef.current) setError(message(error)); }
  }, []);
  useEffect(() => { if (active && !stopPending) void refresh(); }, [active, stopPending, refresh]);
  // Incoming state may change while an editor is open. Never replace its separate draft.
  const refreshKey = `${state?.task.id}:${state?.task.status}:${state?.messages.at(-1)?.id}:${state?.activity.at(-1)?.id}:${state?.summary?.status}:${state?.summary?.completed}`;
  useEffect(() => { if (!active || stopPending) return; const timer = setTimeout(() => { void refresh(); }, 650); return () => clearTimeout(timer); }, [refreshKey, refresh, active, stopPending]);
  useEffect(() => {
    if (!active || !query.trim()) { setSearchResults([]); setSearching(false); setSearchError(''); return; }
    let disposed = false; setSearchResults([]); setSearching(true); setSearchError('');
    const timer = setTimeout(() => { void window.openhiatus.searchMemory(query).then(results => { if (!disposed) setSearchResults(results); }).catch(error => { if (!disposed) setSearchError(message(error)); }).finally(() => { if (!disposed) setSearching(false); }); }, 250);
    return () => { disposed = true; clearTimeout(timer); };
  }, [query, active, snapshot?.sourceCount]);
  async function mutate(name: string, action: () => Promise<MemorySnapshot>, success: string) {
    if (busy) return false;
    setBusy(name); setError(''); setNotice(''); request.current++;
    try {
      const value = await action();
      if (mounted.current) { request.current++; setSnapshot(value); setNotice(success); }
      return true;
    } catch (error) { if (mounted.current) { setError(message(error)); await refresh(); } return false; }
    finally { if (mounted.current) setBusy(''); }
  }
  const documents = snapshot?.documents ?? [];
  const identityDraftDirty = !!drafts.identity && drafts.identity.content !== drafts.identity.original;
  const advancedVisible = showAdvanced || identityDraftDirty;
  const protectedDocuments = memoryLongTermDocuments(documents, showAdvanced, drafts.identity);
  const inSection = section === 'identity' ? protectedDocuments : documents.filter(item => item.kind === period).sort((a, b) => b.id.localeCompare(a.id));
  const filtered = inSection.filter(item => (!dayLookupId || section !== 'memories' || period !== 'day' || item.id === dayLookupId)
    && `${memoryDocumentTitle(item)}\n${item.content}`.toLocaleLowerCase(uiLocale()).includes(query.trim().toLocaleLowerCase(uiLocale())));
  const selected = filtered.find(item => item.id === selectedId) ?? filtered[0];
  const draft = selected ? drafts[selected.id] : undefined;
  const isProtected = !!selected && (isIdentityFile(selected.id) || selected.kind === 'identity');
  const staleDraft = !!(draft && selected && draft.version !== selected.version);
  const pending = snapshot?.proposals.filter(item => item.status === 'pending').length ?? 0;
  const hasDrafts = Object.values(drafts).some(item => item.content !== item.original);
  const lastRetrieval = snapshot?.lastRetrieval;
  const taskBusy = state?.task.status === 'running' || state?.task.status === 'stopping';
  const summaryBusy = state?.summary?.status === 'running' || state?.summary?.status === 'stopping';
  const model = state?.models.find(item => item.id === state.preferences.memoryModel)?.label ?? state?.preferences.memoryModel;
  async function startSummary() {
    if (busy || summaryBusy) return;
    setBusy('summary-start'); setError(''); setNotice('');
    try { await window.openhiatus.startMemorySummary(); await refresh(); }
    catch (error) { setError(message(error)); }
    finally { setBusy(''); }
  }
  async function changeAutomatic(enabled: boolean) {
    if (busy) return;
    setBusy('summary-auto'); setError('');
    try { await window.openhiatus.savePreferences({ memoryAutoSummarize: enabled }); }
    catch (error) { setError(message(error)); }
    finally { setBusy(''); }
  }
  function discardDraft(id: string) { setDrafts(current => { const next = { ...current }; delete next[id]; return next; }); }
  function switchSection(next: Section) { setSection(next); setQuery(''); setDayLookupId(''); setDayNotice(''); }
  function showDocument(id: string) {
    const entry = documents.find(item => item.id === id);
    if (!entry) return;
    if (entry.kind === 'identity') setShowAdvanced(true);
    setSection(entry.kind === 'identity' || isIdentityFile(entry.id) ? 'identity' : 'memories');
    if (entry.kind === 'day' || entry.kind === 'week' || entry.kind === 'month') setPeriod(entry.kind);
    setQuery(''); setSelectedId(id); setDayLookupId(''); setDayNotice('');
  }
  function showDay() {
    const id = memoryDayIdentifier(dayInput);
    if (!id) { setDayNotice(t("Bitte ein gültiges Datum eingeben, zum Beispiel 05.10.2026 oder 2026-10-05.")); return; }
    setSection('memories'); setPeriod('day'); setQuery(''); setDayLookupId(id);
    if (!documents.some(item => item.id === id)) { setDayNotice(t("Für den {0}.{1}.{2} ist kein Tagesbericht gespeichert.", id.slice(12, 14), id.slice(9, 11), id.slice(4, 8))); return; }
    setSelectedId(id); setDayNotice('');
  }

  return <main className="memory-scroll"><div className="memory-content">
    <div className="memory-page-heading"><div><div className="eyebrow">{t("WAS BLEIBT. UND WARUM.")}</div><h1>{t("Gedächtnis.")}</h1><p>{t("Erinnerungen, Fakten und persönliche Arbeitsvorlieben.")}<br />{t("Du kannst nachlesen, was openHiatus weiß und worauf es beruht.")}</p></div><div className="memory-heading-icon"><BookOpen size={30} strokeWidth={1.2} /></div></div>
    <section className="memory-identity-overview" aria-label={t("Agenten- und Benutzeridentität")}>{IDENTITY_FILES.map(file => <button key={file.id} disabled={!documents.some(document => document.id === file.id)} onClick={() => showDocument(file.id)}><strong>{file.filename}</strong><span>{t(file.description)}</span></button>)}</section>
    {!!snapshot?.fileSyncWarnings?.length && <div className="memory-inline-warning" role="alert">{snapshot.fileSyncWarnings.map(warning => <p key={warning}>{warning}</p>)}</div>}
    <div className="memory-overview"><div><span className="memory-status-point" /><span>{snapshot ? t("{0} gespeicherte Originalnachrichten", snapshot.sourceCount) : t("Lokales Gedächtnis wird geladen")}<small>{t("Originalquellen und frühere Berichtsversionen bleiben erhalten.")}</small></span></div><button className="secondary-button" disabled={!!busy || !snapshot || taskBusy || summaryBusy || !state?.preferences.fullAccessAcknowledged || state?.connections.agent !== 'ready'} onClick={() => void startSummary()} title={taskBusy ? t("Verfügbar, sobald der Auftrag beendet ist") : t("Tages-, Wochen- und Monatsberichte mit deinem Gedächtnismodell erstellen; auch laufende Zeiträume einbeziehen")}>{busy === 'summary-start' || summaryBusy ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />}{t(" Berichte aktualisieren")}</button></div>
    <div className="memory-summary-settings"><label><input type="checkbox" checked={state?.preferences.memoryAutoSummarize ?? false} disabled={!!busy || !state} onChange={event => void changeAutomatic(event.target.checked)} /><span>{t("Abgeschlossene Zeiträume automatisch aufbereiten")}<small>{t("Wenn openHiatus gerade keinen Auftrag bearbeitet. Laufende Zeiträume kannst du oben manuell aktualisieren.")}</small></span></label><p>{t("Berichte nutzen dein ausgewähltes Gedächtnismodell")}{model ? ` (${model})` : ''}. {state?.preferences.memoryModel.startsWith('chatgpt/') ? <>{t("Sie zählen zu deinem ChatGPT-Kontingent.")}{!state.preferences.chatgptBackgroundUsage && <><br />{t("Automatische Berichte mit ChatGPT sind ausgeschaltet. Du kannst sie unter Verbindungen erlauben.")}</>}</> : t("Die Modellaufrufe werden über den zugehörigen Anbieter abgerechnet.")}</p></div>
    <MemorySummaryProgress job={state?.summary} />
    {(error || notice) && <div className={`memory-feedback ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}><span>{error || notice}</span><button className="icon-button" aria-label={t("Gedächtnis-Hinweis schließen")} onClick={() => { setError(''); setNotice(''); }}><X size={14} /></button></div>}
    {snapshot?.recovered && <p className="memory-inline-warning"><Info size={14} />{t(" Das Gedächtnis wurde aus der letzten lesbaren Sicherung geladen.")}</p>}
    <div className="memory-tabs" role="group" aria-label={t("Gedächtnis-Bereiche")}>
      <button className={section === 'memories' ? 'selected' : ''} aria-pressed={section === 'memories'} onClick={() => switchSection('memories')}><CalendarDays size={15} />{t(" Erinnerungen")}</button>
      <button className={section === 'identity' ? 'selected' : ''} aria-pressed={section === 'identity'} onClick={() => switchSection('identity')}><ShieldCheck size={15} />{t(" Agent & Nutzer")}</button>
      <button className={section === 'proposals' ? 'selected' : ''} aria-pressed={section === 'proposals'} onClick={() => switchSection('proposals')}><Sparkles size={15} />{t(" Vorschläge ")}{pending > 0 && <span>{pending}</span>}</button>
      <button className={section === 'instructions' ? 'selected' : ''} aria-pressed={section === 'instructions'} onClick={() => switchSection('instructions')}><SlidersHorizontal size={15} />{t(" Technische Vorgaben")}</button>
    </div>
    {!snapshot ? <div className="memory-empty"><LoaderCircle size={22} className={error ? '' : 'spin'} /><h2>{error ? t("Gedächtnis noch nicht verfügbar") : t("Gedächtnis wird geladen …")}</h2>{error && <button className="secondary-button" onClick={() => { setError(''); void refresh(); }}>{t("Erneut laden")}</button>}</div> : <>
      <section hidden={section !== 'identity'} className="memory-profile-library">
        <div className="memory-profile-files"><p>{t("Direkt bearbeitbare Markdown-Dateien · höchstens 8000 Zeichen je Datei. Neue Nachrichten und Aufträge übernehmen den aktuellen Stand.")}</p><button className="secondary-button" disabled={!!busy || stopPending} onClick={() => void refresh()}>{t("Dateien neu einlesen")}</button></div>
        {snapshot.markdownDirectory && <code className="memory-profile-path">{snapshot.markdownDirectory}</code>}
        <details className="memory-disclosure"><summary>{t("Stilvorlagen verwalten ")}<ChevronDown size={14} /></summary>
          <AssistantProfileCard libraryMode profile={state?.preferences.assistantProfile} ready={!!state} onSave={async profile => { await window.openhiatus.savePreferences({ assistantProfile: profile }); }} onError={error => setError(message(error))} />
          <button className="secondary-button" disabled={!state || !documents.some(document => document.id === 'soul') || !!drafts.soul && drafts.soul.content !== drafts.soul.original} onClick={() => {
            const soul = documents.find(document => document.id === 'soul'); if (!soul) return;
            setDrafts(current => ({ ...current, soul: { content: soulFromStyle(resolvePersonality(state?.preferences.assistantProfile).instructions), original: soul.content, version: soul.version } }));
            showDocument('soul'); setNotice(t("Die Vorlage ist als Entwurf in SOUL.md übernommen. Prüfe und speichere die Datei, um sie zu verwenden."));
          }}>{t("Ausgewählte Vorlage in SOUL.md übernehmen")}</button>
        </details>
      </section>
      {(section === 'memories' || section === 'identity') && <>
        <div className="memory-section-intro">{section === 'identity' ? <><p><LockKeyhole size={14} />{t(" SOUL.md und IDENTITY.md bestimmen deinen Assistenten. USER.md beschreibt dich. MEMORY.md bewahrt wichtige Fakten, Entscheidungen und Erkenntnisse. Eigene Änderungsvorschläge des Agenten bleiben freigabepflichtig.")}</p>{documents.some(item => item.kind === 'identity') && <div className="memory-advanced-note"><label><input type="checkbox" checked={advancedVisible} disabled={identityDraftDirty} aria-describedby="memory-advanced-help" onChange={event => { setShowAdvanced(event.target.checked); if (!event.target.checked && selectedId === 'identity') setSelectedId('core'); }} /><span>{t("Frühere Hintergrundnotiz anzeigen")}</span></label><p id="memory-advanced-help">{identityDraftDirty ? t("Speichere oder verwerfe zuerst den Entwurf der Hintergrundnotiz, bevor du sie ausblendest.") : t("Historische Notiz mit erhaltenen Versionen. Aktive Vorgaben liegen in den vier Markdown-Dateien; Änderungen hier passen sie nicht automatisch an.")}</p></div>}</> : <p><Layers size={14} />{t(" Tagesberichte halten konkrete Ergebnisse fest. Wochen bündeln Entwicklungen, Monate die längerfristigen Zusammenhänge.")}</p>}</div>
        {section === 'memories' && <form className="memory-date-lookup" onSubmit={event => { event.preventDefault(); showDay(); }}><label htmlFor="memory-day"><CalendarDays size={14} />{t(" Bestimmten Tag nachlesen")}</label><div><input id="memory-day" aria-label={t("Datum des Tagesberichts")} placeholder={t("TT.MM.JJJJ oder JJJJ-MM-TT")} value={dayInput} onChange={event => { setDayInput(event.target.value); setDayNotice(''); }} /><button className="secondary-button" type="submit" disabled={!dayInput.trim()}>{t("Tag nachlesen")}</button>{dayLookupId && <button className="text-button" type="button" onClick={() => { setDayLookupId(''); setDayNotice(''); }}>{t("Alle Tage")}</button>}</div>{dayNotice && <p role="status">{dayNotice}</p>}</form>}
        <div className="memory-tools">{section === 'memories' ? <div className="memory-periods" role="group" aria-label={t("Zeitraum")}>{(['day', 'week', 'month'] as const).map(value => <button key={value} className={period === value ? 'selected' : ''} aria-pressed={period === value} onClick={() => { setPeriod(value); setDayLookupId(''); setDayNotice(''); }}>{({ day: t("Tage"), week: t("Wochen"), month: t("Monate") })[value]}<span>{documents.filter(item => item.kind === value).length}</span></button>)}</div> : <span className="memory-protected-count"><ShieldCheck size={14} /> {protectedDocuments.length}{t(" geschützte Einträge")}</span>}<label className="memory-search"><Search size={14} /><input aria-label={t("Gedächtnis durchsuchen")} placeholder={t("Einträge durchsuchen …")} value={query} onChange={event => { setQuery(event.target.value); setDayLookupId(''); setDayNotice(''); }} />{query && <button aria-label={t("Suche leeren")} onClick={() => setQuery('')}><X size={13} /></button>}</label></div>
        {query.trim() && <section className="memory-archive-search"><div className="memory-archive-heading"><Search size={14} /><strong>{t("Suche im gesamten Archiv")}</strong>{searching && <LoaderCircle size={13} className="spin" />}</div>{searchError ? <p className="memory-inline-warning" role="alert">{searchError}</p> : !searching && !searchResults.length ? <p className="memory-subtle">{t("Keine Treffer in Einträgen oder Originalnachrichten.")}</p> : <>{searchResults.filter(item => item.type === 'document').map(item => <button className="memory-search-result" key={item.id} onClick={() => showDocument(item.id)}><FileText size={13} /><span><strong>{memoryDocumentTitle(item)}</strong><small>{item.excerpt}</small></span></button>)}{searchResults.filter(item => item.type === 'source').map((item, index) => <div className="memory-source-match" key={item.id}><p>{item.excerpt}</p><SourceItem id={item.id} index={index} /></div>)}</>}</section>}
        {filtered.length ? <div className="memory-browser"><aside className="memory-index" aria-label={t("Gedächtniseinträge")}>{filtered.map(item => <button className={`memory-index-item ${selected?.id === item.id ? 'selected' : ''}`} key={item.id} onClick={() => setSelectedId(item.id)}><span className="memory-index-icon">{item.kind === 'identity' || item.kind === 'core' ? <ShieldCheck size={16} /> : <FileText size={16} />}</span><span><strong>{memoryDocumentTitle(item)}</strong><small>{kindLabels[item.kind]} · v{item.version}{drafts[item.id] && drafts[item.id].content !== drafts[item.id].original ? t(" · Entwurf") : item.edited ? ' · korrigiert' : ''}</small><span className="memory-index-preview">{item.content.replace(/[#*`]/g, '').trim().slice(0, 105)}</span></span></button>)}</aside>
          {selected && <article className="memory-document" key={selected.id}><div className="memory-document-head"><div><span className="memory-kicker">{kindLabels[selected.kind]}</span><h2>{memoryDocumentTitle(selected)}</h2><p>{t("Version ")}{selected.version} · {date(selected.updatedAt)}</p></div>{!draft && <button className="secondary-button" disabled={!!busy} onClick={() => setDrafts(current => ({ ...current, [selected.id]: { content: selected.content, original: selected.content, version: selected.version } }))}><Pencil size={13} /> {isProtected ? t("Bearbeiten") : t("Korrigieren")}</button>}</div>
            {isProtected && <div className="memory-protection"><LockKeyhole size={13} /><span>{t("Vor autonomen Änderungen geschützt · für dich bearbeitbar")}</span></div>}
            {!isProtected && <ReportProvenance summary={selected.summary} edited={selected.edited} />}
            {draft ? <div className="memory-editor"><label className="field-label" htmlFor="memory-document-editor">{isProtected ? t("Deine Fassung") : t("Korrigierter Inhalt")}{t(" · Ausgangsversion ")}{draft.version}</label><textarea maxLength={isProtected ? 8000 : 20000} id="memory-document-editor" value={draft.content} spellCheck={false} onChange={event => setDrafts(current => ({ ...current, [selected.id]: { ...draft, content: event.target.value } }))} /><p className="memory-subtle">{isProtected ? t("Deine Änderung wird als neue Version gespeichert. Die bisherige Fassung bleibt im Verlauf.") : t("Manuelle Korrekturen bleiben bei späteren Zusammenfassungen erhalten. Die Originalnachrichten werden dadurch nicht verändert.")}</p>{staleDraft && <p className="memory-inline-warning"><Info size={14} />{t(" Inzwischen gibt es eine neuere Version. Dein Entwurf wurde erhalten; er kann die neue Fassung nicht überschreiben.")}</p>}<div className="button-row"><button className="primary-button" disabled={!!busy || staleDraft || draft.content === draft.original} onClick={async () => { const id = selected.id; if (await mutate(`edit:${id}`, () => window.openhiatus.editMemory(id, draft.content, draft.version), selected.id === 'identity' && hasIdentityFiles(documents) ? t("Historische Notiz gespeichert. Die vier aktiven Dateien bleiben unverändert.") : t("Deine Änderung ist gespeichert. Sie wird beim nächsten Auftrag berücksichtigt."))) discardDraft(id); }}>{busy === `edit:${selected.id}` ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}{t(" Änderung speichern")}</button><button className="secondary-button" disabled={!!busy} onClick={() => discardDraft(selected.id)}>{staleDraft ? t("Entwurf verwerfen & neu laden") : t("Abbrechen")}</button></div></div> : <pre className="memory-document-text">{selected.content || t("Dieser Eintrag ist noch leer.")}</pre>}
            {!!selected.summary?.inputDocuments.length && <RelatedReports inputs={selected.summary.inputDocuments} documents={documents} onOpen={showDocument} />}
            <details className="memory-disclosure"><summary><FileText size={14} />{t(" Originalquellen ")}<span>{selected.sourceIds.length}</span><ChevronDown size={14} /></summary><SourceList key={`${selected.id}:${selected.version}`} ids={selected.sourceIds} /></details>
            <details className="memory-disclosure"><summary><History size={14} />{t(" Versionsverlauf ")}<span>{selected.history.length}</span><ChevronDown size={14} /></summary><div className="memory-revisions">{[...selected.history].reverse().map(revision => <details key={revision.version}><summary>{t("Version ")}{revision.version} · {revisionLabels[revision.reason]}<span>{date(revision.updatedAt)}</span><ChevronDown size={13} /></summary><pre>{revision.content || t("Leerer Inhalt")}</pre>{revision.summary && <><ReportProvenance summary={revision.summary} edited={revision.reason === 'user-edit'} /><RelatedReports inputs={revision.summary.inputDocuments} documents={documents} onOpen={showDocument} /></>}<SourceList ids={revision.sourceIds} /></details>)}{!selected.history.length && <p className="memory-subtle">{t("Noch keine ältere Fassung vorhanden.")}</p>}</div></details>
          </article>}
        </div> : <div className="memory-empty"><BookOpen size={27} strokeWidth={1.2} /><h2>{dayLookupId ? t("Für diesen Tag liegt kein Bericht vor.") : query ? t("Kein passender Eintrag") : t("Hier wächst dein Gedächtnis.")}</h2><p>{dayLookupId ? t("Wähle einen anderen Tag oder öffne mit „Alle Tage“ wieder die Übersicht.") : query ? t("Versuche einen anderen Begriff oder wähle einen anderen Zeitraum.") : t("Gespeicherte Gespräche bilden die Grundlage. Nach dem ersten Austausch erscheinen hier die Einträge.")}</p></div>}
      </>}
      {section === 'proposals' && <div className="memory-proposals"><p className="memory-section-description">{t("Hier zeigt openHiatus konkrete Änderungen an deinen Langzeitnotizen. Erst deine Freigabe übernimmt genau die angezeigte Fassung.")}</p>{snapshot.proposals.length ? [...snapshot.proposals].reverse().map(proposal => <ProposalCard key={proposal.id} proposal={proposal} document={documents.find(item => item.id === proposal.documentId)} busy={!!busy} onOpenDocument={showDocument} onDecide={decision => void mutate(`proposal:${proposal.id}`, () => window.openhiatus.decideMemoryProposal(proposal.id, decision), decision === 'approve' ? t("Vorschlag freigegeben und als neue Version gespeichert.") : t("Vorschlag abgelehnt. Der geschützte Eintrag bleibt unverändert."))} />) : <div className="memory-empty"><ShieldCheck size={27} strokeWidth={1.2} /><h2>{t("Keine offenen Änderungen.")}</h2><p>{t("Deine Langzeitnotizen bleiben so, wie du sie festgelegt hast.")}<br />{t("Neue Vorschläge von openHiatus erscheinen hier zur Prüfung.")}</p></div>}</div>}
      {section === 'instructions' && <div className="memory-runtime"><p className="memory-section-description">{t("Diese technischen Vorgaben kommen aus der laufenden App und sind hier nur lesbar. Sie regeln Werkzeuge, Auftragskoordination und Berichterstellung. Deinen Antwortstil stellst du in SOUL.md unter Agent & Nutzer ein.")}</p>{snapshot.runtimeInstructions?.map(instruction => <article className="memory-runtime-card" key={instruction.id}><div className="memory-document-head"><div><span className="memory-kicker">{t("IN DER APP FESTGELEGT")}</span><h2>{t(instruction.title)}</h2></div><span className="memory-badge"><LockKeyhole size={11} />{t(" Nur lesbar")}</span></div><p className="memory-runtime-effect">{instruction.appliesTo === 'agent' ? t("Vorgaben für die Ausführung von Aufträgen.") : instruction.appliesTo === 'dialog' ? t("Vorgaben für das Gespräch und die Auftragskoordination.") : t("Vorgaben für die Erstellung der Gedächtnisberichte.")}</p><pre className="memory-document-text">{instruction.content}</pre></article>)}{!snapshot.runtimeInstructions?.length && <div className="memory-empty"><Info size={22} /><h2>{t("Keine technischen Vorgaben übermittelt.")}</h2><p>{t("Die App hat dafür noch keine lesbare Fassung bereitgestellt.")}</p></div>}</div>}
      <details className="memory-retrieval memory-disclosure"><summary><BookOpen size={15} />{t(" Zuletzt an den Agenten übergeben ")}{lastRetrieval && <span>{date(lastRetrieval.at)}</span>}<ChevronDown size={14} /></summary>{lastRetrieval ? <div className="memory-retrieval-body"><span className="memory-kicker">{t("AUSLÖSENDER AUFTRAG")}</span><p className="memory-retrieval-query">{lastRetrieval.query}</p><div className="memory-reference-chips">{lastRetrieval.documentIds.map(id => <button key={id} onClick={() => showDocument(id)}><FileText size={11} />{memoryDocumentTitle(documents.find(item => item.id === id) ?? { id, title: id })}</button>)}</div><p className="memory-subtle">{t("Der folgende Text ist der tatsächlich übergebene Gedächtniskontext. Die Einträge können inzwischen neuer sein.")}</p><pre className="memory-context-text">{lastRetrieval.text || t("Kein Gedächtniskontext übergeben.")}</pre><details className="memory-disclosure"><summary><FileText size={13} />{t(" Zugehörige Originalquellen ")}<span>{lastRetrieval.sourceIds.length}</span><ChevronDown size={13} /></summary><SourceList ids={lastRetrieval.sourceIds} /></details></div> : <p className="memory-subtle memory-retrieval-body">{t("Noch kein Gedächtnisabruf. Beim nächsten Auftrag wird der verwendete Kontext hier sichtbar.")}</p>}</details>
      <div className="memory-footer"><div><ShieldCheck size={14} /><p>{t("Lokal in deinem openHiatus-Profil gespeichert. Relevante Einträge werden für die Bearbeitung an deine ausgewählten Modellanbieter übergeben.")}<br />{hasDrafts && <strong>{t("Du hast ungespeicherte Änderungen. Speichere sie vor dem Schließen der App.")}</strong>}</p></div><details><summary>{t("Speicherort & Format ")}<ChevronDown size={12} /></summary><p>{t("Die Einträge sind strukturierte Daten in einer gemeinsamen Datei.")}</p><code>{snapshot.storagePath}</code></details></div>
    </>}
  </div></main>;
}
