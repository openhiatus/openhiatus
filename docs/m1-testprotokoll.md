# M1 – Umsetzung und Abnahme

> Historische Referenz einer früheren Entwicklungsreihe. Architektur, Bedienpfade, Versionsnummern und damalige Prüfergebnisse beschreiben den datierten Stand, keine neue Abnahme der aktuellen Pi-basierten Version. Lokale Nachweisdateien sind kein Bestandteil der öffentlichen Quellablage. Aktuelle Einrichtung und Prüfungen stehen in der README und im aktuellen Testprotokoll.

Stand: 5. Oktober 2026. **Der Kernablauf wurde in einer lokalen Windows-Testinstallation geprüft.** Das umfasst Mikrofon, Transkript, Codex-Dateiarbeit, hörbare Antwort, Anmeldung und Gespräch nach Neustart, Stopp per Schaltfläche und Escape sowie Schreib- und Netzwerkgrenzen. Noch nicht geprüfte Varianten sind unten ausdrücklich genannt.

## Vorhandener Ablauf

Eigenständige Electron-App mit React-Oberfläche, Codex-App-Server 0.160.0 und direkter Inworld-Anbindung. Aufnahme per Klick starten und beenden; WAV mit 16 kHz, mono, 16 Bit. Nach STT das Transkript prüfen, bearbeiten und bewusst senden. Codex arbeitet im eigenen Demoordner; Abschlussantwort wird auf Wunsch vorgelesen. Mikrofontest bleibt lokal. Ein Ausgabetest ruft Inworld auf und ist abrechenbar.

UI zeigt Gespräch, Verbindungen und tatsächliche Aktivitäten. Modellliste stammt von Codex. ChatGPT-Anmeldung erfolgt im Browser, API-Keys werden in der App eingegeben. Inworld-Kosten werden separat benannt; unbekannte Verbrauchswerte bleiben unbekannt. Kein automatischer kostenpflichtiger Anbieterwechsel.

M1 verwendet atomare, versionierte JSON-Dateien mit einer letzten gültigen Sicherung für den aktuellen Verlauf. Das ersetzt für diesen kleinen Umfang die im Zielbild vorgesehene SQLite-Datenbank. Laufende Aufträge werden nach Neustart als unterbrochen angezeigt und nicht erneut gesendet. Tages-, Wochen-, Monatsgedächtnis und Kern bleiben M3.

## Schutz und Grenzen

- Eigenes Datenverzeichnis und eigenes `CODEX_HOME`; keine Übernahme von Zugangsdaten, Erinnerungen oder Konfiguration anderer Anwendungen.
- Codex nutzt Windows-Sandbox im erhöht eingerichteten Modus, `workspace-write`, ohne Werkzeug-Netzwerk und ohne Rechteeskalation. Ohne bestätigte Bereitschaft kein Turn. Das begrenzt Schreibzugriffe; es ist keine virtuelle Maschine und keine Zusage, dass sämtliche Dateien außerhalb des Demoordners unlesbar sind. Provider-Verbindungen laufen außerhalb des Werkzeug-Netzwerks.
- Ein Windows-Job enthält den Codex-Prozessbaum vor der ersten Ausführung. Der lokale Prozessschutz überwacht außerdem den Electron-Hauptprozess. Stopp benötigt weder Modell noch Login; bestätigtes Ende und bloße Anforderung werden unterschieden. Eine Stopp-Störung sperrt weitere Aufgaben.
- Inworld-Zugang verschlüsselt über Electron `safeStorage`/Windows DPAPI; Codex-Zugang über dessen Windows-Keyring ohne Klartext-Fallback. Dies schützt nicht vor beliebigen Programmen desselben angemeldeten Windows-Nutzers oder einem Administrator.
- Der Renderer hat keinen Node-Zugriff, keine direkte Netzwerkverbindung und nur benannte, geprüfte IPC-Funktionen. Anmeldeseiten dürfen nur über erlaubte HTTPS-Hosts geöffnet werden.
- Bekannte Schlüssel und typische Tokenformen werden aus Gespräch, Ereignissen und Fehlermeldungen entfernt. Antworten erscheinen erst vollständig, damit über mehrere Token verteilte Schlüssel nicht vorzeitig angezeigt werden. Aktivitäten erscheinen während der Ausführung. Dies ist keine allgemeine automatische Erkennung aller sensiblen persönlichen Inhalte.
- Aufnahmen werden im Arbeitsspeicher gehalten. Gespräch, Aktivitäten und Codex-Laufzeitverlauf sind lokale Daten ohne zusätzlichen Tresor. Die App hat bewusst keine eigene Passwortsperre.

