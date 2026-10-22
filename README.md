# openHiatus

A personal Windows assistant for talking, writing, and getting tasks done. openHiatus combines a local desktop app with your choice of AI models, speech services, and personal memory.

**Status: Alpha · Version 0.1.5 · Windows x64 · MIT**

This project is being developed publicly as an alpha. Features, the interface, and data formats may change; bugs and incomplete areas are expected. This repository contains the source code and development documentation. Prebuilt Windows packages are not included.

## Available features

- Text and voice conversations, with separate views for tasks, memory, skills, and settings.
- ChatGPT sign-in and your own credentials for Anthropic, Google, OpenRouter, OpenAI, and local OpenAI-compatible model servers.
- Up to two background tasks while conversation remains available, with results and usage shown for each task.
- Tools for files, the shell, and Windows desktop control, plus support for your own local skills.
- Personal memory with sources, reports, and editable core instructions.

The agent runtime is based on Pi; speech uses Inworld. openHiatus does not require a separate Codex or OpenClaw installation. Configure model providers and speech services with your own credentials. Availability, usage limits, and costs depend on the selected service.

## Run from source

Requirements:

- Windows x64 and Node.js 24 with npm.
- Windows PowerShell and the .NET Framework 4 64-bit C# compiler at `%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe`. The build uses it for the native process and hotkey helpers.

From the project directory:

```powershell
npm ci
npm run check
npm start
```

`npm start` builds the application and opens it in Electron. Development and the native helpers currently target Windows.

## Setup and controls

The current app interface uses German labels; their English meanings are shown below.

1. On first launch, read and acknowledge the access permissions notice.
2. Under **Einstellungen → Modelle & Zugänge** (Settings → Models & access), sign in with ChatGPT or configure your own provider. Choose models for conversation, work, and memory. For local servers, enter the base URL and model ID.
3. For speech, add your own Inworld credentials under **Einstellungen → Sprache & Geräte** (Settings → Speech & devices), select your devices, and run the speech test. Text input also works without a speech service.

| Key | Action |
| --- | --- |
| F8 | Start or stop recording |
| F9 | Send the transcript draft when **Transkript prüfen** (Review transcript) is enabled |
| Ctrl+Enter | Send a message in the app window |
| Escape / Ctrl+Alt+F12 | Stop conversation and managed execution |

Tasks can also be stopped individually in the task view. If global hotkeys are already in use, the app shows a notice; the buttons in the window remain available.

## Data and permissions

Settings, history, and memory are stored under `%APPDATA%/openhiatus`; your own skills are stored under `%APPDATA%/openhiatus/pi/skills`. Credentials are protected with Electron safeStorage and Windows DPAPI. Personal profiles and credentials must not be committed to the repository.

Maintain your own skills as local folders containing a `SKILL.md` file. New profiles start without preinstalled skills; the source code and Windows package do not include a skill collection.

openHiatus runs with the permissions of your Windows user account and has no sandbox. Desktop actions can operate visible applications and modify files. Stop prevents further managed execution; changes already made remain in place. Explicitly handed-off independent work windows continue running. Text input through the clipboard replaces its contents.

When using cloud models and speech services, the data required for the task is sent to the selected provider. Local storage therefore does not make the assistant fully offline.

## Known limitations and next steps

Gmail and other personal services are not connected yet; the services view is a placeholder for future integrations. Live audio and `/goal` are deferred. Desktop control reliability depends in part on the selected model and the application being controlled.

Upcoming work focuses on computer control, an adaptable interface, and service integrations. The [vision](docs/vision.md), [roadmap](docs/roadmap.md), and [implementation plan](docs/gesamtplan.md) describe the direction and planned work. Public development starts with this alpha.

## Development and checks

`npm run check` runs the architecture checks, type checking, and tests. For changes to the UI, IPC, or storage, additional checks are available:

```powershell
npm run build
npm run test:ui
npm run test:chatgpt-ui
npm run test:conversation
npm run test:workflow
npm run test:ipc
npm run test:storage-ui
npm run test:memory-storage-ui
npm run test:memory-ui
```

`npm run package` creates a local Windows development package; `npm run test:package` checks that package. Generated builds, packages, test profiles, and run reports are not committed. Synthetic practice tasks are available under [benchmarks](benchmarks/README.md).

The [architecture overview](docs/architekturpruefung.md) explains the module boundaries. The [test report](docs/openhiatus-testprotokoll.md) records dated local development checks. Older documents describe their respective historical state.

## License

openHiatus is licensed under the [MIT License](LICENSE). Dependencies and bundled components retain their own licenses.
