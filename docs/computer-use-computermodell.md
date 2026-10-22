# Getrenntes Computermodell

## Zweck und Aktivierung

Dieser optionale Versuch trennt fachliche Planung und visuelle Bedienung. Das Arbeitsmodell, beispielsweise gpt-6.1-sol, entscheidet über Rechenwege, Inhalte und die Prüfung der Abgabe. Ein gesondertes Computermodell, beispielsweise gpt-6-luna mit Fast, bedient die Oberfläche. Ein Geschwindigkeits- oder Kostenvorteil des vollständigen Ablaufs ist damit noch nicht nachgewiesen.

Die Einstellungen unter **Bedienung** enthalten die Aktivierung, eine eigene Modellauswahl und Fast. Neue Profile beginnen mit ausgeschalteter Trennung. Ist Luna im Modellkatalog verfügbar, kann es als Vorschlag erscheinen; es wird dadurch kein Auftrag gestartet. Entfernte Modelle werden nicht durch ein beliebiges anderes Modell ersetzt. Ohne verfügbare Auswahl lässt sich der Modus nicht aktivieren.

Beim Annehmen eines Auftrags werden Aktivierung, Computermodell, Fast und Übersichtsfaktor gemeinsam mit dem Arbeitsmodell gespeichert. Spätere Änderungen an Einstellungen verändern den wartenden oder laufenden Auftrag nicht. Die bestehende Darstellung mit Übersicht und einem Originalausschnitt bleibt erhalten; Auflösung und Koordinatenvertrag sind unabhängig vom ausgewählten Modell.

## Ablauf und Rechte

1. Das Arbeitsmodell übergibt mit `computer_task` ein begrenztes Bedienziel sowie nötige Texte, Formeln, Einschränkungen und prüfbare Zielzustände. Der bisherige Gesprächsverlauf, Skills und Dateien werden dem Computermodell nicht automatisch mitgegeben. Erlaubte Wege und Grenzen des Nutzerauftrags müssen im Teilauftrag stehen.
2. Das Computermodell beginnt mit einer frischen Aufnahme und führt mehrere einzeln beobachtete Desktopaktionen aus. Es sieht Übersicht und Detail, kann mit `inspect` den Ausschnitt ändern und mit `screenshot` und `resolution: "original"` ein Vollbild anfordern.
3. Mit `report_computer_task` übergibt es einen Textbericht mit `status` und `summary`; Beobachtungen und ungeprüfte Punkte dürfen strukturierte JSON-Daten enthalten. Der Host beendet danach die Computerlaufzeit und bestätigt die Freigabe, ohne eine weitere Modellantwort für Abschlussprosa anzufordern. Ein Bericht mit `reported` ist eine Abschlussbehauptung des Computermodells, keine fachliche Abnahme; der Elternbericht bleibt `verified: false`. `blocked`, `limit` und `error` benennen einen nicht abgeschlossenen Teilauftrag. Bereits ausgeführte Aktionen werden nicht wiederholt.
4. Das Arbeitsmodell prüft Ergebnisse und entscheidet über den nächsten Teilauftrag. Mit seinem eigenen `computer` kann es ausdrücklich Aufnahmen und Ausschnitte für visuelle Prüfungen anfordern. Native Eingaben laufen im getrennten Modus ausschließlich über den Computerteilauftrag.

Damit entstehen nicht für jeden Klick zwei hintereinander liegende Modellentscheidungen. Ein Teilauftrag kann mehrere Bedienaktionen abwickeln. Bei kleinteiligen Aufträgen, schwierigen Oberflächen oder häufigen Rückfragen kann der Übergabeaufwand trotzdem überwiegen.

Die Computerlaufzeit erhält das registrierte Desktopwerkzeug und das terminale Berichtswerkzeug. Das Berichtswerkzeug übergibt ausschließlich Daten und erteilt keine weiteren Bedienrechte. SDK-Werkzeuge für Dateien und Shell, Skills, Erweiterungen, Dienste, Gedächtnis und weitere Delegation sind ausgeschaltet. Sie übernimmt keine eigenen Geschäftsentscheidungen und verwendet gewöhnliche Anwendungsoberflächen. Die Auswahlstrategie enthält keine Regeln für Excel, Browser oder andere einzelne Programme.

Ein einzelner Eingabefehler bedeutet nicht automatisch, dass der Teilauftrag blockiert ist. Bei nicht aktiviertem Vordergrundfenster prüft das Computermodell das aktuelle Kontrollbild und kann einen sichtbaren, erlaubten Tastaturweg wählen. Ausdrückliche Vorgaben zur Wiederaufnahme, etwa ausschließlich Tastatur zu verwenden, gelten weiter. Berechtigungs-, Integritäts- und ausdrückliche Sicherheitsblockaden werden nicht umgangen. Bei unlesbaren Ansichten sind Ausschnitt oder Originalbild verfügbar. Ein tatsächlich blockierter Auftrag wird gemeldet; die Laufzeit muss ihr Aktionsbudget nicht ausschöpfen.

Ein gemeinsamer Host-Executor führt Desktopaktionen aus. Bestehende Aufnahme- und Ansichtskennungen, DPI-Prüfung, Eingabeübersetzung, Treiberfehler und Stopp gelten weiterhin. Parallele Teilaufträge oder gleichzeitige visuelle Prüfungen im selben Executor werden abgelehnt. Andere openHiatus-Aufträge erhalten durch diesen Modus keine zweite unabhängige Maus.

