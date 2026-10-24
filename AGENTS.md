# Agentenhinweise für openHiatus

## Projekt

- Öffentliches Repository: [openhiatus/openhiatus](https://github.com/openhiatus/openhiatus).
- Standardbranch: `main`; Git-Remote: `origin`.
- Öffentliche Alpha unter [MIT](LICENSE), für Windows x64. Electron, React und TypeScript; Pi als Agent-Laufzeit.

## Orientierung

- [README](README.md): Einrichtung, verfügbare Funktionen, Grenzen und Prüfbefehle.
- [Architekturprüfung](docs/architekturpruefung.md): Modulgrenzen und tatsächlich umgesetzte Architektur.
- [Vision](docs/vision.md) und [Gesamtplan](docs/gesamtplan.md): Richtung und geplante Arbeiten.
- [Testprotokoll](docs/openhiatus-testprotokoll.md): datierte Prüfergebnisse. Historische Dokumente und ältere Testzahlen gelten für ihren jeweiligen Stand.

## Arbeitsregeln

- Vor Änderungen `git status --short` und `git remote -v` prüfen; vorhandene Nutzeränderungen erhalten.
- Die veröffentlichte Historie mit normalen weiteren Commits fortführen. Keine Neuinitialisierung, Änderung veröffentlichter Commits oder Force-Pushes ohne ausdrücklichen Auftrag.
- Alle versionierbaren Projektänderungen nach Abschluss der zugehörigen Prüfungen sofort committen und auf GitHub pushen; dafür nicht erneut nachfragen. Teilaufgaben zeitnah einzeln veröffentlichen, statt fertige Änderungen nur lokal zu sammeln. Die Regeln zum Ausschluss privater Daten, Zugangsdaten und generierter Artefakte gelten weiterhin.
- Das Repository und die Windows-Pakete enthalten keine Skill-Sammlung. Eigene Skills bleiben lokale Profildaten; der lokale Projektordner `/skills/` wird ignoriert und darf nicht versehentlich paketiert werden.
- Zugangsdaten, persönliche Profile, private Installationsgeschichten und lokale Bestandsangaben gehören nicht in Code oder Dokumentation. Für Beispiele und Tests synthetische Daten verwenden.
- Generierte Dateien und lokale Sicherungen bleiben in den ignorierten Arbeitsverzeichnissen. Tests mit eigenen Profilen ausführen; bestehende Benutzerprofile nicht verändern.
- Funktionszusagen und Dokumentation am tatsächlich implementierten Alpha-Stand ausrichten.

## Validierung

- Entwicklung benötigt Node.js 24 und die in der README genannten Windows-/C#-Werkzeuge.
- Bei Codeänderungen `npm run check` und `npm run build` ausführen; betroffene UI- oder Paketabläufe mit den passenden README-Prüfbefehlen prüfen.
- Bei reinen Dokumentationsänderungen UTF-8, lokale Links und inhaltliche Konsistenz prüfen; keine vollständige Testsuite allein dafür wiederholen.
