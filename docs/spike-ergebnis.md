# openHiatus – Pi-Anbindung und Prüfnachweise

Stand: 21. Oktober 2026. Implementierung: 0.1.4, Pi 1.3.0.

## Architekturentscheidung

Variante B ist umgesetzt: Ein eigener Agent-Host verwendet das Pi-SDK. Electron spricht über ein begrenztes JSONL-Protokoll mit dem Kindprozess. Windows Job Objects besitzen dessen gesamten Prozessbaum. Der Prozesshost startet Kinder vor der Zuordnung suspendiert; Stopp und Elternprozessabbruch räumen den zugeordneten Baum auf.

Variante A wurde nicht zusätzlich als zweiter Adapter implementiert. Der echte SDK-Durchlauf weist die benötigten Sitzungs-, Werkzeug-, Bild- und Abbruchschnittstellen nach. Es gibt keine Codex-Laufzeit und keinen Umschaltadapter.

Electron wird für den Agent-Host im Node-Modus gestartet. Das ausgelieferte Paket benötigt kein global installiertes Node.js. Pi und native Bibliotheken liegen als echte Dateien außerhalb eines ASAR-Archivs.

## Nachgewiesene Schnittstellen

- Echter Pi-Agent über Electron und den nativen Windows-Prozesshost gegen einen lokalen deterministischen OpenAI-kompatiblen SSE-Testserver.
- Dateierstellung mit Umlauten und Streaming der Antwort.
- PNG-Werkzeugergebnis als natives Bild bis zum Modellrequest, ohne Base64 im Modelltext.
- Fortsetzung einer gespeicherten Sitzung nach Host-Neustart. Sitzungsreferenzen liegen pro Sitzungs-ID in eigenen atomar geschriebenen Dateien; parallele Worker überschreiben keinen gemeinsamen Index.
- Dialog mit ausschließlich registrierten Dialogwerkzeugen; keine Shell-, Datei- oder Desktopwerkzeuge.
- Eigene Konfiguration, Skillablage und Schlüssel. Keine globalen Pi-Erweiterungen, Projekt-Erweiterungen, gespeicherten Pi-Anmeldungen oder geerbten Anbieter-Schlüssel.
- Direkter ModelClient ohne Agent und ohne Werkzeuge, getrennt abbrechbar.
- Stopp während eines ausstehenden Computerwerkzeugs; späte Antworten führen keine Folgeaktionen aus.
- Native Prozessbaumtests für Stopp, unerwartetes Kindende, Host-Absturz, Elternprozessende und getrennte Aufträge.
- ChatGPT-Anmeldung als persönliche lokale App mit eigener dynamischer Registrierung, Loopback-Callback, PKCE, signiertem ID-Token und atomarer Erneuerung rotierender Zugangsdaten im Hauptprozess. Kein fremder Codex-Client und kein ChatGPT-Backend-Endpunkt.
- Im echten SDK-Test erhält jede neue Modellanfrage einen frischen Zugangstoken über den an Auftrag und Modell gebundenen Host-Rückruf. Stopp verwirft ausstehende Tokenantworten; unvollständige ChatGPT-Antworten werden vor Werkzeugausführung abgelehnt.

Die Arbeitswerkzeuge verwenden auf Windows das native PowerShell-Werkzeug von Pi. Der SDK-Test prüft die tatsächliche Werkzeugauswahl. Pi- und Modellfehler werden bereinigt an die Oberfläche gegeben.

## Grenzen der Nachweise

Der lokale SSE-Server liefert synthetische Modellantworten. Damit werden die echte SDK-, Prozess-, Werkzeug- und App-Integration geprüft, aber weder die Qualität eines externen Modells noch dessen aktuelle Verfügbarkeit bewertet. Es wurden keine fremden API-Schlüssel übernommen und keine bezahlten Modellaufrufe durchgeführt.

Die native Desktopabnahme und die abschließenden Paketprüfungen werden im [openHiatus-Testprotokoll](openhiatus-testprotokoll.md) separat festgehalten. Ein bestandener PNG-Transporttest ersetzt keine reale Desktopabnahme.

## Technische Quellen

- [Offizielle Pi-SDK-Dokumentation](https://pi.dev/docs/latest/sdk)
- [Pi auf Windows](https://pi.dev/docs/latest/windows)
- [OpenAI: Sign in with ChatGPT](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt)
- [OpenAI: Anmeldung für persönliche lokale Apps](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [OpenAI: Modelle und Inferenz](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- Maßgeblich für die Implementierung sind die mit den festgelegten Paketen ausgelieferten TypeScript-Verträge und die lokalen Integrationstests.
