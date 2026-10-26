# Thinking pro Modellrolle

Ab 0.0.27 hat jede Modellrolle eine eigene Thinking-Stufe. Unter **Einstellungen → Modelle & Zugänge** steht die Auswahl direkt rechts neben dem Modell für Arbeit, Gespräch und Gedächtnis; im kleinen Fenster darunter. Unter **Bedienung** steht dieselbe Auswahl beim separaten Computer-Modell. Standard ist überall `medium`, auch für bestehende Profile ohne diese Angaben. Verfügbar sind `off`, `minimal`, `low`, `medium`, `high`, `xhigh` und `max`.

Die Auswahl ist eine Anforderung an das Modell. Pi 1.3.0 passt sie an dessen hinterlegte Fähigkeiten an: Ohne Reasoning-Unterstützung wird `off` verwendet; ein Modell mit verpflichtendem Reasoning kann `off` auf seine Mindeststufe anheben. Die App erzwingt keine vom Anbieter abgelehnten Rohparameter. Höhere Stufen können mehr Zeit und Kontingent benötigen. Fast bleibt eine getrennte Anforderung an die Verarbeitungsgeschwindigkeit.

## Datenfluss

- `shared/thinking.ts` definiert Werte, Vorgabe und Prüfung. Die vier Präferenzen heißen `workThinkingLevel`, `dialogThinkingLevel`, `memoryThinkingLevel` und `computerThinkingLevel`. IPC, Snapshot und Zustandsspeicher prüfen sie. Die Speicherbestätigung wird abgewartet; bei Schreibfehlern wird die betroffene Auswahl zurückgenommen.
- Gespräch und direkte Arbeit übernehmen ihre Stufe vor asynchroner Kontextvorbereitung. Ein neuer Gesprächsschritt kann die Stufe auch innerhalb derselben Sitzung ändern. Laufende Aufrufe werden durch das Einstellen einer neuen Stufe nicht umgeschrieben.
- Hintergrundaufgaben speichern die Arbeitsstufe als `thinkingLevel` und die Computerstufe in `computer.thinkingLevel` bei Annahme. Wartende Aufgaben, Archivfortsetzungen und spätere Computer-Teilaufgaben behalten diese Werte. Die gespeicherten Aufträge werden nach einem Neustart weiterhin nicht automatisch wiederholt.
- `PiAdapter` übergibt die Stufe über den geprüften `HostRun` an `createAgentSession`. Auch wiederaufgenommene Sitzungen erhalten die für den neuen Aufruf gewählte Stufe. Je nach Modell verwendet Pi im Responses-Protokoll `reasoning.effort` oder `configuration_update`-Einträge; die App übersteuert diese Zuordnung nicht.
- Gedächtnisberichte halten Modell und Thinking-Stufe für den gesamten Berichtslauf fest. `ModelClient.complete` nutzt bei ausdrücklich übergebener Stufe `completeSimple` samt Fähigkeitsanpassung. Dadurch erhalten Berichte erstmals ausdrücklich `medium` als Vorgabe. Reine Verbindungstests ohne Thinking-Argument behalten ihren bisherigen separaten Aufruf.

## Prüfung

Die Verhaltenstests prüfen alte Profile, getrennte Werte und Auftragsdaten nach Speicherung und IPC, ungültige Werte, Schreibfehler mit Wiederholung, Annahme vor verzögerter Kontextvorbereitung sowie unveränderte Stufen bei Fortsetzungen. Der echte Pi-Host überträgt die Computerstufe und kann beim Wiederaufnehmen derselben Sitzung die Stufe wechseln. Direkte Gedächtnisanfragen prüfen mehrere Stufen mit und ohne Fast sowie Modelle ohne Reasoning und mit Mindeststufe.

`node scripts/fast-model-ui-check.mjs` bedient die echte App mit einem lokalen synthetischen Modellserver: Vorgabe `medium`, getrennte Auswahl, tatsächliche Gesprächs- und Arbeitsanfragen, Fast-Wechsel, Computerstufe, Neustart und Layout in sieben Sprachen bei 560 × 440 und 1360 × 900. Der Ablauf ist Teil von `npm run test:package`. `npm run test:computer-model-ui` prüft zusätzlich Auswahl und Sperrzustand in einer isolierten Renderer-Fixture; ihr Autostart-Lesezugriff ist ausdrücklich simuliert. Die Prüfungen verwenden eigene Profile und keine echten Cloudkonten. Anbieterqualität und tatsächliche Abrechnung werden damit nicht bewertet.
