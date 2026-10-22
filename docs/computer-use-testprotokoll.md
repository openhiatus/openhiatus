# Allgemeine Desktopsteuerung – Prüfstand 0.3.6

> Historische Referenz einer früheren Entwicklungsreihe. Architektur, Bedienpfade, Versionsnummern und damalige Prüfergebnisse beschreiben den datierten Stand, keine neue Abnahme der aktuellen Pi-basierten Version. Lokale Nachweisdateien sind kein Bestandteil der öffentlichen Quellablage. Aktuelle Einrichtung und Prüfungen stehen in der README und im aktuellen Testprotokoll.

## Aktueller Werkzeugweg ab 0.4.2

Desktop-Aktionen werden direkt als `openhiatus_computer.computer` angeboten. Codex erhält Bild und Frame-Metadaten nativ; ein vom Modell geschriebener Code-Mode-Bildadapter ist für diesen Namespace nicht mehr nötig. Andere Werkzeuge behalten ihren bisherigen Weg.

Nach einer Eingabe warten ausschließlich neue Bildschirmaufnahmen begrenzt auf die Darstellung. Alte identische Bilder verkürzen die Wartephase nicht; Pixelstabilität bestätigt keine erfolgreiche Auftragsannahme. Eingaben werden niemals wiederholt. Die native Abnahme mit 450 ms verzögertem Unicode-Text zeigt den vollständigen Text bereits im ersten zurückgegebenen Aktionsbild. Details, Messwerte und Grenzen: [Sprachgespräch 0.4.2](standard-conversation-testprotokoll.md).

Die folgenden Nachweise sind der historische Prüfstand 0.3.6.

Stand: 6. Oktober 2026, Europe/Berlin. Implementiert mit Codex 0.160.0 und der unabhängig mitgelieferten nativen Bibliothek `@trycua/cua-driver` 0.22.0. Der vorhandene Codex-Agent sieht die zurückgegebenen PNG-Bilder und entscheidet über die nächsten Aktionen. Kein weiterer Vision-Anbieter, API-Key oder OpenClaw-Dienst ist beteiligt.

## Tatsächlich geprüft

| Prüfung | Ergebnis | Nachweis |
| --- | --- | --- |
| Native Bildschirmaufnahme | Tatsächliches PNG mit 1920 × 1080 Pixeln; Treibersitzung anschließend beendet. | Lokaler NativeComputer-Test im Implementierungslauf. |
| Reale Modellsteuerung einer separaten Windows-Testanwendung | Bestanden: Codex gab „Grüße aus Ansicht eins“ ein und speicherte den Text. Nach dem Verschieben der Bedienelemente gab es „Grüße aus Ansicht zwei“ korrekt ein und speicherte erneut. | `artifacts/computer-fixture-acceptance.json`: `status=passed`, zwei richtige Einträge, eine Layoutänderung, zwölf Bilder. |
| Eigenständiges Testfenster nach Stopp | Blieb geöffnet. Stopp beendet die openHiatus-Steuerung, nicht die unabhängige Anwendung. | Derselbe Nachweis: `windowSurvivesStop=true`. |
| Adapter ohne Desktopaktionen | Neun Tests bestanden: Eingabevalidierung, Bildantworten, Frame-/Geometrieprüfung, Serialisierung, Abbruch, verspätete Initialisierung, native Ablehnung und fehlgeschlagener Stopp. | `tests/computer.test.ts`. |
| Standardtests, Typprüfung und Oberfläche | 231 Standardtests bestanden; Typecheck und UI-Smoke grün. Zwei optionale native Tests wurden in diesem Standardlauf nicht ausgeführt; ihre bisherigen Nachweise gehören zu 0.3.5. | Ergebnis des vollständigen Implementierungslaufs vor dem finalen Paketbau. |
| Folgeauftrag im bereits geöffneten Codex-Fenster | Eingegeben, abgesendet und abgeschlossen; erste UTF-8-Markerdatei exakt verifiziert. | `artifacts/computer-codex-2026-10-05T22-48-51-078Z/Computer-Codex-Abnahme.json`, Status `passed`. |
| Denkstufe in der tatsächlichen Codex-Oberfläche | `gpt-6.1-sol` von `low` auf `medium` umgestellt, aktive Auswahl beobachtet und anschließend `low` wiederhergestellt. Kein Wechsel der Modellfamilie. | Derselbe Nachweis; Bilder 3, 23 und 29 visuell geprüft. |
| Neue Unterhaltung im selben Codex-Fenster | Neue leere Unterhaltung beobachtet, weiteren Auftrag eingegeben und abgeschlossen; zweite UTF-8-Markerdatei exakt verifiziert. | Derselbe Nachweis; Bilder 35 und 41 visuell geprüft. |
| Reiner Computer-Weg während der Codex-Bedienung | 41 Bildschirmbilder, keine Shellaufrufe des steuernden Modells während der UI-Phase. Arbeitsfenster und Codex überlebten Stopp und `dispose` der steuernden Laufzeit. | Derselbe Nachweis; zusätzlich Abschlussbilder 14 und 41 visuell geprüft. |

