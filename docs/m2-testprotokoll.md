# M2 – Integration und Abnahme

> Historische Referenz einer früheren Entwicklungsreihe. Architektur, Bedienpfade, Versionsnummern und damalige Prüfergebnisse beschreiben den datierten Stand, keine neue Abnahme der aktuellen Pi-basierten Version. Lokale Nachweisdateien sind kein Bestandteil der öffentlichen Quellablage. Aktuelle Einrichtung und Prüfungen stehen in der README und im aktuellen Testprotokoll.

Stand: 5. Oktober 2026, Version 0.2.0. **Der M2-Kernablauf einschließlich Kontextwechsel, getrennter Abbruchsteuerung und Zeitlimit wurde in einer lokalen Windows-Testinstallation geprüft.** Der vorhandene M1-Teststand bleibt im [M1-Testprotokoll](m1-testprotokoll.md) erhalten.

## Implementierter Ablauf

- Eigener, mit Windows-DPAPI gespeicherter OpenAI-Projekt-API-Key unter Verbindungen. Bestehende Inworld-Zugangsdaten und Codex-Anmeldung bleiben erhalten. Kein .env-Schritt.
- GPT-Live 1 führt das Gespräch, Client Delegation übergibt an den bestehenden Codex-Arbeitsagenten im geschützten Demoordner. Kein Ersatzmodell und keine automatische Wiederverbindung.
- Standard/Live über Schaltflächen; im geprüften Standardtranskript löst „wechsel zu live“ beim Senden den lokalen Wechsel aus. In Live schließen „wechsel zurück“ beziehungsweise „Live beenden“ die Sprachsitzung. Spracherkennung bleibt fehlbar; die unabhängige Stopptaste und Tastaturwege bleiben immer verfügbar.
- Mikrofon und Ausgabe werden vor dem kostenpflichtigen Sitzungsstart vorbereitet. PCM16 mono/24 kHz, Echo-Unterdrückung, gewählte Geräte, kontinuierlicher Strom einschließlich Stille. Audioüberlauf führt zu sichtbarem Abbruch statt still ausgelassener Wörter.
- Gesprächsverlauf und Aufgabenstatus werden beim Wechsel übernommen. Historie ist begrenzt; das spätere mehrstufige Gedächtnis wird nicht vorgetäuscht. Transkriptfragmente sind keine garantiert abgeschlossenen Äußerungen. Delegationen warten kurz auf zugehöriges Transkript und werden anhand von Kennung und Aufgabenstand entdoppelt.
- Neue Arbeitsanweisung während einer laufenden Live-Aufgabe stoppt zuerst den bisherigen Auftrag. Danach wird ein vollständiger neuer Auftrag erfragt. Bereits erfolgte Dateiänderungen bleiben bestehen; kein automatischer Rollback und keine geratenen Ersatzaufgaben.
- „Live beenden“ beendet nur die Sprachverbindung. „Stopp“, Escape und der globale Hotkey beenden zusätzlich kontrollierte Codex-Arbeit. Stoppt nicht erst nach der Live-Abrechnungsbestätigung.
- Standard-TTS ist während Live ausgesetzt. Bestätigte Codex-Ergebnisse kommen als Text im Verlauf und werden an die aktive Live-Sitzung zurückgegeben.
- Anbieter-Sekunden sind kumulative Momentaufnahmen; die lokale Laufzeit ist ausdrücklich eine Schätzung. Sitzungen schließen nach dem gewählten Limit (1–30 Minuten, Standard 5). `session.closed` bestätigt das Ende mit finaler Nutzung. Fehlt es, steht der Abschluss sichtbar auf unbekannt.
- Verbindungsaufbau maximal 15 Sekunden; fehlende Mikrofonframes maximal 8 Sekunden; Abschlussbestätigung maximal 5 Sekunden. Danach wird die Verbindung getrennt. Renderer-Absturz stoppt Arbeit und Sprache; vor Energiesparmodus wird Live geschlossen. Neustart öffnet keine Live-Sitzung.

