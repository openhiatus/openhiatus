# Vision: openHiatus als persönlicher Assistent

Stand: 22. Oktober 2026. Ausgangspunkt ist openHiatus, Version 0.1.4. Dieses Dokument beschreibt die Produktrichtung. Der [Gesamtplan](gesamtplan.md) legt Lieferabschnitte und Abnahme fest; der [Prüfstand](openhiatus-testprotokoll.md) dokumentiert tatsächlich getestete Funktionen.

## Das Ziel

openHiatus soll ein ansprechbarer Assistent für den eigenen Rechner und die eigenen Arbeitsabläufe werden. Man kann mit ihm sprechen oder schreiben, Aufgaben abgeben und während der Ausführung weiter im Gespräch bleiben. Er nutzt bekannte Projekte und passende Erinnerungen, liefert nachvollziehbare Ergebnisse und verbindet bei Bedarf persönliche Dienste.

Die Bedienung soll für Menschen funktionieren, die keine Entwickler sind. Eine Installation, verständliche Einrichtung und sinnvolle Voreinstellungen reichen für normale Aufgaben. Auflösung, lokale Verzeichnisse und interne Laufzeitdetails ermittelt die Anwendung selbst.

## Ein allgemeiner Assistent

Dateien, Shell, sichtbare Programme und offizielle Dienstschnittstellen bilden die Arbeitsgrundlage. Skills beschreiben wiederverwendbare Abläufe darauf. Die Anwendung erhält keine besondere Logik für einzelne Excel-Tabellen, Terminalpositionen oder einmalige Analyseaufträge.

Wo eine geeignete Dienstschnittstelle vorhanden ist, kann openHiatus direkt mit ihr arbeiten. Wo Oberflächenarbeit benötigt wird, verwendet er allgemeine Computersteuerung. Beides gehört zur gleichen Aufgabenverwaltung und erscheint als verständlicher Fortschritt mit belegbaren Ergebnissen.

Anleitungen und Referenzdokumente werden bei der Aufgabenübergabe über eindeutige Pfade oder Links angegeben. Bereits vorhandene Anweisungen werden nicht in jedem Prompt noch einmal ausgeschrieben.

## Eine ruhige Oberfläche mit erreichbarer Arbeitsansicht

Der Einstieg ist ein klarer Ort für Gespräch, Sprechen und Schreiben. Präsenz und Status geben Rückmeldung, ohne mehrere konkurrierende Anzeigen. Der Verlauf ist erreichbar; Texteingabe bleibt ein vollständiger Bedienweg.

Laufende und abgeschlossene Aufgaben bekommen eine eigene Übersicht. Dort sieht man Auftrag, tatsächlichen Stand, Ergebnis, Quellen und verfügbaren Verbrauch. Technische Aktivität ist bei Bedarf zugänglich. Ein Ansichtswechsel unterbricht weder Gespräch noch Arbeit.

Persönliche Dienste wie Gmail bekommen einen eigenen Bereich. Modellanbieter, Sprachzugang, Geräte und sonstige Programmeinstellungen bleiben verständlich davon getrennt. Gedächtnis und Skills bleiben direkt erreichbar. Die genaue visuelle Gestaltung wird anhand eines kleinen bedienbaren Entwurfs abgestimmt; dieses Dokument legt keinen fertigen Stil fest.

## Responsives UI-Design

Die Oberfläche passt sich automatisch an Fenstergröße, Seitenverhältnis, Windows-Skalierung und vergrößerte Schrift an. Navigation, Gespräch, Aufgaben, Dienste und Einstellungen bleiben auch in schmalen Fenstern lesbar und vollständig bedienbar. Große Fenster nutzen den verfügbaren Platz sinnvoll.

Globale Bedienelemente wie Stopp sowie Sprechen und Schreiben bleiben erreichbar. Ein Wechsel des Layouts erhält Entwürfe, Fokus, Aufnahme und laufende Arbeit. Dieses Ziel gilt für die gesamte Anwendung und wird mit unterschiedlichen Fenstergrößen und Skalierungen geprüft.

## Schnelle, zuverlässige Arbeit

Zeit bis zum nutzbaren Ergebnis ist ein wesentliches Produktkriterium. Weniger Token oder kleinere Dateien allein sind kein Erfolg, wenn zusätzliche Modellrunden den Ablauf verlängern.

Für Computersteuerung wird eine stark verkleinerte Gesamtübersicht mit einem relevanten Originalausschnitt untersucht. Die Faktoren 1:4, 1:8, 1:16 und 1:32 sind Versuchsparameter. Lokale Änderungserkennung soll besonders nach Aktionen einen passenden Kontrollbereich liefern. openHiatus übernimmt Skalierung, Ausschnittversatz und Koordinatenprüfung. Das Verfahren funktioniert mit der tatsächlich vorhandenen Bildschirmauflösung und wird über mehrere Programme und Geräte geprüft.

