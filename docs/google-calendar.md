# Google Calendar

openHiatus supports one Google account with one selected calendar at a time. Connect it under **Dienste → Google Kalender**. An existing calendar connection is restored after restart. Calendar access is separate from model and speech credentials.

## Set up your Google client

1. Open the [Google Cloud console](https://console.cloud.google.com/) and select or create a project.
2. Enable the Google Calendar API in the [API library](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com).
3. Configure the Google Auth Platform audience and consent details. When using a test audience, add your own Google account as a test user.
4. Create an OAuth client of type **Desktop app**. Copy its client ID and, if provided, client secret.
5. Enter them in openHiatus and choose **OAuth-App speichern**. Then choose **Mit Google verbinden** and approve the calendar permissions in your browser.
6. Select the calendar openHiatus should use. Its access level and time zone are shown beside the agenda.

The app uses Google's [desktop OAuth flow](https://developers.google.com/identity/protocols/oauth2/native-app), with a loopback listener, State validation and PKCE. It requests [`calendar.calendarlist.readonly` and `calendar.events`](https://developers.google.com/workspace/calendar/api/auth). A shared verified openHiatus Google client is not included; public distribution with a shared client requires the corresponding Google consent and verification setup. Access policies and test-mode restrictions are controlled by Google and the selected Cloud project.

## Use it in conversation

Examples:

- “What is on my calendar tomorrow?”
- “Create a focus block tomorrow from 10 to 11.”
- “Move that focus block to 2 in the afternoon.”

The conversation model delegates calendar work to a working agent. Calendar tools use the account and calendar chosen in the UI; model arguments cannot switch them. A calendar switch or disconnect invalidates already bound service tools. The model receives selected-calendar context and the data needed for its calendar task. Merely opening the agenda does not send it to a model.

The initial tools list events, retrieve an event, create a personal event and update a personal event. There is no deletion tool, participant management or invitation sending. Existing events with attendees and series-wide edits must be handled in Google Calendar. Recurring instances can be read; a personal instance without attendees can be edited individually. Calendar-list metadata is refreshed by reconnecting.

## Dates and changes

Timed events require an explicit UTC offset. When a time zone is supplied, it must match the date and offset, including daylight saving time. All-day events use dates with an exclusive end date. Event searches are limited to 366 days and return up to 25 events per page.

Titles support 500 characters, locations 300 and descriptions 8,000. Longer external descriptions are marked as excerpts. Updates cannot write a truncated field over its complete Google value; those changes must be made in Google Calendar.

Updates use the exact previously read ETag and [Google's conditional modification support](https://developers.google.com/workspace/calendar/api/guides/version-resources). A conflicting update is rejected instead of overwriting another edit. Creates use a deterministic event ID for the same task and request ID, so a repeated call can resolve the existing event. A changed payload cannot reuse that ID as a different request. Network errors or incomplete write confirmations are reported as uncertain; the calendar must be checked before retrying. There is no automatic replay after Stop or restart.

## Local storage and disconnect

The Desktop client configuration, access token, refresh token, account and calendar selection are kept in the existing Windows-protected credential store. Public UI and agent results contain projected calendar data, not token objects. Token renewal is shared across concurrent requests. Shutdown waits for an in-flight renewal to preserve a rotated refresh token.

**Verbindung trennen** removes local account tokens and calendar metadata and attempts to revoke the Google grant. The Desktop client configuration remains for reconnecting. If revocation cannot be confirmed, the app reports that state so access can also be checked in Google's connected-app settings. Saving a different client ID replaces the local connection; it does not silently reuse the previous account.

## Validation

`tests/google-calendar.test.ts` checks actual loopback callbacks with simulated Google replies, PKCE, State, missing scopes, cancellation, refresh, restart, ETags, idempotent creation, daylight saving time, uncertain writes, account authority and protected storage contracts.

`node scripts/google-calendar-ui-check.mjs` uses an isolated copy of the app with test-only Google responses. It exercises setup, login/cancel, calendar selection, the agenda, real dialog/worker service calls, create/update, encrypted storage, restart and disconnect. The mock shim is not part of the production app.

`node scripts/google-calendar-setup-ui-check.mjs` exercises the actual production entry point and is included in the Windows package check. It verifies setup, retained drafts, encrypted credentials, sanitized IPC and restart, without opening a Google login or accessing a real account. A real Google-account login still requires the user's client configuration and consent; automated checks do not establish live account access.
