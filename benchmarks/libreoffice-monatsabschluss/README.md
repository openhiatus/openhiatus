# LibreOffice-Benchmark: Monatsabschluss September 2026

Dieser Benchmark definiert einen frischen synthetischen Lauf mit Calc, Writer und PDF-Ausgabe. Zunächst wird ein Monatsabschluss erstellt, anschließend eine einzelne Zahlung korrigiert. Alte Abgaben, Bilder und Auswertungen liegen außerhalb der Quellablage; daraus wird kein aktuelles openhiatus-Ergebnis abgeleitet. Jede Phase benötigt neue Dateien, Hashes, Protokolle und eine eigene Sichtprüfung.

## Vorbereitung und Arbeitsbereich

Im Repository-Verzeichnis ausführen. Die Befehle sind ausschließlich für den Testleiter. Python erzeugt die synthetischen CSV-Eingaben; LibreOffice wird für die tatsächliche Oberflächenbearbeitung benötigt.

```powershell
python -B benchmarks/libreoffice-monatsabschluss/vorbereiten.py --arbeitsordner "$env:APPDATA\openhiatus\Arbeitsbereich\LibreOffice-Test Monatsabschluss September 2026"
```

Die Vorbereitung erzeugt 18 Rechnungen und 20 Zahlungszeilen als UTF-8-CSV mit BOM, Semikolon und ISO-Daten. `Abgabe` bleibt leer. Keine Formeln, Ergebnisarbeitsmappen, Berichte oder PDFs werden vorgegeben.

```text
<gewählter Arbeitsordner>
├── Input
│   ├── Rechnungen.csv
│   └── Zahlungen.csv
└── Abgabe
```

`--arbeitsordner` kann auf ein anderes leeres Testverzeichnis zeigen. Die frisch erzeugten Auftragstexte unter `Vorbereitung/` enthalten den konkreten Pfad; die eingecheckten [Arbeits-](<Arbeitsauftrag für openhiatus.txt>) und [Korrekturvorlagen](<Korrekturauftrag für openhiatus.txt>) enthalten Platzhalter. Beide werden als normale Nachrichten übergeben. `/goal` ist in der aktuellen App zurückgestellt.

Lösungen, Korrekturanweisung und Bewertungsprogramme bleiben beim Testleiter unter `benchmarks/libreoffice-monatsabschluss`. Diese organisatorische Trennung ist keine technische Zugriffssperre.

## Ablauf

1. Andere Desktopaufträge abwarten. Während der Bearbeitung Maus und Tastatur verfügbar halten und keine persönlichen Dokumente als Testdaten verwenden.
2. Den gesamten frisch erzeugten Arbeitsauftrag in openhiatus senden. Alle Datei- und Datenzugriffe, Importe, Bearbeitungen, Speichervorgänge und PDF-Exporte erfolgen über sichtbares LibreOffice mit Bildschirmbildern, Maus und Tastatur. Normales Einfügen und Calc-Formeln sind erlaubt. Shell, direkte Dateioperationen, Skripte, UNO, Makros, Headless-Konvertierung und weitere Agenten sind ausgeschlossen.
3. Auftrags-ID, Modell, Beginn, Rückfragen und manuelle Eingriffe erfassen. Keine Sollzahlen während des Laufs vorgeben.
4. Erst nach Speicherung und sichtbarer Prüfung aller drei Pflichtdateien die erste Fassung archivieren. Die geöffneten Dokumente bleiben erhalten.
5. Danach den frisch erzeugten Korrekturauftrag als zweite Nachricht senden: P-014 ist von 600 auf 700 Euro zu berichtigen. Rohdaten und Originalblätter bleiben unverändert; eine dokumentierte Korrektur aktualisiert die Auswertung.
6. Die korrigierte Fassung separat archivieren. Beide Phasen unabhängig auswerten.

Die Zielzeit von 60–90 Minuten für Phase 1 ist eine zusätzliche Metrik, keine automatische Abbruchgrenze. Die Korrekturphase wird separat gemessen.

## Archivieren und prüfen

