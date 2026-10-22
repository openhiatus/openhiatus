# M3-Testprotokoll

> Historische Referenz einer früheren Entwicklungsreihe. Architektur, Bedienpfade, Versionsnummern und damalige Prüfergebnisse beschreiben den datierten Stand, keine neue Abnahme der aktuellen Pi-basierten Version. Lokale Nachweisdateien sind kein Bestandteil der öffentlichen Quellablage. Aktuelle Einrichtung und Prüfungen stehen in der README und im aktuellen Testprotokoll.

Stand: 5. Oktober 2026, Version 0.3.0. **Der M3-Kernablauf wurde in einer lokalen Windows-Testinstallation geprüft:** Erinnerungen bleiben über neue Gespräche erhalten und werden mit Quellen abgerufen; Codex erzeugt einen konkreten Kernvorschlag, ohne den Kern zu ändern. Auch Live greift auf den übergebenen Gedächtnisstand zu.

## Bestandene automatisierte Prüfungen

- **129/129 Tests bestanden**, keine übersprungenen Tests. Enthalten sind native Windows-Prozessbaumprüfungen und der echte anonyme Codex-Protokollstart, die bestehenden M1/M2-Prüfungen und neue Speicher-, UI-, Kontext- und Stopp-Prüfungen.
- Typecheck und Produktionsbuild erfolgreich. Der Bundler meldet lediglich die bekannten wirkungslosen `use client`-Direktiven der Iconbibliothek; der Electron-Build läuft ohne React-Serverkomponenten.
- Bestehender UI-Test gegen die **gepackte EXE** bestanden: Anmeldungsschranken, maskierte Schlüssel, echte Windows-DPAPI-Rundreise, Mikrofon/Escape, keine bezahlte Sitzung nach verspäteter Mikrofonfreigabe, Neustart und kompakte Darstellung.
- Neuer M3-UI-Test gegen die gepackte EXE bestanden: drei ausdrücklich synthetische historische Nachrichten über August, September und Oktober; Tages-/Wochen-/Monatsdokumente, Quellen, Archivsuche, tatsächliche feste Laufzeitvorgaben, Bearbeiten der Identität mit erhaltenem Entwurf nach Menüwechsel, veralteter Schreibversuch abgewiesen, konkrete UI-Freigabe, Korrektur bleibt nach Verdichtung erhalten, Quellen bleiben nach neuem Gespräch und Neustart erhalten. Keine Rendererfehler und kein horizontaler Überlauf bei 1000 × 760.
- Kernänderungen, konkurrierende Vorschläge, beschädigte und unbekannte Formate, atomare Speicherung, Redaktion einschließlich neu registrierter Schlüssel und Sicherungen, Berlin-Tagesgrenzen/DST/ISO-Wochenjahr sowie begrenzte Kontextgröße sind gezielt getestet.

## Echter Speicherschutz

`scripts/m3-memory-boundary.ts` verwendet die bereits eingerichtete native Codex-Windows-Sandbox, ohne Modellaufruf und ohne Zugangsdaten zu lesen. Wegwerfbare Schutzproben liegen im selben Gedächtnisverzeichnis außerhalb des Demo-Arbeitsbereichs. **Schreiben, Löschen und Umbenennen** scheiterten jeweils mit `UnauthorizedAccessException`/Exit 24; der Inhalt blieb unverändert. Der kontrollierte Prozessbaum wurde anschließend bestätigt beendet. Nachweis: `artifacts/m3-speicherschutz.json`.

Dies prüft die unterstützte Sandbox-Grenze. Es ist kein Schutzbeweis gegen Administratoren, fremde Prozesse mit Windows-Vollrechten oder beliebige künftige Werkzeuganbindungen.

## Echte Codex- und Live-Abnahme

1. Codex-Anmeldung, Sandbox und Sprachverbindungen waren für den Prüflauf eingerichtet. Der Gesprächsverlauf wurde vollständig in das app-eigene Gedächtnis übernommen; ein Import aus anderen Anwendungen fand nicht statt.
2. Ein echter Codex-Turn bestätigte die ausdrücklich synthetische Entscheidung für **Projekt Waldlicht: Kupfergrün, 19. November**. Nach „Neues Gespräch“ und einem neuen Codex-Thread wurde beides richtig aus dem Gedächtnis beantwortet. Die Antwort nannte die konkrete archivierte Quellenkennung; sie stimmt mit dem aufgezeichneten Kontext überein.
3. Ein weiterer Codex-Turn erzeugte einen in der UI sichtbaren Kernvorschlag, **pending auf Basisversion 1**. Identität und Kern blieben unverändert. Die Übernahme eines Vorschlags wurde ausschließlich im getrennten UI-Testprofil geprüft.
4. Eine echte GPT-Live-Sitzung erhielt eine synthetische Mikrofonfrage aus echter Inworld-Sprachausgabe. Live nannte **Kupfergrün und 19. November** direkt aus dem Kontext, ohne Codex-Delegation. `session.closed` bestätigte **9 Sekunden**. Das physische Mikrofon wurde in diesem M3-Lauf nicht erneut bedient; die früheren M1/M2-Hardwarebestätigungen bleiben separat dokumentiert.
5. Echter Stopp erneut geprüft: Codex startete einen kontrollierten Dateibefehl mit 20 Sekunden Wartezeit und geplanter Folgedatei, während Live aktiv war. **Escape** unterbrach Codex und schloss Live mit bestätigten **13 Sekunden**. Die geplante Enddatei blieb auch nach weiteren 22 Sekunden aus.

