import { useState } from 'react';
import { ChevronDown, LoaderCircle, Square } from 'lucide-react';
import type { BackgroundJob } from '../shared/contracts';

const labels = { queued: 'Wartet', running: 'Arbeitet', stopping: 'Wird gestoppt', completed: 'Fertig', interrupted: 'Gestoppt', failed: 'Fehlgeschlagen' };
function statusLabel(job: BackgroundJob): string {
  if (job.runtimeRetained && job.status === 'completed') return 'Ergebnis liegt vor · Sitzung noch offen';
  return labels[job.status];
}
const needsAttention = (job: BackgroundJob) => job.status === 'failed';
function usageLabel(job: BackgroundJob): string | undefined {
  const usage = job.usage;
  if (!usage) return;
  const tokens = usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  if (job.model.startsWith('chatgpt/')) return `${new Intl.NumberFormat('de-DE').format(tokens)} Token · ChatGPT-Kontingent`;
  const price = usage.costUsd !== undefined ? `Schätzkosten ${new Intl.NumberFormat('de-DE', { minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(usage.costUsd)} USD` : 'Preis nicht verfügbar';
  return `${new Intl.NumberFormat('de-DE').format(tokens)} Token · ${price}`;
}
/** Without `onToggle` the list is always open; the conversation view passes both to make it collapsible. */
export function BackgroundJobs({ jobs, onStop, onError, open = true, onToggle }: {
  jobs: BackgroundJob[]; onStop(id: string): Promise<void>; onError(error: unknown): void; open?: boolean; onToggle?(): void;
}) {
  const [stopping, setStopping] = useState(new Set<string>());
  const active = (job: BackgroundJob) => ['queued', 'running', 'stopping'].includes(job.status) || !!job.runtimeRetained;
  const visible = [...jobs.filter(active), ...jobs.filter(job => !active(job)).slice(-3).reverse()];
  if (!visible.length) return null;
  async function stop(id: string) {
    if (stopping.has(id)) return;
    setStopping(current => new Set(current).add(id));
    try { await onStop(id); } catch (error) { onError(error); }
    finally { setStopping(current => { const next = new Set(current); next.delete(id); return next; }); }
  }
  const activeCount = jobs.filter(active).length;
  const attention = visible.some(needsAttention);
  const summary = activeCount ? `${activeCount} aktiv · du kannst weiter sprechen` : 'Letzte Ergebnisse';
  return <section className={`background-jobs ${onToggle ? 'collapsible' : ''} ${open ? 'open' : 'collapsed'}`} aria-label="Aufträge">
    {onToggle
      ? <button className="background-jobs-heading" aria-expanded={open} onClick={onToggle} title={open ? 'Aufträge einklappen' : 'Aufträge anzeigen'}>
        <strong>Aufträge</strong><span>{activeCount ? `${activeCount} aktiv` : 'Letzte Ergebnisse'}</span>{attention && <em>Rückmeldung nötig</em>}<ChevronDown size={13} className={open ? 'rotate' : ''} />
      </button>
      : <div className="background-jobs-heading"><strong>Aufträge</strong><span>{summary}</span></div>}
    {open && <ul>{visible.map(job => <li key={job.id} data-job-id={job.id} className={`background-job ${job.status}`}>
      <div><strong title={job.title}>{job.title}</strong><span>{statusLabel(job)}{job.error && <span className="background-job-error"> · {job.error}</span>}</span>{job.usage && <span className="background-job-usage">{usageLabel(job)}</span>}</div>
      {active(job) && <button disabled={stopping.has(job.id) || job.status === 'stopping'} aria-label={`Auftrag stoppen: ${job.title}`} onClick={() => void stop(job.id)}>{stopping.has(job.id) || job.status === 'stopping' ? <LoaderCircle size={12} className="spin" /> : <Square size={10} />} Stopp</button>}
    </li>)}</ul>}
  </section>;
}
