# Developing openHiatus

[Back to the project](../README.md) · [User guide](user-guide.md)

openHiatus uses Electron, React and TypeScript, with [Pi](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) as the agent runtime. No separate Codex or OpenClaw installation is needed.

- [Requirements](#development-requirements)
- [Run from source](#run-from-source)
- [Validation](#validation)
- [Packaging, languages and architecture](#further-development-guides)

## Development requirements

- Windows 10 (2004 or newer) or Windows 11, x64
- Node.js 24 with npm
- Windows PowerShell and the .NET Framework 4 64-bit C# compiler (`%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe`). The build uses it for the native process and hotkey helpers.

## Run from source

```powershell
git clone https://github.com/openhiatus/openhiatus.git
cd openhiatus
npm ci
npm start
```

`npm start` builds the app and opens it in Electron.

## Validation

For code changes, run:

```powershell
npm run check
npm run build
```

The checks cover architecture, TypeScript and unit tests. Then run the relevant UI, IPC, storage or packaging checks below. For documentation-only changes, check UTF-8, local links and consistency; a full application test run is not required.

Use isolated test profiles and synthetic data. Keep generated builds, test output and local backups in the ignored working directories; never use an existing personal profile for tests. See [AGENTS.md](../AGENTS.md) for repository conventions.

### UI, IPC and storage

```powershell
npm run build
npm run test:ui
npm run test:audio-devices-ui
npm run test:speech-providers-ui
npm run test:chatgpt-ui
npm run test:conversation
node scripts/fast-model-ui-check.mjs
npm run test:workflow
node scripts/google-calendar-ui-check.mjs
node scripts/google-calendar-setup-ui-check.mjs
npm run test:ipc
npm run test:storage-ui
npm run test:memory-storage-ui
npm run test:work-history-ui
npm run test:onboarding-ui
npm run test:memory-ui
npm run test:computer-images
npm run test:computer-preview
npm run test:computer-model-ui
npm run test:input-guard
npm run test:desktop-control
npm run test:autostart
```

## Further development guides

- **Packaging:** `npm run package` creates a portable Windows folder, and `npm run test:package` checks it. `npm run installer` builds a single Setup executable and SHA-256 file in `release/<version>/installer`. The first build downloads a pinned, hash-verified Inno Setup compiler into `.tmp`; no global compiler installation is needed. `npm run test:installer` checks installation, upgrade, running-app protection, shortcuts, profile preservation, installed workflows and removal with isolated folders and registry entries. It briefly opens its own test windows. See the [installation guide](windows-installation.md) for details. Builds, packages, test profiles, and run reports are not committed.
- **Languages:** `npm run test:i18n-ui` checks all seven languages, six workspaces at compact and full widths, draft preservation, live task continuity, background overlay refresh and restart persistence. `npm run test:desktop-control` also switches all seven languages during an actual desktop reservation. `npm run test:installer` checks each wizard language and its new-profile language registration. All use isolated test profiles.
- **Benchmarks:** Synthetic desktop tasks are available under [benchmarks](../benchmarks/README.md).
- **Architecture:** The [architecture overview](architekturpruefung.md) explains the module boundaries.
- **Test results:** The [test report](openhiatus-testprotokoll.md) records dated local checks. Older documents describe the state at the time they were written.
