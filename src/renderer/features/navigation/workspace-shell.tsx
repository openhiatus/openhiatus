import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, BookOpen, ChevronLeft, ChevronRight, FolderOpen, ListTodo, MessageSquare, Plus, Puzzle, RotateCcw, Settings2, Square, Unplug } from 'lucide-react';
import type { Snapshot } from '../../../shared/contracts';
import type { SidebarMode } from '../../../shared/workspace-preferences';
import { APP_DISPLAY_NAME } from '../../../shared/branding';
import { OpenhiatusMark } from '../../components/OpenhiatusMark';
import { ComputerPreview } from '../../ComputerPreview';
import { FullAccessNotice } from '../../FullAccessNotice';
import { isSidebarCollapsed, SIDEBAR_COMPACT_QUERY } from './sidebar-layout';

export type AppView = 'chat' | 'tasks' | 'services' | 'memory' | 'skills' | 'settings';
export interface WorkspaceShellProps {
  view: AppView;
  onNavigate(view: AppView): void;
  state?: Snapshot;
  ready: boolean;
  speechReady: boolean;
  newConversationDisabled: boolean;
  onNewConversation(): void;
  onStop(): Promise<void>;
  onError(error: unknown): void;
  headerActions?: ReactNode;
  children: ReactNode;
}
const destinations = [
  { id: 'chat', label: 'Gespräch', icon: MessageSquare },
  { id: 'tasks', label: 'Aufgaben', icon: ListTodo },
  { id: 'services', label: 'Dienste', icon: Unplug },
  { id: 'memory', label: 'Gedächtnis', icon: BookOpen },
  { id: 'skills', label: 'Skills', icon: Puzzle },
  { id: 'settings', label: 'Einstellungen', icon: Settings2 },
] as const;

