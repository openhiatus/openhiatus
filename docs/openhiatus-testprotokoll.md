# openHiatus – Testprotokoll

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
