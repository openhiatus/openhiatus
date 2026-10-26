import { packager } from '@electron/packager';
import { readFile, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
// Electron's executable runs the isolated ESM host in Node mode. Keep the SDK,
// WASM assets and native CUA on disk; no global Node or CLI is required.
const outputs = await packager({ dir: '.', out: process.env.OPENHIATUS_PACKAGE_OUT || path.join('release', manifest.version), name: manifest.productName, platform: 'win32', arch: 'x64',
  electronVersion: manifest.devDependencies.electron, appVersion: manifest.version, overwrite: true, asar: false, prune: true,
  ignore: [/^\/release($|\/)/, /^\/artifacts($|\/)/, /^\/\.test-data($|\/)/, /^\/\.tmp($|\/)/, /^\/\.git($|\/)/,
    /^\/src($|\/)/, /^\/tests($|\/)/, /^\/scripts($|\/)/, /^\/benchmarks($|\/)/, /^\/skills($|\/)/, /\.lnk$/, /agent-host-test\.mjs/, /\/node_modules\/@openai\/codex/],
  extraResource: [path.resolve('dist/native')],
  win32metadata: { CompanyName: manifest.productName, FileDescription: `${manifest.productName} Sprachassistent`, ProductName: manifest.productName }
});
for (const output of outputs) {
  const readme = `openHiatus – Version ${manifest.version}

Start: openHiatus.exe doppelklicken. Das vollständige Paket zusammen behalten.
openHiatus bringt Electron, die Pi-Laufzeit, den Windows-Prozessschutz und die Desktopsteuerung mit.
Node.js, ein globales Pi/Codex und OpenClaw sind nicht erforderlich.

Unter Einstellungen → Modelle & Zugänge → ChatGPT → Continue with ChatGPT im Browser anmelden.
Ein berechtigter ChatGPT-Plan kann nach Freigabe ohne API-Key verwendet werden;
Modelle und Kontingent richten sich nach deinem Konto. Automatische Gedächtnisberichte
mit ChatGPT benötigen eine zusätzliche Freigabe und sind standardmäßig ausgeschaltet.
Alternativ einen eigenen Modellanbieter einrichten: Anthropic, Google, OpenRouter,
OpenAI API oder einen lokalen OpenAI-kompatiblen Modellserver. Lokale Modelle brauchen keinen API-Key.
Schlüssel und ChatGPT-Zugangstoken bleiben im geschützten lokalen Zugangsspeicher.
Sprechen verwendet Inworld für Spracherkennung und Sprachausgabe;
den Zugang unter Einstellungen → Sprache & Geräte einrichten.
Für Gespräch, Arbeitsaufträge und Gedächtnis sind getrennte Modelle wählbar.
Eigene Skills können unter %APPDATA%\\openhiatus\\pi\\skills abgelegt werden.
Der Hilfe-Skill bildschirmhilfe wird einmalig ins Profil kopiert und bleibt dort bearbeitbar.
Persönliche Skill-Sammlungen werden nicht mitgeliefert.

Unter Einstellungen → Bedienung → Windows-Autostart kannst du „Mit Windows starten“
einschalten. Die App startet nach der Windows-Anmeldung minimiert in der Taskleiste.
Ein Klick auf das Taskleistensymbol oder ein manueller App-Start öffnet das Fenster.
Der Autostart ist zunächst aus. Lass den Paketordner an einem festen Ort; nach einem
Verschieben oder Paketwechsel die Option im neuen Paket erneut einschalten.
Vor dem Entfernen des Pakets kannst du die Option wieder ausschalten.

F8 startet/beendet die Aufnahme. F9 sendet den Entwurf bei aktiviertem „Transkript prüfen“.
Belegt eine andere App die Tasten, zeigt openHiatus einen sichtbaren Hinweis.
Die andere Anwendung bei Bedarf schließen und openHiatus neu starten oder die Schaltflächen im Fenster verwenden.
Strg+Enter sendet im openHiatus-Fenster. Strg+Alt+F12 stoppt openHiatus global.
Escape stoppt im openHiatus-Fenster und während einer Desktopübernahme aus jedem Programm.
Gespräch und höchstens zwei unabhängige Arbeitsaufträge können gleichzeitig laufen.
Stopp beendet die Agentsteuerung und den verwalteten Prozessbaum; bereits erfolgte
Dateiänderungen und Desktop-Eingaben werden dadurch nicht rückgängig gemacht.
Ausdrücklich eigenständig übergebene Nutzerfenster bleiben dabei geöffnet.

openHiatus arbeitet nach Bestätigung mit den Rechten des Windows-Benutzerkontos.
Die App bietet keine Sandbox. Hintergrundarbeit lässt deinen Arbeitsplatz frei.
Bei Desktopsteuerung zeigt ein gelber Rahmen die Übernahme an; eigene Maus- und
Tastatureingaben sind vorübergehend gesperrt. Esc stoppt den Agenten und gibt sie frei.
Registrierte F8-/F9-Sprachbefehle bleiben verfügbar. Die Sperre dient der Vermeidung
von Bedienkonflikten auf dem normalen Desktop und ist keine Windows-Sicherheitsgrenze.
Text wird üblicherweise über die Zwischenablage eingefügt und ersetzt deren Inhalt.
Unterbrochene Arbeit wird nach einem Neustart nicht automatisch wiederholt.
/goal und Live-Audio sind in dieser Version nicht verfügbar.

Eigene Daten, Einstellungen, Sitzungen und Skills: %APPDATA%\\openhiatus
Pi lädt eigene Skills aus dem openHiatus-Profil und die in der App eingerichteten Zugänge.
Globale Pi-Plugins und Pi-Zugänge werden nicht übernommen.

Dies ist eine lokal gebaute, noch nicht signierte Version.
`;
  await writeFile(path.join(output, 'Lies mich.txt'), readme.replace(/\n/g, '\r\n'), 'utf8');
  await cp('docs', path.join(output, 'Dokumentation'), { recursive: true });
  console.log(output);
}
