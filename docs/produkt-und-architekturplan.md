# openHiatus Produkt und Architekturplan

> Historische Referenz einer früheren Entwicklungsreihe. Architektur, Bedienpfade, Versionsnummern und damalige Prüfergebnisse beschreiben den datierten Stand, keine neue Abnahme der aktuellen Pi-basierten Version. Lokale Nachweisdateien sind kein Bestandteil der öffentlichen Quellablage. Aktuelle Einrichtung und Prüfungen stehen in der README und im aktuellen Testprotokoll.

> Historische openHiatus-Referenz. Für openHiatus sind die aktuelle [Vision](vision.md), der [Gesamtplan](gesamtplan.md) und der [Prüfstand](openhiatus-testprotokoll.md) maßgeblich. Frühere Codex-, Safe/Risk- und Live-Annahmen werden nicht automatisch übernommen.

Stand: 6. Oktober 2026. Dieser Plan dokumentiert die mit dem Nutzer abgestimmte Richtung für einen eigenständigen Desktop-Assistenten. M1 bis M3 sind implementiert und im Kern geprüft; Version 0.3.2 ergänzt Ordnerfreigaben. Die folgenden Zielentscheidungen beschreiben auch noch nicht implementierte Funktionen. Die neue Ausrichtung auf allgemeine Rechnersteuerung ersetzt die frühere dauerhafte Beschränkung auf wenige Dateiabläufe.

openHiatus verbindet im Zielbild Codex als Arbeitsagent mit zwei wählbaren Sprachwegen, einer verständlichen Oberfläche und einem eigenen mehrstufigen Gedächtnis. Das unmittelbare Lieferziel wurde auf einen möglichst frühen vorzeigbaren Prototyp verkleinert. Benutzerfreundlichkeit ist ein Kernfeature und ein Abnahmekriterium jeder Entwicklungsphase.

Die [Roadmap](roadmap.md) ist maßgeblich für Reihenfolge, aktuellen Lieferumfang und Fertigkriterien. M1 liefert bereits eine echte vorzeigbare Anwendung mit Standard-Sprache, ergänzendem Textchat, Dateiarbeit und Stopp. Der Nutzer hat Sprache für die erste Demo ausdrücklich bestätigt. Live, mehrstufiges Gedächtnis und Alltagserweiterungen folgen mit M2 bis M4. Die nachfolgenden Beschreibungen der „ersten Version“ meinen den weitergehenden Ausbau und sind nicht vollständig Voraussetzung für M1.

## Zielumfang nach dem ersten Prototyp

### Richtungsentscheidung: allgemeine Rechnersteuerung

Der Nutzer möchte openHiatus als allgemeinen Assistenten für seinen ganzen PC verwenden und die Entwicklung besserer Computer-Use-Werkzeuge nutzen können. Einzelne Anwendungen oder Tätigkeiten sollen keine eigene openHiatus-Sonderlösung benötigen. Datei- und Shell-Werkzeuge, Programmstarts und eine allgemeine Desktop-Anbindung bilden die gemeinsame Grundlage; Skills beschreiben Abläufe darauf. Sichtbare Codex-Terminals sind ein erster Anwendungsfall dieser Werkzeuge, kein Anlass für ein eigenes Terminal-Orchestrierungsprodukt oder eine neue Codex-Oberfläche.

Vollzugriff wird nach einem klaren einmaligen Hinweis bei Installation beziehungsweise erster Einrichtung angeboten. Ein geschützter Modus bleibt als optionale Wahl erhalten. Der Hinweis benennt die tatsächlichen Risiken; er verspricht keine vollständige Absicherung. Wiederholte Freigaben für bereits autorisierte unveränderte Schritte und anwendungsspezifische Erlaubnisdialoge sollen den normalen Ablauf nicht unterbrechen. Betriebssystemrechte und tatsächlich verfügbare Werkzeuge gelten weiterhin; Vollzugriff bedeutet nicht automatisch Administratorrechte.

Der Nutzer schlägt dafür einen dauerhaft sichtbaren UI-Schalter **Safe Mode / Risk Mode** vor. Safe Mode verwendet den geschützten Arbeitsbereich und die Ordnerfreigaben mit den tatsächlich verfügbaren Sandbox-Grenzen. Risk Mode erlaubt allgemeine Rechner-, Programm- und Desktop-Arbeit mit den Rechten des Benutzerkontos. Sprachmodus und Rechtewahl bleiben unabhängig. Der Hinweis erscheint bei erstmaliger Aktivierung von Risk Mode; spätere Wechsel erfordern keinen Neustart und keine wiederholte Grundsatzbestätigung.

Der Wechsel kann jederzeit angefordert werden. Während Agentenarbeit läuft, zeigt openHiatus den Wechsel als ausstehend, hält neue Aktionen zurück und stoppt die laufende Agentenausführung vor der Übernahme der neuen Rechte. Kein automatisches erneutes Absenden des alten Auftrags. Safe Mode darf nicht als wirksam angezeigt werden, solange die alte Agentenausführung noch aktiv ist. Bereits geöffnete externe Anwendungen erhalten dadurch keine nachträgliche Sandbox, und frühere Änderungen werden nicht rückgängig. Die gemeinsame Werkzeugsteuerung muss diese Grenze zutreffend anzeigen; daraus entstehen keine eigenen Sonderlösungen je Anwendung.

Im Vollzugriffsmodus entfallen die pauschalen openHiatus-Verbote für Programmstarts, Hintergrundarbeit und weitere Agentenprozesse. Das Ende einer Antwort beendet nicht pauschal alle gestarteten Prozesse. Gespräch, Agentenauftrag und gestartete Anwendung haben jeweils ihre eigene Lebensdauer. Eine schlanke gemeinsame Prozess- und Werkzeugsteuerung ersetzt separate Lebenszykluslösungen je Anwendung.

Ein ausdrücklicher Stopp bleibt jederzeit erreichbar: openHiatus' weitere Steuerungsaktionen und seine verwaltete Ausführung anhalten. **Eigenständig übergebene Arbeitsfenster, insbesondere Codex-Sitzungen, bleiben erhalten**; auch ein Moduswechsel oder das Schließen von openHiatus beendet sie nicht. Der Nutzer hat das pauschale Abbrechen solcher Terminalarbeit ausdrücklich ausgeschlossen. Nur ein eindeutig zugeordneter Auftrag beendet eine bestimmte externe Sitzung. Bereits ausgeführte Aktionen werden dadurch nicht rückgängig. openHiatus nennt den beobachteten Stand; keine pauschale Zusage, jede beliebige PC-Aktion zurücknehmen oder jeden fremden Prozess beenden zu können. Geschützte Zugangsspeicherung, nachvollziehbare Aktionen, die Nutzerwahl der Kostenwege und der bestehende Freigabeablauf für den Gedächtniskern bleiben erhalten.

Version 0.3.3 setzt den Safe/Risk-Schalter mit einmaliger Aktivierungsbestätigung und ständig erreichbarem **Info-Button** um. Derselbe Hinweis kann dort jederzeit erneut gelesen werden, ohne den Modus oder die Zustimmung zu ändern. Risk erhält gestartete Hintergrundarbeit nach dem Antwortende. Gedächtnisberichte haben einen eigenen schreibgeschützten Arbeitsprozess. Die allgemeine Desktop-Anbindung bleibt der nächste Ausbauauftrag; Maus-, Tastatur- und Bildschirmwerkzeuge sind dadurch noch nicht integriert.

Der Nutzer hat den Schwerpunkt auf funktionierende Kernabläufe, eine begrenzte Funktionsbreite und grundlegende Absicherung gelegt. Die erste Version muss nicht jeden Sonderfall oder jede Erweiterung abdecken. Die genannten „95 Prozent der Nutzer“ sind eine Leitlinie für häufige Bedürfnisse und sinnvolle Voreinstellungen, keine bereits gemessene Reichweite.

