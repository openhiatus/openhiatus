# openHiatus – Produkt- und Umsetzungsplan

> Historische Referenz: Gesamtplan vom 22. Oktober 2026 mit Schwerpunkt auf persönlichen Diensten und Gmail als erster Integration. Der aktuelle Plan steht im [Gesamtplan](../gesamtplan.md).


Stand: 22. Oktober 2026. Technischer Ausgangspunkt: Version 0.1.4. Dieses Dokument plant den Ausbau; es erklärt neue Funktionen nicht bereits für implementiert.

## Richtung und Dokumentation

openHiatus wird als persönlicher Desktop-Assistent weiterentwickelt: ansprechbar, im Hintergrund arbeitsfähig, mit verständlicher Oberfläche, allgemeiner Computersteuerung und optional angebundenen Diensten. Der aktuelle Quellstand wird als Alpha auf GitHub veröffentlicht und anschließend öffentlich weiterentwickelt. Die folgenden Ausbau- und Paketabnahmen begleiten diese Entwicklung.

Die Dokumente haben getrennte Aufgaben:

| Dokument | Aufgabe |
| --- | --- |
| [Vision](../vision.md) | Produktrichtung und Leitentscheidungen |
| Dieser Gesamtplan | Gemeinsame Architektur, Lieferabschnitte und Abnahme |
| [Architekturprüfung und Zielstruktur](../architekturpruefung.md) | Belegte Bestandsaufnahme, Modulgrenzen und schrittweise Entkopplung vor dem Ausbau |
| [Roadmap](../roadmap.md) | Kurzer Überblick über aktuellen Stand und nächste Schritte |
| [Computer-Use-Plan](../computer-use-uebersicht-und-detail-plan.md) | Detaillierter Versuchs- und Implementierungsplan für Bilder, Bereichsauswahl und Koordinaten |
| [Entwicklungsplan](../entwicklungsplan.md) | Technische openHiatus-Migration und ihre Grundentscheidungen |
| [Testprotokoll](../openhiatus-testprotokoll.md) | Tatsächlich geprüfter Stand und Prüfgrenzen |

Frühere openHiatus-Pläne bleiben historische Referenzen. Für neue Umsetzung gelten die aktuelle Vision, dieser Plan und die nachgewiesenen openHiatus-Verträge.

## Vorhandene Grundlage

openHiatus besitzt bereits Electron/React mit TypeScript, die isolierte Pi-Laufzeit, mehrere Modellanbieter einschließlich offizieller ChatGPT-Anmeldung, Inworld-Sprache, Gedächtnis mit Quellen und Versionen, Skills, zwei geordnete Hintergrundworker und native Windows-Desktopsteuerung. Profil und Laufzeit sind von älteren Installationen getrennt. Diese Grundlage wird weiterentwickelt.

Skills werden lokal im Benutzerprofil gepflegt. Eine Skill-Sammlung ist nicht Bestandteil des öffentlichen Repositorys oder der Windows-Pakete; eine automatische Skill-Installation oder -Migration findet nicht statt.

Der aktuelle Quellcode trennt Gespräch, Aufgaben, Dienste, Gedächtnis, Skills und Einstellungen. Aufgaben haben eine eigene Ergebnisansicht; Einstellungen trennen Modelle/Zugänge, Sprache/Geräte und Bedienung. Die Windows-Auslieferung dieses UI-Stands wird als Version 0.1.5 unter dem Anzeigenamen openHiatus neu gebaut und separat abgenommen. Der technische Slug und das Profil bleiben `openhiatus`. Es gibt noch keine allgemeine Verwaltung persönlicher Dienstkonten wie Gmail; die Dienstansicht kennzeichnet dies als Vorbereitung. Die neue Bildstrategie ist ebenfalls noch ein Plan.

Bestehende Prüfungen ersetzen keine neue Abnahme der folgenden Änderungen. Bereits funktionierende Anmeldung, Sprache, Auftragsannahme, Stopp, Sitzungsfortsetzung, Gedächtnis und persönliche Projektlisten müssen erhalten bleiben.

