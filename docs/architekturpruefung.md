# openHiatus – Architekturprüfung und Zielstruktur

> Ergänzung vom 26. Oktober 2026 (0.0.26): `shared/speech-settings.ts` beschreibt die Sprachanbieter Inworld und ElevenLabs samt Standardstimmen und Eingabeprüfung. `main/speech.ts` kapselt beide STT-/TTS-Protokolle; Schlüssel bleiben im Hauptprozess. Einstellungen und Einrichtung verwenden dieselbe `SpeechAccessCard`. Anbieter- und Stimmwechsel werden dauerhaft bestätigt und brechen ausstehende Audioarbeit ab. Details und Prüfgrenzen: [Sprachanbieter](speech-providers.md).

> Ergänzung vom 25. Oktober 2026 (0.0.21): App und Windows-Setup unterstützen sieben Sprachen. Sprachcodes und Validierung liegen in `shared/ui-language.ts`, die Anzeigetexte und Formatierung in `shared/i18n.ts` und dem lokalen Katalog. Die persistierte Präferenz gelangt über den bestehenden typisierten Snapshot in den Renderer; Ansichten und Agentensitzungen werden beim Wechsel nicht neu aufgebaut. Main aktualisiert die nativen Hintergrund- und Übernahmeanzeigen ausdrücklich. Setup setzt ausschließlich die Sprachvorgabe für neue Profile. Details und Prüfungen: [Mehrsprachigkeit](localization.md).

Stand: 21. Oktober 2026. Die Bestandsaufnahme unten bezieht sich auf den Quellstand 0.1.4 vor der Refaktorierung. Sieben Abschnitte sind inzwischen im Code umgesetzt; ihr Umfang steht am Ende dieses Dokuments. Die vollständige Zielstruktur bleibt der weitere Ausbauplan.

> Hinweis vom 24. Oktober 2026: Die Produktrichtung liegt seitdem auf gerätegebundener Computersteuerung ([Vision](vision.md)). Gmail-Beispiele in diesem Dokument beschreiben den damaligen Planungsstand; als realer Dienst ist inzwischen Google Kalender angebunden ([Anleitung](google-calendar.md)).

## Einschätzung

openHiatus hat eine brauchbare modulare Grundlage und bereits wichtige Prozess-, Zugangs- und Ausführungsgrenzen. Die Anwendungslogik ist jedoch stark in einem zentralen Controller und einer zentralen React-Komponente gebündelt. Für den vorgesehenen Ausbau reicht diese Trennung noch nicht aus. Architekturarbeit ist deshalb ein eigener Lieferabschnitt vor der Erweiterung dieser Stellen.

Die bestehende Technik kann dabei weiterverwendet werden. Das Ziel ist eine Desktop-Anwendung mit verbindlich abgegrenzten Fachmodulen: eigener Zustand, öffentliche Schnittstellen, klarer Abbruch und gezielte Tests pro Modul. Neue Ordner allein lösen die vorhandene Kopplung nicht.

## Was bereits trägt

| Grenze | Vorhandener Beleg | Bedeutung für den Ausbau |
| --- | --- | --- |
| Oberfläche / privilegierte Anwendung | [main.ts](../src/main/main.ts), [preload.ts](../src/main/preload.ts) | Renderer mit Sandbox, Kontextisolation und expliziter API; Hauptprozess prüft Absender, Hauptframe und Eingaben. Diese Grenze bleibt erhalten. |
| Agent / Anwendung | [pi.ts](../src/main/pi.ts), [agent-protocol.ts](../src/main/agent-protocol.ts), [agent-host.ts](../src/main/agent-host.ts), [openHiatus-process-host.cs](../src/main/openhiatus-process-host.cs) | Pi läuft in einem eigenen Prozess mit Nachrichtenprotokoll und verwaltetem Windows-Prozessbaum. Modell- und Prozesslebensdauer sind bereits ausdrücklich behandelt. |
| Gespräch / ausführende Arbeit | [dialog.ts](../src/main/dialog.ts), [jobs.ts](../src/main/jobs.ts) | Begrenzte Dialogwerkzeuge, geordnete Auftragsannahme, Worker, Ressourcenprüfung und Einzelstopp sind vorhanden. |
| Desktopzugriff | [desktop-coordinator.ts](../src/main/desktop-coordinator.ts), [computer.ts](../src/main/computer.ts) | Ein Besitzer des Desktops, aktuelle Bildkennungen, Eingabeprüfung und Abbruch bilden eine sinnvolle Grundlage für die neue Bildstrategie. |
| Infrastruktur / Tests | Abhängigkeitsschnittstellen im [Controller](../src/main/controller.ts), [ComputerSession](../src/main/computer.ts), [Tests](../tests) | Agenten, Speicher, Sprache und Desktop können bereits mit kontrollierten Gegenstellen geprüft werden. Es gibt auch Prüfungen echter Prozess- und Paketabläufe. |
| Fachliche Teilbereiche | [memory-summarizer.ts](../src/main/memory-summarizer.ts), [chatgpt-auth.ts](../src/main/chatgpt-auth.ts), [providers.ts](../src/main/providers.ts), eigene Rendereransichten | Gedächtnisberichte, Anmeldung und Modellanbieter sind keine vollständig in die Oberfläche eingebauten Einzelfunktionen. Diese Bausteine werden übernommen. |

## Wo die Architektur vor dem Ausbau nachziehen muss

### 1. Zu viele Verantwortlichkeiten im AppController

[controller.ts](../src/main/controller.ts) umfasst rund 1.150 Zeilen beziehungsweise 80 kB. Entscheidend ist die Mischung: Dialogwerkzeuge und Auftragsannahme, Worker-Kontext, Gedächtnisabruf und Berichte, Providerwechsel und ChatGPT-Anmeldung, Sprachmeldungen, Einstellungen, Persistenz und globaler Stopp werden hier zusammengeführt. Beispiele sind `dialogTool` (Zeile 221), `acceptJob` (300), `startMemorySummary` (552), `changed` (714), `sendDialog` (792) und `stop` (1002).

Die injizierten Abhängigkeiten helfen beim Testen, aber der Controller besitzt weiterhin sehr viele Zustandsregeln. Ein Gmail-Zweig an dieser Stelle würde die Kopplung weiter erhöhen. Er wird schrittweise zur dünnen Anwendungsfassade; Fachzustand und Regeln wandern in die zuständigen Module. Ein gemeinsamer Lebensdauerkoordinator behält die Reihenfolge für Stopp und Herunterfahren im Blick.

### 2. Die Hauptansicht ist gleichzeitig Audio- und Gesprächssteuerung

[App.tsx](../src/renderer/App.tsx) umfasst rund 510 Zeilen beziehungsweise 49 kB mit teils sehr langen Zeilen. Neben Navigation und Darstellung verwaltet sie Snapshot-Abonnement, Mikrofon, Wiedergabe, Sprachwarteschlange, Aufnahmeabbruch, Senden, Entwurf, Hotkeys, Overlayzustand und Einstellungen. Die Aufnahme- und Wiedergabelogik beginnt bereits um Zeile 84; Senden und Aufnahme liegen ab Zeile 247.

Für die neue UI werden Darstellung und langlebige Abläufe getrennt. Ein oberhalb der Ansichten eingebundener Gesprächs-/Audioruntime behält Aufnahme, Warteschlange und Entwurf beim Navigieren. Ansichten bekommen Daten und Aktionen über gezielte Schnittstellen. Bestehende Komponenten für Gedächtnis, Skills und Provider bleiben nutzbar.

### 3. Gemeinsame Typen ersetzen noch keine Modulverträge

[shared/contracts.ts](../src/shared/contracts.ts) mischt Gespräch, Aufgaben, Provider, Audio, Desktopbilder, globale UI-API und interne Agentenschnittstellen. Der eine `Snapshot` enthält den Gesamtzustand; `BackgroundJob` wird sowohl für persistierte Auftragsdaten als auch für die Oberfläche verwendet. [main.ts](../src/main/main.ts), ab Zeile 121, registriert daneben den gesamten Aufrufdispatcher samt fachlicher Eingabeprüfung. Im [Preload](../src/main/preload.ts) ist der interne Aufruf nur als Methodenname plus `unknown[]` beschrieben.

Die vorhandene Positivliste und Laufzeitprüfung sind reale Schutzgrenzen. Es fehlt aber eine vom Feature her organisierte, durchgängig typisierte Zuordnung von Anfrage, Prüfung und Antwort. Künftig gibt es fachbezogene Verträge und IPC-Handler. Domänenzustand, Speicherschema und veröffentlichte UI-Daten werden bewusst getrennt. Kleine stabile Grundtypen bleiben gemeinsam; interne Agentenverträge gehören zur Agentenlaufzeit.

### 4. Dienstwerkzeuge brauchen einen vorgesehenen Erweiterungspunkt

