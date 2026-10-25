import { localized, numberFormatter, t } from '../../../shared/i18n';
import { ChevronDown } from 'lucide-react';
import type { BackgroundJobView, ModelRequestSummary } from '../../../shared/contracts';
import { formatTaskNumber } from './presentation';

const roles: Record<ModelRequestSummary['role'], string> = localized({ dialog: 'Gespräch', worker: 'Arbeit', computer: 'Computer' });
const seconds = numberFormatter({ maximumFractionDigits: 1 });

/** Saved request measurements stay optional for tasks created by older versions. */
export function TaskModelMetrics({ job }: { job: BackgroundJobView }) {
  if (!job.computer && !job.modelRequests?.length) return null;
  return <details className="tasks-stored-context tasks-model-metrics"><summary>{t("Modelle & Messwerte")}<ChevronDown size={16} aria-hidden="true" /></summary>
    {job.computer && <dl className="tasks-metadata">
      <div><dt>{t("Computerbedienung")}</dt><dd>{job.computer.delegationEnabled ? t("Getrenntes Computer-Modell") : t("Arbeitsmodell")}</dd></div>
      <div><dt>{t("Bildschirmübersicht")}</dt><dd>1:{formatTaskNumber(job.computer.overviewScaleDivisor)}</dd></div>
      {job.computer.delegationEnabled && <>
        <div className="tasks-meta-wide"><dt>{t("Computer-Modell")}</dt><dd>{job.computer.model || t("Nicht konfiguriert")}</dd></div>
        <div><dt>{t("Fast angefordert")}</dt><dd>{job.computer.fast ? t("Ja") : t("Nein")}</dd></div>
      </>}
    </dl>}
    {!!job.modelRequests?.length && <>
      <p className="tasks-muted">{t("Zeitwerte summieren die Dauer der Modellanfragen. Eingabe und Cache sind getrennte Tokenzähler.")}</p>
      {job.modelRequests.map((row, index) => <section key={index} className="tasks-model-metric" data-model-role={row.role}>
        <h4>{roles[row.role]} · {row.model}</h4>
        <dl className="tasks-metadata">
          <div><dt>{t("Service-Stufe angefordert")}</dt><dd>{row.requestedServiceTier === 'fast' ? 'Fast' : t("Keine Vorgabe")}</dd></div>
          <div><dt>{t("Service-Stufe gemeldet")}</dt><dd>{row.actualServiceTier || t("nicht gemeldet")}</dd></div>
          <div><dt>{t("Anfragen")}</dt><dd>{formatTaskNumber(row.requests)}</dd></div>
          <div><dt>{t("Modellzeit (Summe)")}</dt><dd>{seconds.format(row.elapsedMs / 1000)} s</dd></div>
          <div><dt>{t("Fehlgeschlagen")}</dt><dd>{formatTaskNumber(row.failed)}</dd></div>
          <div><dt>{t("Abgebrochen")}</dt><dd>{formatTaskNumber(row.aborted)}</dd></div>
        </dl>
        {row.usage ? <dl className="tasks-token-counts">
          <div><dt>{t("Eingabe ohne Cache")}</dt><dd>{formatTaskNumber(row.usage.inputTokens)}</dd></div>
          <div><dt>{t("Ausgabe")}</dt><dd>{formatTaskNumber(row.usage.outputTokens)}</dd></div>
          <div><dt>{t("Cache gelesen")}</dt><dd>{formatTaskNumber(row.usage.cacheReadTokens)}</dd></div>
          <div><dt>{t("Cache geschrieben")}</dt><dd>{formatTaskNumber(row.usage.cacheWriteTokens)}</dd></div>
        </dl> : <p className="tasks-muted">{t("Tokenverbrauch nicht gemeldet")}</p>}
      </section>)}
    </>}
  </details>;
}
