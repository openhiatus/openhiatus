# Arbeitsplatzübernahme und Notstopp

Stand: 25. Oktober 2026, Alpha 0.0.18.

Hintergrundarbeit und Desktopbesitz sind getrennte Zustände. Eine Internetrecherche, Dateiarbeit oder Bildschirmhilfe sperrt den Arbeitsplatz nicht allein deshalb, weil ein Auftrag läuft. Erst die gemeinsame Desktop-Lease eines `NativeComputer` startet die Übernahme. Das gilt auch für das optionale getrennte Computermodell.

## Sichtbarer Ablauf

| Zustand | Anzeige und Verhalten |
| --- | --- |
| Hintergrundarbeit | „Hintergrundarbeit · Arbeitsplatz frei“; eigene Eingaben bleiben möglich. |
| Vorbereitung | Gelber Rahmen auf jedem Display, „Agent übernimmt den Arbeitsplatz“; gehaltene Tasten oder Maustasten zuerst loslassen. Esc bricht ab. |
| Aktive Steuerung | „Agent steuert deinen PC“, Hinweis auf gesperrte Maus und Tastatur, groß „Esc – Stoppen & übernehmen“. |
| Stopp | Die Anzeige bleibt während des Beendens bestehen. Weitere Aktionen werden nicht zugelassen; native Eingaben werden aufgeräumt. |
| Freigabe | Nach bestätigtem Ende verschwindet die Übernahmeanzeige. Bei einem Fehler bleibt ein roter Hinweis mit erneuter Stoppmöglichkeit. |

Die Übernahme bleibt auch zwischen Computeraufrufen bestehen. Sie hängt weder vom Fokus des Hauptfensters noch vom optionalen Hintergrundsymbol ab. Das passive Hinweisfenster übernimmt keinen Tastaturfokus, lässt Agentenklicks durch und wird unter Windows aus Bildschirmaufnahmen ausgeschlossen. Die Bedienleiste in der App zeigt denselben Zustand auch außerhalb der Gesprächsansicht. Der Zustand ist flüchtig und wird nach einem Neustart nicht wiederhergestellt.

## Eingabesicherung

`desktop-protection.ts` startet den separat kompilierten Windows-Helfer `openhiatus-input-guard.exe`. Dieser installiert globale Low-Level-Hooks für Maus und Tastatur. Erst nach bestätigter Bereitschaft und losgelassenen Tasten startet der native Computertreiber. Physische Eingaben werden verworfen, nicht nachträglich abgespielt. Als injiziert gekennzeichnete Agenteneingaben bleiben möglich.

Physisches **Esc** oder **Strg+Alt+F12** löst den Notstopp aus. Vom Agenten injiziertes Esc löst diesen nativen Notstopp nicht aus. Während des Aufräumens blockiert der Helfer weitere injizierte Eingaben, lässt aber Loslassereignisse durch. Registrierte F8-/F9-Sprachbefehle werden direkt an die App gemeldet; sie gehen nicht als Tastendrücke an das gerade bediente Programm. Wiederholung einer gehaltenen Funktionstaste startet keine weiteren Sprachbefehle.

Der Helfer gibt Eingaben bei geschlossenem Steuerkanal, beendetem Elternprozess oder ungefähr zwei Sekunden ohne Lebenszeichen selbstständig frei. Auch ein Notstopp beendet die Sperre nach spätestens ungefähr zwei Sekunden unabhängig vom weiteren Aufräumen im Hauptprozess. Nicht bestätigtes Treiberende behält die Desktop-Lease und den Fehlerhinweis bei, damit kein weiterer Agent die ungeklärte Steuerung übernimmt. Ein fehlgeschlagenes Treiberende darf die Freigabe der menschlichen Eingaben nicht verhindern.

Es werden nur feste Statuswörter übertragen, keine Tastenwerte, Texte oder Mauspositionen. Die Hooks laufen mit eigener Nachrichtenschleife; ihre Rückrufe führen keine Datei- oder Pipe-Operationen aus.

## Grenzen und Prüfungen

Die Sperre dient der Vermeidung gewöhnlicher Bedienkonflikte. Sie ist keine Windows-Sicherheitsgrenze: Eingaben anderer Software können ebenfalls als injiziert gelten; sichere Desktops wie UAC oder der Anmeldebildschirm sind nicht erfasst. Windows kann nicht antwortende Low-Level-Hooks entfernen. Bereits zugelassene Aktionen können beim Stopp schon gewirkt haben. Ein Displaywechsel stoppt die laufende Steuerung; Computer Use bedient weiterhin nur den Hauptbildschirm, obwohl alle Displays einen Übernahmehinweis erhalten.

- `npm run check` prüft unter anderem Desktopbesitz, Startbereitschaft, Abbruch, verzögerte Freigabe, Treiberfehler, verspätete Overlay-Ladung und den IPC-Zustand.
- `npm run test:input-guard` kompiliert dieselbe native Eingabepolicy mit einem Testprogramm und prüft physische/injizierte Ereignisse, Esc, Sprachbefehle und Aufräumen. Der echte Helfer wird zusätzlich bei Kanalende, fehlenden Lebenszeichen, Halt und beendetem Elternprozess geprüft.
- `npm run test:desktop-control` verwendet ein eigenes Profil, ein synthetisches Testfenster und lokale Modellantworten. Geprüft werden freie Hintergrundarbeit, Übernahme trotz deaktiviertem Hintergrundsymbol, echte Aufnahme ohne den Rahmen, ein echter Agentenklick, Freigabe nach Abschluss und UI-Stopp sowie Neustart.
- `npm run test:package` wiederholt den Übernahmeablauf mit dem ausgelieferten Windows-Paket ohne globales Node/Codex im App-PATH.

Die nativen Tests aktivieren kurzzeitig die echte Sperre. Desktoptests nacheinander ausführen. Der automatisierte Esc-Nachweis prüft die produktive native Entscheidungslogik; er simuliert keinen physischen Tastendruck durch ein Hardwaregerät. Ein manueller Hardwaretest von Esc und blockierten eigenen Eingaben bleibt eine getrennte Abnahme.
