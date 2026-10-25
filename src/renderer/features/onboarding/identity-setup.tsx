import { useEffect, useRef, useState } from 'react';
import { t } from '../../../shared/i18n';
import type { IdentityDocument } from '../../../shared/identity-documents';
import { EMPTY_SETUP_IDENTITY, readSetupIdentity, saveSetupIdentity, type SetupIdentity } from '../../../shared/onboarding-identity';

export function useIdentitySetup(active: boolean) {
  const documents = useRef<IdentityDocument[] | undefined>(undefined);
  const mounted = useRef(true), loading = useRef(false);
  const [draft, setDraft] = useState<SetupIdentity>(EMPTY_SETUP_IDENTITY);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function reload() {
    if (loading.current) return;
    loading.current = true; setStatus('loading'); setError('');
    try {
      const snapshot = await window.openhiatus.memorySnapshot();
      const draft = readSetupIdentity(snapshot.documents);
      if (mounted.current) { documents.current = snapshot.documents; setDraft(draft); setStatus('ready'); }
    } catch (error) {
      if (mounted.current) { setStatus('error'); setError(error instanceof Error ? error.message : String(error)); }
    } finally { loading.current = false; }
  }
  useEffect(() => { if (active && status === 'idle') void reload(); }, [active, status]);
  return { draft, status, error, reload,
    set<K extends keyof SetupIdentity>(key: K, value: SetupIdentity[K]) { setDraft(draft => ({ ...draft, [key]: value })); },
    reset() { if (documents.current) setDraft(readSetupIdentity(documents.current)); },
    async save() {
      if (!documents.current || status !== 'ready') return;
      await saveSetupIdentity(documents.current, draft, window.openhiatus);
      if (mounted.current) setDraft(readSetupIdentity(documents.current));
    },
  };
}
export function IdentitySetup({ identity, disabled }: { identity: ReturnType<typeof useIdentitySetup>; disabled: boolean }) {
  const locked = disabled || identity.status !== 'ready';
  return <>
    <p className="onboarding-lead">{t('Wie möchtet ihr zusammenarbeiten? Alle Angaben sind freiwillig. Du kannst sie später unter „Agent & Nutzer“ ändern.')}</p>
    <p>{t('Die Angaben werden in deinem Profil gespeichert und bei späteren Gesprächen als Kontext an deinen Modellanbieter gesendet. Trage nur ein, was du dafür teilen möchtest.')}</p>
    {identity.status === 'loading' && <p role="status">{t('Angaben werden geladen …')}</p>}
    {identity.error && <p role="alert">{t('Deine Angaben konnten nicht geladen werden. Du kannst erneut laden oder diesen Schritt überspringen.')}</p>}
    <div className="onboarding-identity">
      <label className="field-label" htmlFor="setup-agent-name">{t('Wie soll dein Agent heißen?')}</label>
      <input id="setup-agent-name" autoComplete="off" maxLength={60} disabled={locked} value={identity.draft.agentName} onChange={event => identity.set('agentName', event.target.value)} />
      <label className="field-label" htmlFor="setup-user-name">{t('Wie soll er dich ansprechen?')}</label>
      <input id="setup-user-name" autoComplete="off" maxLength={100} disabled={locked} value={identity.draft.userName} onChange={event => identity.set('userName', event.target.value)} />
      <label className="field-label" htmlFor="setup-agent-role">{t('Welche Rolle soll dein Agent übernehmen?')}</label>
      <input id="setup-agent-role" maxLength={500} disabled={locked} value={identity.draft.agentRole} placeholder={t('Zum Beispiel: geduldige Hilfe am Computer')} onChange={event => identity.set('agentRole', event.target.value)} />
      <label className="field-label" htmlFor="setup-user-context">{t('Was sollte er für die Zusammenarbeit über dich wissen?')}</label>
      <textarea id="setup-user-context" rows={3} maxLength={1500} disabled={locked} value={identity.draft.userContext} placeholder={t('Zum Beispiel: Ich kenne mich am PC noch wenig aus.')} onChange={event => identity.set('userContext', event.target.value)} />
      <label className="field-label" htmlFor="setup-reply-style">{t('Wie möchtest du Antworten erhalten?')}</label>
      <select id="setup-reply-style" disabled={locked} value={identity.draft.replyStyle} onChange={event => identity.set('replyStyle', event.target.value as SetupIdentity['replyStyle'])}>
        <option value="current">{t('Vorhandenen Stil beibehalten')}</option>
        <option value="brief">{t('Kurz und direkt')}</option>
        <option value="detailed">{t('Ausführlich mit Erklärungen')}</option>
        <option value="guided">{t('Schritt für Schritt, einfach erklärt')}</option>
      </select>
      <label className="field-label" htmlFor="setup-reply-notes">{t('Weitere Wünsche an den Agenten')}</label>
      <textarea id="setup-reply-notes" rows={3} maxLength={1000} disabled={locked} value={identity.draft.replyNotes} placeholder={t('Zum Beispiel: Bitte duze mich und vermeide Fachbegriffe.')} onChange={event => identity.set('replyNotes', event.target.value)} />
    </div>
    <p className="onboarding-tip">{t('Weitere vorhandene Angaben bleiben erhalten. Beim Wechseln des Schritts oder Pausieren werden Änderungen gespeichert. „Überspringen“ verwirft noch nicht gespeicherte Änderungen.')}</p>
    <button className="text-button" disabled={disabled || identity.status === 'loading'} onClick={() => void identity.reload()}>{t('Neu laden und Entwurf verwerfen')}</button>
  </>;
}
