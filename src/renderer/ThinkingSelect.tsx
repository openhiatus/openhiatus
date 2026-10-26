import { ChevronDown } from 'lucide-react';
import { t } from '../shared/i18n';
import { DEFAULT_THINKING_LEVEL, THINKING_LEVELS, type ThinkingLevel } from '../shared/thinking';

export function ThinkingSelect({ id, value = DEFAULT_THINKING_LEVEL, disabled, onChange }: {
  id: string; value?: ThinkingLevel; disabled: boolean; onChange(value: ThinkingLevel): void;
}) {
  return <div className="thinking-control">
    <label className="field-label" htmlFor={id}>{t('Thinking-Stufe')}</label>
    <div className="select-wrap"><select id={id} value={value} disabled={disabled} onChange={event => onChange(event.target.value as ThinkingLevel)}>
      {THINKING_LEVELS.map(level => <option key={level} value={level}>{level === 'medium' ? t('medium (Standard)') : level === 'off' ? t('off (Aus)') : level}</option>)}
    </select><ChevronDown size={14} aria-hidden="true" /></div>
  </div>;
}
