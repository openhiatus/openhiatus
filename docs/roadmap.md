# openHiatus – Roadmap

Stand: 24. Oktober 2026. Aktueller Quellstand: Version 0.0.15, Alpha für die öffentliche Weiterentwicklung unter MIT. Anzeigename ist openHiatus; technische Namen und Profil bleiben `openhiatus`.

Seit dem 24. Oktober 2026 liegt der Schwerpunkt auf gerätegebundener Computersteuerung und Unterstützung am Bildschirm statt auf einem allgemeinen persönlichen Assistenten mit vielen Diensten. Begründung und Zielgruppen stehen in der [Vision](vision.md), Lieferabschnitte im [Gesamtplan](gesamtplan.md). Die [vorherige Roadmap](archiv/roadmap-2026-10-22.md) bleibt erhalten.

## Implementiert

- Eigenes Repository und eigenes Profil; frühere Installationen werden nicht verändert.
- Pi-SDK 1.3.0 im isolierten Agent-Host mit Streaming, Sitzungsfortsetzung, Steering und bestätigtem Prozessbaum-Stopp.
- Anbieteroberfläche für Anthropic, Google, OpenRouter, OpenAI und lokale kompatible Server; geschützte Schlüssel und getrennte Modellrollen.
- Offizielle ChatGPT-Anmeldung für persönliche lokale Apps; Kontomodellliste, geschützte Token-Erneuerung und Abmelden. Automatische Gedächtnisberichte über ChatGPT benötigen eine gesonderte Freigabe.
- Bestehende Inworld-Sprache, native F8/F9-Hotkeys, optionale Arbeitsanzeige und Sprachwarteschlange.
- Gesprächsagent mit ausschließlich Dialogwerkzeugen, zwei Hintergrundworker und Ressourcenkonfliktprüfung.
- Native Desktopsteuerung mit aktuellen Bildern, frameId und geordnetem Zugriff.
- Direkte Gedächtnisberichte mit JSON-Vertrag, Quellen, Versionen und eigenem Abbruch.
- Eigene lokale Pi-Skills, Fähigkeitenübersicht und Verbrauchsanzeige je Auftrag. Das Repository und die Pakete enthalten keine mitgelieferten Skills.
- Sichtbare Hinweise bei belegten F8/F9-/Stopp-Hotkeys sowie Unterscheidung zwischen fehlender Kontextmessung und leerem Gespräch.
- Erster Architekturabschnitt im Quellcode: eigenes Gesprächsmodul mit Zustandsbesitz und Fachports; langlebige Audio-Runtime mit getrenntem Browseradapter und React-Anbindung. Automatische Importregeln werden über `npm run check` zusammen mit Typen und Verhalten geprüft.
- Desktopbesitz endet mit der interaktiven Arbeit eines Turns, auch wenn dessen verwalteter Hintergrundprozess erhalten bleibt. Gezielte Tests prüfen Freigabe, Stopp-Rennen und unbestätigtes Cleanup.
- Zweiter Architekturabschnitt im Quellcode: Gedächtnisberichte mit eigener Zeitplanung/Einwilligung/Abbruch; allgemeine, rollenbezogene Werkzeugregistrierung; Desktop als konkreter Beitrag und Dienstbroker für kontogebundene Leseoperationen. Zwei synthetische Diensttypen sind geprüft; eine echte Gmail-Verbindung folgt auf dieser Grundlage.
- Dritter Architekturabschnitt im Quellcode: typisierte Feature-IPC mit Laufzeitprüfung und ausdrücklichen UI-Datenprojektionen; eigenes Auftragsmodul für Annahmekontext, Worker, Archivfortsetzungen, Ergebnisse und Stopp. Der bestehende Fenster-/Frame-/URL-Guard bleibt an der Electron-Grenze erhalten.
- Vierter Architekturabschnitt im Quellcode: eigene Modell-/Providerkoordination und eigener direkter Aufgabenpfad; geprüfte interne Host-Nachrichten mit korrelierten Antworten. Ein Zustandsjournal trennt dauerhafte Barrieren, gewöhnliche Speicherstände und UI-Veröffentlichung. Ein kleiner Gedächtnis-Leseport liefert Identität/Kern ohne vollständigen Archivsnapshot; ein reproduzierbarer Speicherbenchmark erfasst die verbleibende synchrone Arbeit.
- Fünfter Architekturabschnitt im Quellcode: geordneter Verlaufsspeicher in eigenem Worker, gebündelte Checkpoints und bestätigte dauerhafte Übergänge vor externer Arbeit. Stopp bleibt bei blockiertem Worker bedienbar. Fehler verwerfen abhängige wartende Stände; nie angenommene Nachrichten werden nicht archiviert. Gedächtnis- und Zugangsspeicher bleiben synchron.
- Sechster Architekturabschnitt im Quellcode: eigener Gedächtnis-Worker für Validierung, Suche, Abrufe und dauerhafte Änderungen; bestätigter kleiner Identitäts-/Kerncache. Asynchrone Quellenarchivierung, Versionsprüfung und Berichte bleiben nach Stopp und Neustart zugeordnet. Der Zugangsspeicher bleibt synchron.
- Siebter Architekturabschnitt im Quellcode: eigener Navigationsrahmen und langlebige UI-Sitzung; Gespräch, Aufgaben, Dienste, Gedächtnis, Skills und Einstellungen als getrennte Ansichten. Aufgaben zeigen Filter, Ergebnisse, Verbrauch und Einzelstopp; Einstellungen trennen Modelle, Sprache und Bedienung. Entwurf, Aufnahme, Auswahl und laufende Arbeit bleiben beim Wechsel erhalten.
- Computersteuerung als wählbarer Versuch: Übersichts- und Detailansichten, lokale Änderungserkennung, Bildbudget, Arbeitsgedächtnis und optional getrenntes Computer-Modell. Vollbild bleibt Standard; nur der Hauptbildschirm wird unterstützt.
- Einklappbare Navigation, skalierendes Gesprächssymbol und optionale Arbeitsanzeige im Hintergrund.
- Vier bearbeitbare Identitäts- und Gedächtnisdateien (SOUL.md, IDENTITY.md, USER.md, MEMORY.md) mit Versionen und Vorlagen; Fast-Varianten bei der Modellwahl.
- Google Kalender über einen selbst eingerichteten Desktop-OAuth-Client: Termine lesen, persönliche Einzeltermine anlegen und ändern.

