# M3.1 – Semantische Berichte und gezieltes Nachlesen

> Historische Referenz einer früheren Entwicklungsreihe. Architektur, Bedienpfade, Versionsnummern und damalige Prüfergebnisse beschreiben den datierten Stand, keine neue Abnahme der aktuellen Pi-basierten Version. Lokale Nachweisdateien sind kein Bestandteil der öffentlichen Quellablage. Aktuelle Einrichtung und Prüfungen stehen in der README und im aktuellen Testprotokoll.

Stand: 5. Oktober 2026, Version 0.3.1. **Semantische Berichte, genauer Datumsabruf, Stopp und Erhalt nach Neustart wurden in einer lokalen Windows-Testinstallation geprüft.** Der geprüfte Ausgangsstand 0.3.0 bleibt im [M3-Testprotokoll](m3-testprotokoll.md) dokumentiert. Ein langsamer Wiederholungsaufruf ist unten ausdrücklich als Timeout festgehalten.

## Nativer Lesezugriff

`scripts/m31-readonly-check.ts` wurde mit dem gebündelten Codex 0.160.0 ausgeführt. Der App Server bestätigt `readOnly` ohne Netzwerkzugriff für Werkzeuge. Eine lokale Probe lässt sich lesen; ein Schreibversuch auf dieselbe Datei im Arbeitsbereich scheitert mit `UnauthorizedAccessException`/Exit 24. Der kontrollierte Prozessbaum wurde bestätigt beendet. Es erfolgte kein Modellaufruf. Nachweis: `artifacts/m31-readonly-abnahme.json`.

## Automatisierte und Paketprüfungen

- `npm run typecheck` und Produktionsbuild bestanden.
- **169/169 Tests bestanden, keine ausgelassen.** Einschließlich echter gebündelter Codex-Protokollprüfung und nativem Windows-Prozessschutz. Die vollständige Ausgabe liegt unter `artifacts/m31-tests.txt`.
- `npm run test:ui` gegen die gepackte EXE bestanden: eigener anonymer Testzugang, IPC, Schlüsselschutz, Mikrofon-/Stoppzustände, Neustart und keine Rendererfehler.
- `npm run test:memory-ui` gegen die gepackte EXE bestanden: ausdrücklich synthetische KI-Berichte, Modellherkunft, historische Berichtsversionen, genaues Datum und fehlender Tag ohne Ersatz, vollständige UTF-8-Seiten, Automatik-Einstellung, Nutzerkorrekturen, konkrete Kernfreigabe und Neustart. Kein Modellaufruf in diesem isolierten Testprofil. Bilder: `artifacts/m3-1-tagesbericht.png` und `artifacts/m3-1-wochenbericht-mit-quellen.png`.

Zusätzliche Regressionen prüfen vollständige große Eingaben, alle 31 Tage eines Monats, keine Übernahme angrenzender Monate, Quellenänderungen während einer Zusammenfassung, bekannte Belege aus genau dem jeweiligen Teilausschnitt, Nutzerkorrekturen, Kostenbegrenzung pro Durchlauf und Fortsetzung ohne unfertige Speicherung. Automatische Berichte geben neuen Nutzeraufträgen Vorrang und warten dabei auf die bestätigte Beendigung und Wiederverbindung. Ein zweiter Stopp während dieses Übergangs verhindert den späteren Start des Auftrags.

Bei der Gegenprüfung wurden zwei Fehler vor dem echten Lauf behoben: Archivseiten werden ohne nachträgliches Abschneiden übertragen; der Lesestand für eine Frage zum heutigen Tag entsteht erst nach dem Archivieren dieser Frage. Sonst hätte die Frage ihren eigenen Fortsetzungsverweis ungültig gemacht. Beide Fälle sind als Regression geprüft.

Der erste echte Modelllauf zeigte zusätzlich, dass eine enge Textlängengrenze im strukturierten Ausgabeschema zu abgebrochenen Sätzen führen konnte. Beim Wochenbericht lieferte das Modell teilweise eine Tagesbericht-Kennung als Quellenkennung; der lokale Validator wies diesen Bericht ab. Jetzt gibt das Schema die gültigen Originalquellen und Kategorien pro Aufruf vor. Texte haben keine enge Schema-Zeichengrenze mehr; kurze vollständige Sätze werden verlangt und anschließend lokal auf Format, Länge und Satzende geprüft. Der erste Fehlernachweis bleibt unter `artifacts/m31-echte-codex-abnahme-erster-versuch.json` erhalten.

## Echter Codex-Lauf