Die Zeiten im JSON sind UTC; die Tests liefen am 6. Oktober kurz nach Mitternacht in Europe/Berlin. Sie verwenden synthetische Inhalte in einer eigenen Testanwendung und einem isolierten Codex-Testprojekt. Die Prüfungen belegen diese Layoutänderung und die genannten Codex-Abläufe, keine allgemeine Fehlerfreiheit bei jeder Windows-Oberfläche. Die sichtbare Codex-Oberfläche wurde während der Eingabe anhand aktueller Bilder bewertet; es war keine fest hinterlegte Abfolge von Codex-Tasten nötig.

## Gepackte Anwendung

| Prüfung | Stand |
| --- | --- |
| Native Bibliothek im echten Electron-Programm 0.3.6 | Bestanden: SDK und Windows-DLL aus `app.asar.unpacked` geladen, echtes PNG erfasst, Sitzung sauber beendet. |
| Bildvorschau in der ausgelieferten UI | Bestanden: Aufnahme, Uhrzeit, Größe, Datenschutzhinweis und Stopp sichtbar; Bild nicht im gespeicherten Zustand enthalten. |
| Paketinhalt | 4.669 Einträge geprüft; keine privaten Testdaten oder Abnahmeartefakte. Nachweis: `artifacts/computer-installation.json`. |

## Grenzen und Datenhaltung

- Nur normale Aufträge im **Risk Mode** erhalten das Computer-Werkzeug. Safe Mode und Gedächtnisberichte erhalten es nicht.
- Der aktuelle Treiberweg bedient den **Hauptbildschirm im aktiven Windows-Desktop**. Ziel und Fokus müssen im aktuellen Bild geprüft werden. Parallele Maus-/Tastatureingaben oder Änderungen im Fenster können den Zustand zwischen Aufnahme und Aktion verändern.
- Jeder Eingabe folgt ein neues Bild mit neuer `frameId`. Es gibt keine fest eingebauten Codex-Schaltflächen oder Folgen von Terminaltasten. Ziffern und Sonderzeichen werden als Text eingegeben.
- Die letzte Bildvorschau in openHiatus ist flüchtig. Sie wird nicht in openHiatus-Gespräch, Aktivitätsprotokoll oder Gedächtnis gespeichert. **Codex kann Bilder und Werkzeugargumente in seinen eigenen Sitzungsaufzeichnungen behalten.** Bilder gehen zur Bearbeitung an den bereits verbundenen Codex-Zugang und nutzen dessen Kontingent.
- Stopp invalidiert weitere Eingaben und beendet die Treibersitzung nach dem Ende bereits zugelassener SDK-Aufrufe. Bereits begonnene Aktionen können gewirkt haben. Eigenständige Fenster und deren Aufgaben bleiben erhalten; Änderungen werden nicht rückgängig gemacht.

Technische Integration und bisherige Abnahmen: [Codex-Anbindung](codex-integration.md).

## Texte als Ganzes einfügen

`computer` / `type` verwendet standardmäßig `method: "paste"`: Der native SDK schreibt den vollständigen Text in die Windows-Zwischenablage und sendet anschließend **Strg+V** an das zuvor im aktuellen Bild zugeordnete, fokussierte Feld. Es wird keine zusätzliche Enter-Taste gesendet. Der Text wird nicht verändert; enthaltene Zeilenumbrüche können je nach Zielanwendung trotzdem einen Befehl ausführen oder einen Einfügedialog öffnen. Eine zusätzliche Bestätigung beziehungsweise das Absenden ist eine eigene, im neuen Bild begründete Aktion.

Das Einfügen **ersetzt die bisherige System-Zwischenablage**. openHiatus liest oder speichert deren vorherigen Inhalt nicht und stellt ihn nicht wieder her. Der Werkzeugvertrag und die Bildantwort nennen diesen Effekt. Der eingegebene Text bleibt weiterhin aus dem openHiatus-Aktivitätsprotokoll ausgeschlossen. Der Nutzer soll während der fokusabhängigen Eingaben Maus und Tastatur ruhen lassen.

