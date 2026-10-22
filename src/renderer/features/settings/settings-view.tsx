import { AudioDeviceSelect } from './audio-device-select';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { AudioLines, Headphones, KeyRound, Keyboard, LoaderCircle, Mic, SlidersHorizontal, Square, Volume2 } from 'lucide-react';
import type { PreferencesPatch, Snapshot } from '../../../shared/contracts';
import { ProvidersView } from '../../ProvidersView';
import type { AudioPhase } from '../voice';

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
  workBusy: boolean;
  summaryInProgress: boolean;
  voice: SettingsVoicePort;
  onPreference(value: PreferencesPatch): void | Promise<void>;
  onError(error: unknown): void;
  onNotice(message: string): void;
}

const tabs = [
  { id: 'models', label: 'Modelle & Zugänge', icon: KeyRound },
  { id: 'speech', label: 'Sprache & Geräte', icon: AudioLines },
  { id: 'behavior', label: 'Bedienung', icon: SlidersHorizontal },
] as const;
type SettingsTab = typeof tabs[number]['id'];
const phaseLabels: Record<AudioPhase, string> = {
  idle: 'Audio bereit', opening: 'Mikrofon wird geöffnet', recording: 'Aufnahme läuft', 'mic-test': 'Mikrofontest',
  transcribing: 'Sprache wird erkannt', synthesizing: 'Ausgabe wird vertont', playing: 'Ausgabe wird abgespielt',
};

function Spinner() { return <LoaderCircle size={15} className="spin" aria-hidden="true" />; }

