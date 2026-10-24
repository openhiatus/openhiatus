# openHiatus – Entwicklungsplan

Stand: 21. Oktober 2026. Anzeigename: `openHiatus`, technischer Slug und Profil: `openhiatus`. Dieser Plan hält die Migration von der früheren Codex-basierten Entwicklungsreihe 0.4.x zur aktuellen Pi-basierten Reihe 0.1.x fest.

**Umsetzungsstand:** openHiatus verwendet Pi und benötigt keine Codex-Laufzeit. Eigene lokale Skills können eingebunden werden; eine Skill-Sammlung wird nicht mitgeliefert. Maßgeblich für den tatsächlich geprüften Stand sind [Testprotokoll](openhiatus-testprotokoll.md) und [Pi-Anbindung](spike-ergebnis.md). Die ursprünglichen Tagesabschätzungen wurden durch überprüfbare Abnahmeschritte ersetzt. `/goal` ist zurückgestellt.

Dieser Plan dokumentiert die technische Migration. Für den weiteren Produktausbau mit neuer UI, Diensten und öffentlicher Auslieferung gelten die aktuelle [Vision](vision.md) und der [Gesamtplan](gesamtplan.md).

## Ziel

openHiatus entwickelt die frühere Codex-basierte Fassung 0.4.3 als eigenständigen Pi-basierten Desktop-Assistenten weiter. Er hängt **weder von Codex noch von OpenAI-Modellen ab**. Als Agent-Laufzeit dient **Pi** (`pi-coding-agent`). Damit lassen sich Modelle verschiedener Anbieter verwenden: Anthropic, Google, OpenRouter, lokale Modelle und weiterhin auch OpenAI, falls gewünscht.

Die aktuelle Entwicklung liegt in **eigenem Projektordner und eigenem Repository**. Ältere Installationen und ihre Profile werden durch die aktuelle Anwendung nicht verändert.

## Grundentscheidungen

| Entscheidung | Festlegung |
| --- | --- |
| Agent-Laufzeit | Pi statt Codex-App-Server |
| Rechte | **Nur Vollzugriff** (bisher Risk). Safe Mode, Windows-Sandbox und Ordnerfreigaben entfallen vorerst. |
| Desktopsteuerung | Bleibt bei `@trycua/cua-driver`, als eigenes openHiatus-Werkzeug für Pi |
| Sprache | Inworld STT/TTS unverändert übernommen |
| Live | Entfällt in openHiatus (`live.ts`, gpt-live). Wird später als eigene Ausbauoption der [Vision](vision.md) neu bewertet. |
| Gedächtnisberichte | Direkter Modellaufruf ohne Agent und ohne Werkzeuge |
| Gesprächsagent | Pi-Sitzung, die **ausschließlich** die Dialog-Werkzeuge bekommt (kein bash/write/edit) |
| Datenablage | `%APPDATA%/openhiatus`, getrennt von früheren Installationen. Kein automatischer Import im ersten Wurf. |
| Codex | Kein Bestandteil von openHiatus. Kein Adapter zum Umschalten. |

## Was aus der früheren Entwicklungsreihe übernommen wird

**Unverändert oder fast unverändert:**
- Renderer/UI: Präsenz, Gespräch, Hintergrundaufträge, Gedächtnis-Ansicht, Earcons, Sprachwarteschlange
- `speech.ts`, `activity-overlay.ts`, `native-hotkeys.ts` mit `openhiatus-hotkeys.cs`
- `memory.ts`, `storage.ts`, `redact.ts`, Identität und Kern
- `computer.ts` (cua-driver-Anbindung, Frame-Prüfung), `desktop-coordinator.ts`
- `jobs.ts` (parallele Aufträge, Ressourcenvormerkung)
- `codex-process-host.cs` wird zum allgemeinen `openhiatus-process-host` (Prozessbaum, Stopp)

