import { useEffect, useState } from 'react';
import { Check, ChevronDown, KeyRound, LoaderCircle, PlugZap } from 'lucide-react';
import type { Preferences, ProviderView, Snapshot } from '../shared/contracts';
import { ChatGPTCard } from './ChatGPTCard';
import { isFastModelSelection } from '../shared/model-selection';

const providers = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'google', label: 'Google' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'local', label: 'Lokaler Server' },
];

function ProviderCard({ provider, disabled, onError }: { provider: ProviderView; disabled: boolean; onError(error: unknown): void }) {
  const [key, setKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl ?? '');
  const [modelIds, setModelIds] = useState('');
  const [pending, setPending] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { setBaseUrl(provider.baseUrl ?? ''); }, [provider.baseUrl]);
  const busy = disabled || !!pending;
  async function action(name: string, callback: () => Promise<void>) {
    if (busy) return;
    setPending(name); setSaved(false);
    try { await callback(); if (name === 'save') setSaved(true); }
    catch (error) { onError(error); }
    finally { setPending(''); }
  }
  const customModels = modelIds.split(/[\n,]/).map(value => value.trim()).filter(Boolean);
  const canSave = provider.id === 'local' ? !!baseUrl.trim() && (!!customModels.length || provider.models.length > 0) : provider.configured || !!key.trim();
  return <section className="settings-card provider-card" data-provider={provider.id}>
    <div className="settings-card-head"><span className="service-icon"><PlugZap size={21} /></span><div><h2>{provider.id === 'openai' ? 'OpenAI API' : provider.label}</h2><p>{provider.id === 'local' ? 'OpenAI-kompatibler Server auf deinem Rechner oder im Netz' : 'Modelle für Arbeit, Gespräch und Gedächtnis'}</p></div><span className={`service-status ${provider.verified ? 'good' : ''}`}><span className="status-dot" />{provider.verified ? 'Geprüft' : provider.configured ? 'Gespeichert' : 'Nicht eingerichtet'}</span></div>
    <label className="field-label" htmlFor={`${provider.id}-key`}>API-Key {provider.id === 'local' && <span className="muted">· optional</span>}</label>
    <input className="provider-input" id={`${provider.id}-key`} type="password" autoComplete="off" spellCheck={false} value={key} placeholder={provider.id === 'local' ? 'Optionalen API-Key eingeben oder ersetzen' : provider.configured ? 'Geschützt gespeichert · zum Ersetzen neu eingeben' : 'API-Key eingeben'} onChange={event => { setKey(event.target.value); setSaved(false); }} disabled={busy} />
    <details className="provider-options" open={provider.id === 'local' ? true : undefined}><summary>{provider.id === 'local' ? 'Server und Modelle' : 'Eigene Basis-URL und Modell-IDs'}</summary>
      <label className="field-label" htmlFor={`${provider.id}-url`}>Basis-URL {provider.id !== 'local' && <span className="muted">· optional</span>}</label>
      <input className="provider-input" id={`${provider.id}-url`} type="url" spellCheck={false} value={baseUrl} placeholder={provider.id === 'local' ? 'http://localhost:11434/v1' : 'Standard-Endpunkt des Anbieters'} onChange={event => { setBaseUrl(event.target.value); setSaved(false); }} disabled={busy} />
      <label className="field-label" htmlFor={`${provider.id}-models`}>Eigene Modell-IDs {provider.id !== 'local' && <span className="muted">· optional</span>}</label>
      <textarea className="provider-input" id={`${provider.id}-models`} value={modelIds} rows={2} spellCheck={false} placeholder={provider.models.length ? provider.models.filter(model => !isFastModelSelection(model.id)).map(model => model.id.slice(model.id.indexOf('/') + 1)).join(', ') : 'Eine Modell-ID pro Zeile oder mit Komma getrennt'} onChange={event => { setModelIds(event.target.value); setSaved(false); }} disabled={busy} />
      <p className="billing-note">{provider.id === 'local' ? 'Trage mindestens eine Modell-ID ein, die dein Server bereitstellt.' : 'Leere Modell-IDs behalten den vorhandenen Modellkatalog. Eine leere Basis-URL nutzt den Standard des Anbieters.'}</p>
    </details>
    {provider.error && <p className="provider-error" role="alert">{provider.error}</p>}
    <div className="provider-actions"><button className="secondary-button" disabled={busy || !canSave} onClick={() => void action('save', async () => { await window.openhiatus.saveProvider({ id: provider.id, ...(key.trim() ? { apiKey: key.trim() } : {}), baseUrl: baseUrl.trim(), ...(customModels.length ? { models: customModels } : {}) }); setKey(''); setModelIds(''); })}>{pending === 'save' ? <LoaderCircle size={14} className="spin" /> : saved ? <Check size={14} /> : <KeyRound size={14} />}{saved ? 'Gespeichert' : 'Speichern'}</button>
      <button className="secondary-button" disabled={busy || !provider.configured} onClick={() => void action('test', () => window.openhiatus.testProvider(provider.id))}>{pending === 'test' && <LoaderCircle size={14} className="spin" />} Verbindung testen</button>
      {provider.configured && <button className="text-button subtle-danger" disabled={busy} onClick={() => void action('remove', async () => { await window.openhiatus.removeProvider(provider.id); setKey(''); setModelIds(''); })}>Entfernen</button>}
    </div>
  </section>;
}