Der Integrationslauf verwendete eine Codex-Anmeldung über ChatGPT. Zugangsdaten wurden nicht ausgelesen oder kopiert. Der Lauf `scripts/m31-acceptance.mjs` belegt vier erfolgreiche Schritte:

1. Drei echte Codex-Aufrufe erstellten Tages-, Wochen- und Monatsberichte aus dem vollständigen Quellenbestand. Die Berichte erhielten Modellherkunft, Eingabehash, bekannte Quellen und genaue Versionen der verwendeten Tagesberichte. Quellenzahl, Gespräch, Identität, Kern und Freigaben blieben unverändert.
2. Ein neues Gespräch fragte gezielt nach dem **5. Oktober 2026**. Codex nutzte den echten Archivseiten-Abruf und nannte `aufgaben-live-test.md` und `Sprachdemo` samt passenden Quellenkennungen. Die Antwort unterschied historische Erfolgsmeldungen ausdrücklich von einer neuen Dateiprüfung.
3. Eine Frage nach dem **5. Oktober 2025** meldete korrekt, dass kein Tagesbericht vorliegt. Der aufgezeichnete Abruf enthielt keinen anderen Zeitraum als Ersatz.
4. Escape unterbrach einen echten Zusammenfassungslauf nach dessen erstem gestarteten Aufruf. Kein weiterer Aufruf folgte, kein verspäteter Bericht ersetzte die vorherigen Fassungen.

Der anschließende Wiederholungslauf erzeugte den aktualisierten Tagesbericht, lieferte beim Wochenaufruf jedoch innerhalb des achtminütigen Testlimits keine Antwort. Deshalb endete der kombinierte Testlauf insgesamt mit einem Timeout und schloss die App kontrolliert. Die vier erfolgreichen Schritte und der Timeout stehen unverändert in `artifacts/m31-echte-codex-abnahme.json`. Es wird kein vollständiger Durchlauf dieses Skripts als bestanden behauptet.

Die abschließende Qualitätsfassung begrenzt Tage auf zehn, Wochen auf sechs und Monate auf vier Punkte. Sie verlangt eine zunehmende Abstraktion und lässt unwichtige Namen, Einzeldateien und Termindetails auf den höheren Ebenen weg. Eine explizite Pipeline-Revision markiert ältere KI-Fassungen als aktualisierungsbedürftig, ohne deren Inhalt, Versionen oder Quellen zu löschen.

**Der Abschlusslauf `node scripts/m31-acceptance.mjs --refresh-only` mit dieser endgültigen Fassung bestand.** Drei Modellaufrufe aktualisierten alle drei Ebenen einschließlich der zuvor hinzugefügten Testfragen und Antworten. Der Wochenbericht enthält sechs gebündelte Punkte, der Monatsbericht drei übergeordnete Punkte ohne die vorherigen Personen- und Termindetails. Nach dem Neustart waren Dokumente, Versionen, Quellen, Identität, Kern und Vorschläge identisch. Keine Rendererfehler und keine Chat-Nachrichten aus der Aufbereitung. Nachweis: `artifacts/m31-echte-verdichtung-ebenen.json`; Ansicht: `artifacts/m31-echter-tagesbericht.png`.

Die automatische Aufbereitung wurde im Prüflauf mit ausdrücklicher Freigabe verwendet. Sie änderte weder Identität noch Kern und gab keine Kernvorschläge frei.

## Grenzen

KI-Berichte sind aus den archivierten Gesprächen abgeleitete Aussagen und keine unabhängige Prüfung ausgeführter Dateiarbeit. Inhaltliche KI-Fehler sind trotz Format- und Quellenprüfung möglich. Höhere Ebenen lassen bewusst Details weg; Tagesberichte und Originalquellen bleiben erhalten. Abgeschlossene Zeiträume werden nach Verbindung beziehungsweise Interaktionen mit fünf Sekunden Leerlauf automatisch aufbereitet; ein eigener Mitternachtsdienst ist nicht enthalten. Ein automatischer Versuch je Berliner Kalendertag und App-Lauf sowie höchstens zwölf Modellaufrufe pro Durchlauf begrenzen die Nachholung. Die Antwortdauer hängt vom bestehenden Codex-Zugang und Modell ab; der beobachtete Timeout zeigt diese praktische Grenze.

Physisches Mikrofon, Live und zweiter Rechner wurden für diese reine Gedächtniserweiterung nicht erneut abgenommen. Die früheren M1/M2/M3-Nachweise bleiben separat dokumentiert. Kein Datentresor, keine Backup-Oberfläche und keine Vollzugriffsoption wurden ergänzt.
