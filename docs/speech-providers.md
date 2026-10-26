# Sprachanbieter und optionale Stimme

Ab 0.0.26 stehen Inworld und ElevenLabs unter **Einstellungen → Sprache & Geräte** sowie im freiwilligen Sprachschritt der Einrichtung bereit. Ein ausgewählter Anbieter übernimmt Spracherkennung (STT) und Sprachausgabe (TTS). Getrennte Anbieter je Richtung sind in diesem Ausbau nicht vorgesehen.

Für den Einstieg genügt ein gültiger Zugang beim gewählten Anbieter. **Stimme anpassen (optional)** nimmt eine Voice-ID als Text entgegen. Das Feld darf leer bleiben; **Standardstimme verwenden** entfernt die eigene Auswahl. Die Standardwerte sind Dennis für Inworld und Eldrin (`6WwXjDDEMyNmFG95zycZ`) für ElevenLabs. Eldrin stammt aus der [offiziellen Ersatzliste für auslaufende Default-Stimmen](https://elevenlabs.io/docs/help-center/product/voices/my-voices/what-are-default-voices). Verfügbarkeit und Freigaben eigener Stimmen richten sich nach dem Anbieterkonto.

Die App speichert beide Schlüssel getrennt mit dem vorhandenen Windows-Schlüsselschutz und zeigt gespeicherte Schlüssel nicht wieder an. `speechProvider` wählt den aktiven Zugang; `voiceId` bleibt die bisherige Inworld-Stimme und `elevenlabsVoiceId` enthält nur die freiwillige ElevenLabs-Auswahl. Alte Profile bleiben bei Inworld. Anbieter- und Stimmänderungen warten auf die Speicherbestätigung, setzen den Ausgabestatus zurück und verwerfen alte Audioergebnisse. Das Entfernen eines Zugangs entfernt nicht den anderen. Fehlgeschlagene Speicherung lässt sich erneut versuchen.

## Schnittstellen

- Inworld verwendet weiterhin `inworld/inworld-stt-1` und `inworld-tts-2`, Basic-Zugangsdaten und die vorhandenen deutschen Spracheinstellungen.
- ElevenLabs: [STT](https://elevenlabs.io/docs/api-reference/speech-to-text/convert) sendet validierte PCM-WAV-Aufnahmen per Multipart an `/v1/speech-to-text`, mit `scribe_v2`, automatischer Spracherkennung, ohne Sprecherzuordnung und ohne Geräusch-Tags. Die Aufnahme muss mindestens 100 ms enthalten. Die gemeinsame Obergrenze bleibt 60 Sekunden.
- ElevenLabs: [TTS](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) sendet Text mit `eleven_multilingual_v2` an `/v1/text-to-speech/{voice_id}` und empfängt MP3 (`mp3_44100_128`). Die Voice-ID wird für den URL-Pfad kodiert. Eine ungültige eigene ID wird als Fehler gemeldet; sie wird nicht unbemerkt durch eine andere Stimme ersetzt.
- ElevenLabs-Schlüssel werden ausschließlich im Hauptprozess als `xi-api-key` an die feste API-Adresse gesendet. Weiterleitungen sind ausgeschlossen. Netzwerk- und Anbieterfehler geben keine Antwortkörper oder Schlüssel weiter. Größenlimits, Zeitlimit und Stopp gelten für beide Anbieter.

Ein ElevenLabs-Aufruf entsteht erst beim Testen oder Verwenden von Sprache. Das Speichern des Schlüssels und der Neustart erzeugen keine ElevenLabs-Vorwärmaufrufe. Bestätigungssätze werden nach tatsächlicher Verwendung nach Anbieter, Modell, Stimme und Text zwischengespeichert. Der bestehende Inworld-Vorwärmablauf bleibt beim Start und beim Speichern seines Zugangs erhalten. Aufnahmen bzw. Antworttexte gehen bei Nutzung an den gewählten Anbieter und werden dort nach dessen Kontingent abgerechnet. Der lokale Mikrofontest bleibt ohne Cloudzugriff.

## Prüfung

`npm run test:speech-providers-ui` verwendet eine eigene App-Kopie und ein synthetisches Profil. Nur der Netzwerktransport dieser Kopie verweist auf einen lokalen HTTP-Server; die produktive Protokoll-, Audio- und IPC-Prüfung bleibt aktiv. Geprüft werden Schlüsseltrennung und Verschlüsselung, Standard-/eigene Stimme, Zurücksetzen, echte STT-/TTS-Anfrageformen, Fehler, Stopp, Neustart und alle sieben Sprachen bei kompaktem und großem Fenster. Das Audio ist synthetisch und wird über die API geprüft; tatsächliche Klangqualität, Mikrofoneingabe, Anbieterkontingent und Freigaben einer echten Stimme benötigen eine manuelle Prüfung mit eigenem Konto.

`npm run test:onboarding-ui` prüft zusätzlich Auswahl und Speichern von ElevenLabs ohne eigene Voice-ID im tatsächlichen Einrichtungsablauf. Der Test entfernt seinen synthetischen Sprachzugang wieder und bleibt ohne externe Sprachanfragen. Diese Prüfung läuft auch mit dem Windows-Paket.