Der [PiAdapter](../src/main/pi.ts) wählt in Zeile 89–96 zwischen Dialogwerkzeugen und dem fest eingebauten Computerwerkzeug; in Zeile 133–150 steckt dessen konkrete Ausführung samt Bildantwort. Allgemeine Dienste sind hier noch kein vorhandener Erweiterungspunkt.

Geplant ist eine interne Werkzeugregistrierung mit Beschreibung, Eingabeprüfung, Ausführung und Abbruch. Ein Auftrag erhält seine ausdrücklich gebundene Werkzeugmenge. Gesprächswerkzeuge und Workerwerkzeuge bleiben getrennt. Dienstkonten und Geheimnisse verwaltet der privilegierte Dienstbereich; Worker erhalten begrenzte Operationsergebnisse. Gmail wird der erste Adapter dieser Grenze. Eine synthetische zweite Dienstimplementierung prüft, dass die Schnittstelle tatsächlich allgemein ist.

Auch das interne Prozessprotokoll wird dabei nachgezogen: [HostPacket und AgentTransport](../src/main/agent-protocol.ts), Zeile 9–11, verwenden für Nutzdaten beziehungsweise Antworten noch `any`. Der [PiAdapter](../src/main/pi.ts), Zeile 108–109, castet Ereignisse und prüft deren Typnamen. Methodenbezogene Anfrage-/Antworttypen und eine Prüfung vollständiger Ereignisse am Empfang verhindern, dass neue Dienst- oder Bildantworten auseinanderlaufen.

### 5. Zustandsspeicherung und Anzeige sind eng gekoppelt

`changed()` im [Controller](../src/main/controller.ts), Zeile 714, speichert standardmäßig den Gesamtzustand und veröffentlicht einen vollständigen Klon. Auch Auftragsaktivität und Verbrauch können diesen Weg auslösen. [StateStore.save](../src/main/storage.ts), Zeile 176, validiert und serialisiert den Gesamtstand, liest die bisherige Datei und schreibt Sicherung und Hauptdatei synchron einschließlich `fsync`. Auch der [Gedächtnisspeicher](../src/main/memory.ts), Zeile 246, arbeitet mit synchronen vollständigen Dateiständen.

Das ist ein belegter möglicher Aufwand im Hauptprozess, noch kein gemessener Grund für eine konkrete Verzögerung. Für mehr Aufgaben, Verlauf und Dienste werden Anzeigeereignisse, dauerhafte Übergänge und Speicherarbeit getrennt. Eine geordnete Schreibwarteschlange beziehungsweise ein passender Speicheradapter wird anhand von Messungen eingeführt. Auftragsannahme und externe Arbeit behalten die Reihenfolge „dauerhaft angenommen, dann starten“. Stopp darf weiterhin nicht auf Datenträgerarbeit warten. Eine lediglich asynchrone Funktionssignatur genügt dafür nicht.

### 6. Computer Use braucht einen eigenen Beobachtungsvertrag

Heute verbinden [computer.ts](../src/main/computer.ts) und der Pi-Adapter Eingabe, Aufnahme, Bildantwort und Metadaten. `ComputerFrame` in [contracts.ts](../src/shared/contracts.ts), Zeile 29, beschreibt ein einzelnes Bild ohne Auftrags- oder Sitzungszuordnung. Die [Vorschau](../src/renderer/ComputerPreview.tsx) übernimmt das zuletzt empfangene Bild.

Die neue Übersicht-/Detailstrategie bekommt eigene Bausteine für Aufnahme, Bildvergleich, Bereichsauswahl, Bildaufbereitung und Koordinaten. Ein Beobachtungspaket enthält Auftrags-/Sitzungszuordnung, Generation, `frameId`, `viewId`, Quellrechteck und tatsächliche Bildmaße. Modell und Vorschau verwenden dasselbe Paket. Desktopbesitz, laufender Agententurn und gegebenenfalls weiterlaufende verwaltete Prozesse erhalten ausdrücklich getrennte Lebensdauern; die bisherige Schutzwirkung bleibt dabei erhalten. Der [Computer-Use-Plan](computer-use-uebersicht-und-detail-plan.md) legt die Versuche und Geometrie fest.

Hier gibt es einen konkreten, noch zu verifizierenden Integrationspfad: Nach einem fertigen Turn lässt der Pi-Adapter die Computersitzung zunächst bestehen (Zeile 111). Die Desktop-Lease endet erst beim Computer-Stopp (Zeile 328–338). Wenn ein verwalteter Hintergrundprozess weiterläuft, behält der JobManager die Runtime absichtlich bei (Zeile 146–153). Daraus kann sich ein weiter belegter Desktop nach abgeschlossener interaktiver Arbeit ergeben. Die Einzelabsichten werden bereits getrennt getestet; eine kombinierte Reproduktion wurde bei dieser Prüfung nicht ausgeführt. Vor der Erweiterung wird genau diese Kombination geprüft und die Freigabe interaktiver Ressourcen ausdrücklich vom Erhalt eines Hintergrundprozesses getrennt.

### 7. Die vorgesehenen Grenzen werden noch nicht automatisch geprüft

[tsconfig.json](../tsconfig.json) verwendet bereits `strict: true`. Die aktuellen [npm-Prüfungen](../package.json) prüfen Typen und Verhalten, enthalten aber keine Regel für erlaubte Modulimporte. Die flache Ablage unter `main` macht eine Zuständigkeit erkennbar, verhindert jedoch keinen Zugriff auf fremde Interna.

Mit der ersten Extraktion werden Importregeln für die tatsächlichen Module eingeführt: Renderer ohne Main-/Node-Importe, Fachlogik ohne Electron/Pi/CUA und fachübergreifende Zugriffe nur über öffentliche Schnittstellen. Diese Regeln laufen zusammen mit Typprüfung und den passenden Verhaltenstests. Für das öffentliche Repository folgt ein reproduzierbarer CI-Prüfpfad.

## Vorgesehene Struktur

Die Namen sind ein Arbeitsentwurf. Module entstehen mit der jeweiligen Extraktion, ohne leere Gerüste auf Vorrat.

```text
src/
  main/
    bootstrap/           # Zusammensetzen, Appstart und Herunterfahren
    ipc/                 # Absenderprüfung und Registrierung der Feature-Handler
    modules/
      conversation/      # Gespräch, Entwurfannahme, Dialog und Delegation
      tasks/             # Auftragszustand, Warteschlange, Ressourcen, Ergebnisse
      memory/            # Quellen, Versionen, Abruf, Berichte und Vorschläge
      voice/             # Sprachdienste und auftragsbezogene Sprachmeldungen
      models/            # Modellrollen, Provider und deren Anmeldungen
      skills/            # Katalog, Favoriten und übergebener Skillkontext
      computer/          # Beobachtung, Bereiche, Geometrie und Aktionsregeln
      services/          # Konten, Fähigkeiten und Dienstoperationen
        gmail/           # Google-Protokoll und konkrete Gmail-Operationen
    platform/
      electron/          # Fenster, Systembrowser und Betriebssystemeinbindung
      windows/           # Job Objects, Hotkeys und native Helfer
      pi/                # AgentAdapter, Host, Transport und SDK-Anbindung
      credentials/       # Geschützter Zugangsspeicher
      persistence/       # Dateiformate, Migrationen und konkrete Speicheradapter
  renderer/
    app/                 # Rahmen, Navigation und langlebige Runtime-Provider
    features/            # Gespräch, Aufgaben, Dienste, Gedächtnis, Skills, Settings
    components/          # Gemeinsam genutzte Darstellungselemente
  shared/
    ipc/                 # Anfrage-/Antwortverträge und gemeinsame Prüfungen
    conversation/        # Veröffentlichte Datenverträge je Fachbereich
    tasks/
    memory/
    computer/
    services/
    models/
    voice/
```

Fachmodule besitzen ihre Regeln, internen Zustände und benötigten Abhängigkeitsschnittstellen. Konkrete Speicher-, SDK- oder Betriebssystemadapter implementieren diese Schnittstellen. `bootstrap` setzt die Komponenten zusammen. `shared` enthält nur bewusst prozessübergreifende Verträge und kleine reine Hilfsfunktionen.

Der Aufrufweg ist damit nachvollziehbar: **Ansicht → typisierte IPC-Grenze → Anwendungsfall im Fachmodul → benötigter Adapter**. Eine Ansicht ruft keine Google-API auf. Ein Dienstadapter steuert keine React-Ansicht. Der Pi-Transport enthält keine Gmail-Geschäftsregeln. Fachmodule greifen nicht direkt auf private Zustände anderer Module zu.

## Reihenfolge der Architekturarbeit

