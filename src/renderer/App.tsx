import { useState } from 'react';
import { Activity as ActivityIcon, ArrowRight, AudioLines, BookOpen, FileText, Mic, X } from 'lucide-react';
import { withFavoriteLevel } from '../shared/skill-favorites';
import { FullAccessNotice } from './FullAccessNotice';
import { HotkeyWarning } from './HotkeyWarning';
import { MemoryView } from './MemoryView';
import { SkillsView } from './SkillsView';
import { ConversationView } from './features/conversation';
import { WorkspaceShell, type AppView } from './features/navigation';
import { ServicesView } from './features/services';
import { SettingsView } from './features/settings';
import { TasksView } from './features/tasks';
import { useAppSession } from './features/session';

export { MessageBody } from './features/conversation';

/** Views own presentation state; the application session stays mounted across navigation. */
export default function App() {
  const [view, setView] = useState<AppView>('chat');
  const [showActivity, setShowActivity] = useState(false);
  const [skillsVisited, setSkillsVisited] = useState(false);
  const [memoryNavigation, setMemoryNavigation] = useState<{ requestId: number }>();
  const navigate = (next: AppView) => { if (next === 'skills') setSkillsVisited(true); setView(next); };
  const openIdentity = () => { setMemoryNavigation(current => ({ requestId: (current?.requestId ?? 0) + 1 })); navigate('memory'); };
  const session = useAppSession({ conversationVisible: view === 'chat', openConversation: () => navigate('chat'), openSettings: () => navigate('settings') });
  const { state } = session;

  return <WorkspaceShell view={view} onNavigate={navigate} state={state} ready={session.ready} speechReady={session.speechReady}
    newConversationDisabled={session.workBusy || session.summaryInProgress || session.busyAction === 'new'}
    onNewConversation={() => void session.newConversation()} onStop={session.stopAll} onError={session.report}
    headerActions={view === 'chat' && <button className={`icon-button activity-toggle ${showActivity ? 'selected' : ''}`}
      onClick={() => setShowActivity(current => !current)} aria-label={showActivity ? 'Aktivität ausblenden' : 'Aktivität einblenden'} title="Aktivität"><ActivityIcon size={18} /></button>}>
    <HotkeyWarning hotkeys={state?.hotkeys} />
    {state && !session.acknowledged && <FullAccessNotice acknowledged={false} busy={!!session.busyAction}
      onAcknowledge={() => void session.action('full-access', () => window.openhiatus.acknowledgeFullAccess(), 'Vollzugriff bestätigt. Richte jetzt deinen Modellanbieter ein.')} />}
    {(session.error || session.notice) && <div role={session.error ? 'alert' : 'status'} className={`banner ${session.error ? 'error' : ''}`}>
      <span>{session.error || session.notice}</span><button className="icon-button" aria-label="Hinweis schließen" onClick={() => { session.setError(''); session.setNotice(''); }}><X size={15} /></button>
    </div>}
    <div className="speech-mode-bar" hidden={view !== 'chat'}>
      <div className="speech-mode-choice" role="group" aria-label="Gesprächsmodus">
        <button className={session.voiceConversation ? 'selected' : ''} aria-pressed={session.voiceConversation}
          disabled={!state || session.isRecording || session.phase === 'transcribing'} onClick={() => session.preference({ voiceConversation: true })}><Mic size={13} /> Sprachgespräch</button>
        <button className={!session.voiceConversation ? 'selected' : ''} aria-pressed={!session.voiceConversation}
          disabled={!state || session.isRecording || session.phase === 'transcribing'} onClick={() => session.preference({ voiceConversation: false })}><FileText size={13} /> Transkript prüfen</button>
      </div><div className="conversation-mode-hint" />
    </div>
    {view !== 'chat' && session.phase !== 'idle' && <div className="session-audio-bar" role="status">
      <AudioLines size={15} /><span>{session.voiceStatus}{session.isRecording ? ` · ${session.seconds}s` : ''}</span>
      <button onClick={() => navigate('chat')}>Zum Gespräch</button><button onClick={session.cancelAudio}>Audio beenden</button>
    </div>}
    {session.summaryInProgress && view !== 'memory' && <div className="summary-work-bar" role="status"><BookOpen size={14} />
      <span>{state?.summary?.status === 'stopping' ? 'Gedächtnisberichte werden gestoppt' : 'openHiatus erstellt Gedächtnisberichte'}<small>{state?.summary?.completed} / {state?.summary?.total} gespeichert · {state?.summary?.calls} Modellaufrufe</small></span>
      <button onClick={() => navigate('memory')}>Fortschritt ansehen <ArrowRight size={13} /></button>
    </div>}
    <div className="workspace-view conversation-view-host" hidden={view !== 'chat'}>
      <ConversationView session={session} active={view === 'chat'} showActivity={showActivity} onOpenTasks={() => navigate('tasks')} onOpenSettings={() => navigate('settings')} />
    </div>
    <div className="workspace-view tasks-view-host" hidden={view !== 'tasks'}>
      <TasksView jobs={state?.jobs ?? []} onStop={id => window.openhiatus.stopJob(id)} onError={session.report} onConversation={() => navigate('chat')} />
    </div>
    <div className="workspace-view services-view-host" hidden={view !== 'services'}><ServicesView active={view === 'services'} onSettings={() => navigate('settings')} /></div>
    <div className="workspace-view memory-view-host" hidden={view !== 'memory'}><MemoryView state={state} active={view === 'memory'} navigationRequest={memoryNavigation} /></div>
    {skillsVisited && <div className="workspace-view skills-view-host" hidden={view !== 'skills'}><SkillsView onInsert={session.insertSkill}
      insertDisabledReason={session.skillInsertDisabledReason} favorites={state?.preferences.skillFavorites}
      onFavoriteChange={(path, level) => session.preference({ skillFavorites: withFavoriteLevel(state?.preferences.skillFavorites, path, level) })} /></div>}
    <div className="workspace-view settings-view-host" hidden={view !== 'settings'}>
      <SettingsView state={state} workBusy={session.workBusy} summaryInProgress={session.summaryInProgress} onOpenIdentity={openIdentity}
        onPreference={session.preference} onError={session.report} onNotice={session.setNotice}
        voice={{ phase: session.phase, seconds: session.seconds, devices: session.devices, audioBusy: session.audioBusy, speechReady: session.speechReady,
          startRecording: session.startRecording, testSpeech: session.testSpeech, cancelAudio: session.cancelAudio, clearSpeech: session.clearSpeech, stopEarcons: session.stopEarcons,
          saveSpeechKey: key => window.openhiatus.saveSpeechKey(key), removeSpeechKey: () => window.openhiatus.removeSpeechKey() }} />
    </div>
  </WorkspaceShell>;
}