Die folgenden Liefergrenzen beschreiben den vorgesehenen Ausbau nach dem ersten Prototyp und konkretisieren die weiter unten beschriebenen Funktionen. Zusätzliche Optionen werden erst aufgenommen, wenn ein konkreter Alltagsbedarf sie rechtfertigt. Die Machbarkeitsprüfung untersucht gezielt die für den jeweiligen Roadmap-Meilenstein benötigten Wege und wird nicht zu einem allgemeinen Anbieter- oder Plattformvergleich.

| Bereich | Erste Version | Später bei konkretem Bedarf |
| --- | --- | --- |
| Plattform und Betrieb | Lokale Windows-App, ein Nutzer, gebündelte Laufzeit, Start per Verknüpfung. | Weitere Betriebssysteme, Mehrbenutzerbetrieb, Fernzugriff, Hosting und Synchronisation. |
| Arbeitsagent | Direkte Codex-Anbindung mit einem empfohlenen verfügbaren Modell und einem aktiven Hauptauftrag. | Weitere Agentenlaufzeiten, eigenes Multi-Agenten-Management und frei konfigurierbare Modellketten. |
| Anmeldung | Unterstützte Codex-Anmeldung beziehungsweise API-Key sowie die benötigten Sprachzugänge in der UI; eine aktive Verbindung pro Anbieter. | Kontopools, automatische Kontowechsel und Organisationsverwaltung. |
| Sprache | Ein geprüfter STT-/TTS-Anbieter für Standard sowie gpt-live-1 für Live. Inworld ist die Ausgangswahl für Standard, vorbehaltlich des direkten Integrationstests. | Weitere Anbieter, eigene lokale Sprachmodelle, Wake-Word-Systeme und Telefonie. |
| Aufgaben | Dateien, Projekte und Programme über allgemeine Codex- und Desktop-Werkzeuge bedienen; Status, Ergebnisse und Änderungen anzeigen. | Zusätzliche spezialisierte Drittanbieter-Integrationen nur bei belegtem Vorteil. |
| Rechte | Vollzugriff nach einmaligem Einrichtungshinweis; optionaler geschützter Modus, aktive Wahl sichtbar. | Individuelle Regelsprachen und umfangreiche Berechtigungsprofile. |
| Gedächtnis | Gesprächspersistenz, einfache Tages-/Wochen-/Monatszusammenfassungen mit Quellen und ein versionierter Kern mit Freigaben. | Wissensgraphen, mehrere Suchdienste, aufwendige automatische Wissenspflege und zahlreiche Stellschrauben. |
| Transparenz | Aufgabenereignisse, Werkzeugergebnisse, Dateiänderungen, verwendete Erinnerungen und verfügbarer Verbrauch. | Eigene Analyseplattform, komplexe Kostenvergleiche und umfangreiche Betriebsdashboards. |
| Schutz und Zugang | Geschützte Zugangsdaten, lokale Datenablage im Benutzerprofil, kontrollierte Ausführung und unabhängiger Stopp. | Zusätzliche App-Sperre, eigener Datentresor und zugehörige Wiederherstellungsarchitektur. |
| Auslieferung | Ein getestetes Installationspaket und klar dokumentierter Funktionsumfang. | Automatische Update-Infrastruktur, Plugin-Marktplatz und allgemeines Erweiterungsframework. |

Der konkrete erste Demoauftrag ist eine Planungsannahme: openHiatus liest Dateien aus einem vorbereiteten Arbeitsordner und erstellt oder überarbeitet daraus ein Ergebnis im selben Ordner. M1 nimmt ihn per Sprechtaste an, zeigt Transkript, Dateiergebnis, Aktivität, Stopp und Gesprächspersistenz und liest die Antwort vor. Texteingabe bleibt verfügbar. M2 verwendet denselben Ablauf zusätzlich für Live-Gespräche und Kontextübergaben. Weitere Alltagsszenarien werden anhand der Eigennutzung priorisiert.

Interne Module bleiben sauber getrennt. Für den Anfang benötigen sie weder ein Plugin-System noch eine dynamische Registrierung beliebiger Anbieter. Ein gescheiterter Integrationstest führt zu einer gezielten Entscheidung über den betroffenen Baustein und erweitert nicht automatisch den gesamten Produktumfang.

## Bestätigte Produktentscheidungen

| Thema | Entscheidung |
| --- | --- |
| Eigenständigkeit | openHiatus läuft ohne OpenClaw und ohne dessen Konfiguration, Gateway, Plugin-Laufzeit oder Datenspeicher. |
| Arbeitsagent | Codex übernimmt die eigentliche Aufgabenbearbeitung und Werkzeugnutzung. |
| Live-Gespräch | GPT-Live übernimmt das Gespräch und delegiert Aufgaben an Codex. Die offizielle Modell-ID lautet gpt-live-1. |
| Sprachwahl | Der Nutzer wählt Standard oder Live, über die UI oder einen ausdrücklichen Sprachbefehl. |
| Kostenwahl | Kein stiller Wechsel auf einen anderen kostenpflichtigen Sprachweg oder ein anderes Abrechnungskonto. |
| Rechte | Voller Rechnerzugriff und ein geschützter Arbeitsbereich sind umschaltbar. Die Einrichtung erklärt einmalig die Risiken und macht die Auswahl sichtbar; die frühere Sandbox-Voreinstellung ist kein dauerhaftes Produktprinzip. |
| Gedächtnis | Arbeits-, Tages-, Wochen- und Monatsgedächtnis sowie ein geschützter Kern. |
| Kernänderungen | Der Nutzer kann den Kern jederzeit ändern. openHiatus darf ihn nur nach konkreter Nutzerfreigabe ändern. |
| Einrichtung | Anmeldung und API-Key-Verwaltung erfolgen vollständig in der UI. Nutzer müssen keine .env öffnen. |
| Start | Installation und Desktop-Verknüpfung; kein Docker und kein manuelles Starten von Hintergrunddiensten. |
| Transparenz | Nahezu vollständige Nachvollziehbarkeit der von openHiatus kontrollierten Eingaben, Aktionen und Ergebnisse. |
| Stopp | Ein Notstopp benötigt keine Anmeldung oder Entsperrung und hat Vorrang vor neuen Aktionen. |
| App-Sperre | Keine zusätzliche App-Sperre in der ersten Version. Für eine spätere Einführung gelten nachgewiesener Schutz und vollständiger Stillstand als Voraussetzungen. |

Der Kern ist gegen autonome Änderungen geschützt. Nutzeränderungen und ausdrücklich freigegebene Agentenänderungen sind erlaubt.

## Architekturgrundlagen

Aufnahme, Hotkeys, Overlay und Wiedergabe gehören zur lokalen Desktop-Anwendung. Sprache und Agentenlaufzeit werden über eigene Anbindungen angesprochen; Zugangsdaten, Gedächtnis und Auftragsverwaltung bleiben unter Kontrolle der Anwendung.

Der historische Entwurf verwendet einen Codex App Server über stdio. Laufzeit, Orchestrierung und Werkzeuganbindungen erhalten getrennte Schnittstellen. Aussagen zur Geschwindigkeit benötigen Messungen des gesamten Ablaufs einschließlich der Modellaufrufe.

Wesentliche Grundlagen sind stabile Gesprächs- und Auftragskennungen, Schutz gegen doppelte Aufträge, gesicherte Zustände vor der Ausführung und nachvollziehbare Unterbrechungen nach einem Neustart. Diese Verhaltensregeln werden durch Vertragstests geprüft.

Der aktuelle Pi-basierte Quellstand wird in der [Architekturprüfung](architekturpruefung.md) und im [Testprotokoll](openhiatus-testprotokoll.md) dokumentiert.