| Schritt | Konkrete Änderung | Abnahme |
| --- | --- | --- |
| 1. Grenzen festlegen | Verantwortlichkeiten, öffentliche Schnittstellen und heutige Ablaufzustände festhalten; erste Importregeln einführen | Für Gespräch, Auftrag, Audio und Stopp ist der Besitzer des Zustands eindeutig. Der bisherige Ablauf ist als Regression erfasst. |
| 2. Controller entlasten | Dialog-/Gesprächssteuerung, Auftragsintegration und Gedächtnisberichte schrittweise ausziehen; gemeinsame Lebensdauerkoordination ausdrücklich erhalten | Gespräch plus zwei Aufträge, Stopprennen, unveränderte Auftragsidentität, Gedächtniskontext und Neustart verhalten sich weiterhin korrekt. |
| 3. UI-Runtime abtrennen | Snapshot-Anbindung, Entwurf, Senden und Audiosteuerung von einzelnen Ansichten lösen; UI-Komponenten danach erneuern | Navigation während Aufnahme, Transkription, Wiedergabe und laufenden Aufträgen verliert keinen Zustand und führt nichts erneut aus. |
| 4. Grenzen für Erweiterungen liefern | Typisierte Feature-IPC und Runtime-Nachrichten, gebundene Werkzeugregistrierung und Dienstport; Computer-Beobachtung als eigenes Paket | Ein synthetischer Dienst und der bestehende Desktopadapter nutzen die vorgesehenen Grenzen. Dialog erhält keine zusätzlichen Ausführungsrechte. Desktopfreigabe wird auch bei erhaltenem Hintergrundprozess kombiniert geprüft. |
| 5. Last und Speicherung gezielt bearbeiten | Hauptprozesszeiten, Speicherarbeit und Veröffentlichungen messen; notwendige Entkopplungen mit geordnetem Schreiben umsetzen | Dauerhafte Annahme vor Start, keine Wiederholung nach Neustart, schnelle Stoppinitiierung und nachvollziehbare Laufzeitmessungen bleiben nachgewiesen. |

Die Schritte werden in kleinen, lauffähigen Änderungen geliefert. Ein Fachbereich wird mit seinen Verhaltenstests vollständig über eine Schnittstelle herausgelöst; bloßes Verschieben einer großen Datei gilt nicht als fertig. Der bestehende Gedächtnisspeicher muss beispielsweise nicht vor dem ersten UI-Schritt vollständig umgebaut sein. Neue Dienste und neue Bildlogik werden aber von Anfang an innerhalb der festgelegten Grenzen implementiert.

## Prüfstand und Grenzen dieser Einschätzung

Diese Prüfung bewertet Quellcode, Abhängigkeiten und vorhandene Prüfpfade. Sie ist kein Laufzeitprofil und kein Beleg für eine aktuelle Fehlfunktion. Die Typprüfung wurde bei dieser Bestandsaufnahme erfolgreich ausgeführt. Der dokumentierte bisherige Stand umfasst außerdem 296 erfolgreiche Tests sowie Build- und Paketprüfungen; Einzelheiten stehen im [Testprotokoll](openhiatus-testprotokoll.md). Diese Architekturprüfung behauptet keine erneute vollständige Ausführung dieser Tests.

Für jede tatsächliche Extraktion werden die betroffenen Verhaltenstests und die Typprüfung ausgeführt. Änderungen an Prozess-, Desktop- und Stoppgrenzen brauchen zusätzlich die entsprechenden Integrationsprüfungen. Neue Schnittstellentests prüfen relevante Eigenschaften wie Abbruch, Kontozuordnung, dauerhafte Annahme und erneute Zustellung; sie spiegeln nicht nur interne Methodenaufrufe.

## Erster umgesetzter Abschnitt

Die erste Extraktion trennt tatsächliche Zustandsverantwortung und ist im Quellcode integriert:

- [ConversationCoordinator](../src/main/modules/conversation/index.ts) besitzt Gesprächsnachrichten, Dialogaufgabe, laufenden Turn, unveränderten Originalauftrag, eingefrorene Identität, Warteschlange, Bestätigungsabgleich, Abgleich der übergebenen Auftragsstände und Dialogstopp. Der Controller liefert benannte Ports für Gedächtnis, Skills, Arbeitsaufträge und Zustandsveröffentlichung. Seine Gesprächsdaten sind eine Projektion des Moduls; sie werden nicht als gemeinsam veränderlicher interner Zustand übergeben.
- [VoiceSession](../src/renderer/features/voice/index.ts) besitzt Aufnahme, Wiedergabe, Sprachwarteschlange, Abbruchgenerationen, Gerätezustand, Timer und Ressourcenfreigabe. Ein Browseradapter stellt Geräte und Audio bereit; der React-Hook bindet die Runtime oberhalb der wechselnden Ansichten ein. Composer, Navigation und Overlaydarstellung bleiben vorerst in App.
- Der Pi-Adapter gibt interaktive Desktopressourcen vor dem Veröffentlichen eines fertigen Turns frei. Weiterlaufende verwaltete Prozesse bleiben davon unabhängig erhalten. Damit ist der oben statisch hergeleitete Integrationspfad mit gezielten Tests abgedeckt und korrigiert; gleichzeitiger Stopp und unbestätigte Freigabe werden ebenfalls geprüft.
- [Importregeln](../scripts/architecture-rules.ts) prüfen die Prozessgrenzen für Renderer und Shared sowie öffentliche Einstiege und erlaubte Abhängigkeiten der ausgezogenen Module. Das Gesprächsmodul verwendet nur Shared-Verträge und `node:crypto` für Kennungen. Der Audiokern verwendet injizierte Browserfähigkeiten. Verbotene direkte, dynamische und reine Typimporte sind durch Gegenbeispiele getestet.

`npm run check` führt Importregeln, Typprüfung und vollständige Tests zusammen aus. Die Verhaltenstests für die neuen Grenzen prüfen unter anderem parallele gleiche Anfragen, dauerhafte Annahme, wartende Nachrichten, Identitätswechsel, Originalauftragsgrenzen, Stoppfehler und verspätete Audioantworten. Die tatsächlichen Gesamtergebnisse werden im [Testprotokoll](openhiatus-testprotokoll.md) fortgeschrieben.

Nach diesem ersten Abschnitt war der Controller von rund 1.150 auf rund 995 Zeilen, die App-Komponente von rund 510 auf rund 377 Zeilen gesunken. Die entscheidende Änderung sind die Besitzer von Zustand und Lebensdauer.

## Zweiter umgesetzter Abschnitt

### Gedächtnisberichte als eigener Fachbereich

[MemoryReportCoordinator](../src/main/modules/memory-reports/index.ts) besitzt Berichtszustand, manuelle und automatische Läufe, Abbruch, automatische Zeitplanung und das Berliner Tagesbudget. Die ChatGPT-Einwilligung für automatische Berichte und das Unterbrechen durch Nutzerarbeit werden hier geprüft. Der Controller stellt aktuelle Einstellungen, Leerlaufprüfung, Archivierung, direkten Modellzugang und Projektion bereit.

Summarizer, Prompt und Ausgabeschema liegen im selben Modul. Die bisherigen Importpfade bleiben über Kompatibilitäts-Reexports erhalten; das Berichtsverfahren und seine Quellennachweise wurden beim Umzug nicht verändert. Zusätzliche Tests prüfen abgesagte Timer, Mitternacht, Einwilligungsentzug, unkooperative Modellantworten und globalen Stopp vor lokalen Schreibzugriffen.

### Pro Lauf gebundene Werkzeuge

Die öffentliche [Werkzeugregistrierung](../src/main/modules/tools/index.ts) trennt Definition, Eingabeprüfung und typisierten Handler von Pi. Jeder Lauf bindet eine feste Werkzeugmenge mit Rolle, Laufkennung und Abbruchsignal. Definitionen werden kopiert und eingefroren; nachträgliche Änderungen erweitern eine laufende Sitzung nicht.

Gespräch und Worker erhalten getrennte Werkzeugrollen. Die Registrierung prüft diese Grenze zusätzlich zum Hostmodus. Der [konkrete Computerbeitrag](../src/main/platform/tools/index.ts) stellt Desktopwerkzeug, Bildantwort und bestätigte Freigabe bereit. Der Pi-Adapter selbst verteilt nur noch an seine gebundene Werkzeugmenge; er enthält keine Computer- oder Dienstoperationen mehr. Konflikte mit den eingebauten SDK-Datei-/Shellwerkzeugen werden vor dem Hostauftrag abgewiesen.

Abbruch, Turnabschluss, unerwartetes Hostende und fehlerhafte Teilregistrierung haben ausdrücklich bestätigte Cleanup-Pfade. Erhaltene Hintergrundprozesse und Freigabe interaktiver Werkzeuge bleiben getrennt.

### Allgemeiner Dienstbroker vor dem ersten echten Konto