```powershell
python -B benchmarks/libreoffice-monatsabschluss/vorbereiten.py --arbeitsordner '<derselbe Arbeitsordner>' --archivieren vorher
# Erst danach die Korrektur bearbeiten lassen.
python -B benchmarks/libreoffice-monatsabschluss/vorbereiten.py --arbeitsordner '<derselbe Arbeitsordner>' --archivieren nachher
python -B benchmarks/libreoffice-monatsabschluss/vorbereiten.py --arbeitsordner '<derselbe Arbeitsordner>' --pruefen-input
python -B benchmarks/libreoffice-monatsabschluss/auswerten.py --abgabe '<Archivpfad der ersten Phase>' --oracle benchmarks/libreoffice-monatsabschluss/oracle.json --phase vorher --output benchmarks/libreoffice-monatsabschluss/auswertungen/pruefung-vorher.json
```

Für die Korrektur `--phase nachher` und eine separate Ausgabedatei verwenden. Die Archivierung verweigert fehlende oder leere Pflichtdateien und erkennt Änderungen während der Kopie. Pflichtdateien sind `OP_September_2026.ods`, `Managementbericht_September_2026.odt` und `Managementbericht_September_2026.pdf`.

Der Evaluator liest ODS/ODT als ZIP/XML ohne Änderungen oder Neuberechnung. Er prüft gespeicherte Kennzahlen, Formelzellen, Quellblätter, Zellfehler und Diagrammexistenz. Nicht eindeutig zugeordnete Beschriftungen bleiben manuell zu prüfen. Formeln und Diagrammexistenz allein beweisen keine richtige Abhängigkeit oder Datenreihe.

PDF-Prüfungen benötigen optional PyMuPDF oder pypdf in der gewählten Python-Umgebung. Ohne diese Abhängigkeit bleibt die PDF-Prüfung offen. Das gesamte PDF zusätzlich visuell auf eine Seite, abgeschnittene Inhalte, Lesbarkeit und konsistente Zahlen prüfen. Eine Textextraktion ist keine Layoutabnahme.

## Werkzeugprotokoll und Prüfgrenzen

`protokoll_pruefen.py` unterstützt das historische JSONL-Format mit `event_msg`, `response_item`, `function_call` und `custom_tool_call`. Es liest nur eine ausdrücklich gewählte Datei oder genau zugeordnete Thread-ID. Es ist kein zugesicherter Parser der aktuellen Pi-Sitzungsdateien. Ein Beispiel für ein tatsächlich in diesem Format vorhandenes Protokoll:

```powershell
python -B benchmarks/libreoffice-monatsabschluss/protokoll_pruefen.py --log '<explizit gewähltes JSONL-Protokoll>' --output benchmarks/libreoffice-monatsabschluss/auswertungen/werkzeugpruefung.json
python -B -m unittest discover -s benchmarks/libreoffice-monatsabschluss -p '*_test.py'
```

Für aktuelle Pi-Läufe den tatsächlichen Werkzeug- und Bildverlauf separat sichern und prüfen. Nicht unterstützte, fehlende oder unvollständige Protokolle ergeben **UI-Regel nicht prüfbar**, keinen bestandenen Lauf. Auch erlaubte Bildschirmaktionen sind visuell zu kontrollieren: in ein Terminal eingetippte Skripte bleiben ein Regelverstoß. Der Parserstatus `no_logged_violation` ist keine vollständige Freigabe.

## Bewertung: 100 Punkte

| Kategorie | Punkte |
| --- | ---: |
| Rechnerische Richtigkeit und Kontrollgleichungen | 35 |
| Vier Datenfehler samt korrekter Behandlung | 20 |
| Nachträgliche Korrektur bei erhaltenen Originalen | 15 |
| Calc: Formeln, Originalblätter, Diagramm und Lesbarkeit | 15 |
| Writer/PDF: Zahlenkonsistenz, Empfehlungen und lesbare Seite | 15 |

90–100: sehr gut; 75–89: brauchbar mit Schwächen; unter 75: nicht vollständig bestanden. Ein nachgewiesener UI-Regelverstoß bedeutet unabhängig vom Punktwert Nichtbestehen. Fehlende oder unlesbare Pflichtdateien bedeuten keine vollständige Abgabe. Die automatische Bestandsprüfung vergibt keine vollständige Punktzahl. `oracle.json` enthält die mit `Decimal` berechneten Kontrollwerte beider Phasen ausschließlich für den Testleiter.

Zeit bis zur ersten korrekten Abgabe, Korrekturzeit, Werkzeug-/Bildzahl, Fehlbedienungen, Wiederherstellungen und Eingriffe separat protokollieren. Ein erfolgreicher neuer Lauf belegt nur den tatsächlich geprüften Testfall; wiederholte oder veränderte Datensätze sind eigene Abnahmen.
