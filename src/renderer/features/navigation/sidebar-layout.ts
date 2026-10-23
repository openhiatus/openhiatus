import type { SidebarMode } from '../../../shared/workspace-preferences';

/** Wide workspaces keep their labels; narrow workspaces preserve room for the task. */
export const SIDEBAR_COMPACT_QUERY = '(max-width: 959px)';

export function isSidebarCollapsed(mode: SidebarMode | undefined, compactWorkspace: boolean): boolean {
  return mode === 'collapsed' || (mode !== 'expanded' && compactWorkspace);
}
