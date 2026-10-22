import type { ContextUsage } from '../shared/contracts';
import { contextFill, formatTokens } from '../shared/context-usage';

/** How full the conversation thread's model context is, as last reported by openHiatus. */
export function ContextMeter({ context, threadId, hasConversation = false }: { context?: ContextUsage; threadId?: string; hasConversation?: boolean }) {
  const fill = contextFill(context, threadId);
  const awaitingReport = fill.fresh && (hasConversation || !!threadId);
  const detail = awaitingReport ? 'Kontextverbrauch noch nicht gemeldet'
    : fill.fresh ? 'Frisches Gespräch · noch nichts belegt'
    : fill.windowTokens ? `${formatTokens(fill.usedTokens)} von ${formatTokens(fill.windowTokens)} Token${fill.level === 'full' ? ' · Neues Gespräch empfohlen' : ''}`
    : `${formatTokens(fill.usedTokens)} Token belegt · Fenstergröße nicht gemeldet`;
  const percentage = awaitingReport ? '–' : fill.percent === 0 && fill.usedTokens > 0 ? '<1 %' : fill.percent !== undefined ? `${fill.percent} %` : fill.fresh ? '0 %' : '–';
  return <div className={`context-meter ${fill.level} ${awaitingReport ? 'unknown' : fill.fresh ? 'fresh' : ''}`} role="meter" aria-label="Kontext des Gesprächs"
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={awaitingReport ? undefined : fill.percent ?? (fill.fresh ? 0 : undefined)} aria-valuetext={detail}
    title="Belegung des Modellkontexts im aktuellen Gespräch. Wird es voll, kann openHiatus ältere Teile zusammenfassen; ein neues Gespräch beginnt leer.">
    <div className="context-meter-head"><span>Kontext</span><strong>{percentage}</strong></div>
    <div className="context-meter-bar"><i style={{ width: `${fill.percent ?? 0}%` }} /></div>
    <small>{detail}</small>
  </div>;
}
