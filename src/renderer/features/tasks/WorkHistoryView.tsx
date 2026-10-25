import { useState } from 'react';
import { History, ChevronRight } from 'lucide-react';
import { t } from '../../../shared/i18n';
import { workStatus, type WorkItem } from '../../../shared/work-history';
import type { BackgroundJobView } from '../../../shared/contracts';
import { MessageBody } from '../conversation';
import { formatTaskTime } from './presentation';

function statusLabel(status: WorkItem['status']): string {
  return ({ queued: t('Wartet'), running: t('In Bearbeitung'), stopping: t('Wird gestoppt'), completed: t('Bearbeitung beendet'),
    failed: t('Fehlgeschlagen'), interrupted: t('Unterbrochen') })[status];
}
export function WorkHistoryView({ items, jobs, onError, onBackground }: {
  items: readonly WorkItem[]; jobs: readonly BackgroundJobView[]; onError(error: unknown): void; onBackground(): void;
}) {
  const [selectedId, select] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const roots = items.filter(item => !item.parentId || !items.some(parent => parent.id === item.parentId));
  const updatedAt = (item: WorkItem) => [item.updatedAt, ...items.filter(child => child.parentId === item.id).map(child => child.updatedAt)].sort().at(-1)!;
  const visible = roots.filter(item => !onlyOpen || ['queued', 'running', 'stopping', 'failed', 'interrupted'].includes(workStatus(item, items)))
    .sort((a, b) => updatedAt(b).localeCompare(updatedAt(a)) || b.id.localeCompare(a.id));
  const selected = items.find(item => item.id === selectedId && visible.some(root => root.id === item.id || root.id === item.parentId)) ?? visible[0];
  const children = selected ? items.filter(item => item.parentId === selected.id) : [];
  const parent = selected?.parentId ? items.find(item => item.id === selected.parentId) : undefined;
  const hasActiveJob = jobs.some(job => (selected?.id === `job:${job.id}` || children.some(child => child.id === `job:${job.id}`)) && ['running', 'queued', 'stopping'].includes(job.status));
  return <section className="work-history" aria-label={t('Arbeitsverlauf')}>
    <header className="work-history-heading"><div><h1><History size={21} /> {t('Arbeitsverlauf')}</h1><p>{t('Gespräche, direkte Arbeit und Teilaufgaben an einem Ort.')}</p></div>
      <label><input type="checkbox" checked={onlyOpen} onChange={event => setOnlyOpen(event.target.checked)} /> {t('Offen oder unterbrochen')}</label></header>
    {!visible.length ? <p className="tasks-muted">{t('Noch keine passenden Einträge.')}</p> : <div className="work-history-layout">
      <nav className="work-history-list" aria-label={t('Erfasste Aufträge')}>{visible.map(item => <button type="button" key={item.id} data-work-id={item.id}
        aria-current={selected?.id === item.id || selected?.parentId === item.id ? 'true' : undefined} onClick={() => select(item.id)}>
        <strong>{item.title}</strong><span>{statusLabel(workStatus(item, items))}</span><time dateTime={updatedAt(item)}>{formatTaskTime(updatedAt(item))}</time>
      </button>)}</nav>
      {selected && <article className="work-history-detail" data-work-detail={selected.id}>
        {parent && <button type="button" className="text-button" onClick={() => select(parent.id)}>{t('Zum ursprünglichen Auftrag')}</button>}
        <h2>{selected.title}</h2><p className="work-history-state">{statusLabel(workStatus(selected, items))} · {selected.kind === 'conversation' ? t('Gespräch') : selected.kind === 'direct' ? t('Direkte Arbeit') : t('Hintergrundaufgabe')}</p>
        <p className="tasks-muted">{t('Erfasst am {0}', formatTaskTime(selected.createdAt))}</p>
        {hasActiveJob && <button type="button" className="secondary-button" onClick={onBackground}>{t('Laufende Teilaufgaben verwalten')}</button>}
        {!!children.length && <section><h3>{t('Teilaufgaben')}</h3>{children.map(child => <button type="button" className="work-history-child" key={child.id} onClick={() => select(child.id)}>
          <span><strong>{child.title}</strong><small>{statusLabel(child.status)}</small></span><ChevronRight size={16} /></button>)}</section>}
        {selected.error && <p className="tasks-error">{selected.error}</p>}
        <section><h3>{t('Letzter Ergebnisstand')}</h3>{selected.result ? <MessageBody text={selected.result} onError={onError} /> : <p className="tasks-muted">{t('Noch kein Ergebnis gemeldet.')}</p>}
          <p className="tasks-muted">{t('Ergebnistext des Agenten. Ein beendeter Lauf bestätigt nicht automatisch das gewünschte Ergebnis.')}</p></section>
        {!!selected.resources.length && <section><h3>{t('Ressourcen')}</h3><ul>{selected.resources.map(resource => <li key={resource}>{resource}</li>)}</ul></section>}
        <section><h3>{t('Werkzeugaktionen')} <span>({selected.actions.length})</span></h3>
          {!selected.actions.length ? <p className="tasks-muted">{t('Keine Werkzeugaktionen erfasst.')}</p> : <ol className="work-action-list">{selected.actions.map(action => <li key={action.id}>
            <div><strong>{action.tool}</strong><span>{action.status === 'completed' ? t('Werkzeug beendet') : statusLabel(action.status)}</span></div>
            {action.target && <pre>{action.target}</pre>}<time dateTime={action.updatedAt}>{formatTaskTime(action.updatedAt)}</time>
          </li>)}</ol>}</section>
        <details className="tasks-stored-context"><summary>{t('Ursprünglicher Auftrag')}</summary><p className="tasks-prompt">{selected.prompt}</p></details>
      </article>}
    </div>}
  </section>;
}