Der [ServiceBroker](../src/main/modules/services/index.ts) verwaltet öffentliche Kontometadaten und Fähigkeiten. Ein konkreter Dienstadapter liefert typisierte Fachoperationen und behält sein Anmeldeprotokoll sowie Geheimnisse bei sich. Modellargumente wählen weder Auftrag noch Lauf oder ein anderes Konto: Der Host bindet diese Zuordnung zusammen mit der verfügbaren Operation.

Die erste Schnittstelle bietet ausschließlich Leseoperationen an. Auch ein weiter gehendes Kontorecht schaltet keinen Versand frei. Status und Berechtigung werden vor und nach einer Operation geprüft. Geänderte Verbindung, Trennen, Stopp und Zeitgrenze brechen ausstehende Aufrufe ab; verspätete Ergebnisse werden verworfen. Ein neu verbundenes Konto oder neue Rechte erweitern keine bereits gebundene Werkzeugmenge. Eine Token-Erneuerung innerhalb eines konkreten Adapters braucht keine neue Brokerverbindung; `setConnection` bezeichnet ausdrücklich eine neue Verbindungsgeneration.

Ergebnisse enthalten begrenzte JSON-Fachdaten, kontogebundene Ressourcenkennungen und bei Bedarf einen Fortsetzungscursor. Unbegrenzte, zyklische oder fremd zugeordnete Daten werden zurückgewiesen. Private Adapterfehlermeldungen werden nicht in Werkzeugantworten übernommen. Der konkrete Adapter muss seine API-Antworten auf diese Fachdaten projizieren; Authentifizierungsobjekte sind keine Fachergebnisse.

Tests mit synthetischen Nachrichten- und Kalenderdiensten sowie mehreren Konten prüfen denselben Vertrag. Ein weiterer Integrationstest schickt Werkzeugaufrufe durch den Pi-Adapter mit kontrolliertem Prozessport bis zu beiden Diensten. Das normale [App-Wiring](../src/main/main.ts) setzt Worker aus Computerbeitrag und Dienstbroker zusammen; der Dialog bekommt weiterhin ausschließlich seine Gesprächswerkzeuge.

Es ist noch kein realer Dienst registriert. Kontometadaten liegen vorerst im Arbeitsspeicher. Google-OAuth, geschützte dauerhafte Dienstkonten, die Dienstoberfläche und Gmail-Operationen sind der darauf aufbauende Pilot. Schreiboperationen benötigen zunächst die geplante dauerhafte Operationsverfolgung und Behandlung unklarer Ergebnisse.

Der Controller umfasst nach diesem Abschnitt rund 917 Zeilen. Auftragskontext, Providerverwaltung und der ältere direkte Aufgabenpfad sind weiter abzugrenzen. Typisierte Feature-IPC, vollständig typisierte Runtime-Nachrichten, der neue Computer-Beobachtungsvertrag und die Entkopplung der Speicherung bleiben offen. Lieferabschnitt A ist deshalb weiterhin nicht insgesamt abgeschlossen.

## Dritter umgesetzter Abschnitt

### Typisierte und geprüfte UI-Grenze

Die [gemeinsamen IPC-Verträge](../src/shared/ipc/index.ts) koppeln jeden Befehlsnamen an sein Argumenttupel und Ergebnis. Der Preload stellt weiterhin dieselbe `window.openhiatus`-API bereit. Sein Transport liefert zunächst `unknown`; erst nach Prüfung von Antwortumschlag und konkretem Ergebnis erhält die UI typisierte Daten. Auch Zustands- und Bildereignisse werden geprüft. Die Callback-Funktionen erhalten ausschließlich die vorgesehenen Nutzdaten.

Die [Featurehandler](../src/main/ipc/index.ts) teilen Gespräch/Aufträge, Einstellungen/Anbieter/Skills, Sprache, Gedächtnis und Arbeitsbereich auf. Eine feste, vollständig typisierte Befehlsliste ersetzt den zentralen Switch. Eingaben werden vor dem Fachaufruf auf Form, Feldnamen, Argumentzahl und bestehende Größenbegrenzungen geprüft. Die Handler verwenden injizierte Ports; Importregeln verbieten ihnen direkte Abhängigkeiten von Electron, Controller, Speicher und SDK.

Ergebnisse und veröffentlichte Zustands-/Bildereignisse werden bereits im Hauptprozess auf ausdrückliche DTO-Felder projiziert. Interne eingefrorene Auftragsanweisungen gelangen damit nicht in den Renderer. Die Prüfung von zulässigem Fenster, Hauptframe, exakter Renderer-URL und App-Lebensdauer bleibt im Electron-Einstieg. Die Vollzugriffsbestätigung hat weiterhin ihren eigenen Befehl; ein allgemeines Einstellungsupdate kann sie weder typseitig noch zur Laufzeit setzen.

### Auftragsintegration mit eigenem Zustandsbesitz

Der [BackgroundTaskCoordinator](../src/main/modules/tasks/index.ts) besitzt die interne Jobliste, den Scheduler, Worker-Lebensdauern, Annahmekontext, eingefrorene Gedächtnisversionen, Archivfortsetzungen, Fortschrittsmeldungen und Ergebniszuordnung. Der Controller stellt Fachports für Skills, Gedächtnis, Archivierung, Einstellungen und Veröffentlichung bereit. Gespräch und Workerfabrik erhalten kopierte Auftragsansichten; sie verändern keinen gemeinsam übergebenen Jobzustand.

Der bisherige JobManager-Algorithmus bleibt bis auf Importpfade und den exportierten Port unverändert. `jobs.ts` erhält den bisherigen Importpfad als Kompatibilitätsreexport. Die reine Verbrauchsprüfung liegt ebenfalls im Auftragsmodul und bleibt über `storage.ts` verfügbar; das Speicherformat und die Speicheradapter wurden nicht umgebaut.

Neue Verhaltenstests prüfen Besitz und Kopien, fehlgeschlagene dauerhafte Annahme samt zurückgerollter Projektion, auftragsspezifische Gedächtnisbelege, Fortschritts-/Bild-/Sprachzuordnung und Archivseiten innerhalb desselben Workers. Stopp vor einer vorgemerkten Archivfortsetzung verhindert deren Start. Unbestätigter globaler Stopp sperrt weitere Annahmen bis zum erfolgreichen erneuten Stopp. Wiederherstellung startet keine gespeicherten Aufträge erneut.

Die zusätzliche [Electron-Prüfung](../scripts/ipc-boundary-check.mjs) verwendet ein isoliertes Profil und einen lokalen Modellserver. Sie prüft fehlerhafte IPC-Anfragen, ein fremdes Fenster mit demselben Preload sowie zwei parallele echte Pi-Worker, gezielten Stopp, Dateiergebnisse und Neustart. Die tatsächlichen Ergebnisse stehen im [Testprotokoll](openhiatus-testprotokoll.md).

Der Controller umfasst nach diesem Abschnitt rund 780 Zeilen. Providerverwaltung und der ältere direkte Aufgabenpfad bleiben dort vorerst erhalten. Vollständig typisierte interne Runtime-Nachrichten, Computer-Beobachtung und Speicherung sind weitere Architekturteile. Auch die zentrale UI-Steuerung wird beim geplanten Navigationsumbau weiter aufgeteilt. Lieferabschnitt A ist weiterhin nicht insgesamt abgeschlossen.

## Vierter umgesetzter Abschnitt

### Modellverwaltung und direkter Aufgabenpfad

Der [ModelManagementCoordinator](../src/main/modules/models/index.ts) besitzt Anbieter- und Modellangebot, die drei Modellrollenauswahlen, Verbindungs-/Anmeldesicht, Änderungssperre und Auth-Generation. Konkreter ProviderStore und Anmeldung bleiben Adapter. Eine ausdrückliche Initialisierung nach der Verdrahtung stellt sicher, dass bekannte Schlüssel bereits vor der ersten bereinigten Kontoprojektion verfügbar sind. Auch entfernte Schlüssel bleiben für die Bereinigung bekannt. Laufzeitereignisse funktionieren weiterhin ohne ProviderStore, etwa in isolierten Tests.

Kontorefresh setzt laufende Turns nicht zurück. Abgesagte Anmeldungen und Provideränderungen, während derer global gestoppt wurde, starten anschließend keine Runtime erneut. Öffentliche Sichten und vom Adapter gelieferte Daten werden kopiert; der Controller erhält Projektionen und stellt die gemeinsame Lebensdauerkoordination bereit.

Der [DirectTaskCoordinator](../src/main/modules/direct-task/index.ts) besitzt den weiterhin unterstützten direkten Agentenpfad: Nachrichten, Aufgabe, Verbrauch/Kontext, eingefrorene Identität und Modellwahl, Gedächtnisversionen, Archivseiten, Generation und Stopp. Der Controller enthält diese parallele Zustandsmaschine nicht mehr. Der direkte Pfad wird bei dieser Änderung weder entfernt noch in den Gesprächsmodus umgewandelt. Dauerhafte Annahme vor Agentenarbeit, Rollback, Originalauftrag und Ergebnisbelege behalten ihre bisherigen Regeln.