/** The App keeps this feature mounted: tabs and unsaved access fields belong to this view. */
export function SettingsView({ state, workBusy, summaryInProgress, voice, onPreference, onError, onNotice }: SettingsViewProps) {
  const [tab, setTab] = useState<SettingsTab>('models');
  const [speechKey, setSpeechKey] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const actionPending = useRef(false);
  const tabButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId();
  const recording = voice.phase === 'recording' || voice.phase === 'mic-test';
  const ready = state !== undefined;

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

  return <main className="settings-feature settings-scroll" aria-label="Einstellungen">
    <div className="settings-content">
      <header className="settings-feature-heading"><div className="eyebrow">DEIN openHiatus</div><h1>Deine Einstellungen.</h1><p className="settings-lead">Modelle verbinden, Sprache einrichten und die Bedienung anpassen.</p></header>
      <div className="settings-tabs" role="tablist" aria-label="Einstellungsbereiche">
        {tabs.map(({ id: value, label, icon: Icon }, index) => <button key={value} ref={button => { tabButtons.current[index] = button; }}
          id={`${id}-tab-${value}`} role="tab" aria-selected={tab === value} aria-controls={`${id}-panel-${value}`} tabIndex={tab === value ? 0 : -1}
          onClick={() => setTab(value)} onKeyDown={event => changeTab(event, index)}><Icon size={17} aria-hidden="true" /><span>{label}</span></button>)}
      </div>

      <section id={`${id}-panel-models`} role="tabpanel" aria-labelledby={`${id}-tab-models`} hidden={tab !== 'models'} className="settings-tab-panel">
        <p className="settings-panel-intro">Wähle Modelle für Gespräch, Arbeit und Gedächtnis. Deine Zugänge werden lokal geschützt gespeichert.</p>
        <ProvidersView state={state} disabled={!ready || workBusy || summaryInProgress} onError={onError} onPreference={preference} />
        <div className="settings-footnote"><KeyRound size={17} aria-hidden="true" /><p>Gespeicherte API-Keys werden nicht mehr angezeigt. Modelle nutzen den für ihre Rolle ausgewählten Anbieter.</p></div>
      </section>

      <section id={`${id}-panel-speech`} role="tabpanel" aria-labelledby={`${id}-tab-speech`} hidden={tab !== 'speech'} className="settings-tab-panel">
        <p className="settings-panel-intro">Deine Sprachverbindung und die Audiogeräte dieses Rechners.</p>
        <section className="settings-card settings-speech-access">
          <div className="settings-card-head"><span className="service-icon speech"><AudioLines size={22} aria-hidden="true" /></span><div><h2>Stimme & Gehör</h2><p>Spracherkennung und Sprachausgabe mit Inworld</p></div>
            <span className={`service-status ${voice.speechReady ? 'good' : ''}`}><span className="status-dot" />{state?.connections.speech === 'verified' ? 'Ausgabe geprüft' : voice.speechReady ? 'Key gespeichert' : 'Nicht verbunden'}</span></div>
          <label className="field-label" htmlFor={`${id}-speech-key`}>Inworld-Zugang (Base64) {voice.speechReady && <span className="muted">· zum Ersetzen neu eingeben</span>}</label>
          <div className="input-action"><input id={`${id}-speech-key`} type="password" autoComplete="off" spellCheck={false} value={speechKey} disabled={!ready || !!busyAction}
            placeholder={voice.speechReady ? 'Zugang geschützt gespeichert' : 'Base64-Zugangsdaten aus dem Inworld-Portal'} onChange={event => setSpeechKey(event.target.value)} />
            <button className="secondary-button" disabled={!ready || !speechKey.trim() || !!busyAction} onClick={() => {
              const submitted = speechKey.trim();
              void action('speech-key', async () => { await voice.saveSpeechKey(submitted); setSpeechKey(''); }, 'Inworld-Zugang gespeichert. Prüfe jetzt die Sprachausgabe.');
            }}>{busyAction === 'speech-key' ? <Spinner /> : <KeyRound size={15} aria-hidden="true" />} Speichern</button></div>
          <div className="provider-models"><span>STT <strong>inworld/inworld-stt-1</strong></span><span>TTS <strong>inworld-tts-2</strong></span></div>
          <p className="billing-note">Sprache wird separat über dein Inworld-Konto abgerechnet. Aufnahme und Antworttext werden für die jeweilige Funktion an Inworld gesendet. Der Mikrofontest bleibt lokal.</p>
          {voice.speechReady && <button className="text-button subtle-danger" disabled={workBusy || voice.audioBusy || !!busyAction} onClick={() => void action('remove-speech', async () => {
            voice.clearSpeech(); voice.cancelAudio(); await voice.removeSpeechKey();
          }, 'Inworld-Zugang entfernt.')}>{busyAction === 'remove-speech' && <Spinner />}Gespeicherten Sprachzugang entfernen</button>}
        </section>

        <section className="settings-card settings-audio-devices">
          <div className="settings-card-head"><span className="service-icon"><Headphones size={22} aria-hidden="true" /></span><div><h2>Mikrofon & Lautsprecher</h2><p>Geräte auswählen und die Verbindung prüfen</p></div></div>
          <div className="audio-device-grid"><div><label className="field-label" htmlFor={`${id}-microphone`}><Mic size={15} aria-hidden="true" /> Mikrofon</label>
            <AudioDeviceSelect id={`${id}-microphone`} kind="audioinput" preferences={state?.preferences} devices={voice.devices} disabled={!ready || voice.audioBusy} onChange={preference} />
            <button className="device-test" disabled={!ready || workBusy || (voice.audioBusy && voice.phase !== 'mic-test')} onClick={() => voiceAction(() => voice.startRecording(true))}>
              {voice.phase === 'mic-test' ? <Square size={14} aria-hidden="true" /> : <Mic size={14} aria-hidden="true" />}{voice.phase === 'mic-test' ? `Test beenden · ${voice.seconds}s` : 'Mikrofon lokal testen'}</button></div>
            <div><label className="field-label" htmlFor={`${id}-speakers`}><Headphones size={15} aria-hidden="true" /> Lautsprecher</label>
              <AudioDeviceSelect id={`${id}-speakers`} kind="audiooutput" preferences={state?.preferences} devices={voice.devices} disabled={!ready || voice.phase !== 'idle'} onChange={preference} />
              <button className="device-test" disabled={!voice.speechReady || workBusy || voice.audioBusy} onClick={() => voiceAction(() => voice.testSpeech())}>{voice.phase === 'synthesizing' ? <Spinner /> : <Volume2 size={14} aria-hidden="true" />} Sprachausgabe testen</button></div></div>
          {voice.phase !== 'idle' && <div className="settings-audio-state"><AudioLines size={16} aria-hidden="true" /><span role="status">{phaseLabels[voice.phase]}{recording ? ` · ${voice.seconds}s` : ''}</span><button className="text-button" onClick={() => voice.cancelAudio()}>Audio beenden</button></div>}
          <p className="billing-note">Die Geräteauswahl wird automatisch gespeichert. Getrennte Geräte bleiben vorgemerkt und werden beim Wiederverbinden erneut verwendet. Nur Windows-Standardgerät folgt der aktuellen Windows-Auswahl.</p>
          <p className="billing-note">Gerätenamen erscheinen, sobald der Browser auf das Mikrofon zugreifen darf. Der lokale Mikrofontest benötigt keinen Sprachzugang.</p>
        </section>
      </section>

      <section id={`${id}-panel-behavior`} role="tabpanel" aria-labelledby={`${id}-tab-behavior`} hidden={tab !== 'behavior'} className="settings-tab-panel">
        <p className="settings-panel-intro">So hörst du Antworten und übergibst neue Aufträge.</p>
        <section className="settings-card settings-behavior">
          <div className="settings-card-head"><span className="service-icon"><SlidersHorizontal size={22} aria-hidden="true" /></span><div><h2>Sprache & Rückmeldungen</h2><p>Änderungen werden direkt übernommen.</p></div></div>
          <label className="settings-toggle"><span><strong>Antworten vorlesen</strong><small>openHiatus liest Antworten über deinen Sprachzugang vor.</small></span><input type="checkbox" checked={state?.preferences.speakReplies ?? false} disabled={!ready} onChange={event => {
            if (!event.target.checked) { voice.clearSpeech(); voice.cancelAudio(); } preference({ speakReplies: event.target.checked });
          }} /></label>
          <label className="settings-toggle"><span><strong>Signaltöne</strong><small>Kurze Töne begleiten Aufnahme, Versand und Aufgabenstatus.</small></span><input type="checkbox" checked={state?.preferences.earcons !== false} disabled={!ready} onChange={event => {
            if (!event.target.checked) voice.stopEarcons(); preference({ earcons: event.target.checked });
          }} /></label>
          <label className="settings-toggle"><span><strong>Sprachgespräch</strong><small>Nach Ende der Aufnahme wird das erkannte Gesagte automatisch gesendet. Ausgeschaltet kannst du das Transkript vor dem Senden prüfen.</small></span><input type="checkbox" checked={state?.preferences.voiceConversation !== false} disabled={!ready} onChange={event => preference({ voiceConversation: event.target.checked })} /></label>
        </section>
        <section className="settings-card settings-shortcuts"><div className="settings-card-head"><span className="service-icon"><Keyboard size={22} aria-hidden="true" /></span><div><h2>Tastenkürzel</h2><p>Die wichtigsten Wege für Aufnahme, Versand und Stopp</p></div></div>
          <dl><div><dt><kbd>F8</kbd></dt><dd>Aufnahme starten oder beenden</dd></div><div><dt><kbd>F9</kbd></dt><dd>Den vorbereiteten Text senden</dd></div><div><dt><kbd>Strg</kbd><span> + </span><kbd>Enter</kbd></dt><dd>Text im Gespräch senden</dd></div><div><dt><kbd>Esc</kbd></dt><dd>Aufträge und Audio in openHiatus stoppen</dd></div><div><dt><kbd>Strg</kbd><span> + </span><kbd>Alt</kbd><span> + </span><kbd>F12</kbd></dt><dd>Globalen Stopp auslösen</dd></div></dl>
          <p className="billing-note">F8 und F9 funktionieren auch, wenn openHiatus im Hintergrund ist. Hinweise zu belegten Tastenkürzeln stehen in der App.</p>
        </section>
      </section>
    </div>
  </main>;
}
