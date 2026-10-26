# openHiatus – Testprotokoll

## 0.0.23: Gemeinsamer Arbeitsverlauf – 25. Oktober 2026

Die Aufgabenansicht erfasst jetzt Gesprächsaufträge, direkte Arbeit und zugeordnete Hintergrundaufgaben. Der gespeicherte Stand enthält Auftrag, Ergebnistext, Zeitpunkte und einzeln zugeordnete Werkzeugstarts und -ausgänge. Eine abgeschlossene Gesprächsantwort beendet keine noch laufende Teilaufgabe. Gesprächswechsel und Neustart erhalten den Verlauf; unterbrochene Arbeit wird nicht automatisch fortgesetzt. Die neue Ansicht ist in allen sieben Oberflächensprachen verfügbar.

- `npm run check`: Architekturprüfung, TypeScript und **827 Tests bestanden**. Die neuen Verhaltenstests prüfen beide Vordergrundpfade, dauerhafte Annahme vor Agentenarbeit, Rollback bei Speicherfehlern, wartende Nachrichten, Stopp, verspätete Ereignisse, Teilaufgabenzuordnung, Quellenkennungen, Geheimnisbereinigung und Neustart.
- `npm run build`: bestanden. Ein erster parallel zur nativen Testsuite gestarteter Build traf auf eine belegte Helferdatei; Build und vollständige Testsuite liefen anschließend getrennt erfolgreich.
- `npm run test:work-history-ui`: bestanden. Ein lokaler synthetischer Modellserver führt über den echten Pi-Host eine Gesprächsanalyse und eine delegierte Dateiprüfung aus. Ein erfolgreicher und ein fehlgeschlagener Leseaufruf landen beim richtigen Auftrag. Alle sieben Sprachen, Fenstergrößen 560 × 440 und 1360 × 900, Ergebnisdarstellung, neues Gespräch und echter App-Neustart wurden geprüft. Der Test deckte eine zunächst fehlende Weitergabe des neuen Feldes durch den Speicher-Worker auf; nach deren Korrektur bleibt der vollständige Verlauf erhalten. Screenshots wurden visuell kontrolliert.
- `npm run test:responsive-ui`: bestehende Navigation und Einstellungen bei kompakten und großen Fenstern bestanden.
- `npm run test:storage-ui`: reale verzögerte Speicherbestätigung, erreichbarer Stopp und Neustart ohne Wiederholung bestanden.
- `node scripts/package.mjs` und `node scripts/installer.mjs`: Windows-Paket und Setup 0.0.23 erstellt; SHA-256-Prüfsumme bestätigt. `npm run test:work-history-ui` besteht auch mit `OPENHIATUS_TEST_APP` gegen die verpackte Anwendung, einschließlich echter Werkzeugausgänge und Neustart. Der unveränderte Installationslebenszyklus wurde für diese Version nicht erneut vollständig geprüft.

Die Daten und Werkzeugaktionen sind synthetisch; die Prüfungen verwenden eigene Profile und lokale Modellendpunkte. Neue Gedächtnisabrufe, automatische Entscheidungsextraktion, Themenzusammenführung und eine Löschfrist gehören nicht zu diesem ersten Ausbau. Der Ergebnistext bleibt eine Aussage des Agenten; Werkzeugabschluss allein beweist keine fachlich erfolgreiche Ausführung.

## 0.0.22: Sprachwahl direkt in der Seitenleiste – 25. Oktober 2026

Der Sprachschalter steht direkt über **Arbeitsordner**. Das Sprachsymbol A/文 und **Language · 语言** machen ihn unabhängig von der eingestellten Sprache erkennbar. Das Menü zeigt alle sieben Sprachen in ihrer eigenen Schrift mit lokalen SVG-Flaggen. Die Auswahl bleibt beim Wechsel der Ansicht erreichbar; die bisherige Auswahlkarte in den Einstellungen entfällt.

- `npm run check`: Architekturprüfung, TypeScript und **821 Tests bestanden**.
- `npm run build`: erfolgreich.
- `npm run test:i18n-ui`: alle sieben Sprachen über das neue Menü gewählt, ohne in die Einstellungen zu navigieren. Die aktuelle Ansicht, Entwürfe und die laufende synthetische Aufgabe blieben erhalten. Geprüft wurden außerdem die Flaggen, Tastaturauswahl mit Pfeiltasten/Pos1/Ende/Enter, Schließen mit Esc und Außenklick sowie das vollständige Menü bei eingeklappter Seitenleiste und kleinster normaler Fenstergröße.
- `npm run test:responsive-ui`: Navigation und Einstellungen bei 560 × 440, 760 × 560 und 1360 × 900 sowie manueller Aus-/Einklappung bestanden.
- `npm run test:i18n-ui` mit `OPENHIATUS_TEST_APP` auf das Windows-Paket 0.0.22: derselbe Sprach-, Entwurfs- und Laufzeittest bestanden. Die Prüfung wartet vor der ersten Bedienung ausdrücklich auf die verfügbare App-Oberfläche.
- Paket und Setup 0.0.22 mit `node scripts/package.mjs` und `node scripts/installer.mjs` gebaut; die Setup-Prüfsumme wurde verifiziert. Der Installationsablauf selbst bleibt gegenüber 0.0.21 unverändert.

Die Prüfungen verwenden isolierte Profile und synthetische Daten. Esc behält auch bei geöffnetem Sprachmenü seine globale Stopp-Funktion. Die Flaggen benötigen weder Emoji-Schriften noch externe Bildabrufe.

## 0.0.21: Sieben Sprachen für App und Windows-Setup – 25. Oktober 2026

Die Oberfläche bietet Englisch, Spanisch, Französisch, Deutsch, vereinfachtes Chinesisch, Japanisch und brasilianisches Portugiesisch. Die Sprachwahl unter Einstellungen wird über den bestehenden IPC-Vertrag gespeichert und wirkt ohne Neuaufbau der Ansichten. Setup gibt seine Sprache nur für neue normale Profile vor; bestehende Präferenzen bleiben erhalten. Die [Dokumentation zur Mehrsprachigkeit](localization.md) beschreibt Grenzen und Pflege des lokalen Katalogs.

- `npm run check`: Architekturprüfung, TypeScript und **821 bestandene Tests**. Neu geprüft werden Sprachvalidierung, alte Profile, Setup-/Systemvorgabe, vollständige Katalogzeilen, unveränderte Parameter und fehlende Übersetzungsschlüssel.
- `npm run build` und `npm run installer`: erfolgreich; Setup 0.0.21 enthält alle sieben Sprachen. Die erzeugte SHA-256-Datei stimmt mit dem Installer überein.
- `npm run test:i18n-ui`: alle sieben Sprachen in sechs Arbeitsbereichen bei 560 und 1360 Pixel Fensterbreite. Unbestätigter Vollzugriff, Navigation, Gesprächsentwurf, ungespeicherter Anbieterzugang, Gedächtnisentwurf, unveränderte Nutzertexte und Neustart wurden geprüft. Eine laufende lokale Testaufgabe wurde beim Wechsel weder neu gestartet noch abgebrochen; auch die Hintergrundanzeige wechselte bei gleichbleibender Arbeitsphase ihre Sprache.
- `npm run test:desktop-control`: reale native Reservierung, Eingabesicherung, Aufnahme ohne Übernahmerahmen, Agentenklick und Freigabe bestanden. Während derselben Reservierung wurden alle sieben Sperrtexte und Esc-Anweisungen geprüft. Die Screenshotkontrolle umfasste unter anderem Französisch, Japanisch und Chinesisch.
- `npm run test:installer`: vollständiger Installationslebenszyklus bestanden. Alle sieben Setup-Sprachen wurden tatsächlich angezeigt, bis zur Installationsauswahl bedient und abgebrochen. Jede Sprachzuordnung wurde in einer eigenen Testregistrierung installiert und wieder entfernt. Ein französisches Update erhielt die zuvor in der App gespeicherte japanische Auswahl. Der Abbruchtest identifiziert den nativen Windows-Bestätigungsbutton sprachunabhängig über seine Kennung.
- `npm run test:package`: alle elf Prüfläufe bestanden, einschließlich des neuen Sprachtests mit der fertig verpackten App. Geprüft wurden außerdem Gesprächs-/Worker-Abläufe, Kontext und Verlauf, Audiogeräte, Hintergrundanzeige, Persönlichkeit, Fast-Auswahl, Kalender-Einrichtung, Bildschirmhilfe, Desktopübernahme und Autostart ohne globales Node oder Codex im Suchpfad.

Alle Aufgaben und Daten waren synthetisch. Die Prüfungen verwendeten getrennte Profile; sie benötigen keine Cloudzugänge. Bearbeitbare Nutzer- und Anweisungstexte sowie technische Protokollinhalte werden durch die Sprachwahl nicht nachträglich übersetzt. Das Setup bleibt unsigniert; die lokalen Prüfungen ersetzen keine Abnahme auf einer frisch installierten Windows-VM.

## 0.0.20: Installation, Update und Deinstallation unter Windows – 25. Oktober 2026

Der neue Inno-Setup-Build erzeugt eine einzelne, noch unsignierte x64-Setup-Datei mit SHA-256-Prüfsumme. Die Installation erfolgt pro Benutzer ohne angeforderte Rechteerhöhung, mit Startmenü-Eintrag und optionalem Desktop-Symbol. Updates verwenden denselben Programmpfad; das bestehende Profil bleibt außerhalb des Installationsbesitzes. Anleitung und Prüfbefehle stehen unter [Windows-Installation](windows-installation.md).

`npm run check` besteht mit Architekturprüfung, Typprüfung und **814 Tests** ohne Fehler oder Auslassungen. `npm run package` einschließlich Build und die anschließende Setup-Erzeugung bestehen. Die tatsächliche deutsche Setup-Oberfläche wurde bedient und visuell geprüft: Begrüßung, optionales Desktop-Symbol, direktes Installieren und Abbrechen.

`npm run test:installer` besteht mit eindeutigen Test-Registrierungen, eigenen Verknüpfungen und separaten Profilen. Geprüft sind Neuinstallation, Update eines synthetischen älteren Pakets, erneute Installation, Downgrade-Sperre, Erhalt gespeicherter Einstellungen und einer in Windows deaktivierten Autostartregistrierung, richtige Verknüpfungsziele sowie vollständige Entfernung des eigenen Installationsbesitzes. Persönliche und unbekannte Dateien bleiben erhalten. Eine fremde Programmkopie behält ihre Autostartregistrierung. Die Bereinigung veralteter Paketdateien widersteht relativen Ausbrüchen, absoluten Pfaden und einer Verzeichnisverknüpfung auf ein außerhalb liegendes Ziel.

Eine tatsächlich laufende Test-App verhindert Update und Deinstallation, ohne beendet zu werden. Kurzzeitige Dateisperren beim Prozessende werden bis zu zwei Sekunden abgewartet. Die installierte unveränderte Anwendung besteht außerdem den Gesprächs-/Worker-Dateiablauf und die echte native Desktopprüfung ohne globales Node oder Codex im Suchpfad. Die Modellantworten stammen dabei von lokalen synthetischen Servern; bestehende Benutzerprofile und echte Modellzugänge werden nicht verwendet.

`npm run test:package` besteht vollständig mit den zehn bestehenden Paketabläufen einschließlich Gesprächsverlauf, Audioauswahl, Arbeitsanzeige, Identitätsdateien, Fast-Auswahl, Kalender-Einrichtung, Bildschirmhilfe, Desktopübernahme und Autostart. Ein erster Lauf der Bildschirmhilfeprüfung traf auf eine korrekt verworfene veraltete Aufnahme; der anschließende vollständige Paketlauf bestand unverändert. Diese native Prüfung setzt einen während Beobachtung und Markierung unveränderten Testdesktop voraus.

Dies ist eine lokale Alpha-Abnahme, keine Prüfung auf einer frisch aufgesetzten Windows-VM. Signierung, öffentliche Release-Downloads und automatische Updateverteilung bleiben außerhalb dieser Lieferung. Generierte Installationsdateien, Protokolle, Profile und Bilder bleiben ignoriert.

## Berichte und Beobachtungskennungen – 23. Oktober 2026

Die Computerlaufzeit erhält einen ausdrücklichen terminalen Berichtsrückweg. Begrenzte verschachtelte Beobachtungen und Tabellen mit mehr als 20 Zeilen werden als Daten transportiert; ein nützlicher Bericht wird nicht wegen einer undokumentierten kleinen Stringlisten-Grenze verworfen. Die fachliche Prüfung bleibt beim Arbeitsmodell. Der Berichtsabschluss beendet den Teilauftrag und wartet auf die bestehende Freigabe; er startet keine weitere Modellrunde. JSON-Textabschlüsse bleiben ein kompatibler Rückweg.

Kurze pro Prozess eindeutige Aufnahme-/Ansichtskennungen ersetzen lange UUIDs im Computerwerkzeug. Alte, falsch übernommene oder fremde Handles werden weiterhin exakt abgewiesen. Die Regression prüft fehlende Eingabe bei Einzeichenfehlern, verbrauchte Aufnahmen und neue Kennungen nach Stopp. Sitzungs- und Prozesskontrollkennungen sind davon nicht betroffen.

Bei einem sicher erkannten Treiberfehler vor dem Senden wird das nun ausdrücklich erklärt. Nach Kontrolle eines sichtbaren Menüs kann das Modell einen zulässigen Tastaturweg wählen. Bei unklarer oder bereits erfolgter Zustellung gelten weiterhin Bildprüfung und das Verbot blinder Wiederholung. Eine Integritätsblockade erhält keinen Umgehungshinweis. Die native Vordergrundprüfung wird nicht deaktiviert; eine universelle Behebung von Popup-Klickfehlern wird damit nicht behauptet.

Architekturprüfung, Typprüfung und **629 Tests** bestehen ohne Fehler oder Auslassungen. Der anschließende Build und die versteckte Computer-Vorschau bestehen. Die echten Pi-/lokalen Responses-Prüfungen bestätigen den terminalen Bericht ohne Folgerunde, vollständige strukturierte Zeilenlisten und die Freigabe einer begonnenen synthetischen Eingabe vor Rückgabe. Es wurden keine Cloudanfragen, nativen Desktopaufnahmen oder Eingaben für diese Abnahme ausgeführt; reale Aufgabenqualität bleibt gesondert zu vergleichen.

## Kompatibler Fast-Parameter – 23. Oktober 2026

Die Fast-Auswahl wird jetzt als `service_tier: "priority"` übertragen. `priority` und `fast` bezeichnen laut OpenAI dieselbe Verarbeitung; die Verwendung des kompatiblen Namens behebt die Ablehnung `Unsupported service_tier: fast` vor dem ersten Werkzeugaufruf. Dies schaltet weder Fast aus noch versucht es nach einem Fehler automatisch erneut mit Standardverarbeitung.

Die neue Regression verwendet den echten Pi-Host, den ChatGPT-Zugangsabruf und synthetische pro Anfrage wechselnde Token. Der abgefangene HTTP-Transport lehnt den neueren Wert mit der konkreten 400-Antwort ab und akzeptiert ausschließlich `priority`. Zwei reguläre Modellturns behalten die tatsächlichen Antwortstufen `priority` beziehungsweise `default` getrennt bei. Eine erfolgreiche Anfrage wird nicht mit bestätigtem Fast gleichgesetzt. Die Prüfung verwendet keine echten Zugangsdaten, Cloudanfragen oder Desktopoperationen.

