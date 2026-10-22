import { useRef, useState } from 'react';
import { ArrowUpRight, Check, LoaderCircle, LogIn } from 'lucide-react';
import type { Preferences, ProviderView, Snapshot } from '../shared/contracts';

export function ChatGPTCard({ state, provider, disabled, onError, onPreference }: {
  state?: Snapshot; provider?: ProviderView; disabled: boolean;
  onError(error: unknown): void; onPreference(value: Partial<Preferences>): void;
}) {
  const [pending, setPending] = useState('');
  const pendingRef = useRef('');
  const connection = state?.chatgpt;
  const signedIn = connection?.status === 'signed-in';
  const signingIn = connection?.status === 'signing-in' || pending === 'signin';
  const allowed = signedIn && connection.planUsage;
  const account = connection?.account || provider?.account;
  const error = connection?.error || provider?.error;
  const canForget = signedIn || provider?.configured || connection?.status === 'error' || !!account;
  const busy = disabled || !state || (!!pending && pending !== 'signin');
  async function action(name: string, run: () => Promise<void>) {
    if ((disabled && name !== 'cancel') || !state || (pendingRef.current && !(name === 'cancel' && pendingRef.current === 'signin'))) return;
    pendingRef.current = name; setPending(name);
    try { await run(); }
    catch (error) { onError(error); }
    finally {
      if (pendingRef.current === name) { pendingRef.current = ''; setPending(''); }
    }
  }
  return <section className="settings-card chatgpt-card" data-provider="chatgpt" aria-labelledby="chatgpt-heading">
    <div className="settings-card-head"><span className="service-icon"><LogIn size={21} /></span><div><h2 id="chatgpt-heading">ChatGPT</h2><p>Mit deinem ChatGPT-Konto verbinden</p></div><span className={`service-status ${allowed ? 'good' : ''}`} role="status"><span className="status-dot" />{signingIn ? 'Anmeldung läuft …' : signedIn ? 'Angemeldet' : connection?.status === 'error' ? 'Anmeldung fehlgeschlagen' : 'Nicht verbunden'}</span></div>
    <p className="chatgpt-intro">Nutze freigeschaltete Modelle über dein ChatGPT-Kontingent. Zugang und Nutzungslimits richten sich nach deinem Plan. Du brauchst keinen API-Key.</p>
    {signingIn ? <div className="chatgpt-signing-in" role="status"><LoaderCircle size={16} className="spin" /><span>Schließe die Anmeldung im geöffneten Browser ab. openHiatus wartet auf die Bestätigung.</span><button className="secondary-button" disabled={!state || pending === 'cancel'} onClick={() => void action('cancel', () => window.openhiatus.cancelChatGPTSignIn())}>Anmeldung abbrechen</button></div>
      : signedIn ? <div className="chatgpt-account"><Check size={17} /><strong>{account || 'ChatGPT-Konto verbunden'}</strong></div>
      : <button className="chatgpt-signin-button" disabled={busy} onClick={() => void action('signin', () => window.openhiatus.signInChatGPT())}>Continue with ChatGPT</button>}
    {signedIn && !signingIn && (allowed ? <div className="chatgpt-plan-state"><strong>ChatGPT-Kontingent verwenden</strong><p>Wähle oben für Arbeit, Gespräch oder Gedächtnis eines der Modelle deines ChatGPT-Kontos. Diese Anfragen zählen zu deinem ChatGPT-Plan.</p></div>
      : <div className="chatgpt-plan-unavailable" role="status"><strong>Kein Modellzugriff freigeschaltet</strong><p>Dein Konto ist angemeldet. Gib den Modellzugriff erneut frei oder prüfe deinen Zugang unter „Nutzung verwalten“.</p><button className="secondary-button" disabled={busy} onClick={() => void action('signin', () => window.openhiatus.signInChatGPT())}>ChatGPT-Zugang freigeben</button></div>)}
    {error && <p className="provider-error" role="alert">{error}</p>}
    <label className="chatgpt-background-consent"><input type="checkbox" checked={state?.preferences.chatgptBackgroundUsage === true} disabled={busy || signingIn || !allowed} onChange={event => onPreference({ chatgptBackgroundUsage: event.target.checked })} /><span>Automatische Gedächtnisberichte mit ChatGPT erlauben<small>Gilt für Berichte im Hintergrund und ist standardmäßig ausgeschaltet. Von dir gestartete Aufträge kannst du direkt nutzen.</small></span></label>
    {canForget && !signingIn && <div className="provider-actions">{(signedIn || provider?.configured) && <><button className="secondary-button" disabled={busy} onClick={() => void action('usage', () => window.openhiatus.openChatGPTUsage())}>Nutzung verwalten <ArrowUpRight size={14} /></button><button className="text-button" disabled={busy} onClick={() => void action('signout', () => window.openhiatus.signOutChatGPT())}>Abmelden</button></>}<button className="text-button subtle-danger" disabled={busy} onClick={() => void action('remove', () => window.openhiatus.removeProvider('chatgpt'))}>Verbindung entfernen</button></div>}
  </section>;
}