## Benutzerfreundlichkeit als Kernfeature

Ein Nutzer muss openHiatus installieren, einrichten und bedienen können, ohne Programmierwissen mitzubringen. Technische Abläufe bleiben sichtbar, wenn sie eine Entscheidung erklären oder zur Fehlerbehebung beitragen. Ihre manuelle Durchführung ist keine Voraussetzung für die Nutzung.

- Die Einrichtung führt schrittweise zu einem ersten funktionierenden Gespräch. Optionale Funktionen können später ergänzt werden.
- Eingaben und abgeschlossene Schritte bleiben bei Fehlern oder einem Neustart erhalten, soweit ihre Speicherung gewählt und möglich ist.
- Fehler erklären in verständlicher Sprache, was betroffen ist und welche konkrete Aktion weiterhilft. Technische Details sind zusätzlich aufklappbar.
- Mikrofon, Sprachausgabe, Verbindungen, Modelle, Rechte und Kosten lassen sich über die Oberfläche konfigurieren.
- Tastaturbedienung, erkennbare Fokuszustände, lesbare Kontraste und skalierbare Schrift gehören zum normalen Funktionsumfang. Status wird nicht ausschließlich durch Farbe vermittelt.
- Fortschritt, Abbruch, Wiederverbindung und erforderliche Freigaben sind erkennbar. Die Oberfläche darf während laufender Arbeit bedienbar bleiben.

Die Benutzerfreundlichkeit wird ab der Grundanwendung geprüft und nicht erst im abschließenden UI-Feinschliff ergänzt.

## Anmeldung und Einrichtung

### Erster Start

1. openHiatus erklärt kurz die beiden Sprachwege und die Trennung zwischen Sprachkosten und Codex-Nutzung.
2. Der Nutzer verbindet Codex über einen für die Anwendung unterstützten Anmeldeweg oder hinterlegt einen API-Key. Die tatsächlich verfügbare Konto- und Modellauswahl wird geprüft.
3. Für Standard-Sprache und Live werden die jeweils benötigten Verbindungen angeboten. Ein fehlender Live-Zugang blockiert weder Textbetrieb noch bereits eingerichtete Standard-Sprache.
4. Der Nutzer wählt Mikrofon und Lautsprecher. Ein lokaler Pegeltest funktioniert ohne kostenpflichtigen Modellaufruf. Ein optionaler Anbietertest wird vor dem Start als potenziell kostenpflichtig gekennzeichnet.
5. Der Nutzer erhält den kurzen Risikohinweis und wählt den gewünschten Rechtemodus. Vollzugriff kann einmalig aktiviert werden; optional führt openHiatus durch Arbeitsbereich und Einrichtung der nativen Sandbox.
6. Eine Abschlussansicht zeigt aktive Verbindungen, Sprachmodus, Rechtemodus und Kostenmodell. Danach kann das erste Gespräch beginnen.

Vorgesehener Hinweis für Vollzugriff: „openHiatus kann deinen Computer mit den Rechten deines Benutzerkontos bedienen. Dabei kann die KI Fehler machen, Dateien verändern oder löschen, Aktionen in angemeldeten Anwendungen auslösen und Daten an verbundene KI-Dienste übertragen. Es können Kosten entstehen. Stopp hält weitere Agentenaktionen an, macht bereits ausgeführte Änderungen aber nicht rückgängig.“ Der Hinweis wird bei Einrichtung beziehungsweise erstmaliger Aktivierung gezeigt, nicht vor jedem gewöhnlichen Arbeitsschritt.