Der vorhandene SDK `@trycua/cua-driver` 0.22.0 bietet hierfür `clipboardWrite` und `pressKey`; zusätzliche Programme, Shell-Zwischenablagen, Codex-spezifische Koordinaten oder eine weitere Bibliothek sind nicht erforderlich. Nach einer nicht bestätigten Zwischenablage-Aktion wird kein Strg+V gesendet. Stopp wird vor dem Schreiben und zwischen Schreiben und Einfügen geprüft; bereits geschriebenen Text in der Zwischenablage macht Stopp nicht rückgängig. Ein unklarer Fehler führt zu keiner Wiederholung oder automatischen Ausweichmethode.

Für ein Feld, das im aktuellen Zustand direktes Tippen benötigt, bleibt `method: "keys"` verfügbar. Dieser ausdrücklich ausgewählte Weg verwendet den bisherigen SDK-Aufruf `typeText` und greift nicht auf die Zwischenablage zu. Die Wahl erfolgt anhand der beobachteten Oberfläche; ein erfolgloses Einfügen darf nicht blind als Tippen wiederholt werden. Nach beiden Wegen folgt wie bisher das aktuelle Kontrollbild.

Prüfung der Änderung: `tests/computer.test.ts` prüft den unveränderten vollständigen Unicode-Text einschließlich Leerzeichen und Zeilenumbrüchen, genau eine Strg+V-Eingabe ohne Enter, Stopp zwischen Zwischenablage und Einfügen, die Ablehnung nicht bestätigter Schreibresultate und das Ausbleiben einer Wiederholung bei unklaren Fehlern. Native Grundlage: [Cua-Clipboard-Vertrag](https://cua.ai/docs/cua-driver/reference/mcp-tools/values-and-clipboard).

Die **modellfreie native Abnahme** am 6. Oktober ist bestanden (`artifacts/computer-paste-check.json`): 9.956 Zeichen einschließlich Umlauten, ß, Emoji, Anführungszeichen, Tab und CRLF kamen in der eigenen WinForms-Textbox exakt an. Die Textbox registrierte genau eine `WM_PASTE`-Nachricht und keine Enter-Taste. Die Zwischenablage-Aktion bestätigte `supported=true`, `written_type=text`. Foreground-Fenster und Feldfokus blieben vor und nach der Clipboard-Aktion unverändert; im erweiterten Test auch nach den nativen Screenshot- und Klickaktionen. Der vollständige Paste-Helfer einschließlich Test-Fokusprüfungen benötigte in den beiden erfolgreichen Durchläufen 118 beziehungsweise 89 ms. Ein weiterer Durchlauf brach nach dem Clipboard-Schreiben vor Strg+V ab und ließ den bereits eingefügten Feldtext unverändert. Das belegt diesen nativen Eingabeweg, keinen Vergleich ganzer Modellaufträge.

Die **Modellabnahme** mit `scripts/computer-acceptance.ts` ist dagegen bei der Fokuswahl fehlgeschlagen: Der Text erschien im Codex-Eingabefeld, keine Aufgabe wurde abgesendet und kein Prüftext gespeichert (`artifacts/computer-fixture-acceptance.json`). Der erfolgreiche native Test beweist keine erfolgreiche modellgesteuerte Fensterauswahl. Ein Feld kann einen sichtbaren beziehungsweise lokalen Eingabefokus haben, während ein anderes Fenster Windows-Foreground ist. Beim ersten modellfreien Fixture-Start wurde genau diese Situation erkannt und Strg+V deshalb nicht ausgeführt. Der abschließende modellfreie Test brachte ausschließlich sein eigenes neu gestartetes Testfenster mit einer Test-Hilfsfunktion in den Vordergrund; diese Hilfsfunktion wird nicht von openHiatus zur Produktsteuerung verwendet.

Reproduktion der nativen Abnahme: `$env:OPENHIATUS_COMPUTER_PASTE_CHECK = '1'; npx tsx scripts/computer-paste-check.ts`. Das Skript startet eine eigene, nach 30 Sekunden automatisch schließende Fixture. Es prüft deren PID, Programmpfad und Prozessstartzeit sowie Foreground und Feldfokus vor jeder Tastatureingabe und nach dem Clipboard-Schreiben. Es bedient keine bestehenden Arbeitsfenster. Die früheren erfolgreichen Modellabnahmen weiter oben verwendeten noch den bisherigen Texteingabeweg.
