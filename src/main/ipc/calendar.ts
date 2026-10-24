import { calendarText, parseGoogleCalendarClient, parseCalendarQuery } from '../../shared/calendar';
import { command, noArgs } from './command';
import type { IpcPorts } from './ports';
export function calendarHandlers(ports: IpcPorts) {
  const calendar = () => { if (!ports.calendar) throw Error('Google Kalender ist in dieser Laufzeit nicht verfügbar.'); return ports.calendar; };
  return {
    googleCalendarSnapshot: command('googleCalendarSnapshot', 0, noArgs, () => calendar().googleCalendarSnapshot()),
    saveGoogleCalendarClient: command('saveGoogleCalendarClient', 1, args => [parseGoogleCalendarClient(args[0])], client => calendar().saveGoogleCalendarClient(client)),
    connectGoogleCalendar: command('connectGoogleCalendar', 0, noArgs, () => calendar().connectGoogleCalendar()),
    cancelGoogleCalendarLogin: command('cancelGoogleCalendarLogin', 0, noArgs, () => calendar().cancelGoogleCalendarLogin()),
    disconnectGoogleCalendar: command('disconnectGoogleCalendar', 0, noArgs, () => calendar().disconnectGoogleCalendar()),
    selectGoogleCalendar: command('selectGoogleCalendar', 1, args => [calendarText(args[0], 1024, 'Kalender')], id => calendar().selectGoogleCalendar(id)),
    googleCalendarEvents: command('googleCalendarEvents', 1, args => [parseCalendarQuery(args[0])], query => calendar().googleCalendarEvents(query)),
    openGoogleCalendarSetup: command('openGoogleCalendarSetup', 0, noArgs, () => calendar().openGoogleCalendarSetup()),
  };
}
