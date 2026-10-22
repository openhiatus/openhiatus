import { useRef, type ReactNode } from 'react';
import { ArrowRight, BookOpen, ChevronRight, FolderOpen, ListTodo, MessageSquare, Plus, Puzzle, Settings2, Square, Unplug } from 'lucide-react';
import type { Snapshot } from '../../../shared/contracts';
import { APP_DISPLAY_NAME } from '../../../shared/branding';
import { OpenhiatusMark } from '../../components/OpenhiatusMark';
import { ComputerPreview } from '../../ComputerPreview';
import { FullAccessNotice } from '../../FullAccessNotice';

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
  { id: 'memory', label: 'Gedächtnis & Identität', icon: BookOpen },
  { id: 'skills', label: 'Skills', icon: Puzzle },
  { id: 'settings', label: 'Einstellungen', icon: Settings2 },
] as const;

/** Navigation owns no agent or audio lifetime; its children share one app session. */
export function WorkspaceShell({ view, onNavigate, state, ready, speechReady, newConversationDisabled,
  onNewConversation, onStop, onError, headerActions, children }: WorkspaceShellProps) {
  const content = useRef<HTMLDivElement>(null);
  const active = state?.jobs?.filter(job => ['queued', 'running', 'stopping'].includes(job.status) || job.runtimeRetained).length ?? 0;
  const connected = state?.connections.agent === 'ready';
  const label = destinations.find(destination => destination.id === view)!.label;
  return <div className="app-shell workspace-shell">
    <button className="skip-navigation" onClick={() => content.current?.focus()}>Zum Inhalt</button>
    <aside className="sidebar">
      <div className="brand"><OpenhiatusMark /><div className="brand-wordmark"><span className="brand-name">{APP_DISPLAY_NAME}</span><span className="brand-tagline">Dein persönlicher Agent</span></div></div>
      <button className="new-chat" disabled={newConversationDisabled} onClick={onNewConversation}><Plus size={17} /> Neues Gespräch</button>
      <div className="nav-label">DEIN ARBEITSPLATZ</div>
      <nav aria-label="Hauptnavigation">{destinations.map(({ id, label: title, icon: Icon }) =>
        <button key={id} className={view === id ? 'active' : ''} aria-current={view === id ? 'page' : undefined} onClick={() => onNavigate(id)}>
          <Icon size={18} /><span>{title}</span>
          {id === 'tasks' && active > 0 && <span className="nav-count" aria-label={`${active} aktive Aufgaben`}>{active}</span>}
          {id === 'settings' && !ready && <span className="setup-dot" aria-hidden="true" />}
        </button>)}</nav>
      <div className="sidebar-bottom">
        <button className="workspace-link" onClick={() => void window.openhiatus.openWorkspace().catch(onError)}><FolderOpen size={16} /> Arbeitsordner <ArrowRight size={13} /></button>
        <button className="connection-summary" onClick={() => onNavigate('settings')} aria-label="Modell- und Sprachzugänge verwalten">
          <span className={`status-dot ${ready ? 'good' : 'warning'}`} /><span>{connected ? 'Modell verbunden' : 'Einrichtung öffnen'}<small>{speechReady ? 'Sprache verbunden' : 'Sprache einrichten'}</small></span><ChevronRight size={15} />
        </button>
        <div className="sidebar-footer"><span className="footer-location">AUF DEINEM RECHNER</span><span className="footer-version">{APP_DISPLAY_NAME} v{state?.version ?? '…'}</span></div>
      </div>
    </aside>
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
