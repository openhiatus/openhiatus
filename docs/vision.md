# Vision: openHiatus als Computer-Use-Assistent am eigenen Rechner

Stand: 24. Oktober 2026. Dieses Dokument beschreibt die Produktrichtung; es erklärt geplante Funktionen nicht für implementiert. Der [Gesamtplan](gesamtplan.md) legt Lieferabschnitte und Abnahme fest und wird an diese Richtung angepasst; der [Prüfstand](openhiatus-testprotokoll.md) dokumentiert tatsächlich getestete Funktionen.

## Das Ziel

openHiatus wird ein an das eigene Gerät gebundener Assistent für die Arbeit am Windows-Rechner. Er sieht, was auf dem Bildschirm ist, erledigt Abläufe in beliebigen sichtbaren Programmen oder zeigt Schritt für Schritt, wie man sie selbst erledigt. Man spricht oder schreibt mit ihm; Ergebnisse und Aktionen bleiben nachvollziehbar.

Der Schwerpunkt liegt auf Computersteuerung und Unterstützung am Bildschirm, nicht auf einem ständig aktiven Allzweckagenten mit möglichst vielen angebundenen Diensten. Gerade dort, wo Programme keine Schnittstelle anbieten – Fachsoftware, Webportale, ältere Anwendungen –, ist Bedienung über die Oberfläche oft der einzige Weg zur Automatisierung.

## Für wen

### Selbstständige und kleine Betriebe

Menschen, die über ihren Rechner selbst entscheiden und von eingesparter Zeit direkt profitieren. Typische Abläufe wiederholen sich: Belege und Rechnungen erfassen, Daten zwischen Programmen übertragen, Formulare und Portale ausfüllen, Dokumente vorbereiten. Hier steht das **Ausführen** im Vordergrund. Maßstab sind Zuverlässigkeit, Dauer und Kosten je erledigter Aufgabe.

### Menschen, die sich am Computer Unterstützung wünschen

Viele alltägliche Vorgänge – eine verschwundene E-Mail wiederfinden, eine Datei speichern, ein Dokument drucken – sind für manche Menschen eine Hürde. openHiatus kann hier **anleiten**: auf dem Bildschirm zeigen, wo der nächste Schritt ist, in einfacher Sprache erklären und abwarten, bis der Schritt erledigt ist.

Ob und in welcher Form das wirklich hilft, ist offen und wird mit echten Personen erprobt, bevor eigene Funktionen dafür ausgebaut werden. Denkbar ist eine einmalige Einrichtung durch eine vertraute Person, ein Start mit Windows und eine farbig markierte Sprechtaste, sodass im Alltag ein einziger Tastendruck genügt. Diese Gruppe ist eine Erkundung mit eigenem Prüfschritt, keine Zusage.

### Bewusst zunächst nicht: Einsatz in Unternehmen

Zentrale Verwaltung, Richtlinien für Firmennetze und Firmeninstallationen sind kein Ziel der nächsten Zeit. openHiatus richtet sich an Menschen, die die Software auf ihrem eigenen Gerät und in eigener Verantwortung einsetzen.

## Ein gemeinsamer Kern

Beide Zielgruppen brauchen dieselbe Grundlage; unterschiedlich sind Oberfläche und Standardverhalten.

| Baustein | Bedeutung |
| --- | --- |
| Bildschirm verstehen | Aktuelle Bilder mit Übersicht und Detail, ergänzt um Bedienelemente aus der Windows-Barrierefreiheitsschnittstelle (UI Automation): Namen, Rollen, Werte und Positionen. Pixelbasierte Bedienung bleibt Rückfall für Programme ohne verwertbare Elementdaten. |
| Ausführen | Der Agent bedient Programme selbst, prüft das Ergebnis am tatsächlichen Zustand und meldet Unsicherheiten. |
| Anleiten | Der Agent markiert den nächsten Schritt auf dem Bildschirm, erklärt ihn und erkennt, ob er erledigt wurde. Der Mensch behält die Bedienung. |
| Gemeinsamer Bildschirm | Mensch und Agent nutzen dieselbe Maus und Tastatur. Eingaben des Menschen haben Vorrang und pausieren den Agenten; Anmeldungen, Sicherheitsabfragen und unklare Stellen werden ausdrücklich übergeben und danach fortgesetzt. |
| Wiederholbare Abläufe | Ein erfolgreich erledigter oder vorgeführter Ablauf kann als Rezept mit Schritten und Prüfpunkten gespeichert werden. Bei Wiederholung folgt der Agent dem Rezept und plant nur bei Abweichungen neu. |
| Bildschirmgeometrie | Tatsächliche Auflösung und Windows-Skalierung werden erkannt; mehrere Monitore sind ein Ziel, weil sie an Arbeitsplätzen der Normalfall sind. |

Der derzeit verwendete Desktoptreiber kennt bereits Wege über die Barrierefreiheitsschnittstelle für die Eingabezustellung; dem Modell werden bisher nur Bilder übergeben. Die Elementdaten als zweite Wahrnehmung zu nutzen, ist der nächste große technische Schritt. Er dient beiden Zielgruppen: weniger Bilddaten und Fehlklicks beim Ausführen, genaue Markierungen beim Anleiten.

Skills bleiben lokale, eigene Abläufe im Benutzerprofil. Die Anwendung erhält keine Sonderlogik für einzelne Programme oder Tabellen.

## Schnell, günstig und verlässlich