Nachweise: `artifacts/m3-echte-codex-abnahme.json`, `artifacts/m3-echte-live-abnahme.json`, `artifacts/m3-echter-kernvorschlag.png` sowie die M3-UI-Bilder.

Nach dem abschließenden Neustart blieben Archiv, Identität, Kern, Tages-/Wochen-/Monatsdokumente und der offene Vorschlag erhalten. Anmeldung, Sandbox und Sprachverbindungen waren wieder verfügbar. Live blieb aus; kein Auftrag wurde automatisch wiederholt.

Der erste automatisierte Codex-Abnahmeversuch sendete die zweite Nachricht zu früh während der normalen Wiederverbindung des kontrollierten Arbeitsprozesses. Es startete kein zweiter Auftrag. Das Testprogramm wartet nun wie der sichtbare Composer auf „Bereit“; der vollständige wiederholte Lauf bestand. Dafür war keine Produktänderung nötig.

## Gefundene und behobene Grenze im Stopp-Ablauf

Die Gegenprüfung zeigte, dass ein synchrones Live-Ende eine Gedächtnisschreibung vor dem Codex-Abbruch auslösen konnte. M3 startet nun den Arbeitsabbruch zuerst und verschiebt Archiv-/Verlaufswrites bis zur Bestätigung. Auch ein ausbleibender Stopp hält diese Verschiebung bis zum erfolgreichen Wiederholungsversuch aufrecht. Zwei gezielte Regressionen prüfen Aufrufreihenfolge, späte Ereignisse und Schreibfehler. Die echte Escape-Prüfung oben besteht mit diesem Stand.

Gesprochene Stopp-Fragmente werden außerdem unabhängig von den beim Archivieren eingefrorenen Nachrichtenkennungen ausgewertet. Ein Capture zwischen „Sto“ und „pp“ verschluckt den Befehl nicht mehr; der Regressionstest besteht.

## Prüfbereiche

- Lokale Archivierung und Tages-/Wochen-/Monatsverdichtung, Zeitgrenzen und Quellen.
- Bearbeiten, Versionskonflikte, konkrete Vorschläge und Freigaben des geschützten Kerns.
- Kontextabruf in Codex und Live ohne Änderung der bestehenden Zugänge.
- Electron-Oberfläche einschließlich Neustart, Umlauten und kompakter Fenstergröße.
- Tatsächliche Windows-Sandbox-Schreibgrenze für den Gedächtnisordner.
- Echter Codex-Auftrag, Erinnerungsabruf nach neuem Gespräch und ein prüfbarer Änderungsvorschlag.

## Abnahmeprogramme

`npm test`, `npm run typecheck`, `npm run build`, `npm run test:ui`, `npm run test:memory-ui` und `npm run test:memory-boundary`.

Der UI-Test verwendet ein getrenntes Profil mit ausdrücklich synthetischen historischen Nachrichten. Der Grenztest verwendet ausschließlich wegwerfbare Schutzproben im Gedächtnisverzeichnis; er liest keine Schlüssel und verändert keine echten Erinnerungen. Echte Modelltests werden getrennt von diesen kontrollierten Prüfungen dokumentiert.

## Verbleibende Grenzen

Die Verdichtung besteht aus gekennzeichneten lokalen Textauszügen, nicht aus semantischen KI-Zusammenfassungen. Sie bewertet keine Wahrheit und ersetzt keine Quellenprüfung. Es gibt weiterhin keinen Datentresor; die Erinnerungen sind lokaler Klartext. Speichergrenzen melden einen Fehler, statt Quellen stillschweigend zu löschen. Langzeitbetrieb mit sehr großem Archiv, zweite Hardware, vollständige neue Kontoeinrichtung sowie physischer Globalhotkey außerhalb des Fensters sind nicht Bestandteil dieses neuen M3-Nachweises. M4-Installer, Backup-UI und Vollzugriffsoption bleiben ausstehend.
