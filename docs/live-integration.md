# GPT-Live mit separatem Codex-Arbeitsagenten

> Historische Referenz einer früheren Entwicklungsreihe. Architektur, Bedienpfade, Versionsnummern und damalige Prüfergebnisse beschreiben den datierten Stand, keine neue Abnahme der aktuellen Pi-basierten Version. Lokale Nachweisdateien sind kein Bestandteil der öffentlichen Quellablage. Aktuelle Einrichtung und Prüfungen stehen in der README und im aktuellen Testprotokoll.

Stand: 6. Oktober 2026, Version 0.3.10. Implementierung für M2 mit korrigierter lokaler Audiowiedergabe. Die Protokolltests sind Offline-Nachweise; die bezahlte Abnahme mit einem freigeschalteten API-Zugang erfolgt separat.

`LiveClient` läuft ausschließlich im Electron-Hauptprozess. Er verbindet sich mit `wss://api.openai.com/v1/live/sessions`, authentifiziert sich über einen dort gelesenen API-Key und startet ausdrücklich **gpt-live-1**, die Stimme Marin und **Client Delegation**. Es gibt keinen Wechsel zu einem Ersatzmodell, keine automatische Wiederverbindung und keinen zusätzlich vom Anbieter gestarteten Responses-Arbeitsagenten. Der bereits vorhandene Codex-App-Server bleibt für Werkzeug- und Dateiarbeit zuständig.

Die erste Nachricht ist `session.start`; vor der bestätigten `session.started` werden keine Mikrofonframes oder anderen Anwendungskommandos gesendet. Die bestätigte Konfiguration muss das angeforderte Modell, PCM-Format, die Client-Delegation und `store:false` enthalten. `store:false` deaktiviert die Sitzungsspeicherung für spätere Live-Forks; es ist keine Zusage vollständiger providerseitiger Datenfreiheit.

Audio ist rohes PCM16 little endian, mono, 24 kHz. Der Renderer übernimmt Mikrofon, Wiedergabe und nötige Resampling-Schritte; der Hauptprozess erhält und versendet ausschließlich begrenzte Base64-Frames. Containerformate wie WAV/WebM, unvollständige Samples oder ungültiges Base64 werden abgelehnt. Bei zu großem ausgehendem Audiostau wird die Verbindung beendet. Kommen acht Sekunden lang keine Mikrofonframes an, beendet ein unabhängiger Zeitwächter die bezahlte Sitzung; das Zeitlimit für die gesamte Sitzung wird zusätzlich im Controller erzwungen.

Der Startkontext enthält bis zu 128 aktuelle Benutzer-/Assistentennachrichten. Benutzertext verwendet `input_text`, Assistententext `output_text`. Ein konservatives UTF-8-Bytebudget einschließlich Nachrichtenreserve hält den Verlauf unter der dokumentierten Grenze von 8.192 Tokens. Sehr alte oder überlange Inhalte werden gekürzt. Dies ist kein Langzeitgedächtnis.

## Lokale Wiedergabe ab 0.3.10

Vorausgelieferte Sprache ist kein Ausgabegerätefehler. Die bisherige Abbruchgrenze von 1,5 Sekunden entfällt. Der Renderer bewahrt alle gültigen PCM-Samples in einer FIFO und plant höchstens 0,5 Sekunden voraus, in Abschnitten von höchstens 250 Millisekunden. Abgespielte Abschnitte geben Speicher frei und planen den nächsten Abschnitt. Es gibt keine Beschleunigung und kein stilles Wegwerfen von Audio, um aufzuholen. Hauptprozess und Renderer akzeptieren dieselbe Paketgrenze von 384.000 PCM-Bytes, entsprechend acht Sekunden Sprache.

Bei einem vorübergehend suspendierten oder unterbrochenen AudioContext bleiben geplante Sprache und FIFO erhalten. openHiatus versucht bis zu sechs Sekunden lang, den vorhandenen Kontext wieder aufzunehmen. Das öffnet keine zweite Anbieter-Sitzung. Nur ein geschlossener Audiokontext beziehungsweise ein dauerhaft erfolgloser Wiederaufnahmeversuch wird als lokaler Ausfall behandelt. Live beenden und Stopp schließen den Kontext, stoppen geplante Quellen und verwerfen die verbleibende Sprache sofort.

Als Grenze gegen tatsächliche Speicherüberlastung bleiben höchstens 32 MiB ausstehende Float32-Samples erhalten, einschließlich bereits geplanter Abschnitte. Das entspricht etwa 5,8 Minuten noch ungesprochener Ausgabe. Dieser Ausnahmefall endet mit einem ausdrücklichen Speicherfehler; kurze Lieferbursts lösen ihn nicht aus. Mikrofon-/Netzwerk-Wächter und das vom Nutzer gewählte Sitzungszeitlimit gelten zusätzlich.

## Aufgaben und Kontext

