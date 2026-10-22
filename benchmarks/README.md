# Reproduzierbare Desktop-Benchmarks

Die Unterordner enthalten synthetische Aufgaben, Generatoren, Oracles und unabhängige Evaluatoren. Sie sind Controllerwerkzeuge für den Testleiter und werden nicht vom getesteten Worker ausgeführt.

- [Monatsabschluss](libreoffice-monatsabschluss/README.md): CSVs in Calc abgleichen, Writer/PDF erstellen und anschließend eine Zahlung korrigieren.
- [Auftragschaos](libreoffice-auftragschaos/README.md): einen großen, unregelmäßigen Auftragsexport in sichtbarem Calc bereinigen.

Historische Binärdateien und Vorbereitungsausgaben wurden lokal außerhalb des Repositorys archiviert. Sie werden weder umetikettiert noch als aktuelles openhiatus-Ergebnis ausgeliefert. Ein Quellcheckout enthält keine fertige Abgabe. Für einen Nachweis einen frischen Arbeitsordner vorbereiten, den tatsächlich ausgeführten Auftrag protokollieren und die gespeicherte Abgabe unabhängig prüfen.

Vorbereitung, Office-Ausführung und Auswertung sind getrennte Schritte. Unitprüfungen bestätigen nur Generator-/Evaluatorverhalten. Ohne vollständige Dateien, unterstützte Werkzeugprotokolle und Sichtprüfung gibt es keine vollständige Praxisabnahme. Generierte Inputs, Manifeste, Vorschauen und Auswertungen werden nicht eingecheckt; `oracle.json` bleibt als fachliche Prüfgrundlage erhalten.