# openHiatus unter Windows installieren

Ab Version 0.0.20 lässt sich openHiatus als einzelne `openHiatus-Setup-<Version>-x64.exe` bauen. Voraussetzung zum **Benutzen** ist Windows 10 ab Version 2004 oder Windows 11 auf x64. Node.js, Git, ein Compiler und eine separate Pi-/Codex-Installation werden auf dem Zielrechner nicht benötigt. Die Anwendung bringt ihre Laufzeit und die nativen Windows-Helfer mit.

Die Alpha-Setup-Datei ist noch nicht digital signiert. Windows kann deshalb eine SmartScreen-Warnung anzeigen. Eine veröffentlichte Download-Version oder eine Prüfung auf einer frisch aufgesetzten Windows-VM wird mit dem lokalen Build nicht behauptet.

## Installation

1. Die für diese Version gebaute Setup-Datei öffnen und eine Sprache wählen: Englisch, Spanisch, Französisch, Deutsch, Chinesisch (vereinfacht), Japanisch oder Portugiesisch (Brasilien).
2. Nach der Begrüßung bei Bedarf **Desktop-Symbol erstellen** auswählen. Der Eintrag im Startmenü wird immer angelegt.
3. **Installieren** wählen. Am Ende kann openHiatus direkt geöffnet werden.

Setup installiert ausschließlich für das aktuelle Windows-Benutzerkonto unter `%LOCALAPPDATA%\Programs\openHiatus`. Administratorrechte und eine Auswahl von Installationsordnern sind im normalen Ablauf nicht erforderlich. Die App erhält ein eigenes Symbol für Setup, Startmenü und Taskleiste.

Ab Version 0.0.21 stehen diese sieben Sprachen auch in der App zur Verfügung. Ab 0.0.22 öffnet der Knopf **Language · 语言** mit dem Sprachsymbol A/文 direkt über **Arbeitsordner** in der linken Seitenleiste die Auswahl mit Flaggen und Sprachnamen in ihrer eigenen Schrift. Die Auswahl wirkt sofort und bleibt gespeichert. Setup gibt seine Sprache nur für ein neues Profil vor. Eine bestehende App-Auswahl wird beim Update nicht überschrieben; ältere Profile beginnen weiterhin auf Deutsch. Nachrichten, eigene Dateien und laufende Aufgaben bleiben beim Wechsel erhalten. Details stehen unter [Mehrsprachigkeit](localization.md).

Ab 0.0.24 führt die App beim ersten Start durch vier Schritte: Sprache und Zugriffshinweis, Konto verbinden, Sprache optional einrichten und eine erste Textantwort testen. **Weiter** und **Zurück** bleiben sichtbar. **Später fortsetzen** speichert den Schritt; **Einrichtung fortsetzen** führt auch nach einem Neustart zurück. Für den Textbetrieb genügt ein Modellzugang. Mikrofontest und zusätzlicher Inworld-Zugang sind freiwillig. Der abschließende Modelltest beginnt erst nach einem Klick, sendet nur eine feste Begrüßungsanfrage und lässt sich mit Stopp oder Esc abbrechen.

