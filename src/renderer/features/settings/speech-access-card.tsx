import { useId, useRef, useState } from 'react';
import { AudioLines, KeyRound, LoaderCircle } from 'lucide-react';
import type { PreferencesPatch, Snapshot } from '../../../shared/contracts';
import { SPEECH_DEFAULTS, SPEECH_PROVIDERS, type SpeechProvider } from '../../../shared/speech-settings';
import { t } from '../../../shared/i18n';

export function SpeechAccessCard({ state, disabled, idPrefix, onError, onNotice, resetAudio, saveKey, removeKey, savePreferences }: {
  state?: Snapshot; disabled: boolean; idPrefix?: string; onError(error: unknown): void; onNotice?(message: string): void;
  resetAudio(): void; saveKey(key: string, provider: SpeechProvider): Promise<void>; removeKey(provider: SpeechProvider): Promise<void>;
  savePreferences(patch: PreferencesPatch): Promise<void>;
}) {
  const generatedId = useId(), id = idPrefix ?? generatedId;
  const provider = state?.preferences.speechProvider ?? 'inworld';
  const [keys, setKeys] = useState<Partial<Record<SpeechProvider, string>>>({});
  const [voices, setVoices] = useState<Partial<Record<SpeechProvider, string>>>({});
  const [busy, setBusy] = useState(false), pending = useRef(false);
  const locked = disabled || !state || busy, configured = !!state && state.connections.speech !== 'missing';
  const voiceField = provider === 'elevenlabs' ? 'elevenlabsVoiceId' : 'voiceId';
  const currentVoice = state?.preferences[voiceField] ?? '', draftVoice = voices[provider] ?? currentVoice;
  const label = SPEECH_DEFAULTS[provider].label;
  async function action(work: () => Promise<void>, message = '') {
    if (pending.current) return;
    pending.current = true; setBusy(true); onNotice?.('');
    try { resetAudio(); await work(); if (message) onNotice?.(message); }
    catch (error) { onError(error); }
    finally { pending.current = false; setBusy(false); }
  }
  async function saveVoice(value: string) {
    await savePreferences({ [voiceField]: value }); setVoices(drafts => ({ ...drafts, [provider]: undefined }));
  }
  return <section className="settings-card settings-speech-access" aria-busy={busy}>
    <div className="settings-card-head"><span className="service-icon speech"><AudioLines size={22} aria-hidden="true" /></span>
      <div><h2>{t('Stimme & Gehör')}</h2><p>{t('Wähle einen Anbieter für Spracherkennung und Sprachausgabe.')}</p></div>
      <span className={`service-status ${configured ? 'good' : ''}`} role="status">{state?.connections.speech === 'verified' ? t('Ausgabe geprüft') : configured ? t('Key gespeichert') : t('Nicht verbunden')}</span>
    </div>
    <label className="field-label" htmlFor={`${id}-speech-provider`}>{t('Sprachanbieter')}</label>
    <select id={`${id}-speech-provider`} value={provider} disabled={locked} onChange={event => {
      const next = event.target.value as SpeechProvider; void action(() => savePreferences({ speechProvider: next }));
    }}>{SPEECH_PROVIDERS.map(value => <option key={value} value={value}>{SPEECH_DEFAULTS[value].label}</option>)}</select>
    <label className="field-label" htmlFor={`${id}-speech-key`}>{provider === 'inworld' ? t('Inworld-Zugang (Base64)') : t('ElevenLabs API-Key')}</label>
    <div className="input-action"><input id={`${id}-speech-key`} type="password" autoComplete="off" spellCheck={false} maxLength={4096} disabled={locked}
      value={keys[provider] ?? ''} placeholder={configured ? t('Zugang geschützt gespeichert') : provider === 'inworld' ? t('Base64-Zugangsdaten aus dem Inworld-Portal') : t('API-Key aus deinem ElevenLabs-Konto')}
      onChange={event => setKeys(drafts => ({ ...drafts, [provider]: event.target.value }))} />
      <button className="secondary-button" disabled={locked || !keys[provider]?.trim()} onClick={() => void action(async () => {
        await saveKey(keys[provider]!.trim(), provider); setKeys(drafts => ({ ...drafts, [provider]: '' }));
      }, t('Sprachzugang gespeichert. Prüfe jetzt die Sprachausgabe.'))}>{busy ? <LoaderCircle size={15} className="spin" /> : <KeyRound size={15} />}{t('Speichern')}</button>
    </div>
    <p className="billing-note">{t('Für den Start genügt dein API-Key. Eine eigene Stimme ist freiwillig.')}</p>
    <details className="speech-voice-options"><summary>{t('Stimme anpassen (optional)')}</summary>
      <label className="field-label" htmlFor={`${id}-speech-voice`}>{t('Voice-ID (optional)')}</label>
      <input id={`${id}-speech-voice`} type="text" autoComplete="off" spellCheck={false} maxLength={200} disabled={locked} value={draftVoice}
        placeholder={t('Leer lassen für die Standardstimme')} onChange={event => setVoices(drafts => ({ ...drafts, [provider]: event.target.value }))} />
      <p className="billing-note">{t('Die Voice-ID findest du bei deinem Anbieter. Sie kann Buchstaben und Zahlen enthalten. Ohne eigene ID wird die Standardstimme verwendet.')}</p>
      <p className="billing-note">{t('Standardstimme: {0}', SPEECH_DEFAULTS[provider].voiceName)}</p>
      <div className="provider-actions"><button className="secondary-button" disabled={locked || draftVoice.trim() === currentVoice} onClick={() => void action(() => saveVoice(draftVoice.trim()), t('Stimme gespeichert.'))}>{t('Stimme speichern')}</button>
        <button className="text-button" disabled={locked || (!currentVoice && !draftVoice)} onClick={() => void action(() => saveVoice(''), t('Standardstimme ausgewählt.'))}>{t('Standardstimme verwenden')}</button></div>
    </details>
    <p className="billing-note">{t('{0} erhält für die jeweilige Funktion deine Aufnahme oder den Antworttext. Die Nutzung wird über dein Konto dort abgerechnet. Der Mikrofontest bleibt lokal.', label)}</p>
    {configured && <button className="text-button subtle-danger" disabled={locked} onClick={() => void action(() => removeKey(provider), t('Sprachzugang entfernt.'))}>{t('Gespeicherten Sprachzugang entfernen')}</button>}
  </section>;
}
