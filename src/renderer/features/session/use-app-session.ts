import { useCallback, useEffect, useRef, useState } from 'react';
import type { SkillEntry, Snapshot } from '../../../shared/contracts';
import { modelSelectionLabel } from '../../../shared/model-selection';
import { friendlyAudioError } from '../../audio';
import { useVoiceSession, voicePresence } from '../voice';
import { SessionOperations } from './session-operations';

const NOTICE_MS = 7000;
function hasOpenDialog() { return !!document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]'); }

export interface SessionNavigation { conversationVisible: boolean; openConversation(): void; openSettings(): void; }

/** Owns one application lifetime; visible workspaces never create or stop a runtime. */
export function useAppSession(navigation: SessionNavigation) {
  const navigationRef = useRef(navigation); navigationRef.current = navigation;
  const [state, setState] = useState<Snapshot>();
  const stateRef = useRef<Snapshot | undefined>(undefined);
  const [draft, setDraft] = useState('');
  const [transcript, setTranscript] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [pendingSend, setPendingSend] = useState(false);
  const operations = useRef<SessionOperations | undefined>(undefined);
  const [, refreshOperations] = useState(0);
  useEffect(() => {
    const lifetime = new SessionOperations(); operations.current = lifetime;
    return () => { lifetime.dispose(); if (operations.current === lifetime) operations.current = undefined; };
  }, []);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const focusDraft = useRef(false);
  const report = useCallback((err: unknown) => { setError(friendlyAudioError(err)); setNotice(''); }, []);
  const {
    phase, level, seconds, devices, getPhase, microphoneLevel, playbackLevel,
    speak, testSpeech, cue, cancelAudio, clearSpeech, stopEarcons, stop: stopVoice,
    startRecording: record,
  } = useVoiceSession(state, {
    error: report,
    notice: setNotice,
    inputStarted: () => { setError(''); setNotice(''); },
    transcribing: () => {},
    connectionsRequired: () => navigation.openSettings(),
    transcript: async (text, automatic) => {
      if (text && automatic) { setNotice(stateRef.current?.preferences.itSupporter ? 'Frage erkannt. Dein IT-Supporter hilft dir weiter.' : 'Sprache erkannt. openHiatus übernimmt.'); await send(false, text, true); }
      else if (text) {
        setDraft(current => current ? `${current}\n${text}` : text); setTranscript(true);
        setNotice('Dein Transkript ist bereit. Prüfe es kurz und sende mit F9 oder Strg + Enter.');
      }
      textarea.current?.focus();
    },
  });

  useEffect(() => {
    let disposed = false; let revisions = 0;
    if (!window.openhiatus) { setError('Die lokale App-Verbindung ist nicht verfügbar. Bitte starte openHiatus über die Anwendung.'); return; }
    const apply = (snapshot: Snapshot) => { if (!disposed) { stateRef.current = snapshot; setState(snapshot); } };
    const unsubscribe = window.openhiatus.subscribe(snapshot => { revisions++; apply(snapshot); });
    const revision = revisions;
    void window.openhiatus.snapshot().then(snapshot => { if (revision === revisions) apply(snapshot); }).catch(report);
    return () => { disposed = true; unsubscribe(); };
  }, [report]);

  useEffect(() => {
    if (!notice || error) return;
    const timeout = setTimeout(() => setNotice(current => current === notice ? '' : current), NOTICE_MS);
    return () => clearTimeout(timeout);
  }, [notice, error]);

  const stopAll = useCallback(async () => {
    await operations.current?.stop(() => window.openhiatus.stop(), {
      started: () => { stopVoice(); setNotice('Stopp angefordert. Es werden keine weiteren Sprachaktionen gestartet.'); },
      failed: report, settled: () => refreshOperations(current => current + 1),
    });
  }, [stopVoice, report]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); void stopAll(); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [stopAll]);
  useEffect(() => window.openhiatus?.onStop(() => { void stopAll(); }), [stopAll]);

  async function action(name: string, fn: () => Promise<void>, success?: string, onSuccess?: () => void) {
    await operations.current?.action(name, fn, {
      started: () => { setBusyAction(name); setError(''); setNotice(''); },
      succeeded: () => { onSuccess?.(); if (success) setNotice(success); },
      failed: report, settled: () => setBusyAction(''), cancelled: () => setBusyAction(''),
    });
  }
  function sendBlockedReason(globalShortcut = false, submittedText = draft, voiceInput = false): string {
    const text = submittedText.trim();
    const current = stateRef.current;
    if (globalShortcut && hasOpenDialog()) return 'Schließe zuerst den offenen Dialog in openHiatus. Drücke danach erneut F9.';
    if (!current) return 'openHiatus wird noch verbunden. Drücke danach erneut F9.';
    if (!current.preferences.fullAccessAcknowledged) return 'Bestätige zuerst den Vollzugriff von openHiatus.';
    if (current.preferences.itSupporter && !voiceInput && !transcript) return 'Im IT-Supporter-Modus stellst du deine Frage mit F8 oder der Sprechtaste. Das Protokoll dient zum Nachlesen.';
    if (operations.current?.isStopping() || current.task.status === 'stopping' || current.summary?.status === 'stopping') return 'Bitte warte auf den bestätigten Stopp und drücke danach erneut F9.';
    if (getPhase() === 'opening') return 'Das Mikrofon wird geöffnet. Beende die Aufnahme mit F8 und drücke erst nach dem Transkript F9.';
    if (getPhase() === 'recording' || getPhase() === 'mic-test') return 'Die Aufnahme läuft. Beende sie mit F8 und drücke erst nach dem Transkript F9.';
    if (getPhase() === 'transcribing') return 'Deine Sprache wird noch erkannt. Prüfe danach den Text und drücke erneut F9.';
    if (operations.current?.isSending()) return 'Der Auftrag wird bereits gesendet.';
    if (operations.current?.actionName() === 'new') return 'Das neue Gespräch wird vorbereitet. Drücke danach erneut F9.';
    if (current.summary?.mode === 'manual' && ['running', 'stopping'].includes(current.summary.status)) return 'openHiatus erstellt Gedächtnisberichte. Warte oder stoppe sie und drücke danach erneut F9.';
    if (!text) return 'Es gibt noch keinen Text zum Senden. Mit F8 kannst du eine Aufnahme beginnen.';
    if (current.connections.agent !== 'ready') return 'Richte zuerst einen Modellanbieter in den Einstellungen ein.';
    return '';
  }
  async function send(globalShortcut = false, submittedText = draft, voiceInput = false) {
    const lifetime = operations.current;
    if (!lifetime) return;
    const blocked = sendBlockedReason(globalShortcut, submittedText, voiceInput);
    if (blocked) {
      if (submittedText !== draft) { setDraft(current => current ? `${current}\n${submittedText}` : submittedText); setTranscript(true); setNotice(blocked); }
      if (globalShortcut) setNotice(blocked);
      return;
    }
    const text = submittedText.trim();
    const retainTranscript = () => { if (submittedText !== draft) { setDraft(current => current ? `${current}\n${text}` : text); setTranscript(true); } };
    await lifetime.send(text, requestId => window.openhiatus.send(text, requestId), {
      started: () => { setPendingSend(true); setError(''); setNotice(''); cancelAudio(); },
      succeeded: () => {
        setDraft(current => current.trim() === text ? '' : current); setTranscript(false);
        if (submittedText === draft) cue('sent');
      },
      failed: err => { retainTranscript(); report(err); },
      settled: () => { setPendingSend(false); if (navigationRef.current.conversationVisible) textarea.current?.focus(); },
      cancelled: () => { retainTranscript(); setPendingSend(false); },
    });
  }
  function startRecording(test = false) {
    if (operations.current?.isStopping()) return Promise.resolve();
    if (operations.current?.actionName() === 'new' && !['opening', 'recording', 'mic-test'].includes(getPhase())) return Promise.resolve();
    return record(test);
  }
  function preference(value: Parameters<typeof window.openhiatus.savePreferences>[0]) { void window.openhiatus.savePreferences(value).catch(report); }

  function insertSkill(skill: SkillEntry) {
    if (!skill.enabled || operations.current?.actionName() === 'new' || ['opening', 'recording', 'mic-test', 'transcribing'].includes(getPhase())) return;
    setDraft(current => current.toLocaleLowerCase('de').includes(skill.path.toLocaleLowerCase('de')) ? current : `${current}${current && !current.endsWith('\n') ? '\n' : ''}Nutze den Skill "${skill.path}".`);
    focusDraft.current = true; navigation.openConversation();
    setNotice(`Der Skill „${skill.displayName || skill.name}“ steht in deinem Entwurf. Ergänze deinen Auftrag und sende ihn, wenn du bereit bist.`);
  }

  const acknowledged = !!state?.preferences.fullAccessAcknowledged;
  const taskBusy = state?.task.status === 'running' || state?.task.status === 'stopping' || pendingSend || operations.current?.isStopping() === true;
  const jobsBusy = !!state?.jobs?.some(job => ['queued', 'running', 'stopping'].includes(job.status) || job.runtimeRetained);
  const workBusy = taskBusy || jobsBusy;
  const voiceConversation = state?.preferences.voiceConversation !== false;
  const summaryInProgress = state?.summary?.status === 'running' || state?.summary?.status === 'stopping';
  const manualSummaryBusy = summaryInProgress && state?.summary?.mode === 'manual';
  const connected = state?.connections.agent === 'ready';
  const ready = connected && acknowledged;
  const speechReady = state && state.connections.speech !== 'missing';
  const isRecording = phase === 'recording' || phase === 'mic-test';
  const audioBusy = phase !== 'idle' && phase !== 'playing';
  const taskStatus = state?.task.status ?? 'idle';
  const currentModel = state?.models.find(model => model.id === state.preferences.model)?.label ?? modelSelectionLabel(state?.preferences.model ?? '');
  const currentDialogModel = state?.models.find(model => model.id === state.preferences.dialogModel)?.label ?? modelSelectionLabel(state?.preferences.dialogModel ?? '');
  const voiceStatus = { idle: 'Sprachgespräch', opening: 'Mikrofon wird geöffnet', recording: 'Ich höre zu', 'mic-test': 'Mikrofontest', transcribing: 'Sprache wird erkannt', synthesizing: 'Antwort wird vertont', playing: 'Antwort wird vorgelesen' }[phase];
  const activeJobs = state?.jobs?.filter(job => ['queued', 'running', 'stopping'].includes(job.status)).length ?? 0;
  const skillInsertDisabledReason = state?.preferences.itSupporter ? 'Im IT-Supporter-Modus nennst du den gewünschten Skill per Sprache. Zum Schreiben kannst du den Modus in Einstellungen → Bedienung ausschalten.' : busyAction === 'new' ? 'Das neue Gespräch wird vorbereitet. Danach kannst du einen Skill ergänzen.' : ['opening', 'recording', 'mic-test', 'transcribing'].includes(phase) ? 'Beende zuerst die Sprachaufnahme und warte auf das Transkript. Danach kannst du einen Skill ergänzen.' : undefined;
  const overlayPhase = voicePresence(phase, pendingSend, transcript && !!draft.trim()).phase;
  useEffect(() => {
    window.openhiatus?.publishActivityPresence({ phase: overlayPhase });
  }, [overlayPhase]);
  useEffect(() => () => window.openhiatus?.publishActivityPresence({ phase: 'idle' }), []);

  useEffect(() => {
    if (!navigation.conversationVisible || !focusDraft.current || !textarea.current || textarea.current.disabled) return;
    textarea.current.focus();
    textarea.current.setSelectionRange(textarea.current.value.length, textarea.current.value.length);
    textarea.current.scrollTop = textarea.current.scrollHeight;
    focusDraft.current = false;
  }, [navigation.conversationVisible, draft, manualSummaryBusy]);

  useEffect(() => {
    const toggleRecording = () => {
      if (hasOpenDialog()) return;
      navigation.openConversation();
      void startRecording();
    };
    const submitDraft = () => {
      if (!hasOpenDialog()) navigation.openConversation();
      void send(true);
    };
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229) return;
      if (event.key === 'F9' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        event.preventDefault(); submitDraft(); return;
      }
      if (hasOpenDialog()) return;
      if (event.key === 'F8' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        event.preventDefault(); toggleRecording(); return;
      }
      if (!navigation.conversationVisible || event.key !== 'Enter' || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"])') && target !== textarea.current) return;
      event.preventDefault(); void send();
    };
    const unsubscribe = window.openhiatus?.onToggleRecording(toggleRecording);
    const unsubscribeSubmit = window.openhiatus?.onSubmitDraft(submitDraft);
    window.addEventListener('keydown', key);
    return () => { unsubscribe?.(); unsubscribeSubmit?.(); window.removeEventListener('keydown', key); };
  }, [navigation.conversationVisible, send, startRecording]);

  async function newConversation() {
    await action('new', () => { clearSpeech(); cancelAudio(); return window.openhiatus.newConversation(); }, undefined, () => { setDraft(''); navigationRef.current.openConversation(); });
  }

  return { state, draft, setDraft, transcript, notice, setNotice, error, setError, busyAction, pendingSend,
    report, phase, level, seconds, devices, microphoneLevel, playbackLevel, speak, testSpeech, cancelAudio, clearSpeech, stopEarcons,
    stopAll, send, startRecording, preference, insertSkill, action, newConversation, composerRef: textarea,
    acknowledged, taskBusy, jobsBusy, workBusy, voiceConversation, summaryInProgress, manualSummaryBusy, connected, ready,
    speechReady: !!speechReady, isRecording, audioBusy, taskStatus, currentModel, currentDialogModel, voiceStatus, activeJobs,
    skillInsertDisabledReason };
}

export type AppSession = ReturnType<typeof useAppSession>;