## Grenzen und Stopp

Ein Teilauftrag darf höchstens 40 Desktopwerkzeug-Aufrufe und vier Minuten beanspruchen. Aufnahmen und `inspect` zählen mit. Beide Grenzen werden vom Host durchgesetzt. Nach einem Limit kann das Arbeitsmodell den beobachteten Zustand auswerten und einen neuen erlaubten Teilauftrag annehmen lassen; eine automatische Wiederholung findet nicht statt.

Ein Bericht darf bis zu 64 KiB serialisierten UTF-8-JSON-Text enthalten: höchstens acht Verschachtelungsebenen, 4096 Werte, 256 Einträge je Array, 128 Felder je Objekt, 200 Zeichen je Schlüssel und 16000 Zeichen je String. Zeilenlisten und Objektbeobachtungen bleiben innerhalb dieser Grenzen vollständig erhalten; zusätzliche Felder sind Berichtsdaten. Eingebettete Daten-URLs werden abgelehnt. Fehlerhafte Berichtswerkzeug-Aufrufe beenden den Teilauftrag nicht und führen keine Desktopaktion aus; das Modell kann den Bericht korrigieren. Ältere finale JSON-Antworten werden mit denselben Datengrenzen weiter angenommen. Die Übergabe enthält keine Bildschirmbilder; das Arbeitsmodell fordert diese bei Bedarf selbst an.

Stopp beendet auch den Computerprozess und wartet auf die Freigabe gestarteter Desktopoperationen. Die Freigabe wird vor Rückgabe eines Teilauftrags bestätigt. Kann sie nicht bestätigt werden, bleibt die Ressource gesperrt und der Stopp muss wiederholt werden. Bereits erfolgte Änderungen bleiben bestehen. Die Computerlaufzeit kann nicht versehentlich eine Sitzung mit Shell- oder Dateirechten fortsetzen.

## Fast und Messwerte

Fast wird ausdrücklich im OpenAI-Responses-Payload angefordert, mit dem kompatiblen Drahtwert `service_tier: "priority"`. OpenAI dokumentiert `priority` und `fast` als gleichwertige Namen; der ältere Name vermeidet die Ablehnung des neueren Werts auf Zugangspfaden, die diesen noch nicht annehmen. Die logische Einstellung und Diagnose bleiben „Fast angefordert“. Es gibt keinen Wiederholungsversuch mit Standardverarbeitung. [OpenAI Docs zu Fast](https://developers.openai.com/api/docs/guides/fast-mode)

Nicht unterstützte Anbieter/Adapter werden mit dieser Einstellung abgelehnt. Die vom Anbieter tatsächlich gemeldete Service-Stufe wird getrennt erfasst: Eine akzeptierte Anfrage allein bestätigt kein Fast. `default` ist kein bestätigtes Fast, und eine fehlende Stufe bleibt unbekannt. Die App schreibt keine Zugangs- oder Antwortinhalte in diese Messwerte.

Auftragsdetails und gespeicherte Aufträge enthalten je Rolle, Modell und angefragter/gemeldeter Stufe:

- Anfragezahl sowie erfolgreiche, fehlgeschlagene und abgebrochene Modellantworten;
- aufsummierte Anfragezeit in Millisekunden;
- gemeldete Input-, Output-, Cache-Read- und Cache-Write-Tokens, sofern vorhanden.

Erfolgreiche Modellantworten sind keine erfolgreichen Fachaufgaben. Die Summenzeit der Modellanfragen ist keine Gesamt-Wandzeit des Auftrags und kann weitere SDK-Anfragen wie Kompaktierungen umfassen. Der normale Gesamtverbrauch kombiniert die kumulativen Arbeits- und Computerturns, ohne Computerwerte beim nächsten Arbeitsmodell-Ergebnis zu überschreiben. Die zusätzlichen Anfragegruppen werden nicht noch einmal zum Gesamtverbrauch addiert. Fehlende Zähler dürfen bei der Auswertung nicht als Beleg für nicht entstandene Kosten verwendet werden.

## Vergleich

Für den nächsten Vergleich bleiben Ausgangsdaten, Aufgabe, zulässige Werkzeuge, Bildschirm, Übersichtsfaktor und fachliche Abnahme gleich. Der vorherige reine Arbeitsmodell-Lauf bleibt erhalten. Der neue Versuch ändert die Modellaufteilung und fordert Fast für das Computermodell an; das ist kein isolierter Test allein der Modellgröße.

Gemessen werden gesamte Laufzeit, Zeit und Verbrauch pro Modell einschließlich Übergaben und Nachprüfungen, Werkzeugaufrufe, Vollbildanforderungen, Fehler, Kompaktierungen und fachliche Abnahme. Die API-Preisrechnung ist getrennt von der tatsächlichen Abrechnung eines ChatGPT-Zugangs auszuweisen. Ein einzelner Lauf beschreibt eine Beobachtung; mehrere Wiederholungen sind für typische Geschwindigkeit und Fehlerrate nötig.

Technische Tests verwenden lokale Modellnachbildungen und synthetische Bild-/Desktopadapter. Ein echter Modell- und Desktopvergleich wird gesondert manuell gestartet. Persönliche Testarchive und Profile gehören nicht ins öffentliche Repository.
