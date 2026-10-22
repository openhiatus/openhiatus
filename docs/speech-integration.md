# Direkte Sprachanbindung

> Historische Referenz einer früheren Entwicklungsreihe. Architektur, Bedienpfade, Versionsnummern und damalige Prüfergebnisse beschreiben den datierten Stand, keine neue Abnahme der aktuellen Pi-basierten Version. Lokale Nachweisdateien sind kein Bestandteil der öffentlichen Quellablage. Aktuelle Einrichtung und Prüfungen stehen in der README und im aktuellen Testprotokoll.

Version 0.4.0 ergänzt ein unabhängiges Sprachgespräch: Nach STT wird der erkannte Text standardmäßig automatisch gesendet. Nach erfolgreicher Nachrichtenspeicherung folgt eine kurze Eingangsbestätigung. Der Gesprächsagent nimmt Arbeit über allgemeine Auftragswerkzeuge an und gibt konkrete bestätigte Annahmen frei, während getrennte Arbeitsprozesse laufen. Die Ausgabe liest diese Gesprächsbeiträge und zugeordnete Ergebnisse über eine FIFO-Warteschlange. Aufnahme und Transkription lassen Ausgabe warten; neue Aufnahme unterbricht Wiedergabe, ohne Arbeit abzubrechen. Der bearbeitbare Entwurf mit F9 bleibt über „Transkript prüfen“ verfügbar. Live ist vorerst zurückgestellt. [Prüfstand](standard-conversation-testprotokoll.md).

Stand der geprüften Herstellerdokumentation: 5. Oktober 2026. Die Implementierung verwendet eine direkte Sprachanbindung und übernimmt keine Zugangsdaten anderer Anwendungen.

| Weg | Direkte API | Fest gewähltes Modell |
| --- | --- | --- |
| Aufnahme → Transkript | `POST https://api.inworld.ai/stt/v1/transcribe` | `inworld/inworld-stt-1` |
| Antwort → Audio | `POST https://api.inworld.ai/tts/v1/voice` | `inworld-tts-2` |

Der Nutzer hinterlegt die bereits Base64-kodierten Zugangsdaten aus dem Inworld-Portal in der Oberfläche. Der Hauptprozess sendet sie unverändert als `Authorization: Basic …`. Der Schlüssel bleibt aus Renderer-Antworten, Aktivität und Chat heraus. Es gibt keine automatische Übernahme von Schlüsseln und keinen Anbieter- oder Modellwechsel nach einem Fehler.

STT übernimmt PCM-WAV (16 kHz, 16 Bit, mono), höchstens 60 Sekunden. Format und Größe werden vor dem Versand geprüft. Die Spracheinstellung ist Deutsch (`de`); zusätzliche Stimmprofilanalyse wird nicht angefordert. Das Ergebnis kommt aus `transcription.transcript`. Im Prüfmodus kann der Nutzer es vor dem Codex-Auftrag korrigieren. API-Anfragen verwenden das dokumentierte `transcribeConfig`/`audioData`-Format aus Quickstart und Feldschema; das abweichende alte Beispiel am Ende der API-Referenz wird nicht verwendet.

TTS verwendet die im Nutzerprofil gespeicherte `voiceId`, mit Sprachsteuerung `de-DE` und MP3-Ausgabe. Der damalige Auslieferungsstandard für neue Profile war `Dennis`. Die Stimmwahl wird in der App gespeichert und bleibt bei Neustarts erhalten. openHiatus verwendet seinen eigenen Inworld-Zugang. Live-Gespräche haben einen eigenen Audio-Weg und verwenden diese Inworld-Stimme nicht.

Deutsche Synthese wird vom Modell unterstützt; Stimmklang und Aussprache müssen mit echten Aufnahmen abgenommen werden. Die früheren 1.5-Modelle sind laut aktueller Modellübersicht veraltet. Deshalb ist das Modell ausdrücklich auf TTS-2 gesetzt. Ein einzelner Text darf 2.000 UTF-16-Codeeinheiten lang sein. Längere Antworten bleiben vollständig im Chat und erhalten einen Hinweis, statt unbemerkt gekürzt oder in zusätzliche kostenpflichtige Anfragen aufgeteilt zu werden.

Jede Anfrage ist abbrechbar und hat ein Zeitlimit von 60 Sekunden. Stop verwirft auch spät eintreffende Ergebnisse. Fehlermeldungen übernehmen weder Providerantworten noch rohe Netzwerkfehler. Es gibt keine automatischen Wiederholungen. Kosten können beim Provider auch dann entstehen, wenn eine bereits eingegangene Anfrage später abgebrochen wird. Der Ausgabetest erzeugt echte Sprache und ist kostenpflichtig; Preise und Verbrauch werden nicht aus alten openHiatus-Zahlen geschätzt.

Die Inworld-Zugangsdaten werden durch Electron `safeStorage` im Hauptprozess verschlüsselt. Ohne verfügbaren Betriebssystemschutz schlägt das Speichern fehl. Dies ist unter Windows benutzergebundener Schutz, kein Schutz vor Prozessen mit denselben Benutzerrechten oder vor Administratoren. Die Datei enthält keine lesbaren API-Schlüssel. Der lokale Gesprächsverlauf ist separat als versionierte JSON-Datei mit atomarem Austausch und Sicherung gespeichert; er ist nicht verschlüsselt. M1 hat bewusst noch keine App-Sperre.

Die automatischen Transporttests verwenden synthetisches Audio und simulierte HTTP-Antworten. Sie belegen Vertrag, Begrenzung, Fehlerbehandlung und Abbruch; sie ersetzen keinen realen Test mit Inworld-Zugang, Mikrofon und Lautsprecher. Die Speichertests verwenden einen Testverschlüsseler und ersetzen ebenfalls nicht den Windows-DPAPI-Test im laufenden Electron-Prozess.

Quellen:

- [STT-Quickstart](https://docs.inworld.ai/stt/quickstart)
- [STT-API und Antwortschema](https://docs.inworld.ai/api-reference/sttAPI/speechtotext/transcribe)
- [TTS-API, Schlüsselübergabe, Dennis-Beispiel und Zeichengrenze](https://docs.inworld.ai/api-reference/ttsAPI/texttospeech/synthesize-speech)
- [Aktuelle TTS-Modelle und abgelöste Modellgenerationen](https://docs.inworld.ai/tts/tts-models)
- [Deutsche Sprache und sprachübergreifende Stimmen](https://docs.inworld.ai/tts/capabilities/multilingual)