### Interne Host-Nachrichten als geprüfter Vertrag

[agent-wire.ts](../src/main/agent-wire.ts) definiert die vorhandenen JSONL-Nachrichten als korrelierte Befehls-/Parameter-/Antworttypen. JSON wird als `unknown` gelesen. Richtungsabhängige Decoder prüfen Befehle und Ereignisse; bei Antworten liefert erst die gespeicherte Anfragekennung den passenden Ergebnisdecoder. Werkzeugargumente bleiben bis zur Fachvalidierung `unknown`.

Der Host kann über diesen Vertrag keine Verbindungs-, Modell- oder Desktopereignisse des Hauptprozesses erzeugen. Fehlerhafte Nachrichten sperren den Transport sofort für weitere Aufrufe und Antworten, während das Prozessende bestätigt wird. Widersprüchliche Meldungen mit Erfolgsstatus und Fehler werden abgewiesen. Auftrag, Anfrage und Antwort bleiben zugeordnet; veraltete oder fremde Läufe lösen keine Werkzeug- oder Zugangsanfragen aus. Die bestehende Paket-, Prompt- und Bildgrenze bleibt erhalten. Die drei Runtime-Dateien benötigen weder `any` noch ungeprüfte `AgentEvent`-/`HostRun`-Casts.

Ein echter nativer Transporttest sendet einen fehlerhaften Abschluss und danach Werkzeug-, Zugangs- und Erfolgsmeldungen. Es wird weder eine Operation ausgeführt noch Erfolg veröffentlicht. Die SDK-Prüfungen bauen ihre Hostdateien jetzt in eigenen `.test-data`-Verzeichnissen und überschreiben keine produktiven Builddateien.

### Speichergrenze und gemessener Aufwand

Das [StateJournal](../src/main/modules/state-journal/index.ts) trennt bestätigte dauerhafte Barrieren, gewöhnliche Checkpoints und reine UI-Veröffentlichung. Die vorhandenen Annahme-/Steering-/Startports benutzen weiterhin die dauerhafte Barriere; Fehler erreichen deren Aufrufer. Checkpointfehler verhindern keine Zustandsanzeige. Während Stopp werden gewöhnliche Speicherstände vorgemerkt und erst nach bestätigtem Ende gemeinsam mit der vorhandenen Archivierungskoordination nachgeholt. Die konkreten Speicheradapter schreiben weiterhin synchron; Dateiformat, Sicherung, Wiederherstellung und Erkennung unbekannter Versionen wurden nicht verändert.

`MemoryStore.instructionDocuments()` liefert ausschließlich Inhalt und Version von Identität/Kern als unabhängige, aktuell bereinigte Daten. Agenten- und Auftragskontext benötigen dafür keinen vollständigen Archivsnapshot mehr. Ältere injizierte Gedächtnisadapter ohne diesen Port verwenden den bisherigen Snapshotweg.

Der reproduzierbare [Speicherbenchmark](../scripts/storage-baseline.ts), aufrufbar als `npm run bench:storage`, verwendet ausschließlich synthetische Daten. Die Ausgangsmessung auf `fec5b96` mit je 1.000 Zeichen pro Nachricht und fünf fertigen Jobs ergab folgende lokale Mediane:

| Operation | 100 Nachrichten | 1.000 Nachrichten |
| --- | --- | --- |
| StateStore.save mit vorhandener Primärdatei | 11,0 ms | 34,0 ms |
| Controller-Aktivitätsereignis mit Speicherstand | 18,4 ms | 36,4 ms |
| Kontextanzeige ohne Speicherstand | 0,68 ms | 2,07 ms |
| Unverändertes Memory.capture | 0,85 ms | 15,7 ms |
| Memory.capture mit einer neuen Quelle | 25,4 ms | 155,3 ms |
| Memory.retrieve einschließlich Abrufnachweis | 25,8 ms | 146,0 ms |

Ein vorgemerkter `setImmediate` bestätigt die synchrone Blockade während dieser Aufrufe. Drei Datenträger- beziehungsweise sieben CPU-Messungen bei warmem Dateicache sind eine Ausgangsmessung dieses Rechners, keine allgemeine Latenzzusage oder belastbare p95. Ausreißer bis etwa 405 ms wurden beobachtet; ihre Ursache ist nicht isoliert. Electron-Übertragung, echte Modellaufrufe und umfangreiche KI-Berichtshistorien gehören nicht zu dieser Messung. Die ursprünglichen Rohdaten liegen lokal unter `artifacts/openhiatus-speicher-baseline-vor-abschnitt4.json`; erneute Läufe schreiben `artifacts/openhiatus-speicher-baseline.json`.

Der Abschlusslauf mit 1.000 Nachrichten misst für den kleinen Identitäts-/Kernport 0,022 ms und für den vollständigen Gedächtnissnapshot 10,54 ms im Median. Das beschreibt ausschließlich diese beiden lokalen Lesewege, keine Beschleunigung eines gesamten Modellauftrags. Eine zwischenzeitlich zusätzliche Verlaufskopie bei direkten Kontextanzeigen wurde durch einen eigenen Kontextprojektionsport ersetzt; der Abschlusslauf misst dafür 2,20 ms, sieben Veröffentlichungen und null Speicherzugriffe. Gewöhnliche Aktivitätsereignisse kosten weiterhin rund 41 ms, Gedächtnisabrufe rund 137 ms; die synchrone Datenträgerarbeit bleibt damit ein konkreter Folgeschritt.

Für die nächste Speicherentkopplung stehen damit konkrete Grenzen fest: geordnete Schreibfolge, unveränderliche Generationsstände, bestätigte dauerhafte Annahme vor externer Arbeit, Fehlerweitergabe, unveränderte Recovery-/Backupregeln sowie unterbrochene gewöhnliche Checkpoints während Stopp. Das Journal allein lagert keine Datenträgerarbeit aus dem Hauptprozess aus. Computer-Beobachtung und die weitere UI-Aufteilung bleiben eigene Lieferteile; Abschnitt A ist weiterhin nicht insgesamt abgeschlossen.

## Fünfter umgesetzter Abschnitt

### Geordneter Verlaufsspeicher außerhalb des Hauptprozesses

Der [WorkerStateStore](../src/main/platform/persistence/worker-state-store.ts) übernimmt unveränderliche Stände über einen geprüften Nachrichtenvertrag. Ein eigener [Speicher-Worker](../src/main/state-worker.ts) führt die vorhandene Zustandsvalidierung, Bereinigung, JSON-Erzeugung, Backupprüfung, atomare Dateiablage und `fsync` aus. Er verwendet denselben StateStore und dasselbe Dateiformat. Das initiale Laden samt Wiederherstellung bleibt vor dem Fensterstart synchron; Gedächtnis- und Zugangsspeicher wurden nicht ausgelagert.

Das Journal begrenzt die Folge auf einen aktiven Schreibvorgang. Gewöhnliche Checkpoints werden über 25 ms auf den letzten Stand verdichtet und unabhängig davon sofort angezeigt. Dauerhafte Barrieren bleiben FIFO und werden vor Agentenaufruf, Worker-Erzeugung oder Auftragsänderung abgewartet. Die Initialisierung und Vollzugriffsbestätigung besitzen ebenfalls eine bestätigte Barriere. Gleiche ausstehende Anfragen teilen ihr Ergebnis; wartende Annahmen und Änderungen reservieren ihre Ressourcen gegenüber späteren widersprüchlichen Aufträgen.

Scheitert ein Schreibvorgang, werden davon abhängige, noch nicht begonnene Barrieren verworfen. Nach den synchronen Fachrollbacks wird frühestens im nächsten Ereignisschleifendurchlauf ein frischer Checkpoint aufgenommen. Ein späterer eigener Versuch kann wieder speichern; alte spekulative Stände werden nicht wiederverwendet. Ein Workerabsturz, Protokollfehler oder Timeout sperrt den betroffenen Adapter ohne automatisches Wiederholen unbestätigter Schreibaufträge.

Stopp invalidiert ausstehende Annahmen und Änderungen sofort, beendet Prozesse und wartet auf keinen Schreibzugriff. Spätere Bestätigungen können keine gestoppte Arbeit starten. Nie bestätigte Gesprächsnachrichten werden auch beim Stopp nicht als Gedächtnisquellen archiviert. Beim App-Ende werden zuerst Prozesse beendet und erst anschließend ausstehende Rollbacks und der letzte dauerhafte Zustand abgewartet. Nicht bestätigtes Speichern oder Threadende verhindert den erfolgreichen Abschluss; ein ausdrücklicher erneuter Schließversuch kann ein inzwischen bestätigtes Ende erkennen.

### Prüfung und verbleibende Arbeit

