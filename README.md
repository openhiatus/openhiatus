# openHiatus

Ein persönlicher Windows-Assistent zum Sprechen, Schreiben und Ausführen von Aufgaben. openHiatus verbindet eine lokale Desktop-App mit wählbaren KI-Modellen, Sprachdiensten und einem persönlichen Gedächtnis.

**Status: Alpha · Version 0.1.5 · Windows x64 · MIT**

Der aktuelle Entwicklungsstand wird als Alpha öffentlich weiterentwickelt. Funktionen, Oberfläche und Datenformate können sich ändern; Fehler und unvollständige Bereiche sind zu erwarten. Dieses Repository enthält den Quellcode und die Entwicklungsdokumentation. Vorgefertigte Windows-Pakete sind darin nicht enthalten.

## Was bereits funktioniert

- Gespräche per Text oder Sprache, mit getrennten Ansichten für Aufgaben, Gedächtnis, Skills und Einstellungen.
- ChatGPT-Anmeldung sowie eigene Zugänge für Anthropic, Google, OpenRouter, OpenAI und lokale OpenAI-kompatible Modellserver.
- Bis zu zwei Hintergrundaufträge, während das Gespräch erreichbar bleibt; Ergebnisse und Verbrauch stehen bei der jeweiligen Aufgabe.
- Werkzeuge für Dateien, Shell und Windows-Desktopsteuerung sowie Unterstützung für eigene lokale Skills.
- Persönliches Gedächtnis mit Quellen, Berichten und bearbeitbaren Kernvorgaben.

Die Agent-Laufzeit basiert auf Pi; Sprache verwendet Inworld. openHiatus benötigt keine separate Codex- oder OpenClaw-Installation. Modellanbieter und Sprachdienste werden mit eigenen Zugängen eingerichtet. Verfügbarkeit, Kontingente und Kosten richten sich nach dem gewählten Dienst.

## Aus dem Quellcode starten

Voraussetzungen:

- Windows x64 und Node.js 24 mit npm.
- Windows PowerShell und der 64-Bit-C#-Compiler des .NET Framework 4 unter `%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe`. Der Build verwendet ihn für die nativen Prozess- und Hotkey-Helfer.

Im Projektordner:

```powershell
npm ci
npm run check
npm start
```

`npm start` baut die Anwendung und öffnet sie in Electron. Die Entwicklung und die nativen Helfer sind derzeit auf Windows ausgerichtet.

## Einrichten und bedienen

1. Beim ersten Start den Hinweis zu den Zugriffsrechten lesen und bestätigen.
2. Unter **Einstellungen → Modelle & Zugänge** mit ChatGPT anmelden oder einen eigenen Anbieter einrichten. Modelle für Gespräch, Arbeit und Gedächtnis auswählen. Für lokale Server Basis-URL und Modellkennung eintragen.
3. Für Sprache unter **Einstellungen → Sprache & Geräte** einen eigenen Inworld-Zugang hinterlegen, Geräte auswählen und den Sprachtest ausführen. Texteingabe ist auch ohne Sprachdienst möglich.

| Taste | Aktion |
| --- | --- |
| F8 | Aufnahme starten oder beenden |
| F9 | Transkriptentwurf senden, wenn „Transkript prüfen“ aktiviert ist |
| Strg+Enter | Nachricht im Appfenster senden |
| Escape / Strg+Alt+F12 | Gespräch und verwaltete Ausführung stoppen |

Aufgaben können außerdem einzeln in ihrer Aufgabenansicht gestoppt werden. Bei belegten globalen Hotkeys zeigt die App einen Hinweis; die Schaltflächen im Fenster bleiben verfügbar.

## Daten und Zugriffsrechte

Einstellungen, Verlauf und Gedächtnis liegen unter `%APPDATA%/openhiatus`, eigene Skills unter `%APPDATA%/openhiatus/pi/skills`. Zugangsdaten werden mit Electron safeStorage und Windows DPAPI geschützt. Persönliche Profile und Zugangsdaten gehören nicht ins Repository.

Eigene Skills werden als lokale Ordner mit einer `SKILL.md` gepflegt. Neue Profile starten ohne vorinstallierte Skills; Quellcode und Windows-Paket enthalten keine Skill-Sammlung.

openHiatus arbeitet mit den Rechten des Windows-Benutzerkontos und besitzt keine Sandbox. Desktopaktionen können sichtbare Programme bedienen und Dateien verändern. Stopp hält weitere verwaltete Ausführung an; bereits erfolgte Änderungen bleiben bestehen. Ausdrücklich eigenständig übergebene Arbeitsfenster laufen weiter. Texteingaben über die Zwischenablage ersetzen deren Inhalt.

Bei Cloudmodellen und Sprachdiensten werden die für den jeweiligen Auftrag benötigten Daten an den ausgewählten Anbieter übertragen. Lokale Datenablage bedeutet daher keinen vollständig offline arbeitenden Assistenten.

## Bekannte Grenzen und nächste Schritte

Gmail und andere persönliche Dienste sind noch nicht angebunden; die Dienstansicht ist eine Vorbereitung. Live-Audio und `/goal` sind zurückgestellt. Die Zuverlässigkeit der Desktopsteuerung hängt unter anderem vom gewählten Modell und der jeweiligen Oberfläche ab.

Die nächsten Arbeiten betreffen Computersteuerung, eine anpassungsfähige Oberfläche und Dienstanbindungen. [Vision](docs/vision.md), [Roadmap](docs/roadmap.md) und [Gesamtplan](docs/gesamtplan.md) beschreiben die Richtung und den geplanten Ausbau. Die öffentliche Weiterentwicklung beginnt bereits mit dieser Alpha.

## Entwicklung und Prüfungen

`npm run check` führt Architekturprüfung, Typprüfung und Tests aus. Weitere Prüfungen bei Änderungen an Oberfläche, IPC oder Speicherung:

```powershell
npm run build
npm run test:ui
npm run test:chatgpt-ui
npm run test:conversation
npm run test:workflow
npm run test:ipc
npm run test:storage-ui
npm run test:memory-storage-ui
npm run test:memory-ui
```

`npm run package` erstellt ein lokales Windows-Entwicklungspaket; `npm run test:package` prüft dieses Paket. Generierte Builds, Pakete, Testprofile und Laufberichte werden nicht eingecheckt. Synthetische Praxisaufgaben stehen unter [benchmarks](benchmarks/README.md).

Die [Architekturübersicht](docs/architekturpruefung.md) erläutert die Modulgrenzen. Das [Testprotokoll](docs/openhiatus-testprotokoll.md) hält datierte lokale Entwicklungsprüfungen fest. Ältere Dokumente beschreiben ihren jeweiligen historischen Stand.

## Lizenz

openHiatus steht unter der [MIT-Lizenz](LICENSE). Abhängigkeiten und mitgelieferte Komponenten behalten ihre eigenen Lizenzen.