## Automatisierte Nachweise

93 Tests bestanden, einschließlich echter Windows-Prozessbaumtests und anonymem Codex-Protokolltest. Zusätzliche M2-Prüfungen:

- Live-Protokoll, Authentifizierungsfehler ohne Key-Ausgabe, exakte Modell-/Delegationsprüfung, Format- und Größenkontrolle, kein Fallback oder Reconnect.
- Kumulative Sekunden, bestätigter Abschluss und unbekannter Abschluss, Stop vor Socket-Start, verspätete Ereignisse, hängender Verbindungsaufbau und fehlende Audioframes.
- Einmalige Codex-Delegation, verspätetes Transkript, Kontextwechsel, laufende Arbeit bei Live-Ende, unabhängiger Stop, Korrekturen, ältere Delegation gegen neueren Textauftrag.
- Getrennte verschlüsselte Schlüssel, Übernahme vorhandener Version-1-Dateien, kein Überschreiben bei beschädigten Zugangsdaten, keine automatische Live-Wiederaufnahme.
- Audio-Resampling 44,1 kHz → 24 kHz, Little-Endian-PCM ohne WAV-Header, kontinuierliche Stille, begrenzte Audioverzögerung, Stop während ausstehender Mikrofonfreigabe.

TypeScript-Prüfung bestanden. Windows-Build und Paket erstellt. Electron-Oberflächenprüfung auch mit der gepackten EXE bestanden: echte anonyme Codex-Verbindung, beide Schlüssel mit realer Windows-DPAPI gespeichert und nach Neustart gelesen, beide getrennt entfernt, Sitzungslimit erhalten, keine Live-Wiederaufnahme. Stop während verzögerter Mikrofonfreigabe beendet den verspäteten Stream und startet keine kostenpflichtige Verbindung. Keine Renderer-Ausnahme, kein horizontaler Überlauf bei 1000 × 760 Pixeln.

Nach dem Paketwechsel auf Version 0.2.0 blieben Anmeldung und Gesprächsverlauf erhalten; kein Auftrag wurde wiederholt. Der Paketinhalt enthielt keine Zugangsdaten-, Authentifizierungs- oder Verlaufsdateien und keine Testdaten oder Laufartefakte.

## Echter erster Kernablauf

- Sitzungsstart mit bestätigtem `gpt-live-1`, PCM24k und Client Delegation.
- Physische Mikrofonaufnahme des synthetischen Auftrags: „Hallo openHiatus, lies die Projektnotizen und erstelle im M2 Live Demo Punkt MD mit den drei wichtigsten nächsten Schritten“. Hörbare Antwort und laufender Auftrag wurden manuell bestätigt.
- Genau eine Codex-Delegation für diesen Auftrag; Lesen der Projektnotizen und echte Dateiänderung beobachtet. `M2 Live Demo.md` (340 Bytes, UTF-8) enthält Jonas/Angebote bis Mittwoch, Mira/Vermessung am Freitag und Teamentscheidung am Montag inklusive Sams Regenwassertankprüfung.
- Codex bestätigt Abschluss um 14:47:43 CEST; danach trifft die gesprochene Live-Ergebnisantwort als separates Transkript ein. Datei und Inhalt unabhängig im Demoordner geprüft.
- Live wird über den Button beendet. `session.closed` bestätigt **85 Sekunden** finale Sitzungsnutzung. Kein offenes Mikrofon und kein weiterer Live-Start durch den Kontexttest.
- Anschließender echter Textauftrag im Standardmodus nennt die richtige Datei und die drei richtigen Schritte aus dem vorhandenen Gespräch; keine Werkzeuge oder neue Dateiänderung nötig.

## Weitere echte Abnahme mit synthetischer Audioquelle