/** Navigation owns no agent or audio lifetime; its children share one app session. */
export function WorkspaceShell({ view, onNavigate, state, ready, speechReady, newConversationDisabled,
  onNewConversation, onStop, onError, headerActions, children }: WorkspaceShellProps) {
  const content = useRef<HTMLDivElement>(null);
  const sidebarToggle = useRef<HTMLButtonElement>(null);
  const restoreSidebarFocus = useRef(false);
  const [compactWorkspace, setCompactWorkspace] = useState(() => typeof matchMedia === 'function' && matchMedia(SIDEBAR_COMPACT_QUERY).matches);
  const [modeOverride, setModeOverride] = useState<SidebarMode>();
  const [savingSidebar, setSavingSidebar] = useState(false);
  const savedMode = state?.preferences.sidebarMode ?? 'auto';
  const mode = modeOverride ?? savedMode;
  const collapsed = isSidebarCollapsed(mode, compactWorkspace);
  useEffect(() => {
    const media = matchMedia(SIDEBAR_COMPACT_QUERY);
    const update = () => setCompactWorkspace(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => { setModeOverride(undefined); }, [savedMode]);
  useEffect(() => {
    if (!savingSidebar && restoreSidebarFocus.current) {
      restoreSidebarFocus.current = false; sidebarToggle.current?.focus();
    }
  }, [savingSidebar]);
  const saveSidebarMode = async (next: SidebarMode) => {
    restoreSidebarFocus.current = true; setModeOverride(next); setSavingSidebar(true);
    try { await window.openhiatus.savePreferences({ sidebarMode: next }); }
    catch (error) { setModeOverride(undefined); onError(error); }
    finally { setSavingSidebar(false); }
  };
  const active = state?.jobs?.filter(job => ['queued', 'running', 'stopping'].includes(job.status) || job.runtimeRetained).length ?? 0;
  const connected = state?.connections.agent === 'ready';
  const label = destinations.find(destination => destination.id === view)!.label;
  return <div className={`app-shell workspace-shell${collapsed ? ' sidebar-collapsed' : ''}`} data-sidebar-mode={mode}>
    <button className="skip-navigation" onClick={() => content.current?.focus()}>Zum Inhalt</button>
    <div className="sidebar-region">
    <aside className="sidebar" id="workspace-sidebar" aria-label="Arbeitsplatz">
      <div className="brand"><OpenhiatusMark /><div className="brand-wordmark"><span className="brand-name">{APP_DISPLAY_NAME}</span><span className="brand-tagline">Dein persönlicher Agent</span></div></div>
      <button className="new-chat" disabled={newConversationDisabled} onClick={onNewConversation} aria-label="Neues Gespräch" title="Neues Gespräch"><Plus size={17} /><span className="sidebar-label">Neues Gespräch</span></button>
      <div className="nav-label">DEIN ARBEITSPLATZ</div>
      <nav aria-label="Hauptnavigation">{destinations.map(({ id, label: title, icon: Icon }) =>
        <button key={id} className={view === id ? 'active' : ''} aria-label={title} title={title} aria-current={view === id ? 'page' : undefined} onClick={() => onNavigate(id)}>
          <Icon size={18} /><span className="sidebar-label">{title}</span>
          {id === 'tasks' && active > 0 && <span className="nav-count" aria-label={`${active} aktive Aufgaben`}>{active}</span>}
          {id === 'settings' && !ready && <span className="setup-dot" aria-hidden="true" />}
        </button>)}</nav>
      <div className="sidebar-bottom">
        <button className="workspace-link" aria-label="Arbeitsordner öffnen" title="Arbeitsordner öffnen" onClick={() => void window.openhiatus.openWorkspace().catch(onError)}><FolderOpen size={16} /><span className="sidebar-label">Arbeitsordner</span><ArrowRight size={13} /></button>
        <button className="connection-summary" onClick={() => onNavigate('settings')} aria-label="Modell- und Sprachzugänge verwalten" title={`${connected ? 'Modell verbunden' : 'Einrichtung öffnen'} · ${speechReady ? 'Sprache verbunden' : 'Sprache einrichten'}`}>
          <span className={`status-dot ${ready ? 'good' : 'warning'}`} /><span className="sidebar-label">{connected ? 'Modell verbunden' : 'Einrichtung öffnen'}<small>{speechReady ? 'Sprache verbunden' : 'Sprache einrichten'}</small></span><Unplug className="connection-icon" size={18} /><ChevronRight className="connection-chevron" size={15} />
        </button>
        <div className="sidebar-footer"><span className="footer-location">AUF DEINEM RECHNER</span><span className="footer-version"><span className="sidebar-label">{APP_DISPLAY_NAME} </span>v{state?.version ?? '…'}</span></div>
      </div>
    </aside>
    <div className="sidebar-controls">
      {mode !== 'auto' && <button className="sidebar-auto" disabled={savingSidebar} aria-label="Navigation automatisch anpassen" title="Automatisch an die Fenstergröße anpassen" onClick={() => void saveSidebarMode('auto')}><RotateCcw size={13} /></button>}
      <button ref={sidebarToggle} className="sidebar-toggle" disabled={savingSidebar} aria-expanded={!collapsed} aria-controls="workspace-sidebar" aria-label={collapsed ? 'Navigation ausklappen' : 'Navigation einklappen'} title={collapsed ? 'Navigation ausklappen' : 'Navigation einklappen'} onClick={() => void saveSidebarMode(collapsed ? 'expanded' : 'collapsed')}>
        {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
      </button>
    </div>
    </div>
    <div className="main-shell">
      <header className="topbar">
        <div className="breadcrumb"><span>Dein Arbeitsplatz</span><ChevronRight size={13} /><strong>{label}</strong></div>
        <div className="topbar-actions">
          <ComputerPreview enabled={!!state?.preferences.fullAccessAcknowledged} onStop={onStop} />
          {state?.preferences.fullAccessAcknowledged && <FullAccessNotice acknowledged busy={false} onAcknowledge={() => {}} />}
          {headerActions}
          <button className="stop-all" onClick={() => void onStop()} title="openHiatus stoppen: Esc oder Strg + Alt + F12. Eigenständige Arbeitsfenster laufen weiter."><Square size={12} fill="currentColor" /> Stopp <kbd>Esc</kbd></button>
        </div>
      </header>
      <div className="workspace-content" ref={content} tabIndex={-1}>{children}</div>
    </div>
  </div>;
}
