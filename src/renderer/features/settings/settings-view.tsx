import { localized, t } from '../../../shared/i18n';
import { UI_LANGUAGES, parseUiLanguage } from '../../../shared/ui-language';
import { AudioDeviceSelect } from './audio-device-select';
import { isFastModelSelection, modelOptionLabel } from '../../../shared/model-selection';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { AudioLines, ChevronDown, Headphones, KeyRound, Keyboard, LoaderCircle, Mic, Monitor, SlidersHorizontal, Square, UserRound, Volume2 } from 'lucide-react';
import type { PreferencesPatch, Snapshot } from '../../../shared/contracts';
import { COMPUTER_DETAIL_FACTORS, COMPUTER_OVERVIEW_FACTORS } from '../../../shared/computer-views';
import { COMPUTER_IMAGE_RETENTION_CALLS, COMPUTER_WORKING_MEMORY_CALLS } from '../../../shared/computer-task-settings';
import { ACTIVITY_OVERLAY_DEFAULT_SIZE, type SidebarMode } from '../../../shared/workspace-preferences';
import { ProvidersView } from '../../ProvidersView';
import type { AudioPhase } from '../voice';
import { AutostartCard } from './autostart-card';

export interface SettingsVoicePort {
  phase: AudioPhase;
  seconds: number;
  devices: readonly MediaDeviceInfo[];
  audioBusy: boolean;
  speechReady: boolean;
  startRecording(test?: boolean): Promise<void>;
  testSpeech(): Promise<void>;
  cancelAudio(): void;
  clearSpeech(): void;
  stopEarcons(): void;
  saveSpeechKey(key: string): Promise<void>;
  removeSpeechKey(): Promise<void>;
}

export interface SettingsViewProps {
  state?: Snapshot;
  navigationRequest?: { tab: SettingsTab; requestId: number };
  onOpenIdentity?(): void;
  workBusy: boolean;
  summaryInProgress: boolean;
  voice: SettingsVoicePort;
  onPreference(value: PreferencesPatch): void | Promise<void>;
  onError(error: unknown): void;
  onNotice(message: string): void;
}

const tabs = localized([
  { id: 'models', label: 'Modelle & Zugänge', icon: KeyRound },
  { id: 'speech', label: 'Sprache & Geräte', icon: AudioLines },
  { id: 'personality', label: 'Persönlichkeit', icon: UserRound },
  { id: 'behavior', label: 'Bedienung', icon: SlidersHorizontal },
] as const);
export type SettingsTab = typeof tabs[number]['id'];
const phaseLabels: Record<AudioPhase, string> = localized({
  idle: 'Audio bereit', opening: 'Mikrofon wird geöffnet', recording: 'Aufnahme läuft', 'mic-test': 'Mikrofontest',
  transcribing: 'Sprache wird erkannt', synthesizing: 'Ausgabe wird vertont', playing: 'Ausgabe wird abgespielt',
});

function Spinner() { return <LoaderCircle size={15} className="spin" aria-hidden="true" />; }

