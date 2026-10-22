# Vision: Ein lebendiger, ansprechbarer openHiatus

> Historische Referenz einer früheren Entwicklungsreihe. Architektur, Bedienpfade, Versionsnummern und damalige Prüfergebnisse beschreiben den datierten Stand, keine neue Abnahme der aktuellen Pi-basierten Version. Lokale Nachweisdateien sind kein Bestandteil der öffentlichen Quellablage. Aktuelle Einrichtung und Prüfungen stehen in der README und im aktuellen Testprotokoll.

Stand: 20. Oktober 2026, ausgehend von Version 0.4.2.

openHiatus ist technisch belastbar, wirkt im Alltag aber noch wie ein Kontrollraum statt wie ein Gegenüber. Dieses Dokument hält fest, warum das so ist und in welcher Reihenfolge wir es ändern. Schutzregeln, Stopp, Safe/Risk und Ehrlichkeit über erledigte Arbeit bleiben unverändert verbindlich; Lebendigkeit darf keine dieser Grenzen aufweichen.

## Ausgangslage

1. **Keine sichtbare Präsenz.** Das openHiatus-Zeichen ist statisch. Zuhören, Nachdenken und Sprechen erscheinen nur als Text, verteilt auf bis zu sechs Stellen (Banner, Modusleiste, Gesprächskopf, Audio-Status, Eingabehinweis, Fußzeile). „F8 sprechen“ steht mehrfach gleichzeitig auf dem Bildschirm.
2. **Starres Hin und Her.** F8 drücken, sprechen, erneut F8. Keine Satzendenerkennung, kein Unterbrechen per Stimme. Die Eingangsbestätigung ist immer derselbe Satz „Okay, ich bin dran.“ Die konkrete Auftragsannahme folgt erst nach 8–13 Sekunden. TTS wartet auf die vollständige Antwort und wird als Ganzes synthetisiert.
3. **Stille während der Arbeit.** Fortschrittsansagen wurden in 0.4.2 bewusst reduziert. Ein sichtbarer Ersatz fehlt: Ein laufender Auftrag zeigt nur „Arbeitet“, die Aktivität ist technisch formuliert.
4. **Keine Initiative.** Der Startbildschirm ist generisch, obwohl Gedächtnis, Identität und offene Aufträge vorhanden sind. openHiatus begrüßt nicht und knüpft nicht an. Der erste Eindruck besteht oft aus Warnungen.

## Die 12 Punkte

### Paket A – Präsenz und Rückmeldung (schnell, geringes Risiko)

1. **Präsenz-Orb.** Ein zentrales, animiertes openHiatus-Element mit klaren Zuständen: ruhig (bereit), atmet mit dem Mikrofonpegel (hört zu), pulsiert (denkt/erkennt/arbeitet), schwingt mit der Ausgabelautstärke (spricht). Er ersetzt die verstreuten Statuszeilen durch einen einzigen, sofort lesbaren Zustand.
2. **Variierte, vorab erzeugte Bestätigungen.** Statt immer „Okay, ich bin dran.“ ein kleiner Satz-Pool, ohne direkte Wiederholung. Die Sätze werden einmal mit der gewählten Stimme vertont und zwischengespeichert, damit die Bestätigung ohne TTS-Wartezeit abspielt.
3. **Earcons.** Kurze, leise, lokal erzeugte Töne für Aufnahme an/aus, „verstanden/gesendet“ und „Auftrag fertig“. Kein Anbieteraufruf, abschaltbar.
4. **Persönlicher Start.** Begrüßung nach Tageszeit, offene oder unterbrochene Aufträge und eine Anknüpfung aus dem Gedächtnis („Gestern hast du an X gearbeitet – weitermachen?“) statt fester Beispielkarten.
5. **Hinweise entrümpeln.** Tastenkürzel nur einmal zeigen, Statusmeldungen zusammenführen, Infohinweise nach einigen Sekunden ausblenden, Warnungen (z. B. belegte Hotkeys) gebündelt statt als erster Eindruck.

### Paket B – Gesprächsfluss (mittel)

6. **Freisprechen mit Satzendenerkennung (VAD).** Optionaler Modus, in dem openHiatus selbst erkennt, wann du fertig gesprochen hast (z. B. Silero-VAD im Renderer). Barge-in: Sprichst du während der Wiedergabe, verstummt openHiatus. Der F8-Weg bleibt erhalten.
7. **Satzweises TTS.** Den ersten vollständigen Satz bereits vertonen und abspielen, während der Rest der Antwort noch entsteht; wo verfügbar, die Streaming-Schnittstelle des Sprachanbieters nutzen. Ziel: Sprechbeginn kurz nach dem ersten Satz statt nach der ganzen Antwort.
8. **Sichtbarer statt gesprochener Fortschritt.** Auftragskarten zeigen den aktuellen Schritt in Alltagssprache („liest projektnotizen.md“, „schreibt aufgaben.md“), abgeleitet aus vorhandenen Aktivitätsereignissen. Gesprochen wird höchstens bei sehr langen Aufträgen (etwa ab 45 Sekunden) einmal. Die Entscheidung aus 0.4.2 gegen regelmäßige Ansagen bleibt bestehen.
9. **Ergebnis-Karten und Folgevorschläge.** Erzeugte Dateien als Karte mit Vorschau und „Öffnen“; unter Antworten zwei bis drei anklickbare Folgeschritte.

