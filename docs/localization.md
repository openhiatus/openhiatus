# Mehrsprachige Oberfläche

Ab 0.0.21 unterstützen die App und das Windows-Setup Englisch, Spanisch, Französisch, Deutsch, Chinesisch (vereinfacht), Japanisch und Portugiesisch (Brasilien). **Einstellungen → Sprache der Oberfläche** zeigt die Sprachen mit ihren eigenen Namen. Der Wechsel ist auch vor der Bestätigung des Vollzugriffs möglich und benötigt keinen Neustart.

Die Auswahl betrifft Navigation, Einstellungen, Gesprächsbedienung, Aufgaben, Dienste, Gedächtnisbedienung, Skills, Zugriffshinweise sowie die Hintergrund- und Übernahmeanzeigen einschließlich der Esc-Anweisung. Zahlen und Datumsanzeigen folgen der gewählten Sprache. Namen von Modellen, Geräten, Dateien und Diensten bleiben erhalten. Nutzernachrichten, Modellausgaben, Skill-Inhalte, gespeicherte Protokolle, technische Diagnosen und die bearbeitbaren Identitäts- und Anweisungsdateien werden nicht nachträglich übersetzt. Die Sprachwahl ändert weder Modellanweisungen noch die ausgewählte Sprachausgabestimme.

## Speicherung und Installation

`preferences.uiLanguage` speichert einen der Werte `en`, `es`, `fr`, `de`, `zh-CN`, `ja`, `pt-BR`. IPC und Profilspeicher prüfen die Werte. Alte Profile ohne dieses Feld erhalten `de`.

Setup verwendet die mit dem festgelegten Inno-Compiler ausgelieferten Sprachdateien und übersetzte eigene Meldungen. Die [Sprachauswahl](https://jrsoftware.org/ishelp/topic_setup_showlanguagedialog.htm) ist aktiviert. Seine Auswahl steht in `HKCU\Software\openhiatus.desktop\InstallerLanguage`. Nur ein noch nicht vorhandenes normales App-Profil übernimmt diese Vorgabe. Ohne gültigen Setup-Eintrag wird die Systemsprache einer unterstützten Variante zugeordnet; unbekannte Sprachen verwenden Englisch. Portugiesische und chinesische Systemvarianten verwenden die oben genannten unterstützten Schreibweisen. Ein explizites `--data-dir` startet ohne vorhandene Präferenz deterministisch auf Deutsch und liest keine normale Setup-Registrierung.

Updates verändern vorhandene Profile nicht. Die Deinstallation entfernt den eigenen Setup-Sprachwert, erhält aber die App-Präferenz im Benutzerprofil.

Native Windows-Bestätigungsbuttons können der Windows-Sprache folgen. Die Setup-Prüfung erkennt solche Buttons über ihre feste Windows-Kennung, unabhängig von der Sprache des Assistenten.

## Übersetzungen pflegen

- [ui-language.ts](../src/shared/ui-language.ts) definiert die sieben Sprachcodes und Anzeigeformate.
- [messages.json](../src/shared/locales/messages.json) enthält deutsche Quelltexte als Schlüssel. Jede Zeile enthält Übersetzungen in der Reihenfolge **Englisch, Spanisch, Französisch, vereinfachtes Chinesisch, Japanisch, brasilianisches Portugiesisch**. Deutsch verwendet den Quelltext.
- [i18n.ts](../src/shared/i18n.ts) stellt `t`, `translate`, `localized` sowie sprachabhängige Zahlen- und Datumsformatierung bereit. Neue Anzeigetexte mit `t('Text mit {0}', wert)` einsetzen und alle sechs Übersetzungen ergänzen. Parameter werden genau einmal ersetzt und als React-Text ausgegeben; Nutzereingaben sind keine Übersetzungsschlüssel.
- Statische Tabellen mit Anzeigetexten verwenden `localized`, damit ihre Texte bei jedem Lesen die aktuelle Sprache berücksichtigen. Diese Funktion gehört ausschließlich an feste UI-Tabellen. Keine gespeicherten Nutzerdaten oder technischen Kennungen übersetzen.
- Der Snapshot setzt die Anzeigesprache vor dem Rendern. Die Ansichten bleiben montiert, damit Entwürfe, geöffnete Bereiche und laufende Sitzungen erhalten bleiben. Die beiden nativen Anzeigen werden bei Sprachänderungen ausdrücklich aktualisiert, auch wenn ihre Arbeitsphase gleich bleibt.
- Native Setup-Texte und Sprachcodes stehen in [windows-installer.iss](../resources/windows-installer.iss). App- und Setup-Sprachen gemeinsam erweitern.

## Prüfen

```powershell
npm run check
npm run build
npm run test:i18n-ui
npm run test:desktop-control
npm run installer
npm run test:installer
```

Die Katalogprüfung verlangt sechs vollständige Übersetzungen mit denselben Parametern und erkennt fehlende wörtliche `t`-Schlüssel. Die App-Prüfung bedient alle Sprachen in sechs Ansichten, erhält Gesprächs-, Zugangsdaten- und Gedächtnisentwürfe und wechselt während einer laufenden synthetischen Aufgabe. Die Desktopprüfung kontrolliert übersetzte Sperr- und Esc-Hinweise bei echter nativer Reservierung. Setup-Prüfungen verwenden ausschließlich eigene App-IDs, Registrierungsschlüssel und Profile. Screenshots und Nachweise bleiben unter dem ignorierten `artifacts`-Verzeichnis.