Die genaue Bereichsauswahl bleibt eine Forschungsfrage mit Messkriterien. Der [Computer-Use-Plan](computer-use-uebersicht-und-detail-plan.md) beschreibt die Varianten. Eine zusätzliche Wahrnehmungsstufe wird nur übernommen, wenn ihr Nutzen die eigene Laufzeit und die Korrekturkosten rechtfertigt.

## Dienste als Fähigkeiten

Gmail ist der erste geplante Dienst. Ein sinnvoller erster Ablauf ist: Konto verbinden, passende Nachrichten finden, benötigten Inhalt lesen und eine Antwort als lokalen Entwurf vorbereiten. Gmail-Entwürfe und tatsächlicher Versand sind getrennte Ausbauschritte.

Weitere Dienste werden anhand konkreter Abläufe und vorhandener offizieller Schnittstellen ergänzt. Dafür entsteht eine kleine gemeinsame Anbindung für Konten, Fähigkeiten und Werkzeugaufrufe. Ein Marktplatz oder eine eigene Cloudplattform ist dafür zunächst nicht nötig.

Verbundenes Konto und verfügbare Aktionen sind erkennbar. openHiatus unterscheidet Lesen, Vorbereiten und Ausführen. Eine klare bestehende Beauftragung gilt weiter; allgemeines Verbinden eines Kontos erlaubt keine beliebigen späteren Handlungen.

## Gedächtnis und Persönlichkeit

openHiatus soll an bekannte Zusammenhänge anknüpfen und einen angenehmen, direkten Gesprächsstil haben. Identität und persönlicher Kern bleiben vom Nutzer bearbeitbar; autonome Kernänderungen benötigen den vorhandenen konkreten Freigabeweg. Quellen und historische Fassungen bleiben nachvollziehbar.

Präsenz, variierte Eingangsbestätigungen und Signaltöne sind bereits vorhandene Grundlagen. Weitere Schritte sind verständliche Ergebnisdarstellung, bei Bedarf ein persönlicher Einstieg, optionales Freisprechen, Unterbrechen und frühere Sprachausgabe. Initiative bleibt dosierbar; alles Hörbare kann abgeschaltet werden.

## Verlässliche Grenzen

openHiatus verwendet Pi als eigene Agent-Laufzeit und bleibt unabhängig von einer Codex- oder OpenClaw-Installation. Modelle und Sprachdienste sind wählbare Verbindungen. Vorhandene ChatGPT-Anmeldung und API-Anbieter bleiben erhalten.

Die aktuelle Windows-App arbeitet nach einmaligem Hinweis mit den Rechten des Benutzerkontos. Eine Sandbox wird nicht versprochen. Stopp hält weitere Agentenaktionen und verwaltete Ausführung an; eigenständig übergebene Arbeitsfenster bleiben erhalten. Bereits erfolgte Änderungen werden nicht rückgängig gemacht.

Die Anwendung und ihre Datenablage laufen lokal. Ausgewählte Cloudmodelle, Sprach- und Arbeitsdienste erhalten die für ihre Aufgabe benötigten Daten. Eine lokale Anwendung wird deshalb nicht als vollständig offline dargestellt. Zugangsdaten gehören in den geschützten Zugangsspeicher, nicht in Gespräch, Gedächtnis oder Ergebnisprotokolle.

## Öffentliche Alpha und spätere Auslieferung

Der aktuelle Quellcode wird als Alpha auf GitHub veröffentlicht und öffentlich weiterentwickelt. Weitere Funktionen und eine breitere Paketabnahme folgen im Verlauf dieser Entwicklung. Für spätere Downloadpakete soll die Anwendung mit frischem Profil, anderen Bildschirmauflösungen und eigenen Konten der jeweiligen Person funktionieren. Persönliche Projektlisten, Zugänge und Testprofile sind keine Voraussetzung des Produkts.

Quellcode, Windows-Paket, Einrichtung und tatsächlich verfügbare Funktionen werden gemeinsam beschrieben. Dienstanmeldungen müssen zur öffentlichen Auslieferung passen; ein erfolgreicher persönlicher Pilot ersetzt diese Vorbereitung nicht. Die Projektlizenz ist MIT. Die Bedingungen mitgelieferter Komponenten werden vor der Veröffentlichung geprüft und ihre Lizenzhinweise mitgeliefert.

## Einordnung der bisherigen Vision

Die bisherige openHiatus-Vision bleibt als [historische Fassung](archiv/vision-openhiatus-2026-10-20.md) erhalten. Ihre Ideen zu Präsenz, Sprachfluss und maßvoller Initiative fließen hier ein. Frühere Safe/Risk-, Codex- und Versionsannahmen sind keine Vorgaben für openHiatus.