### Paket C – Persönlichkeit und Initiative (größer)

10. **Persönlichkeit schärfen.** Die Gesprächs- und Worker-Anweisungen bestehen bisher fast nur aus Schutz- und Wahrheitsregeln. Ergänzt wird eine Grundhaltung: Tonfall, etwas Humor, Ansprache mit Namen, Rückfragen, Bezug auf Früheres – innerhalb der bestehenden Grenzen und editierbar über Identität/Kern.
11. **Proaktivität mit Maß.** Kurze Begrüßung beim Start, optionaler Tagesrückblick, Erinnerung an liegengebliebene Aufträge. Ruhezeiten und ein Schalter verhindern Aufdringlichkeit.
12. **Live später neu bewerten.** Echtzeit-Sprache wäre die gründlichste Lösung gegen das Hin und Her, ist aber kostenintensiv. Nach Paket B wird geprüft, wie nah der Standardweg bereits herankommt.

## Reihenfolge

1. **Paket A ohne Punkt 4** (1 + 2 + 3 + 5): sofort spürbarer Unterschied, keine Änderung an Auftrags- oder Rechteabläufen.
2. **Punkte 6 und 7:** das eigentliche Gesprächsgefühl.
3. **Punkte 4, 8, 9:** Kontext und Sichtbarkeit.
4. **Punkte 10–12:** Persönlichkeit, Initiative, Live-Entscheidung.

## Leitplanken

- Lebendigkeit ist Rückmeldung, keine Behauptung: Keine Animation oder Ansage darf Erfolg vortäuschen, der nicht belegt ist.
- Alles Hörbare ist abschaltbar; Stopp beendet auch Earcons und Wiedergabe sofort.
- Kein zusätzlicher Anbieter ohne konkreten Bedarf; Earcons und Animationen laufen lokal.
- Zusätzliche Kosten (z. B. Vorabvertonung) bleiben klein, einmalig und nachvollziehbar.

## Umsetzungsstand

**20. Oktober 2026 – Paket A (Punkte 1, 2, 3, 5) umgesetzt, noch nicht im echten Alltag abgenommen:**

- Punkt 1: `src/renderer/Presence.tsx` und `presence.css`. Zustände bereit, hört zu (Mikrofonpegel), denkt, spricht (gemessener Ausgabepegel über `captureStream`, sonst sanfte Ersatzbewegung), arbeitet im Hintergrund, nicht eingerichtet, Fehler. Groß auf dem Startbildschirm, kompakt in einer Präsenzzeile über der Eingabe. Die Zeile ersetzt Gesprächskopf, Audio-Status und „openHiatus antwortet …“-Punkte. Reduzierte Bewegung wird respektiert.
- Punkt 2: `src/shared/receipts.ts` mit zehn neutralen Sätzen ohne direkte Wiederholung; Sprachhinweise tragen `kind: 'receipt'`. `SpeechService` vertont diese Sätze einmal je Stimme vorab und speichert sie unter `%APPDATA%/openhiatus/speech-cache`. Normale Antworten werden nicht zwischengespeichert.
- Punkt 3: `src/renderer/earcons.ts`, lokal per WebAudio. Töne für Aufnahme an, Aufnahme beendet, getippter Auftrag gesendet, bestätigter Auftragsabschluss und fehlgeschlagener Auftrag. Ein noch nicht bestätigtes Ziel bleibt still. Abschaltbar über „Signaltöne“ (`preferences.earcons`), Stopp beendet laufende Töne.
- Punkt 5: Doppelte Tastenhinweise entfernt (Modusleiste, Fußzeile, Gesprächskopf), Infohinweise blenden nach 7 Sekunden aus, Fehler bleiben stehen. Seitenleiste zeigt nur noch die Version.
- Geprüft: 353 Tests bestanden, 3 optionale übersprungen; Typecheck, Build, `standard-conversation-check` und `ui-smoke` bestanden; Screenshots ohne Rendererfehler.
- Offen: Abnahme mit echtem Mikrofon und Lautsprecher (Klang und Lautstärke der Signaltöne, Pegelbewegung beim Sprechen), Anzahl der Vorab-Vertonungsaufrufe bei Inworld beim ersten Start (zehn kurze Sätze je Stimme). Gebündelte Darstellung der Hotkey-Warnungen in der Aktivität steht noch aus.

**20. Oktober 2026 – Sprache zuerst:** Die Gesprächsansicht ist auf Sprache als Hauptweg umgestellt. Die Figur steht groß in der Mitte, darunter Zustand, Hinweis und ein großer Sprechen-Knopf (F8), dann nur der letzte eigene Beitrag und die zugehörige Antwort. Der vollständige Verlauf ist hinter „Verlauf“ eingeklappt (Wahl bleibt lokal gespeichert); offen faltet sich die Bühne zu einer Zeile über dem Verlauf. Texteingabe bleibt als schmale Zeile unten erhalten, im Modus „Transkript prüfen“ für den bearbeitbaren Entwurf. Die festen Beispielkarten des Startbildschirms entfallen (Ersatz folgt mit Punkt 4).
