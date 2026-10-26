import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Languages, LoaderCircle, Mic, Volume2 } from 'lucide-react';
import { t } from '../../../shared/i18n';
import { UI_LANGUAGES, type UiLanguage } from '../../../shared/ui-language';
import { onboardingStep, type OnboardingProgress } from '../../../shared/onboarding';
import { modelOptionLabel } from '../../../shared/model-selection';
import type { PreferencesPatch, Snapshot } from '../../../shared/contracts';
import type { AppSession } from '../session';
import { AudioDeviceSelect, SpeechAccessCard } from '../settings';
import { ChatGPTCard } from '../../ChatGPTCard';
import { ProviderCard } from '../../ProvidersView';
import { FullAccessNotice } from '../../FullAccessNotice';
import { IdentitySetup, useIdentitySetup } from './identity-setup';

export function OnboardingView({ state, session, fromStart = false, onClose }: { state: Snapshot; session: AppSession; fromStart?: boolean; onClose(): void }) {
  const [step, setStep] = useState<OnboardingProgress['step']>(() => onboardingStep(state, fromStart));
  const identity = useIdentitySetup(step === 1);
  const [alternative, setAlternative] = useState(() => state.providers?.find(provider => provider.id !== 'chatgpt' && provider.configured)?.id ?? '');
  const [busy, setBusy] = useState('');
  const pending = useRef(false), mounted = useRef(true);
  const [error, setError] = useState('');
  const [answer, setAnswer] = useState<{ model: string; answer: string }>();
  const heading = useRef<HTMLHeadingElement>(null);
  const titles = [t('Willkommen bei openHiatus'), t('Du und dein Agent'), t('Konto verbinden'), t('Sprechen oder schreiben'), t('Die erste Antwort')];
  const model = state.models.find(model => model.id === state.preferences.dialogModel);
  const blocked = !!busy || session.workBusy || session.summaryInProgress;
  const signingIn = state.chatgpt?.status === 'signing-in';
  const verified = answer?.model === model?.id && !!answer;
  const preference = (patch: PreferencesPatch) => { void window.openhiatus.savePreferences(patch).catch(session.report); };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { heading.current?.focus(); }, [step]);
  async function action(name: string, work: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true; setBusy(name); setError('');
    try { await work(); }
    catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : String(error)); }
    finally { pending.current = false; if (mounted.current) setBusy(''); }
  }
  async function progress(next: OnboardingProgress['step'], status: OnboardingProgress['status'] = 'active', skipIdentity = false) {
    session.cancelAudio();
    if (step === 1 && !skipIdentity) await identity.save();
    await window.openhiatus.savePreferences({ onboarding: { version: 2, step: next, status } });
    if (skipIdentity) identity.reset();
    if (!mounted.current) return;
    if (status === 'active') { setStep(next); setAnswer(undefined); } else onClose();
  }
  const alternatives = ['anthropic', 'google', 'openrouter', 'openai', 'local'].map(id => state.providers?.find(provider => provider.id === id)
    ?? { id, label: id === 'local' ? t('Lokaler Server') : id === 'openai' ? 'OpenAI API' : id === 'openrouter' ? 'OpenRouter' : id === 'google' ? 'Google' : 'Anthropic', configured: false, verified: false, models: [] });
  const provider = alternatives.find(provider => provider.id === alternative);
  const modelSelector = model && <div className="onboarding-model-select">
    <label className="field-label" htmlFor="setup-model">{t('Modell für das Gespräch')}</label>
    <select id="setup-model" value={model.id} disabled={blocked || signingIn} onChange={event => {
      const dialogModel = event.target.value; setAnswer(undefined);
      void action('model', () => window.openhiatus.savePreferences({ dialogModel }));
    }}>{state.models.map(entry => <option key={entry.id} value={entry.id}>{modelOptionLabel(entry)}</option>)}</select>
    <p>{t('Zur Auswahl stehen die Modelle deiner verbundenen Zugänge. Weitere Zugänge kannst du unter „Konto verbinden“ hinzufügen.')}</p>
  </div>;
  return <main className="onboarding-view" aria-label={t('Schritt für Schritt einrichten')}>
    <div className="onboarding-scroll">
    <div className="onboarding-content">
      <div className="onboarding-top"><span className="eyebrow">{t('Schritt {0} von {1}', step + 1, titles.length)}</span>
        <button className="text-button" disabled={!!busy} onClick={() => void action('later', async () => {
          if (signingIn) await window.openhiatus.cancelChatGPTSignIn();
          await progress(step, 'later');
        })}>{t('Später fortsetzen')}</button></div>
      <nav aria-label={t('Einrichtung')}><ol className="onboarding-progress">
        {titles.map((title, index) => <li key={index}><button type="button" aria-current={index === step ? 'step' : undefined}
          disabled={blocked || signingIn} onClick={() => { if (index !== step) void action('jump', () => progress(index as OnboardingProgress['step'])); }}>
          <span aria-hidden="true">{index + 1}</span><span>{title}</span></button></li>)}
      </ol></nav>
      <p className="onboarding-jump-hint">{t('Wähle oben einen Schritt, um direkt dorthin zu wechseln.')}</p>
      <h1 ref={heading} tabIndex={-1}>{titles[step]}</h1>
      {step > 0 && !session.acknowledged && <p className="onboarding-tip">{t('Bestätige zuerst den Zugriffshinweis im Schritt „Willkommen bei openHiatus“.')}</p>}
      {step === 0 && <>
        <p className="onboarding-lead">{t('Wir gehen gemeinsam bis zur ersten Antwort. Du kannst jederzeit pausieren und hier weitermachen.')}</p>
        <label className="onboarding-language"><Languages size={20} aria-hidden="true" /><span>Language · 语言</span>
          <select aria-label="Language · 语言" value={state.preferences.uiLanguage ?? 'de'} onChange={event => preference({ uiLanguage: event.target.value as UiLanguage })}>
            {UI_LANGUAGES.map(language => <option key={language.id} value={language.id} lang={language.id}>{language.name}</option>)}
          </select></label>
        <p>{t('Du brauchst einen Modellzugang, zum Beispiel ein freigeschaltetes ChatGPT-Konto. Mikrofon und Sprachdienst sind optional.')}</p>
        <FullAccessNotice acknowledged={session.acknowledged} busy={blocked} onAcknowledge={() => void action('consent', () => window.openhiatus.acknowledgeFullAccess())} />
        <p className="onboarding-tip">{t('Stopp und Esc bleiben immer erreichbar. Wenn openHiatus den Desktop bedient, zeigt die App das deutlich an.')}</p>
      </>}
      {step === 1 && <IdentitySetup identity={identity} disabled={blocked || !session.acknowledged} />}
      {step === 2 && <>
        <p className="onboarding-lead">{t('Verbinde einen Zugang für Antworten und Aufgaben. Der Anbieter kann dafür Gebühren oder Nutzungslimits vorsehen.')}</p>
        {!alternative && <ChatGPTCard guided state={state} provider={state.providers?.find(provider => provider.id === 'chatgpt')} disabled={blocked} onError={session.report} onPreference={preference} />}
        <details className="onboarding-alternatives" open={alternative ? true : undefined}>
          <summary>{t('Anderen Anbieter oder lokalen Server verwenden')}</summary>
          <label className="field-label" htmlFor="setup-provider">{t('Modellanbieter')}</label>
          <select id="setup-provider" disabled={blocked || signingIn} value={alternative} onChange={event => setAlternative(event.target.value)}>
            <option value="">ChatGPT</option>{alternatives.map(provider => <option key={provider.id} value={provider.id}>{provider.id === 'local' ? t('Lokaler Server') : provider.label}</option>)}
          </select>
          {provider && <ProviderCard key={provider.id} idPrefix="setup-" guided provider={provider} disabled={blocked} onError={session.report} />}
        </details>
        <div className="onboarding-model" role="status">{model ? <><Check size={18} /><span>{t('Für die erste Antwort ausgewählt: {0}', modelOptionLabel(model))}</span></> : <span>{t('Verbinde zuerst ein Konto. Danach kannst du weitergehen.')}</span>}</div>
        {modelSelector}
      </>}
      {step === 3 && <>
        <p className="onboarding-lead">{t('Du kannst sofort mit Text arbeiten. Sprechen richtest du auf Wunsch jetzt oder später ein.')}</p>
        <details className="onboarding-voice"><summary>{t('Mikrofon und Stimme einrichten (optional)')}</summary>
          <p>{t('Der Mikrofontest bleibt auf deinem Rechner. Für Spracherkennung und Antworten zum Anhören verbindest du Inworld oder ElevenLabs.')}</p>
          <label className="field-label" htmlFor="setup-microphone">{t('Mikrofon')}</label>
          <AudioDeviceSelect id="setup-microphone" kind="audioinput" preferences={state.preferences} devices={session.devices} disabled={session.audioBusy} onChange={preference} />
          <button className="secondary-button" disabled={blocked || (session.audioBusy && session.phase !== 'mic-test')} onClick={() => session.phase === 'mic-test' ? session.cancelAudio() : void session.startRecording(true)}><Mic size={18} />{session.phase === 'mic-test' ? t('Audio beenden') : t('Mikrofon testen')}</button>
          {session.phase === 'mic-test' && <div role="status"><p>{t('Sprich kurz. Bewegt sich der Pegel?')}</p><meter aria-label={t('Mikrofonpegel')} min={0} max={1} value={session.level} /></div>}
          <SpeechAccessCard state={state} idPrefix="setup" disabled={blocked || session.audioBusy} onError={session.report}
            resetAudio={() => { session.clearSpeech(); session.cancelAudio(); }} savePreferences={patch => window.openhiatus.savePreferences(patch)}
            saveKey={(key, provider) => window.openhiatus.saveSpeechKey(key, provider)} removeKey={provider => window.openhiatus.removeSpeechKey(provider)} />
          <label className="field-label" htmlFor="setup-speaker">{t('Lautsprecher')}</label>
          <AudioDeviceSelect id="setup-speaker" kind="audiooutput" preferences={state.preferences} devices={session.devices} disabled={session.audioBusy} onChange={preference} />
          <button className="secondary-button" disabled={blocked || session.audioBusy || !session.speechReady} onClick={() => void session.testSpeech()}><Volume2 size={18} />{t('Sprachausgabe testen')}</button>
        </details>
        <p className="onboarding-tip">{t('Mit „Weiter“ geht es auch ohne Sprachzugang.')}</p>
      </>}
      {step === 4 && <>
        <p className="onboarding-lead">{t('Lass dir eine kurze Begrüßung senden. Dabei werden keine Dateien oder Bildschirmaufnahmen übertragen und keine Programme bedient.')}</p>
        <p>{t('Eine kurze Modellanfrage zählt zum Kontingent deines Anbieters. Geprüft wird nur die Textantwort.')}</p>
        {modelSelector || <p>{t('Zuerst einen Anbieter einrichten')}</p>}
        <p>{t('Name und Antwortwünsche gelten ab deinem ersten Gespräch. Dieser Verbindungstest verwendet nur eine feste Begrüßungsanfrage.')}</p>
        <button className="primary-button" disabled={blocked || !model || !session.acknowledged || signingIn} onClick={() => void action('check', async () => {
          setAnswer(undefined); const result = await window.openhiatus.checkSetup(); if (mounted.current) setAnswer(result);
        })}>{busy === 'check' && <LoaderCircle size={18} className="spin" />}{busy === 'check' ? t('Antwort wird geprüft …') : t('Erste Antwort testen')}</button>
        {busy === 'check' && <button className="secondary-button" onClick={() => void session.stopAll()}>{t('Stopp')} · Esc</button>}
        {verified && <div className="onboarding-success" role="status"><h2><Check size={22} />{t('Deine Textverbindung funktioniert.')}</h2><p>{answer.answer}</p>
          <p>{t('Du kannst jetzt eine Frage stellen oder dir einen nächsten Schritt erklären lassen.')}</p></div>}
      </>}
      {error && <div className="onboarding-error" role="alert"><strong>{t('Das hat noch nicht geklappt.')}</strong><p>{step === 1 ? t('Deine Änderungen sind noch nicht vollständig gespeichert. Versuche es erneut. Falls die Angaben inzwischen anderswo geändert wurden, lade sie neu.') : t('Prüfe deinen Zugang und die Internetverbindung. Du kannst zurückgehen oder es erneut versuchen.')}</p><details><summary>{t('Details')}</summary><p>{error}</p></details></div>}
    </div></div>
      <footer className="onboarding-actions"><div className="onboarding-footer-content">
        {step > 0 && <button className="secondary-button" disabled={blocked || signingIn} onClick={() => void action('back', () => progress((step - 1) as OnboardingProgress['step']))}><ChevronLeft size={18} />{t('Zurück')}</button>}
        {step === 1 && <button className="secondary-button" disabled={blocked} onClick={() => void action('skip', () => progress(2, 'active', true))}>{t('Überspringen')}</button>}
        {step < 4 ? <button className="primary-button" disabled={blocked || signingIn || !session.acknowledged || (step === 1 && identity.status !== 'ready') || (step === 2 && !model)} onClick={() => void action('next', () => progress((step + 1) as OnboardingProgress['step']))}>{t('Weiter')}<ChevronRight size={18} /></button>
          : <button className="primary-button" disabled={blocked || !verified} onClick={() => void action('finish', () => progress(4, 'complete'))}>{t('Einrichtung abschließen')}<Check size={18} /></button>}
      </div></footer>
  </main>;
}