`npm run check` besteht mit Architekturprüfung, Typprüfung und **622 Tests** ohne Fehler oder Auslassungen. Der anschließend separat ausgeführte Build besteht; bekannte lucide-react-Warnungen bleiben unverändert.

## Getrenntes Computermodell – 23. Oktober 2026

Der optionale Modus trennt das Arbeitsmodell von einer eingeschränkten Computerlaufzeit. Das Arbeitsmodell übergibt begrenzte Bedienziele; das Computermodell erhält Bildschirmbilder und führt mehrere beobachtete Desktopaktionen aus. Der Rückweg ist normalerweise ein Textbericht mit ausdrücklich ungeprüfter Abschlussbehauptung. Eigene Aufnahmen zur Prüfung kann das Arbeitsmodell gesondert anfordern. Der Standard bleibt die bisherige Bedienung durch das Arbeitsmodell.

| Prüfung | Ergebnis |
| --- | --- |
| `npm run check` | Architektur, Typprüfung und 621 Tests ohne Fehler oder Auslassungen. |
| `npm run build` | Windows-Helfer, Main, Agent-Host und Renderer gebaut; bekannte lucide-react-Warnungen ohne Buildfehler. |
| Echter Pi-Transport, lokale Modellnachbildung | Arbeitsmodell delegiert; Computerlaufzeit erhält Bilder und erledigt mehrere synthetische Eingaben; Textbericht enthält keine Bilder im Arbeitsmodell-Kontext; ausdrückliche Originalbildprüfung funktioniert. Beide Rollen verwenden echte Pi-Adapter und Agent-Hosts mit lokalem Responses-SSE-Server. |
| Rechte und Lebensdauer | Computerlaufzeit ohne SDK-Datei-/Shellwerkzeuge, Skills, Erweiterungen oder Prozessübergabe. Sitzungsfortsetzung zwischen gewöhnlicher und eingeschränkter Rolle wird abgelehnt. Host-Limits, konkurrierende Aufrufe, verzögerter Start, Freigabefehler und wiederholter Stopp geprüft. |
| Verschachtelter Stopp | Stopp des Arbeitsmodells beendet auch den Computerauftrag und bestätigt die Freigabe erst nach Abschluss einer bereits begonnenen synthetischen Eingabe. Keine Folgeaktion oder späte Bildausgabe. |
| Fast und Verbrauch | `service_tier: fast` in jedem geprüften Computerrequest; tatsächlich zurückgegebene Stufen `fast` und `default` getrennt gespeichert. Messung auch am Kompaktierungs-Stream angeschlossen. Kumulative Computer- und Arbeitsverbräuche über mehrere Teilaufträge und fortgesetzte Turns ohne Überschreiben oder doppelte Zählung. Keine statische Standardpreis-Schätzung als Fast-Abrechnung. |
| Einstellungen und Speicherung | Opt-in aus, Fast an; unabhängige Modellwahl, sichere Auswahl bei fehlendem Modell, unveränderliche Konfiguration ab Auftragsannahme, Storage-/IPC-Rundlauf und begrenzte Messgruppen geprüft. |
| `npm run test:computer-model-ui` | Versteckte Electron-Ansicht: Faktor 16, Aktivierung, unabhängige Modellwahl, Sperre während Arbeit, deaktivierte Delegation nach Leeren der Auswahl und unterscheidbare tatsächliche/fehlende Service-Stufe geprüft. |
| Bild- und Vorschau-Regression | `test:computer-images` und `test:computer-preview` bestanden; 64 Übersichten und 36 Originalausschnitte, korrekte Fehlerbilder und Vollbildrückfall. |

Die neue Einstellungsansicht wurde visuell geprüft. Für diese technischen Prüfungen gab es keine Cloud-Modellaufrufe, nativen Bildschirmaufnahmen oder Desktop-Eingaben. Der neue Geschwindigkeits-/Kosten-/Qualitätsvergleich mit echtem Computermodell bleibt ein gesonderter manuell gestarteter Versuch. Die [Versuchsbeschreibung](computer-use-computermodell.md) erläutert Ablauf und Messgrenzen.

## Treiberfehler und Kontrollbilder – 22. Oktober 2026

