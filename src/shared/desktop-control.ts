import { localized } from './i18n';
/** Live host state, never inferred from task titles and never persisted. */
export type DesktopControlPhase = 'free' | 'preparing' | 'active' | 'stopping' | 'error';

export const desktopControlCopy: Record<DesktopControlPhase, { title: string; detail: string }> = localized({
  free: { title: 'Arbeitsplatz frei', detail: 'Du kannst Maus und Tastatur benutzen.' },
  preparing: { title: 'Agent übernimmt den Arbeitsplatz', detail: 'Bitte Tasten und Maustasten loslassen. Esc bricht ab.' },
  active: { title: 'Agent steuert deinen PC', detail: 'Maus und Tastatur sind für deine Eingaben gesperrt.' },
  stopping: { title: 'Agent wird gestoppt', detail: 'Die Steuerung wird beendet und dein Arbeitsplatz freigegeben.' },
  error: { title: 'Desktopsteuerung unterbrochen', detail: 'Das Beenden konnte nicht vollständig bestätigt werden. Bitte Stopp erneut versuchen.' },
});
