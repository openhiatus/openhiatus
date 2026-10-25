import { t } from '../shared/i18n';
import type { ContextUsage } from '../shared/contracts';
import { contextFill, formatTokens } from '../shared/context-usage';

/** How full the conversation thread's model context is, as last reported by openHiatus. */
export function ContextMeter({ context, threadId, hasConversation = false }: { context?: ContextUsage; threadId?: string; hasConversation?: boolean }) {
  const fill = contextFill(context, threadId);
  const awaitingReport = fill.fresh && (hasConversation || !!threadId);
  const detail = awaitingReport ? t("Kontextverbrauch noch nicht gemeldet")
    : fill.fresh ? t("Frisches Gespräch · noch nichts belegt")
    : fill.windowTokens ? t("{0} von {1} Token{2}", formatTokens(fill.usedTokens), formatTokens(fill.windowTokens), fill.level === 'full' ? t(" · Neues Gespräch empfohlen") : '')
    : t("{0} Token belegt · Fenstergröße nicht gemeldet", formatTokens(fill.usedTokens));
  const percentage = awaitingReport ? '–' : fill.percent === 0 && fill.usedTokens > 0 ? '<1 %' : fill.percent !== undefined ? `${fill.percent} %` : fill.fresh ? '0 %' : '–';
  return <div className={`context-meter ${fill.level} ${awaitingReport ? 'unknown' : fill.fresh ? 'fresh' : ''}`} role="meter" aria-label={t("Kontext des Gesprächs")}
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={awaitingReport ? undefined : fill.percent ?? (fill.fresh ? 0 : undefined)} aria-valuetext={detail}
    title={t("Belegung des Modellkontexts im aktuellen Gespräch. Wird es voll, kann openHiatus ältere Teile zusammenfassen; ein neues Gespräch beginnt leer.")}>
    <div className="context-meter-head"><span>{t("Kontext")}</span><strong>{percentage}</strong></div>
    <div className="context-meter-bar"><i style={{ width: `${fill.percent ?? 0}%` }} /></div>
    <small>{detail}</small>
  </div>;
}
