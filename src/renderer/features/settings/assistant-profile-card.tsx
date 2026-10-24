import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ChevronDown, LoaderCircle, Plus, Save, Trash2, UserRound } from 'lucide-react';
import {
  ASSISTANT_NAME_MAX_LENGTH, BUILTIN_PERSONALITIES, DEFAULT_ASSISTANT_PROFILE,
  PERSONALITY_INSTRUCTIONS_MAX_LENGTH, PERSONALITY_TEMPLATE_LIMIT,
  parseAssistantProfile, resolvePersonality, type AssistantProfile,
} from '../../../shared/assistant-profile';

export interface AssistantProfileCardProps {
  profile?: AssistantProfile;
  ready: boolean;
  onSave(profile: AssistantProfile): Promise<void>;
  onError(error: unknown): void;
}

interface ProfileDraft extends AssistantProfile { label: string; instructions: string; }
function draftFrom(profile: AssistantProfile): ProfileDraft {
  const personality = resolvePersonality(profile);
  return { ...profile, templates: profile.templates.map(template => ({ ...template })), label: personality.label, instructions: personality.instructions };
}
function profileFrom(draft: ProfileDraft): AssistantProfile {
  return { name: draft.name, personalityId: draft.personalityId, templates: draft.templates };
}

/** The profile is saved atomically; snapshots cannot replace an unfinished local edit. */
export function AssistantProfileCard({ profile, ready, onSave, onError }: AssistantProfileCardProps) {
  const id = useId();
  const [draft, setDraft] = useState(() => draftFrom(profile ?? DEFAULT_ASSISTANT_PROFILE));
  const baseline = useRef(JSON.stringify(draft));
  const dirty = JSON.stringify(draft) !== baseline.current;
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const pending = useRef(false);
  const [saving, setSaving] = useState<'save' | 'new' | 'delete' | ''>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const receivedKey = JSON.stringify(profile ?? DEFAULT_ASSISTANT_PROFILE);
  useEffect(() => {
    if (dirtyRef.current || pending.current) return;
    const received = draftFrom(profile ?? DEFAULT_ASSISTANT_PROFILE);
    baseline.current = JSON.stringify(received); setDraft(received);
  }, [receivedKey]);

  const builtin = BUILTIN_PERSONALITIES.find(personality => personality.id === draft.personalityId);
  const custom = draft.templates.find(personality => personality.id === draft.personalityId);
  const builtinEdited = !!builtin && (draft.label !== builtin.label || draft.instructions !== builtin.instructions);
  const atLimit = draft.templates.length >= PERSONALITY_TEMPLATE_LIMIT;
  const disabled = !ready || !!saving;

  function edit(patch: Partial<ProfileDraft>): void {
    setDraft(current => ({ ...current, ...patch })); setNotice('');
  }
  function selectPersonality(personalityId: string): void {
    const selected = resolvePersonality({ ...profileFrom(draft), personalityId });
    edit({ personalityId: selected.id, label: selected.label, instructions: selected.instructions });
  }
  async function persist(action: 'save' | 'new' | 'delete', create: () => AssistantProfile, success: string): Promise<void> {
    if (!ready || pending.current) return;
    pending.current = true; setSaving(action); setError(''); setNotice('');
    try {
      const value = parseAssistantProfile(create());
      await onSave(value);
      const saved = draftFrom(value);
      baseline.current = JSON.stringify(saved); setDraft(saved); setNotice(success);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Das Profil konnte nicht gespeichert werden.');
      onError(failure);
    } finally { pending.current = false; setSaving(''); }
  }
  function save(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (builtinEdited) return;
    void persist('save', () => ({ ...profileFrom(draft), templates: draft.templates.map(template => template.id === draft.personalityId
      ? { id: template.id, label: draft.label, instructions: draft.instructions } : template) }), 'Rufname und Persönlichkeit gespeichert.');
  }
  function saveNew(): void {
    if (atLimit) return;
    void persist('new', () => {
      const template = { id: `custom-${crypto.randomUUID()}`, label: draft.label, instructions: draft.instructions };
      return { ...profileFrom(draft), personalityId: template.id, templates: [...draft.templates, template] };
    }, 'Eigene Vorlage gespeichert und ausgewählt.');
  }
  function deleteTemplate(): void {
    if (!custom) return;
    void persist('delete', () => ({ ...profileFrom(draft), personalityId: DEFAULT_ASSISTANT_PROFILE.personalityId,
      templates: draft.templates.filter(template => template.id !== custom.id) }), 'Eigene Vorlage gelöscht. Die Standardpersönlichkeit ist ausgewählt.');
  }

  return <section className="settings-card assistant-profile-card" aria-labelledby={`${id}-title`} aria-busy={!!saving}>
    <div className="settings-card-head"><span className="service-icon"><UserRound size={22} aria-hidden="true" /></span><div>
      <h2 id={`${id}-title`}>Name &amp; Persönlichkeit</h2><p>Gib deinem Assistenten einen Rufnamen und wähle seinen Gesprächsstil.</p>
    </div></div>
    <form onSubmit={save}>
      <fieldset className="assistant-profile-fields" disabled={disabled}>
        <label className="field-label" htmlFor={`${id}-name`}>Rufname</label>
        <input className="provider-input" id={`${id}-name`} value={draft.name} maxLength={ASSISTANT_NAME_MAX_LENGTH}
          placeholder="Assistent" autoComplete="off" aria-describedby={`${id}-name-help`} onChange={event => edit({ name: event.target.value })} />
        <p className="billing-note assistant-profile-help" id={`${id}-name-help`}>Der Rufname bleibt beim Wechsel der Persönlichkeit erhalten. Ohne Eintrag heißt er „Assistent“. Die Anwendung heißt weiterhin openHiatus.</p>

        <label className="field-label" htmlFor={`${id}-personality`}>Persönlichkeit</label>
        <div className="select-wrap"><select id={`${id}-personality`} value={draft.personalityId} onChange={event => selectPersonality(event.target.value)}>
          <optgroup label="Standardvorlagen">{BUILTIN_PERSONALITIES.map(personality => <option key={personality.id} value={personality.id}>{personality.label}</option>)}</optgroup>
          {!!draft.templates.length && <optgroup label="Eigene Vorlagen">{draft.templates.map(personality => <option key={personality.id} value={personality.id}>{personality.label}</option>)}</optgroup>}
        </select><ChevronDown size={15} aria-hidden="true" /></div>

        <div className="assistant-template-heading"><strong>Vorlage bearbeiten</strong><span>{draft.templates.length} / {PERSONALITY_TEMPLATE_LIMIT} eigene Vorlagen</span></div>
        <label className="field-label" htmlFor={`${id}-template-name`}>Vorlagenname</label>
        <input className="provider-input" id={`${id}-template-name`} value={draft.label} maxLength={60} required
          autoComplete="off" onChange={event => edit({ label: event.target.value })} />
        <label className="field-label" htmlFor={`${id}-instructions`}>Stilbeschreibung</label>
        <textarea className="provider-input assistant-personality-instructions" id={`${id}-instructions`} value={draft.instructions}
          maxLength={PERSONALITY_INSTRUCTIONS_MAX_LENGTH} rows={5} required aria-describedby={`${id}-template-help`}
          onChange={event => edit({ instructions: event.target.value })} />
        <p className="billing-note assistant-profile-help" id={`${id}-template-help`}>{builtin
          ? 'Standardvorlagen bleiben erhalten. Speichere einen veränderten Stil als eigene Vorlage.'
          : 'Speichern aktualisiert diese eigene Vorlage. Für eine weitere Vorlage wähle einen neuen Vorlagennamen.'} Beschreibe konkretes Verhalten und ergänze bei Bedarf kurze Beispielantworten. Die Beschreibung bestimmt Ton und Arbeitsweise; Zugriffsrechte bleiben gleich.</p>
        {atLimit && <p className="billing-note">Alle {PERSONALITY_TEMPLATE_LIMIT} Plätze sind belegt. Du kannst eigene Vorlagen bearbeiten oder löschen.</p>}
        <div className="assistant-profile-actions">
          <button className="primary-button" type="submit" disabled={disabled || !dirty || builtinEdited} title={builtinEdited ? 'Stiländerungen als neue Vorlage speichern' : undefined}>
            {saving === 'save' ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <Save size={15} aria-hidden="true" />} Speichern
          </button>
          <button className="secondary-button" type="button" disabled={disabled || atLimit} onClick={saveNew}>
            {saving === 'new' ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />} Als neue Vorlage speichern
          </button>
          <button className="text-button subtle-danger" type="button" disabled={disabled || !custom} onClick={deleteTemplate}
            title={custom ? 'Ausgewählte eigene Vorlage löschen' : 'Standardvorlagen können nicht gelöscht werden'}>
            {saving === 'delete' ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <Trash2 size={15} aria-hidden="true" />} Löschen
          </button>
        </div>
      </fieldset>
    </form>
    {error && <p className="provider-error assistant-profile-feedback" role="alert">{error}</p>}
    <p className="assistant-profile-feedback" role="status" aria-live="polite">{notice || (dirty ? 'Nicht gespeicherte Änderungen.' : '')}</p>
  </section>;
}
