# openHiatus – Produkt- und Umsetzungsplan

Stand: 24. Oktober 2026. Quellstand: Version 0.0.15. Dieses Dokument plant den Ausbau; es erklärt neue Funktionen nicht bereits für implementiert.

## Richtung und Dokumentation

openHiatus wird als an das eigene Gerät gebundener Computer-Use-Assistent weiterentwickelt: Er bedient sichtbare Windows-Programme oder leitet Menschen Schritt für Schritt an, bleibt dabei ansprechbar und protokolliert nachvollziehbar. Hauptzielgruppe sind Selbstständige und kleine Betriebe; anleitende Unterstützung für Menschen, die sich am Computer Hilfe wünschen, wird als eigene Erkundung mit echten Personen geprüft. Einsatz in Unternehmen und neue Dienstanbindungen sind vorerst kein Ziel. Die Begründung steht in der [Vision](vision.md).

Die Dokumente haben getrennte Aufgaben:

| Dokument | Aufgabe |
| --- | --- |
| [Vision](vision.md) | Produktrichtung, Zielgruppen und Leitentscheidungen |
| Dieser Gesamtplan | Gemeinsame Architektur, Lieferabschnitte und Abnahme |
| [Architekturprüfung und Zielstruktur](architekturpruefung.md) | Belegte Bestandsaufnahme, Modulgrenzen und schrittweise Entkopplung |
| [Roadmap](roadmap.md) | Kurzer Überblick über aktuellen Stand und nächste Schritte |
| [Computer-Use-Plan](computer-use-uebersicht-und-detail-plan.md) | Versuchs- und Implementierungsplan für Bilder, Bereichsauswahl und Koordinaten |
| [Entwicklungsplan](entwicklungsplan.md) | Technische openHiatus-Migration und ihre Grundentscheidungen |
| [Testprotokoll](openhiatus-testprotokoll.md) | Tatsächlich geprüfter Stand und Prüfgrenzen |

Der frühere [Gesamtplan mit Dienst- und Gmail-Schwerpunkt](archiv/gesamtplan-persoenlicher-assistent-2026-10-22.md) bleibt als historische Referenz erhalten, einschließlich der dort recherchierten Gmail-Scopes und Google-Verifizierungsanforderungen.

## Vorhandene Grundlage

openHiatus besitzt Electron/React mit TypeScript, die isolierte Pi-Laufzeit, mehrere Modellanbieter einschließlich offizieller ChatGPT-Anmeldung, Inworld-Sprache, Gedächtnis mit Quellen und Versionen sowie die vier Identitäts- und Gedächtnisdateien, Skills, zwei geordnete Hintergrundworker und native Windows-Desktopsteuerung. Profil und Laufzeit sind von älteren Installationen getrennt.

Für Computersteuerung sind wählbare Übersichts- und Detailansichten, lokale Änderungserkennung, ein begrenztes Bildbudget, ein optional getrenntes Computer-Modell und die Arbeitsanzeige im Hintergrund als Versuch angeschlossen. Vollbild bleibt Standard. Der Desktoptreiber `@trycua/cua-driver` kennt Zustellwege über die Barrierefreiheitsschnittstelle; dem Modell werden bisher ausschließlich Bilder und Koordinatenaktionen angeboten. Unterstützt wird nur der Hauptbildschirm.

Google Kalender ist als erster persönlicher Dienst über einen selbst eingerichteten Desktop-OAuth-Client angebunden ([Anleitung](google-calendar.md)). Er bleibt als optionale Ergänzung erhalten.

Skills werden lokal im Benutzerprofil gepflegt. Eine Skill-Sammlung ist nicht Bestandteil des öffentlichen Repositorys oder der Windows-Pakete.

Bestehende Prüfungen ersetzen keine neue Abnahme der folgenden Änderungen. Anmeldung, Sprache, Auftragsannahme, Stopp, Sitzungsfortsetzung, Gedächtnis und Kalender müssen erhalten bleiben.

