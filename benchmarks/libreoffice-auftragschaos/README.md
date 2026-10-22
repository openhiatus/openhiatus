# LibreOffice-Benchmark: Auftragsexport bereinigen

Dieser Benchmark definiert einen frischen, synthetischen UI-Lauf für `openhiatus`. Frühere Vorschauen, Vorbereitungsberichte und Laufartefakte gehören nicht zur Quellablage und sind kein Nachweis für den aktuellen Produktstand. Nach jeder Vorbereitung werden Input, Hashes und Ergebnis separat geprüft.

Ein sichtbares Eingabeblatt enthält 350 Datenzeilen und 22 Geschäftsspalten A–V. Die Kopfzeile liegt in Zeile 1, die Daten in A2:V351. Es gibt keine versteckten Blätter, ausgeblendeten Zeilen oder aktiven Filter. Der fiktive Export der Nordstern Servicehandel GmbH trägt den Stand 30.09.2026. Nur Calc ist Gegenstand dieses Tests; Writer und PDF sind nicht erforderlich.

## Frischen Lauf vorbereiten

Die folgenden Befehle sind für den Testleiter, nicht für den getesteten Worker. Im Repository-Verzeichnis ausführen. Benötigt werden Python, LibreOffice und für die XLSX-Erstellung eine ausdrücklich angegebene Node-Runtime mit `bin/node.exe` sowie `node_modules/@oai/artifact-tool`. Diese Autorenabhängigkeit ist kein Bestandteil der normalen Windows-App. Ein optionaler `--marker` kann den Operationsmarker der jeweiligen Autorenumgebung angeben; persönliche Runtimepfade sind nicht fest eingebaut.

```powershell
python -B benchmarks/libreoffice-auftragschaos/vorbereiten.py --runtime '<Node-Runtime-Verzeichnis>' --arbeitsordner "$env:APPDATA\openhiatus\Arbeitsbereich\LibreOffice-Test Auftragschaos September 2026"
python -B benchmarks/libreoffice-auftragschaos/vorbereiten.py --pruefen-input
```

`--arbeitsordner` kann auf ein anderes leeres Testverzeichnis zeigen. Der Controller erzeugt ausschließlich den unbearbeiteten Input und eine leere `Abgabe`. Bekannte unveränderte Inputs werden nicht überschrieben; eine gefüllte Abgabe oder abweichende vorhandene Eingaben blockieren eine erneute Vorbereitung. Für Wiederholungen einen neuen Arbeitsordner wählen.

```text
<gewählter Arbeitsordner>
├── Input
│   └── Auftragsexport September 2026.xlsx
└── Abgabe
    └── Auftraege September 2026 bereinigt.ods  ← vom Worker zu erstellen
```

Die Vorbereitung schreibt `fixture.json`, `laufvorbereitung.json` sowie Vorschauen und den tatsächlichen Auftrag unter `Vorbereitung/Arbeitsauftrag für openhiatus.txt`. Die eingecheckte [Auftragsvorlage](<Arbeitsauftrag für openhiatus.txt>) enthält nur einen Platzhalter. Vor Übergabe stets den frisch erzeugten Auftrag prüfen. Der Auftrag ist eine normale Nachricht; die aktuelle App unterstützt `/goal` nicht.

## Durchführung

1. Andere Desktopaufträge abwarten und LibreOffice bereitstellen. Während des Tests keine parallele Bildschirmsteuerung starten.
2. Den gesamten frisch erzeugten Auftrag in das Gespräch von openhiatus kopieren und senden. Den Worker nicht auffordern, die Controller-Dateien zu lesen. Lösungen, Fehlerpositionen und Sollzahlen nicht übergeben.
3. Auftrags-ID, verwendetes Modell, Beginn, Rückfragen und manuelle Eingriffe dokumentieren. Die Bearbeitung nutzt ausschließlich sichtbares LibreOffice mit Bildschirmbildern, Maus und Tastatur. Normales Einfügen und Calc-Formeln sind erlaubt; Shell, direkte Dateioperationen, Skripte, UNO, Makros, Headless-Verarbeitung und weitere Arbeitsagenten sind ausgeschlossen.
4. Nach Speicherung die Abgabe archivieren und den Inputhash erneut prüfen. Archivierung und Auswertung führt der Testleiter aus.