Kontrolliert verzögerte Schreibzugriffe prüfen Annahme, Running-Übergang, Änderungen, Einwilligung, Duplikate, Fehlerrollback und Shutdown. Echte Workerprüfungen decken Datensicherung, ungültige Stände, Absturz, Timeout und erneutes Schließen ab. [test:storage-ui](../scripts/async-storage-ui-check.mjs) blockiert den echten Worker in einer privaten App-Kopie: UI und Stopp reagieren währenddessen, kein Modellaufruf startet vor oder nach der verspäteten Bestätigung, und der unterbrochene Verlauf bleibt beim Neustart erhalten. Dies verwendet ausschließlich synthetische Profile und einen lokalen HTTP-Endpunkt.

Der erweiterte synthetische Benchmark unterscheidet Hauptprozessarbeit und vollständige Schreibbestätigung. Bei fünf fertigen Jobs und je 1.000 Zeichen pro Nachricht wurden lokal folgende Mediane gemessen:

| Operation | 100 Nachrichten | 1.000 Nachrichten |
| --- | --- | --- |
| Controller-Aktivitätsereignis vor diesem Umbau (`e61cf96`) | 14,15 ms | 40,87 ms |
| Controller-Aktivitätsereignis mit Worker und Bündelung | 0,80 ms | 5,99 ms |
| Übergabe eines Stands an den Worker im Hauptprozess | 0,22 ms | 1,16 ms |
| Vollständige dauerhafte Bestätigung des Worker-Schreibens | 12,80 ms | 35,13 ms |

Drei Aktivitätsereignisse erzeugten jeweils drei Veröffentlichungen und einen gebündelten Schreibzugriff. Die Controllerzeit enthält weiter die unveränderliche Zustandskopie und UI-Projektion; die Übergabezeit misst separat `WorkerStateStore.commit`. Die Datenträgerbestätigung bleibt für Annahmen verbindlich. Ein `setImmediate` nach dem Worker-Aufruf war bei 1.000 Nachrichten nach 1,18 ms erreichbar. Das Gedächtnis blieb synchron und benötigte im gleichen Lauf rund 122 ms pro Abruf einschließlich Nachweis. Dies ist keine Messung vollständiger Modellaufträge oder allgemeine Latenzzusage: drei Datenträgerproben, warmer Cache und mögliche Hintergrundlast begrenzen die Aussage. Die vorherigen Rohdaten liegen lokal unter `artifacts/openhiatus-speicher-baseline-vor-async.json`, die aktuellen unter `artifacts/openhiatus-speicher-baseline.json`.

Die vollständigen Check- und UI-Ergebnisse stehen im [Testprotokoll](openhiatus-testprotokoll.md). Computer-Beobachtung, weitere UI-Aufteilung und synchrone Gedächtnisarbeit bleiben eigene Lieferteile; Abschnitt A ist weiterhin nicht insgesamt abgeschlossen. Für diesen Abschnitt wird kein neues Windows-Paket ausgeliefert.

## Sechster umgesetzter Abschnitt

Der [WorkerMemoryStore](../src/main/platform/persistence/worker-memory-store.ts) bindet den vollständigen vorhandenen MemoryStore über einen geprüften, korrelierten Vertrag an. Sein eigener [Worker](../src/main/memory-worker.ts) besitzt Laden und Wiederherstellung, Zustandsvalidierung, Such- und Abrufarbeit, Zusammenfassungsquellen sowie die atomare Dateiablage einschließlich Backup und `fsync`. Dateiformat, Versionsfolge, Korrekturvorrang und Schutz vor externen Dateiänderungen bleiben erhalten. Im Hauptprozess liegen ausschließlich die bestätigten aktuellen Inhalte und Versionen von Identität/Kern als kleine unabhängige Sicht. Der Zugangsspeicher bleibt synchron.

Alle Fachports für Gedächtniszugriffe können jetzt auf Antworten warten. Gespräch, direkter Pfad und Hintergrundaufträge prüfen nach dem Warten ihre Generation und ihren aktiven Turn. Ein verspäteter Abruf darf keine gestoppte Arbeit starten oder fortsetzen. Die für den Auftrag eingefrorenen Kernvorgaben werden getrennt von historischen Abrufen übergeben; der Auftragsabruf dupliziert deshalb keine später geänderten Vorgaben. Archivierung übernimmt vor dem ersten Warten eine eigene Nachrichtensicht und erhält deren Gesprächszuordnung. Quellen werden vor darauf verweisenden Vorschlägen gespeichert.

Nutzerbearbeitungen und Freigaben bestätigen die dauerhafte Speicherung und aktualisieren erst dann den kleinen Kerncache. Bereits eingereichte Änderungen können während Stopp fertig gespeichert werden; ihre Bestätigung ist keine neue Agentenarbeit. Gedächtnisberichte reservieren ihre Lebensdauer vor asynchronem Capture beziehungsweise Planung. Stopp invalidiert sie sofort; nach jedem Speicher-Await wird vor weiteren Modellaufrufen oder Änderungen erneut geprüft. Beim App-Ende werden zuerst die Prozesse beendet und danach Gedächtnispipelines und Speicher-Worker geleert. Absturz oder Timeout sperrt den betroffenen Adapter ohne automatisches Replay.

Der [Gedächtnisspeicher-UI-Test](../scripts/memory-storage-ui-check.mjs) hält den echten Worker in einer privaten App-Kopie gezielt vor Edit und Abruf an. UI und Stopp bleiben erreichbar, ein Edit wird erst nach Dateiablage bestätigt, und die verspätete Antwort auf einen gestoppten Auftrag startet kein Modell. Nach Neustart bleiben Nutzeränderung, Unicode, Version und unterbrochener Verlauf erhalten. Auch das native Schließen hält das Hauptfenster bis zum bestätigten Abschluss offen. Weitere Tests prüfen verzögerte Quellenübernahme, Berichtsplanung, Eingaben und Freigaben sowie bestehende Sicherungs- und Recoveryregeln.

Private Worker-Nachrichten und Antworten werden nach Methode geprüft. Bekannte Zugangswerte dienen nur der Textschwärzung und werden nicht gespeichert. Die Ausgabeprüfung und aktuelle Schwärzung von Textfeldern bleiben im Hauptprozess. IDs, Enumerationen, Prüfsummen, Zeitstempel und Cursor werden dabei erhalten. Seitenoffset und Gesamtbytes beziehen sich auf die Worker-Quellansicht; eine zusätzliche Schwärzung bei der Ausgabe kann deren sichtbare Textlänge ändern. Neue für den Inhalt relevante Zugangswerte machen einen bestehenden Lesecursor weiterhin durch den normalen Inhaltsvergleich ungültig.

Der [Speicherbenchmark](../scripts/storage-baseline.ts) verwendet weiterhin 100 beziehungsweise 1.000 synthetische Nachrichten zu je 1.000 Zeichen und fünf fertige Jobs. Die synchrone Referenz und der Worker werden im selben Lauf mit getrennten Dateikopien gemessen:

| Operation | 100 Nachrichten | 1.000 Nachrichten |
| --- | --- | --- |
| Synchroner Gedächtnisabruf einschließlich Abrufnachweis | 24,29 ms | 161,06 ms |
| Übergabe des Abrufs im Hauptprozess | 0,13 ms | 0,06 ms |
| Vollständige Workerantwort einschließlich Abrufnachweis | 32,88 ms | 172,56 ms |
| Übergabe unveränderter Nachrichten zur Archivierung | 0,17 ms | 1,19 ms |
| Lesen des bestätigten kleinen Kerncaches | 0,008 ms | 0,006 ms |

Beim großen Workerabruf wurde ein vorgemerkter `setImmediate` nach 0,074 ms erreicht. Die vollständige Operation bleibt mit rund 173 ms vergleichbar teuer; ihr Hauptprozess muss diese Speicherarbeit währenddessen nicht ausführen. Alle Bestätigungszeiten enthalten auch Nachrichtenübertragung und Antwortprüfung. Die Übergabezeit isoliert den Aufruf; sie ist keine Messung der gesamten Hauptprozess-CPU einschließlich späterer Antwortverarbeitung. Drei Datenträgerproben, warmer Cache und nicht isolierte Hintergrundlast erlauben keine allgemeine Latenzzusage oder Aussage über vollständige Modellaufträge. Rohdaten liegen lokal unter `artifacts/openhiatus-speicher-baseline.json`, die vorherige Messung unter `artifacts/openhiatus-speicher-baseline-vor-memory-worker.json`.

Prüfergebnisse und Messgrenzen stehen im [Testprotokoll](openhiatus-testprotokoll.md). Die weitere UI-Aufteilung und der Computer-Beobachtungsvertrag bleiben eigene Lieferteile; Abschnitt A ist weiterhin nicht insgesamt abgeschlossen. Für diesen Abschnitt wird kein neues Windows-Paket ausgeliefert.

## Siebter umgesetzter Abschnitt

