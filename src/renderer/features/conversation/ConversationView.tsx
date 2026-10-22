import { useEffect, useRef, useState } from 'react';
import { Activity as ActivityIcon, ArrowRight, AudioLines, Check, CheckCheck, ChevronRight, CircleHelp, FileText, MessageSquare, Mic, ShieldCheck, Square, Terminal, Volume2, VolumeX } from 'lucide-react';
import type { Activity, TaskStatus } from '../../../shared/contracts';
import type { AppSession } from '../session';
import { OpenhiatusMark as Mark } from '../../components/OpenhiatusMark';
import { Spinner } from '../../components/Spinner';
import { Presence, type PresenceState } from '../../Presence';
import { ContextMeter } from '../../ContextMeter';
import { MessageBody } from './message-body';

function time(at: string) { return new Date(at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); }
const taskDetails: Partial<Record<TaskStatus, string>> = { interrupted: 'Das letzte Gespräch wurde unterbrochen.', failed: 'Die letzte Antwort ist fehlgeschlagen.' };
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
    pendingSend, send, preference, clearSpeech, stopEarcons, currentModel, activeJobs, seconds, taskStatus, error, summaryInProgress, microphoneLevel, playbackLevel } = session;
  const presence: { state: PresenceState; label: string; detail: string } = !state ? { state: 'offline', label: 'Verbinde …', detail: 'openHiatus wird vorbereitet.' }
    : phase === 'opening' ? { state: 'listening', label: 'Mikrofon öffnet …', detail: 'Gleich kannst du sprechen.' }
    : phase === 'recording' ? { state: 'listening', label: 'Ich höre zu', detail: `${duration(seconds)} · F8 ${voiceConversation ? 'beendet und sendet' : 'beendet die Aufnahme'}` }
    : phase === 'mic-test' ? { state: 'listening', label: 'Mikrofontest', detail: `${seconds}s / 4s · bleibt lokal` }
    : phase === 'transcribing' ? { state: 'thinking', label: 'Verstehe …', detail: voiceConversation ? 'Dein Gesagtes wird erkannt und gleich gesendet.' : 'Danach kannst du den Text prüfen.' }
    : pendingSend ? { state: 'thinking', label: 'Wird gesendet …', detail: 'Du kannst gleich weitersprechen.' }
    : phase === 'playing' ? { state: 'speaking', label: 'Ich spreche', detail: activeJobs ? `${activeJobs === 1 ? 'Ein Auftrag läuft' : `${activeJobs} Aufträge laufen`} weiter.` : 'F8 unterbricht mich jederzeit.' }
    : phase === 'synthesizing' ? { state: 'thinking', label: 'Gleich spreche ich', detail: 'Die Antwort wird vertont.' }
    : taskStatus === 'stopping' ? { state: 'thinking', label: 'Halte an …', detail: 'Warte auf bestätigten Abbruch.' }
    : taskBusy ? { state: 'thinking', label: 'Denke nach …', detail: 'Du kannst trotzdem weitersprechen.' }
    : manualSummaryBusy ? { state: 'working', label: 'Gedächtnisberichte laufen', detail: 'Zum Schreiben zuerst stoppen.' }
    : activeJobs ? { state: 'working', label: 'Arbeite im Hintergrund', detail: `${activeJobs === 1 ? 'Ein Auftrag' : `${activeJobs} Aufträge`} aktiv · du kannst weiter sprechen.` }
    : error ? { state: 'error', label: 'Da hakt etwas', detail: 'Details stehen oben im Hinweis.' }
    : !ready ? { state: 'offline', label: 'Noch nicht eingerichtet', detail: 'Vollzugriff bestätigen und einen Modellanbieter verbinden.' }
    : { state: 'idle', label: 'Bereit', detail: taskDetails[taskStatus] ?? (summaryInProgress ? 'Gedächtnis wird im Hintergrund aufbereitet.' : speechReady ? '' : 'Schreib mir oder verbinde die Sprache.') };
  const messages = state?.messages ?? [];
  const lastUserIndex = messages.map(message => message.role).lastIndexOf('user');
  const lastUser = lastUserIndex >= 0 ? messages[lastUserIndex] : undefined;
  // Only a reply after the latest utterance belongs on stage; an older one would read as the answer.
  const lastReply = messages.slice(lastUserIndex + 1).filter(message => message.role === 'assistant' && !!message.text).at(-1);
  const presenceLevel = presence.state === 'listening' ? microphoneLevel : presence.state === 'speaking' ? playbackLevel : undefined;
  const [showHistory, setShowHistory] = useState(() => { try { return localStorage.getItem('openhiatus.showHistory') === '1'; } catch { return false; } });
  const toggleHistory = () => setShowHistory(current => { try { localStorage.setItem('openhiatus.showHistory', current ? '0' : '1'); } catch { /* viewer preference only */ } return !current; });
  const messagesEnd = useRef<HTMLDivElement>(null);
  useEffect(() => { if (active) messagesEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [active, state?.messages.length, state?.messages.at(-1)?.text, showHistory]);
  return <div className={`conversation-layout ${showActivity ? '' : 'without-activity'}`}>
        <main className={`conversation voice-first ${showHistory ? 'history-open' : ''}`}>
          {(state?.jobs?.length ?? 0) > 0 && <button className="conversation-work-hint" onClick={onOpenTasks}><span>{activeJobs ? activeJobs === 1 ? 'Ein Auftrag aktiv' : `${activeJobs} Aufträge aktiv` : 'Letzte Aufgaben und Ergebnisse'}</span><span>Aufgaben ansehen <ArrowRight size={14} /></span></button>}
          <section className={`voice-stage ${presence.state}`} aria-label="Sprachgespräch mit openHiatus">
            <Presence size={showHistory ? 'compact' : 'large'} state={presence.state} level={presenceLevel} label={`openHiatus: ${presence.label}`} />
            <div className="stage-text" role="status" aria-live="polite"><strong>{presence.label}</strong>{presence.detail && <span>{presence.detail}</span>}</div>
            <div className="stage-actions">
              {isRecording && <div className="level-bars" aria-label="Mikrofonpegel">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ opacity: level * 12 > i ? 1 : .15 }} />)}</div>}
              <button className={`mic-button stage-mic ${isRecording ? 'recording' : ''}`} aria-keyshortcuts="F8" disabled={!speechReady || manualSummaryBusy || (audioBusy && !isRecording && phase !== 'synthesizing')} onClick={() => void startRecording()} title={!speechReady ? 'Verbinde zuerst Inworld in den Einstellungen unter Sprache & Geräte' : 'F8: Aufnahme starten, erneut F8: Aufnahme beenden'}>{isRecording ? <Square size={15} fill="currentColor" /> : <Mic size={18} />}{isRecording ? 'Aufnahme beenden' : 'Sprechen'} <kbd>F8</kbd></button>
              {phase === 'playing' && <button className="stage-secondary" onClick={() => { cancelAudio(); setNotice('Wiedergabe beendet. Eine laufende Aufgabe arbeitet weiter.'); }}>Nur Wiedergabe beenden <VolumeX size={13} /></button>}
            </div>
            {!!state && ready && <ContextMeter context={state.context} threadId={state.task.threadId} hasConversation={state.messages.length > 0} />}
            {!state ? null : !ready ? <button className="setup-inline" onClick={() => onOpenSettings()}><span className="setup-number">1</span><span>Einmal verbinden, dann loslegen<small>Modellanbieter und deine Sprachverbindung einrichten</small></span><ArrowRight size={17} /></button>
              : !showHistory && (lastUser || lastReply) && <div className="stage-captions">
                {lastUser && <p className="stage-caption user"><span>Du</span>{lastUser.text}</p>}
                {lastReply && <div className="stage-caption openhiatus"><span>openHiatus</span><MessageBody text={lastReply.text} onError={report} /></div>}
              </div>}
          </section>
          {showHistory && <div className={`messages ${state?.messages.length ? '' : 'empty'}`}>
            {!state ? <div className="loading"><Spinner /> openHiatus wird verbunden …</div> : state.messages.length === 0 ? <div className="history-empty">Noch kein Gespräch. Sprich einfach los oder schreib unten.</div> : <div className="message-list">{state.messages.map(message => <article className={`message ${message.role}`} key={message.id}><div className="message-avatar">{message.role === 'assistant' ? <Mark small /> : 'DU'}</div><div className="message-content"><div className="message-meta"><strong>{message.role === 'assistant' ? 'openHiatus' : 'Du'}</strong><time>{time(message.at)}</time>{message.role === 'assistant' && <span>AGENT</span>}</div><MessageBody text={message.text || (message.role === 'assistant' && (!taskBusy || message.id !== state.messages.at(-1)?.id) ? 'Für diesen Auftrag liegt keine Antwort vor.' : '')} onError={report} />{message.role === 'assistant' && !!message.text && <button className="read-reply" disabled={!speechReady || audioBusy} onClick={() => void speak(message.text)}><Volume2 size={13} /> Vorlesen</button>}</div></article>)}<div ref={messagesEnd} /></div>}
          </div>}
          <div className="composer-area">
            {transcript && <div className="transcript-label"><CheckCheck size={14} /> Sprache erkannt — du kannst den Text vor dem Senden ändern.</div>}
            <div className={`composer slim ${isRecording ? 'recording' : ''}`}>
              <button className={`history-toggle ${showHistory ? 'selected' : ''}`} aria-pressed={showHistory} onClick={() => toggleHistory()} title={showHistory ? 'Verlauf ausblenden' : 'Ganzen Verlauf zeigen'}><MessageSquare size={15} /> Verlauf{state?.messages.length ? <span>{state.messages.length}</span> : null}</button>
              <textarea ref={composerRef} aria-label="Dein Auftrag" aria-keyshortcuts="Control+Enter Meta+Enter" disabled={manualSummaryBusy} placeholder={voiceConversation ? 'Lieber schreiben? Hier tippen …' : 'Transkript prüfen oder schreiben …'} value={draft} rows={draft.includes('\n') || draft.length > 90 ? 3 : 1} onChange={event => setDraft(event.target.value)} />
              {!voiceConversation && <span className="composer-tip"><kbd>F9</kbd> senden</span>}
              <button className="send-button" aria-label="Auftrag senden" aria-keyshortcuts="F9 Control+Enter Meta+Enter" disabled={!draft.trim() || manualSummaryBusy || (pendingSend || !ready) || isRecording || phase === 'opening' || phase === 'transcribing'} onClick={() => void send()} title="Auftrag senden (F9 oder Strg + Enter)">{pendingSend ? <Spinner /> : <ArrowRight size={18} />}</button>
            </div>
            <div className="composer-footer"><button className={state?.preferences.speakReplies ? 'speech-enabled' : ''} onClick={() => { if (state?.preferences.speakReplies) { clearSpeech(); cancelAudio(); } preference({ speakReplies: !state?.preferences.speakReplies }); }} aria-pressed={!!state?.preferences.speakReplies}>{state?.preferences.speakReplies ? <Volume2 size={13} /> : <VolumeX size={13} />} {`Antworten vorlesen ${state?.preferences.speakReplies ? 'an' : 'aus'}`}</button><button className={state?.preferences.earcons !== false ? 'speech-enabled' : ''} onClick={() => { if (state?.preferences.earcons !== false) stopEarcons(); preference({ earcons: state?.preferences.earcons === false }); }} aria-pressed={state?.preferences.earcons !== false}><AudioLines size={13} /> Signaltöne {state?.preferences.earcons !== false ? 'an' : 'aus'}</button><span>Arbeit{currentModel ? ` · ${currentModel}` : ''}</span></div>
          </div>
        </main>
        {showActivity && <aside className="activity-panel"><div className="panel-heading"><div><ActivityIcon size={16} /><h2>Aktivität</h2></div><span>{state?.activity.length ?? 0}</span></div><p className="panel-intro">Du siehst, was openHiatus gerade tut.</p><div className="activity-feed">{state?.activity.length ? [...state.activity].reverse().map(event => <ActivityRow key={event.id} event={event} />) : <div className="activity-empty"><div className="activity-placeholder"><Terminal size={22} /><span /></div><h3>Alles nachvollziehbar.</h3><p>Arbeitsschritte, Befehle und Dateiänderungen erscheinen hier, sobald es losgeht.</p></div>}</div><div className="activity-footer"><ShieldCheck size={16} /><div>Rechte deines Windows-Benutzerkontos<span>{acknowledged ? 'Vollzugriff bestätigt' : 'Vollzugriff noch bestätigen'}</span></div></div></aside>}
      </div>;
}
