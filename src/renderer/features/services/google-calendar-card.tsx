import { t, uiLocale } from '../../../shared/i18n';
import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ExternalLink, LoaderCircle, RefreshCw, Unplug } from 'lucide-react';
import type { CalendarEvent, CalendarEventsPage, CalendarQuery, GoogleCalendarSnapshot } from '../../../shared/calendar';

const initial: GoogleCalendarSnapshot = { configured: false, status: 'disconnected', calendars: [] };
const message = (error: unknown) => error instanceof Error ? error.message : t("Google Kalender konnte nicht geladen werden.");
export function GoogleCalendarCard({ active }: { active: boolean }) {
  const [snapshot, setSnapshot] = useState(initial), [clientId, setClientId] = useState(''), [clientSecret, setClientSecret] = useState('');
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [page, setPage] = useState<CalendarEventsPage>();
  const pending = useRef(false), dirty = useRef(false), revision = useRef(0), query = useRef<CalendarQuery | undefined>(undefined);
  useEffect(() => { if (!active) return; let disposed = false; void window.openhiatus.googleCalendarSnapshot().then(value => { if (!disposed) { setSnapshot(value); if (!dirty.current) setClientId(value.clientId ?? ''); } }).catch(error => { if (!disposed) setError(message(error)); }); return () => { disposed = true; }; }, [active]);
  const selected = snapshot.calendars.find(calendar => calendar.id === snapshot.selectedCalendarId);
  async function loadEvents(cursor?: string) {
    const stamp = ++revision.current; setError('');
    if (!cursor) { const now = Date.now(); query.current = { timeMin: new Date(now).toISOString(), timeMax: new Date(now + 7 * 86400000).toISOString() }; }
    if (!query.current) return;
    try { const result = await window.openhiatus.googleCalendarEvents({ ...query.current, ...(cursor ? { cursor } : {}) }); if (stamp === revision.current) setPage(current => cursor ? { ...result, events: [...(current?.events ?? []), ...result.events] } : result); }
    catch (error) { if (stamp === revision.current) { setError(message(error)); void window.openhiatus.googleCalendarSnapshot().then(setSnapshot).catch(() => {}); } }
  }
  useEffect(() => { revision.current++; setPage(undefined); if (active && snapshot.status === 'ready') void loadEvents(); }, [active, snapshot.status, snapshot.selectedCalendarId]);
  async function action(name: string, run: () => Promise<GoogleCalendarSnapshot>) {
    if (pending.current) return; pending.current = true; setBusy(name); setError('');
    if (name === 'connect') setSnapshot(current => ({ ...current, status: 'connecting' }));
    try { const value = await run(); setSnapshot(value); if (name === 'save') { setClientSecret(''); dirty.current = false; } }
    catch (error) { if (!message(error).includes('abgebrochen')) setError(message(error)); setSnapshot(await window.openhiatus.googleCalendarSnapshot()); }
    finally { pending.current = false; setBusy(''); }
  }
  const statuses = { disconnected: t("Nicht verbunden"), connecting: t("Anmeldung läuft"), ready: t("Verbunden"), 'reauth-required': t("Erneut anmelden"), error: t("Verbindung prüfen") };
  return <section className="settings-card google-calendar-card" aria-labelledby="google-calendar-heading">
    <div className="settings-card-head"><span className="service-icon"><CalendarDays size={23} /></span><div><h2 id="google-calendar-heading">{t("Google Kalender")}</h2><p>{t("Deine Termine im Gespräch lesen, anlegen und ändern.")}</p></div><span className={`service-status ${snapshot.status === 'ready' ? 'good' : ''}`}>{statuses[snapshot.status]}</span></div>
    {snapshot.account && <p className="calendar-account">{snapshot.account}</p>}
    <details className="calendar-setup" open={!snapshot.configured || undefined}><summary>{t("Google-Anmeldung einrichten ")}<ChevronDown size={14} /></summary>
      <ol><li>{t("Ein Google-Cloud-Projekt öffnen oder anlegen und die Google Calendar API aktivieren.")}</li><li>{t("Unter Google Auth Platform die Zielgruppe einrichten. Im Testbetrieb dein Google-Konto als Testnutzer hinzufügen.")}</li><li>{t("Unter „Clients“ einen OAuth-Client vom Typ „Desktop-App“ erstellen.")}</li><li>{t("Client-ID und gegebenenfalls Client-Secret hier eintragen, speichern und mit Google verbinden.")}</li></ol>
      <button className="secondary-button" onClick={() => void window.openhiatus.openGoogleCalendarSetup().catch(error => setError(message(error)))}>{t("Google-Einrichtung öffnen ")}<ExternalLink size={14} /></button>
      <label className="field-label" htmlFor="google-calendar-client-id">{t("Desktop-Client-ID")}</label><input id="google-calendar-client-id" className="provider-input" value={clientId} autoComplete="off" spellCheck={false} disabled={!!busy} placeholder="…apps.googleusercontent.com" onChange={event => { dirty.current = true; setClientId(event.target.value); }} />
      <label className="field-label" htmlFor="google-calendar-client-secret">{t("Client-Secret ")}<span className="muted">{t("· falls von Google angegeben")}</span></label><input id="google-calendar-client-secret" type="password" className="provider-input" value={clientSecret} autoComplete="off" disabled={!!busy} placeholder={t("Optional · geschützt gespeichert")} onChange={event => { dirty.current = true; setClientSecret(event.target.value); }} />
      <p className="billing-note">{t("Verwende einen Desktop-Client. Die Anmeldung öffnet deinen normalen Browser. Zugangstoken werden lokal geschützt gespeichert. Eine andere Client-ID trennt die bisherige Verbindung.")}</p>
      <button className="secondary-button" disabled={!!busy || !clientId.trim()} onClick={() => void action('save', () => window.openhiatus.saveGoogleCalendarClient({ clientId: clientId.trim(), ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}) }))}>{busy === 'save' && <LoaderCircle size={14} className="spin" />}{t(" OAuth-App speichern")}</button>
    </details>
    <div className="provider-actions">
      {snapshot.status !== 'connecting' && <button className="primary-button" disabled={!snapshot.configured || !!busy} onClick={() => void action('connect', () => window.openhiatus.connectGoogleCalendar())}>{snapshot.status === 'ready' ? t("Mit Google erneut verbinden") : t("Mit Google verbinden")}</button>}
      {snapshot.status === 'connecting' && <button className="secondary-button" onClick={() => void window.openhiatus.cancelGoogleCalendarLogin().then(setSnapshot).catch(error => setError(message(error)))}>{t("Anmeldung abbrechen")}</button>}
      {snapshot.account && <button className="text-button subtle-danger" disabled={!!busy} onClick={() => void action('disconnect', () => window.openhiatus.disconnectGoogleCalendar())}><Unplug size={14} />{t(" Verbindung trennen")}</button>}
    </div>
    {snapshot.status === 'ready' && <>
      <label className="field-label" htmlFor="google-calendar-selection">{t("Verwendeter Kalender")}</label><div className="select-wrap"><select id="google-calendar-selection" value={snapshot.selectedCalendarId ?? ''} disabled={!!busy} onChange={event => { revision.current++; setPage(undefined); void action('select', () => window.openhiatus.selectGoogleCalendar(event.target.value)); }}>{snapshot.calendars.map(calendar => <option key={calendar.id} value={calendar.id}>{calendar.title}{calendar.accessRole === 'reader' ? t(" · nur lesen") : ''}</option>)}</select><ChevronDown size={14} /></div>
      <p className="billing-note">{t("Zeitzone: ")}{selected?.timeZone}. {selected?.accessRole === 'reader' ? t("Dieser Kalender ist nur lesbar.") : t("Persönliche Einzeltermine können angelegt und geändert werden. Einladungen, Teilnehmerverwaltung und Löschungen sind nicht Bestandteil dieser Anbindung.")}</p>
      <div className="calendar-agenda-heading"><h3>{t("Kommende 7 Tage")}</h3><button className="secondary-button" onClick={() => void loadEvents()}><RefreshCw size={14} />{t(" Termine aktualisieren")}</button></div>
      {page ? <><ul className="calendar-agenda">{page.events.map(event => <li key={event.id}><strong>{event.title}</strong><span>{eventTime(event, page.timeZone)}</span>{event.location && <small>{event.location}</small>}</li>)}</ul>{!page.events.length && <p className="billing-note">{t("Keine Termine in diesem Zeitraum.")}</p>}{page.nextCursor && <button className="secondary-button" onClick={() => void loadEvents(page.nextCursor)}>{t("Weitere Termine laden")}</button>}</> : !error && <p className="billing-note">{t("Termine werden geladen …")}</p>}
    </>}
    {(error || snapshot.error) && <p className="provider-error" role="alert">{error || snapshot.error}</p>}
    <p className="billing-note">{t("Du kannst zum Beispiel fragen: „Was steht morgen an?“ oder „Trag morgen von 10 bis 11 Uhr einen Fokusblock ein.“ Kalenderinhalte werden für entsprechende Aufträge an dein gewähltes Arbeitsmodell weitergegeben.")}</p>
  </section>;
}
function eventTime(event: CalendarEvent, timeZone: string): string {
  if (event.start.date) { const last = new Date(Date.parse(event.end.date!) - 86400000).toISOString().slice(0, 10); return t("{0}{1} · ganztägig", event.start.date, last === event.start.date ? '' : ` – ${last}`); }
  const format = (value: string) => new Date(value).toLocaleString(uiLocale(), { timeZone, dateStyle: 'medium', timeStyle: 'short' });
  return `${format(event.start.dateTime!)} – ${format(event.end.dateTime!)}`;
}