Zeit bis zum nutzbaren Ergebnis und Kosten je Aufgabe sind zentrale Produktkriterien, weil Nutzer ihre Modellzugänge selbst bezahlen. Weniger Token oder kleinere Bilder allein sind kein Erfolg, wenn zusätzliche Modellrunden oder Korrekturen den Ablauf verlängern.

Verlässlichkeit wird mit wiederholbaren Benchmarks aus realistischen Abläufen gemessen: Büroprogramme, Browserformulare, Dateidialoge und Abläufe über mehrere Programme. Je Lauf werden Erfolg, Dauer, Kosten und nötige Eingriffe des Menschen erfasst, getrennt nach Modell. Die Bildstrategie mit Übersicht, Detailausschnitt und lokaler Änderungserkennung bleibt eine Messfrage; Einzelheiten stehen im [Computer-Use-Plan](computer-use-uebersicht-und-detail-plan.md).

## Vertrauen und Grenzen

Ein Agent, der den Rechner bedient, muss vorhersehbar handeln.

- **Freigabe an kritischen Stellen:** Senden, Bezahlen, Buchen, Löschen und endgültiges Absenden werden vor der Ausführung bestätigt. Der Agent erkennt solche Stellen und hält dort an.
- **Klare Tabus:** Bei Geldgeschäften, Passwörtern und Fernwartungsprogrammen erklärt openHiatus höchstens und handelt nicht selbst.
- **Erlaubte Programme:** Welche Anwendungen und Fenster bedient werden dürfen, ist einstellbar.
- **Nachvollziehbarkeit:** Gesehene Bilder und ausgeführte Aktionen lassen sich als Protokoll nachverfolgen.
- **Fremde Inhalte sind Daten:** Texte aus E-Mails, Webseiten oder Dateien erweitern niemals den Auftrag des Nutzers.

openHiatus arbeitet mit den Rechten des Windows-Benutzers; eine Sandbox wird nicht versprochen. Stopp hält weitere Agentenaktionen an, bereits erfolgte Änderungen werden nicht rückgängig gemacht. Ausgewählte Cloudmodelle erhalten die für eine Aufgabe nötigen Daten, bei Computersteuerung auch Bildschirminhalte. Eine lokale Anwendung wird deshalb nicht als offline dargestellt; lokale Modelle bleiben als Option erhalten. Zugangsdaten gehören in den geschützten Zugangsspeicher, nicht in Gespräch, Gedächtnis oder Protokolle.

## Bedienung

Sprechen per Taste und Schreiben bleiben gleichwertige Wege. Die Oberfläche bleibt ruhig: ein klarer Gesprächseinstieg, eine Aufgabenansicht mit Ergebnis, Verbrauch und Protokoll, getrennte Einstellungen. Präsenz und die optionale Arbeitsanzeige zeigen, wann der Agent arbeitet und wann er den Bildschirm bedient. Ein schneller Weg, um Hilfe zum gerade Sichtbaren zu bekommen, gehört zum Kern.

Die Oberfläche passt sich an Fenstergröße, Windows-Skalierung und vergrößerte Schrift an. Eine vereinfachte Ansicht für die anleitende Nutzung folgt erst, wenn Tests mit echten Personen zeigen, was dort gebraucht wird.

## Gedächtnis und Persönlichkeit

Die vier bearbeitbaren Dateien SOUL.md, IDENTITY.md, USER.md und MEMORY.md bleiben die Grundlage für Stil, Namen, Nutzerangaben und dauerhafte Fakten. Eigene Gedächtnisvorschläge des Agenten bleiben freigabepflichtig. Mit dem neuen Schwerpunkt gewinnt Wissen über Programme und Abläufe dieses Rechners an Bedeutung: welche Anwendungen genutzt werden, wo sich wiederkehrende Schritte befinden und welche Rezepte sich bewährt haben.

## Was zurücktritt

- **Persönliche Dienste:** Neue Anbindungen wie E-Mail, Kalender oder Chatdienste werden nicht vorrangig ausgebaut. Bereits vorhandene oder begonnene Anbindungen können als optionale Ergänzung bestehen bleiben; die gemeinsame Dienstgrenze bleibt im Code erhalten.
- **Ständige Eigeninitiative:** Regelmäßige Meldungen, Tagesübersichten und Hintergrundüberwachung sind kein Ziel. Ein Start mit Windows dient der schnellen Erreichbarkeit, nicht einem dauerhaft aktiven Agenten.
- **Live-Sprache und Freisprechen** werden später neu bewertet; die Sprechtaste bleibt der Hauptweg.

## Öffentliche Alpha und spätere Auslieferung

Der Quellcode wird als Alpha unter MIT auf GitHub öffentlich weiterentwickelt. Für Menschen ohne Entwicklerumgebung ist ein signiertes, einfach installierbares Windows-Paket nötig; es soll mit frischem Profil, anderen Bildschirmauflösungen und eigenen Konten funktionieren. Persönliche Projektlisten, Zugänge und Testprofile sind keine Voraussetzung des Produkts. Lizenzhinweise mitgelieferter Komponenten werden mitgeliefert.

## Einordnung früherer Fassungen

Die Fassung vom 22. Oktober 2026 mit dem Schwerpunkt auf einem allgemeinen persönlichen Assistenten und Gmail als erstem Dienst bleibt als [historische Fassung](archiv/vision-persoenlicher-assistent-2026-10-22.md) erhalten, ebenso die [ältere Vision](archiv/vision-openhiatus-2026-10-20.md). Ihre Grundlagen – Pi als eigene Laufzeit, wählbare Modelle, Sprache, Gedächtnis, Aufgabenverwaltung und Computersteuerung – werden weiterverwendet.