## Prüfungen

| Prüfung | Verfahren | Stand |
| --- | --- | --- |
| TypeScript und Produktionsbuild | Echter Compiler und Bundler | Bestanden |
| Zustände, Doppelversand, Wiederaufnahme, Stopprennen | Automatisierte Tests mit simuliertem Codex-Transport | Bestanden |
| Sprachprotokolle, Fehler, Abbruch, Limits | Simulierte HTTP-Antworten gegen reale dokumentierte Schnittstellen | Bestanden, kein echter Provider-Nachweis |
| WAV-Aufbereitung und verspätete Mikrofonfreigabe | Automatisierte Audio-Tests | Bestanden |
| Speicherfehler während Stopp; fehlerhafter Verlauf | Automatisierte Fehlerfälle | Bestanden |
| Oberflächenstart und IPC | Echte Electron-App mit frischem Testprofil | Bestanden |
| Codex-Prozessstart, Handshake und Anmeldestatus | Echter mitgelieferter Codex, anonymes Profil, kein Modellauftrag | Bestanden |
| Windows-Schlüsselspeicherung | Echte Electron/DPAPI-Speicherung mit synthetischem Nicht-Schlüssel | Bestanden; kein Provider-Login |
| Mikrofonaufnahme und Escape | Chromium-Testmikrofon in echter App | Bestanden; ersetzt keine Hardwareprüfung |
| Neustart und Einstellungen | Echte App zweimal mit demselben Testprofil | Bestanden |
| Eigenständig gepackte App | Gepackte EXE zweimal mit frischem Profil, echte DPAPI-Entschlüsselung nach Neustart, kompakte Fenstergröße | Bestanden |
| Prozessbaum und Hauptprozess-Absturz | Vier echte Windows-Tests: Stopp, Serverende, Prozessschutz-Absturz, openHiatus-Absturz; jeweils auch losgelöster Unterprozess | Bestanden |
| Codex-Anmeldung und echter Datei-Turn | ChatGPT-Anmeldung, echte Datei aus Demodaten; Thread anschließend fortgesetzt | Bestanden |
| Sandbox-Schreib- und Netzwerkgrenzen | Echte Befehle im eingerichteten Windows-Sandbox-Kontext | Bestanden: innen beschreibbar, außen verweigert, Netzwerk WSAEACCES 10013 |
| Inworld STT/TTS | Echte TTS-Antwort als WAV zurück an STT; keine simulierten Provider-Antworten | Bestanden: deutscher Testsatz wortgleich erkannt |
| Audioausgabe | Erste echte Codex-Antwort über gewähltes Gerät | In manueller Hörprüfung gut hörbar |
| Mikrofon mit vollständigem Auftrag | Physische Mikrofonaufnahme, Transkriptprüfung und Versand; Codex erzeugt Datei | Bestanden: Transkript stimmt, Datei „Sprachdemo“ enthält die drei Schritte |
| Stopp bei echtem Codex-Befehl | Startmarker, 45 Sekunden Wartezeit, danach unerwünschter Marker; während Wartezeit abgebrochen | Bestanden: bestätigt unterbrochen, zweite Datei auch 73 Sekunden nach Start nicht vorhanden |
| Neustart mit echtem Zugang und Gespräch | Aktualisiertes Paket öffnen, Gespräch erhalten, keine Wiederholung; neuer ausdrücklicher Turn setzt denselben Thread fort | Bestanden: Codex erinnert Datei „Sprachdemo“ und ihren Auftrag korrekt |
| Escape während echter Arbeit | Separater Vordergrundprozess mit verzögerter Datei, Abbruch über Tastatur | Bestanden: nach 150 ms bestätigt, verständliche Stopp-Antwort |
| Vollständige Sprachdemo in einem zweiten frisch angemeldeten Profil | Neue Anmeldung + echter Sprach-/Dateilauf | Noch nicht durchgeführt; frische Profile wurden bislang für lokale UI-/Speicher-/Mikrofontests verwendet |
| Globaler Hotkey mit physischer Tastatur außerhalb des App-Fensters | Strg + Alt + F12 | Noch nicht separat ausgelöst; Schaltfläche und Escape sind echt geprüft |