Für die lokale Anwendung ist ein offizieller Codex-Anmeldeweg vorgesehen. Die Dokumentation unterscheidet API-Key- und ChatGPT-Anmeldung. Kontozugriff, verfügbare Modelle und Eignung des Anmeldewegs für eine spätere kommerzielle oder gehostete Verteilung müssen vor dieser Verteilung gesondert geprüft werden. Ein ChatGPT-Login wird nicht als automatischer API-Zugang für GPT-Live behandelt. [Codex-Anmeldung](https://learn.chatgpt.com/docs/app-server#auth-endpoints)

### Verbindungen und Anmeldung

Die Einstellungen enthalten einen eigenen Bereich „Verbindungen und Anmeldung“. Die erste Version zeigt nur die fest unterstützten Dienste und jeweils eine aktive Verbindung. Jede Verbindung zeigt Anbieter, Zweck, Kontobezeichnung, verwendeten Anmeldeweg und aktuellen Status. Die Zuordnung zu Codex, Spracherkennung, Sprachausgabe oder Live muss verständlich sein.

| Aktion | Erwartetes Verhalten |
| --- | --- |
| Konto verbinden | Unterstützten offiziellen Browser- oder Geräteanmeldeablauf aus der UI starten und dessen Ergebnis in openHiatus anzeigen. |
| API-Key hinzufügen | Key direkt in ein maskiertes Eingabefeld einfügen; keine .env und keine Umgebungsvariable bearbeiten. |
| Verbindung prüfen | Authentifizierung und relevante Berechtigungen prüfen, soweit der Anbieter dies ermöglicht; keine versteckten bezahlten Testgespräche. |
| Status ansehen | Nicht eingerichtet, Prüfung läuft, verbunden, Zugang ungültig, Funktion nicht verfügbar und vorübergehend nicht erreichbar unterscheidbar anzeigen. |
| API-Key ersetzen | Neuen Zugang prüfen und gezielt aktivieren. Laufende Aufgaben dürfen nicht unbemerkt das Abrechnungskonto wechseln. |
| Abmelden oder entfernen | Die betroffene Verbindung lokal trennen. Erklären, dass das Entfernen in openHiatus einen beim Anbieter ausgestellten Key nicht automatisch widerruft. |
| Fehler beheben | Erneut anmelden, Key ersetzen oder Prüfung wiederholen direkt am betroffenen Eintrag anbieten. |

Gespeicherte Keys werden anschließend nur maskiert beziehungsweise durch eine kurze Kennung dargestellt. Beim Eingeben ist kurzzeitiges Anzeigen möglich. Einstellungen speichern keine Zugangsdaten im Chat, Gedächtnis oder Ereignisprotokoll. Anbieterfehlermeldungen und Diagnoseexporte werden ebenfalls auf Zugangsdaten bereinigt.

### Speicherung der Zugangsdaten

Die technische Planung sieht einen eigenen lokalen Zugangsdienst vor. Nicht geheime Einstellungen enthalten nur Verweise auf geschützte Zugangsdaten. Der privilegierte Anwendungsteil verwendet den jeweils benötigten Zugang; die Chatansicht und Agentenprompts erhalten keine gespeicherten Keys. Der Codex-Adapter verwendet den vorgesehenen Authentifizierungsweg in einem eigenen openHiatus-Laufzeitprofil.

Unter Windows ist eine Verschlüsselung mit Betriebssystemmitteln vorgesehen, etwa über Electron safeStorage und DPAPI. Eine solche Speicherung schützt Daten auf dem Datenträger, bietet aber keinen absoluten Schutz vor anderen Prozessen desselben Benutzers oder vor uneingeschränktem Administratorzugriff. Ein stiller Rückfall auf Klartextspeicherung ist ausgeschlossen. [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)

Backups und Exporte enthalten standardmäßig keine Zugangsdaten. Nach einer Wiederherstellung auf einem anderen Rechner führt die UI durch die erneute Anmeldung. Die Anwendung benötigt keine vom Nutzer gepflegte .env, auch nicht für den ersten Start oder die Fehlerbehebung.

## Architektur und Start

Als technische Grundlage sind Electron, React und TypeScript mit SQLite für die lokale Speicherung vorgesehen. Windows ist die erste Zielplattform. Oberfläche und privilegierter Anwendungsteil kommunizieren über eine kleine, definierte Schnittstelle. Die Oberfläche erhält keinen allgemeinen Shell- oder Dateisystemzugriff. [Electron-Prozessmodell](https://www.electronjs.org/docs/latest/tutorial/process-model), [Electron-Sicherheit](https://www.electronjs.org/docs/latest/tutorial/security)

| Baustein | Verantwortung |
| --- | --- |
| Desktop-Oberfläche | Gespräch, Mikrofon, Einrichtung, Verbindungen, Aufgaben, Kosten, Rechte und Gedächtnisansicht. |
| openHiatus-Steuerung | Gesprächszustand, Aufgabenrouting, Sprachwechsel, Berechtigungswahl, Kostenregeln und Wiederaufnahme. |
| Codex-Adapter | App Server starten, verbinden, Gespräche fortsetzen, Ereignisse verarbeiten und Aufgaben abbrechen. |
| Sprachadapter | Direkte STT- und TTS-Anbieter für Standard sowie GPT-Live mit Client Delegation. |
| Zugangsdienst | Anmeldung, geschützte Speicherung, Verbindungsprüfung und gezielte Verwendung der Zugangsdaten. |
| Gedächtnisdienst | Ereignisse, Verdichtungen, Herkunft, Abruf und freigegebene Änderungen am Kern. |
| Werkzeuganbindungen | Allgemeine Datei-, Shell-, Programmstart- und Desktop-Werkzeuge für Codex; gemeinsame Anbindung und austauschbarer Computer-Use-Anbieter. |

openHiatus startet eine kontrollierte Codex-Version als lokalen Kindprozess über stdio. Der App Server liefert Gesprächs- und Werkzeugereignisse, Dateiänderungen und Freigabeanforderungen. Eine versionsgebundene Adapterprüfung verhindert, dass ein Laufzeitupdate die Integration unbemerkt verändert. [Codex App Server](https://learn.chatgpt.com/docs/app-server)

Einstellungen, Daten und das Codex-Laufzeitprofil liegen in einem eigenen openHiatus-Datenbereich, getrennt von anderen Anwendungen. Ein getestetes Installationspaket bringt die benötigten Komponenten mit beziehungsweise begleitet ihre Einrichtung. Für die erste Version genügt die Installation eines neuen geprüften Pakets für Updates; eine eigene automatische Update-Infrastruktur ist kein Lieferkriterium. Im täglichen Betrieb startet eine Desktop-Verknüpfung alle notwendigen lokalen Bestandteile. Docker, WSL und manuell gestartete Dienste sind keine Voraussetzung.

Eine allgemeine Computersteuerung ist Teil des nächsten Ausbaus. Funktionen anderer Desktop-Anwendungen werden nicht allein durch den App Server automatisch Bestandteil von openHiatus. Die benötigte Anbindung wird einmal als allgemeines Werkzeug bereitgestellt und anhand unterschiedlicher Programme geprüft. Künftige Verbesserungen sollen durch Austausch oder Aktualisierung dieser Werkzeuganbindung nutzbar werden, ohne jeden Ablauf neu in openHiatus zu implementieren.

## Sprachwege und Übergaben

| Modus | Verarbeitung | Abrechnung |
| --- | --- | --- |
| Standard | Aufnahme → Spracherkennung → optional korrigiertes Transkript → Codex → Sprachausgabe. | STT und TTS sowie Codex-Nutzung nach dem gewählten Zugang. |
| Live | gpt-live-1 führt das Gespräch; openHiatus übergibt Aufgaben an Codex und liefert belegte Ergebnisse zurück. | Aktive Live-Sitzungsdauer sowie Codex- und weitere Werkzeugnutzung. |

Für Standard wird genau ein geprüfter STT-/TTS-Anbieter direkt angebunden. Als erster Anbieter ist Inworld vorgesehen; aktuelle Endpunkte, Zugangsmöglichkeiten und Tarife müssen bei der Umsetzung geprüft werden. Die interne Schnittstelle bleibt austauschbar, ohne bereits eine UI oder Infrastruktur für beliebige weitere Anbieter zu bauen.

GPT-Live unterstützt gleichzeitiges Sprechen und Zuhören sowie die Delegation an einen eigenen Hintergrundagenten. Dafür verwenden wir Client Delegation. openHiatus verwaltet Transkripte, Aufgabenstand und Ergebnisse selbst. [GPT-Live](https://developers.openai.com/api/docs/guides/live), [Client Delegation](https://developers.openai.com/api/docs/guides/live-delegation?delegation-mode=client)

„Wechsel zu live“ und „Wechsel zurück“ sowie entsprechende UI-Schalter ändern den Sprachweg. Der Rechtemodus bleibt davon unabhängig. Im Standardbetrieb wird ein gesprochener Wechsel über die aktive Aufnahme erkannt; permanentes Mithören ist keine Voraussetzung dieses Plans.

Jede Aufgabe bekommt eine stabile Kennung und einen nachvollziehbaren Zustand. Sprachwechsel, Wiederverbindungen und wiederholte Ereignisse dürfen keine zweite Ausführung derselben Aktion erzeugen. Laufende Arbeit wird beim Wechsel angezeigt; sie kann weiterlaufen, ohne an einen zweiten Agenten übergeben zu werden. Das neue Gespräch erhält den relevanten Verlauf und den aktuellen Aufgabenstand.

Live-Delegationsereignisse enthalten selbst keinen vollständigen Auftrag. openHiatus muss die Aufgabe aus Transkript und Anwendungszustand zuordnen, zeitlich einordnen und bei Änderungen als neue Aufgabenfassung behandeln. Verspätete Ergebnisse dürfen keine inzwischen überholte Anweisung ersetzen. [Kontext und Aufgabenübergabe](https://developers.openai.com/api/docs/guides/live-delegation?delegation-mode=client#keep-the-conversation-context-in-your-application)

„Hör auf zu sprechen“ beendet die Wiedergabe. „Brich die Aufgabe ab“ fordert den Abbruch der Arbeit an. Das unqualifizierte „Stopp“ wird als Notstopp für Ausführung und Wiedergabe behandelt. Die Oberfläche unterscheidet Abbruch angefordert, tatsächlich beendet und bereits ausgeführte Schritte. Ein Verbindungsabbruch wird nicht als Nachweis für einen erfolgreichen Aufgabenabbruch gewertet.

Der Notstopp benötigt keine Anmeldung, Entsperrung oder Modellentscheidung. Seine Steuerung muss unabhängig von einem laufenden Agenten-Turn und von Anmeldedialogen funktionieren. Eine lokale Schaltfläche und ein geeigneter Tastaturweg ergänzen Sprache. Spracherkennung allein ist keine ausreichende Abbruchmöglichkeit: Ein gesprochener Stopp kann nur erfasst werden, wenn der entsprechende Audioeingang verfügbar ist. Die technische Umsetzung muss die wirksamen Abbruchwege und ihre Grenzen belegen.

## Kosten und Nutzerentscheidung

openHiatus zeigt aktive Verbindungen und die jeweilige Abrechnungsart. Modell- und Werkzeugnutzung, Sprachkosten und Gedächtnisverdichtung werden getrennt erfasst. Kontingente eines angemeldeten Kontos werden nicht in erfundene Eurobeträge umgerechnet. Geschätzte, gemessene und noch unbekannte Kosten sind unterscheidbar.

GPT-Live wird nach aktiver Sitzungsdauer abgerechnet. Stille und Wartezeit auf den Hintergrundagenten zählen dazu; Stummschalten beendet die Sitzung nicht. openHiatus zeigt deshalb die aktive Sitzung und ihre Laufzeit. Eine vom Nutzer einstellbare Leerlaufregel kann die Sitzung schließen, während Codex weiterarbeitet. Das beendet ausschließlich die Sprachverbindung und ist keine App-Sperre; die Abbruchsteuerung bleibt zugänglich. [Live-Kosten](https://developers.openai.com/api/docs/guides/voice-latency-cost?api=live)

Die erste Version bietet eine einfache Kostenansicht und ein einstellbares Live-Zeitlimit. Weitere Budgetregeln werden ergänzt, wenn die Verbrauchsschnittstellen und die Eigennutzung sie rechtfertigen. openHiatus wechselt bei fehlendem Guthaben, fehlender Berechtigung oder einem Fehler nicht still zu einem anderen kostenpflichtigen Modell, Sprachweg oder Konto. Das weitere Vorgehen wird verständlich angeboten. Bereits laufende Kosten und eine mögliche Verzögerung bei Verbrauchsmeldungen bleiben sichtbar.

Die Kostenerfassung berücksichtigt Wiederverbindungen, Einrichtungsgebühren des Anbieters und eigenständige Hintergrundarbeit. Kumulative Verbrauchsmeldungen werden nicht addiert, als wären sie neue Einzelverbräuche. Preise erhalten Quelle und Prüfdatum; historische Alt-openHiatus-Tarife werden nicht ungeprüft übernommen.

## Vollzugriff und geschützter Arbeitsbereich

Vollzugriff erlaubt Arbeit außerhalb des Projektordners mit den tatsächlich eingeräumten Rechten. Administratorrechte werden gesondert behandelt und nicht durch die Bezeichnung „Vollzugriff“ vorausgesetzt. Die UI zeigt den wirksamen Modus.

Der geschützte Arbeitsbereich setzt Betriebssystemgrenzen für Dateien und Netzwerk durch. Codex bietet dafür eine native Windows-Sandbox; die stärkere Variante erfordert eine administrativ bestätigte Einrichtung. openHiatus begleitet diesen Schritt. Ein gewöhnlicher Arbeitsordner allein ist keine Sandbox. [Native Windows-Sandbox](https://learn.chatgpt.com/docs/windows/windows-sandbox)

Ein Moduswechsel erfolgt an einer kontrollierten Aufgabengrenze. Laufende Prozesse und Werkzeugverbindungen werden dabei berücksichtigt. Ein laufender Vollzugriffsprozess darf nicht nachträglich als sandboxgeschützt angezeigt werden. Schlägt die Sandbox-Einrichtung fehl, erfolgt kein stiller Wechsel zum Vollzugriff.

Externe Werkzeuge müssen dieselben Grenzen einhalten. Eine Browser- oder Computeranbindung, die außerhalb der Sandbox handelt, muss gesondert eingeordnet und angezeigt werden. Die Sandbox der Electron-Oberfläche ersetzt nicht die Sandbox für Agentenwerkzeuge.

## Gedächtnis und Persistenz

| Ebene | Zweck |
| --- | --- |
| Arbeitsgedächtnis | Aktuelle Unterhaltung, laufende Aufgaben, Zwischenstände und offene Fragen. |
| Tagesgedächtnis | Ereignisse, Ergebnisse, Entscheidungen und Fehler des Tages. |
| Wochengedächtnis | Fortschritte, wiederkehrende Themen und offene Verpflichtungen über mehrere Tage. |
| Monatsgedächtnis | Langfristige Entwicklungen und weiterhin relevantes Wissen. |
| Geschützter Kern | Identität, grundlegende Regeln und ausdrücklich festgelegte Nutzerpräferenzen. |

Ein ursprüngliches Ereignisprotokoll bildet die nachvollziehbare Grundlage. Verdichtete Erinnerungen erhalten Quellenverweise, Zeitraum, Erstellungszeit und einen Status für Korrekturen oder Ablösung. Wiederholung allein macht eine Behauptung nicht wahr. Widersprüche und unsichere Angaben bleiben erkennbar.

openHiatus lädt gezielt relevante Erinnerungen innerhalb eines Kontextbudgets. Persönliche und projektbezogene Inhalte werden unterschieden, damit Wissen aus einem Projekt nicht unbemerkt in ein anderes übertragen wird. In der UI ist sichtbar, welche Erinnerungen für eine Aufgabe verwendet wurden.

Die Verdichtung erfolgt ab M3.1 durch einen eigenen Codex-Auftrag über den bereits eingerichteten Zugang und das gewählte Modell. Tage halten konkrete Vorgänge fest, Wochen bündeln Themen und Fortschritte, Monate die übergreifende Entwicklung. Die KI unterscheidet angeforderte Arbeit von belegten Ergebnissen. openHiatus prüft Belegkennungen, Format und unveränderte Ausgangsversion, bevor ein fertiger Bericht übernommen wird. Mechanische Auszüge bleiben nur als vorläufiger Stand bis zur KI-Aufbereitung sichtbar.

Die Aufbereitung startet begrenzt nach dem Verbinden beziehungsweise nach Interaktionen im Leerlauf; ein manueller Auslöser bezieht auch laufende Zeiträume ein. Automatik ist abschaltbar, Modellaufrufe und Fortschritt sind sichtbar. Tages-, Wochen- und Monatsgrenzen richten sich nach Europe/Berlin. Es gibt keinen eigenständigen ständig laufenden Dienst und keinen allgemeinen Aufgabenplaner. Nach längerer Offlinezeit wird fehlende Verdichtung in begrenzten Durchläufen nachgeholt. Quellen, Tagesberichte und frühere Versionen werden durch höhere Verdichtung nicht gelöscht. Ein ausdrücklich genanntes Datum wird gezielt nachgelesen; fehlende Zeiträume werden nicht durch neuere Erinnerungen ersetzt.

M1 bis M3 verwenden versionierte lokale JSON-Speicher mit atomarem Schreiben und einer letzten vollständigen Sicherung. Der zusätzliche Gedächtnisspeicher enthält archivierte Nachrichten, Quellenbeziehungen, Erinnerungen, Versionen und Freigaben. Eine SQLite-Migration ist keine Voraussetzung für M3. Einfache lokale Suche und begrenzter Abruf genügen; zusätzliche Suchdienste sind nicht vorgesehen. Berichtigen ist Teil von M3, Sicherung und Wiederherstellung über die UI folgen in M4. Dauerhafte Audioaufzeichnung ist kein Bestandteil der ersten Version. Aufbewahrungsfristen und Löschverwaltung müssen vor einer breiteren Nutzung mit eigenen Daten konkretisiert werden.

Nach einem Neustart stellt openHiatus den letzten bekannten Zustand wieder her. Eine unklare oder unterbrochene Aktion wird abgeglichen und nicht blind erneut ausgeführt. „Aufgabenstand wiederfinden“ bedeutet nicht, dass jeder laufende Betriebssystemprozess nach einem Neustart automatisch fortgesetzt werden kann.

### Änderungen am geschützten Kern

Der Nutzer kann den Kern jederzeit in der UI bearbeiten. openHiatus darf Änderungen vorschlagen, zeigt dafür den konkreten Unterschied zur aktuellen Fassung und wartet auf eine ausdrückliche Freigabe. Die Freigabe gilt nur für diese Änderung an dieser Ausgangsfassung. Verändert sich die Grundlage, muss der Vorschlag erneut geprüft werden.

Jede Kernänderung bekommt eine neue Version mit Herkunft und Freigabenachweis. Automatische Tages-, Wochen- oder Monatsverdichtung besitzt keinen Schreibweg in den Kern. Allgemeine Arbeitsfreigaben oder aktivierter Vollzugriff gelten nicht als inhaltliche Zustimmung zu einer Kernänderung.

Für stärkeren technischen Schutz braucht die Kernverwaltung eine eigene Berechtigungsgrenze. Ein Prozess mit uneingeschränkten Administratorrechten kann Schutzmechanismen auf demselben Rechner grundsätzlich verändern. Versionierung und Prüfsummen machen Veränderungen nachvollziehbar, ersetzen aber keine Zugriffstrennung. Der konkrete Schutzaufbau wird in der Machbarkeitsphase festgelegt und in der UI zutreffend beschrieben.

## Oberfläche und Transparenz

| Bereich | Inhalt |
| --- | --- |
| Gespräch in der Mitte | Text, Spracheingabe, Transkript und verständliche Fortschrittsmeldungen. |
| Navigation links | Projekte, Gespräche, Aufgaben, Gedächtnis und Einstellungen. |
| Details rechts | Aufklappbare Werkzeugaufrufe, Ergebnisse, Dateiänderungen und verwendete Erinnerungen. |
| Dauerhaft sichtbarer Status | Sprachmodus, Schalter Safe Mode / Risk Mode samt ausstehendem Wechsel, Mikrofon, aktive Live-Sitzung, Kosten oder Kontingent und Stopp-Steuerung. |
| Verbindungen und Anmeldung | Konten, API-Keys, Anbieterzuordnung, Statusprüfung und Fehlerbehebung. |
| Gedächtnisansicht | Zeitachse, Quellen, Korrekturen, Kernfassungen und konkrete Änderungsvorschläge. |

Die Oberfläche soll ruhig, gut lesbar und bei längeren Aufgaben nutzbar bleiben. Detailtiefe wird auf Wunsch aufgeklappt. Der Nutzer kann die aktuelle Aktion verstehen, ohne Rohprotokolle lesen zu müssen, und bei Bedarf trotzdem bis zum konkreten Werkzeugaufruf oder zur Dateidifferenz gehen.

Das Ereignisprotokoll erfasst Aufträge, Modell- und Moduswahl, Übergaben, verwendete Erinnerungen, Werkzeugargumente und Ergebnisse soweit verfügbar, Änderungen, Freigaben, Fehler, Wiederholungen und Verbrauch. Umfangreiche oder gekürzte Ausgaben werden als solche markiert. openHiatus zeigt verfügbare Fortschritts- und Begründungsinformationen, verspricht aber keine vollständigen verborgenen Modellüberlegungen oder nicht zugänglichen Anbieterinterna.

Zugangsdaten sind von der Transparenz ausgenommen. Schwärzung muss auch für eingehende Fehlertexte, Toolausgaben und Diagnoseexporte gelten. Protokollierung ist unter uneingeschränktem Hostzugriff nicht als absolut manipulationssicher zu bezeichnen.

## Grundlegender Schutz der ersten Version

Die erste Version hat keine zusätzliche App-Sperre und keinen eigenen Datentresor. Sie setzt ein persönliches, vertrauenswürdiges Windows-Benutzerkonto voraus. Der Verzicht auf eine App-Sperre ändert nichts an der Anbieteranmeldung, der geschützten Speicherung von Zugangsdaten oder der Pflicht zu verlässlicher Ausführungskontrolle. Schutz gegen einen kompromittierten Rechner oder beliebige Administratorzugriffe wird nicht behauptet.

Die wichtigsten Schutzmaßnahmen gehören bereits zum ersten durchgängigen Arbeitsablauf:

- Sandbox als Voreinstellung und ausdrücklich gewählter Vollzugriff; keine stillen Rechteerweiterungen und kein pauschaler Administratorstart.
- Eine unabhängige Stopp-Steuerung blockiert neue Aktionen und beendet die kontrollierten Ausführungen. Der Status unterscheidet angeforderten und bestätigten Abbruch; spätere Antworten dürfen gestoppte Arbeit nicht neu starten.
- Zugangsdaten werden geschützt gespeichert und aus Protokollen entfernt. Oberfläche, Agentenprompts und Exporte erhalten keine gespeicherten Keys.
- Anwendungsdaten und das Codex-Profil liegen getrennt von anderen Anwendungen im eigenen Benutzerbereich. Es gibt keine für das Netzwerk geöffnete Fernsteuerung; notwendige lokale Anmeldeschnittstellen bleiben auf den vorgesehenen lokalen Ablauf beschränkt.
- Externe Inhalte werden als Daten behandelt und erhalten keine Befugnis, Rechte, Kernregeln oder Zugangsdatenverwaltung zu verändern. Die Oberfläche zeigt Inhalte ohne allgemeinen Zugriff auf Betriebssystemfunktionen.
- Eine einfache Datensicherung, nachvollziehbare Aufträge und begrenzte Logaufbewahrung reduzieren die Folgen von Fehlern. Automatisches blindes Wiederholen von Änderungen ist ausgeschlossen.

Diese Maßnahmen müssen an den tatsächlich unterstützten Abläufen geprüft werden. „Gut abgesichert“ ist ein Abnahmeziel und keine Behauptung über bereits vorhandene Software. Ohne eigenen Datentresor wird insbesondere kein unabhängiger Schutz von Memories und Logs gegen Programme unter demselben Benutzerkonto versprochen.

### Vorführungen mit getrennten Daten

Eine Vorführung verwendet einen vorbereiteten separaten Arbeits- und Datenbestand mit synthetischen Beispielen. Auch Gespräche, Erinnerungen, Logs und Codex-Laufzeitverläufe gehören zu diesem getrennten Bestand. Persönliche Daten dürfen nicht allein durch das Ausblenden von Chatnachrichten als geschützt gelten. Dafür genügt zunächst eine separate Testinstallation beziehungsweise ein isolierter Testdatenbereich; eine allgemeine Mehrprofilverwaltung wird nicht gebaut.

Der vorgeführte Agent arbeitet im geschützten Demo-Arbeitsbereich mit echten unterstützten Funktionen. Vorbereitung und Beispiele dürfen die Vorführung erleichtern, aber keine fest eingespielten Ergebnisse als erfolgreiche Ausführung ausgeben. Eigene Zugangsdaten können für die tatsächlichen Anbieteraufrufe verwendet werden, ohne sie auf dem Bildschirm oder in Exporten offenzulegen.

### Voraussetzungen für eine spätere App-Sperre

Eine App-Sperre wird nur bei konkretem Bedarf erneut geplant. Dann gilt weiterhin: gesperrt bedeutet keine Agentenarbeit; Stopp benötigt keine Entsperrung. Die Sperre darf erst nach bestätigtem Stillstand und wirksam geschütztem Datenzugriff als abgeschlossen angezeigt werden. Entsperren allein startet keine alten Aufträge neu.

Vor einer solchen Erweiterung müssen die abgedeckten Angreiferrechte, Dateien, Schlüssel, Backups und Wiederherstellungswege festgelegt und auf Umgehung geprüft werden. Kann ein Agent mit Vollrechten seine Kontrollinstanz verändern oder umgehen, ist deren Schutz nicht belegt. Diese Prüfung ist keine Voraussetzung für die erste Version ohne App-Sperre. Der unabhängige Abbruch der unterstützten Arbeit bleibt dagegen ein Lieferkriterium.

## Lieferung nach Roadmap

Die [Roadmap](roadmap.md) beschreibt die verbindliche Umsetzung in M1 bis M4 und die Abnahme des ersten Sprachprototyps. Die erste Vorführung findet bereits mit M1 statt. Standard-Sprache, eine schöne kleine UI und ein startbares Paket gehören deshalb zu M1; sie werden nicht bis nach Live und Gedächtnis verschoben.

Jeder Meilenstein liefert einen nutzbaren Ablauf. In M1 werden nur das nötige Datenmodell, Ereigniskennungen, Zugangsdienst, Rechtegrenzen und Abbruchsteuerung umgesetzt. Spätere Bausteine bleiben anschließbar, ohne sie als allgemeine Plattform vorwegzunehmen. Für die frühe Vorführung wird weder auf das vollständige Zielbild noch auf eine App-Sperre gewartet.

## Abnahme des späteren Gesamtablaufs

Ein Nutzer installiert openHiatus, verbindet sein Konto oder hinterlegt einen API-Key direkt in der UI, wählt sein Mikrofon und spricht mit dem Assistenten. Auf „Wechsel zu live“ beginnt das Live-Gespräch. Codex bearbeitet eine Aufgabe unter dem gewählten Rechtemodus. Beim Wechsel zurück bleiben Kontext und Aufgabenstand erhalten. Nach einem Neustart findet der Nutzer beides wieder.

Die Abnahme des späteren Gesamtablaufs enthält drei wiederholbare Abläufe: Einrichtung und erste echte Dateiaufgabe, Wechsel zwischen Standard und Live während derselben Unterhaltung sowie Stopp und anschließendes Wiederfinden des Gesprächs nach einem Neustart. Ein vorbereiteter Verlauf über mehrere Zeiträume erlaubt zusätzlich, Gedächtnisverdichtung und Quellenbezüge ohne wochenlange Wartezeit zu prüfen. Vorbereitete Daten werden als solche bezeichnet. Die engere M1-Abnahme steht in der Roadmap.

Für die Abnahme gelten zusätzlich diese konkreten Fälle:

- Auf einem frischen Testprofil funktioniert die Einrichtung ohne Terminal, .env oder manuelles Kopieren von Konfigurationsdateien.
- Ein ungültiger Key, ein abgelaufener Login, ein nicht verfügbares Modell und ein fehlender Live-Zugang erzeugen verständliche, voneinander unterscheidbare Zustände.
- Keys lassen sich über die UI ersetzen und entfernen. Gespeicherte Zugangsdaten erscheinen weder im Chat noch in Gedächtnis, Logs oder Diagnoseexporten.
- Konto, Sprachmodus, Rechtemodus und Abrechnung sind vor einer kostenpflichtigen Nutzung erkennbar. Optionale Tests erzeugen keine versteckten bezahlten Gespräche.
- Wiederverbindung und Neustart wiederholen keine bereits ausgeführte Aufgabe unkontrolliert.
- „Sprechen stoppen“ und „Aufgabe abbrechen“ wirken unterscheidbar; eine beendete Live-Sitzung wird tatsächlich geschlossen und ihr letzter bekannter Verbrauch gespeichert.
- Der Notstopp benötigt keine Anmeldung oder Entsperrung und bleibt bei offenen Anmeldedialogen, laufenden Agenten-Turns und Verbindungsfehlern wirksam. Die verfügbaren lokalen Abbruchwege werden unabhängig von der Spracherkennung geprüft.
- Abbruch während laufender Werkzeuge, Kindprozesse und verspätete Antworten werden geprüft. Gestoppte Arbeit startet nach einer Wiederverbindung oder einem Neustart nicht eigenständig neu.
- Sandbox-Grenzen werden mit Zugriffen innerhalb und außerhalb des erlaubten Bereichs sowie mit angebundenen Werkzeugen geprüft.
- Eine autonome Kernänderung scheitert. Eine konkrete Nutzerfreigabe erlaubt genau die angezeigte Änderung und erzeugt eine nachvollziehbare neue Fassung.
- Erinnerungsverdichtung, Quellenbezüge und Korrekturen überstehen Neustart sowie Backup und Wiederherstellung.
- Die Vorführung verwendet den getrennten Beispieldatenbestand einschließlich Codex-Verlauf. Persönliche Gespräche, Erinnerungen, Logs und Zugangsdaten erscheinen nicht in der Demo.

Unfertige Zusatzfunktionen, eine kleine Modell- und Anbieterauswahl sowie fehlende Browser-/Desktop-Spezialintegrationen verhindern die Freigabe nicht. Nicht tragbar sind dagegen Datenverlust, doppelte Änderungen, unzugänglicher Stopp, unbemerkte Rechte- oder Kostenwechsel, offengelegte Zugangsdaten oder als Erfolg angezeigte fehlgeschlagene Ausführung. Für bekannte Probleme wird dokumentiert, welcher unterstützte Ablauf betroffen ist.

## Aktueller Umsetzungsstand

M1 und M2 sind implementiert und ihre Kernabläufe in einer lokalen Windows-Testinstallation geprüft. M3 ergänzt die Gedächtnis- und Kernverwaltung sowie einen eigenen Menüpunkt für Erinnerungen, Identität und Laufzeitvorgaben. Umfang und aktueller Abnahmestand richten sich nach der Roadmap und den Testprotokollen. M4 bleibt der nächste geplante Ausbau.

Zusätzliche App-Sperre, weitere Plattformen, allgemeine Erweiterungssysteme und breitere Integrationen sind zurückgestellt und blockieren die erste Version nicht. Anforderungen für eine spätere öffentliche oder kommerzielle Verteilung werden vor dieser Verteilung gesondert geprüft; eine vorführbare lokale Ausgabe ist noch keine allgemeine Produktionsfreigabe.

## Sprachgespräch vom 7. Oktober 2026: ansprechbar bleiben während der Arbeit

Version 0.4.0 trennt Gespräch und Hintergrundaufträge, ergänzt automatisches Senden nach STT, eine geordnete Sprachausgabe, zwei Worker mit Ressourcenzuordnung und native Codex-Ziele. Live ist vorerst zurückgestellt. Rechte-, Kosten- und Lebenszyklusentscheidungen bleiben bestehen. Der konkrete Prüfstand steht im [Sprachgespräch-Testprotokoll](standard-conversation-testprotokoll.md).

### Gewünschtes Verhalten

Der Standardweg ist STT → gewähltes Codex-Modell → TTS. openHiatus nimmt einen Arbeitsauftrag an, bestätigt ihn kurz und bleibt für weitere Gespräche und Aufträge erreichbar. Derselbe gewählte Codex-Modelltyp übernimmt Gespräch und Hintergrundarbeit. Die Trennung betrifft Zuständigkeit und Lebensdauer, nicht die sichtbare Identität des Assistenten. Live wird in dieser Ausgabe nicht gestartet.

Beispiel: „Öffne Codex im Repo XY.“ Nach bestätigter Auftragsannahme sagt openHiatus: „Okay, ich starte Codex im Projekt XY. Das dauert einen Moment.“ Während der Auftrag läuft, kann der Nutzer eine Frage stellen oder einen unabhängigen weiteren Auftrag geben. Nach überprüftem Erfolg meldet openHiatus kurz: „Codex ist im Projekt XY geöffnet.“ Er kündigt keine Delegation an und behauptet vor der Prüfung keinen Erfolg. Fehlt eine eindeutige Projektzuordnung oder eine nötige Fähigkeit, fragt er konkret nach.

### Befund in Version 0.3.10

- `AppController` verwaltet eine einzelne Aufgabe. Neue Eingaben werden während `running/stopping` abgelehnt; die Oberfläche sperrt Mikrofon und Senden ebenfalls.
- `DirectCodex` unterstützt in seiner jetzigen Implementierung einen aktiven Turn. Das Entfernen der Oberflächensperren allein erzeugt keinen unabhängigen Gesprächskanal.
- Automatisches Vorlesen beginnt erst bei Aufgabenabschluss. Abgeschlossene Codex-Nachrichten mit der Phase `commentary` werden nicht als Gesprächsbeiträge übernommen. Rohdeltas werden bewusst wegen der Bereinigung sensibler Inhalte verworfen.
- STT und TTS verarbeiten derzeit vollständige Aufnahmen beziehungsweise vollständige Audiodateien. Der beobachtete Gesamtverzug ist damit noch nicht in Erkennung, Modellentscheidung, Werkzeugarbeit und Wiedergabe zerlegt.

### Architektur

Ein eigener, fortgesetzter Gesprächs-Thread nimmt Eingaben an. Nach dauerhafter Nachrichtenspeicherung spricht openHiatus eine neutrale Eingangsbestätigung. Kurze Fragen beantwortet das Modell direkt. Längere Arbeit gibt es über allgemeine Auftragswerkzeuge an eine lokale Auftragsverwaltung. Das Werkzeug zum Starten speichert einen Auftrag mit stabiler ID, bestätigt dessen Annahme und kehrt sofort zurück. Der Host übernimmt den Originalauftrag und begrenzten Gesprächskontext automatisch; das Modell muss ihn nicht erneut ausschreiben. Es wartet nicht auf die Arbeitsantwort. Die konkrete Auftragsbestätigung wird nach erfolgreicher Aufgabenannahme freigegeben und kann gesprochen werden, während der Arbeitsprozess startet.

Die Auftragsverwaltung hält Zustände wie angenommen, wartend, laufend, Rückfrage nötig, abgeschlossen, fehlgeschlagen und angehalten. Ereignisse tragen Auftrag-, Thread- und Turn-Kennungen. Der Gesprächskanal hat einen eigenen Zustand; eine laufende Aufgabe sperrt weder Eingabe noch Mikrofon. Weitere Aufträge werden nicht als automatische Aufforderung zum Abbruch des alten Auftrags behandelt.

Für die erste Umsetzung bekommt der Gesprächskanal eine eigene `DirectCodex`-Instanz und einen eigenen kontrollierten Prozessbaum. Hintergrundaufträge laufen in getrennten Instanzen. Die bestehende getrennte Laufzeit für Gedächtniszusammenfassungen ist ein verwendbares Muster. Eine spätere Bündelung mehrerer Threads in einer Laufzeit ist eine Optimierung, keine Voraussetzung. Die aktuelle Abbruchsteuerung kann ihren gesamten kontrollierten Prozessbaum beenden; deshalb muss die Trennung vor gleichzeitiger Arbeit bestehen.

Der Gesprächsagent erhält einen kleinen aktuellen Fähigkeitenkatalog: aktivierte Skills, verfügbare Werkzeuge und Verbindungen, Projektzuordnungen, Rechte sowie belegte Auftragsstände. Ein Worker bekommt den vollständigen Auftrag, relevante Gesprächsbelege und Erinnerungen, Projekt, gegebenenfalls den ausdrücklich zugeordneten Skill mit Pfad und überprüfbare Abschlusskriterien. Fähigkeiten werden bei Änderungen aktualisiert, nicht bei jedem Satz vollständig neu gesucht. Es entstehen keine Sonderlösungen für einzelne Programme.

Der Codex App Server stellt Nachrichtenphasen, Eingaben für aktive Turns und dynamische Werkzeuge bereit. Dynamische Werkzeuge sind experimentell; ihre Auftragsintegration wird gegen die gebündelte Laufzeit geprüft, wie bereits die Computer-Werkzeuganbindung. [App-Server-Dokumentation](https://learn.chatgpt.com/docs/app-server)

### Umsetzung in vier Schritten

1. **Messung und erster vollständiger Ablauf.** Zeitpunkte für Aufnahmeende, fertiges Transkript, Auftragsannahme, erste hörbare Bestätigung, Arbeitsbeginn und belegten Abschluss erfassen. Gespräch und einen Hintergrundworker trennen; Aufträge persistent speichern. Einen Auftrag bestätigen, weiter sprechen und später dessen Ergebnis melden. Hier noch keine parallelen Dateiänderungen. Auch den eigentlichen Programmstart untersuchen, damit eine schnellere Bestätigung langsame Arbeit nicht nur verdeckt.
2. **Sprachgespräch ohne Warten auf den Arbeitsabschluss.** In einem ausdrücklich aktivierten Sprachgespräch das fertige Transkript nach Ende der Sprechtastenaufnahme automatisch senden. Der bisherige Weg zum Prüfen und Bearbeiten des Transkripts bleibt verfügbar. Eine eigene Audioverwaltung spricht kurze Beiträge, verhindert Überlappung und lässt neue Aufnahmen die Wiedergabe unterbrechen, ohne den Auftrag abzubrechen. Abschlussmeldungen warten, wenn der Nutzer gerade spricht. Vollständige bereinigte Gesprächsbeiträge verwenden; keine Gedanken, Rohdeltas oder Werkzeugprotokolle vorlesen. Durchgehende Aufnahme mit Satzendenerkennung und Streaming erst nach diesem Ablauf prüfen.
3. **Unabhängige Arbeit gleichzeitig ausführen.** Zunächst höchstens zwei Hintergrundworker zulassen. Unabhängige Aufträge können gleichzeitig laufen; konkurrierende Änderungen im selben Projekt werden vorgemerkt. Maus und Tastatur teilen eine anwendungsweite Desktop-Sperre über zusammengehörige Beobachtungs-, Eingabe- und Prüfschritte. Beim Eigentümerwechsel neue Beobachtung verlangen. Statusfragen starten keine neue Arbeit. Änderungen und Abbruch beziehen sich auf eine konkrete Aufgabe; bei unklarer Zuordnung gezielt nachfragen. Die Live-Übergabe später an dieselbe Auftragsverwaltung anschließen.
4. **Lange Ziele und Wiederaufnahme.** Native Codex-Goals gesondert integrieren. Hintergrundarbeit und ein Goal sind unterschiedliche Funktionen: Ein Goal kann mehrere Turns bis zur Zielerreichung fortführen. `/goal` ist derzeit deaktiviert und muss als expliziter openHiatus-Befehl beziehungsweise Zielauftrag angebunden werden. Zielzustand, Fortsetzung, Budget und Stopp sichtbar halten; eine fertige Zwischenantwort bedeutet nicht automatisch Zielabschluss. Nach Absturz den belegten Zustand abgleichen, statt bereits ausgeführte Aktionen blind zu wiederholen. [Thread-Goals](https://learn.chatgpt.com/docs/app-server#manage-a-thread-goal)

### Abnahme und Grenzen

Der erste brauchbare Gesamtausbau umfasst Schritte 1 bis 3. Eine frühe Bestätigung allein reicht nicht als Abnahme. Der Nutzer kann während eines laufenden Programmstarts weiter sprechen, Status abfragen und einen unabhängigen Arbeitsauftrag ausführen lassen. Der alte Auftrag bleibt aktiv, beide Ergebnisse sind eindeutig zugeordnet, und Erfolgsmeldungen beruhen auf überprüftem Erfolg. Konflikte werden vorgemerkt; zwei Worker steuern den Windows-Desktop nicht gleichzeitig. Das Unterbrechen der Sprachausgabe beendet keine Arbeit. Ein gezielter Aufgabenstopp beendet keine andere Aufgabe und keine bereits eigenständig übergebene Codex-Sitzung. Der lokale Notstopp bleibt unabhängig vom Modell verfügbar.

Ziel für die Annahmebestätigung sind wenige Sekunden statt Minuten. Ein verbindliches Zeitversprechen folgt erst aus den Messungen mit dem gewählten Modell und den bestehenden Sprachverbindungen. Kleine Gesprächsbeiträge, vorbereitete Verbindungen und gezielte Skill-Übergabe sollen den Vorlauf verkürzen. Eine tatsächlich nicht bestätigte Annahme darf nicht durch eine pauschale Sofortansage verdeckt werden.

Getrennte Gesprächs- und Arbeitsaufrufe erhöhen die Modellnutzung und teilen das Kontingent des gewählten Zugangs. Die Auftragsverwaltung begrenzt Gleichzeitigkeit und meldet Verbindungs- oder Kontingentprobleme. Ein Anbieter- oder Modellwechsel sowie eine neue Abrechnung sind keine Voraussetzung des Plans. Tests verwenden zunächst kontrollierte Ereignisse und getrennte Profile; echte Modell- und Sprachtests werden gezielt für die Abnahme eingesetzt.
