import { dateFormatter, localized, numberFormatter, t } from '../../../shared/i18n';
import type { BackgroundJobView } from '../../../shared/contracts';

export type TaskFilter = 'all' | 'active' | 'completed' | 'interrupted' | 'failed';
export const taskFilters: readonly { id: TaskFilter; label: string }[] = localized([
  { id: 'all', label: 'Alle' }, { id: 'active', label: 'Aktiv' }, { id: 'completed', label: 'Ergebnisse' },
  { id: 'interrupted', label: 'Unterbrochen' }, { id: 'failed', label: 'Fehler' },
]);
export function taskIsActive(job: BackgroundJobView): boolean {
  return job.status === 'queued' || job.status === 'running' || job.status === 'stopping' || !!job.runtimeRetained;
}
export function taskMatches(job: BackgroundJobView, filter: TaskFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return taskIsActive(job);
  return job.status === filter;
}
/** All saved rows remain available; active work comes first, then newest creation. */
export function tasksForFilter(jobs: readonly BackgroundJobView[], filter: TaskFilter): BackgroundJobView[] {
  return jobs.filter(job => taskMatches(job, filter)).sort((left, right) => Number(taskIsActive(right)) - Number(taskIsActive(left))
    || right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id));
}
const statusLabels = localized({ queued: 'Wartet', running: 'Arbeitet', stopping: 'Wird gestoppt', completed: 'Abgeschlossen', interrupted: 'Unterbrochen', failed: 'Fehlgeschlagen' });
export function taskStatusLabel(job: BackgroundJobView): string {
  if (job.status === 'completed' && job.runtimeRetained) return t("Ergebnis da · Sitzung offen");
  return statusLabels[job.status];
}
export function taskStatusDescription(job: BackgroundJobView): string {
  if (job.status === 'completed' && job.runtimeRetained) return t("Ein Ergebnis liegt vor. Die Sitzung ist noch offen und kann einzeln gestoppt werden.");
  switch (job.status) {
    case 'queued': return t("Der Auftrag wartet auf seine Ausführung.");
    case 'running': return t("openHiatus arbeitet an diesem Auftrag. Du kannst im Gespräch weiterreden.");
    case 'stopping': return t("Stopp ist angefordert. openHiatus wartet auf die Bestätigung der Laufzeit.");
    case 'completed': return t("Der Auftrag ist abgeschlossen.");
    case 'interrupted': return t("Der Auftrag wurde unterbrochen. Ein vorhandenes Teilergebnis bleibt erhalten.");
    case 'failed': return t("Der Auftrag ist fehlgeschlagen. Die Fehlermeldung steht unten.");
  }
}
const numbers = numberFormatter();
export const formatTaskNumber = (value: number) => numbers.format(value);
export function taskUsageLabel(job: BackgroundJobView): string {
  const usage = job.usage;
  if (!usage) return t("Verbrauch noch nicht gemeldet");
  const tokens = usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  if (job.model.startsWith('chatgpt/')) return t("{0} Token · ChatGPT-Kontingent", numbers.format(tokens));
  const cost = usage.costUsd === undefined ? t("Preis nicht verfügbar")
    : t("Schätzkosten {0} USD", numberFormatter({ minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(usage.costUsd));
  return t("{0} Token · {1}", numbers.format(tokens), cost);
}
const dates = dateFormatter({ dateStyle: 'medium', timeStyle: 'short' });
export function formatTaskTime(value: string): string { const date = new Date(value); return Number.isFinite(date.getTime()) ? dates.format(date) : t("Zeit nicht verfügbar"); }