Eine vorhandene Anmeldung und ein bestehendes Profil derselben Windows-Anmeldung werden weiterverwendet. Bereits eingerichtete Profile bleiben beim gewohnten Einstieg. Unter **Einstellungen → Schritt für Schritt einrichten** lässt sich die Anleitung erneut öffnen. Eigene Daten liegen außerhalb des Programmordners unter `%APPDATA%\openhiatus`. Die [README](../README.md#first-time-setup) beschreibt die weitere Einrichtung.

## Updates und Autostart

openHiatus über sein Fenster schließen und anschließend die neuere Setup-Datei öffnen. Setup ersetzt die Programmdateien am selben Ort. Es beendet keine laufende Agentenarbeit zwangsweise; eine laufende App blockiert Update und Deinstallation. Eine ältere Setup-Version kann eine bereits installierte neuere Version nicht überschreiben.

Einstellungen, Zugänge, Verlauf, Gedächtnis und eigene Skills bleiben im bestehenden Profil. Setup entfernt beim Update nur veraltete Dateien aus seinem vorherigen Dateiverzeichnis, keine zusätzlich abgelegten unbekannten Dateien. Während Installation oder Update ist kein automatischer Neustart von Windows vorgesehen.

**Mit Windows starten** bleibt eine freiwillige Einstellung in **Einstellungen → Bedienung → Windows-Autostart**. Setup aktiviert sie nicht. Updates behalten sowohl eine aktivierte Registrierung als auch eine Deaktivierung im Windows-Task-Manager bei. Der Start erfolgt minimiert in der Taskleiste.

Wer vorher einen portablen Paketordner verwendet hat, öffnet nach der Installation die App aus dem Startmenü. Ist Autostart gewünscht, die Option dort einmal einschalten, damit Windows den neuen Programmpfad verwendet. Das vorhandene Profil muss nicht kopiert werden. Erst danach den alten Paketordner entfernen; eigene Dateien darin vorher behalten.

## Deinstallation

openHiatus schließen und in den Windows-Einstellungen unter **Apps → Installierte Apps** beziehungsweise **Apps & Features** deinstallieren. Programmdateien, Setup-Registrierung und eigene Verknüpfungen werden entfernt. Eine Autostartregistrierung wird nur entfernt, wenn sie genau auf diese installierte Kopie zeigt.

Das Profil unter `%APPDATA%\openhiatus` einschließlich gespeicherter Zugänge sowie eigene Dateien bleiben erhalten. Eine erneute Installation kann das Profil weiterverwenden. Deinstallation ist daher keine Löschung persönlicher Daten.

## Setup bauen

Für die Entwicklung gelten die [Voraussetzungen in der README](../README.md#development-requirements). Im Projektordner:

```powershell
npm ci
npm run check
npm run installer
npm run test:installer
```

`npm run installer` baut die Anwendung, den portablen Paketordner und anschließend Setup. Die Dateien liegen unter:

```text
release/<Version>/installer/openHiatus-Setup-<Version>-x64.exe
release/<Version>/installer/openHiatus-Setup-<Version>-x64.exe.sha256
```

Der Build lädt einmalig den offiziellen [Inno-Setup-Compiler 7.1.0](https://github.com/jrsoftware/issrc/releases/tag/is-7_1_0), prüft seinen fest hinterlegten SHA-256-Wert und richtet ihn portabel unter `.tmp/build-tools` ein. Es werden keine globalen Compilerverknüpfungen oder Dateizuordnungen angelegt. Mit `OPENHIATUS_ISCC` kann ein bereits vorhandener kompatibler `ISCC.exe` ab Version 7.1 angegeben werden. Für einen bereits gebauten aktuellen Paketordner genügt `node scripts/installer.mjs`.

## Was die Installationstests prüfen

`npm run test:installer` baut eigene Test-Setups mit eindeutiger App-ID, eigenem Windows-Registrierungseintrag, eigenen Verknüpfungen und Ordnern unter `.test-data`. Es verwendet synthetische Daten und ein separates App-Profil. Das normale openHiatus-Profil und seine Autostartregistrierung werden nicht verändert.

Geprüft werden Neuinstallation, Upgrade von einem synthetischen älteren Paket, erneute Installation, Verhinderung von Downgrades, Erhalt von Einstellungen und einer in Windows deaktivierten Autostartregistrierung, Startmenü und optionaler Desktop-Eintrag, Schutz einer laufenden App sowie Deinstallation. Eine beschädigte alte Dateiliste darf weder über relative Pfade noch über Verzeichnisverknüpfungen außerhalb des Installationsordners löschen. Die installierte App führt vorhandene Gesprächs-/Worker- und Desktopprüfungen ohne globales Node oder Codex in ihrem Suchpfad aus. Der eigene Setup-Assistent wird in allen sieben Sprachen bis zur Installationsauswahl bedient und anschließend abgebrochen. Die Sprachregistrierung wird für jede Sprache installiert und deinstalliert; ein Update in einer anderen Setup-Sprache muss die bereits gespeicherte App-Sprache erhalten.

Generierte Nachweise stehen unter `artifacts`; Pakete, Compiler, synthetische Profile und Bilder bleiben ignoriert. Diese lokale Prüfung ersetzt weder Tests auf frischen Windows-Versionen noch eine signierte Veröffentlichung.
