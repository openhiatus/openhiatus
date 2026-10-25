import { localized, t, uiLocale } from '../../../shared/i18n';
import { useEffect, useRef, useState } from 'react';
import { Activity as ActivityIcon, ArrowRight, AudioLines, Check, CheckCheck, ChevronRight, CircleHelp, FileText, MessageSquare, Mic, ShieldCheck, Square, Terminal, Volume2, VolumeX } from 'lucide-react';
import type { Activity, TaskStatus } from '../../../shared/contracts';
import { assistantDisplayName } from '../../../shared/assistant-profile';
import { desktopControlCopy } from '../../../shared/desktop-control';
import type { AppSession } from '../session';
import { OpenhiatusMark as Mark } from '../../components/OpenhiatusMark';
import { Spinner } from '../../components/Spinner';
import { Presence, type PresenceState } from '../../Presence';
import { ContextMeter } from '../../ContextMeter';
import { MessageBody } from './message-body';

function time(at: string) { return new Date(at).toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit' }); }
const taskDetails: Partial<Record<TaskStatus, string>> = localized({ interrupted: 'Das letzte Gespräch wurde unterbrochen.', failed: 'Die letzte Antwort ist fehlgeschlagen.' });
function duration(seconds: number) { const value = Math.max(0, Math.floor(seconds)); return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`; }
function ActivityRow({ event }: { event: Activity }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = event.kind === 'command' ? Terminal : event.kind === 'file' ? FileText : event.kind === 'error' ? CircleHelp : Check;
  return <div className={`activity-entry ${event.kind}`}>
    <button className="activity-entry-head" onClick={() => setExpanded(!expanded)} disabled={!event.detail} aria-expanded={event.detail ? expanded : undefined}>
      <span className="activity-icon"><Icon size={14} /></span><span className="activity-entry-title">{event.title}<time>{time(event.at)}</time></span>{event.detail && <ChevronRight size={13} className={expanded ? 'rotate' : ''} />}
    </button>
    {expanded && <pre className="activity-detail">{event.detail}</pre>}
  </div>;
}


export interface ConversationViewProps { session: AppSession; active: boolean; showActivity: boolean; onOpenTasks(): void; onOpenSettings(): void; }

export function ConversationView({ session, active, showActivity, onOpenTasks, onOpenSettings }: ConversationViewProps) {
  const { state, acknowledged, isRecording, level, speechReady, manualSummaryBusy, audioBusy, phase, startRecording,
    cancelAudio, setNotice, ready, report, taskBusy, speak, transcript, composerRef, voiceConversation, draft, setDraft,
    pendingSend, send, preference, clearSpeech, stopEarcons, currentModel, currentDialogModel, activeJobs, seconds, taskStatus, error, summaryInProgress, microphoneLevel, playbackLevel } = session;
  const assistantName = assistantDisplayName(state?.preferences.assistantProfile);
  const support = state?.preferences.itSupporter === true;
  const presence: { state: PresenceState; label: string; detail: string } = !state ? { state: 'offline', label: t("Verbinde …"), detail: t("openHiatus wird vorbereitet.") }
    : state.desktopControl && state.desktopControl !== 'free' ? { state: state.desktopControl === 'error' ? 'error' : 'working', label: desktopControlCopy[state.desktopControl].title,
      detail: `${desktopControlCopy[state.desktopControl].detail}${state.desktopControl === 'error' ? '' : t(" Esc: stoppen & übernehmen.")}` }
    : phase === 'opening' ? { state: 'listening', label: t("Mikrofon öffnet …"), detail: t("Gleich kannst du sprechen.") }
    : phase === 'recording' ? { state: 'listening', label: t("Ich höre zu"), detail: `${duration(seconds)} · F8 ${voiceConversation ? t("beendet und sendet") : t("beendet die Aufnahme")}` }
    : phase === 'mic-test' ? { state: 'listening', label: t("Mikrofontest"), detail: t("{0}s / 4s · bleibt lokal", seconds) }
    : phase === 'transcribing' ? { state: 'thinking', label: t("Verstehe …"), detail: voiceConversation ? t("Dein Gesagtes wird erkannt und gleich gesendet.") : t("Danach kannst du den Text prüfen.") }
    : pendingSend ? { state: 'thinking', label: t("Wird gesendet …"), detail: t("Du kannst gleich weitersprechen.") }
    : phase === 'playing' ? { state: 'speaking', label: t("Ich spreche"), detail: activeJobs ? `${activeJobs === 1 ? t("Ein Auftrag läuft") : t("{0} Aufträge laufen", activeJobs)} weiter.` : t("F8 unterbricht mich jederzeit.") }
    : phase === 'synthesizing' ? { state: 'thinking', label: t("Gleich spreche ich"), detail: t("Die Antwort wird vertont.") }
    : taskStatus === 'stopping' ? { state: 'thinking', label: t("Halte an …"), detail: t("Warte auf bestätigten Abbruch.") }
    : taskBusy ? { state: 'thinking', label: t("Denke nach …"), detail: t("Dein Arbeitsplatz bleibt frei. Du kannst weitersprechen.") }
    : manualSummaryBusy ? { state: 'working', label: t("Gedächtnisberichte laufen"), detail: t("Zum Schreiben zuerst stoppen.") }
    : activeJobs ? { state: 'working', label: t("Arbeite im Hintergrund"), detail: t("{0} aktiv · dein Arbeitsplatz bleibt frei.", activeJobs === 1 ? t("Ein Auftrag") : t("{0} Aufträge", activeJobs)) }
    : error ? { state: 'error', label: t("Da hakt etwas"), detail: t("Details stehen oben im Hinweis.") }
    : !ready ? { state: 'offline', label: t("Noch nicht eingerichtet"), detail: t("Vollzugriff bestätigen und einen Modellanbieter verbinden.") }
    : { state: 'idle', label: t("Bereit"), detail: taskDetails[taskStatus] ?? (summaryInProgress ? t("Gedächtnis wird im Hintergrund aufbereitet.") : speechReady ? '' : support ? t("Verbinde die Sprache unter Einstellungen → Sprache & Geräte.") : t("Schreib mir oder verbinde die Sprache.")) };
  const messages = state?.messages ?? [];
  const lastUserIndex = messages.map(message => message.role).lastIndexOf('user');
  const lastUser = lastUserIndex >= 0 ? messages[lastUserIndex] : undefined;
  // Only a reply after the latest utterance belongs on stage; an older one would read as the answer.
  const lastReply = messages.slice(lastUserIndex + 1).filter(message => message.role === 'assistant' && !!message.text).at(-1);
  const presenceLevel = presence.state === 'listening' ? microphoneLevel : presence.state === 'speaking' ? playbackLevel : undefined;
  const [showHistory, setShowHistory] = useState(() => { try { return localStorage.getItem('openhiatus.showHistory') === '1'; } catch { return false; } });
  const historyOpen = support || showHistory;
  const toggleHistory = () => setShowHistory(current => { try { localStorage.setItem('openhiatus.showHistory', current ? '0' : '1'); } catch { /* viewer preference only */ } return !current; });
  const messagesEnd = useRef<HTMLDivElement>(null);
  useEffect(() => { if (active) messagesEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [active, state?.messages.length, state?.messages.at(-1)?.text, historyOpen]);
  return <div className={`conversation-layout ${showActivity ? '' : 'without-activity'}`}>
        <main className={`conversation voice-first ${historyOpen ? 'history-open' : ''} ${support ? 'it-supporter' : ''}`}>
          {support && <p className="supporter-log-intro">{t("IT-Supporter · Sprich mit F8. Hinweise erscheinen direkt auf deinem Bildschirm. Dieses Protokoll hält Fragen, Antworten und Ergebnisse zum späteren Nachlesen fest.")}</p>}
          {(state?.jobs?.length ?? 0) > 0 && <button className="conversation-work-hint" onClick={onOpenTasks}><span>{activeJobs ? activeJobs === 1 ? t("Ein Auftrag aktiv") : t("{0} Aufträge aktiv", activeJobs) : t("Letzte Aufgaben und Ergebnisse")}</span><span>{t("Aufgaben ansehen ")}<ArrowRight size={14} /></span></button>}
          <section className={`voice-stage ${presence.state}`} aria-label={t("Sprachgespräch mit {0}", assistantName)}>
            <Presence size={historyOpen ? 'compact' : 'large'} state={presence.state} level={presenceLevel} label={`${assistantName}: ${presence.label}`} />
            <div className="stage-text" role="status" aria-live="polite"><strong>{presence.label}</strong>{presence.detail && <span>{presence.detail}</span>}</div>
            <div className="stage-actions">
              {isRecording && <div className="level-bars" aria-label={t("Mikrofonpegel")}>{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ opacity: level * 12 > i ? 1 : .15 }} />)}</div>}
              <button className={`mic-button stage-mic ${isRecording ? 'recording' : ''}`} aria-keyshortcuts="F8" disabled={!speechReady || manualSummaryBusy || (audioBusy && !isRecording && phase !== 'synthesizing')} onClick={() => void startRecording()} title={!speechReady ? t("Verbinde zuerst Inworld in den Einstellungen unter Sprache & Geräte") : t("F8: Aufnahme starten, erneut F8: Aufnahme beenden")}>{isRecording ? <Square size={15} fill="currentColor" /> : <Mic size={18} />}{isRecording ? t("Aufnahme beenden") : t("Sprechen")} <kbd>F8</kbd></button>
              {phase === 'playing' && <button className="stage-secondary" onClick={() => { cancelAudio(); setNotice(t("Wiedergabe beendet. Eine laufende Aufgabe arbeitet weiter.")); }}>{t("Nur Wiedergabe beenden ")}<VolumeX size={13} /></button>}
            </div>
            {!!state && ready && <ContextMeter context={state.context} threadId={state.task.threadId} hasConversation={state.messages.length > 0} />}
            {!state ? null : !ready ? <button className="setup-inline" onClick={() => onOpenSettings()}><span className="setup-number">1</span><span>{t("Einmal verbinden, dann loslegen")}<small>{t("Modellanbieter und deine Sprachverbindung einrichten")}</small></span><ArrowRight size={17} /></button>
              : !historyOpen && (lastUser || lastReply) && <div className="stage-captions">
                {lastUser && <p className="stage-caption user"><span>{t("Du")}</span>{lastUser.text}</p>}
                {lastReply && <div className="stage-caption openhiatus"><span>openHiatus</span><MessageBody text={lastReply.text} onError={report} /></div>}
              </div>}
          </section>
          {historyOpen && <div className={`messages ${state?.messages.length ? '' : 'empty'}`} role={support ? 'log' : undefined} aria-label={support ? t("Support-Protokoll") : undefined} aria-live={support ? 'off' : undefined}>
            {!state ? <div className="loading"><Spinner />{t(" openHiatus wird verbunden …")}</div> : state.messages.length === 0 ? <div className="history-empty">{support ? t("Noch keine Einträge. Stelle deine Frage mit F8 oder der Sprechtaste.") : t("Noch kein Gespräch. Sprich einfach los oder schreib unten.")}</div> : <div className="message-list">{state.messages.map(message => <article className={`message ${message.role}`} key={message.id}><div className="message-avatar">{message.role === 'assistant' ? <Mark small /> : 'DU'}</div><div className="message-content"><div className="message-meta"><strong>{message.role === 'assistant' ? assistantName : t("Du")}</strong><time>{time(message.at)}</time>{message.role === 'assistant' && <span>{support ? 'IT-SUPPORT' : 'AGENT'}</span>}</div><MessageBody text={message.text || (message.role === 'assistant' && (!taskBusy || message.id !== state.messages.at(-1)?.id) ? t("Für diesen Auftrag liegt keine Antwort vor.") : '')} onError={report} />{message.role === 'assistant' && !!message.text && <button className="read-reply" disabled={!speechReady || audioBusy} onClick={() => void speak(message.text)}><Volume2 size={13} />{t(" Vorlesen")}</button>}</div></article>)}<div ref={messagesEnd} /></div>}
          </div>}
          <div className="composer-area">
            {transcript && <div className="transcript-label"><CheckCheck size={14} />{t(" Sprache erkannt — du kannst den Text vor dem Senden ändern.")}</div>}
            {(!support || transcript) && <div className={`composer slim ${isRecording ? 'recording' : ''}`}>
              {!support && <button className={`history-toggle ${showHistory ? 'selected' : ''}`} aria-pressed={showHistory} onClick={() => toggleHistory()} title={showHistory ? t("Verlauf ausblenden") : t("Ganzen Verlauf zeigen")}><MessageSquare size={15} />{t(" Verlauf")}{state?.messages.length ? <span>{state.messages.length}</span> : null}</button>}
              <textarea ref={composerRef} aria-label={support ? t("Sprachtranskript prüfen") : t("Dein Auftrag")} aria-keyshortcuts="Control+Enter Meta+Enter" disabled={manualSummaryBusy} placeholder={voiceConversation ? t("Lieber schreiben? Hier tippen …") : t("Transkript prüfen oder schreiben …")} value={draft} rows={draft.includes('\n') || draft.length > 90 ? 3 : 1} onChange={event => setDraft(event.target.value)} />
              {!voiceConversation && <span className="composer-tip"><kbd>F9</kbd>{t(" senden")}</span>}
              <button className="send-button" aria-label={t("Auftrag senden")} aria-keyshortcuts="F9 Control+Enter Meta+Enter" disabled={!draft.trim() || manualSummaryBusy || (pendingSend || !ready) || isRecording || phase === 'opening' || phase === 'transcribing'} onClick={() => void send()} title={t("Auftrag senden (F9 oder Strg + Enter)")}>{pendingSend ? <Spinner /> : <ArrowRight size={18} />}</button>
            </div>}
            <div className="composer-footer"><button className={state?.preferences.speakReplies ? 'speech-enabled' : ''} onClick={() => { if (state?.preferences.speakReplies) { clearSpeech(); cancelAudio(); } preference({ speakReplies: !state?.preferences.speakReplies }); }} aria-pressed={!!state?.preferences.speakReplies}>{state?.preferences.speakReplies ? <Volume2 size={13} /> : <VolumeX size={13} />} {t("Antworten vorlesen {0}", state?.preferences.speakReplies ? 'an' : 'aus')}</button><button className={state?.preferences.earcons !== false ? 'speech-enabled' : ''} onClick={() => { if (state?.preferences.earcons !== false) stopEarcons(); preference({ earcons: state?.preferences.earcons === false }); }} aria-pressed={state?.preferences.earcons !== false}><AudioLines size={13} />{t(" Signaltöne ")}{state?.preferences.earcons !== false ? 'an' : 'aus'}</button><span>{t("Gespräch")}{currentDialogModel ? ` · ${currentDialogModel}` : ''}<br />{t("Arbeit")}{currentModel ? ` · ${currentModel}` : ''}</span></div>
          </div>
        </main>
        {showActivity && <aside className="activity-panel"><div className="panel-heading"><div><ActivityIcon size={16} /><h2>{t("Aktivität")}</h2></div><span>{state?.activity.length ?? 0}</span></div><p className="panel-intro">{t("Du siehst, was openHiatus gerade tut.")}</p><div className="activity-feed">{state?.activity.length ? [...state.activity].reverse().map(event => <ActivityRow key={event.id} event={event} />) : <div className="activity-empty"><div className="activity-placeholder"><Terminal size={22} /><span /></div><h3>{t("Alles nachvollziehbar.")}</h3><p>{t("Arbeitsschritte, Befehle und Dateiänderungen erscheinen hier, sobald es losgeht.")}</p></div>}</div><div className="activity-footer"><ShieldCheck size={16} /><div>{t("Rechte deines Windows-Benutzerkontos")}<span>{acknowledged ? t("Vollzugriff bestätigt") : t("Vollzugriff noch bestätigen")}</span></div></div></aside>}
      </div>;
}