/** The App keeps this feature mounted: tabs and unsaved access fields belong to this view. */
export function SettingsView({ state, navigationRequest, onOpenIdentity, workBusy, summaryInProgress, voice, onPreference, onError, onNotice }: SettingsViewProps) {
  const [tab, setTab] = useState<SettingsTab>(navigationRequest?.tab ?? 'models');
  const [speechKey, setSpeechKey] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const actionPending = useRef(false);
  const tabButtons = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => {
    if (!navigationRequest) return;
    const index = tabs.findIndex(destination => destination.id === navigationRequest.tab);
    setTab(navigationRequest.tab); tabButtons.current[index]?.focus();
  }, [navigationRequest?.tab, navigationRequest?.requestId]);
  const id = useId();
  const recording = voice.phase === 'recording' || voice.phase === 'mic-test';
  const ready = state !== undefined;
  const overviewFactor = state?.preferences.computerOverviewScaleDivisor ?? 1;
  const detailFactor = state?.preferences.computerDetailScaleDivisor ?? 1;
  const imageRetention = state?.preferences.computerImageRetentionCalls ?? 0;
  const workingMemory = state?.preferences.computerWorkingMemoryCalls ?? 0;
  const computerModel = state?.preferences.computerModel ?? '';
  // This experimental role keeps its existing independent Fast switch.
  const computerModels = (state?.models ?? []).filter(model => !isFastModelSelection(model.id));
  const computerConfigured = computerModels.some(model => model.id === computerModel);
  const computerSettingsBusy = !ready || workBusy || summaryInProgress;

  function preference(value: PreferencesPatch): void {
    try { void Promise.resolve(onPreference(value)).catch(onError); } catch (error) { onError(error); }
  }
  function voiceAction(callback: () => Promise<void>): void {
    try { void callback().catch(onError); } catch (error) { onError(error); }
  }
  async function action(name: string, callback: () => Promise<void>, notice: string): Promise<void> {
    if (actionPending.current) return;
    actionPending.current = true; setBusyAction(name); onNotice('');
    try { await callback(); onNotice(notice); }
    catch (error) { onError(error); }
    finally { actionPending.current = false; setBusyAction(''); }
  }
  function changeTab(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault(); setTab(tabs[next].id); tabButtons.current[next]?.focus();
  }

  return <main className="settings-feature settings-scroll" aria-label={t("Einstellungen")}>
    <div className="settings-content">
      <header className="settings-feature-heading"><div className="eyebrow">{t("DEIN openHiatus")}</div><h1>{t("Deine Einstellungen.")}</h1><p className="settings-lead">{t("Modellzugänge, Sprache, Persönlichkeit und Bedienung an einem Ort.")}</p></header>
      <section className="settings-card interface-language-card">
        <label className="field-label" htmlFor={`${id}-ui-language`}>{t('Sprache der Oberfläche')}</label>
        <div className="select-wrap"><select id={`${id}-ui-language`} value={state?.preferences.uiLanguage ?? 'de'} disabled={!ready}
          onChange={event => preference({ uiLanguage: parseUiLanguage(event.target.value) })}>
          {UI_LANGUAGES.map(language => <option key={language.id} value={language.id} lang={language.id}>{language.name}</option>)}
        </select><ChevronDown size={15} aria-hidden="true" /></div>
        <p className="billing-note">{t('Die Sprache ändert sich sofort. Deine Nachrichten, Dateien und laufenden Aufträge bleiben erhalten.')}</p>
      </section>
      <div className="settings-tabs" role="tablist" aria-label={t("Einstellungsbereiche")}>
        {tabs.map(({ id: value, label, icon: Icon }, index) => <button key={value} ref={button => { tabButtons.current[index] = button; }}
          id={`${id}-tab-${value}`} role="tab" aria-selected={tab === value} aria-controls={`${id}-panel-${value}`} tabIndex={tab === value ? 0 : -1}
          onClick={() => setTab(value)} onKeyDown={event => changeTab(event, index)}><Icon size={17} aria-hidden="true" /><span>{label}</span></button>)}
      </div>

      <section id={`${id}-panel-models`} role="tabpanel" aria-labelledby={`${id}-tab-models`} hidden={tab !== 'models'} className="settings-tab-panel">
        <p className="settings-panel-intro">{t("Wähle Modelle für Gespräch, Arbeit und Gedächtnis. Deine Zugänge werden lokal geschützt gespeichert.")}</p>
        <ProvidersView state={state} disabled={!ready || workBusy || summaryInProgress} onError={onError} onPreference={preference} />
        <div className="settings-footnote"><KeyRound size={17} aria-hidden="true" /><p>{t("Gespeicherte API-Keys werden nicht mehr angezeigt. Modelle nutzen den für ihre Rolle ausgewählten Anbieter.")}</p></div>
      </section>

      <section id={`${id}-panel-speech`} role="tabpanel" aria-labelledby={`${id}-tab-speech`} hidden={tab !== 'speech'} className="settings-tab-panel">
        <p className="settings-panel-intro">{t("Deine Sprachverbindung und die Audiogeräte dieses Rechners.")}</p>
        <section className="settings-card settings-speech-access">
          <div className="settings-card-head"><span className="service-icon speech"><AudioLines size={22} aria-hidden="true" /></span><div><h2>{t("Stimme & Gehör")}</h2><p>{t("Spracherkennung und Sprachausgabe mit Inworld")}</p></div>
            <span className={`service-status ${voice.speechReady ? 'good' : ''}`}><span className="status-dot" />{state?.connections.speech === 'verified' ? t("Ausgabe geprüft") : voice.speechReady ? t("Key gespeichert") : t("Nicht verbunden")}</span></div>
          <label className="field-label" htmlFor={`${id}-speech-key`}>{t("Inworld-Zugang (Base64) ")}{voice.speechReady && <span className="muted">{t("· zum Ersetzen neu eingeben")}</span>}</label>
          <div className="input-action"><input id={`${id}-speech-key`} type="password" autoComplete="off" spellCheck={false} value={speechKey} disabled={!ready || !!busyAction}
            placeholder={voice.speechReady ? t("Zugang geschützt gespeichert") : t("Base64-Zugangsdaten aus dem Inworld-Portal")} onChange={event => setSpeechKey(event.target.value)} />
            <button className="secondary-button" disabled={!ready || !speechKey.trim() || !!busyAction} onClick={() => {
              const submitted = speechKey.trim();
              void action('speech-key', async () => { await voice.saveSpeechKey(submitted); setSpeechKey(''); }, t("Inworld-Zugang gespeichert. Prüfe jetzt die Sprachausgabe."));
            }}>{busyAction === 'speech-key' ? <Spinner /> : <KeyRound size={15} aria-hidden="true" />}{t(" Speichern")}</button></div>
          <div className="provider-models"><span>STT <strong>inworld/inworld-stt-1</strong></span><span>TTS <strong>inworld-tts-2</strong></span></div>
          <p className="billing-note">{t("Sprache wird separat über dein Inworld-Konto abgerechnet. Aufnahme und Antworttext werden für die jeweilige Funktion an Inworld gesendet. Der Mikrofontest bleibt lokal.")}</p>
          {voice.speechReady && <button className="text-button subtle-danger" disabled={workBusy || voice.audioBusy || !!busyAction} onClick={() => void action('remove-speech', async () => {
            voice.clearSpeech(); voice.cancelAudio(); await voice.removeSpeechKey();
          }, t("Inworld-Zugang entfernt."))}>{busyAction === 'remove-speech' && <Spinner />}{t("Gespeicherten Sprachzugang entfernen")}</button>}
        </section>

        <section className="settings-card settings-audio-devices">
          <div className="settings-card-head"><span className="service-icon"><Headphones size={22} aria-hidden="true" /></span><div><h2>{t("Mikrofon & Lautsprecher")}</h2><p>{t("Geräte auswählen und die Verbindung prüfen")}</p></div></div>
          <div className="audio-device-grid"><div><label className="field-label" htmlFor={`${id}-microphone`}><Mic size={15} aria-hidden="true" />{t(" Mikrofon")}</label>
            <AudioDeviceSelect id={`${id}-microphone`} kind="audioinput" preferences={state?.preferences} devices={voice.devices} disabled={!ready || voice.audioBusy} onChange={preference} />
            <button className="device-test" disabled={!ready || workBusy || (voice.audioBusy && voice.phase !== 'mic-test')} onClick={() => voiceAction(() => voice.startRecording(true))}>
              {voice.phase === 'mic-test' ? <Square size={14} aria-hidden="true" /> : <Mic size={14} aria-hidden="true" />}{voice.phase === 'mic-test' ? t("Test beenden · {0}s", voice.seconds) : t("Mikrofon lokal testen")}</button></div>
            <div><label className="field-label" htmlFor={`${id}-speakers`}><Headphones size={15} aria-hidden="true" />{t(" Lautsprecher")}</label>
              <AudioDeviceSelect id={`${id}-speakers`} kind="audiooutput" preferences={state?.preferences} devices={voice.devices} disabled={!ready || voice.phase !== 'idle'} onChange={preference} />
              <button className="device-test" disabled={!voice.speechReady || workBusy || voice.audioBusy} onClick={() => voiceAction(() => voice.testSpeech())}>{voice.phase === 'synthesizing' ? <Spinner /> : <Volume2 size={14} aria-hidden="true" />}{t(" Sprachausgabe testen")}</button></div></div>
          {voice.phase !== 'idle' && <div className="settings-audio-state"><AudioLines size={16} aria-hidden="true" /><span role="status">{phaseLabels[voice.phase]}{recording ? ` · ${voice.seconds}s` : ''}</span><button className="text-button" onClick={() => voice.cancelAudio()}>{t("Audio beenden")}</button></div>}
          <p className="billing-note">{t("Die Geräteauswahl wird automatisch gespeichert. Getrennte Geräte bleiben vorgemerkt und werden beim Wiederverbinden erneut verwendet. Nur Windows-Standardgerät folgt der aktuellen Windows-Auswahl.")}</p>
          <p className="billing-note">{t("Gerätenamen erscheinen, sobald der Browser auf das Mikrofon zugreifen darf. Der lokale Mikrofontest benötigt keinen Sprachzugang.")}</p>
        </section>
      </section>

      <section id={`${id}-panel-personality`} role="tabpanel" aria-labelledby={`${id}-tab-personality`} hidden={tab !== 'personality'} className="settings-tab-panel">
        <section className="settings-card"><h2>{t("Agent & Nutzer")}</h2><p>{t("Rufname, Persönlichkeit, deine Angaben und Langzeitwissen findest du gemeinsam unter Gedächtnis → Agent & Nutzer.")}</p>
          <p className="billing-note">{t("SOUL.md · IDENTITY.md · USER.md · MEMORY.md. Dort liegen auch deine bisherigen Stilvorlagen.")}</p>
          <button className="secondary-button" disabled={!onOpenIdentity} onClick={onOpenIdentity}>{t("Agent & Nutzer öffnen")}</button></section>
      </section>

      <section id={`${id}-panel-behavior`} role="tabpanel" aria-labelledby={`${id}-tab-behavior`} hidden={tab !== 'behavior'} className="settings-tab-panel">
        <p className="settings-panel-intro">{t("So hörst du Antworten und übergibst neue Aufträge.")}</p>
        <AutostartCard active={tab === 'behavior' && ready} onError={onError} />
        <section className="settings-card settings-supporter">
          <div className="settings-card-head"><span className="service-icon"><Monitor size={22} aria-hidden="true" /></span><div><h2>{t("Hilfe bei der PC-Bedienung")}</h2><p>{t("Du bedienst den PC, dein Assistent leitet dich an.")}</p></div></div>
          <label className="settings-toggle"><span><strong>{t("IT-Supporter")}</strong><small>{t("Versteht Wünsche vorrangig als Bedarf an Anleitung. Zeigt passende Stellen auf dem Bildschirm und erklärt den nächsten Schritt.")}</small></span>
            <input type="checkbox" checked={state?.preferences.itSupporter === true} disabled={!ready} onChange={event => preference({ itSupporter: event.target.checked })} /></label>
          <p className="billing-note">{t("Die Rolle gilt ab der nächsten Nachricht für die gesamte Unterstützung, unabhängig von bestimmten Wörtern. Ausführen übernimmt er erst auf ausdrücklichen Wunsch. Antworten kommen über Sprache und Desktop-Markierungen; das Protokoll hält den Ablauf zum Nachlesen fest. Mikrofon und Sprachausgabe richtest du unter Sprache & Geräte ein.")}</p>
        </section>
        <section className="settings-card settings-workspace">
          <div className="settings-card-head"><span className="service-icon"><Monitor size={22} aria-hidden="true" /></span><div><h2>{t("Oberfläche & Arbeitsanzeige")}</h2><p>{t("Navigation und sichtbare Arbeit im Hintergrund")}</p></div></div>
          <label className="field-label" htmlFor={`${id}-sidebar-mode`}>{t("Linke Navigation")}</label>
          <div className="select-wrap"><select id={`${id}-sidebar-mode`} value={state?.preferences.sidebarMode ?? 'auto'} disabled={!ready}
            aria-describedby={`${id}-sidebar-mode-description`} onChange={event => preference({ sidebarMode: event.target.value as SidebarMode })}>
            <option value="auto">{t("Automatisch nach Fensterbreite")}</option><option value="expanded">{t("Ausgeklappt")}</option><option value="collapsed">{t("Eingeklappt")}</option>
          </select><ChevronDown size={15} aria-hidden="true" /></div>
          <p className="billing-note" id={`${id}-sidebar-mode-description`}>{t("Die Automatik zeigt bei wenig Platz nur die Symbole. Unten rechts an der Leiste kannst du die Navigation auch selbst ein- und ausklappen.")}</p>
          <p className="billing-note">{t("Bei PC-Übernahme zeigt openHiatus immer einen auffälligen Bildschirmrand. Deine Maus- und Tastatureingaben sind dann gesperrt. Esc stoppt den Agenten und gibt den Arbeitsplatz wieder frei. Reine Hintergrundarbeit sperrt keine Eingaben.")}</p>
          <label className="settings-toggle"><span><strong>{t("Arbeitsanzeige im Hintergrund")}</strong><small>{t("Zeigt das runde Symbol beim Zuhören, Denken und Sprechen, solange ein anderes Fenster aktiv ist. Die Übernahmeanzeige bleibt unabhängig davon aktiv.")}</small></span>
            <input type="checkbox" checked={state?.preferences.activityOverlayEnabled === true} disabled={!ready} onChange={event => preference({ activityOverlayEnabled: event.target.checked })} /></label>
          <label className="field-label" htmlFor={`${id}-overlay-size`}>{t("Größe der Arbeitsanzeige")}</label>
          <div className="select-wrap"><select id={`${id}-overlay-size`} value={state?.preferences.activityOverlaySize ?? ACTIVITY_OVERLAY_DEFAULT_SIZE} disabled={!ready}
            onChange={event => preference({ activityOverlaySize: Number(event.target.value) })}>
            {[...new Set([96, ACTIVITY_OVERLAY_DEFAULT_SIZE, 224, 320, state?.preferences.activityOverlaySize ?? ACTIVITY_OVERLAY_DEFAULT_SIZE])].sort((a, b) => a - b)
              .map(size => <option key={size} value={size}>{size} px{size === ACTIVITY_OVERLAY_DEFAULT_SIZE ? t(" (Standard)") : ''}</option>)}
          </select><ChevronDown size={15} aria-hidden="true" /></div>
          <p className="billing-note">{t("Ziehe die Griffleiste rechts am Symbol nach unten zum Vergrößern und nach oben zum Verkleinern. Die Größe bleibt gespeichert.")}</p>
          <div className="button-row"><span className="billing-note">{t("Größe: ")}{state?.preferences.activityOverlaySize ?? ACTIVITY_OVERLAY_DEFAULT_SIZE} px</span>
            <button className="secondary-button" disabled={!ready || (state?.preferences.activityOverlaySize ?? ACTIVITY_OVERLAY_DEFAULT_SIZE) === ACTIVITY_OVERLAY_DEFAULT_SIZE}
              onClick={() => preference({ activityOverlaySize: ACTIVITY_OVERLAY_DEFAULT_SIZE })}>{t("Größe zurücksetzen")}</button></div>
        </section>
        <section className="settings-card settings-behavior">
          <div className="settings-card-head"><span className="service-icon"><SlidersHorizontal size={22} aria-hidden="true" /></span><div><h2>{t("Sprache & Rückmeldungen")}</h2><p>{t("Änderungen werden direkt übernommen.")}</p></div></div>
          <label className="settings-toggle"><span><strong>{t("Antworten vorlesen")}</strong><small>{t("openHiatus liest Antworten über deinen Sprachzugang vor.")}</small></span><input type="checkbox" checked={state?.preferences.speakReplies ?? false} disabled={!ready} onChange={event => {
            if (!event.target.checked) { voice.clearSpeech(); voice.cancelAudio(); } preference({ speakReplies: event.target.checked });
          }} /></label>
          <label className="settings-toggle"><span><strong>{t("Signaltöne")}</strong><small>{t("Kurze Töne begleiten Aufnahme, Versand und Aufgabenstatus.")}</small></span><input type="checkbox" checked={state?.preferences.earcons !== false} disabled={!ready} onChange={event => {
            if (!event.target.checked) voice.stopEarcons(); preference({ earcons: event.target.checked });
          }} /></label>
          <label className="settings-toggle"><span><strong>{t("Sprachgespräch")}</strong><small>{t("Nach Ende der Aufnahme wird das erkannte Gesagte automatisch gesendet. Ausgeschaltet kannst du das Transkript vor dem Senden prüfen.")}</small></span><input type="checkbox" checked={state?.preferences.voiceConversation !== false} disabled={!ready} onChange={event => preference({ voiceConversation: event.target.checked })} /></label>
        </section>
        <section className="settings-card settings-computer">
          <div className="settings-card-head"><span className="service-icon"><Monitor size={22} aria-hidden="true" /></span><div><h2>{t("Bildschirmbilder")}</h2><p>{t("Experimentell · gilt ab dem nächsten Desktop-Auftrag.")}</p></div></div>
          <label className="field-label" htmlFor={`${id}-computer-overview`}>{t("Auflösung der Übersicht")}</label>
          <div className="select-wrap"><select id={`${id}-computer-overview`} value={overviewFactor} disabled={!ready}
            aria-describedby={`${id}-computer-overview-description`} onChange={event => preference({ computerOverviewScaleDivisor: Number(event.target.value) })}>
            {COMPUTER_OVERVIEW_FACTORS.map(factor => <option key={factor} value={factor}>{factor === 1 ? t("Vollbild (1:1)") : t("Übersicht 1:{0}", factor)}</option>)}
            {!COMPUTER_OVERVIEW_FACTORS.some(factor => factor === overviewFactor) && <option value={overviewFactor}>{t("Übersicht 1:")}{overviewFactor}{t(" (aktuell)")}</option>}
          </select><ChevronDown size={15} aria-hidden="true" /></div>
          <p className="billing-note" id={`${id}-computer-overview-description`}>{t("Das bedienende Modell erhält die Übersicht und bei Bedarf höchstens einen Detailausschnitt. Die Ausschnittgröße passt sich automatisch an die Bildschirmauflösung an. Eine kleinere Übersicht garantiert keine schnellere Bearbeitung.")}</p>
          <label className="field-label" htmlFor={`${id}-computer-detail`}>{t("Auflösung der Details")}</label>
          <div className="select-wrap"><select id={`${id}-computer-detail`} value={detailFactor} disabled={!ready}
            aria-describedby={`${id}-computer-detail-description`} onChange={event => preference({ computerDetailScaleDivisor: Number(event.target.value) })}>
            {COMPUTER_DETAIL_FACTORS.map(factor => <option key={factor} value={factor}>{factor === 1 ? t("Original (1:1)") : t("Details 1:{0}", factor)}</option>)}
          </select><ChevronDown size={15} aria-hidden="true" /></div>
          <p className="billing-note" id={`${id}-computer-detail-description`}>{t("Bei 1:2 sind Breite und Höhe der automatischen Detailansicht halbiert, bei 1:4 geviertelt. Originalausschnitte bleiben auf Abruf verfügbar.")}</p>
          <label className="field-label" htmlFor={`${id}-computer-image-retention`}>{t("Bildaufbewahrung im Modellkontext")}</label>
          <div className="select-wrap"><select id={`${id}-computer-image-retention`} value={imageRetention} disabled={!ready}
            aria-describedby={`${id}-computer-image-retention-description`} onChange={event => preference({ computerImageRetentionCalls: Number(event.target.value) })}>
            {COMPUTER_IMAGE_RETENTION_CALLS.map(calls => <option key={calls} value={calls}>{calls === 0 ? t("Unbegrenzt (bisheriges Verhalten)") : calls === 1 ? t("Letzte Modellanfrage") : t("Letzte {0} Modellanfragen", calls)}</option>)}
            {!COMPUTER_IMAGE_RETENTION_CALLS.some(calls => calls === imageRetention) && <option value={imageRetention}>{t("Letzte ")}{imageRetention}{t(" Modellanfragen (aktuell)")}</option>}
          </select><ChevronDown size={15} aria-hidden="true" /></div>
          <p className="billing-note" id={`${id}-computer-image-retention-description`}>{t("Zählt Modellanfragen, keine Klicks. Die Auswahl begrenzt auch die Zahl der Aufnahmen. Ältere Bilder werden nicht mehr mitgeschickt. Das Modell kann wichtige Beobachtungen kurz im Text festhalten; nur die aktuelle Arbeitsnotiz bleibt erhalten (max. 240 Zeichen). Die Einstellungen gelten auch ohne eigenes Computer-Modell.")}</p>
          <label className="field-label" htmlFor={`${id}-computer-working-memory`}>{t("Arbeitsgedächtnis im Modellkontext")}</label>
          <div className="select-wrap"><select id={`${id}-computer-working-memory`} value={workingMemory} disabled={!ready}
            aria-describedby={`${id}-computer-working-memory-description`} onChange={event => preference({ computerWorkingMemoryCalls: Number(event.target.value) })}>
            {COMPUTER_WORKING_MEMORY_CALLS.map(calls => <option key={calls} value={calls}>{calls === 0 ? t("Bisherige Bedienhistorie") : t("Letzte {0} Modellanfragen", calls)}</option>)}
          </select><ChevronDown size={15} aria-hidden="true" /></div>
          <p className="billing-note" id={`${id}-computer-working-memory-description`}>{t("Ältere Computeraufrufe und ihre Ergebnisse werden nach dieser Zahl von Modellanfragen nicht mehr mitgeschickt. Die aktuelle Kurznotiz (max. 240 Zeichen) wird im bestehenden Aufruf erneuert, ohne zusätzliche Zusammenfassungsanfrage. Nutzerauftrag, Nutzertexte und Dateien bleiben erhalten. Neue Aufträge übernehmen die ausgewählte Grenze; laufende Aufträge behalten ihre Einstellung.")}</p>
          <label className="settings-toggle"><span><strong>{t("Eigenes Computer-Modell verwenden")}</strong><small>{t("Das Arbeitsmodell plant und prüft. Das Computer-Modell bekommt begrenzte Bedienaufträge und die Bildschirmbilder.")}</small></span><input type="checkbox" checked={state?.preferences.computerDelegationEnabled === true}
            disabled={computerSettingsBusy || !computerConfigured} aria-describedby={`${id}-computer-model-description`} onChange={event => preference({ computerDelegationEnabled: event.target.checked })} /></label>
          <label className="field-label" htmlFor={`${id}-computer-model`}>{t("Computer-Modell")}</label>
          <div className="select-wrap"><select id={`${id}-computer-model`} value={computerModel} disabled={computerSettingsBusy || !computerModels.length}
            aria-describedby={`${id}-computer-model-description`} onChange={event => preference({ computerModel: event.target.value, ...(event.target.value === '' ? { computerDelegationEnabled: false } : {}) })}>
            <option value="">{computerModels.length ? t("Computer-Modell auswählen") : t("Zuerst einen Anbieter einrichten")}</option>
            {computerModel && !computerConfigured && <option value={computerModel}>{computerModel}{t(" – nicht verfügbar")}</option>}
            {computerModels.map(model => <option key={model.id} value={model.id}>{modelOptionLabel(model)}</option>)}
          </select><ChevronDown size={15} aria-hidden="true" /></div>
          <label className="settings-toggle"><span><strong>{t("Fast für das Computer-Modell")}</strong><small>{t("Fordert die schnelle Verarbeitung beim Modellanbieter an.")}</small></span><input type="checkbox" checked={state?.preferences.computerFast !== false}
            disabled={computerSettingsBusy || !computerConfigured} onChange={event => preference({ computerFast: event.target.checked })} /></label>
          <p className="billing-note" id={`${id}-computer-model-description`}>{t("Die getrennte Bedienung ist freiwillig und gilt ab dem nächsten Auftrag. Ohne Aktivierung bedient das Arbeitsmodell den Computer. Wähle ein Modell, das Bilder und Werkzeuge unterstützt. Fast wird separat angefordert; bei API-Zugängen können dafür höhere Kosten entstehen. Fast ist derzeit für ChatGPT- und OpenAI-Responses-Verbindungen umgesetzt.")}</p>
        </section>
        <section className="settings-card settings-shortcuts"><div className="settings-card-head"><span className="service-icon"><Keyboard size={22} aria-hidden="true" /></span><div><h2>{t("Tastenkürzel")}</h2><p>{t("Die wichtigsten Wege für Aufnahme, Versand und Stopp")}</p></div></div>
          <dl><div><dt><kbd>F8</kbd></dt><dd>{t("Aufnahme starten oder beenden")}</dd></div><div><dt><kbd>F9</kbd></dt><dd>{t("Den vorbereiteten Text senden")}</dd></div><div><dt><kbd>{t("Strg")}</kbd><span> + </span><kbd>Enter</kbd></dt><dd>{t("Text im Gespräch senden")}</dd></div><div><dt><kbd>Esc</kbd></dt><dd>{t("Aufträge und Audio in openHiatus stoppen")}</dd></div><div><dt><kbd>{t("Strg")}</kbd><span> + </span><kbd>Alt</kbd><span> + </span><kbd>F12</kbd></dt><dd>{t("Globalen Stopp auslösen")}</dd></div></dl>
          <p className="billing-note">{t("F8 und F9 funktionieren auch, wenn openHiatus im Hintergrund ist. Hinweise zu belegten Tastenkürzeln stehen in der App.")}</p>
        </section>
      </section>
    </div>
  </main>;
}
