import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCheck, ChevronDown, CircleAlert, ClipboardList, Clock3, LoaderCircle, Square } from 'lucide-react';
import type { BackgroundJobView } from '../../../shared/contracts';
import { MessageBody } from '../conversation';
import { formatTaskNumber, formatTaskTime, taskFilters, taskIsActive, taskMatches, taskStatusDescription, taskStatusLabel, tasksForFilter, taskUsageLabel, type TaskFilter } from './presentation';
import { TaskStopActions } from './stop-actions';
import { TaskModelMetrics } from './model-metrics';

export interface TasksViewProps {
  jobs: readonly BackgroundJobView[];
  onStop(id: string): Promise<void>;
  onError(error: unknown): void;
  onConversation?(): void;
}
function StopButton({ job, busy, onStop }: { job: BackgroundJobView; busy: boolean; onStop(job: BackgroundJobView): void }) {
  if (!taskIsActive(job)) return null;
  const stopping = busy || job.status === 'stopping';
  return <button type="button" className="tasks-stop" disabled={stopping} aria-label={`Auftrag stoppen: ${job.title}`} onClick={() => onStop(job)}>
    {stopping ? <LoaderCircle size={14} className="spin" aria-hidden="true" /> : <Square size={12} aria-hidden="true" />}
    {stopping ? 'Wird gestoppt' : 'Stopp'}
  </button>;
}
function Status({ job }: { job: BackgroundJobView }) {
  return <span className={`tasks-status ${job.status} ${job.runtimeRetained ? 'retained' : ''}`}><i aria-hidden="true" />{taskStatusLabel(job)}</span>;
}
function TaskDetails({ job, busy, onStop, onError }: { job: BackgroundJobView; busy: boolean; onStop(job: BackgroundJobView): void; onError(error: unknown): void }) {
  const resultHeading = job.status === 'failed' || job.status === 'interrupted' ? 'Vorhandenes Teilergebnis' : 'Ergebnis';
  const pendingResult = taskIsActive(job) && job.status !== 'completed';
  return <article className="tasks-detail" aria-label={`Aufgabe: ${job.title}`} data-task-detail-id={job.id}>
    <div className="tasks-detail-heading"><div><Status job={job} /><h2>{job.title}</h2></div><StopButton job={job} busy={busy} onStop={onStop} /></div>
    <p className="tasks-state-description" role="status">{busy ? 'Stopp wird angefordert. Die Bestätigung steht noch aus.' : taskStatusDescription(job)}</p>
    <section className="tasks-section tasks-result"><h3>{resultHeading}</h3>
      {job.result ? <MessageBody text={job.result} onError={onError} /> : <p className="tasks-muted">{pendingResult ? 'Sobald ein Ergebnis vorliegt, erscheint es hier.' : 'Für diesen Auftrag wurde kein Ergebnistext gespeichert.'}</p>}
    </section>
    {job.error && <section className="tasks-section tasks-error"><h3><CircleAlert size={16} aria-hidden="true" />Fehlermeldung</h3><p>{job.error}</p></section>}
    <section className="tasks-section"><h3>Auftragsdetails</h3><dl className="tasks-metadata">
      <div><dt>Erstellt</dt><dd><time dateTime={job.createdAt}>{formatTaskTime(job.createdAt)}</time></dd></div>
      <div><dt>Aktualisiert</dt><dd><time dateTime={job.updatedAt}>{formatTaskTime(job.updatedAt)}</time></dd></div>
      <div className="tasks-meta-wide"><dt>Modell</dt><dd>{job.model || 'Kein Modell gemeldet'}</dd></div>
      <div className="tasks-meta-wide"><dt>Ressourcen</dt><dd>{job.resources.length ? <ul className="tasks-resources">{job.resources.map(resource => <li key={resource}>{resource}</li>)}</ul> : 'Keine Ressourcen gemeldet'}</dd></div>
    </dl></section>
    <section className="tasks-section tasks-usage"><h3>Verbrauch</h3><p>{taskUsageLabel(job)}</p>
      {job.usage && <dl className="tasks-token-counts">
        <div><dt>Eingabe</dt><dd>{formatTaskNumber(job.usage.inputTokens)}</dd></div><div><dt>Ausgabe</dt><dd>{formatTaskNumber(job.usage.outputTokens)}</dd></div>
        <div><dt>Cache gelesen</dt><dd>{formatTaskNumber(job.usage.cacheReadTokens)}</dd></div><div><dt>Cache geschrieben</dt><dd>{formatTaskNumber(job.usage.cacheWriteTokens)}</dd></div>
      </dl>}
    </section>
    <TaskModelMetrics job={job} />
    <details className="tasks-stored-context"><summary>Gespeicherter Auftragskontext<ChevronDown size={16} aria-hidden="true" /></summary><p className="tasks-prompt">{job.prompt}</p></details>
  </article>;
}