### Langlebige UI-Sitzung und eigener Navigationsrahmen

[App.tsx](../src/renderer/App.tsx) ist jetzt die Zusammensetzung der Ansichten. Die [Anwendungssitzung](../src/renderer/features/session/index.ts) besitzt Snapshot-Abonnement, Entwurf und Anfragekennung, Senden, Tastenkürzel, Overlay und die Anbindung der bestehenden Audio-Runtime. Sie lebt oberhalb der Navigation. Die [Navigation](../src/renderer/features/navigation/index.ts) besitzt Rahmen, Seitenleiste und globale Bedienelemente. Die [Gesprächsansicht](../src/renderer/features/conversation/index.ts) besitzt Präsenz, Verlauf, Composer und die optional eingeblendete Aktivitätsanzeige.

Gespräch, Aufgaben, Gedächtnis und Einstellungen bleiben beim Wechsel eingehängt; Skills werden beim ersten Besuch geladen und anschließend erhalten. Dadurch bleiben lokale Auswahl, Entwurf, ungespeicherte Eingaben und der Audiozustand erhalten. Eine laufende Audioaktion ist auch außerhalb des Gesprächs sichtbar und abbrechbar. Der Gesprächsmodusstreifen erscheint nur im Gespräch. Desktopvorschau und globaler Stopp behalten ihre gemeinsame Lebensdauer im Rahmen. Navigation erzeugt keine Modellanfrage und setzt keine laufende Arbeit zurück.

Ein eigener UI-Operationsbesitzer reserviert Senden und Gesprächsreset synchron. Stopp invalidiert deren spätere Erfolge, Fehler und Abschlussaktionen; sie dürfen danach weder den Entwurf löschen noch Signaltöne, Hinweise oder Navigation verändern. Ein neuer Versand bleibt von einer alten Bestätigung unabhängig. Fehlgeschlagene Wiederholungen behalten ihre Anfragekennung; nach Stopp erhält derselbe Text eine neue Kennung. Dies verändert keine bereits ausgeführten Backendaktionen.

### Aufgaben, Einstellungen und Dienstvorbereitung

Die [Aufgabenansicht](../src/renderer/features/tasks/index.ts) bietet alle gespeicherten Aufgaben, Statusfilter, stabile Auswahl, Ergebnis und Fehler, Ressourcen und Verbrauch sowie Einzelstopp. Liste und Detailansicht teilen eine synchrone Sperre gegen doppelte Stoppanfragen. Beendete Ergebnisse mit noch offener Laufzeit bleiben als aktiv stoppbar. Der gespeicherte Auftragskontext steht in einer geschlossenen Detailsektion; er wird nicht als ursprünglicher Nutzersatz ausgegeben. Ein Statuswechsel darf die gerade gelesene Aufgabe nicht verschwinden lassen.

Die [Einstellungen](../src/renderer/features/settings/index.ts) trennen Modelle/Zugänge, Sprache/Geräte und Bedienung. Die bestehende Provider- und ChatGPT-Anmeldung bleibt erhalten. Tastaturbedienbare Register und lokal gehaltene Eingabefelder überleben die Navigation. Der [Dienstbereich](../src/renderer/features/services/index.ts) beschreibt den noch nicht implementierten Umfang ausdrücklich; es gibt keine scheinbare Gmail-Anmeldung. Die eigenen CSS-Einstiege heißen `index.css`; private Featuredateien bleiben durch die Importprüfung geschützt.

Der [IPC-Integrationstest](../scripts/ipc-boundary-check.mjs) hält zwei echte Worker an lokalen Modellantworten an und wechselt durch alle Ansichten. Entwurf, Aufgaben, Filter und Auswahl bleiben erhalten; die Anzahl der Modellaufrufe bleibt gleich. Ein Klick auf den Einzelstopp unterbricht nur die ausgewählte Aufgabe, die zweite schreibt und prüft ihre UTF-8-Datei. [UI-Smoke](../scripts/ui-smoke.mjs) prüft zusätzlich ungespeicherte Zugangsfelder, Registertastatur, synthetische Aufnahme über Navigation hinweg, Escape, kompaktes Fenster und reduzierte Animationen. Die private Testkopie blockiert externe Main-Fetches. Produktionsbuild und Benutzerprofile bleiben davon unberührt.

Der wiederholte Speicher-UI-Test hat außerdem eine vorübergehende Windows-Dateisperre beim atomaren Austausch nachgewiesen: Die unterbrochene Sicht wurde korrekt eingereicht, `rename` jedoch mit `EPERM` abgewiesen. Der Verlaufsspeicher-Worker wiederholt deshalb ausschließlich den Austausch der bereits vollständig geschriebenen und synchronisierten Tempdatei bei `EPERM` oder `EBUSY` unter Windows. Vier kurze Pausen summieren sich auf geplant 150 ms zuzüglich Betriebssystem- und Umbenennungszeit; andere Fehler und eine anhaltende Sperre erreichen weiterhin den Aufrufer. Weder der gesamte Speichervorgang noch Agentenarbeit werden wiederholt. Der synchrone Zugangsspeicher und die Journalreihenfolge bleiben unverändert.

Der Computer-Beobachtungsvertrag, die Übersicht-/Detail-Bildstrategie und reale Dienstadapter bleiben weitere Lieferteile. Abschnitt A ist weiterhin nicht insgesamt abgeschlossen. Dieser Abschnitt liefert Quellcode und Prüfnachweise; das vorhandene Windows-Paket wird nicht ersetzt.

## Achter umgesetzter Abschnitt: experimentelle Computeransichten

Der Beobachtungsvertrag liegt in [computer-views.ts](../src/shared/computer-views.ts). Die reine [Geometrie](../src/main/computer-views.ts), [Bildaufbereitung](../src/main/computer-images.ts), [Bereichsauswahl](../src/main/computer-regions.ts) und [Beobachtungsverwaltung](../src/main/computer-observations.ts) sind getrennte Bausteine. Der Bild-Port ist injizierbar; Electron wird erst vom konkreten Bildadapter geladen. Der [Werkzeugvertrag](../src/main/computer-input.ts) ist aus dem nativen Adapter herausgezogen. Weder Geometrie noch Selektor kennen Programme, Modellanbieter oder Desktoptreiber.

[NativeComputer](../src/main/computer.ts) hält Desktopbesitz, Warteschlange und Aufnahmegültigkeit. Die Beobachtungsverwaltung ordnet jede Ansicht einem Quellrechteck zu und übersetzt nur gültige aktuelle Punkte. `inspect` schneidet das vorhandene Original zu; es verlängert keine Aufnahme und führt keine Eingabe aus. Stop invalidiert die Ansichten sofort und bestätigt weiterhin erst nach ausstehender Arbeit und Treiberfreigabe. Geometrie- und DPI-Wechsel verwerfen die bisherigen Auswahlkoordinaten.

Der [Computerbeitrag](../src/main/platform/tools/computer-tools.ts) liefert dieselben Übersicht-/Detailbilder an Modell und Vorschau. Der [Anbieter-Hook](../src/main/computer-image-payload.ts) ändert ausschließlich markierte Bilder der zugeordneten Werkzeugantwort für bekannte OpenAI-Responses-Modelle. Der Pi-Transport übernimmt keine Bildgeometrie oder Bereichsauswahl. IPC validiert und projiziert die optionalen V2-Daten; alte Vollbildantworten bleiben gültig. Die Einstellung wird persistent gespeichert und beim Erwerb des Desktops eingefroren.

Die erste Version verarbeitet Bilder synchron und begrenzt die Detailfläche. Die Ports erlauben eine spätere Auslagerung, falls Messungen dies begründen. Vollbild bleibt Standard. Synthetische Prüfungen ersetzen weder native Eingabeabnahme noch vollständige Aufgabenvergleiche. Diese offenen Arbeiten stehen im [Computer-Use-Plan](computer-use-uebersicht-und-detail-plan.md); reale Dienstadapter bleiben ein eigener Lieferteil. Es wird noch kein neues Windows-Paket ausgeliefert.

## Ergänzung vom 25. Oktober 2026: sichtbarer Desktopbesitz und Eingabesicherung

Der [Desktopkoordinator](../src/main/desktop-coordinator.ts) veröffentlicht den flüchtigen Zustand seiner tatsächlichen Lease: frei, Vorbereitung, aktiv, Stopp und Fehler. Der Controller projiziert ihn in den validierten UI-Snapshot, ohne ihn zu speichern. Die Statusleiste und das obligatorische [Übernahmefenster](../src/main/desktop-control-overlay.ts) verwenden gemeinsame Texte; die optionale Hintergrundanzeige wird während der Übernahme unterdrückt. Beobachtende Bildschirmhilfe erwirbt diese Lease nicht.