Die regulären Tests verwenden keine persönlichen Schlüssel. Testdaten liegen unter `.test-data`, Screenshots unter `artifacts`; beides wird nicht mit ausgeliefert. Die Tests mit simulierten Transporten beweisen die Anwendungslogik, nicht die Verfügbarkeit oder Abrechnung eines echten Kontos.

Ergebnis der abschließenden lokalen Prüfung: **55 von 55 automatisierten Prüfungen bestanden**, einschließlich des nativen Codex-Tests und der echten Windows-Prozessprüfungen. Der frühere erste Gesamtlauf hatte einen Fehler beim Entfernen eines temporär von Windows gesperrten Testordners nach dem bereits bestätigten Prozessende. Eine begrenzte Wiederholung der ausschließlich eigenen Testordner-Bereinigung behebt das. Der Oberflächentest wurde mit der aktualisierten gepackten EXE und einem weiteren frischen Profil erneut bestanden. Die Screenshots wurden visuell geprüft.

Historische Paketausgabe: `release/openhiatus-win32-x64/openhiatus.exe`. Das komplette Paketverzeichnis wird benötigt; Zugangsdaten werden ausschließlich über die App eingerichtet.

### Integrationstests am 5. Oktober 2026

- Codex-Anmeldung, Inworld-Anbindung und Windows-Sandbox wurden über die App eingerichtet. Nach einem Neustart blieb die Anmeldung erhalten und der Status zeigte `ready`.
- Ein synthetischer deutscher Satz wurde über Inworld in 4,872 Sekunden Audio umgewandelt, im echten Chromium-Audiodecoder eingelesen, als PCM-WAV exportiert und durch Inworld wortgleich erkannt. Das beweist den Cloud-Rundweg, nicht das Mikrofon.
- Der erste Modellauftrag erzeugte tatsächlich `aufgaben-live-test.md` im Demoordner. Verantwortliche, Termine und offene Fragen stimmen mit den synthetischen Projektnotizen überein; UTF-8-Inhalt wurde gelesen und geprüft. Die gesprochene Antwort bestand die manuelle Hörprüfung.
- Beim ersten Lesen wählte das Modell PowerShell ohne Encoding und bekam falsch dargestellte Umlaute. Es korrigierte den Aufruf selbst mit `-Encoding UTF8`; die Ergebnisdatei ist korrekt. Die openHiatus-Instruktion wurde zusätzlich um explizites UTF-8 bei PowerShell-Dateioperationen ergänzt, damit diese unnötige Wiederholung vermieden wird.
- Der nächste Auftrag setzte denselben Thread fort. Ein Vordergrundprozess legte den Startmarker an und wartete. Nach Klick auf Stopp wechselte openHiatus über `stopping` zu `interrupted`; die für nach 45 Sekunden geplante zweite Datei blieb auch nach 73 Sekunden aus. Es wurde keine erneute Aufgabe automatisch gestartet.
- Anschließend wurde ein vorgegebener synthetischer Sprachauftrag über ein physisches Mikrofon aufgenommen, das Transkript geprüft und gesendet. Derselbe Codex-Thread erzeugte die Datei `Sprachdemo` mit den drei inhaltlich passenden Schritten. Damit ist die reale Strecke Mikrofon → STT → Transkript → Codex → Datei nachgewiesen; die Sprachausgabe wurde separat manuell geprüft.
- `scripts/sandbox-check.ts` prüfte ohne Modellaufruf echtes `command/exec`: Schreibzugriff im Demoordner Exit 0; außerhalb Exit 24/UnauthorizedAccessException bei unverändertem synthetischem Sentinel; TCP-Zugriff im Sandboxprozess Exit 24/AccessDenied:10013. Derselbe Host-Zugriff war unmittelbar davor und danach erreichbar. Ein bloßer Timeout oder Skriptfehler wird ausdrücklich nicht als Nachweis akzeptiert. Der eigene Test-Prozessbaum wurde beendet.

