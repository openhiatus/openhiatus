export interface GoogleCalendarClient { clientId: string; clientSecret?: string; }
export interface CalendarEntry { id: string; title: string; timeZone: string; accessRole: 'reader' | 'writer' | 'owner'; primary: boolean; }
export interface GoogleCalendarSnapshot { configured: boolean; clientId?: string; status: 'disconnected' | 'connecting' | 'ready' | 'reauth-required' | 'error'; account?: string; calendars: CalendarEntry[]; selectedCalendarId?: string; error?: string; }
export interface CalendarTime { date?: string; dateTime?: string; timeZone?: string; }
export interface CalendarEvent { id: string; etag: string; title: string; start: CalendarTime; end: CalendarTime; location?: string; description?: string; recurringEventId?: string; }
export interface CalendarQuery { timeMin: string; timeMax: string; query?: string; cursor?: string; }
export interface CalendarEventsPage { events: CalendarEvent[]; timeZone: string; now: string; nextCursor?: string; }
export interface CalendarEventInput { title: string; start: CalendarTime; end: CalendarTime; location?: string; description?: string; }
export interface GoogleCalendarApi {
  googleCalendarSnapshot(): Promise<GoogleCalendarSnapshot>;
  saveGoogleCalendarClient(client: GoogleCalendarClient): Promise<GoogleCalendarSnapshot>;
  connectGoogleCalendar(): Promise<GoogleCalendarSnapshot>;
  cancelGoogleCalendarLogin(): Promise<GoogleCalendarSnapshot>;
  disconnectGoogleCalendar(): Promise<GoogleCalendarSnapshot>;
  selectGoogleCalendar(id: string): Promise<GoogleCalendarSnapshot>;
  googleCalendarEvents(query: CalendarQuery): Promise<CalendarEventsPage>;
  openGoogleCalendarSetup(): Promise<void>;
}
export class CalendarValidationError extends Error {}

export function calendarObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.keys(value).some(key => !keys.includes(key))) throw new CalendarValidationError('Ungültige Kalenderangaben.');
  return value as Record<string, unknown>;
}
export function calendarText(value: unknown, max: number, label: string, multiline = false): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value)) throw new CalendarValidationError(`${label} fehlt oder ist ungültig.`);
  return value.trim();
}
export function parseGoogleCalendarClient(value: unknown): GoogleCalendarClient {
  const row = calendarObject(value, ['clientId', 'clientSecret']), clientId = calendarText(row.clientId, 256, 'Google-Client-ID');
  if (!/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new CalendarValidationError('Bitte eine Google-OAuth-Client-ID für eine Desktop-App eingeben.');
  if (row.clientSecret === '') return { clientId, clientSecret: '' };
  return { clientId, ...(row.clientSecret === undefined ? {} : { clientSecret: calendarText(row.clientSecret, 2048, 'Client-Secret') }) };
}
function date(value: string): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }
export function calendarTimestamp(value: unknown): string {
  const result = calendarText(value, 60, 'Zeitpunkt');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(result) || !date(result.slice(0, 10)) || !Number.isFinite(Date.parse(result)) || +result.slice(11, 13) > 23 || +result.slice(14, 16) > 59 || +result.slice(17, 19) > 59) throw new CalendarValidationError('Zeitpunkte benötigen Datum, Uhrzeit und UTC-Offset, zum Beispiel 2026-10-24T10:00:00+02:00.');
  return result;
}
export function parseCalendarTime(value: unknown): CalendarTime {
  const row = calendarObject(value, ['date', 'dateTime', 'timeZone']);
  if ((row.date === undefined) === (row.dateTime === undefined)) throw new CalendarValidationError('Datum oder genauer Zeitpunkt ist erforderlich.');
  if (row.date !== undefined) { if (typeof row.date !== 'string' || !date(row.date) || row.timeZone !== undefined) throw new CalendarValidationError('Ganztagstermine benötigen gültige Kalenderdaten.'); return { date: row.date }; }
  const dateTime = calendarTimestamp(row.dateTime);
  if (row.timeZone === undefined) return { dateTime };
  const timeZone = calendarText(row.timeZone, 100, 'Zeitzone');
  try { new Intl.DateTimeFormat('de', { timeZone }).format(); } catch { throw new CalendarValidationError('Unbekannte Kalenderzeitzone.'); }
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(dateTime));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  if (`${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}` !== dateTime.slice(0, 19)) throw new CalendarValidationError('UTC-Offset, Datum und Zeitzone passen nicht zusammen. Bitte die Sommerzeit beachten.');
  return { dateTime, timeZone };
}
export function parseCalendarQuery(value: unknown): CalendarQuery {
  const row = calendarObject(value, ['timeMin', 'timeMax', 'query', 'cursor']), timeMin = calendarTimestamp(row.timeMin), timeMax = calendarTimestamp(row.timeMax);
  if (Date.parse(timeMax) <= Date.parse(timeMin) || Date.parse(timeMax) - Date.parse(timeMin) > 366 * 86400000) throw new CalendarValidationError('Der Suchzeitraum muss positiv und höchstens 366 Tage lang sein.');
  return { timeMin, timeMax, ...(row.query === undefined ? {} : { query: calendarText(row.query, 200, 'Suchtext') }), ...(row.cursor === undefined ? {} : { cursor: calendarText(row.cursor, 4096, 'Fortsetzungsverweis') }) };
}
export function parseCalendarEventInput(value: unknown): CalendarEventInput {
  const row = calendarObject(value, ['title', 'start', 'end', 'location', 'description']), start = parseCalendarTime(row.start), end = parseCalendarTime(row.end);
  const duration = Date.parse(end.date ?? end.dateTime!) - Date.parse(start.date ?? start.dateTime!);
  if (!!start.date !== !!end.date || duration <= 0 || duration > 366 * 86400000 || (start.timeZone ?? '') !== (end.timeZone ?? '')) throw new CalendarValidationError('Beginn und Ende müssen zusammenpassen; das Ende liegt nach dem Beginn. Bei Ganztagsterminen ist das Enddatum exklusiv.');
  return { title: calendarText(row.title, 500, 'Termintitel'), start, end,
    ...(row.location === undefined ? {} : { location: typeof row.location === 'string' && !row.location.trim() ? '' : calendarText(row.location, 300, 'Ort') }),
    ...(row.description === undefined ? {} : { description: typeof row.description === 'string' && !row.description.trim() ? '' : calendarText(row.description, 8000, 'Beschreibung', true) }) };
}