## Architektur als eigener Lieferabschnitt

Die [Prüfung des aktuellen Codes](architekturpruefung.md) zeigt vorhandene Prozess- und Adaptergrenzen, aber eine starke Bündelung der Anwendungslogik in `AppController` und `App.tsx`. Diese Struktur wird vor dem Ausbau der betroffenen Stellen verbindlich weiterentwickelt. Das Projekt braucht für seinen vorgesehenen Umfang eigene Fachmodule, öffentliche Schnittstellen und automatisch geprüfte Abhängigkeitsregeln.

Gespräch, Aufgaben, Gedächtnis, Audio, Modelle, Skills, Computersteuerung und Dienste erhalten eindeutige Zuständigkeiten. Der Appstart setzt die Module zusammen; die Oberfläche verwendet typisierte, zur Laufzeit geprüfte Feature-IPC. Agentenlaufzeit, Betriebssystem und Speicherung bleiben konkrete Adapter. Fachzustand, gespeicherte Daten und UI-Daten werden bewusst getrennt. Neue Dienste werden über gebundene Werkzeuge angebunden, statt weitere Spezialfälle in Controller oder Pi-Transport einzubauen.

Die Entkopplung erfolgt in lauffähigen Schritten mit den vorhandenen Verhaltenstests. Zuerst werden Gesprächs-/Auftragskoordination und langlebige UI-/Audioabläufe entlastet. Vor der ersten Dienstanbindung musste der allgemeine Dienst- und Werkzeugvertrag stehen; vor der neuen Bildstrategie deren eigener Beobachtungs- und Geometrievertrag. Synchrone Speicherarbeit und vollständige Zustandsveröffentlichungen werden gemessen und bei Bedarf entkoppelt, ohne die dauerhafte Auftragsannahme oder den Stopp zu schwächen.

