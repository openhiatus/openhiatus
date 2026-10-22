# Gedächtnis und Identität in M3

> Historische Referenz einer früheren Entwicklungsreihe. Architektur, Bedienpfade, Versionsnummern und damalige Prüfergebnisse beschreiben den datierten Stand, keine neue Abnahme der aktuellen Pi-basierten Version. Lokale Nachweisdateien sind kein Bestandteil der öffentlichen Quellablage. Aktuelle Einrichtung und Prüfungen stehen in der README und im aktuellen Testprotokoll.

M3 ergänzt die bestehende Codex-Anbindung um einen lokalen Gedächtnisspeicher. Ab Version 0.3.1 erstellt Codex auch semantische Berichte. Dafür verwendet openHiatus den vorhandenen Codex-Zugang und das dort gewählte Modell. Diese Modellaufrufe verbrauchen das zugehörige Kontingent beziehungsweise werden über diesen Zugang abgerechnet. Ein weiterer API-Key ist nicht erforderlich. GPT-Live führt weiterhin das Live-Gespräch; Inworld bleibt der Standard-Sprachweg.

## Was die Oberfläche zeigt

Der Menüpunkt **Gedächtnis & Identität** enthält die gespeicherten Erinnerungen, den bearbeitbaren Kern, konkrete Änderungsvorschläge und die festen Laufzeitvorgaben. Die Identität war vorher als Anweisung im Programmcode hinterlegt. Diese tatsächlichen Vorgaben bleiben als schreibgeschützte Dokumente sichtbar; die persönlichen Identitäts- und Kerntexte sind zusätzlich versioniert und bearbeitbar.

Die Dokumente liegen gemeinsam im lokalen Gedächtnisspeicher unter `%APPDATA%/openhiatus/Gedächtnis`, außerhalb des beschreibbaren Demo-Arbeitsbereichs. Die Ansicht zeigt den tatsächlichen Speicherpfad. Es werden keine persönlichen Dateien aus OpenClaw übernommen. Die Quellen sind ausschließlich die Gespräche dieser openHiatus-Installation; künstliche Abnahmedaten bleiben in gesonderten Testprofilen.

## Erinnerungen und Quellen

Abgeschlossene Gesprächsinhalte werden mit Nachrichtenkennung, Zeitpunkt, Rolle und Gesprächszuordnung archiviert. Ein neues Gespräch entfernt sie nicht aus dem Gedächtnis. Neue Inhalte bekommen sofort vorläufige lokale Auszüge. Die KI-Aufbereitung erzeugt anschließend Berichte auf drei Ebenen:

- **Tag:** konkrete Aktivitäten, belegte Ergebnisse, Entscheidungen und offene Punkte.
- **Woche:** zusammengehörige Themen, Fortschritte und offene Arbeiten über mehrere Tage.
- **Monat:** übergreifende Entwicklungen und wesentliche Ergebnisse.

Synthetisches Beispiel: Aus „Erstelle eine Aufgabenliste aus den Projektnotizen“ folgt zunächst nur ein Auftrag. Erst eine bestätigte Dateiablage rechtfertigt im Tagesbericht „Aufgabenliste erstellt“ und im Wochenbericht einen Fortschritt bei der Projektplanung. Der Monatsbericht kann die übergreifende Planungsarbeit zusammenfassen. Die KI soll keine erfolgreiche oder vollständige Bearbeitung behaupten, wenn die Quellen nur den Wunsch dazu belegen.

Tagesberichte verarbeiten alle zugehörigen archivierten Nachrichten in begrenzten Abschnitten. Wochen und Monate nutzen alle Tagesberichte ihres Zeitraums; der Monat greift direkt auf seine Tage zu, damit keine Tage aus angrenzenden Monaten hineinrutschen. Große Eingaben werden in Teilschritten verdichtet. Die Oberfläche zeigt Modell, Erstellungszeit, ursprüngliche Quellen und genaue Versionen der verwendeten Berichte. Zeitgrenzen richten sich nach Europe/Berlin, Wochen nach der ISO-Woche.

Die Originalnachrichten, Tagesberichte und früheren Berichtsversionen bleiben erhalten. Eine höhere Verdichtungsstufe ersetzt oder löscht sie nicht. Nutzerkorrekturen werden nicht automatisch überschrieben. Neue Quellen kennzeichnen vorhandene KI-Berichte als veraltet; bis zur erfolgreichen Aktualisierung bleibt der bisherige Inhalt sichtbar.

## Wann die Aufbereitung läuft