## Architektur als eigener Lieferabschnitt

Die [Prüfung des aktuellen Codes](../architekturpruefung.md) zeigt vorhandene Prozess- und Adaptergrenzen, aber eine starke Bündelung der Anwendungslogik in `AppController` und `App.tsx`. Diese Struktur wird vor dem Ausbau der betroffenen Stellen verbindlich weiterentwickelt. Das Projekt braucht für seinen vorgesehenen Umfang eigene Fachmodule, öffentliche Schnittstellen und automatisch geprüfte Abhängigkeitsregeln.

Gespräch, Aufgaben, Gedächtnis, Audio, Modelle, Skills, Computersteuerung und Dienste erhalten eindeutige Zuständigkeiten. Der Appstart setzt die Module zusammen; die Oberfläche verwendet typisierte, zur Laufzeit geprüfte Feature-IPC. Agentenlaufzeit, Betriebssystem und Speicherung bleiben konkrete Adapter. Fachzustand, gespeicherte Daten und UI-Daten werden bewusst getrennt. Neue Dienste werden über gebundene Werkzeuge angebunden, statt weitere Spezialfälle in Controller oder Pi-Transport einzubauen.

Die Entkopplung erfolgt in lauffähigen Schritten mit den vorhandenen Verhaltenstests. Zuerst werden Gesprächs-/Auftragskoordination und langlebige UI-/Audioabläufe entlastet. Vor Gmail muss der allgemeine Dienst- und Werkzeugvertrag stehen; vor der neuen Bildstrategie deren eigener Beobachtungs- und Geometrievertrag. Synchrone Speicherarbeit und vollständige Zustandsveröffentlichungen werden gemessen und bei Bedarf entkoppelt, ohne die dauerhafte Auftragsannahme oder den Stopp zu schwächen.