**Wird umgebaut:**
- `contracts.ts`: `CodexAdapter`/`CodexEvent` werden zu `AgentAdapter`/`AgentEvent`. Login und Sandbox-Einrichtung wandern in eine eigene Anbieter-Verwaltung.
- `controller.ts`: Codex-Begriffe raus, Moduswechsel raus, Live raus
- `main.ts`: Pi statt `codex.exe` starten
- `instructions.ts`, `dialog.ts`: Codex-spezifische Anweisungen (Code Mode, `apply_patch`, Sandbox-Hinweise) entfernen, gegen das neue Modell abstimmen
- `memory-summarizer.ts`: neues Backend über direkten Modellaufruf
- Einstellungen → Modelle & Zugänge: mehrere Anbieter und Schlüssel sowie eine eigenständige offizielle ChatGPT-Anmeldung mit eigener Registrierung, ohne Codex-Laufzeit
- Skills-Ansicht: Pi-Skills statt `skills/list` von Codex

**Entfällt:**
- `codex.ts`, `codex-rpc.ts`, alle `codex*.test.ts`
- `folder-access.ts`, `folder-permissions.ts`, `FolderAccessView`, `AccessModeSwitch`, `access-mode.ts`
- `live.ts`, `live-audio.ts` mit Tests
- Paketabhängigkeit `@openai/codex-win32-x64`

## Zielarchitektur

```
Electron-Hauptprozess (AppController)
 ├─ SpeechService (Inworld)            unverändert
 ├─ MemoryStore + MemorySummarizer ──► ModelClient (direkter API-Aufruf)
 ├─ ProviderStore (Schlüssel, Modelle, Windows-Schlüsselschutz)
 └─ AgentAdapter ×n (Hauptauftrag, Dialog, Worker)
       └─ PiAdapter ──► Agent-Host-Kindprozess (über openhiatus-process-host)
                         ├─ Pi-Agent-Sitzung
                         ├─ Pi-Standardwerkzeuge (read, write, edit, bash)  [nicht im Dialog]
                         └─ openHiatus-Werkzeuge: computer, Dialog-Tools  ◄──► Rückruf an den Hauptprozess
```

**Offene Kernfrage für Phase 0: Wie wird Pi angebunden?**

- **Variante A – Pi-RPC-Modus** (`pi --mode rpc`, JSONL über stdin/stdout). Das war der Weg der früheren Codex-basierten Fassung. Prompt, Steer, Follow-up, Abort, Modellwahl und Events gibt es. Eigene Werkzeuge müssen allerdings als Pi-Extension laufen, die für `computer` und die Dialog-Tools zu openHiatus zurückrufen muss.
- **Variante B – kleiner eigener Agent-Host mit dem Pi-SDK**, als Node-Kindprozess, den openHiatus startet. Eigene Werkzeuge werden direkt registriert, das Protokoll zu openHiatus bestimmen wir selbst. Pi-Updates betreffen dann aber unseren Host-Code.

Entschieden und implementiert: **B**. Der echte SDK-Durchlauf ist in `docs/spike-ergebnis.md` dokumentiert.

## Phasen

Jede Phase endet mit grünem `typecheck`/`test`/`build` und einem Eintrag im Testprotokoll.

### Phase 0 – Machbarkeits-Spike

Isolierte technische Integrationstests prüfen die benötigten Grenzen vor der durchgehenden UI-Abnahme. Die nachgewiesene SDK-Anbindung ist direkt in den Agent-Host übernommen.

1. Pi unter Windows starten. Prüfen, welche Shell das `bash`-Werkzeug nutzt (Git Bash, PowerShell?) und wie es sich mit deutschen Pfaden und Umlauten verhält.
2. Die gewählte Variante B mit einem Werkzeug prüfen, das **ein PNG als natives Werkzeug-Ergebnis** zurückgibt. Variante A bleibt eine dokumentierte Alternative und wird nicht als zweiter Adapter implementiert.
3. Abbruch: `abort` während eines laufenden Werkzeugs und während eines langen `bash`-Befehls. Bleiben Kindprozesse übrig? Funktioniert die Kombination mit `openhiatus-process-host`?
4. Echte Desktopsteuerung mit cua-driver und 2–3 Kandidatenmodellen, z. B. Claude Sonnet, Gemini und ein günstiges Modell, an der bestehenden Testanwendung aus dem Computer-Use-Testprotokoll.