Der belastbare Prüfstand steht im [Testprotokoll](openhiatus-testprotokoll.md).

## Geplanter Ausbau

Reihenfolge gemäß [Gesamtplan](gesamtplan.md#lieferabschnitte):

1. **Elementwahrnehmung:** Bedienelemente aus der Windows-Barrierefreiheitsschnittstelle als zweite Wahrnehmung neben Bildern, Aktionen auf Elemente und Wertprüfung; Pixelbedienung als Rückfall. Beginnt mit einer Machbarkeitsprüfung des Desktoptreibers.
2. **Benchmarks:** realistische synthetische Abläufe kleiner Betriebe mit Erfolg, Dauer, Kosten und Eingriffen je Lauf.
3. **Vertrauensrahmen:** Freigabe kritischer Aktionen, feste Grenzen bei Geld, Passwörtern und Fernwartung, erlaubte Programme und Protokoll je Auftrag.
4. **Gemeinsamer Bildschirm:** Pause bei Eingaben des Menschen, Übergabe und Rückgabe.
5. **Rezepte:** erfolgreiche Abläufe prüfen, speichern und wiederholen.
6. **Anleiten:** Markierung des nächsten Schritts auf dem Bildschirm mit kurzer Erklärung; Erprobung mit echten Personen, bevor eine vereinfachte Ansicht entsteht.
7. **Mehrere Monitore** über einen gemeinsamen Geometrievertrag.
8. **Öffentliche Vorschauversion:** signiertes, einfach installierbares Windows-Paket mit Start mit Windows.

## Nächste Abnahme im Alltag

1. Desktopabläufe mit den tatsächlich gewählten bildfähigen Modellen durchführen; Qualität, Laufzeit und Verbrauch vergleichen.
2. Verhalten bei längerer Nutzung und vorübergehenden Provider-/Desktopfehlern beobachten. Ein einmaliger initialer Screenshotfehler ist dokumentiert; die Ursache ist noch nicht belegt.
3. Echte Spracheingabe und Sprachausgabe mit gewählter Stimme prüfen.

## Zurückgestellt

- Gmail und weitere persönliche Dienste; Google Kalender bleibt als vorhandene Ergänzung.
- Einsatz in Unternehmen mit zentraler Verwaltung.
- Ständige Eigeninitiative, Tagesübersichten und Hintergrundüberwachung.
- Live-Sprache und Freisprechen; `/goal` mit Abschlussbestätigung und Budgetgrenzen.
- Einmaliger, ausdrücklich ausgelöster Import aus früheren Installationen.

Es werden keine pauschalen Tagesabschätzungen als Fortschrittsnachweis verwendet. Jeder weitere Schritt erhält konkrete Abnahmekriterien.