Erster umgesetzter Abschnitt: Das Gesprächsmodul besitzt jetzt Dialogzustand, Warteschlange, Delegation und Stopp. Die langlebige Audio-Runtime besitzt Aufnahme, Wiedergabe, Sprachwarteschlange und Freigabe über injizierte Browserfähigkeiten. Automatische Importregeln prüfen diese Grenzen. Die Desktopfreigabe am Turn-Ende ist von erhaltenen Hintergrundprozessen getrennt. Die übrigen Verträge aus Abschnitt A werden anschließend ergänzt; dieser erste Schritt erklärt die gesamte Architekturgrundlage noch nicht für fertig. Details und nächste Extraktionen stehen in der [Architekturprüfung](../architekturpruefung.md#erster-umgesetzter-abschnitt).

Zweiter umgesetzter Abschnitt: Gedächtnisberichte besitzen einen eigenen Koordinator. Eine allgemeine Werkzeugregistrierung bindet Definitionen, geprüfte Handler und Rollen je Lauf; Desktop ist ein konkreter Beitrag außerhalb von Pi. Der Dienstbroker bindet Leseoperationen an Konto und Auftrag und behandelt Rechtewechsel, Abbruch und begrenzte Ergebnisse. Zwei synthetische Diensttypen prüfen die gemeinsame Schnittstelle. Ein echter Gmail-Adapter und dessen Anmeldung sind noch nicht implementiert. Der [aktuelle Architekturstand](../architekturpruefung.md#zweiter-umgesetzter-abschnitt) grenzt diesen Umfang von den folgenden Arbeiten ab.

Dritter umgesetzter Abschnitt: Feature-IPC koppelt Befehlsnamen an ihre Argumente und Ergebnisse und prüft die übertragenen Daten zur Laufzeit. Ein eigenes Auftragsmodul besitzt Jobdaten, Annahmekontext, Worker-Lebensdauer, Archivfortsetzungen sowie Ergebnis- und Sprachzuordnung. Electron behält die Prüfung des zulässigen Fensters, Frames und der Renderer-URL. [Details und verbleibende Arbeiten](../architekturpruefung.md#dritter-umgesetzter-abschnitt).

Vierter umgesetzter Abschnitt: Modell-/Providerkoordination und der direkte Aufgabenpfad besitzen eigene Zustände und Lebensdauern. Die interne Host-Grenze prüft Befehle, Ereignisse sowie zu Anfragen gehörende Antworten. Das Zustandsjournal unterscheidet dauerhafte Barrieren, Checkpoints und reine Veröffentlichung; die Speicheradapter schreiben vorerst weiterhin synchron. Der kleine Identitäts-/Kernleseport vermeidet vollständige Archivsnapshots an diesen Stellen. Ein synthetischer Benchmark macht den weiteren Speicheraufwand reproduzierbar. [Umfang und Messgrenzen](../architekturpruefung.md#vierter-umgesetzter-abschnitt).

Fünfter umgesetzter Abschnitt: Der Verlaufsspeicher schreibt über einen eigenen Worker mit geordneten Bestätigungen. Gewöhnliche Speicherstände werden gebündelt; Auftragsannahme, Änderungen und Start warten auf ihre dauerhafte Barriere. Stopp bleibt unabhängig vom Datenträger. Fehlgeschlagene Annahmen können weder durch alte wartende Speicherstände noch als Gedächtnisquellen wieder auftauchen. Ein echter UI-Test mit blockiertem Speicher und Neustart belegt diese Reihenfolge. Gedächtnis- und Zugangsspeicher bleiben synchron. [Umfang und Messgrenzen](../architekturpruefung.md#fünfter-umgesetzter-abschnitt).

Sechster umgesetzter Abschnitt: Der Gedächtnisspeicher besitzt einen eigenen Worker für Lade-, Such-, Abruf- und Schreibarbeit. Asynchrone Fachports erhalten Quellenzuordnung und Versionsprüfung; nur bestätigte Identität/Kern bleiben im Hauptprozess zwischengespeichert. Stopp invalidiert wartende Abrufe und Berichte, ohne den Speicher abzuwarten. Bereits eingereichte Nutzeränderungen werden nach erfolgreicher Dateiablage bestätigt. [Umfang und Messgrenzen](../architekturpruefung.md#sechster-umgesetzter-abschnitt).

Siebter umgesetzter Abschnitt: Die langlebige UI-Sitzung hält Snapshot, Entwurf, Senden, Hotkeys und Audioanbindung oberhalb der Ansichten. Ein eigener Navigationsrahmen verbindet die sechs Bereiche. Aufgaben besitzen Filter, Ergebnisdetails und Einzelstopp; Einstellungen besitzen getrennte Register. Navigation erhält laufende Arbeit, Audio und lokale Eingaben. Dienste bleiben ausdrücklich als Vorbereitung gekennzeichnet. [Umfang und Prüfnachweise](../architekturpruefung.md#siebter-umgesetzter-abschnitt).

## Produktziele und Beispielabläufe

Die nächsten Lieferabschnitte sollen drei zusammenhängende Abläufe tragen:

1. Einen Auftrag sprechen oder schreiben, während der Bearbeitung weiterreden, das Ergebnis in der Aufgabenansicht wiederfinden und den Verlauf nach Neustart behalten.
2. Ein beliebiges sichtbares Windows-Programm anhand aktueller Bilder bedienen, mit nachvollziehbaren Ansichten und richtig übersetzten Eingabekoordinaten.
3. Gmail gezielt nach einem Thema durchsuchen, relevante Nachrichten lesen und eine Antwort vorbereiten. Tatsächlicher Versand folgt als eigene Fähigkeit und benötigt einen entsprechenden Nutzerauftrag.

Ein Dienst kann über seine API eine Aufgabe direkter erledigen als über Mausklicks. Allgemeine Desktopsteuerung bleibt für die übrigen Oberflächenabläufe erhalten. Beide Wege verwenden dieselbe Auftragsverwaltung und dieselben Ergebniszustände.

## Neue Oberfläche

### Informationsarchitektur

Als Arbeitsannahme dient ein ruhiger Gesprächseinstieg mit einer bei Bedarf erreichbaren Arbeitsansicht. Die konkrete visuelle Richtung wird anhand eines kleinen Prototyps festgelegt. Die bisherige Sprachbedienung bleibt ein Hauptweg; Schreiben wird vollständig unterstützt.

| Bereich | Inhalt |
| --- | --- |
| Gespräch | Sprechen, Schreiben, aktueller Austausch, erreichbarer Verlauf und ein kompakter Hinweis auf laufende Arbeit |
| Aufgaben | Vollständige Liste, Statusfilter, Einzelstopp, Auftrag, verständlicher Fortschritt, Ergebnisse und Verbrauch |
| Dienste | Persönliche Konten wie Gmail, verfügbare Fähigkeiten, Verbindungszustand, Anmelden und Trennen |
| Gedächtnis | Berichte, Quellen, Versionen, Identität und persönlicher Kern |
| Skills | Fähigkeiten finden, auswählen, favorisieren und eigene Projektzuordnungen erreichen |
| Einstellungen | Modellanbieter und drei Modellrollen, Sprache und Geräte, Tastenkürzel, Verhalten und Diagnose |

Eine Verbindung zu einem Sprach- oder Modellanbieter wird sprachlich von einem persönlichen Arbeitskonto unterschieden. Der globale Stopp bleibt in allen Ansichten erreichbar. Bildschirmansicht und technische Aktivität werden bei Bedarf geöffnet; sie dominieren nicht den normalen Gesprächseinstieg.

### Responsives UI-Design

Als weiteres Produktziel passen sich alle Ansichten automatisch an Fenstergröße, Seitenverhältnis, Windows-Skalierung und vergrößerte Schrift an. Navigation und Inhalte ordnen sich bei wenig Platz neu; wichtige Aktionen bleiben erreichbar. Die Bedienoberfläche benötigt kein horizontales Scrollen; breite Tabellen oder Codebereiche dürfen innerhalb ihres eigenen Inhaltsbereichs scrollen.

Zur Abnahme gehören kleine und große Fenster, unterschiedliche Skalierungen, lange Inhalte und das Verändern der Fenstergröße im laufenden Betrieb. Dabei bleiben Entwurf, Tastaturfokus, Aufnahme und laufende Aufgaben erhalten. Dies ist ein zusätzliches Ausbauziel; die bisherigen kompakten UI-Prüfungen belegen noch keine vollständige responsive Umsetzung.

### Aufgaben und Ergebnisse

Eine Aufgabe zeigt eindeutig, ob sie wartet, arbeitet, gestoppt wird, abgeschlossen, fehlgeschlagen oder nach Neustart unterbrochen ist. Aktivität bekommt eine Auftragszuordnung. Ergebnisobjekte können Text, Datei oder Dienstressource enthalten und verweisen auf ihre Herkunft.

Für E-Mails bedeutet das beispielsweise Konto, Nachrichten- oder Threadkennung und die passende Quellenansicht. Ein Antwortentwurf erscheint als überprüfbarer Inhalt mit Empfänger, Betreff und Text. Aus einem lediglich vorbereiteten Entwurf entsteht kein automatischer Versand.

Ein Ansichtswechsel erhält Entwurf, Verlauf, Audiozustand und laufende Aufgaben. Ein neuer Bildschirmaufbau darf keine doppelte Auftragsannahme, erneute Anmeldung oder unbemerkte Neuausführung verursachen. Kompakte Fenster, Tastaturfokus, lesbare Kontraste und reduzierte Bewegung gehören zur Abnahme.

### Technische Liefergrenze

Der UI-Umbau trennt App-Rahmen, Gespräch, Aufgaben, Dienste und Einstellungen schrittweise gemäß der festgelegten Modulgrenzen. Gedächtnis und Skills werden weiterverwendet. Die Arbeits- und Audiolebensdauer wird ausdrücklich oberhalb einzelner Ansichten gehalten, damit Navigation keine Ausführung neu startet. Zustand, Nebenwirkungen und Darstellung werden dabei getrennt; neue Ordner allein erfüllen diesen Schritt nicht.

## Computer Use und Geschwindigkeitsforschung

Der [Detailplan](../computer-use-uebersicht-und-detail-plan.md) ist hierfür maßgeblich. Die gemeinsamen Entscheidungen sind:

- Native Auflösung erkennen; keine feste Full-HD- oder 4K-Annahme und keine manuelle Bildschirmkonfiguration.
- Echte Übersichtsfaktoren als Variablen vorbereiten: 1:4, 1:8, 1:16 und 1:32. Die Normierung aller Auflösungen auf dieselbe Bildgröße ist kein beschlossener Standard.
- Den relevanten Originalbereich in 1:1 übertragen. Übersicht, Detail und lokale Analyse haben unabhängige Auflösungsparameter.
- Nach Aktionen lokale Bildänderungen ermitteln und mit bisherigem Bereich, Aktionsdaten und optionalem Hinweis aus der ohnehin laufenden Modellrunde vergleichen.
- Bildkennung, Ansichtskennung, Ausschnittursprung und tatsächliche Abmessungen für jede Eingabe prüfen und umrechnen.
- Vorschau und Modell erhalten dieselben Ansichten. Erfolg wird nicht aus Pixeländerung oder einer ruhigen Darstellung abgeleitet.

Die Bereichsauswahl bleibt ein Experiment mit messbarer Aufgabendauer. Getrennt gemessen werden Aufnahme, Darstellungswartezeit, lokale Analyse, Bildaufbereitung, Modellzeit, zusätzliche Beobachtungen und Korrekturen. Ein schnellerer Einzelaufruf genügt nicht, wenn die Gesamtaufgabe langsamer oder unzuverlässiger wird.

Die erste Umsetzung bleibt beim bereits unterstützten Hauptbildschirm. Das Verfahren wird auf verschiedenen Auflösungen, Formaten und Windows-Skalierungen geprüft. Eine spätere Mehrmonitor-Erweiterung verwendet denselben ausdrücklichen Geometrievertrag.

## Allgemeine Dienstanbindung

### Gemeinsamer Rahmen

Ein eigenes Dienstmodul besitzt Konten, Fähigkeiten, Anmeldungslebensdauer und einen typisierten Adaptervertrag. Die allgemeine Werkzeugregistrierung bindet konkrete Operationen an den jeweiligen Auftrag. Neue Dienste werden anhand konkreter Aufgaben ergänzt. Eine synthetische zweite Integration prüft neben Gmail, ob die gemeinsame Schnittstelle tatsächlich unabhängig vom ersten Anbieter ist.

| Baustein | Zuständigkeit |
| --- | --- |
| Verbindung | Anbieter, stabile Kontozuordnung, öffentlicher Status und tatsächlich gewährte Fähigkeiten |
| Anmeldung | Dienstspezifischer offizieller Ablauf, Abbruch, Erneuerung und Trennen |
| Geschützter Zugangsspeicher | Geheimnisse im privilegierten Anwendungsteil; keine Token in Rendererzuständen, Werkzeugergebnissen oder Prompts |
| Dienstadapter | Typisierte Operationen, begrenzte Ergebnisse, Fortsetzung und eindeutige Ressourcenkennungen |
| Auftragsintegration | Ausführung, Abbruch, Ergebniszuordnung, verständliche Fehler und Schutz vor doppelten Aktionen |
| Dienstansicht | Konto und Fähigkeiten zeigen, Verbindung prüfen, erneut anmelden und entfernen |

Die Fähigkeiten werden aus Verbindung und tatsächlich erteilten Rechten abgeleitet. Der Gesprächsagent bleibt für Gespräch und Delegation zuständig. Dienstarbeit wird an Arbeitsaufträge übergeben; ein verbundener Dienst verleiht dem Gespräch nicht pauschal weitere Werkzeuge.

Die Zugangsdaten bleiben beim Dienstadapter im Hauptprozess. Der Arbeitsagent fordert eine konkrete Operation an und erhält deren Ergebnis. Gemeinsame OAuth-Hilfsfunktionen können wiederverwendet werden; Google- und ChatGPT-Anmeldungen bleiben eigene Protokolle und Konten.

Lesen, Entwurf, Versand und Änderungen sind getrennte Fähigkeiten. Externe Inhalte bleiben Daten und erweitern den Nutzerauftrag nicht. Eine eindeutige bestehende Beauftragung genügt; der Rahmen erfindet keine zusätzliche Bestätigung für bereits konkret autorisierte unveränderte Schritte.

Schreibende Vorgänge benötigen einen dauerhaft erfassten lokalen Auftragsbezug. Wird ihr Ergebnis nach einer Netzwerkunterbrechung unklar, wird der Stand beim Dienst gezielt geprüft. Eine lokale Kennung allein garantiert keine serverseitige Idempotenz. Ein möglicherweise bereits erfolgter Versand wird nicht blind wiederholt.

### Aufnahme weiterer Dienste

Ein Dienst ist ein guter nächster Kandidat, wenn er eine offizielle nutzbare Schnittstelle, einen für Desktop-Apps geeigneten Zugang, klar begrenzbare Fähigkeiten und einen konkreten Alltagsnutzen hat. Ein erfolgreicher Gmail-Adapter soll die gemeinsame Schnittstelle erproben, keine Sonderarchitektur nur für E-Mail erzeugen.

## Gmail als erste vertikale Integration

### Sinnvoller Pilot

Der erste Ablauf lautet: verbinden, gezielt suchen, Nachrichten oder Thread lesen, einen lokalen Antwortentwurf zeigen. Die API stellt Nachrichten, Threads, Entwürfe und Versand als getrennte Operationen bereit. Suche, Paging, Zeichensätze und Anhänge werden anhand der jeweiligen Methodendokumentation implementiert; ein kompletter Mailclient ist nicht das erste Ziel. [Gmail-REST-Referenz](https://developers.google.com/workspace/gmail/api/reference/rest)

Ein lokaler Textentwurf braucht noch keinen Gmail-Schreibzugriff. Das Speichern als Gmail-Entwurf und das Senden werden später ergänzt. Inhalte werden zunächst als sicher dargestellter Text mit Quelle verarbeitet; fremdes Mail-HTML wird nicht als Anwendungscode ausgeführt. Eine dauerhafte Übernahme von E-Mails ins persönliche Gedächtnis ist keine automatische Nebenwirkung des Verbindens.

### Anmeldung und Rechte

Für die Desktop-App ist ein Google-OAuth-Client mit Systembrowser, PKCE und Loopback-Rückleitung vorgesehen. Die Entwicklungsanmeldung benötigt eine eingerichtete Google-Anwendung. Öffentliche Desktop-Clients können kein vertrauliches Client-Secret bewahren. Erweiterte Rechte benötigen einen bewusst erneuerten Anmeldeablauf; Googles Dokumentation unterstützt inkrementelle Autorisierung für installierte Apps nicht. [Google: Desktop-OAuth](https://developers.google.com/identity/protocols/oauth2/native-app)

| Ausbauschritt | Passender Scope | Google-Kategorie |
| --- | --- | --- |
| Nachrichten lesen und lokalen Antworttext vorbereiten | `gmail.readonly` | Restricted |
| Gmail-Entwürfe verwalten | `gmail.compose` | Restricted; umfasst auch Versand |
| Versand ergänzen | `gmail.send`, sofern kein bereits benötigter Scope ihn umfasst | Sensitive |

Die Scope-Namen tragen das Präfix `https://www.googleapis.com/auth/`. Ein gewährter breiterer Scope schaltet nicht automatisch jede technisch mögliche Aktion in openHiatus frei. Die App bietet nur die implementierten und beauftragten Fähigkeiten an. [Google: Gmail-Scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)

### Persönlicher Pilot und öffentliche Auslieferung

Der technische Adapter und eine für beliebige Nutzer bequem nutzbare Anmeldung sind zwei Liefergegenstände. Ein persönlicher Test kann zunächst mit einem eigenen Google-Projekt und Testkonto erfolgen. Das spätere Produktziel bleibt ein Verbinden aus der Oberfläche, ohne dass normale Anwender selbst ein Cloudprojekt anlegen müssen.

Eine öffentliche Integration mit den benötigten Gmail-Rechten muss Googles Verifizierungsanforderungen erfüllen. Bei Restricted-Daten sind auch Serverdatenflüsse für eine mögliche Sicherheitsprüfung maßgeblich. Dazu gehört in unserem Entwurf ausdrücklich ein verwendetes externes KI-Modell: Eine lokale Electron-App bedeutet nicht automatisch ausschließlich lokale Mailverarbeitung. Datenfluss und zulässiger öffentlicher Betrieb werden daher vor der Gmail-Freigabe geprüft. [Google: Restricted-Scope-Verifizierung](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)

Für die öffentliche App werden außerdem passende App-Identität, Kontakt, Homepage und Datenschutzhinweise benötigt. Der veröffentlichte Desktop-Client und dessen Pflege werden bewusst festgelegt; ein Fork mit eigener App-Identität erhält eine dazu passende Registrierung. [Google: Markenverifizierung](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)

Die Dienstansicht muss deshalb persönliche Testverbindung und öffentlich unterstützte Anmeldung korrekt beschreiben. Ein Gmail-Releaseproblem blockiert weder den restlichen Assistenten noch andere unabhängige UI-Arbeit.

## Lieferabschnitte

Die Reihenfolge ist ein Umsetzungsvorschlag mit überprüfbaren Ergebnissen. Die Architekturgrundlage ist Voraussetzung für den Ausbau der jeweiligen Hotspots. Computer-Use-Versuche und Gmail-Machbarkeit können nach den benötigten Modulverträgen unabhängig vorangebracht werden.

| Abschnitt | Konkretes Ergebnis | Fertigkriterium |
| --- | --- | --- |
| A – Architekturgrundlage | Öffentliche Modulverträge und Importregeln, schrittweise Entlastung des Controllers, getrennte UI-/Audio-Runtime, Feature-IPC sowie Werkzeug-/Dienstgrenze | Gespräch, zwei Aufgaben, Audio, Stopp und Neustart bestehen ihre Regressionen; ein synthetischer Dienst lässt sich über die neue Grenze anbinden; die Ziele sind im Code umgesetzt und nicht nur dokumentiert |
| B – UI-Rahmen und Aufgaben | Ruhiges Gespräch, eigene Aufgabenübersicht, Einstellungen und Platz für Dienste | Navigation erhält Entwurf, Verlauf, Audio und zwei laufende Aufträge; Einzelstopp und globaler Stopp haben den belegten Umfang |
| C – Computer-Use-Prototyp | Skalierungsprofile, Originalausschnitt, Koordinatenschicht, lokale Änderungskandidaten und passende Vorschau | Tatsächliche Eingaben stimmen bei unterschiedlichen Auflösungen und DPI; Zeit und Zuverlässigkeit über vollständige Aufgaben sind vergleichbar gemessen |
| D – Dienste und Gmail-Pilot | Gemeinsame Verbindungen, Google-Anmeldung und gezielter Lese-/Entwurfsablauf | Verbindung, Abbruch, Erneuerung, Trennen, Suche, Quellen und lokaler Antwortentwurf sind nachgewiesen; kein Entwurf wird versehentlich gesendet |
| E – Bewährte Abläufe ausbauen | Gewählte Bildstrategie, strukturierte Ergebnisse und bei Bedarf Gmail-Entwurf/Versand | Bestehende Autorisierung, Konto- und Ergebniszuordnung sowie unklarer Versandausgang funktionieren ohne Doppelaktionen |
| F – Öffentliche Vorschauversion | Gepflegtes Repository, reproduzierbares Windows-Paket, Einrichtung und dokumentierte Funktionsgrenzen | Frisches Profil und eigener Zugang auf weiterem Testsystem funktionieren; Lizenz- und Dienstfreigaben passen zum tatsächlich veröffentlichten Umfang |

UI und erster Gmail-Ablauf können mit synthetischen Verbindungen entwickelt werden. Reale Kontozugriffe und die jeweilige Anmeldung gehören anschließend zur ausdrücklich beauftragten Funktionsabnahme, nicht zur Erstellung dieses Plans.

## Weiterer Gesprächsausbau

Die vorhandene Präsenz, Bestätigung und Signaltöne werden erhalten. Aus der bisherigen Vision bleiben optionale Satzendenerkennung, Unterbrechen beim Sprechen, satzweise beziehungsweise gestreamte Wiedergabe, verständlicher visueller Fortschritt, bessere Ergebniskarten und ein maßvoller persönlicher Einstieg als eigene Aufgaben bestehen.

Die Arbeiten erhalten eigene Latenz- und Audioabnahmen. Regelmäßige gesprochene Statusmeldungen sind kein Standard. Eine Neubewertung von Live-Sprache, umfassendere Proaktivität, zusätzliche Agentenläufe und `/goal` werden separat priorisiert; sie sind keine Voraussetzung für UI, Gmail oder die erste öffentliche Version.

## Abnahme und Veröffentlichung

Die Abnahme verbindet vorhandene Regressionen mit echten Nutzungsabläufen:

- Einrichtung, Anmeldung, Sprechen oder Schreiben, ein Datei-/Programmauftrag, Ergebnis, Stopp und Neustart bleiben durchgängig geprüft.
- Mindestens zwei parallele Aufgaben bleiben korrekt zugeordnet. Ein fehlender Dienst oder ein gescheiterter Login legt das Gespräch nicht still.
- Computersteuerung wird an mehreren Programmtypen, Auflösungen und DPI-Einstellungen geprüft. Aufwände für lokale Auswahl und zusätzliche Modellrunden gehen in die Gesamtzeit ein.
- Gmail wird zunächst gegen synthetische Antworten und dann mit einem dafür eingerichteten eigenen Konto geprüft. Abgebrochene Anmeldung, abgelaufener Zugang, Netzwerkfehler und unklarer Schreibausgang gehören dazu.
- Neue UI-Zustände werden auf Lesbarkeit, Tastaturbedienung, schmale Fenster, Animationseinstellungen und verständliche Fehler geprüft.
- Das ausgelieferte Paket verwendet ein frisches Profil, eigene Konten und keine persönlichen Projektpfade oder Testdaten. Es bringt seine benötigte Laufzeit mit.

Für die GitHub-Veröffentlichung werden README, Einrichtung, Architekturübersicht, bekannte Grenzen und reproduzierbarer Build gepflegt. Die Projektlizenz ist MIT und liegt im Repository als `LICENSE`; sie gehört bereits in den ersten öffentlichen Commit. Hinweise und Verteilungsbedingungen mitgelieferter Komponenten gehören zum Paket. Zugangsdaten, Mailinhalte, persönliche Profile und lokale Prüfartefakte gehören nicht in die Veröffentlichung.

Der öffentliche Einstieg erfolgt mit dem Alpha-Quellcode unter MIT. Neue Downloadpakete werden getrennt davon erstellt und geprüft. Eine eigene Cloud, automatische Kontoübernahme, Synchronisation und ein Plugin-Marktplatz sind keine Voraussetzung. Der Anzeigename ist `openHiatus`; der technische Slug bleibt `openhiatus`.

## Nächster konkreter Einstieg

Fachzustände, Feature-IPC, interne Host-Nachrichten und Werkzeug-/Dienstverträge sind abgegrenzt; Verlauf und Gedächtnis arbeiten über eigene Speicher-Worker. Der Navigationsrahmen mit langlebiger UI-Sitzung, Aufgabenansicht und getrennten Einstellungen ist umgesetzt und mit laufenden lokalen Testaufträgen geprüft. Der allgemeine Computer-Beobachtungsvertrag mit Geometrie, Übersicht-/Detailbildern und lokaler Änderungsauswahl ist als wählbarer Versuch angeschlossen. Als nächster Teil folgen reale Eingabeabnahme und wiederholte Zeit-/Erfolgsvergleiche; Vollbild bleibt bis dahin Standard. Die Gmail-Machbarkeit bleibt innerhalb des vorhandenen Dienstvertrags ein eigener Schritt. Der [Architekturplan](../architekturpruefung.md) beschreibt Umfang und weitere Abnahme.
