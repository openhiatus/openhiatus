import type { CalendarEventsPage, GoogleCalendarSnapshot } from '../calendar';
import { parseCalendarTime } from '../calendar';
import { array, boolean, choice, object, optional, text, type Decoder } from './decode';
export const decodeGoogleCalendarSnapshot: Decoder<GoogleCalendarSnapshot> = object({ configured: boolean, clientId: optional(text(256)), status: choice(['disconnected', 'connecting', 'ready', 'reauth-required', 'error']), account: optional(text(300)),
  calendars: array(object({ id: text(1024), title: text(200), timeZone: text(100), accessRole: choice(['reader', 'writer', 'owner']), primary: boolean }), 100), selectedCalendarId: optional(text(1024)), error: optional(text(2000)) });
export const decodeCalendarEvents: Decoder<CalendarEventsPage> = object({ events: array(object({ id: text(1024), etag: text(256), title: text(500), start: parseCalendarTime, end: parseCalendarTime,
  location: optional(text(300)), description: optional(text(8000)), recurringEventId: optional(text(1024)) }), 25), timeZone: text(100), now: text(100), nextCursor: optional(text(4096)) });