**Fertig, wenn:** die Anbindungsvariante entschieden ist, ein Modell die Testanwendung bedient und Abort ohne übrig gebliebene Prozesse nachgewiesen ist. Die Ergebnisse stehen in `docs/spike-ergebnis.md`.

### Phase 1 – Projektgerüst

- Den openHiatus-Quellstand in einem eigenständigen Projektverzeichnis und Repository als Baseline sichern. Persönliche Profile, Zugangsdaten und lokale Laufartefakte bleiben außerhalb des Quellbestands.
- Umbenennen: Produktname, App-ID, `%APPDATA%`-Pfad, Fenstertitel.
- Codex, Safe Mode, Ordnerfreigaben und Live entfernen. Die Stellen, an denen der Agent fehlt, werden vorübergehend durch einen Platzhalter-Adapter ersetzt.

**Fertig, wenn:** die App startet, Sprache (F8, Transkript, TTS) funktioniert und der Agent ehrlich als „nicht verbunden“ angezeigt wird.

### Phase 2 – AgentAdapter und Hauptauftrag

- Neutrale `AgentAdapter`- und `AgentEvent`-Typen in `contracts.ts`
- `PiAdapter`: Start, `run`, Streaming, `steer`, `stop`, Fortsetzen von Sitzungen über die gespeicherte Sitzungs-ID
- Pi-Events werden auf die vorhandenen Aktivitätsereignisse abgebildet: Befehl, Dateiänderung, Fehler, Token-/Kontextverbrauch für `ContextMeter`
- Prozessbaum über `openhiatus-process-host`, globaler Stopp (Strg+Alt+F12) beendet alles

**Fertig, wenn:** ein gesprochener Auftrag eine echte Datei erstellt, die Antwort gesprochen wird, der Stopp mitten im Auftrag wirkt und nach einem Neustart unterbrochene Arbeit angezeigt, aber nicht wiederholt wird.

### Phase 3 – Desktopsteuerung

- `computer` als openHiatus-Werkzeug für Pi, mit derselben Frame-Logik wie in openHiatus
- Gemeinsame Desktopsperre (`desktop-coordinator`) und die Vorschau in der UI
- Anweisungen zur bildgestützten Bedienung auf das gewählte Modell abstimmen

**Fertig, wenn:** die Prüfabläufe aus dem Computer-Use-Testprotokoll von openHiatus bestehen (Testanwendung, verändertes Layout, Folgeauftrag).

### Phase 4 – Gesprächsagent und Hintergrundaufträge

- Dialog-Sitzung, die nur die Dialog-Tools bekommt. Nachweisen, dass sie keine Shell und keinen Dateizugriff hat.
- Worker für Hintergrundaufträge über `JobManager`, zwei parallele Aufträge, gezielter Stopp pro Auftrag
- Kurze Eingangsbestätigung, Ergebniszuordnung, Fortschritt in der Auftragskarte

**Fertig, wenn:** der Ablauf aus dem Standard-Gespräch-Testprotokoll besteht. Dazu gehören zwei gleichzeitige Aufträge und Fragen während laufender Arbeit.

### Phase 5 – Anbieter und Einstellungen

- `ProviderStore`: API-Schlüssel pro Anbieter mit Windows-Schlüsselschutz (wie bisher). Umgebungsvariablen mit fremden Schlüsseln werden nicht übernommen.
- Modellwahl getrennt für Arbeit, Gespräch und Gedächtnis, z. B. ein günstiges Modell für das Gespräch
- Verbindungstest pro Anbieter. Schlüssel erscheinen nie im Protokoll (`redact.ts` um weitere Schlüsselformate erweitern).

**Fertig, wenn:** sich ein Anbieter ausschließlich über die UI einrichten, testen, wechseln und entfernen lässt.

### Phase 6 – Gedächtnisberichte

- `MemorySummarizer` bekommt ein Backend über `ModelClient` mit strukturierter Ausgabe. Kein Agent und keine Werkzeuge.
- Bestehende Prüfungen `test:memory-*` übernehmen und anpassen