Runner: `scripts/m2-acceptance.mjs`, getrennte Modi `context`, `continue`, `stop`, `limit`. Er nutzt dieselbe gepackte App, echte Provider und den Demoordner. Nur die Mikrofonquelle wird vorübergehend durch WebAudio-Stille beziehungsweise tatsächlich bei Inworld erzeugte Testsprache ersetzt. Keine simulierten Live-/Codex-Antworten. Mikrofonfunktion, Vorleseeinstellung und Fünf-Minuten-Standardlimit werden anschließend wiederhergestellt.

| Prüfung | Beobachtetes Ergebnis | Finale Anbieter-Sekunden |
| --- | --- | --- |
| Standard → Live über eingegebenes „wechsel zu live“, anschließend gesprochene Kontextfrage | Live nennt „M2 Live Demo.md“ direkt aus dem übergebenen Verlauf. Keine Codex-Delegation, kein Werkzeug und keine Dateiänderung. | 9 |
| Eingesprochenes „Wechsel zurück“ | Live schließt während derselben Sitzung mit `session.closed`; Standard wird wieder aktiv. | In obigen 9 enthalten |
| „Live beenden“ während eines 12-Sekunden-Codex-Wartebefehls | Live endet, Codex bleibt running und erzeugt danach die vereinbarte Enddatei. | 15 |
| Escape während eines 20-Sekunden-Codex-Wartebefehls | Codex bestätigt interrupted, Live bestätigt Ende; unerwünschte Enddatei auch nach 22 Sekunden nicht vorhanden. | 12 |
| Einminütiges Zeitlimit bei kontinuierlicher synthetischer Stille | Ereignis „Live-Zeitlimit erreicht“, keine Codex-Aufgabe; `session.closed` nach lokal 60,9 Sekunden. | 60 |

Die eindeutig benannten synthetischen Dateien bleiben im Demoordner als Nachweis. Tests prüfen die Start- und Endmarkierung jeweils unabhängig auf dem Dateisystem.

Ein erster Zeitlimitlauf wurde nach 58 Anbieter-Sekunden kurz vor dem lokalen Limit geschlossen; das Ereignis „Live-Zeitlimit erreicht“ fehlte. Dieser Lauf zählt deshalb ausdrücklich nicht als bestandene Zeitlimitprüfung. Der Abschluss selbst wurde bestätigt. Die gezielte Wiederholung am 5. Oktober um 15:00 CEST besteht mit dem erforderlichen Zeitlimitereignis und 60 bestätigten Anbieter-Sekunden.

Beim abschließenden Neustart blieben Gespräch und letzter bestätigter Aufgabenstatus `interrupted` erhalten. Gespeicherte Zugänge wurden wieder entschlüsselt; Live blieb `off`. Keine automatische Aufgabenwiederholung. Die verbotene Folgedatei des Stopptests war auch bei der späteren Abschlusskontrolle nicht vorhanden.

## Grenzen dieser Abnahme

Die Integrationsnachweise gelten für die verwendete Windows-Testumgebung. Netzwerkverlust, Zugangsentzug, ausbleibende Audioframes, verspätete Providerereignisse und Aufgabenänderungen während laufender Arbeit sind automatisiert mit kontrollierten Gegenstellen geprüft; nicht alle sind zusätzlich als reale Störung erzeugt worden. Gesprochenes „Stopp“ ist im Kontrolltest geprüft; der echte parallele Arbeitsabbruch erfolgte über Escape. Vollständige zweite Kontoeinrichtung und physischer globaler Hotkey außerhalb des App-Fensters bleiben aus M1 offen.

## Quellen

[Live-WebSocket-Protokoll](https://developers.openai.com/api/docs/guides/voice-websockets?api=live), [Client Delegation](https://developers.openai.com/api/docs/guides/live-delegation?delegation-mode=client), [Sitzungslebenszyklus](https://developers.openai.com/api/docs/guides/live-conversations), [Kosten und Nutzungsdauer](https://developers.openai.com/api/docs/guides/voice-latency-cost?api=live). Rate bei Umsetzung: 0,05 US$/Minute, sekundengenau, Codex separat; siehe [offizielle Veröffentlichung](https://developers.openai.com/api/docs/changelog).
