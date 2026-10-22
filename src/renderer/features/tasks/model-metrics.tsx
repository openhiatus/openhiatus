import { ChevronDown } from 'lucide-react';
import type { BackgroundJobView, ModelRequestSummary } from '../../../shared/contracts';
import { formatTaskNumber } from './presentation';

const roles: Record<ModelRequestSummary['role'], string> = { dialog: 'Gespräch', worker: 'Arbeit', computer: 'Computer' };
const seconds = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

/** Saved request measurements stay optional for tasks created by older versions. */
export function TaskModelMetrics({ job }: { job: BackgroundJobView }) {
  if (!job.computer && !job.modelRequests?.length) return null;
  return <details className="tasks-stored-context tasks-model-metrics"><summary>Modelle & Messwerte<ChevronDown size={16} aria-hidden="true" /></summary>
    {job.computer && <dl className="tasks-metadata">
      <div><dt>Computerbedienung</dt><dd>{job.computer.delegationEnabled ? 'Getrenntes Computer-Modell' : 'Arbeitsmodell'}</dd></div>
      <div><dt>Bildschirmübersicht</dt><dd>1:{formatTaskNumber(job.computer.overviewScaleDivisor)}</dd></div>
      {job.computer.delegationEnabled && <>
        <div className="tasks-meta-wide"><dt>Computer-Modell</dt><dd>{job.computer.model || 'Nicht konfiguriert'}</dd></div>
        <div><dt>Fast angefordert</dt><dd>{job.computer.fast ? 'Ja' : 'Nein'}</dd></div>
      </>}
    </dl>}
    {!!job.modelRequests?.length && <>
      <p className="tasks-muted">Zeitwerte summieren die Dauer der Modellanfragen. Eingabe und Cache sind getrennte Tokenzähler.</p>
      {job.modelRequests.map((row, index) => <section key={index} className="tasks-model-metric" data-model-role={row.role}>
        <h4>{roles[row.role]} · {row.model}</h4>
        <dl className="tasks-metadata">
          <div><dt>Service-Stufe angefordert</dt><dd>{row.requestedServiceTier === 'fast' ? 'Fast' : 'Keine Vorgabe'}</dd></div>
          <div><dt>Service-Stufe gemeldet</dt><dd>{row.actualServiceTier || 'nicht gemeldet'}</dd></div>
          <div><dt>Anfragen</dt><dd>{formatTaskNumber(row.requests)}</dd></div>
          <div><dt>Modellzeit (Summe)</dt><dd>{seconds.format(row.elapsedMs / 1000)} s</dd></div>
          <div><dt>Fehlgeschlagen</dt><dd>{formatTaskNumber(row.failed)}</dd></div>
          <div><dt>Abgebrochen</dt><dd>{formatTaskNumber(row.aborted)}</dd></div>
        </dl>
        {row.usage ? <dl className="tasks-token-counts">
          <div><dt>Eingabe ohne Cache</dt><dd>{formatTaskNumber(row.usage.inputTokens)}</dd></div>
          <div><dt>Ausgabe</dt><dd>{formatTaskNumber(row.usage.outputTokens)}</dd></div>
          <div><dt>Cache gelesen</dt><dd>{formatTaskNumber(row.usage.cacheReadTokens)}</dd></div>
          <div><dt>Cache geschrieben</dt><dd>{formatTaskNumber(row.usage.cacheWriteTokens)}</dd></div>
        </dl> : <p className="tasks-muted">Tokenverbrauch nicht gemeldet</p>}
      </section>)}
    </>}
  </details>;
}