**Fertig, wenn:** Tages-, Wochen- und Monatsberichte mit Quellen entstehen und der Abbruch eines Berichts keinen laufenden Auftrag berührt.

### Phase 7 – Skills und lange Ziele

- Skills-Ansicht auf eigene lokale Pi-Skills umstellen (Ordner, SKILL.md-Format). Skills liegen im Benutzerprofil; das Repository und die Pakete enthalten keine Skill-Sammlung und installieren oder migrieren keine Skills automatisch.
- `/goal` als eigene Schleife in openHiatus: Ziel, Fortsetzungsprompt, Tokenbudget, ausdrückliche Bestätigung „Ziel erreicht“. Optional zurückstellen.

**Fertig, wenn:** ein Skill aus der Ansicht in einen Auftrag eingefügt und von Pi verwendet wird.

### Phase 8 – Paket und Abnahme

- `npm run package` mit Pi bzw. Agent-Host und den nativen Bibliotheken außerhalb von ASAR
- Starten ohne Node.js, ohne Entwicklerterminal und ohne Codex auf einem frischen Profil
- README, Roadmap und Testprotokolle für openHiatus schreiben. UTF-8 und Umlaute prüfen.

**Fertig, wenn:** das Paket auf einem Windows-Testsystem den Kernablauf besteht: starten, Anbieter einrichten, sprechen, Datei- und Desktopauftrag, Stopp.

## Umsetzungsmeilensteine

1. Eigene Quellbaseline und getrenntes Profil.
2. Echter Pi-Host mit Bildtransport, Sitzungsfortsetzung und bestätigtem Prozess-Stopp.
3. Anbieter einrichten, Sprach-/Dateiauftrag ausführen und Neustart ohne Wiederholung.
4. Desktopsteuerung, erreichbares Gespräch und zwei geordnete Hintergrundaufträge.
5. Direkte Gedächtnisberichte, Skills, Verbrauchsanzeige und eigenständig startbares Windows-Paket.

Die Abnahme erfolgt anhand tatsächlicher Tests. Der [aktuelle Prüfstand](openhiatus-testprotokoll.md) unterscheidet lokale Integration und noch nicht erfolgte externe Anbieter-/Sprachabnahme.

## Risiken

- **Modellqualität bei der Desktopsteuerung:** Was mit GPT über Codex funktioniert hat, muss mit anderen Modellen neu nachgewiesen werden. Deshalb steht es schon im Spike.
- **Windows und Pi:** Pi kommt aus der Unix-Welt. Shell, Pfade, Kodierung und das Beenden von Prozessen sind die wahrscheinlichsten Stolpersteine.
- **Pi ändert sich schnell:** Version im Paket fest einfrieren und Updates bewusst einspielen.
- **Vollzugriff ohne Sandbox:** Jeder Auftrag läuft mit den Rechten des Windows-Benutzers. Hinweis und einmalige Bestätigung beibehalten, Werkzeugaufrufe vollständig protokollieren. Spätere Option: Rückfrage vor bestimmten Befehlen, z. B. Löschen.
- **Hotkey-Konflikte:** Ältere und aktuelle Installationen können beide F8/F9 belegen. Bei belegten Tasten zeigt openHiatus einen Hinweis; die Schaltflächen bleiben verfügbar. Für die Hotkeys wird die andere Version geschlossen und openHiatus neu gestartet.
- **Kosten:** Die eigenständige offizielle ChatGPT-Anmeldung ist zusätzlich zu API-Anbietern implementiert. Verbrauch pro Auftrag und der jeweilige Zugangsweg bleiben sichtbar; eine ChatGPT-Nutzung wird nicht als API-Schlüsselabrechnung dargestellt.

## Offene Entscheidungen

1. Bereits entschieden: Anzeigename `openHiatus`, technischer Slug `openhiatus` und MIT-Lizenz ab dem ersten öffentlichen Quellstand.
2. Startanbieter und -modell für Arbeit, Gespräch und Gedächtnis
3. Einen späteren ausdrücklichen Import aus älteren Installationen bewerten oder mit frischem Profil beginnen
4. `/goal` in Phase 7 oder zurückstellen
