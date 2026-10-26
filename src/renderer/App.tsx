import { t } from '../shared/i18n';
import { useEffect, useRef, useState } from 'react';
import { needsOnboarding } from '../shared/onboarding';
import { OnboardingView } from './features/onboarding';
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
  const [setupFromStart, setSetupFromStart] = useState(false);
  const [memoryNavigation, setMemoryNavigation] = useState<{ requestId: number }>();
  const navigate = (next: AppView, fromStart = true) => { if (next === 'skills') setSkillsVisited(true); if (next === 'onboarding') setSetupFromStart(fromStart); setView(next); };
  const openIdentity = () => { setMemoryNavigation(current => ({ requestId: (current?.requestId ?? 0) + 1 })); navigate('memory'); };
  const session = useAppSession({ conversationVisible: view === 'chat', openConversation: () => navigate('chat'), openSettings: () => navigate('settings') });
  const { state } = session;
  const initialViewChosen = useRef(false);
  useEffect(() => {
    if (!state || initialViewChosen.current) return;
    initialViewChosen.current = true;
    if (needsOnboarding(state) && state.preferences.onboarding?.status !== 'later') setView('onboarding');
  }, [state]);
  const setupPending = state && needsOnboarding(state);

  return <WorkspaceShell view={view} onNavigate={navigate} state={state} ready={session.ready} speechReady={session.speechReady}
    newConversationDisabled={session.workBusy || session.summaryInProgress || session.busyAction === 'new'}
    onNewConversation={() => void session.newConversation()} onStop={session.stopAll} onError={session.report}
    headerActions={view === 'chat' && <button className={`icon-button activity-toggle ${showActivity ? 'selected' : ''}`}
      onClick={() => setShowActivity(current => !current)} aria-label={showActivity ? t("Aktivität ausblenden") : t("Aktivität einblenden")} title={t("Aktivität")}><ActivityIcon size={18} /></button>}>
    <HotkeyWarning hotkeys={state?.hotkeys} />
    {state && !session.acknowledged && view !== 'onboarding' && <FullAccessNotice acknowledged={false} busy={!!session.busyAction}
      onAcknowledge={() => void session.action('full-access', () => window.openhiatus.acknowledgeFullAccess(), t("Vollzugriff bestätigt. Richte jetzt deinen Modellanbieter ein."))} />}
    {setupPending && view !== 'onboarding' && <div className="onboarding-resume"><button className="secondary-button" onClick={() => navigate('onboarding', false)}>{t('Einrichtung fortsetzen')}<ArrowRight size={16} /></button></div>}
    {(session.error || session.notice) && <div role={session.error ? 'alert' : 'status'} className={`banner ${session.error ? 'error' : ''}`}>
      <span>{session.error || session.notice}</span><button className="icon-button" aria-label={t("Hinweis schließen")} onClick={() => { session.setError(''); session.setNotice(''); }}><X size={15} /></button>
    </div>}
    <div className="speech-mode-bar" hidden={view !== 'chat'}>
      <div className="speech-mode-choice" role="group" aria-label={t("Gesprächsmodus")}>
        <button className={session.voiceConversation ? 'selected' : ''} aria-pressed={session.voiceConversation}
          disabled={!state || session.isRecording || session.phase === 'transcribing'} onClick={() => session.preference({ voiceConversation: true })}><Mic size={13} />{t(" Sprachgespräch")}</button>
        <button className={!session.voiceConversation ? 'selected' : ''} aria-pressed={!session.voiceConversation}
          disabled={!state || session.isRecording || session.phase === 'transcribing'} onClick={() => session.preference({ voiceConversation: false })}><FileText size={13} />{t(" Transkript prüfen")}</button>
      </div><div className="conversation-mode-hint" />
    </div>
    {view !== 'chat' && session.phase !== 'idle' && <div className="session-audio-bar" role="status">
      <AudioLines size={15} /><span>{session.voiceStatus}{session.isRecording ? ` · ${session.seconds}s` : ''}</span>
      <button onClick={() => navigate('chat')}>{state?.preferences.itSupporter ? t("Zum Protokoll") : t("Zum Gespräch")}</button><button onClick={session.cancelAudio}>{t("Audio beenden")}</button>
    </div>}
    {session.summaryInProgress && view !== 'memory' && <div className="summary-work-bar" role="status"><BookOpen size={14} />
      <span>{state?.summary?.status === 'stopping' ? t("Gedächtnisberichte werden gestoppt") : t("openHiatus erstellt Gedächtnisberichte")}<small>{state?.summary?.completed} / {state?.summary?.total}{t(" gespeichert · ")}{state?.summary?.calls}{t(" Modellaufrufe")}</small></span>
      <button onClick={() => navigate('memory')}>{t("Fortschritt ansehen ")}<ArrowRight size={13} /></button>
    </div>}
    <div className="workspace-view conversation-view-host" hidden={view !== 'chat'}>
      <ConversationView session={session} active={view === 'chat'} showActivity={showActivity} onOpenTasks={() => navigate('tasks')} onOpenSettings={() => navigate('settings')} />
    </div>
    <div className="workspace-view tasks-view-host" hidden={view !== 'tasks'}>
      <TasksView jobs={state?.jobs ?? []} workItems={state?.workItems} onStop={id => window.openhiatus.stopJob(id)} onError={session.report} onConversation={() => navigate('chat')} />
    </div>
    <div className="workspace-view services-view-host" hidden={view !== 'services'}><ServicesView active={view === 'services'} onSettings={() => navigate('settings')} /></div>
    <div className="workspace-view memory-view-host" hidden={view !== 'memory'}><MemoryView state={state} active={view === 'memory'} navigationRequest={memoryNavigation} /></div>
    {skillsVisited && <div className="workspace-view skills-view-host" hidden={view !== 'skills'}><SkillsView onInsert={session.insertSkill}
      insertDisabledReason={session.skillInsertDisabledReason} favorites={state?.preferences.skillFavorites}
      onFavoriteChange={(path, level) => session.preference({ skillFavorites: withFavoriteLevel(state?.preferences.skillFavorites, path, level) })} /></div>}
    <div className="workspace-view settings-view-host" hidden={view !== 'settings'}>
      <SettingsView state={state} workBusy={session.workBusy} summaryInProgress={session.summaryInProgress} onOpenIdentity={openIdentity} onOpenOnboarding={() => navigate('onboarding', true)}
        onPreference={session.preference} onError={session.report} onNotice={session.setNotice}
        voice={{ phase: session.phase, seconds: session.seconds, devices: session.devices, audioBusy: session.audioBusy, speechReady: session.speechReady,
          startRecording: session.startRecording, testSpeech: session.testSpeech, cancelAudio: session.cancelAudio, clearSpeech: session.clearSpeech, stopEarcons: session.stopEarcons,
          saveSpeechKey: key => window.openhiatus.saveSpeechKey(key), removeSpeechKey: () => window.openhiatus.removeSpeechKey() }} />
    </div>
    {view === 'onboarding' && state && <OnboardingView state={state} session={session} fromStart={setupFromStart} onClose={() => navigate('chat')} />}
  </WorkspaceShell>;
}