Standardmäßig prüft openHiatus beim Verbinden und nach Interaktionen, ob abgeschlossene Tage, Wochen oder Monate fehlen, und beginnt im Leerlauf mit deren Aufbereitung. Es gibt keinen getrennten Hintergrunddienst. Die Option **Abgeschlossene Zeiträume automatisch aufbereiten** lässt sich abschalten. **Berichte mit Codex aktualisieren** nimmt auch laufende Zeiträume auf. Ein Durchlauf ist auf zwölf Modellaufrufe begrenzt; noch ausstehende Arbeit wird angezeigt und kann mit einem weiteren Durchlauf fortgesetzt werden. Pro geöffnetem App-Lauf wird höchstens ein automatischer Versuch je Kalendertag gestartet, damit Fehler oder große Rückstände keine unbemerkte Schleife auslösen.

Es läuft nur ein Codex-Arbeitsprozess. Neue Nutzeraufträge haben Vorrang vor automatischer Aufbereitung. Während einer manuell gestarteten Aufbereitung wartet der normale Auftragseingang. **Stopp** und Escape bleiben erreichbar und beenden auch die Aufbereitung. Ein laufendes Live-Gespräch und eine Aufbereitung starten nicht gleichzeitig.

Der Zusammenfassungs-Agent arbeitet mit reinem Lesezugriff. Er gibt strukturierte Aussagen mit Quellenkennungen zurück; die Anwendung prüft Format, bekannte Kennungen und unveränderte Ausgangsversion, bevor sie einen fertigen Bericht übernimmt. Das verhindert nicht jeden inhaltlichen KI-Fehler. Quellenansicht und Nutzerkorrekturen bleiben deshalb wichtig. Ein Fehler oder Abbruch übernimmt keinen unfertigen Bericht.

## Einen bestimmten Tag nachlesen

Im Menü lässt sich über **Tag nachlesen** ein Datum öffnen, beispielsweise `05.10.2026`. Im Gespräch sind auch „Was haben wir am 5. Oktober 2026 gemacht?“ oder ein ISO-Datum möglich. Ein ausdrücklich genanntes Datum wird gezielt gesucht. Fehlt der Bericht, meldet openHiatus das, statt einen neueren Tag einzusetzen.

Auch Wochen später kann Codex den erhaltenen Tagesbericht und seine Originalquellen nachlesen. Umfangreiche Inhalte werden seitenweise bereitgestellt; pro Auftrag ist der automatische Folgeabruf begrenzt. Wird diese Grenze erreicht, muss openHiatus auf noch ungelesene Seiten hinweisen. In der Gedächtnisansicht bleiben die Dokumente und Originalquellen einzeln zugänglich.

Vor einer Aufgabe werden passende Erinnerungen innerhalb eines begrenzten Kontextbudgets ausgewählt. Die Ansicht zeigt den zuletzt bereitgestellten Gedächtniskontext und seine Quellen. Er ist Gesprächswissen, keine Erlaubnis, frühere Arbeitsaufträge erneut auszuführen. Live erhält zum Sitzungsstart einen begrenzten Stand; weitergehende Erinnerungsfragen kann es an Codex delegieren.

## Identität, Kern und Freigaben

Der Nutzer kann Identität und Kern direkt ändern. Eine Änderung benennt ihre Ausgangsversion; ist inzwischen eine neuere Fassung entstanden, wird der alte Speicherversuch abgewiesen. Änderungen während einer laufenden Aufgabe wirken auf nachfolgende Aufgaben. Die festen Zugriffs- und Abbruchregeln bleiben übergeordnet.

openHiatus kann einen neuen Text als Vorschlag ablegen. Die UI zeigt die Ausgangsfassung, den vorgeschlagenen Text, die Begründung und die Quellen. Erst **Freigeben** übernimmt genau diesen Vorschlag. Ändert sich die Ausgangsversion, ist eine alte Freigabe nicht mehr gültig. Ablehnung verändert den Kern nicht. Automatische Verdichtung hat keinen Schreibweg in Identität oder Kern.

Versionsverlauf und Freigabestatus bleiben lokal gespeichert. Atomare Schreibvorgänge und eine letzte vollständige Sicherung schützen vor abgebrochenen Schreibvorgängen. Unbekannte Speicherformate werden nicht stillschweigend überschrieben.

## Grenzen dieser Version

Der Gedächtnisspeicher ist lokaler Klartext im Windows-Benutzerprofil. Er ist kein verschlüsselter Datentresor. Die aktuelle Codex-Sandbox darf außerhalb ihres Arbeitsbereichs nicht schreiben; eine Person oder ein Programm mit vollen Windows-Rechten kann lokale Dateien grundsätzlich verändern. M3 verspricht keine Unveränderlichkeit gegenüber Administratoren.

Erinnerungen sind endlich begrenzt; Speicherfehler werden angezeigt, statt ältere Quellen stillschweigend zu löschen. Audio wird weiterhin nicht dauerhaft gespeichert. Eigene Projektbereiche, UI-Backup/Wiederherstellung und die Vollzugriffsoption gehören zum späteren Ausbau. Die bisherigen Prüfungen stehen im [M3-Testprotokoll](m3-testprotokoll.md); die semantische Erweiterung wird im [M3.1-Testprotokoll](m31-testprotokoll.md) geprüft.