export function ProvidersView({ state, disabled, onError, onPreference }: { state?: Snapshot; disabled: boolean; onError(error: unknown): void; onPreference(value: Partial<Preferences>): void }) {
  const models = state?.models ?? [];
  const catalog = [...providers.map(provider => state?.providers?.find(value => value.id === provider.id) ?? { ...provider, configured: false, verified: false, models: [] }), ...(state?.providers?.filter(provider => !providers.some(value => value.id === provider.id)) ?? [])].filter(provider => provider.id !== 'chatgpt' && (!('authType' in provider) || provider.authType !== 'chatgpt'));
  const roles = [{ key: 'model', label: 'Arbeit', detail: 'Dateien, Werkzeuge und Desktop bedienen' }, { key: 'dialogModel', label: 'Gespräch', detail: 'Mit dir sprechen und Aufträge koordinieren' }, { key: 'memoryModel', label: 'Gedächtnis', detail: 'Tages-, Wochen- und Monatsberichte erstellen' }] as const;
  return <>
    <section className="settings-card model-roles"><div className="settings-card-head"><span className="service-icon"><PlugZap size={21} /></span><div><h2>Deine Modelle</h2><p>Wähle für jede Aufgabe das passende Modell.</p></div></div>
      {roles.map(role => { const selected = state?.preferences[role.key] ?? ''; return <div className="field-row model-row" key={role.key}><label className="field-label" htmlFor={`role-${role.key}`}>{role.label}<small>{role.detail}</small></label><div className="select-wrap"><select id={`role-${role.key}`} value={selected} disabled={disabled || !models.length} onChange={event => onPreference({ [role.key]: event.target.value })}>{!models.length ? <option value="">Zuerst einen Anbieter einrichten</option> : !models.some(model => model.id === selected) ? <option value={selected}>{selected || 'Modell wählen'}</option> : null}{models.map(model => <option key={model.id} value={model.id}>{model.label}</option>)}</select><ChevronDown size={14} /></div></div>; })}
      <p className="billing-note">„(fast)“ fordert Fast an. Ein Eintrag ohne diesen Zusatz sendet keine Fast-Anforderung. Die Verarbeitungsstufe bestimmt letztlich der Anbieter; bei API-Modellen kann Fast mehr kosten. Modelle mit ChatGPT nutzen dein freigeschaltetes ChatGPT-Kontingent. Anbieterzugänge werden lokal geschützt gespeichert.</p>
    </section>
    <ChatGPTCard state={state} provider={state?.providers?.find(provider => provider.id === 'chatgpt')} disabled={disabled} onError={onError} onPreference={onPreference} />
    {catalog.map(provider => <ProviderCard key={provider.id} provider={provider} disabled={disabled || !state} onError={onError} />)}
  </>;
}