export function TasksView({ jobs, onStop, onError, onConversation }: TasksViewProps) {
  const headingId = useId(), listId = useId();
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [selectedId, setSelectedId] = useState<string | undefined>(() => tasksForFilter(jobs, 'all')[0]?.id);
  const [stopping, setStopping] = useState<ReadonlySet<string>>(() => new Set());
  const actions = useRef<TaskStopActions | null>(null);
  if (!actions.current) actions.current = new TaskStopActions(setStopping);
  const visible = useMemo(() => tasksForFilter(jobs, filter), [jobs, filter]);
  const selected = jobs.find(job => job.id === selectedId);
  useEffect(() => {
    // Only a removed/unavailable ID needs a fallback; new snapshot object
    // identities and newly arriving jobs never reset a valid user selection.
    if (!jobs.some(job => job.id === selectedId)) setSelectedId(visible[0]?.id);
  }, [jobs, selectedId, visible]);
  function changeFilter(next: TaskFilter) {
    setFilter(next);
    if (!selected || !taskMatches(selected, next)) setSelectedId(tasksForFilter(jobs, next)[0]?.id);
  }
  function stop(job: BackgroundJobView) {
    if (!taskIsActive(job) || job.status === 'stopping') return;
    void actions.current!.stop(job.id, onStop, onError);
  }
  const activeCount = jobs.filter(taskIsActive).length;
  return <div className="tasks-scroll"><section className="tasks-content" aria-labelledby={headingId}>
    <header className="tasks-heading"><div><span className="tasks-eyebrow">ARBEITSÜBERSICHT</span><h1 id={headingId}>Aufgaben</h1><p>{jobs.length ? `${formatTaskNumber(jobs.length)} gespeicherte ${jobs.length === 1 ? 'Aufgabe' : 'Aufgaben'} · ${formatTaskNumber(activeCount)} aktiv` : 'Deine Aufträge und Ergebnisse an einem Ort.'}</p></div>
      {onConversation && <button type="button" className="tasks-conversation" onClick={onConversation}><ArrowLeft size={15} aria-hidden="true" />Zum Gespräch</button>}
    </header>
    {!jobs.length ? <div className="tasks-empty"><ClipboardList size={30} aria-hidden="true" /><h2>Noch keine Aufgaben</h2><p>Wenn du openHiatus einen Auftrag gibst, findest du hier den Status, das Ergebnis und den Verbrauch.</p></div>
      : <><div className="tasks-filters" role="group" aria-label="Aufgaben nach Status filtern">{taskFilters.map(item => <button type="button" key={item.id} aria-pressed={filter === item.id} aria-controls={listId} onClick={() => changeFilter(item.id)}>
        {item.label}<span>{formatTaskNumber(jobs.filter(job => taskMatches(job, item.id)).length)}</span>
      </button>)}</div>
      <div className="tasks-workbench"><div className="tasks-master"><div className="tasks-list-heading"><h2>{taskFilters.find(item => item.id === filter)?.label}</h2><span>{formatTaskNumber(visible.length)}</span></div>
        {visible.length ? <ol id={listId} className="tasks-list" aria-label="Gespeicherte Aufgaben">{visible.map(job => <li key={job.id} className={selectedId === job.id ? 'selected' : ''} data-job-id={job.id}>
          <button type="button" className="tasks-select" aria-label={`Aufgabe anzeigen: ${job.title}`} aria-pressed={selectedId === job.id} onClick={() => setSelectedId(job.id)}>
            <strong>{job.title}</strong><Status job={job} /><time dateTime={job.createdAt}>{formatTaskTime(job.createdAt)}</time>
          </button><StopButton job={job} busy={stopping.has(job.id)} onStop={stop} />
        </li>)}</ol> : <p id={listId} className="tasks-filter-empty"><CheckCheck size={22} aria-hidden="true" />Keine Aufgaben in diesem Filter.</p>}
      </div><div className="tasks-detail-column">
        {selected && !taskMatches(selected, filter) && <div className="tasks-selection-note"><Clock3 size={16} aria-hidden="true" /><span>Der Status der ausgewählten Aufgabe hat sich geändert. Sie ist jetzt außerhalb dieses Filters.</span><button type="button" onClick={() => changeFilter('all')}>Alle anzeigen</button></div>}
        {selected ? <TaskDetails job={selected} busy={stopping.has(selected.id)} onStop={stop} onError={onError} /> : <div className="tasks-empty tasks-select-empty"><ClipboardList size={28} aria-hidden="true" /><h2>Aufgabe auswählen</h2><p>Wähle einen Auftrag aus der Liste, um alle Details zu sehen.</p></div>}
      </div></div></>}
  </section></div>;
}
