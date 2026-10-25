import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronRight, Languages, LoaderCircle } from 'lucide-react';
import { UI_LANGUAGES, type UiLanguage } from '../../../shared/ui-language';
import { t } from '../../../shared/i18n';
import { LanguageFlag } from './language-flag';

export function LanguageSwitcher({ language, ready, onError }: { language: UiLanguage; ready: boolean; onError(error: unknown): void }) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const options = useRef<Array<HTMLButtonElement | null>>([]);
  const changing = useRef(false);
  const [open, setOpen] = useState(false), [pending, setPending] = useState(false);
  const selected = UI_LANGUAGES.find(item => item.id === language)!;
  const close = () => { if (menu.current?.matches(':popover-open')) menu.current.hidePopover(); };

  function position(): void {
    if (!trigger.current || !menu.current) return;
    const anchor = trigger.current.getBoundingClientRect(), popup = menu.current;
    const width = Math.min(264, innerWidth - 24), height = Math.min(popup.offsetHeight || 376, innerHeight - 24);
    popup.style.left = `${Math.max(12, Math.min(anchor.right + 12, innerWidth - width - 12))}px`;
    popup.style.top = `${Math.max(12, Math.min(anchor.bottom - height, innerHeight - height - 12))}px`;
  }
  useEffect(() => {
    if (!open) return;
    const observer = new ResizeObserver(position); if (trigger.current) observer.observe(trigger.current);
    window.addEventListener('resize', position); document.addEventListener('scroll', position, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', position); document.removeEventListener('scroll', position, true); };
  }, [open]);
  async function choose(next: UiLanguage): Promise<void> {
    if (!ready || changing.current) return;
    changing.current = true; setPending(true);
    try { if (next !== language) await window.openhiatus.savePreferences({ uiLanguage: next }); }
    catch (error) { onError(error); }
    finally {
      const wasOpen = menu.current?.matches(':popover-open');
      changing.current = false; setPending(false); close(); if (wasOpen) trigger.current?.focus();
    }
  }
  function navigate(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape' || event.key === 'Tab') {
      close();
      // Escape still reaches the application's global Stop handler.
      return;
    }
    const current = options.current.findIndex(option => option === document.activeElement);
    const index = event.key === 'ArrowDown' ? (current + 1) % UI_LANGUAGES.length
      : event.key === 'ArrowUp' ? (current - 1 + UI_LANGUAGES.length) % UI_LANGUAGES.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? UI_LANGUAGES.length - 1 : undefined;
    if (index !== undefined) { event.preventDefault(); options.current[index]?.focus(); }
  }
  return <div className="sidebar-language">
    <button ref={trigger} type="button" className="language-trigger" popoverTarget={id} disabled={!ready}
      aria-haspopup="menu" aria-expanded={open} aria-controls={id}
      aria-label={`${t('Sprache der Oberfläche')} · Language · 语言 · ${selected.name}`} title={`${t('Sprache der Oberfläche')} · Language · 语言`}
      onKeyDown={event => {
        if (event.key === 'Escape') close();
        else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (!menu.current?.matches(':popover-open')) menu.current?.showPopover(); }
      }}>
      <Languages className="language-symbol" size={22} aria-hidden="true" />
      <span className="language-trigger-text"><small><span lang="en">Language</span> · <span lang="zh-CN">语言</span></small>
        <span className="language-current"><LanguageFlag language={language} /><span lang={language}>{selected.name}</span></span></span>
      <ChevronRight className="language-chevron" size={14} aria-hidden="true" />
    </button>
    <div ref={menu} id={id} popover="auto" className="language-menu" role="menu" aria-label={t('Sprache der Oberfläche')} aria-busy={pending}
      onBeforeToggle={event => { if (event.newState === 'open') position(); }}
      onToggle={event => {
        const showing = event.newState === 'open'; setOpen(showing);
        if (showing) { position(); options.current[UI_LANGUAGES.findIndex(item => item.id === language)]?.focus(); }
      }} onKeyDown={navigate}>
      <div className="language-menu-heading"><Languages size={18} aria-hidden="true" /><span lang="en">Language</span><span aria-hidden="true">·</span><span lang="zh-CN">语言</span>
        {pending && <LoaderCircle size={14} className="spin" aria-hidden="true" />}</div>
      {UI_LANGUAGES.map((item, index) => <button key={item.id} ref={element => { options.current[index] = element; }} type="button"
        role="menuitemradio" aria-checked={item.id === language} lang={item.id} tabIndex={-1} disabled={pending} onClick={() => void choose(item.id)}>
        <LanguageFlag language={item.id} /><span>{item.name}</span>{item.id === language && <Check size={16} aria-hidden="true" />}
      </button>)}
    </div>
  </div>;
}