Die native Computer-Use-Teststeuerung konnte wegen eines lokalen Kernel-Startfehlers nicht verwendet werden. Die App-Prüfung erfolgt deshalb mit dem vorhandenen Playwright/Electron-Testweg gegen die echte gepackte App. Während dieser Prüfung ist ein lokaler Debug-Zugang aktiv; nach dem Test wird die App regulär ohne Debug-Parameter gestartet.

### Korrekturen aus dem Praxistest

Die Oberfläche hatte Codex-Dateiverweise noch als rohen Markdown-Text angezeigt. Sie werden nun als verständliche Dateinamen dargestellt und lassen sich im Demoordner zeigen. Der Hauptprozess prüft vorher den tatsächlichen Dateipfad einschließlich Junctions; Verweise außerhalb des Demoordners werden abgelehnt. Dateien werden dabei nicht ausgeführt. Für die Sprachausgabe werden Linkziele und Markdown-Steuerzeichen entfernt. Abgebrochene Aufträge erhalten eine verständliche Antwort statt einer leeren Sprechblase. Unveränderte unmittelbar wiederholte Änderungsereignisse werden nur einmal angezeigt.

Nach dem Neubau blieben Anmeldung und Gesprächsverlauf erhalten; kein Auftrag lief von selbst los. Auf eine neue ausdrückliche Frage nach dem zuletzt gesprochenen Testauftrag antwortete Codex im fortgesetzten Thread korrekt mit „Sprachdemo“ und den drei nächsten Schritten. Anschließend wurde ein zweiter Warteauftrag über Escape abgebrochen. Die Antwort lautete „Auftrag gestoppt.“ Die gemessenen 150 ms beschreiben diesen einzelnen Lauf, keine garantierte Höchstdauer.

## Gemeinsame echte Abnahme

1. App öffnen; unter Verbindungen Codex anmelden und Inworld-Key eintragen. Keine Schlüssel im Chat weitergeben.
2. Sandbox einrichten. Fehlgeschlagene Einrichtung muss die Ausführung weiterhin verhindern. Mikrofon lokal und Sprachausgabe über Inworld prüfen.
3. Einen Textauftrag ausführen: „Lies projektnotizen.md und erstelle eine kurze Aufgabenliste als aufgaben.md.“ Tatsächliche Datei im Demoordner öffnen und Inhalt vergleichen.
4. Dieselbe Art von Auftrag sprechen, echtes Transkript bei Bedarf korrigieren, senden, Ergebnis und hörbare Antwort prüfen. Spracheingabe und Sprachausgabe zählen erst jetzt als gemeinsam geprüft.
5. Einen synthetischen Warteauftrag ausführen und über Stopp abbrechen. Er darf nach dem bestätigten Ende keine spätere Datei mehr erzeugen. Escape und globalen Hotkey getrennt prüfen.
6. Einen Schreibversuch auf eine eigens angelegte Testdatei außerhalb des Demoordners sowie einen Netzwerkaufruf prüfen; beides muss in der Werkzeug-Sandbox scheitern. Keine privaten Dateien dafür verwenden.
7. App während einer synthetischen Aufgabe schließen; nach Neustart unterbrochener Status, keine Wiederholung. Gespräch und Einstellungen sind vorhanden. Danach einen neuen Auftrag ausdrücklich starten.
8. Den Ablauf aus einem zweiten frischen Profil mit eigenen Testzugängen wiederholen. Erst danach M1 als abgenommen markieren.

## Nicht Teil von M1

Live, Gedächtnisebenen, Vollzugriffsumschaltung, Plugins, Fernzugriff, ein signierter Installer und weitere Plattformen. Die Oberfläche bietet dafür keine vorgetäuschten Bedienelemente.