`isError` und eine ausdrücklich gemeldete Ablehnung sind getrennte Fälle. Die Windows-Implementierung des installierten cua-driver 0.22.0 prüft das Vordergrundfenster auch **nach** dem gesendeten Klick. Ein Fensterwechsel kann deshalb eine Fehlermeldung auslösen, obwohl die Eingabe bereits gesendet wurde. Ein solcher Fehler beweist weder eine ausgebliebene Eingabe noch den fachlichen Erfolg. Grundlage: [Windows-Klickpfad des installierten Tags](https://github.com/trycua/cua/blob/cua-driver-rs-v0.22.0/libs/cua-driver/rust/crates/platform-windows/src/input/mouse.rs#L630-L710).

openHiatus klassifiziert bekannte Fehlersignaturen lokal und übergibt nur feste Fehlercodes, Zustellungs-/Effekt-Enums und begrenzte Verifikationsmetadaten. Native Texte, HWNDs, beobachtete Werte und JSON-Rohdaten werden nicht in Diagnostik übernommen. Unbekannte Fehlercodes werden als unbekannt markiert. Ein Treiberfehler nach zugelassener Eingabe liefert nach Möglichkeit das aktuelle Kontrollbild mit neuer Bildkennung; Modell und Vorschau erhalten dieselben Bilder. Der Werkzeugstatus bleibt fehlerhaft. Es gibt keine automatische Eingabewiederholung, Methodenumschaltung oder Umdeutung einer Bildänderung als Erfolg.

Gezielte synthetische Prüfungen decken Fehler vor und nach dem Klick, unklare SendInput-Zustellung, explizite Ablehnung, Kontrollbildfehler, ausbleibendes Einfügen nach Clipboardfehler und Stopp während der Fehlerbeobachtung ab. Der echte Pi-Konverter erhält Fehlerstatus und Kontrollbild sowohl im Vollbild- als auch im Übersichtmodus. Die versteckte Electron-Prüfung bestätigt den vollständigen Fehler-/Bild-/Vorschauweg bei Faktor 16 ohne native Desktopaufnahme oder Eingabe.

`npm run check` besteht mit Architekturprüfung, Typprüfung und **581 Tests** ohne Fehler oder Auslassungen. `npm run build` und `npm run test:computer-preview` bestehen; die bekannten lucide-react-Buildwarnungen bleiben. Der Fehlertest führt genau einen synthetischen Aktionsaufruf, keine native Eingabe und keinen Modellaufruf aus. Ein neuer realer Aufgabenlauf bleibt erforderlich; die Änderung beweist keine Behebung jedes nativen Windows-Klickfehlers.

## Experimentelle Übersicht-/Detailansichten – 22. Oktober 2026

Quellstand auf Basis von 0.1.6; noch kein neues Windows-Paket. Vollbild bleibt Standard. Der wählbare Versuch liefert eine echte Übersichtsskalierung, höchstens einen Originalausschnitt und lokale Bereichsauswahl. `inspect` verwendet dieselbe Aufnahme; `nextDetail` kann einen Bereich für die nächste Antwort vorgeben. Bei fehlender Orientierung kann das Modell mit `screenshot` und `resolution: "original"` ausdrücklich ein frisches Gesamtbild anfordern. Die nächste gewöhnliche Beobachtung verwendet wieder den eingestellten Faktor. Bildkennungen und Koordinaten werden vor einer einzelnen nativen Eingabe geprüft.

| Prüfung | Ergebnis |
| --- | --- |
| `npm run check` | Architektur, Typprüfung und 572 Tests bestanden; keine Fehler oder Auslassungen. |
| `npm run build` | Windows-Helfer, Main, Agent-Host und Renderer erfolgreich gebaut. Bestehende Warnungen zu `use client` in lucide-react bleiben ohne Buildfehler. |
| Geometrie / Auswahl | Originalpixel-Vergleich, kleine Änderungen, entfernte Dialoge, Rauschen, Scroll-/Gesamtänderung, Randfälle, Größenbudget, stabile Auswahl und DPI-/Geometriewechsel synthetisch geprüft. |
| Lebensdauer / Abbruch | Alte oder ersetzte Ansichten können keine Eingabe auslösen. `inspect` verlängert die Aufnahme nicht. Stop wartet auf laufende Bildinitialisierung; die bestehenden Treiber-, Desktopbesitz- und Einmalaktionsprüfungen bestehen. |
| `npm run test:computer-images` | Echtes Electron: 64 Übersichten und 36 pixelgenau verglichene Ausschnitte; zehn Bildgeometrien im Hauptlauf, weitere Läufe mit Skalierungsflags 1,25 / 1,5 / 2. Keine Desktopaufnahmen oder Eingaben. |
| Transport | Der installierte Pi-Converter erzeugt echte Bildblöcke. V2 enthält nur Übersicht/Detail; im Metadatentext steht kein Originalbild. Der Detail-Hook betrifft nur die markierte Computerantwort, auch wenn fremde Anhänge identische Bildbytes haben. |
| `npm run test:computer-preview` | Verstecktes Electron-Testfenster mit synthetischer Sitzung: 3840 × 2160-Quelle, 240 × 135-Übersicht, 960 × 544-Originalausschnitt; exakt gleiche Bilder in Modellantwort und Vorschau. Ausdrücklicher Original-Vollbildabruf und anschließende Rückkehr zu Faktor 16 bestehen mit insgesamt drei synthetischen Aufnahmen. Einspaltige schmale Ansicht, Stopp, Fokus, Escape und Vollbildkompatibilität bestanden. Null Desktop-Eingaben. |
| Original-Vollbild auf Anfrage | Frische Bildkennung, genau ein vollständiges Bild, keine zusätzliche Eingabe, unveränderte Originalpixel, identische Klickkoordinaten und automatische Rückkehr zum gespeicherten Faktor nach einer Aktion oder gewöhnlichen Aufnahme geprüft. Alte Kennungen bleiben ungültig; V1 und Original-Bilddetailbehandlung sind kompatibel. |
| Einstellungen | Faktor 1 als Standard/Migration, experimentelle Faktoren und benutzerdefinierter gültiger Faktor, Speicher-/IPC-Rundlauf sowie Ablehnung ungültiger Werte geprüft. |

Die Vorschau-Screenshots sind visuell geprüft; generierte Nachweise und synthetische Testprofile werden nicht eingecheckt. Es wurden keine Cloudmodelle, persönlichen Konten, echten Bildschirmaufnahmen oder bestehenden Nutzerprofile für diese Abnahme verwendet. Der Pixelvergleich und die Bildaufbereitung laufen zunächst synchron im Main-Prozess; ihre Zeiten sind getrennt in V2 protokolliert.

Offen bleiben native Zielklicks mit unterschiedlichen Windows-DPI, vollständige Aufgaben über mehrere Programmtypen, Paketabnahme und wiederholte Zeit-/Token-/Erfolgsvergleiche. Die synthetischen Prüfungen belegen den technischen Vertrag, keinen Geschwindigkeitsgewinn. Der [Computer-Use-Plan](computer-use-uebersicht-und-detail-plan.md) beschreibt die weitere Abnahme.

## 0.1.6: Feste Mikrofon- und Lautsprecherauswahl – 22. Oktober 2026

Konkrete Audiogeräte bleiben auch im getrennten Zustand ausgewählt. Die Einstellungen zeigen das gespeicherte Gerät mit dem Zusatz „nicht angeschlossen“ an. Name und Gruppenkennung werden zusammen mit der Geräte-ID gespeichert. Eine gleiche ID hat Vorrang; bei geänderter ID kann das Gerät anhand eindeutiger Gruppen-/Namenszuordnung wiedererkannt werden. Mehrdeutige Zuordnungen erfordern eine erneute Auswahl. Windows-Standardgerät bleibt eine ausdrücklich wählbare Alternative.

Ein getrenntes fest gewähltes Ausgabegerät wird nicht still durch die aktuelle Standardausgabe ersetzt; das gilt auch für Signaltöne. Eine laufende Aufnahme oder Wiedergabe wird beim erkannten Verlust ihres Geräts beendet. Aus der unterbrochenen Aufnahme wird kein Transkript automatisch gesendet. Wiederverbinden startet keine neue Aufnahme.

| Prüfung | Ergebnis |
| --- | --- |
| Architektur, Typen und Tests | Bestanden: 506 Tests, keine Fehler oder Auslassungen. Enthalten sind neue Prüfungen für Geräteidentität, Mehrdeutigkeit, Speicher-/IPC-Rundlauf, Auswahlansicht und Audioabbruch. |
| Produktionsbuild | Bestanden: Windows-Helfer, Hauptprozess und Renderer. |
| Electron-Geräteprüfung | Bestanden: Auswahl über die Oberfläche, Trennen, Neustart mit fehlenden Geräten, Wiederverbinden mit anderen IDs/Gruppen und ausdrückliche Rückkehr zum Windows-Standard. |
| Betroffene Regressionen | Oberflächen-, IPC- und asynchrone Speicherprüfung bestanden. |
| Windows-Paket | Paket 0.1.6 besteht Dateiworkflow, Gespräch/Kontext/Neustart sowie die neue Geräteprüfung mit frischen Profilen ohne globales Node oder Codex im PATH. |

Gerätelisten und Wechselereignisse sind in diesen Prüfungen synthetisch. Sie benötigen keine echten Mikrofonaufnahmen, Zugangsdaten oder Cloudanfragen. Ein physischer USB-Aus-/Einstecktest ist damit noch nicht nachgewiesen. Der lokale Gerätenachweis liegt unter `artifacts/openhiatus-audio-geraete-ui.json`; die Paketabnahme unter `artifacts/openhiatus-paketpruefung.json`.

## Aktueller Skill-Umfang – 22. Oktober 2026

Der öffentliche Quellstand und die daraus gebauten Pakete enthalten keine Skill-Sammlung. Neue Profile starten ohne vorinstallierte Skills; eigene lokale Skills liegen unter `%APPDATA%/openhiatus/pi/skills`. Build und Appstart benötigen keinen Skill-Ordner im Repository. Automatische Skill-Installation und Legacy-Migration entfallen; bestehende lokale Profil-Skills werden nicht verändert.

Nach dieser Änderung bestanden Architekturprüfung, Typprüfung und alle 495 verbleibenden Tests ohne Auslassungen. Die sieben Prüfungen des entfernten Skill-Installers und der nicht mehr mitgelieferten Skill-Skripte entfallen. Die echte Electron-Oberflächenprüfung bestätigt ein zunächst leeres Profil, das Erkennen eines selbst angelegten synthetischen Skills und dessen unveränderten Erhalt nach Neustart. Ein isoliertes Windows-Testpaket enthält auch bei lokal vorhandenem Repository-Skillordner keine Skills; Dateiworkflow und Gespräch mit Neustart bestehen mit frischen synthetischen Profilen ohne globales Node oder Codex im PATH.

## Öffentliche Alpha und Lizenzentscheidung – 22. Oktober 2026

Der Quellstand 0.1.5 wird als Alpha für die öffentliche Weiterentwicklung vorbereitet. Die öffentliche Git-Historie beginnt mit einem eigenständigen Anfangscommit unter MIT; die vorherige lokale Entwicklungshistorie gehört nicht dazu. `LICENSE`, `package.json` und Lockdatei verwenden MIT.

Die folgenden Abschnitte dokumentieren datierte lokale Entwicklungsprüfungen und historische Pakete. Sie sind keine Freigabe einer fertigen Version und behaupten keine erneute Prüfung auf weiteren Rechnern. Bereits erzeugte Windows-Pakete und ZIP-Exporte mit `UNLICENSED` werden durch die Lizenzänderung nicht aktualisiert. Die Veröffentlichung des Alpha-Quellcodes ist unabhängig von einem späteren Downloadpaket.

## openHiatus 0.1.5: Anzeigename und Windows-Paket – 22. Oktober 2026

Die Oberfläche, Fenstertitel, Sprach-Overlay und Windows-Produktinformationen verwenden **openHiatus**. Die Versionsanzeige kommt aus dem gestarteten Electron-Paket statt aus einer zweiten fest eingetragenen Versionsnummer. Technischer Slug, Profilordner, IPC und App-ID bleiben `openhiatus`; das Profil liegt unter `%APPDATA%/openhiatus`.

| Abnahme 0.1.5 | Ergebnis |
| --- | --- |
| Anzeigename, Version und Windows-Paket | Bestanden: `release/0.1.5/openHiatus-win32-x64/openHiatus.exe`, ProductName openHiatus, Datei- und Produktversion 0.1.5. Wortmarke und Footer in der gepackten App geprüft. |
| Architektur, Typen und Tests | Bestanden: 502 Tests, keine Fehler oder übersprungenen Tests. |
| Oberfläche und Integrationen | Alle acht UI-Prüfungen bestanden: Navigation/Einrichtung, IPC mit zwei Aufträgen, Dateiworkflow, Gespräch/Kontext/Neustart, Gedächtnis, beide Speicher-Worker und synthetische ChatGPT-Anmeldung. |
| Ausgelieferte EXE | Paketprüfung mit eigenem Electron/Pi und nativen Bibliotheken bestanden. Dateiworkflow und Gespräch/Neustart laufen ohne globales Node oder Codex im PATH. |
| Quellbestand und Quellexport | Der aktuelle Quellbestand ist UTF-8, frei vom früheren Produktnamen und ohne persönliche Profile. Historienfreier Export: `release/0.1.5/openhiatus-source.zip`; keine GitHub-Veröffentlichung, Lizenz weiterhin UNLICENSED. |

Die Funktionstests verwenden synthetische Profile und lokale Antworten. Die App importiert keine Profile anderer Installationen automatisch.

Drei Vorlaufbefunde betreffen die Prüfungen: Der native Handoff-Test veröffentlicht seine Testmarker jetzt atomar, damit eine bloß angelegte, noch leere Datei kein fertiges JSON vortäuscht. Der IPC-Test wartet nach dem Bestätigungsklick auf die dauerhaft abgeschlossene Freigabe. Der UI-Smoke-Test erlaubt für den ersten Fensteraufbau dieselben 30 Sekunden wie der Electron-Start. Die anschließenden Abschlussläufe bestehen; keine Produktwiederholung oder Aufhebung von Schutzregeln wurde eingebaut.

Die älteren Abschnitte behalten ihre damaligen Versionen, Zeitangaben und Testzählungen. Die Abnahme von 0.1.4 ist keine Abnahme von 0.1.5.


## Abgeschlossene Umbenennung und Windows-Auslieferung 0.1.4 – 21. Oktober 2026

Der Produktname lautet jetzt durchgehend `openhiatus`. Profil und App-ID verwenden den neuen Namen; ältere Installationen und Profile werden nicht automatisch importiert oder verändert. Das gebaute und geprüfte Paket lautet `release/0.1.4/openhiatus-win32-x64/openhiatus.exe`. Einrichtung und Navigation verwenden **Einstellungen → Modelle & Zugänge**, **Sprache & Geräte** und **Bedienung**.

Der Quellbestand enthält Generatoren, Oracles, Evaluatoren und Testquellen; generierte Benchmark-Dateien und Laufberichte gehören nicht zur Quellablage. Neue Praxisnachweise benötigen frische Läufe. Der damalige Lizenzstatus war **UNLICENSED**; für den öffentlichen Alpha-Quellstand gilt MIT, wie am Anfang dieses Dokuments festgehalten.

| Neue Abnahme nach der Umbenennung | Ergebnis |
| --- | --- |
| Architekturregeln, Typen und vollständige Tests | Bestanden: 502 Tests, 0 Fehler und 0 übersprungen. Native Prozess-/Handoff-, IPC-, Speicher-, Gedächtnis- und Sprachprüfungen enthalten. |
| Windows-Build und Paket 0.1.4 | Bestanden: eigene Electron-/Pi-Laufzeit und native Desktopbibliotheken. EXE-Metadaten für Produkt, Beschreibung, Firma und Dateiname verwenden in diesem historischen Paket `openhiatus`. |
| UI-, Stopp-, Speicher- und Paketregressionen | Alle acht UI-/Integrationstests bestanden: Oberfläche, IPC mit zwei Aufgaben, Dateiworkflow, Gespräch/Kontext/Neustart, Gedächtnis, beide Speicher-Worker und synthetische ChatGPT-Anmeldung. Die ausgelieferte EXE besteht zusätzlich Workflow und Gespräch/Neustart ohne globales Node oder Codex im PATH. |
| Quellbestand und Darstellung | 272 UTF-8-Quelldateien und 145 lokale Markdownlinks geprüft; keine früheren Produktnamen in Inhalt oder Pfaden, keine historischen Binärdateien. Wortmarke und UI bei normalem und kompaktem Fenster visuell geprüft. |
| Benchmark-Controllerprüfungen | 43 Tests ausgeführt: 41 bestanden, 2 ausdrücklich übersprungen (frischer XLSX-Export fehlt; Windows-Symlinkprivileg fehlt). Synthetische Monatsabschluss-Vorbereitung und identische Wiederholung zusätzlich bestanden; kein neuer Office-/Modelllauf. |

Die folgenden Abschnitte dokumentieren frühere Entwicklungsschritte. Sie behaupten keine erneute Ausführung unter dem neuen Namen. Lokale Artefaktpfade verweisen auf die damalige Prüfumgebung; aktuelle Befehle erzeugen neue Nachweise.

Ein nativer Handoff-Vorlauf war wegen eines fehlenden Prozessmarkers rot; isoliert ließ sich der ursprüngliche Fehler nicht reproduzieren. Der Test prüft nun die tatsächliche Shellrückgabe und Übergabequittung und wartet begrenzt auf die Testprozessmarker. Der vollständige Abschlusslauf besteht. Es wurde kein Fehler der neuen Namensräume nachgewiesen und keine Produktkorrektur dafür behauptet. Alle Prüfprofile und Modellantworten sind synthetisch; bestehende Nutzerprogramme und Konten wurden nicht verändert. Der Paketnachweis liegt lokal unter `artifacts/openhiatus-paketpruefung.json`.


Stand: 21. Oktober 2026. Windows x64, Electron 44.5.1, Pi 1.3.0.

## Siebter Architekturabschnitt: aktueller Quellstand

Die Oberfläche besitzt einen eigenen Navigationsrahmen, eine langlebige Anwendungssitzung und getrennte Ansichten für Gespräch, Aufgaben, Dienste, Gedächtnis, Skills und Einstellungen. Aufgaben zeigen Statusfilter, Ergebnisse, Fehler, Verbrauch und Einzelstopp. Die bestehenden Provider-/ChatGPT- und Audiofunktionen bleiben angebunden. Die folgenden Prüfungen gelten für den Produktionsbuild aus dem Quellcode; das bestehende Windows-Paket 0.1.4 wurde nicht ersetzt.

| Prüfung | Ergebnis |
| --- | --- |
| `npm run check` | bestanden: Importregeln, TypeScript und 502 Tests; 0 Fehler, 0 übersprungen |
| Produktionsbuild | bestanden |
| `npm run test:ui` | bestanden: sechs Ansichten, erhaltener Entwurf und ungespeicherte Zugänge, Registertastatur, Anbieter, Modellrollen, DPAPI, Skills, Aufnahme über Navigation, Escape, kompaktes Fenster und reduzierte Animationen |
| `npm run test:ipc` | bestanden: zwei gleichzeitig laufende echte Worker, alle Ansichten ohne zusätzlichen Modellaufruf, erhaltener Entwurf/Filter/Auswahl, Einzelstopp über die Aufgabenliste und Neustart |
| `npm run test:storage-ui` | bestanden: blockierter Speicher-Worker, UI-Senden und UI-Stopp, verspätete Bestätigung erhält Entwurf, Stop-Hinweis und Ansicht; kein Modellstart und kein Replay |
| `npm run test:workflow` | bestanden: UI → Dialog → Hintergrundworker → UTF-8-Datei; zugeordnetes Ergebnis und Verbrauch in der Aufgabenansicht |
| `npm run test:conversation` | bestanden: sichtbarer Verlauf, Kontextmessung, zweite Nachricht und Neustart ohne wiederholte Modellarbeit |
| `npm run test:memory-ui` | bestanden: Berichte, Quellen, Versionen, Freigaben, Korrekturen, UTF-8 und Neustart |
| `npm run test:memory-storage-ui` | bestanden: gehaltener Gedächtnis-Worker, Stopp, bestätigte Änderungen, unterbundener später Modellstart und natives Schließen |
| `npm run test:chatgpt-ui` | bestanden: synthetische Anmeldung, Abbruch, Freigaben, Trennen und Modellrollen |

Die zusätzlichen Tests prüfen vollständige Aufgabenlisten, Status-/Laufzeitfilter, unveränderte Snapshots, geschlossene Kontextdetails, Teilergebnisse und Fehler, sichere Ergebnisdarstellung, Verbrauch ohne erfundene Preise sowie doppelte Einzelstoppanfragen. Die UI-Operationsprüfungen halten Send-/Resetantworten zurück und prüfen Stopp, verspätete Erfolge/Fehler, die Lebensdauer einer neuen Operation und Anfragekennungen bei Wiederholung. Die Importprüfung erlaubt ausschließlich den öffentlichen CSS-Einstieg eines anderen Features.

Der Electron-IPC-Test hält zwei lokale Modellantworten zurück. Während sechs Ansichtswechseln bleiben beide Aufgaben aktiv und der Entwurf unverändert; die Anzahl der Modellanfragen bleibt gleich. Filter und Detailauswahl überleben einen weiteren Wechsel. Anschließend stoppt ein echter UI-Klick die erste Aufgabe, während die zweite ihre Datei schreibt und prüft. Der bestehende Absender-/Frame-/URL-Guard und die Eingabeprüfung bleiben erhalten.

Mehrere Speicher-UI-Vorläufe scheiterten beim Dateipoll an einem echten Windows-`EPERM` für `state.json.tmp → state.json`. Der instrumentierte private Worker bestätigte die korrekte Reihenfolge: erst `running`, dann ein abgewiesener `interrupted`-Schreibauftrag. Die Ursache war der Dateiaustausch, kein verlorener Journalauftrag. Der Produktions-Worker erhält einen auf Windows und `EPERM`/`EBUSY` begrenzten Wiederholungsversuch für die bereits synchronisierte Tempdatei, mit geplant 150 ms Pause zuzüglich Betriebssystem- und Umbenennungszeit. Drei zusätzliche Dateiaustauschtests prüfen unveränderte Primärdatei und Sicherung, Erfolgsbestätigung und Fehlergrenze; Dauerfehler bleiben sichtbar. Der UI-Test zeichnet seine Workerfolge lokal auf und gibt sie bei einem Fehler aus; das ersetzt keine Fehlerprüfung durch längere Timeouts.

Die Oberflächen sind anhand erzeugter Screenshots visuell geprüft, einschließlich Aufgaben und Einstellungen bei 1000 × 760 Pixeln ohne horizontalen Dokumentüberlauf. Der Mikrofontest nutzt ein synthetisches Gerät; er belegt den Erhalt der Aufnahme und deren Abbruch über Navigation. Echte Mikrofon-/Lautsprecherqualität und fremde Konten sind damit nicht abgenommen. Der UI-Smoke-Test verwendet eine private Buildkopie, die externe Main-Fetches blockiert; der Modellserver läuft auf Loopback. Testprofile, Schlüssel und Daten sind synthetisch. Lokale Belege liegen unter `artifacts/openhiatus-ipc-auftraege-pruefung.json`, `artifacts/openhiatus-async-speicher-ui.json` und den `openhiatus-aufgaben-*.png`-Screenshots.

Nach dem Dateiaustauschfix bestanden fünf aufeinanderfolgende Speicher-UI-Läufe mit jeweils frischem Profil. Stopp benötigte darin lokal etwa 5–14 ms bei weiter gehaltenem Worker; es gingen null Modellanfragen an den lokalen Endpunkt. Diese Einzelmessungen sind keine allgemeine Latenzzusage. Die Speichergrenze blieb in allen Läufen vor und nach dem verspäteten ACK sowie über den Neustart erhalten.

Gmail ist noch nicht angebunden; die Dienstansicht kennzeichnet den geplanten Umfang. Auch die Übersicht-/Detail-Bildstrategie und der allgemeine Computer-Beobachtungsvertrag sind noch nicht umgesetzt. Ein neues Windows-Paket wurde in diesem Schritt nicht erstellt.

## Prüfstand des sechsten Architekturabschnitts

Ein eigener Worker besitzt jetzt den vollständigen Gedächtnisspeicher. Laden, Validierung, Suche, Abrufe und dauerhafte Änderungen laufen dort seriell. Die bestätigten Inhalte und Versionen von Identität/Kern bleiben als kleine Sicht im Hauptprozess. Der geschützte Zugangsspeicher bleibt synchron. Die folgenden Ergebnisse gelten für den gebauten Quellcode; ein neues Windows-Paket wurde nicht ausgeliefert.

| Prüfung | Ergebnis |
| --- | --- |
| `npm run check` | bestanden: Importregeln, TypeScript und 476 Tests; 0 Fehler, 0 übersprungen |
| Produktionsbuild | bestanden, mit Verlaufsspeicher- und Gedächtnis-Worker |
| `npm run test:memory-storage-ui` | bestanden: blockierter echter Gedächtnis-Worker bei Edit und Abruf; Stopp, bestätigter Edit, unterbundener später Modellstart, Neustart und natives Schließen |
| `npm run test:storage-ui` | bestanden: blockierter Verlaufsspeicher, Stopp ohne Schreibwait und Neustart ohne Replay |
| `npm run test:ui` | bestanden: Anbieter, drei Modellrollen, Schlüssel, Vollzugriffsbestätigung, Skills, synthetisches Mikrofon, Navigation und Escape |
| `npm run test:chatgpt-ui` | bestanden: synthetische Anmeldung, Abbruch, Freigabe, Trennen und Modellrollen |
| `npm run test:conversation` | bestanden: Verlauf, Kontextmessung und Neustart ohne wiederholte Arbeit |
| `npm run test:workflow` | bestanden: vollständiger UI-/Dialog-/Worker-/Dateiablauf und Ergebniszuordnung |
| `npm run test:ipc` | bestanden: Absender-/Eingabeprüfung, zwei parallele echte Worker, Einzelstopp, Ergebnis und Neustart |
| `npm run test:memory-ui` | bestanden: Berichte, Originalquellen, Versionen, Freigaben, UTF-8, manuelle Korrekturen und Neustart |
| `npm run bench:storage` | bestanden: synchrone Referenz und tatsächliche Gedächtnis-/Verlaufsspeicher-Worker mit getrennten Übergabe- und Bestätigungszeiten |

Die 43 zusätzlichen Tests prüfen alle Gedächtnis-Workeroperationen, unveränderliche FIFO-Anfragen und bestätigten Kerncache, Backup/Recovery, externe Dateiänderungen, ungültige Nachrichten, begrenzte Warteschlange, Absturz, Timeout und Schließwiederholung. Die Schwärzung berücksichtigt aktuelle und entfernte Zugangswerte, erhält dabei aber IDs, Rollen, Prüfsummen und Cursor. Eine Regression mit kurzen überlappenden Werten prüft echte Seitenfortsetzung, Berichtsanwendung und Kernfreigabe. Der neue Abrufparameter lässt für Aufträge bereits separat eingefrorene Kernvorgaben aus dem historischen Kontext weg.

Verzögerte Fachports prüfen Capture, Retrieval, Archivfortsetzung, Proposal, Berichtsplanung und Berichtsanwendung. Stopp verhindert spätere Einreichungen; bereits angenommene Änderungen dürfen bestätigt werden. Quellen werden vor Vorschlägen archiviert, strikte Archivierung verhindert den Gesprächsreset bei Fehler oder nur vorgemerkter Speicherung. Vor dem Warten eingefrorene Nachrichten bleiben dem richtigen Gespräch zugeordnet. Eine verspätete Freigabeentscheidung wird nach Stopp abgewiesen, bevor eine neue Mutation eingereicht wird. Ein Flushfehler beim Shutdown entsperrt keine bereits beendeten Agenten.

Der neue Electron-Test verwendet eine private Kopie des Produktionsbuilds und hält nur dort bestimmte Aufrufe vor dem tatsächlichen Worker an. Die Stopp-Aufrufe dauerten in den lokalen Läufen etwa 5–12 ms; es gingen null Modellanfragen an den lokalen Endpunkt. Edit und Version blieben nach Neustart erhalten. Beim nativen Schließen blieb das Fenster bis zur Bestätigung des letzten eingereichten Edits bestehen; dessen Inhalt war nach Prozessende gespeichert. Der Nachweis liegt unter `artifacts/openhiatus-gedaechtnisspeicher-ui.json`. Alle Profile und Daten sind synthetisch; reale Konten und laufende Benutzerinstallationen wurden nicht verwendet.

Bei 1.000 Nachrichten benötigte der synchrone Referenzabruf 161,06 ms. Die Übergabe an den Gedächtnis-Worker kostete im Median 0,063 ms, die vollständige Antwort einschließlich Abrufnachweis 172,56 ms. Ein vorgemerkter `setImmediate` war nach 0,074 ms erreichbar. Der bestätigte kleine Kerncache wurde in 0,006 ms gelesen. Die vollständige Speicherarbeit bleibt ähnlich teuer, läuft aber währenddessen im Worker. Die Übergabezeit isoliert den Aufruf und erfasst keine später im Hauptprozess nötige Antwortverarbeitung. Drei Datenträgerproben, warmer Cache und Hintergrundlast begrenzen diese lokale Messung; daraus folgt keine pauschale Modellbeschleunigung. [Messdetails und Grenzen](architekturpruefung.md#sechster-umgesetzter-abschnitt).

## Prüfstand des fünften Architekturabschnitts

Der Verlaufsspeicher validiert, serialisiert und schreibt in einem eigenen Worker. Das Journal bündelt gewöhnliche Stände und bestätigt dauerhafte Übergänge vor externer Arbeit. Gedächtnis- und Zugangsspeicher bleiben synchron. Die folgenden Ergebnisse gelten für den gebauten Quellcode; das zuvor ausgelieferte Windows-Paket wurde nicht ersetzt.

| Prüfung | Ergebnis |
| --- | --- |
| `npm run check` | bestanden: Importregeln, TypeScript und 433 Tests; 0 Fehler, 0 übersprungen |
| Produktionsbuild | bestanden, einschließlich `state-worker.cjs` |
| `npm run test:storage-ui` | bestanden: blockierter echter Speicher-Worker, bedienbare UI, Stopp ohne Write-Wait, späte Bestätigung ohne Modellstart und Neustart ohne Replay |
| `npm run test:ipc` | bestanden: Eingaben und fremdes Fenster abgewiesen, parallele echte Worker, gezielter Stopp, Dateiergebnis und Neustart |
| `npm run test:ui` | bestanden: Anbieter, Modellrollen, Schlüssel, Vollzugriffsbestätigung, Skills, synthetische Aufnahme, Navigation und Escape |
| `npm run test:chatgpt-ui` | bestanden mit synthetischem Konto: Anmeldung/Abbruch, Kontingentfreigabe, Trennen, Abmelden und Modellrollen |
| `npm run test:conversation` | bestanden: sichtbarer und gespeicherter Verlauf, Kontext und Neustart ohne Wiederholung |
| `npm run test:workflow` | bestanden: UI, Dialog, Auftragsannahme, Worker, Datei und zugeordnetes Ergebnis |
| `npm run test:memory-ui` | bestanden: Berichte, Quellen, Versionen, Freigaben, UTF-8-Seiten und Neustart |
| `npm run bench:storage` | bestanden: getrennte Hauptprozess- und Bestätigungszeiten bei 100/1.000 synthetischen Nachrichten |

Die 37 zusätzlichen Tests prüfen Workerprotokoll und echte Schreibbestätigungen, Datensicherung, ungültige Stände, Absturz, Timeout, ausdrücklichen Schließwiederholungsversuch, Journalbündelung, unveränderliche FIFO-Stände und Rollbacks. Verzögerte Fachports prüfen Initialisierung, Einwilligung, Duplikate, Warteschlangenlimit, Ressourcenreservierung, Start und Änderungen vor beziehungsweise nach Stopp. Ein zusätzlicher Pump-Durchlauf erhält während eines Schreibens eintreffende Startsignale. Direkter Pfad und Dialog prüfen mit echtem MemoryStore, dass eine nie angenommene Nachricht auch nach Stopp und Shutdown nicht als Quelle zurückbleibt.

Der neue Electron-Test verwendet eine private Kopie des Produktionsbuilds. Ein vorgeschalteter Testwrapper hält den Speicher-Worker an; die echte Main-/Renderer-Integration und der echte Schreibcode bleiben erhalten. Während der Blockade reagierten Snapshot und Stopp; im ersten Lauf dauerte der Stopp-Aufruf rund 10 ms. Bis zur Speicherbestätigung und nach dem Stopp gingen null Anfragen an den lokalen Modellendpunkt. Der spät bestätigte, unterbrochene Verlauf blieb beim Neustart erhalten. Belege liegen unter `artifacts/openhiatus-async-speicher-ui.json` und dem dort genannten isolierten Profil. Der Gedächtnis-UI-Test wartet nach dem Checkboxklick ausdrücklich auf den über IPC bestätigten Zustand und prüft dessen Erhalt beim Neustart.

Bei 1.000 Nachrichten sank die lokale Controllerzeit pro Aktivitätsereignis im Median von 40,87 auf 5,99 ms. Drei Ereignisse wurden als drei UI-Updates und ein Schreibzugriff verarbeitet. Die getrennte dauerhafte Workerbestätigung benötigte 35,13 ms, ihre Übergabe im Hauptprozess 1,16 ms. Gedächtnisabrufe bleiben mit rund 122 ms synchron. Drei Datenträgerproben mit warmem Cache belegen keine allgemeine Latenzzusage oder Modellbeschleunigung. [Messung und Grenzen](architekturpruefung.md#fünfter-umgesetzter-abschnitt).

## Prüfstand des vierten Architekturabschnitts

Modellverwaltung und direkter Aufgabenpfad besitzen eigene Zustände und Lebensdauern. Die interne Host-Kommunikation verwendet korrelierte, zur Laufzeit geprüfte Nachrichten. Das Zustandsjournal unterscheidet dauerhafte Commit-Barrieren, gewöhnliche Checkpoints und reine UI-Veröffentlichung. Die Speicheradapter arbeiten weiterhin synchron.

| Prüfung | Ergebnis |
| --- | --- |
| `npm run check` | bestanden: Importregeln, TypeScript und 396 Tests; 0 Fehler, 0 übersprungen |
| Produktionsbuild | bestanden |
| `npm run test:ipc` | bestanden: fehlerhafte Aufrufe und fremdes Fenster abgewiesen; zwei parallele echte Pi-Worker, gezielter Stopp, Dateiergebnis und Neustart |
| `npm run test:ui` | bestanden: Anbieter, Modellrollen, Schlüssel, Vollzugriffsbestätigung, Skills, synthetische Aufnahme, Navigation und Escape |
| `npm run test:conversation` | bestanden: Verlauf, gemessener Kontext und Neustart ohne Wiederholung; zwei Aufrufe für zwei Nachrichten |
| `npm run test:workflow` | bestanden: kompletter UI-/Dialog-/Worker-/Dateiablauf mit Ergebnis- und Verbrauchszuordnung |
| `npm run test:memory-ui` | bestanden: Quellen, Berichte, Versionen, Freigaben, UTF-8-Seiten und Neustart |
| `npm run bench:storage` | bestanden: reproduzierbare lokale Messung mit 100/1.000 synthetischen Nachrichten und isolierten Speicherdateien |

Die 24 zusätzlichen Tests umfassen fünf Modellverwaltungstests, sieben Direct-Task-Tests, sechs Protokolltests, fünf Journaltests und einen Test des kleinen Gedächtnis-Leseports. Sie prüfen eigenständigen Zustandsbesitz, Kopien/Rollback, dauerhaft angenommene Arbeit, eingefrorenen Turnkontext und Modellrollen, Quellenbelege, Auth-Abbruch und späte Antworten, Stoppfehler mit erneutem Versuch sowie Checkpoints bei blockierter Speicherung.

Die Protokolltests prüfen unbekannte und widersprüchliche Nachrichten, Antwortzuordnung, fehlgeformte beziehungsweise sparse Arrays, Typgegenbeispiele und die bestehende Bildgrenze von 56 Millionen Base64zeichen. Ein echter nativer Transport sendet nach einem ungültigen Abschluss weitere Werkzeug-, Zugangs- und Erfolgsmeldungen. Keine dieser Operationen wird zugestellt; kein Erfolg wird veröffentlicht. Eine ungültige Verbindung nimmt während ausstehender Killbestätigung keine neue Arbeit an. Die bestehenden echten SDK-/Windows-Prozessprüfungen sind Teil des Gesamtchecks; Hosttest-Bundles liegen nun jeweils in privaten `.test-data`-Verzeichnissen.

Der gezielte Kontextport verhindert eine zusätzliche Verlaufskopie bei reinen Kontextanzeigen des direkten Pfads. Der kleine Gedächtnisport liefert nur Identität/Kern samt Version, bereinigt bekannte Schlüssel aktuell und gibt unabhängig veränderbare Ansichten zurück. Er verändert keine gespeicherte Datei. Vollständige Archivsnapshots und die Gedächtnisoberfläche behalten ihren bisherigen Vertrag.

Die Speicher-Ausgangsmessung auf `fec5b96` bestätigt synchrone Hauptprozessarbeit. Ein Aktivitätsereignis kostete bei 1.000 Nachrichten lokal im Median rund 36 ms, ein Gedächtnisabruf einschließlich Abrufnachweis rund 146 ms. Drei Datenträger- beziehungsweise sieben CPU-Messungen mit warmem Cache liefern keine allgemeine Latenzzusage. Umfang, Rohdaten und nächste Speichergrenzen stehen in der [Architekturprüfung](architekturpruefung.md#vierter-umgesetzter-abschnitt).

Der Abschlusslauf misst bei 1.000 Nachrichten für den kleinen Identitäts-/Kernport 0,022 ms gegenüber 10,54 ms für den vollständigen Gedächtnissnapshot. Die reine Kontextanzeige liegt nach Wegfall der zusätzlichen Verlaufskopie bei 2,20 ms mit null Speicherzugriffen. Die übrigen vollständigen Speicher- und Abrufwege bleiben synchron; daraus wird keine gesamte Modellbeschleunigung abgeleitet.

Alle neuen Prüfungen verwenden synthetische Daten, isolierte Profile und lokale Modellserver beziehungsweise injizierte Adapter. Für diesen Abschnitt wurde kein neues Windows-Paket ausgeliefert.

## Prüfstand des dritten Architekturabschnitts

Die UI verwendet jetzt typisierte, zur Laufzeit geprüfte Feature-IPC. Das eigene Auftragsmodul besitzt Jobzustand, Annahmekontext, Worker-Lebensdauer, Archivfortsetzungen und Ergebniszuordnung. Der folgende Prüfstand gilt für den neu gebauten Quellcode.

| Prüfung | Ergebnis |
| --- | --- |
| `npm run check` | bestanden: Importregeln, TypeScript und 372 Tests; 0 Fehler, 0 übersprungen |
| Produktionsbuild | bestanden |
| `npm run test:ipc` | bestanden: sechs ungültige Aufrufe vor Fachausführung abgewiesen; fremdes Fenster abgewiesen; zwei parallele Pi-Worker, gezielter Stopp, korrektes Dateiergebnis und Neustart |
| `npm run test:ui` | bestanden: Anbieter, Modellrollen, geschützte Schlüssel, Vollzugriffsbestätigung, Skills, Navigation während synthetischer Aufnahme und Escape |
| `npm run test:memory-ui` | bestanden: Berichte, Quellen, Versionen, Freigaben, UTF-8-Seiten und Neustart |
| `npm run test:conversation` | bestanden: sichtbarer Verlauf und gemessener Kontext; zwei Nachrichten mit zwei Modellaufrufen über Neustart |
| `npm run test:workflow` | bestanden: UI → Dialog → Worker → geschriebene und gelesene UTF-8-Datei, Ergebniszuordnung und gemeldeter Verbrauch |

Die 20 zusätzlichen Tests umfassen zwölf IPC-/Typprüfungen, sieben Auftragsmodultests und eine Importgrenzenprüfung. IPC-Negativfälle prüfen unbekannte Namen, falsche Argumentzahl, unbekannte Felder, ungültige Werte, fremde Objektformen und Modellarrays mit leeren Plätzen. Alle bekannten Befehle laufen durch denselben Router-/Clientvertrag. Typgegenbeispiele sichern die Zuordnung von Argumenten und Rückgaben sowie den Ausschluss interner Auftragsanweisungen aus dem UI-Vertrag. Ein Randtest erhält die bestehende native Bildgrenze von 56 Millionen Base64zeichen einschließlich zusätzlichem PNG-URL-Präfix.

DTO-Projektionen entfernen unbekannte Felder und interne Auftragsanweisungen bereits vor dem IPC-Transport. Tests prüfen das für Befehlsantworten und Ereignisse; die Preload-Grenze prüft anschließend erneut Form und konkrete Nutzdaten. Der eigene Befehl für Vollzugriffsbestätigung bleibt der einzige UI-Weg zu dieser Einstellung.

Die Auftragsmodultests prüfen unabhängigen Zustandsbesitz und Kopien, zurückgerollte Annahme bei Speicherfehlern, eingefrorene Gedächtnisversionen mit auftragsspezifischen Belegen, Fortschritt/Bilder/Sprache, Archivfortsetzungen im selben Worker, Stopprennen, unbestätigten Stopp und Wiederherstellung ohne Wiederholung.

Die neue Electron-Prüfung verwendet ein verborgenes eigenes Testfenster mit demselben Preload, um den Absenderguard tatsächlich auszuführen. Der lokale Modellserver hielt beide Worker gleichzeitig aktiv. Stopp schloss die Verbindung des ersten Workers; der zweite blieb aktiv, schrieb und las sein Dateiergebnis. Vier Dialog- und insgesamt fünf Workeraufrufe sind erfasst. Nach Neustart blieben Nachrichten und Auftragszustände erhalten, ohne weitere Modellaufrufe und ohne Rendererfehler. Der lokale Nachweis liegt unter `artifacts/openhiatus-ipc-auftraege-pruefung.json`.

Alle neuen Abläufe verwenden isolierte Profile, synthetische Modellantworten und beim Audiotest ein künstliches Mikrofon. Ein neues Windows-Paket wurde nicht ausgeliefert. [Implementierter Architekturstand](architekturpruefung.md#dritter-umgesetzter-abschnitt).

## Prüfstand des zweiten Architekturabschnitts

Gedächtnisberichte liegen nun in einem eigenen Fachmodul. Pi verwendet eine pro Lauf gebundene Werkzeugregistrierung; Desktop ist ein konkreter Beitrag. Ein allgemeiner Dienstbroker bindet zunächst ausschließlich Leseoperationen an Konto, Auftrag und Lauf. Der folgende Stand bezieht sich auf den neu gebauten Quellcode.

| Prüfung | Ergebnis |
| --- | --- |
| `npm run check` | bestanden: Importregeln, TypeScript und 352 Tests; 0 Fehler, 0 übersprungen |
| Produktionsbuild | bestanden |
| UI → Dialog → Hintergrundworker → geprüfte UTF-8-Datei | bestanden, zwei Dialog- und drei Workeraufrufe gegen den lokalen Modellserver |
| Gedächtnisoberfläche, Quellen, Freigaben, Präferenzen und Neustart | bestanden, isoliertes Profil und synthetische Berichte |
| Gespräch, sichtbarer Verlauf und Kontext über Neustart | bestanden: zwei Modellaufrufe für zwei Nutzernachrichten, keine Wiederholung beim Neustart |

Die 29 neuen Tests verteilen sich auf neun Gedächtnisberichtstests, dreizehn Werkzeug-/Pi-/Computerbeitragstests und sieben Diensttests. Bestehende Pi- und Desktop-Lebensdauertests verwenden jetzt ausdrücklich registrierte Beiträge und bestehen unverändert in ihren Verhaltenserwartungen. Die gesamte Testsuite umfasst weiterhin tatsächliche lokale Pi-SDK-, Electron- und Windows-Job-Object-Prüfungen mit eigenen Testprozessen.

Die Berichtstests prüfen selbstständig Zeitplanung, Berliner Tageswechsel, abgesagte Timer, Einwilligungsentzug, Nutzerarbeit vor automatischen Berichten und Stopp trotz ausstehender Modellantwort. Der Prompt-/Schema-Block sowie der Summarizer-Algorithmus wurden beim Umzug bis auf Importpfade unverändert übernommen.

Die Werkzeugtests prüfen feste Definitionen und Handler je Lauf, Rollenbegrenzung, Validierung, Abbruch, verworfene späte Ereignisse, Desktopfreigabe und parallele Bereinigung. Auch eine fehlgeschlagene Teilbindung bleibt bis zur bestätigten Freigabe gesperrt und über den expliziten Stopp-Port wiederholbar. Eigene SDK-Werkzeugnamen dürfen nicht durch Beiträge ersetzt werden.

Die Diensttests verwenden synthetische Nachrichten- und Kalenderadapter mit mehreren Konten. Sie prüfen Konto-/Auftrags-/Laufzuordnung, Rechtewechsel und neue Verbindungsgenerationen, Abbruch unkooperativer Leser, Zeitgrenzen, begrenzte UTF-8-Ergebnisse, Quellenzuordnung und ausgeblendete Schreiboperationen. Ein Fehler in einem Ergebnis-Getter wird ebenso maskiert wie eine private Adapterexception. Der Pi-Integrationstest führt Dienstaufrufe durch die echte Adapter-/Registry-/Brokerlogik mit einem kontrollierten Transport; er ist keine echte Google- oder Kalender-API-Abnahme.

Ein realer Dienst, persistierte Dienstkonten und Google-OAuth sind noch nicht angeschlossen. Es wurde kein neues Windows-Paket ausgeliefert. [Implementierter Architekturstand](architekturpruefung.md#zweiter-umgesetzter-abschnitt).

## Prüfstand des ersten Architekturabschnitts

Nach der Paketabnahme von 0.1.4 wurden Gesprächssteuerung und Audiolebensdauer in eigene Module mit öffentlichen Einstiegen ausgelagert. Der folgende Stand bezieht sich auf den neu gebauten Quellcode; die spätere Tabelle dokumentiert die unveränderte frühere Paketabnahme.

| Prüfung | Ergebnis |
| --- | --- |
| `npm run check` | bestanden: Importregeln, TypeScript und 323 Tests; 0 Fehler, 0 übersprungen |
| Produktionsbuild | bestanden |
| UI → Dialog → Hintergrundworker → geprüfte UTF-8-Datei | bestanden, frisches Profil und lokaler Modellserver |
| Oberfläche, Navigation während synthetischer Mikrofonaufnahme und Escape | bestanden, frisches Profil und künstliches Mediengerät |
| Gesprächsverlauf und Kontextmessung über Neustart | bestanden: zwei Modellaufrufe für zwei Nachrichten; Neustart wiederholt keine Arbeit |

Die 27 zusätzlichen Tests prüfen die neuen Zustandsgrenzen: sechs für Gesprächsannahme, Queue, Originalauftrag, Identität und Stopp; zwölf für die Audio-Runtime; zwei für AudioContext-/Earcon-Freigabe; vier für Importgrenzen; drei für die Kombination aus Agent, JobManager und echter Desktopkoordination mit injiziertem Bildtreiber. Bei der letzten Kombination werden keine realen Bildschirminhalte aufgenommen und keine Desktop-Eingaben ausgeführt.

Die Desktopprüfung bestätigt, dass ein abgeschlossener Auftrag seine interaktive Sitzung freigibt, obwohl ein verwalteter Hintergrundprozess erhalten bleibt. Sie prüft außerdem verzögerte Freigabe, gleichzeitigen Stopp und unbestätigtes Cleanup. Die vorhandenen tatsächlichen Windows-Prozess- und Pi-SDK-Prüfungen sind Teil der vollständigen 323 Tests und wurden erneut ausgeführt.

Die UI-Prüfung verwendet ausdrücklich ein synthetisches Mikrofon. Ein Wechsel zu Skills und zurück erhält die laufende Aufnahme; Escape beendet sie. Die Runtime-Tests prüfen unter anderem ausstehende Mikrofonfreigabe, STT, TTS, Gerätewahl und Wiedergabestart nach Stopp sowie das Freigeben von URLs, Timern, Listenern und AudioContexts. Reale Inworld-Aufrufe oder persönliche Kontozugriffe gehören nicht zu dieser automatisierten Abnahme.

Die [Architekturprüfung](architekturpruefung.md#erster-umgesetzter-abschnitt) beschreibt die implementierten Modulgrenzen und die noch folgenden Teile von Lieferabschnitt A. Es wurde für diesen Abschnitt kein neues Windows-Paket ausgeliefert.

## Prüfstand des zuvor abgenommenen Pakets 0.1.4

| Prüfung | Ergebnis |
| --- | --- |
| TypeScript | bestanden |
| Gesamte Testsuite | 296 bestanden, 0 Fehler, 0 übersprungen |
| Produktionsbuild | bestanden |
| Echte Pi-/Electron-/Job-Object-Integration | bestanden |
| Electron-Oberfläche und Neustart | bestanden |
| ChatGPT-Anmeldung, Recovery und Hintergrundfreigabe | automatisiert mit synthetischem Konto bestanden |
| Kontext und Gesprächsverlauf über Neustart | echter SDK-/UI-Ablauf gegen Loopback bestanden |
| UI → Gespräch → Auftrag → Worker → Datei und Ergebnis | bestanden |
| Gedächtnisoberfläche mit Quellen, Versionen und Freigaben | bestanden |
| Native Desktopsteuerung am isolierten Testfenster | bestanden |
| Ausgeliefertes Windows-Paket ohne globales Node/Codex | bestanden, frisches Profil |

## Automatisierte Regressionen

Die 296 Tests enthalten 22 echte Windows-Prozessprüfungen sowie tatsächliche Pi-SDK-Durchläufe über die mitgelieferte Electron-Laufzeit. Sie decken unter anderem dauerhafte Auftragsannahme, Duplikatschutz, zwei parallele Worker, Pfadkonflikte, getrennten Stopp, verspätete Antworten, unterbrochene Sitzungen nach Neustart, Modellrollen, Verbrauchszuordnung, Schlüsselbereinigung, Gedächtnisquellen und fehlerhafte Persistenz ab.

Der SDK-Test verwendet einen lokalen deterministischen SSE-Server. Er prüft echte Dateierstellung mit Umlauten, native PNG-Bildinhalte im Modellrequest, Streaming, gespeicherte Sitzungsfortsetzung nach Host-Neustart, Steering, Dialog-Werkzeuggrenzen und Abbruch ausstehender Desktop-Rückrufe. Der direkte ModelClient verwendet weder Agent noch Werkzeuge.

## Kontext und Verlauf: Alltagsbefund und Regression

Beim ersten F8-Versuch liefen eine ältere und die aktuelle Installation parallel. openHiatus meldete F8/F9 als nicht registriert; dort waren weder Gesprächsnachrichten noch Pi-Sitzungen entstanden. Nach Aufnahme über die Schaltfläche **Sprechen** in openHiatus bestätigte der Benutzer eine reale Modellantwort und **1 % / 3,3 k von 272 k Token**. Die Antwort über F8 war der anderen laufenden openHiatus-Version zugeordnet. Ein Datenverlust im openHiatus-Verlauf ist nicht belegt.

Version 0.1.2 zeigt nicht verfügbare F8/F9-/Stopp-Hotkeys unmittelbar im Fenster. Der Status wird nicht gespeichert, da die nächste Registrierung erneut entscheidet. Fehlende oder zu einer früheren Sitzung gehörende Kontextmessungen erscheinen bei bestehenden Nachrichten als „– / Kontextverbrauch noch nicht gemeldet“. Kleine tatsächlich gemeldete Werte werden bei Rundung auf null als „<1 %“ bezeichnet. Direkte Hauptaufträge übernehmen ebenfalls passende Kontextereignisse; fremde Sitzungen können die aktuelle Messung nicht ersetzen.

`scripts/conversation-ui-check.mjs --require-context` prüft echte SDK-Dialoge über die Oberfläche gegen einen lokalen SSE-Server: nach erster Antwort zwei sichtbare und gespeicherte Nachrichten, nach Neustart unverändert zwei ohne erneuten Modellaufruf, nach zweiter Antwort vier. Die SDK-Messungen von 700 bzw. 800 Token bei 128.000 Kontextfenster kommen vor dem Abschluss an. Nach Neustart bleibt der Verlauf sichtbar und die ausstehende Messung wird ehrlich als unbekannt angezeigt. Die Paketabnahme führt denselben Test mit der ausgelieferten EXE aus. Bestehende Benutzerprofile werden dabei nicht verändert.

## ChatGPT-Anbindung

`tests/chatgpt-auth.test.ts` verwendet einen echten Loopback-Listener und synthetisch signierte RSA-ID-Token gegen nachgebildete OpenAI-Antworten. Geprüft sind PKCE, State, Nonce, Signatur, Issuer und Client-Audience; die Speicherung der ausgestellten Client-ID vor dem Tokenaustausch; Wiederanmeldung ohne neue Registrierung; Ablehnung einer abweichenden Client-ID oder eines anderen Kontos; fehlende Kontingentfreigabe; atomar rotierende Token bei parallelen Aufrufen; vorübergehende und endgültige Erneuerungsfehler; Abmelden und Serverwiderruf; abgebrochene und abgelaufene Anmeldungen; beschädigte Host-Metadaten mit Sicherung und verständlicher Wiederherstellung.

Die öffentliche OpenAI-Discovery wurde ohne Zugangsdaten abgefragt und die dokumentierten Endpunkte bestätigt. Kontenanmeldung und Modellinferenz wurden vollständig simuliert; es wurde kein echtes ChatGPT-Konto angemeldet und kein Kontingent verbraucht.

`tests/chatgpt-inference.test.ts` prüft mit dem tatsächlichen Pi-SDK den öffentlichen Responses-Endpunkt, Bearer-Token, `store:false`, `stream:true` und das Auslassen nicht unterstützter Felder. Nur `response.completed` gilt als Erfolg. Unvollständige Antworten, Kontingentfehler und vorzeitig beendete Streams werden verworfen. Der echte Agent-Host-Test weist zusätzlich Tokenwechsel zwischen zwei Modellanfragen und die Ablehnung einer unvollständigen Werkzeugantwort vor deren Ausführung nach. Anfragen nach Zugangstoken sind an den aktuellen Auftrag und dessen Modell gebunden; Stopp verwirft späte Antworten.

Controller- und Storage-Prüfungen sichern den standardmäßig deaktivierten Hintergrundzugriff, ausdrückliches Opt-in, Modellfallback, selektiven Abbruch automatischer Berichte, Loginabbruch bei Stopp/Beenden und größere DPAPI-geschützte OAuth-Datensätze. Ein wiederhergestelltes Profilbackup reaktiviert keine zurückgenommene Hintergrundfreigabe.

`scripts/chatgpt-ui-check.mjs` prüft eine isolierte Electron-Oberfläche mit synthetischem Konto: Login/Abbruch, Konto ohne Kontingentfreigabe mit erneuter Zustimmung, fehlerhafte oder abgemeldete Verbindung entfernen, Nutzung verwalten, Abmelden, ausdrückliche Hintergrundfreigabe und drei Modellrollen. Die separate OpenAI-API-Karte bleibt erhalten. Vier Screenshots unter `artifacts/openhiatus-chatgpt-*.png` sind visuell geprüft.

## Oberfläche und Arbeitsablauf

Der echte Pi-Worker übergibt in einem SDK-Durchlauf ein synthetisches Programm ausdrücklich unabhängig und startet ein zweites normal. Stopp lässt nur das übergebene Programm weiterlaufen. Native Prüfungen bestätigen dies zusätzlich für normales Host-Ende, Host-Absturz und App-Ende. Der Gesprächsagent erhält keine Übergabefähigkeit. Es wurde keine externe CLI installiert, angemeldet oder mit einem Modellauftrag gestartet.

`scripts/ui-smoke.mjs` prüft in einem frischen Profil Anbieter speichern, testen und entfernen, Windows-DPAPI ohne Klartextschlüssel in Metadaten, lokale Modelle ohne Schlüssel, drei getrennte Modellrollen, einmalige Vollzugriffsbestätigung mit Neustart, Skill-Einfügen mit Unicode, Mikrofon/Escape und kompakte Fensterbreite. Rendererfehler: keine.

`scripts/ui-workflow-check.mjs` sendet einen Auftrag über die echte Oberfläche. Der Pi-Dialog nimmt ihn über `start_task` an; ein eigener Pi-Worker schreibt und liest die gewünschte Datei. Der Test prüft Inhalt, richtige Ergebniszuordnung, Eingangsbestätigung, getrennte Werkzeugmengen und 60 gemeldete Worker-Token ohne erfundene Kosten.

`scripts/m3-ui-check.ts` prüft Tages-, Wochen- und Monatsberichte, vollständige UTF-8-Seiten, Originalquellen, historische Versionen, manuelle Korrekturen, Kernfreigabe, Neustart und kompakte Ansicht. Dafür werden ausdrücklich synthetische Berichte verwendet; es wird keine externe Modellqualität behauptet.

Die Screenshots wurden visuell geprüft. Ein zu schmales Rollenlabel wurde korrigiert. Nachweise liegen lokal unter `artifacts/openhiatus-*.png` und den jeweiligen isolierten `.test-data`-Profilen.

## Echte Desktopabnahme

`scripts/computer-post-action-check.ts` startet ein eigenes markiertes Windows-Testfenster mit absichtlich um 450 ms verzögerter Textdarstellung. Der native cua-driver fügt genau einmal `Grüße äöü ÄÖÜ ß – Prüftext ohne Absenden` ein. Das Ergebnis war vor der Werkzeugrückgabe tatsächlich gezeichnet. Es gab kein Enter, keine zusätzliche Eingabe und keine Modellaufrufe. Sechs native Bildschirmaufnahmen, Treiberfreigabe und Beenden des eigenen Testfensters sind bestätigt. Nur der synthetische Eingabefeldausschnitt wurde exportiert.

Beim ersten Lauf scheiterte die erste Aufnahme ohne Eingabe. Der Fehler war anschließend weder direkt noch im identischen Testablauf reproduzierbar. Die geprüften nativen Bibliotheken waren bytegenau identisch mit der vorherigen Installation. Eine konkrete Ursache ist nicht belegt; es wurde kein vermeintlicher Installations- oder Loaderfix erfunden. Interne Fehlerursachen bleiben nun für Diagnose erhalten, während Nutzertexte und Testprotokolle keine nativen Rohdaten ausgeben. `artifacts/computer-post-action-check.json` enthält den bestandenen Nachweis.

## Paketabnahme

`npm run package` erzeugt `release/0.1.4/openhiatus-win32-x64/openhiatus.exe` mit eigener Electron-Laufzeit, Pi 1.3.0, Prozesshost und nativen Desktopbibliotheken. Versionen erhalten eigene Ausgabeverzeichnisse, damit eine laufende ältere Version den Neubau nicht blockiert. Die Paketstruktur enthält keine Codex-CLI oder Codex-Binärabhängigkeit. ASAR ist für zuverlässige ESM-, WASM- und native Dateipfade deaktiviert.

`npm run test:package` startet genau diese EXE mit einem frischen Profil. Der App-Prozess erhält nur Windows-Systemverzeichnisse im PATH; Node und Codex sind darüber nicht verfügbar. Der vollständige UI-/Dialog-/Worker-/Dateiablauf besteht auch in diesem Paket. Der Nachweis liegt unter `artifacts/openhiatus-paketpruefung.json`.

Der lokale Prüfprozess benötigte wegen des überlangen geerbten Entwicklungs-PATH einen deduplizierten, begrenzten PATH. Die Systemkonfiguration wurde dafür nicht geändert. Auch Agent-Kindprozesse normalisieren ihren PATH und übernehmen keine Anbieter-Schlüssel aus der Umgebung.

## Prüfgrenzen

- Keine fremden API-Schlüssel übernommen; keine bezahlten externen Modellaufrufe.
- Der echte ChatGPT-Browserlogin muss vom Benutzer abgeschlossen werden. Die automatisierten OAuth-Prüfungen ersetzen keinen Kontozugriff; verfügbare Modelle und Nutzung richten sich nach dem tatsächlichen Plan und dessen Freigabe.
- Qualität der Desktopbedienung durch verschiedene Cloudmodelle und echter Inworld-STT/TTS-Durchlauf erfordern eingerichtete gültige Zugänge. Protokoll, WAV-Erzeugung, Audioabbruch und Sprachwarteschlange sind automatisiert geprüft.
- Vollzugriff ist die gewählte Betriebsart. Stopp verhindert weitere Arbeit und räumt verwaltete Prozesse auf; bereits erfolgte Änderungen werden nicht rückgängig gemacht.
- Live, `/goal` und automatischer Import aus früheren Installationen sind zurückgestellt. `/goal` wird ausdrücklich abgelehnt.

## 23. Oktober 2026: strukturierte Sprachantworten in 0.1.7

Der Aktualitätscheck wurde bisher bei mehr als 450 sprechbaren Zeichen vollständig durch einen pauschalen Verweis auf das Gespräch ersetzt. Dialog und Worker erhalten jetzt denselben [Antwortvertrag](structured-replies.md): Das Modell erzeugt im selben Lauf eine eigenständig verständliche Sprachantwort in `spoken` und die vollständige Schriftantwort in `text`. Der Prompt verlangt höchstens 450 Zeichen einschließlich Leerzeichen; technisch werden bis 500 Zeichen unverändert akzeptiert. Erst darüber greift eine Kürzung, ohne den Auftrag abzubrechen. Der vollständige Schrifttext bleibt erhalten. Der technische Rückfall für ältere unstrukturierte Antworten bleibt verfügbar.

Architekturprüfung, Typprüfung, 716 Tests und Build sind erfolgreich. Die Windows-Paketprüfung mit frischen Profilen bestätigt den echten Pi-Dialog-/Worker-Ablauf, Verlauf und Kontext nach Neustart sowie gespeicherte Audiogeräte. Eine synthetische lange Antwort liefert ihre Kurzfassung ausdrücklich im eigenen Sprachfeld statt am Anfang des Schrifttexts; der tatsächlich erzeugte Sprechauftrag enthält genau diese Kurzfassung, ohne einen zusätzlichen Modellaufruf. Fehlerhafte Protokolle werden nicht roh vorgelesen; dekodierte Antwortfelder werden erneut von bekannten Geheimnissen bereinigt. Zusätzliche Cloud-Modell- oder Inworld-Aufrufe wurden für die Abnahme nicht ausgeführt.

## 23. Oktober 2026: responsive Navigation und Arbeitsanzeige in 0.0.8

Die Navigation wechselt im Automatikmodus unter 960 Pixeln Inhaltsbreite zur Iconleiste. Ein Schalter unten rechts am Rand erlaubt eine gespeicherte manuelle Wahl; ein Rücksetzknopf und die Einstellungen stellen die Automatik wieder her. Das zentrale Symbol bemisst sich nach tatsächlicher Breite und Höhe der Gesprächsbühne. Das native Fenster lässt sich bis 560 × 440 Pixel verkleinern.

`scripts/responsive-navigation-check.mjs` prüft alle Navigationsziele und Einstellungstabs bei 560 × 440, 760 × 560 und 1360 × 900 Pixeln Clientfläche sowie das native Mindestfenster mit 544 × 401 Pixeln Clientfläche. Geprüft sind erreichbare Bedienelemente ohne horizontales Abschneiden, der äußere Navigationsschalter, manuelle Expansion im schmalen Fenster, gespeicherte Wahl nach Renderer-Neuladen, Fokus, Automatik-Reset und mitwachsende Symbolgröße. Bei mehreren gleichzeitigen Hinweisbannern wird die Gesprächsbühne im kleinsten Fenster vertikal scrollbar. Vergrößerte Systemschrift und weitere DPI-Konfigurationen sind damit noch nicht allgemein abgenommen.

Die standardmäßig ausgeschaltete Arbeitsanzeige ist ein eigenes transparentes, nicht fokussierbares Fenster oben rechts im Arbeitsbereich des Hauptfenster-Monitors. Nur aktive Dialog-, Auftrags- oder Gedächtnisarbeit zählt; ein bloß noch vorhandener abgeschlossener Agent nicht. Der rechte Griff verändert die Größe zwischen 96 und 320 DIP und speichert beim Loslassen. Das Fenster besitzt einen eigenen engen Preload ohne allgemeine App-API. Computeraktionen blenden es einschließlich einer gemeinsamen kurzen Compositor-Wartebarriere aus; verschachtelte Aktionen, Fehler und verspätete Ladeereignisse dürfen es nicht unzulässig wiederherstellen.

Architekturprüfung, Typprüfung, 742 Tests und Build sind erfolgreich. Die Overlay- und Preload-Tests decken Geometrie einschließlich negativer Monitorpositionen, Herkunft und Schema der IPC-Nachrichten, Größenpersistenz, Fokus-/Stopp-/Laderennen sowie direktes und delegiertes Computerwerkzeug ab. `scripts/activity-overlay-ui-check.mjs` prüft mit einem frischen Profil und genau einer lokalen synthetischen Modellantwort den Einstellungsschalter, Vorder-/Hintergrund, Minimierung, tatsächliches Ziehen am Griff, festen rechten oberen Anker, fehlenden Fokuswechsel, Ausblenden nach Abschluss und Persistenz nach App-Neustart. Zusätzliche Cloud- oder Inworld-Anfragen werden dafür nicht verwendet. Die PNG-Nachweise liegen ausschließlich lokal unter `artifacts/`.

Die Paketabnahme von 0.0.8 besteht mit der ausgelieferten Windows-EXE und ohne globales Node/Codex im App-PATH: Dialog-/Worker-Dateiauftrag, Verlauf und Kontext einschließlich strukturierter Sprachantwort, Audiogeräte nach Trennen/Wiederanschließen sowie die neue Arbeitsanzeige mit ihrem eigenen Preload und Größenpersistenz.

## 24. Oktober 2026: ein rundes Statussymbol für Arbeit und Sprache in 0.0.9

Das frühere rechteckige F8-Transkriptfenster und dessen texttragender IPC-Vertrag sind entfernt. Die optionale Anzeige besteht aus dem runden Symbol mit kurzem Status im Kreis und einer schmalen rechten Griffleiste auf transparentem Hintergrund. Aufnahme, Transkription, Antwortvorbereitung, laufende Arbeit und Wiedergabe teilen sich diese Anzeige. Die Sprachausgabe hält sie auch dann aktiv, wenn die Modellantwort bereits abgeschlossen ist. Ein geprüftes Transkript darf als „Bereit“ sichtbar bleiben; im Leerlauf oder Vordergrund wird ausgeblendet. Der neue Renderer-Vertrag akzeptiert ausschließlich eine feste Statusphase, keine Texte oder Transkripte.

Unter Einstellungen → Bedienung → Oberfläche & Arbeitsanzeige sind Schalter und Größenauswahl direkt erreichbar. Die vorher gespeicherte Größe, die Griffbedienung, Fokusvermeidung, Abschirmung während Computeraktionen und Stopp bleiben erhalten.

Architekturprüfung, Typprüfung, 744 Tests und Build sind erfolgreich. Ein Test treibt die tatsächliche VoiceSession mit synthetischen Audioressourcen durch Vertonung, Wiedergabe, Aufnahme und Stopp und prüft ihren Status nach bereits abgeschlossener Modellarbeit. Der echte Electron-Test prüft zusätzlich die Phasen über den engen IPC-Kanal, Ablehnung texttragender Pakete, runde Geometrie, transparenten Hintergrund, Status im Kreis, fehlendes zweites Sprachfenster sowie Größenauswahl und Neustart. Der responsive UI-Test mit allen Ansichten und dem nativen Mindestfenster ist erneut erfolgreich. Die Screenshots sind visuell geprüft; Tests verwenden synthetische lokale Daten und keine Cloud-/Inworld-Anfragen.

Die Paketabnahme mit der Windows-EXE von 0.0.9 ist ebenfalls erfolgreich: lokaler Dialog-/Worker-Dateiauftrag, Verlauf und Kontext nach Neustart, strukturierte Sprachantwort, Audiogeräte sowie die erweiterte runde Arbeitsanzeige einschließlich Status über das Modellende hinaus. Das App-PATH enthält dabei nur Windows-Systemverzeichnisse.

## 24. Oktober 2026: Rufname und Persönlichkeitsvorlagen in 0.0.10

Einstellungen → Bedienung → Name & Persönlichkeit bietet einen unabhängigen Rufnamen und vier mitgelieferte Gesprächsstile. Bis zu zwölf eigene Stilvorlagen lassen sich anlegen, bearbeiten, speichern, auswählen und löschen. Ein Wechsel des Stils erhält den Rufnamen. Standardvorlagen bleiben erhalten. Das vollständige Profil wird geprüft und erst nach bestätigter Speicherung als gespeichert gemeldet; Fehler erhalten den Entwurf und stellen das vorherige aktive Profil wieder her. Alte Profile erhalten einen Standardstil ohne erfundenen Rufnamen, vorhandene Identitäts- und Kerntexte bleiben unverändert.

Gesprächsanweisungen und neu angenommene Arbeitsaufträge erhalten das ausgewählte Profil. openHiatus bleibt App- und Organisationsname; der persönliche Rufname erscheint als Autor im Gespräch. Änderungen invalidieren den Gesprächsfaden für die nächste Nachricht. Bereits laufende Gespräche sowie laufende und wartende Aufträge behalten ihre eingefrorenen Anweisungen, auch während asynchroner Gedächtnisabrufe. Name und Stil werden nicht als neuer Arbeitsauftrag ausgegeben und verändern keine registrierten Werkzeuge oder Ausführungsregeln.

Architekturprüfung, Typprüfung, 756 Tests und Build sind erfolgreich. Validierungs-/Storage-/IPC-Tests prüfen Grenzen, Referenzen und Neustart; Controller-Tests prüfen laufende Anweisungen, atomare Ablehnung und Speicherfehler. Der Auftragstest prüft einen Profilwechsel während eines wartenden Gedächtnisabrufs. `scripts/assistant-profile-ui-check.mjs` bedient die echte Oberfläche: Rufname, Stilauswahl, Entwurf während Snapshot-Änderungen, eigene Vorlage anlegen und bearbeiten, Neustart, Namensanzeige im Gespräch, Wechsel zu Standardvorlagen und Löschen. Drei lokale Dialoganfragen und eine Worker-Anfrage enthalten nachweislich den gewählten Rufnamen und eigenen Stil in den tatsächlichen Modellanweisungen. Der responsive UI-Test besteht erneut mit allen Ansichten und Einstellungstabs. Keine Cloud-/Inworld-Anfragen oder Änderungen an vorhandenen Benutzerprofilen als Test.

Die Paketabnahme der Windows-EXE von 0.0.10 ist ebenfalls erfolgreich: Dialog-/Worker-Dateiauftrag, Verlauf und Kontext nach Neustart, strukturierte Sprachantwort, Audiogeräte, runde Arbeitsanzeige sowie die vollständige Profil- und Vorlagenverwaltung mit Prüfung der tatsächlichen Modellanweisungen. Das App-PATH enthält nur Windows-Systemverzeichnisse; sämtliche Testprofile und Zugangsdaten sind synthetisch.

## 24. Oktober 2026: widerspruchsarme Persönlichkeitsanweisungen in 0.0.11

Die Profilübergabe funktionierte bereits, konkurrierte aber mit alten automatisch angelegten Identitätstexten, die ausdrücklich freundlichen Ton verlangten. Die allgemeine Sprachregel verlangte zudem pauschal Einschränkungen, auch bei lockeren Meinungsfragen. Die Anweisungen unterscheiden jetzt Tatsachen-/Arbeitsunsicherheit von subjektiven Vorlieben. Die gewählte Persönlichkeit bestimmt hörbar Ton, Humor und Förmlichkeit in beiden Antwortfeldern; eine kühle oder bissige Vorlage darf die freundliche Standardhaltung ersetzen. Die alte feste Selbstdarstellung als App-Marke ist aus dem Dialog entfernt.

Nur zwei exakt bekannte frühere Standardidentitäten werden bei der Promptzusammenstellung durch eine neutrale Fassung ersetzt. Gespeicherte Dokumente, Versionen und manuell geschriebene Identitätstexte werden dabei nicht verändert. Dialog und Worker verwenden dieselbe Projektion. Konkretes Verhalten und kurze Beispielantworten können eigene Vorlagen deutlicher machen; die UI nennt dies im Bearbeitungshinweis. Dieses Vorgehen entspricht dem [OpenAI-Hinweis, konkurrierende Kontextanweisungen zu prüfen und Stilvorgaben ausdrücklich zu formulieren](https://developers.openai.com/api/docs/guides/latest-model#prompting-best-practices). Das verwendete Modell wird nicht gewechselt.

Architekturprüfung, Typprüfung, 758 Tests und Build sind erfolgreich. Die neuen Tests prüfen die neutrale Projektion bekannter Alttexte, den unveränderten Dokumentinhalt und Worker-Anweisungen. Der erweiterte Electron-Profiltest hinterlegt eine synthetische alte Standardidentität, prüft deren unveränderte Wiederherstellung und kontrolliert die tatsächlichen lokalen Dialog-/Worker-Anfragen auf ausgewählten Stil und Abwesenheit der konkurrierenden Standardformulierung. Diese Prüfungen belegen die Promptzusammenstellung und Persistenz, keine garantierte Charakterwirkung oder statistische Modellbewertung. Für die automatisierten Prüfungen werden keine Cloud-/Inworld-Anfragen verwendet.

Die vollständige Windows-Paketprüfung von 0.0.11 ist erfolgreich, einschließlich des erweiterten Profiltests, Gespräch/Verlauf, strukturierter Sprachfassung, Gerätepersistenz und rundem Hintergrundstatus.

## 24. Oktober 2026: eindeutige Zuständigkeit für Persönlichkeit und Gedächtnis in 0.0.12

Einstellungen → Persönlichkeit ist der zentrale Ort für Rufname, Antwortstil und eigene Vorlagen. Bedienung enthält die technischen Bedienoptionen. Der bisherige Navigationspunkt „Gedächtnis & Identität“ heißt „Gedächtnis“ und erklärt den Unterschied zwischen Fakten-/Arbeitsnotizen und dem Persönlichkeitsprofil. „Persönlichkeit öffnen“ wechselt direkt zum richtigen Einstellungstab und setzt den Tastaturfokus dorthin, auch bei wiederholter Nutzung.

Langzeitnotizen zeigen zuerst „Dauerhafte Fakten & Vorlieben“. Das bisherige Identitätsdokument bleibt unter „Erweiterte Hintergrundnotiz anzeigen“ bearbeitbar; ein ungespeicherter Entwurf verhindert dessen Ausblenden. Suchtreffer, Quellenverweise und bestehende Vorschläge können die Hintergrundnotiz weiterhin gezielt öffnen. Gespeicherte IDs, Inhalte, Versionen und Freigaben bleiben unverändert. Auch die Modellanweisungen verweisen für dauerhafte Rufnamen- oder Stiländerungen auf das Profil, statt dafür neue Gedächtnisvorschläge anzulegen.

Architekturprüfung, Typprüfung, 762 Tests und Build sind erfolgreich. Die Electron-Profilprüfung bestätigt den wiederholten Direktwechsel, getrennte Einstellungstabs, erhaltene Profil- und Hintergrundnotizentwürfe bei Navigation sowie weiterhin Vorlagenverwaltung, Neustart und tatsächliche lokale Dialog-/Worker-Anweisungen. Die Gedächtnisprüfung bestätigt Bearbeitung, Versionsschutz, Kernfreigabe, Quellen und Neustart. UI-Smoke und responsive Navigation bestehen einschließlich aller vier Einstellungstabs im nativen Mindestfenster und bei manuell ausgeklappter schmaler Navigation. Die automatisierten Modellantworten sind synthetisch; Benutzerprofil und Cloud-Zugänge werden für die Tests nicht verwendet.

Die vollständige Windows-Paketprüfung von 0.0.12 ist ebenfalls erfolgreich. Die ausgelieferte EXE besteht ohne globales Node/Codex im App-PATH Gespräch-/Worker-Dateiauftrag, Verlauf und Kontext nach Neustart, Audiogeräte, Hintergrundstatus sowie den erweiterten Profiltest einschließlich Direktnavigation und Entwurferhalt.

## 24. Oktober 2026: Fast als eigene Modellauswahl in 0.0.13

Unter Einstellungen → Modelle & Zugänge → Deine Modelle erscheinen geeignete ChatGPT- und OpenAI-Modelle paarweise, etwa „gpt-6.1-sol“ und „gpt-6.1-sol (fast)“. Arbeit, Gespräch und Gedächtnis speichern ihre Auswahl unabhängig. Vorhandene Auswahlen bleiben erhalten. Die Gesprächsansicht nennt jetzt sowohl das gewählte Gesprächsmodell als auch das Arbeitsmodell mit dem Fast-Zusatz. Auftragsdetails stellen gespeicherte Fast-Auswahlen lesbar dar. Das experimentelle getrennte Computer-Modell behält seinen vorhandenen eigenen Fast-Schalter.

Der Zusatz ist eine lokale Auswahlkennung. An den Anbieter geht weiterhin die ursprüngliche Modell-ID; Fast wird bei Dialog, Worker und direkten Gedächtnisanfragen als `service_tier: priority` angefordert. Diese Schreibweise ist laut [OpenAI-Dokumentation](https://developers.openai.com/api/docs/guides/fast-mode) gleichwertig und bleibt mit den bereits geprüften ChatGPT-Routen kompatibel. Ein Eintrag ohne Fast sendet keine explizite Fast-Anforderung. Angeforderte und vom Anbieter gemeldete Stufe bleiben getrennt; weder die Auswahl noch eine erfolgreiche Anfrage beweisen eine bestimmte Verarbeitungsgeschwindigkeit. Anbieterfehler führen zu keinem stillen Wechsel auf Standard oder einen anderen Anbieter. Bei API-Zugängen können Fast-Aufrufe mehr kosten.

Architekturprüfung, Typprüfung, 766 Tests und Build sind erfolgreich. Neue Regressionen prüfen Katalogreihenfolge, Auflösung und Neustart, gefälschte Auswahlkennungen, eingefrorene Dialog-/Worker-Deskriptoren sowie tatsächliche direkte ChatGPT-/API-Requests für Gedächtnisberichte einschließlich fehlendem Rückfall nach Fast-Ablehnung. `scripts/fast-model-ui-check.mjs` wählt alle drei Rollen über die echte Oberfläche, prüft reale lokale SDK-Dialog-/Worker-Anfragen, trennt angefordertes Fast von einer synthetisch gemeldeten Standardverarbeitung, wechselt wieder zur normalen Auswahl und bestätigt die Rollen nach Neustart ohne Wiederholung. Der responsive UI-Test besteht einschließlich des nativen Mindestfensters. Modellantworten und Zugänge sind synthetisch; es wurden keine Cloud-Inferenz oder realen Geschwindigkeitsmessungen ausgeführt.

Die vollständige Windows-Paketprüfung von 0.0.13 besteht mit der ausgelieferten EXE und ausschließlich Windows-Systemverzeichnissen im App-PATH. Zusätzlich zu Gespräch, Verlauf, Audiogeräten, Hintergrundstatus und Persönlichkeitsverwaltung läuft der neue Fast-UI-Test einschließlich tatsächlicher lokaler Dialog-/Worker-Anfragen, Rückwechsel und Neustart im Paket erfolgreich durch. Auch der allgemeine UI-Smoke-Test besteht.

## 24. Oktober 2026: vier Identitäts- und Gedächtnisdateien in 0.0.14

Gedächtnis → Agent & Nutzer enthält SOUL.md (Persönlichkeit, Werte, Stil und Grenzen), IDENTITY.md (Name, Rolle, Ausstrahlung und Emoji), USER.md (Nutzerangaben und Präferenzen) sowie MEMORY.md (wichtige Fakten, Entscheidungen und Erkenntnisse). Die Dateien liegen tatsächlich im Gedächtnisordner des Profils und sind in UI und Texteditor bearbeitbar. Einstellungen → Persönlichkeit verlinkt denselben Bereich. Die Vorlagenbibliothek bleibt erhalten; erst die ausdrücklich geprüfte und gespeicherte Übernahme eines SOUL-Entwurfs ändert den aktiven Stil.

Die Migration nutzt den bisherigen Rufnamen und den ausgewählten Stil. Vorhandener Kern, Versionen, Quellen und Freigaben bleiben erhalten; die alte Identitätsnotiz bleibt getrennt historisch zugänglich. Der versionierte Gedächtnisspeicher verwendet danach Format 2. Externe Dateiänderungen werden vor dem nächsten Gespräch und beim Neuladen als neue Version aufgenommen. Veraltete UI-Entwürfe können sie nicht überschreiben. Ein Quittungsindex unterscheidet ausstehende Exporte von neuen externen Änderungen; fehlgeschlagene Synchronisierung überschreibt keine neuere Datei. Ungültiges UTF-8, übergroße und nicht reguläre Dateien bleiben unverändert und erzeugen einen sichtbaren Hinweis. Bekannte Zugangsdaten werden weiterhin bereinigt.

Dialog und Arbeitsmodell erhalten dieselben vier Dateien; ältere Persönlichkeitsanweisungen werden dabei ersetzt. Aufträge frieren alle vier Versionen gemeinsam ein und wiederholen deren Text nicht zusätzlich im Nutzerprompt. Der Name aus IDENTITY.md erscheint im Gespräch. Agentenvorschläge für das Langzeitgedächtnis bleiben freigabepflichtig; die festen Werkzeug-, Rechte-, Stopp- und Antwortregeln bleiben bestehen.

Architekturprüfung, Typprüfung, 773 Tests und Build sind erfolgreich. Neue Store- und Worker-Tests prüfen Migration, echte Dateien, UTF-8, externe Versionierung, veraltete Entwürfe, ausstehende Exportreparatur und den bestätigten Anweisungscache. Ein Auftragstest prüft gemeinsam eingefrorene Dateien ohne alte Profilanweisungen oder doppelte Prompttexte. Der erweiterte Electron-Test bedient die vier Dateien und die Vorlagenbibliothek, erhält Entwürfe beim Navigieren, übernimmt externe Änderungen und prüft alle vier Inhalte in tatsächlichen lokalen Dialog-/Worker-Anfragen sowie einen externen Namenswechsel vor der nächsten Nachricht. Neustart, allgemeiner UI-Smoke, die bisherigen Gedächtnisabläufe mit Freigabe und responsive Navigation einschließlich Mindestfenster sind erfolgreich. Die Modellantworten sind synthetisch; Cloud-Inferenz oder statistische Stilqualität werden damit nicht behauptet.

Ein erster Gesamtlauf endete in einem unveränderten Computerbild-Integrationstestprozess ohne Einzelfehlerdiagnose. Dessen sechs Tests bestanden unmittelbar einzeln und anschließend erneut im vollständigen Lauf mit allen 773 Tests; eine konkrete Ursache dieses Abbruchs ist nicht belegt.

Die vollständige Windows-Paketprüfung von 0.0.14 besteht mit der ausgelieferten EXE und ohne globales Node/Codex im App-PATH: Gespräch-/Worker-Dateiauftrag, Verlauf und Kontext, Audiogeräte, Hintergrundstatus, der neue Identitätsdateien-/Vorlagenablauf sowie die Fast-Modellauswahl einschließlich Neustart. Der Identitätsablauf bestätigt auch im Paket externe Dateiänderungen, veraltete Entwürfe, die tatsächlichen Dialog-/Worker-Anweisungen und den Namenswechsel aus IDENTITY.md.

## 24. Oktober 2026: Google Kalender in 0.0.15

Dienste → Google Kalender führt durch die Einrichtung eines eigenen Google-OAuth-Clients vom Typ Desktop-App. Die Anmeldung erfolgt im Systembrowser mit State, PKCE und lokalem Loopback-Callback. Ein Konto und ein ausgewählter Kalender sind gleichzeitig nutzbar. Die Ansicht zeigt Zugriff, Zeitzone und eine seitenweise Agenda. Einrichtung, Auswahl und Verbindung bleiben nach Neustart erhalten; Zugangsdaten liegen im vorhandenen Windows-geschützten Speicher.

Arbeitsagenten können Termine lesen sowie persönliche Einzeltermine anlegen und ändern. Kalender und Konto sind an die UI-Auswahl gebunden; Wechsel oder Trennen entziehen bestehenden Werkzeugbindungen ihre Berechtigung. Kalender mit Lesezugriff erhalten keine Schreibwerkzeuge. Einladungen, Löschungen und serienweite Änderungen sind nicht enthalten. Datumsprüfung berücksichtigt exklusive Ganztagsenden und Sommerzeit. Änderungen prüfen die gelesene ETag, wiederholtes Anlegen mit derselben Anforderungskennung erkennt den vorhandenen Termin. Nicht bestätigte Schreibvorgänge werden als ungewiss gemeldet und nicht automatisch wiederholt. Gekürzte externe Beschreibungen dürfen keine vollständigen Google-Felder überschreiben.

Architekturprüfung, Typprüfung, 785 Tests und Build sind erfolgreich. Die neuen Tests prüfen echte lokale OAuth-Callbacks mit simulierten Google-Antworten, PKCE, State, Abbruch, fehlende Berechtigungen, gemeinsame Token-Erneuerung, Neustart, geschützten Speicher, Werkzeugrechte, ETags, idempotentes Anlegen, Sommerzeit sowie ungewisse oder unvollständig bestätigte Schreibvorgänge. Beim Beenden wird eine laufende Token-Erneuerung einschließlich eines rotierten Refresh-Tokens abgeschlossen.

Der isolierte Electron-Test bedient Einrichtung, Anmeldung und Abbruch, Kalenderauswahl, Agenda, tatsächliche lokale Dialog-/Worker-Werkzeugaufrufe zum Lesen, Anlegen und Ändern, Neustart und Trennen. Simulierte Google-Antworten werden ausschließlich in einer lokalen Testkopie eingebunden; die Produktion enthält keinen Mock-Schalter. Ein zweiter UI-Test prüft den unveränderten Produktionseinstieg mit Einrichtung, erhaltenen Entwürfen, bereinigtem IPC und geschützten Zugangsdaten. Responsive Navigation besteht einschließlich des nativen Mindestfensters. Die Testdaten und Modellantworten sind synthetisch; ein echtes Google-Konto wurde nicht verbunden und keine realen Termine wurden verändert. Der tatsächliche Kontozugriff benötigt weiterhin einen eingerichteten OAuth-Client und die Zustimmung im Browser.

UI-Smoke und die vollständige Windows-Paketprüfung von 0.0.15 sind ebenfalls erfolgreich. Die ausgelieferte EXE besteht ohne globales Node/Codex im App-PATH alle sieben Abläufe: Gespräch-/Worker-Dateiauftrag, Verlauf und Kontext, Audiogeräte, Hintergrundstatus, Identitätsdateien und Vorlagen, Fast-Modellauswahl sowie die neue Google-Einrichtung. Letztere bestätigt im tatsächlichen Paket Entwurferhalt, geschützte Speicherung, bereinigtes IPC und Neustart. Die simulierten Kalender-Lese-/Schreibabläufe wurden getrennt in der isolierten Testkopie geprüft; die Paketprüfung beansprucht keinen echten Google-Kontozugriff.

## 24. Oktober 2026: Bildschirmhilfe mit Kreis und Pfeil in 0.0.16

Der Gesprächsagent kann über das begrenzte Werkzeug screen_help den Hauptbildschirm aufnehmen, Originaldetails ansehen und ein sichtbares Bedienelement direkt auf dem Desktop einkreisen. Ein Pfeil zeigt auf den Kreis. Das transparente Hinweisfenster übernimmt keinen Fokus und lässt Klicks durch. Der Mensch bedient selbst; eine Hilfefrage benötigt keinen ausführenden Arbeitsauftrag. Ein eigener bearbeitbarer Skill bildschirmhilfe wird einmalig ins Profil kopiert und bei einer Hilfeaufnahme gelesen. Bestehende Nutzeränderungen werden nicht überschrieben. Bildschirmbilder erscheinen nicht als Chatnachrichten und verbleiben höchstens zwei Modellanfragen im gesendeten Kontext.

Bild-/Ansichtskennung, Ausschnittursprung und tatsächliche Bildabmessungen bestimmen die Position; die Umrechnung in Windows-DIP erfolgt genau einmal. Eine zweite lokale Aufnahme prüft vor dem Zeichnen die Zielpixel und Bildschirmgeometrie ohne zusätzliche Modellanfrage. Ein nativer Beobachter liefert ausschließlich Fenstergeometrie und einen Eingabezähler, keine Tastenwerte, Texte oder Fenstertitel. Eingaben, Fensterwechsel, neue Hilfe und Stopp verwerfen die Markierung; sie endet spätestens nach 30 Sekunden. Der Beobachter startet bei Bedarf und endet nach 65 Sekunden ohne Hilfewerkzeug. Automatische Programmänderungen nach dem Zeichnen werden nicht fortlaufend geprüft; mehrere Monitore und automatische Folgeprüfung bleiben offen.

Architekturprüfung, Typprüfung, 793 Tests, Build, Skill-Validierung und UI-Smoke sind erfolgreich. Die acht neuen Tests prüfen Detailkoordinaten, mehrere Skalierungsfaktoren, exakte Kennungen, veraltete oder veränderte Ziele, Desktopbesitz, Stopp während einer laufenden Anfrage, verspätete Overlay-Ladung, erhaltene Skill-Änderungen und Bildablauf. Der echte Electron-/Windows-Test bestätigt eine native Bildschirmaufnahme über einem eigenen synthetischen Editor, Kreis und Pfeil am richtigen Ziel, unveränderten Vordergrundfokus, einen abgesicherten echten Mausklick durch den Hinweis und dessen anschließendes Ausblenden. Es wird kein Workerauftrag angelegt und kein Bild ins Gespräch aufgenommen. Der Modellablauf besteht aus drei lokalen Anfragen: Beobachten, Markieren, Schlussantwort.

Ein erster Testaufbau verließ sich auf Electrons Fokusmeldung. Der native Klickschutz wies den Klick ab, weil das tatsächliche Windows-Vordergrundfenster nicht übereinstimmte. Der Aufbau prüft nun den nativen Vordergrund und die tatsächlich sichtbare synthetische Fläche, bevor er Klicks oder Bildexport zulässt. Der exportierte Nachweis enthält nur den geprüften Testbereich. Modellantworten sind simuliert; Erkennungsqualität eines Cloudmodells und ein echter Sprachanbieter-Durchlauf werden damit nicht behauptet.

Die vollständige Windows-Paketprüfung von 0.0.16 ist ebenfalls erfolgreich. Alle acht Abläufe bestehen mit der ausgelieferten EXE und ohne globales Node/Codex im App-PATH: Gespräch-/Worker-Dateiauftrag, Verlauf und Kontext, Audiogeräte, Hintergrundstatus, Identitätsdateien und Vorlagen, Fast-Modellauswahl, Google-Einrichtung sowie Bildschirmhilfe. Der neue Ablauf verwendet die unveränderte Produktion mit echter Bildschirmaufnahme, lokal simuliertem Modell und abgesichertem nativem Testklick. Auch nach Beenden des Tests bleibt kein Bildschirmbeobachter zurück.

## 24. Oktober 2026: IT-Supporter und besser sichtbare Hinweise in 0.0.17

Die Markierung verwendet eine 7-DIP-Linie mit 12-DIP-Kontrastkontur. Das Modell wählt für Kreis, Pfeil und Beschriftung ausdrücklich Rot, Schwarz oder Weiß anhand des beobachteten Hintergrunds; andere Farben werden vor Ausführung abgelehnt. Position, Stil und Kontur zeichnet weiterhin die Anwendung. Ein unveränderter bekannter Werks-Skill aus 0.0.16 wird mit Sicherung auf die erweiterte Anleitung aktualisiert. Nutzeränderungen und symbolische Links bleiben unverändert.

Einstellungen → Bedienung → IT-Supporter speichert eine allgemeine Helferrolle für die PC-Bedienung. Sie bewertet Ziel und Zusammenhang der gesamten Interaktion, ohne Schlüsselwortsuche im Programmcode. Indirekte Wünsche und Unsicherheit sollen zur Anleitung mit sichtbaren nächsten Schritten führen. Ausdrücklich gewünschte Ausführung bleibt möglich. Die Rolle wird mit dem Gesprächskontext eingefroren; ein Wechsel gilt für die nächste Nachricht und startet einen frischen Gesprächsfaden. Ausführende Worker erhalten diese dialogbezogene Rolle nicht.

Im Modus heißt Gespräch jetzt Protokoll. Einträge bleiben zum späteren Nachlesen sichtbar, der gewöhnliche Schreibbereich ist ausgeblendet. Sprachtranskripte können weiterhin geprüft und gesendet werden. Versteckte Schreibentwürfe werden auch durch die Tastatur nicht gesendet und erscheinen beim Rückwechsel wieder. Namen, Persönlichkeit, Identitätsdateien und Audioeinstellungen bleiben bestehen. Bestehende Profile erhalten den neuen Modus ausgeschaltet, bis er ausdrücklich gewählt wird.

Architekturprüfung, Typprüfung, 798 Tests, Build, Skill-Validierung, UI-Smoke und responsive Navigation sind erfolgreich. Neue Tests prüfen die strikte Farbauswahl bis zum Renderer-Port, die gesicherte Werks-Skill-Aktualisierung, Moduswechsel mit laufender Antwort, unveränderte ausführende Worker und die boolesche IPC-Grenze. Die echte Electron-/Windows-Prüfung besteht für alle drei Farben einschließlich dicker Linien, Kontrastkontur und nativem Klickdurchlass. Zwei Supporterfälle verwenden unterschiedlich formulierte Hilfewünsche; die tatsächlichen lokalen Modellanfragen enthalten die gewählte allgemeine Rolle. UI-Schalter, Protokoll ohne Schreibfeld, nicht gesendeter versteckter Entwurf, Rückwechsel, Neustart, alte Skill-Migration und kompakte Darstellung sind geprüft. Die Modellantworten sind synthetisch; die Tests belegen die technische Übergabe und Darstellung, keine garantierte Interpretation oder optimale Farbentscheidung eines Cloudmodells.

Die vollständige Windows-Paketprüfung von 0.0.17 ist ebenfalls erfolgreich. Alle acht Abläufe bestehen mit der ausgelieferten EXE und ohne globales Node/Codex im App-PATH. Der erweiterte Hilfeablauf prüft dabei den IT-Supporter mit schwarzer Markierung, die tatsächlichen Modellanweisungen, dicke Linie und Kontrastkontur, unveränderten Vordergrundfokus, echten Klickdurchlass, Protokoll und Entwurfschutz, Neustart sowie die Migration der unveränderten Werks-Anleitung. Rot und Weiß wurden zusätzlich im Quellbuild geprüft. Echte Cloud-Inferenz oder Sprachanbieter-Aufrufe waren nicht Teil dieser Abnahme.

## 25. Oktober 2026: Arbeitsplatzübernahme und Eingabesicherung in 0.0.18

Hintergrundarbeit zeigt ausdrücklich einen freien Arbeitsplatz. Tatsächlicher Desktopbesitz aktiviert unabhängig vom optionalen Hintergrundsymbol einen gelben Rahmen und einen großen Übernahmehinweis mit Esc-Notstopp. Die Anzeige gilt auf allen angeschlossenen Displays und bleibt zwischen Modellanfragen bestehen. Ein separater Windows-Helfer verwirft physische Maus-/Tastatureingaben während der Übernahme und lässt injizierte Agenteneingaben zu. Esc und Strg+Alt+F12 stoppen; registrierte F8-/F9-Sprachbefehle werden direkt an die App weitergegeben. Stopp blockiert weitere Agentenaktionen und lässt Loslassereignisse zur Bereinigung passieren. Menschliche Eingaben werden auch bei unbestätigtem Treiberende wieder freigegeben; die Agenten-Lease bleibt in diesem Fehlerfall erhalten.

Architekturprüfung, Typprüfung, alle 809 Tests, Build, UI-Smoke und responsive Navigation bestehen. Die neuen Tests prüfen Bereitschaft vor Treiberstart, Desktopbesitz zwischen Aktionen, Abbruchsignale, verzögerte Freigabe, Fehler beim Aufräumen, FIFO-Übergabe ohne falschen Freistatus, verspätete Overlay-Ladung sowie Statusdarstellung und IPC. Die kompilierte produktive C#-Policy besteht Prüfungen für physische und injizierte Eingaben, Esc, Strg+Alt+F12, Sprachbefehle, Wiederholungen und Loslassereignisse. Der echte Helfer beendet sich bei geschlossenem Kanal und beendetem Elternprozess; fehlende Lebenszeichen und Halt geben Eingaben nach ungefähr zwei Sekunden frei.

Der echte Electron-/Windows-Ablauf mit eigenem Vollbild-Testfenster und lokal simulierten Modellantworten bestätigt freie Hintergrundarbeit, bestätigte Eingabesicherung vor Computer Use, den obligatorischen Hinweis bei deaktiviertem Hintergrundsymbol, keinen Fokusentzug, Ausschluss des Rahmens aus der tatsächlichen Computeraufnahme und einen echten Agentenklick durch das passive Fenster. Abschluss und UI-Stopp geben den Arbeitsplatz frei. Kompaktes Fenster und Neustart sind geprüft. Mehrere Displaygrenzen werden zusätzlich synthetisch geprüft; die Ausführung am Gerät verwendet die tatsächlich angeschlossenen Displays.

Ein erster Prüflauf scheiterte an der fehlenden lokalen Electron-Binärdatei; nach Installation bestanden die Tests. Der Aufnahmevergleich erkannte zunächst die abgerundete Windows-Ecke des Testfensters. Das synthetische Ziel verwendet nun echtes Vollbild ohne Rundungen. Die erste Paketprüfung las die persistierte lange Gesprächsantwort vor Abschluss des asynchronen Journal-Schreibens; der bestehende Verlaufstest wartet jetzt ausdrücklich auf den vollständigen gespeicherten Inhalt.

Die anschließende vollständige Windows-Paketprüfung besteht mit neun Abläufen ohne globales Node/Codex im App-PATH: Datei-Arbeitsauftrag, Gesprächsverlauf, Audiogeräte, Hintergrundanzeige, Identitätsdateien, Fast-Modellauswahl, Google-Einrichtung, Bildschirmhilfe und neue Desktopübernahme. Der ausgelieferte Eingabehelfer, echte Aufnahme, Agentenklick, Freigabe und Neustart sind darin enthalten. Die Esc-Entscheidung ist mit der produktiven nativen Policy geprüft; ein physischer Hardware-Tastendruck und blockierte eigene Mausbewegungen wurden nicht manuell abgenommen. Sichere Windows-Desktops und die Interpretation echter Cloudmodelle sind nicht Teil dieser Prüfung.

## 25. Oktober 2026: optionaler Windows-Autostart in 0.0.19

Einstellungen → Bedienung → Windows-Autostart bietet „Mit Windows starten“. Der Schalter ist zunächst aus. Einschalten registriert für den aktuellen Windows-Benutzer ausschließlich die laufende Paket-EXE und den festen Parameter `--autostart`. Nach der Anmeldung startet das normale App-Fenster minimiert in der Taskleiste ohne Fokusübernahme. Ein weiterer Autostart öffnet es nicht; ein manueller Zweitstart zeigt die vorhandene Instanz. Ausschalten entfernt den Login-Eintrag. Der Zustand kommt aus Windows und wird bei erneutem Fensterfokus aktualisiert; eine externe Deaktivierung wird erst durch ausdrückliches Einschalten aufgehoben. Quellstarts und separate Datenprofile verändern den regulären Eintrag nicht.

Architekturprüfung, Typprüfung, alle 814 Tests, Build, UI-Smoke und responsive Navigation bestehen. Die neuen Prüfungen decken explizite Registrierung, unveränderten Zustand beim Lesen, externe Windows-Deaktivierung, fremde Einträge, nicht bestätigte Schreibvorgänge, bereinigte Fehler, ungeeignete Startumgebungen sowie die boolesche IPC-Grenze ohne frei wählbare Pfade oder Argumente ab.

Der Electron-/Windows-Test bedient die produktive Einstellungskomponente über das typisierte IPC mit dem echten Windows-Dienst und einem eindeutigen temporären Registrierungsnamen. Ein-/Ausschalten, Wiederanlauf, externe Deaktivierung und erneutes Einschalten bestehen. Die tatsächliche Run-Zeile enthält nur EXE und `--autostart`; beide Testwerte einschließlich der Windows-Freigabemetadaten werden anschließend entfernt. Electron lässt Schalter teilweise aus `launchItems.args` weg; der effektive Status wird deshalb anhand des eigenen Eintrags, des Programmpfads und seiner Windows-Freigabe bestimmt. Der minimierte Zustand wird mit nativen Windows-Fensterflags geprüft, da Electrons Sichtbarkeitsabfrage die Sichtbarkeit im Vordergrund beschreibt.

Die unveränderte Produktion wird zusätzlich mit eigenem Datenprofil normal und mit `--autostart` gestartet. Sie bleibt minimiert als normales Taskleistenfenster verfügbar, übernimmt keinen Fokus und startet im frischen Profil keine Aufträge oder Desktopübernahme. Der normale Zweitstart öffnet die bestehende Instanz. Die vollständige Windows-Paketprüfung besteht mit allen zehn Abläufen ohne globales Node/Codex im App-PATH, einschließlich des neuen Autostartablaufs. Der persönliche Login-Eintrag bleibt unberührt. Ein echtes Abmelden oder Neustarten von Windows war nicht Teil der Prüfung; geprüft sind Registrierung und der damit gestartete Programmablauf.