Erster umgesetzter Abschnitt: Das Gesprächsmodul besitzt jetzt Dialogzustand, Warteschlange, Delegation und Stopp. Die langlebige Audio-Runtime besitzt Aufnahme, Wiedergabe, Sprachwarteschlange und Freigabe über injizierte Browserfähigkeiten. Automatische Importregeln prüfen diese Grenzen. Die Desktopfreigabe am Turn-Ende ist von erhaltenen Hintergrundprozessen getrennt. Die übrigen Verträge aus Abschnitt A werden anschließend ergänzt; dieser erste Schritt erklärt die gesamte Architekturgrundlage noch nicht für fertig. Details und nächste Extraktionen stehen in der [Architekturprüfung](architekturpruefung.md#erster-umgesetzter-abschnitt).

Zweiter umgesetzter Abschnitt: Gedächtnisberichte besitzen einen eigenen Koordinator. Eine allgemeine Werkzeugregistrierung bindet Definitionen, geprüfte Handler und Rollen je Lauf; Desktop ist ein konkreter Beitrag außerhalb von Pi. Der Dienstbroker bindet Leseoperationen an Konto und Auftrag und behandelt Rechtewechsel, Abbruch und begrenzte Ergebnisse. Zwei synthetische Diensttypen prüfen die gemeinsame Schnittstelle. Ein echter Gmail-Adapter und dessen Anmeldung sind noch nicht implementiert. Der [aktuelle Architekturstand](architekturpruefung.md#zweiter-umgesetzter-abschnitt) grenzt diesen Umfang von den folgenden Arbeiten ab.

Dritter umgesetzter Abschnitt: Feature-IPC koppelt Befehlsnamen an ihre Argumente und Ergebnisse und prüft die übertragenen Daten zur Laufzeit. Ein eigenes Auftragsmodul besitzt Jobdaten, Annahmekontext, Worker-Lebensdauer, Archivfortsetzungen sowie Ergebnis- und Sprachzuordnung. Electron behält die Prüfung des zulässigen Fensters, Frames und der Renderer-URL. [Details und verbleibende Arbeiten](architekturpruefung.md#dritter-umgesetzter-abschnitt).

Vierter umgesetzter Abschnitt: Modell-/Providerkoordination und der direkte Aufgabenpfad besitzen eigene Zustände und Lebensdauern. Die interne Host-Grenze prüft Befehle, Ereignisse sowie zu Anfragen gehörende Antworten. Das Zustandsjournal unterscheidet dauerhafte Barrieren, Checkpoints und reine Veröffentlichung; die Speicheradapter schreiben vorerst weiterhin synchron. Der kleine Identitäts-/Kernleseport vermeidet vollständige Archivsnapshots an diesen Stellen. Ein synthetischer Benchmark macht den weiteren Speicheraufwand reproduzierbar. [Umfang und Messgrenzen](architekturpruefung.md#vierter-umgesetzter-abschnitt).

Fünfter umgesetzter Abschnitt: Der Verlaufsspeicher schreibt über einen eigenen Worker mit geordneten Bestätigungen. Gewöhnliche Speicherstände werden gebündelt; Auftragsannahme, Änderungen und Start warten auf ihre dauerhafte Barriere. Stopp bleibt unabhängig vom Datenträger. Fehlgeschlagene Annahmen können weder durch alte wartende Speicherstände noch als Gedächtnisquellen wieder auftauchen. Ein echter UI-Test mit blockiertem Speicher und Neustart belegt diese Reihenfolge. Gedächtnis- und Zugangsspeicher bleiben synchron. [Umfang und Messgrenzen](architekturpruefung.md#fünfter-umgesetzter-abschnitt).

Sechster umgesetzter Abschnitt: Der Gedächtnisspeicher besitzt einen eigenen Worker für Lade-, Such-, Abruf- und Schreibarbeit. Asynchrone Fachports erhalten Quellenzuordnung und Versionsprüfung; nur bestätigte Identität/Kern bleiben im Hauptprozess zwischengespeichert. Stopp invalidiert wartende Abrufe und Berichte, ohne den Speicher abzuwarten. Bereits eingereichte Nutzeränderungen werden nach erfolgreicher Dateiablage bestätigt. [Umfang und Messgrenzen](architekturpruefung.md#sechster-umgesetzter-abschnitt).

Siebter umgesetzter Abschnitt: Die langlebige UI-Sitzung hält Snapshot, Entwurf, Senden, Hotkeys und Audioanbindung oberhalb der Ansichten. Ein eigener Navigationsrahmen verbindet die sechs Bereiche. Aufgaben besitzen Filter, Ergebnisdetails und Einzelstopp; Einstellungen besitzen getrennte Register. Navigation erhält laufende Arbeit, Audio und lokale Eingaben. Dienste bleiben ausdrücklich als Vorbereitung gekennzeichnet. [Umfang und Prüfnachweise](architekturpruefung.md#siebter-umgesetzter-abschnitt).


## Produktziele und Beispielabläufe

Die nächsten Lieferabschnitte sollen drei zusammenhängende Abläufe tragen:

1. **Ausführen:** Einen wiederkehrenden Ablauf in einem beliebigen Windows-Programm sprechen oder schreiben, etwa Daten aus einer Liste in ein Formular übertragen. openHiatus bedient die Programme, hält vor endgültigen Aktionen zur Freigabe an, prüft das Ergebnis am tatsächlichen Zustand und legt Ergebnis und Protokoll in der Aufgabenansicht ab.
2. **Anleiten:** Fragen, wie etwas im gerade sichtbaren Programm geht. openHiatus markiert den nächsten Schritt auf dem Bildschirm, erklärt ihn kurz und erkennt, wann er erledigt ist. Der Mensch bedient selbst.
3. **Wiederholen:** Einen erfolgreich erledigten Ablauf als Rezept speichern und später schneller, günstiger und mit denselben Prüfpunkten erneut ausführen.

Alle drei Abläufe verwenden dieselbe Auftragsverwaltung, dieselben Ergebniszustände und denselben Stopp.

## Wahrnehmung: Bilder und Bedienelemente

Neben den Bildansichten erhält der Arbeitsagent eine zweite Wahrnehmung aus der Windows-Barrierefreiheitsschnittstelle (UI Automation): eine begrenzte, auf das aktive Fenster oder einen Bereich bezogene Liste von Bedienelementen mit Rolle, Name, Wert, Zustand und Bildschirmrechteck.

- Elemente erhalten kurzlebige Kennungen, die wie Beobachtungs-Handles an eine Beobachtung gebunden sind. Veraltete Kennungen werden abgelehnt.
- Aktionen können sich auf ein Element statt auf Koordinaten beziehen. Der Host übersetzt in die vorhandenen Eingabewege und prüft Fenster, Geometrie und Stopp wie bisher.
- Feldwerte und Zustände dienen als Erfolgsprüfung, ohne dafür ein neues Bild anzufordern.
- Programme ohne verwertbare Elementdaten – Canvas-Oberflächen, entfernte Desktops, manche ältere Anwendungen – bleiben über Bilder und Koordinaten bedienbar. Die Elementliste ergänzt die Bilder, sie ersetzt sie nicht.
- Elementlisten werden in Umfang und Tiefe begrenzt, damit sie nicht mehr Kontext kosten als ein Bild.

Programme mit höheren Rechten und der sichere Desktop von Windows-Sicherheitsabfragen sind für einen normal gestarteten Prozess nicht bedienbar. openHiatus erkennt solche Stellen und übergibt sie dem Menschen.

Die bestehenden Entscheidungen zur Bildstrategie bleiben gültig: native Auflösung erkennen, echte Übersichtsfaktoren als Versuchsparameter, relevanter Ausschnitt in Originalauflösung, Bild- und Ansichtskennung für jede Eingabe prüfen und umrechnen, Vorschau und Modell erhalten dieselben Ansichten. Der [Computer-Use-Plan](computer-use-uebersicht-und-detail-plan.md) bleibt dafür maßgeblich. Mehrere Monitore folgen über denselben ausdrücklichen Geometrievertrag.

## Ausführen, Anleiten und gemeinsamer Bildschirm

Mensch und Agent teilen sich Maus, Tastatur und Fokus. Dafür gelten feste Regeln:

- **Vorrang des Menschen:** Eigene Maus- oder Tastatureingaben während einer Agentenaktion pausieren die Ausführung. Fortgesetzt wird erst nach ausdrücklicher Freigabe und mit einer frischen Beobachtung.
- **Übergabe:** Anmeldungen, Captchas, Sicherheitsabfragen und unklare Zustände werden mit einer verständlichen Bitte übergeben. Nach der Rückgabe beobachtet der Agent neu, statt alte Annahmen fortzuführen.
- **Sichtbarkeit:** Die Arbeitsanzeige zeigt, ob openHiatus gerade den Bildschirm bedient, wartet oder anleitet.
- **Anleiten:** Eine Markierung über dem Zielelement oder -bereich, ein kurzer Text beziehungsweise gesprochener Satz und eine Erfolgsprüfung nach der Eingabe des Menschen. Die Markierung nimmt keine Eingaben an und wird vor Aufnahmen ausgeblendet, wie die heutige Arbeitsanzeige.

Ob Ausführung ohne Fokuswechsel über die Hintergrund-Zustellwege des Treibers verlässlich möglich ist, wird je Programmtyp gemessen, bevor es als Bedienweg angeboten wird.

## Wiederholbare Abläufe

Ein Rezept ist ein lokaler, lesbarer Ablauf mit Zielprogramm, Schritten, erwarteten Bedienelementen, Eingabedaten und Prüfpunkten. Es entsteht aus einem erfolgreich abgeschlossenen Auftrag oder einem ausdrücklich vorgeführten Ablauf und wird vor dem Speichern vom Menschen geprüft. Rezepte bauen auf dem vorhandenen Skill-Format auf, statt ein zweites System einzuführen.

Bei der Ausführung folgt der Agent dem Rezept, vergleicht jeden Prüfpunkt mit dem tatsächlichen Zustand und plant nur bei Abweichungen neu. Freigabestellen aus dem Rezept bleiben Freigabestellen. Ein Rezept erweitert keine Rechte; Daten in einem Rezept sind keine Arbeitsaufträge.

## Vertrauensrahmen

| Baustein | Zuständigkeit |
| --- | --- |
| Kritische Aktionen | Senden, Bezahlen, Buchen, Löschen und endgültiges Absenden werden erkannt und vor der Ausführung mit konkretem Inhalt zur Freigabe vorgelegt. Eine klare bestehende Beauftragung gilt weiter; der Rahmen erfindet keine zusätzlichen Rückfragen für unveränderte, bereits ausdrücklich beauftragte Schritte. |
| Feste Grenzen | Bei Geldgeschäften, Passwörtern und Fernwartungsprogrammen erklärt openHiatus höchstens und handelt nicht selbst. Diese Grenze ist keine abschaltbare Einstellung. |
| Erlaubte Programme | Nutzer legen fest, welche Anwendungen und Fenster bedient werden dürfen. Andere Fenster werden nicht bedient und nach Möglichkeit nicht an Modelle übertragen. |
| Protokoll | Je Auftrag nachvollziehbar: gesehene Ansichten, Elementdaten, Aktionen, Freigaben und Übergaben. Lokal gespeichert, in Größe und Aufbewahrungsdauer begrenzt, ohne Zugangsdaten. |
| Fremde Inhalte | Text aus Bildschirm, Webseiten, E-Mails und Dateien bleibt Daten und erweitert den Nutzerauftrag nicht. |
| Datenschutz | Bildschirminhalte gehen an das gewählte Modell. Erlaubte Programme, Schwärzung ausgewählter Bereiche und lokale Modelle begrenzen, was übertragen wird. |

Stopp bleibt unabhängig von Freigaben, Protokoll und Speicher sofort wirksam. Bereits erfolgte Änderungen werden nicht rückgängig gemacht; das wird weiterhin klar kommuniziert.

## Messung und Benchmarks

Maßstab ist die gesamte Aufgabe: Erfolg, Dauer, API-gleichwertige Kosten und Eingriffe des Menschen, je Modell und je Wahrnehmungsvariante. Getrennt erfasst werden Aufnahme, lokale Analyse, Modellzeit, zusätzliche Beobachtungen und Korrekturen. Ein schnellerer Einzelaufruf genügt nicht, wenn die Gesamtaufgabe langsamer oder unzuverlässiger wird.

Die vorhandenen synthetischen LibreOffice-Aufgaben unter [benchmarks](../benchmarks/README.md) werden um realistische Abläufe kleiner Betriebe ergänzt: Browserformular mit Daten aus einer Tabelle, Dateidialoge, ein Ablauf über zwei Programme und eine Anwendung mit schwachen Elementdaten. Alle Benchmarks verwenden synthetische Daten und lokale Testseiten oder -programme, keine echten Konten. Wiederholte Läufe ersetzen Einzelergebnisse.

## Oberfläche

Die vorhandene Navigation mit Gespräch, Aufgaben, Diensten, Gedächtnis, Skills und Einstellungen bleibt erhalten. Ausbau:

| Bereich | Ausbau |
| --- | --- |
| Gespräch | Schneller Weg zu „Hilfe zum gerade Sichtbaren“ per Taste; Freigaben und Übergaben erscheinen dort, wo der Mensch gerade ist |
| Aufgaben | Protokoll je Auftrag, Freigaben mit konkretem Inhalt, Übergabe- und Pausenzustand |
| Skills | Rezepte prüfen, benennen, bearbeiten und starten |
| Einstellungen | Erlaubte Programme, Freigabeverhalten, Protokollaufbewahrung, Start mit Windows |
| Dienste | Google Kalender; keine weiteren Dienste in Vorbereitung |

Eine Aufgabe zeigt weiterhin eindeutig, ob sie wartet, arbeitet, pausiert, auf Freigabe oder Übergabe wartet, gestoppt wird, abgeschlossen, fehlgeschlagen oder nach Neustart unterbrochen ist. Ein Ansichtswechsel erhält Entwurf, Verlauf, Audiozustand und laufende Aufgaben. Die Oberfläche passt sich an Fenstergröße, Windows-Skalierung und vergrößerte Schrift an; breitere Skalierungs- und Schriftabnahme bleibt offen.

## Dienste

Die gemeinsame Dienstgrenze mit Konten, gebundenen Werkzeugen und Dienstbroker bleibt im Code bestehen. Google Kalender wird gepflegt. Gmail und weitere Dienste werden vorerst nicht verfolgt; die Vorarbeiten stehen im [früheren Gesamtplan](archiv/gesamtplan-persoenlicher-assistent-2026-10-22.md#gmail-als-erste-vertikale-integration). Die dort festgelegten Regeln gelten weiter für vorhandene Dienste: Zugangsdaten bleiben im Hauptprozess, Lesen, Vorbereiten und Ausführen sind getrennte Fähigkeiten, unklare Schreibausgänge werden geprüft statt blind wiederholt.

## Lieferabschnitte

Die Architekturabschnitte und der UI-Rahmen sind umgesetzt. Die Reihenfolge der folgenden Abschnitte ist ein Umsetzungsvorschlag mit überprüfbaren Ergebnissen.

| Abschnitt | Konkretes Ergebnis | Fertigkriterium |
| --- | --- | --- |
| C – Elementwahrnehmung | Machbarkeitsprüfung des Treibers, danach begrenzte Elementliste, Elementaktionen und Wertprüfung neben den Bildansichten | Elementaktionen treffen in mehreren Programmtypen das richtige Ziel; veraltete Kennungen werden abgelehnt; Pixelrückfall funktioniert |
| D – Benchmarks | Erweiterte synthetische Aufgaben und vergleichbare Kennzahlen je Lauf | Wiederholte Läufe vergleichen Bildstrategie und Elementwahrnehmung nach Erfolg, Dauer, Kosten und Eingriffen |
| E – Vertrauensrahmen | Freigabe kritischer Aktionen, feste Grenzen, erlaubte Programme, Protokoll | Kritische Aktionen werden in den Benchmarks erkannt und angehalten; nicht erlaubte Fenster werden nicht bedient; Protokoll ist vollständig und ohne Zugangsdaten |
| F – Gemeinsamer Bildschirm | Pause bei Eingaben des Menschen, Übergabe und Rückgabe | Menschliche Eingaben stoppen weitere Agenteneingaben verlässlich; Fortsetzung beginnt mit neuer Beobachtung |
| G – Rezepte | Rezept aus Auftrag erzeugen, prüfen, speichern und ausführen | Wiederholung ist in den Benchmarks schneller oder günstiger bei mindestens gleicher Erfolgsquote |
| H – Anleiten | Markierung auf dem Bildschirm, kurze Erklärung, Erfolgsprüfung | Markierungen sitzen bei unterschiedlichen Auflösungen und Skalierungen am richtigen Element; Erprobung mit echten Personen ist dokumentiert |
| I – Mehrere Monitore | Geometrievertrag für mehrere Anzeigen | Beobachtung, Eingabe und Markierung stimmen auf jedem Monitor und bei gemischter Skalierung |
| J – Öffentliche Vorschauversion | Signiertes, einfach installierbares Windows-Paket, Start mit Windows, dokumentierte Grenzen | Frisches Profil und eigener Zugang auf weiterem Testsystem funktionieren ohne Entwicklerwerkzeuge; Lizenzhinweise passen zum Paket |

C und D gehören zusammen: Ohne Messung lässt sich der Nutzen der Elementwahrnehmung nicht belegen. E sollte vor einer breiteren Nutzung des Ausführens stehen.

## Erkundung: anleitende Unterstützung

Ob anleitende Unterstützung Menschen hilft, die sich am Computer schwertun, ist offen. Vor eigenen Funktionen für diese Gruppe steht eine kleine Erprobung mit wenigen Personen aus dem Umfeld, mit deren Einverständnis und ohne Aufzeichnung privater Inhalte im Repository. Denkbare Voraussetzungen sind Start mit Windows, eine einmalige Einrichtung durch eine vertraute Person und eine farbig markierte Sprechtaste. Beobachtet wird, ob Starten, Fragen, Verstehen der Markierung und Abschließen ohne Hilfe gelingen und welche Kosten je Hilfestellung entstehen. Eine vereinfachte Ansicht wird erst anhand dieser Beobachtungen entworfen.

## Weiterer Gesprächsausbau

Präsenz, Bestätigungen und Signaltöne bleiben erhalten. Die Sprechtaste bleibt Hauptweg. Unterbrechen beim Sprechen und satzweise Wiedergabe bleiben sinnvolle eigene Aufgaben, weil sie Anleiten flüssiger machen. Live-Sprache, Freisprechen, umfassende Proaktivität und `/goal` werden separat neu bewertet.

## Abnahme und Veröffentlichung

- Einrichtung, Anmeldung, Sprechen oder Schreiben, ein Programmauftrag mit Freigabe, Ergebnis, Protokoll, Stopp und Neustart bleiben durchgängig geprüft.
- Computersteuerung wird an mehreren Programmtypen, Auflösungen und Skalierungen geprüft; Elementwahrnehmung und Bildstrategie gehen mit ihrer Gesamtzeit in die Bewertung ein.
- Freigaben, feste Grenzen und erlaubte Programme werden mit synthetischen kritischen Aktionen geprüft. Keine Abnahme verwendet echte Zahlungen, Konten oder Kundendaten.
- Mindestens zwei parallele Aufgaben bleiben korrekt zugeordnet; Desktopzugriff bleibt geordnet.
- Neue UI-Zustände werden auf Lesbarkeit, Tastaturbedienung, schmale Fenster, Animationseinstellungen und verständliche Fehler geprüft.
- Das ausgelieferte Paket verwendet ein frisches Profil, eigene Konten und keine persönlichen Projektpfade oder Testdaten.

Für die GitHub-Veröffentlichung werden README, Einrichtung, Architekturübersicht, bekannte Grenzen und reproduzierbarer Build gepflegt. Die Projektlizenz ist MIT. Zugangsdaten, Bildschirmprotokolle, persönliche Profile und lokale Prüfartefakte gehören nicht in die Veröffentlichung.

## Nächster konkreter Einstieg

Abschnitt C beginnt mit einer Machbarkeitsprüfung: Was liefert `@trycua/cua-driver` unter Windows an Elementdaten, wie schnell, in welcher Vollständigkeit für Büroprogramme, Browser, Electron-Anwendungen und ältere Win32-Programme, und welche Zustellwege funktionieren ohne Fokuswechsel? Falls der Treiber nicht genügt, wird eine eigene UI-Automation-Abfrage im vorhandenen nativen Hilfsprozess geprüft. Parallel werden die Benchmarks aus Abschnitt D vorbereitet, damit die erste Elementwahrnehmung direkt gegen die Bildstrategie gemessen werden kann.