[NativeComputer](../src/main/computer.ts) wartet vor dem Treiberstart auf die bestätigte [Eingabesicherung](../src/main/desktop-protection.ts). Der Port wird im Main-Einstieg sowohl für direkte Computerwerkzeuge als auch für das delegierte Computermodell gebunden. Ein eigenständiger [Windows-Helfer](../src/main/openhiatus-input-guard.cs) filtert physische Eingaben und meldet Esc sowie registrierte Sprachkurzbefehle über ein inhaltsfreies Protokoll. Sein eigener Watchdog gibt menschliche Eingaben auch bei einem hängenden Hauptprozess frei. Fehlgeschlagenes Treiberende behält den Agentenbesitz bis zur bestätigten Bereinigung, verhindert aber nicht die Freigabe menschlicher Eingaben. Ablauf, Grenzen und Prüfungen stehen im [Desktopvertrag](desktop-control.md).

## Ergänzung vom 25. Oktober 2026: Windows-Autostart

[WindowsAutostart](../src/main/windows-autostart.ts) kapselt Electrons Login-Item-API als gerätebezogenen Plattformdienst. Der IPC-Vertrag erlaubt nur Lesen und eine boolesche Änderung; Name, Programmpfad und Startparameter bestimmt der Hauptprozess. Die Oberfläche liest den tatsächlichen Windows-Zustand bei geöffnetem Bedienungstab und erneutem Fensterfokus. Es gibt keine zweite persistierte Autostart-Präferenz, die eine externe Deaktivierung überschreiben könnte. Entwicklungsstarts und separate Datenprofile verändern den regulären Login-Eintrag nicht. Der feste Parameter `--autostart` steuert ausschließlich den minimierten Start; ein normaler Zweitstart öffnet weiterhin die bestehende Instanz.

## Ergänzung vom 25. Oktober 2026: Gemeinsamer Arbeitsverlauf

[WorkHistory](../src/main/modules/work-history/index.ts) führt Gesprächsaufträge, den direkten Agentenpfad und delegierte Hintergrundaufgaben in einer gemeinsamen Datenprojektion zusammen. Gesprächs- und Aufgabenkoordinatoren behalten ihre Ausführungszuständigkeit. Ihre Projektionen liefern Nachrichten, die konkrete Antwortkennung und Aufgabenstände an den Verlauf. Eine Hintergrundaufgabe speichert die ursprüngliche Anfragekennung; die Oberfläche berechnet den Stand des übergeordneten Auftrags einschließlich seiner Teilaufgaben.

Die [gemeinsamen Datentypen](../src/shared/work-history.ts) enthalten Auftrag, Gesprächszuordnung, Zeitpunkte, aktuellen Ergebnistext, Ressourcen und Werkzeugaktionen. Der Pi-Host meldet Werkzeugstart und -ende mit einer pro Lauf eindeutigen Aufrufkennung. Auch delegierte Computeraktionen werden weitergereicht. Erfolgreicher Werkzeugabschluss, Werkzeugfehler und unbestätigter Abbruch bleiben getrennt; die Daten behaupten keine unabhängige Prüfung eines gewünschten Arbeitsergebnisses. Für bekannte Werkzeuge werden begrenzte Zielangaben erfasst, jedoch keine vollständigen Werkzeugantworten, Bilddaten oder eingegebenen Textinhalte. Geheimnisse werden vor der Ablage und erneut bei der Projektion bereinigt.

Der Verlauf wird zusammen mit Nachrichten und Aufgaben über die bestehende dauerhafte Annahmebarriere und den Speicher-Worker in `state.json` geschrieben. Fehlgeschlagene Annahmen entfernen auch ihre vorläufigen Verlaufseinträge. Ein neues Gespräch erhält die vorherigen Einträge; Neustart markiert noch laufende Arbeit und unbestätigte Aktionen als unterbrochen, ohne sie auszuführen. Die bisherigen Größenbegrenzungen des Verlaufsspeichers gelten weiterhin. Alte Hintergrundaufgaben liefern ihre vorhandenen Ergebnisse, aber keine erfundenen früheren Werkzeugaktionen.

Die Aufgabenansicht ergänzt einen gemeinsamen Arbeitsverlauf mit Teilaufgaben, Ergebnistext und Werkzeugschritten. Die bestehende Hintergrundansicht behält Einzelstopp und Verbrauchsanzeige. Dieser erste Abschnitt ersetzt noch keinen Gedächtnisabruf: Automatische Themenzusammenführung mehrerer Anfragen, strukturierte Entscheidungsextraktion, Sitzungsübergaben und zeitliche Aufbewahrungsregeln sind weitere Arbeiten. Gesprächsinhalte werden ohne zusätzliche Modellaufrufe erfasst. [Prüfnachweise](openhiatus-testprotokoll.md) und [Bedienung](../README.md) beschreiben den gelieferten Umfang.

## Ergänzung vom 26. Oktober 2026: Geführte Einrichtung

Das Renderer-Feature [onboarding](../src/renderer/features/onboarding/index.ts) führt durch Zustimmung, freiwillige Identität, Konto, freiwillige Sprache und Antwortprüfung. Es nutzt die bestehenden Anmelde-, Anbieter-, Identitäts- und Audiozugänge. Der versionierte Fortschritt wird strikt an IPC- und Speichergrenze geprüft; ein Schrittwechsel wartet auf die dauerhafte Speicherung und setzt den Fortschritt bei Schreibfehlern zurück. Version 2 übernimmt abgeschlossene ältere Einrichtungen ohne erneuten Einrichtungszwang; unvollständige ältere Einrichtungen bieten den neuen freiwilligen Identitätsschritt an. Das Öffnen über Einstellungen beginnt stets am Anfang, Fortsetzen übernimmt den gespeicherten Schritt. Die Übersicht erlaubt direkte Sprünge. Die Navigation behält ihre langlebige Sitzung und den globalen Stopp.

Die Identitätsfelder bearbeiten ausgewählte Zeilen bzw. gekennzeichnete Ergänzungen in `IDENTITY.md`, `USER.md` und `SOUL.md`; sonstiger Inhalt bleibt erhalten. Vor dem Speichern werden alle betroffenen Versionen geprüft; jede Datei nutzt danach zusätzlich die bestehende Versionssperre von `editMemory`. Die drei Dateien bilden keine gemeinsame Transaktion: bestätigte Einzeländerungen bleiben bei einem späteren Schreibfehler erhalten, der Entwurf bleibt sichtbar, und ein Wiederholungsversuch schreibt nur die verbleibenden Änderungen. Ein Fehler verhindert den Schrittwechsel. Der Antworttest bleibt ohne Identitätskontext; die Angaben gelten ab dem nächsten normalen Gespräch. Die sichtbare Modellwahl ändert ausschließlich das Gesprächsmodell und verwirft vorherige Testergebnisse.

`checkSetup` bindet eine feste, kontextfreie Begrüßungsanfrage an den vorhandenen werkzeuglosen Modellclient. Der Renderer kann weder einen freien Prompt noch weitere Daten mitgeben. Stopp und ein Zeitlimit von 30 Sekunden brechen die Prüfung ab; auch ein Modellclient, der das Signal ignoriert, kann danach keinen Erfolg zurückgeben. Eine geänderte Modellauswahl oder Arbeitsrevision macht eine ausstehende Antwort ungültig. Die Prüfung erzeugt keinen Arbeitsauftrag und bestätigt ausschließlich die Textverbindung. Technische Fehler bleiben unter einer verständlichen, lokalisierten Anleitung aufklappbar.

## Ergänzung vom 25. Oktober 2026: Windows-Setup

[installer.mjs](../scripts/installer.mjs) verpackt den selbständigen Electron-Paketordner mit [Inno Setup](../resources/windows-installer.iss). Der Compiler wird versions- und hashgebunden portabel im ignorierten Buildverzeichnis bereitgestellt. Setup arbeitet pro Windows-Benutzer unter einem stabilen Programmpfad; Profildaten bleiben außerhalb des Installationsbesitzes. Startmenü, optionales Desktop-Symbol und Deinstallationsregistrierung gehören Setup. Die Anwendung behält die Zuständigkeit für Modellzugänge, Profilmigration und freiwilligen Autostart.

Vor Austausch oder Deinstallation muss die ausführbare App exklusiv geöffnet werden können; Setup beendet keine laufenden Arbeitsprozesse. Updates behalten die Windows-Startregistrierung bei. Die Deinstallation löscht sie nur bei einem exakten Verweis auf die eigene Programmkopie. Eine mitgelieferte Dateiliste ermöglicht das Entfernen veralteter Paketdateien; die Bereinigung akzeptiert nur relative Pfade innerhalb des Installationsordners ohne Reparse Points. Das [Installationsprotokoll und die Benutzeranleitung](windows-installation.md) beschreiben Prüfungen und Grenzen. Signierung, automatische Updateverteilung und frische Windows-VMs sind noch kein Bestandteil dieser Lieferung.