```powershell
python -B benchmarks/libreoffice-auftragschaos/vorbereiten.py --arbeitsordner '<derselbe Arbeitsordner>' --archivieren
python -B benchmarks/libreoffice-auftragschaos/vorbereiten.py --pruefen-input
python -B benchmarks/libreoffice-auftragschaos/auswerten.py --abgabe '<ausgegebener Archivordner>' --output benchmarks/libreoffice-auftragschaos/auswertungen/Dokumentpruefung.json
```

Die Archivierung akzeptiert nur eine nichtleere Pflichtdatei und vergleicht Hashes vor, während und nach der Kopie. Der Evaluator liest ODS als ZIP/XML, ohne Änderungen oder Neuberechnung. Er prüft Identität und Feldzuordnung aller Geschäftssätze, echte Datentypen, Korrekturen, Dubletten sowie erhaltene unklare Angaben. Eine Zahl als Text gilt nicht durch Anzeigeformatierung als repariert. Darstellung, Formeln mit unbekanntem Ergebnis und Abschlussmeldung werden zusätzlich manuell bewertet.

Der Protokollprüfer unter `../libreoffice-monatsabschluss/protokoll_pruefen.py` verarbeitet das dort dokumentierte historische JSONL-Format. Er ist kein zugesicherter Parser der aktuellen Pi-Sitzungsdateien. Für einen aktuellen Lauf den tatsächlich aufgezeichneten Werkzeug- und Bildverlauf gesondert prüfen; fehlende oder nicht unterstützte Protokolle ergeben **UI-Regel nicht prüfbar**, keinen bestandenen Lauf.

## Sollwerte ausschließlich für den Testleiter

Die ersten 30 Datenzeilen sind korrekt. Die 40 Problemfälle liegen über 40 weitere Zeilen verteilt: 28 eindeutig lösbare Fälle, acht mit mehreren Schritten und vier bewusst unentscheidbare Fälle. Auch ferne Zeilen und rechte Spalten müssen gelesen werden. Gültige Sonderfälle umfassen mehrere Positionen eines Auftrags, Nullwerte, optionale Leerfelder, Retouren, Erstattungen und mehrzeilige Lieferhinweise.

| Kennzahl | Soll |
| --- | ---: |
| Ursprüngliche Exportzeilen | 350 |
| Korrigierte verbleibende Zeilen | 32 |
| Entfernte vollständige Dubletten | 4 |
| Erhaltene unklare Zeilen | 4 |
| Verbleibende Datensätze | 346 |
| Unveränderte gültige Geschäftssätze | 310 |

`oracle.json` enthält typisierte Eingaben, erlaubte Ergebnisse, IDs, Dublettenpaare und Kontrollfälle. Der Evaluator ordnet über `Datensatz_ID` zu, unabhängig von der Sortierreihenfolge. Für Dubletten darf jeweils eines der beiden vollständigen Mitglieder bleiben. Die vier unklaren Fälle bleiben mit unveränderten entscheidungsbedürftigen Werten erhalten.

## Bewertung: 100 Punkte

| Kategorie | Punkte |
| --- | ---: |
| Vollständigkeit und Zeilenintegrität | 35 |
| Eindeutige Bereinigung | 30 |
| Dubletten samt Prüfprotokoll | 10 |
| Umgang mit Unsicherheit | 15 |
| Lesbares, vollständig geprüftes Calc-Ergebnis | 5 |
| Abschlussbericht mit korrekten Zeilenzahlen | 5 |

85–100: sehr gut; 70–84: brauchbar mit Schwächen; unter 70: nicht vollständig bestanden. Ein nachgewiesener UI-Regelverstoß, ein veränderter Input oder verlorene Geschäftszeilen außerhalb der erlaubten Dubletten bedeutet Nichtbestehen. Laufzeit, Bild-/Werkzeugzahl, Wiederherstellungen und Eingriffe werden separat erfasst. Die automatische Dokumentprüfung vergibt keine vollständige Punktzahl und beweist keine UI-Regelbefolgung.

## Controllerprüfungen

```powershell
python -B -m unittest discover -s benchmarks/libreoffice-auftragschaos -p '*_test.py'
```

Die Prüfungen erzeugen temporäre synthetische Gegenproben. Der gespeicherte XLSX-Export wird nur geprüft, wenn eine frische lokale `laufvorbereitung.json` existiert; andernfalls ist dieser Test ausdrücklich übersprungen. Ein erfolgreicher Unitlauf ersetzt keine echte LibreOffice-Ausführung. Varianten mit Filtern, versteckten Zeilen oder mehreren abhängigen Blättern sind weitere Benchmarkstufen und hier nicht implementiert.