`session.delegation.created` enthält eine Delegations-ID und einen Zeitversatz, aber keinen fertigen Arbeitsauftrag. Der Controller bildet den Auftrag aus dem tatsächlichen Gespräch und dem geprüften Aufgabenstatus. Wiederholte Delegations-IDs lösen im Client keine zweite Aufgabe aus. Ebenso werden doppelte Transkriptereignisse anhand ihrer Event-ID verworfen. Live erhält Statusinformationen; reine Statusfragen sollen keinen erneuten Codex-Auftrag verursachen.

Bei einem neuen oder korrigierten Auftrag während laufender Arbeit verwendet M2 einen vorsichtigen Ablauf: Der Controller stoppt die bestehende Aufgabe und verlangt einen vollständigen korrigierten Auftrag. Es gibt keine automatische transaktionale Rücknahme bereits geschriebener Dateien. Eine Unterbrechung der Sprache ist kein Nachweis, dass Codex gestoppt wurde; dafür gilt weiterhin der bestätigte Codex-Abbruch.

Bestätigte Arbeitsergebnisse werden mit `session.commentary.append` übertragen. `thinking` liefert kurze Fakten oder Fortschritt, `instructions` steuert das Gespräch. Delegationsbezogene Updates behalten die ursprüngliche ID; allgemeiner Kontext verwendet ausdrücklich `delegation_id:null`. IDs aus einer früheren Sitzung werden nicht übernommen. Inhalte sind reine Strings. Einzelne Updates bleiben unter 400 UTF-8-Bytes, bevorzugt an Satz-, Absatz- oder Wortgrenzen getrennt, und damit konservativ unter 500 Tokens pro Append. Umfangreiche Ausgaben werden begrenzt; vollständig stehen sie weiterhin im openHiatus-Gespräch. Eine Append-Bestätigung ist kein Nachweis bereits gehörter Sprache.

## Sitzungsende und Abrechnung

Beim lokalen Beenden werden sofort neue Mikrofonframes, Ausgaben, Transkripte und Delegationen blockiert. `session.close` wird gesendet; der Client wartet höchstens fünf Sekunden auf `session.closed`. Erst dieses Ereignis mit gültigem finalem `usage.seconds` bestätigt die endgültige Nutzungsdauer. Bei Timeout oder Verbindungsabbruch wird der Socket beendet und der letzte bekannte Wert ausdrücklich als unbestätigt gemeldet. Verspätete Ereignisse können weder eine geschlossene Sitzung noch einen Arbeitsauftrag reaktivieren.

`session.usage.updated.usage.seconds` ist eine kumulative Momentaufnahme: 12 und danach 15 Sekunden ergeben **15**, nicht 27. Codex-Nutzung bleibt davon getrennt. Ein fehlender endgültiger Wert wird nicht geschätzt oder als sichere Endabrechnung ausgegeben.

API-Keys verlassen den Hauptprozess nicht in Richtung UI. Zugangsdaten werden aus ausgehendem Kontext und Transkripttext entfernt. Rohe Provider-Fehler, HTTP-Antwortkörper, Header oder Key-Echos gelangen nicht in Logs oder Benutzerfehler. HTTP-Authentifizierungsfehler und Limits werden mit festen verständlichen Meldungen dargestellt.

## Prüfung

`tests/live.test.ts` prüft mit injizierten WebSocket-Gegenstellen unter anderem den Startvertrag, Stop-vor-Open, Doppelstart, Kontextgrenzen, kumulative Nutzung, bestätigten und unbestätigten Abschluss, verspätete Ereignisse, Delegations- und Transkript-Deduplizierung, originale Rückgabe-IDs, UTF-8-Grenzen, Fehlerredaktion, ungültiges PCM/JSON, Audiostau und fehlende Mikrofonframes. Diese Tests verursachen keine API-Kosten und ersetzen keine echte Sprach-, Zugangs- oder Abrechnungsabnahme.

`tests/live-audio.test.ts` prüft zusätzlich vollständige Sample-Reihenfolge bei gebündelter Ausgabe, große zulässige Pakete, begrenzte Planung, Audio-Wiederaufnahme, dauerhaften lokalen Ausfall, Speichergrenze und sofortiges Beenden. `npm run build` und anschließend `npm run test:live-playback` führen den Wiedergabeablauf im echten Electron/Chromium mit synthetischem Mikrofon und stummgeschaltetem WebAudio aus. Anbieter-IPC wird im isolierten Testprofil ersetzt; es werden weder Schlüssel verwendet noch kostenpflichtige Sitzungen angelegt. Mit `OPENHIATUS_TEST_APP` lässt sich dasselbe Skript gegen die gepackte EXE ausführen. Nachweis: `artifacts/live-playback-acceptance.json`; die echte persönliche Mikrofon-/Lautsprecherabnahme bleibt davon getrennt.

Offizielle Referenzen: [Live-WebSockets](https://developers.openai.com/api/docs/guides/voice-websockets?api=live), [Sitzungen und Nutzung](https://developers.openai.com/api/docs/guides/live-conversations), [Client Delegation](https://developers.openai.com/api/docs/guides/live-delegation?delegation-mode=client).
