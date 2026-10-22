# openHiatus

**A personal Windows assistant you can talk to, write to, and hand tasks off to.**

openHiatus is a desktop app that combines your choice of AI models, speech services, and a personal memory. You keep the conversation going while up to two tasks run in the background, and each task returns a result you can trace.

![Status: alpha](https://img.shields.io/badge/status-alpha-orange)
![Version 0.1.6](https://img.shields.io/badge/version-0.1.5-blue)
![Platform: Windows x64](https://img.shields.io/badge/platform-Windows%20x64-0078D6)
![License: MIT](https://img.shields.io/badge/license-MIT-green)

> [!WARNING]
> openHiatus is an **early public alpha**. Features, the interface, and data formats may change, and you should expect bugs and unfinished areas. This repository contains the source code only; there are no prebuilt Windows packages yet.

## Features

- 🎙️ **Talk or type.** Voice and text conversations, with push-to-talk via global hotkeys and an optional transcript review before sending.
- ⚙️ **Background tasks.** Up to two tasks run while the conversation stays available. Each task shows its progress, result, and usage.
- 🖥️ **Works on your computer.** Tools for files, the shell, and Windows desktop control, plus your own local skills.
- 🧠 **Personal memory.** Memories with sources, reports, and history, along with core instructions you can edit.
- 🔌 **Bring your own models.** Sign in with ChatGPT or use your own credentials for Anthropic, Google, OpenRouter, OpenAI, or a local OpenAI-compatible server.

openHiatus is built on Electron, React, and TypeScript. It uses [Pi](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) as its agent runtime and [Inworld](https://inworld.ai) for speech. No separate Codex or OpenClaw installation is needed.

## Getting started

### Requirements

- Windows x64
- Node.js 24 with npm
- Windows PowerShell and the .NET Framework 4 64-bit C# compiler (`%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe`). The build uses it for the native process and hotkey helpers.

### Run from source

```powershell
git clone https://github.com/openhiatus/openhiatus.git
cd openhiatus
npm ci
npm start
```

`npm start` builds the app and opens it in Electron.

### First-time setup

The app interface is currently in German. English meanings are shown in parentheses.

1. **Permissions:** On first launch, read and acknowledge the access permissions notice.
2. **Models:** Under **Einstellungen → Modelle & Zugänge** (Settings → Models & access), sign in with ChatGPT or set up your own provider. Then pick models for conversation, work, and memory. For a local server, enter its base URL and model ID.
3. **Speech (optional):** Under **Einstellungen → Sprache & Geräte** (Settings → Speech & devices), add your Inworld credentials, choose your audio devices, and run the speech test. Text input works without a speech service.

Model and speech providers are used with your own accounts. Their availability, usage limits, and costs depend on the service you choose.

### Keyboard shortcuts

Choose a specific microphone and speaker to keep using those devices. A disconnected choice remains selected and is marked as unavailable; reconnecting the device restores its use when it can be identified. If several identical devices cannot be distinguished, select the intended device again. Choose **Windows-Standardgerät** (Windows default device) only when you want to follow the current Windows selection.

| Key | Action |
| --- | --- |
| <kbd>F8</kbd> | Start or stop recording |
| <kbd>F9</kbd> | Send the transcript draft (when **Transkript prüfen** / Review transcript is on) |
| <kbd>Ctrl</kbd>+<kbd>Enter</kbd> | Send a message in the app window |
| <kbd>Esc</kbd> / <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>F12</kbd> | Stop the conversation and managed execution |

You can also stop individual tasks in the task view. If another program already uses a global hotkey, the app shows a notice, and the buttons in the window keep working.

## Privacy and safety

> [!IMPORTANT]
> openHiatus runs with **your Windows user's permissions and has no sandbox**. Desktop actions can operate visible applications and modify files.

- **Stopping:** Stop prevents further managed execution, but changes that were already made stay in place. Work windows that were explicitly handed off as independent keep running.
- **Clipboard:** Text input through the clipboard replaces the clipboard's contents.
- **Cloud services:** When you use cloud models or speech services, the data a task needs is sent to the selected provider. Local storage alone does not make the assistant offline.
- **Local data:** Settings, history, and memory are stored in `%APPDATA%\openhiatus`. Credentials are protected with Electron safeStorage and Windows DPAPI.
- **Skills:** Your own skills are local folders containing a `SKILL.md` file, stored in `%APPDATA%\openhiatus\pi\skills`. New profiles start without skills, and neither the repository nor the Windows package includes a skill collection.

## Known limitations

- Gmail and other personal services aren't connected yet. The services view is a placeholder for future integrations.
- Live audio is not available yet.
- How reliably desktop control works depends partly on the selected model and the application being controlled.
- The interface is not fully responsive to window size and display scaling yet.

## Roadmap

Planned work is tracked in [GitHub issues](https://github.com/openhiatus/openhiatus/issues?q=is%3Aissue+is%3Aopen+label%3Aplanning):

| Area | Issue |
| --- | --- |
| Personal assistant: conversation and background tasks | [#1](https://github.com/openhiatus/openhiatus/issues/1) |
| Clearer UI: navigation, tasks, and results | [#2](https://github.com/openhiatus/openhiatus/issues/2) |
| Responsive UI for window size, scaling, and text size | [#3](https://github.com/openhiatus/openhiatus/issues/3) |
| Architecture: domain modules and validated interfaces | [#4](https://github.com/openhiatus/openhiatus/issues/4) |
| Faster computer use with overview and detail views | [#5](https://github.com/openhiatus/openhiatus/issues/5) |
| Service integrations, starting with Gmail | [#6](https://github.com/openhiatus/openhiatus/issues/6) |
| Memory and personality | [#7](https://github.com/openhiatus/openhiatus/issues/7) |
| Voice: interruption, earlier playback, hands-free input | [#8](https://github.com/openhiatus/openhiatus/issues/8) |

For more background, see the [vision](docs/vision.md), the [roadmap](docs/roadmap.md), and the [implementation plan](docs/gesamtplan.md). These documents are written in German.

## Development

`npm run check` runs the architecture checks, type checking, and unit tests. Run it, together with `npm run build`, before you submit changes.

<details>
<summary>Additional checks for UI, IPC, and storage changes</summary>

```powershell
npm run build
npm run test:ui
npm run test:audio-devices-ui
npm run test:chatgpt-ui
npm run test:conversation
npm run test:workflow
npm run test:ipc
npm run test:storage-ui
npm run test:memory-storage-ui
npm run test:memory-ui
```

</details>

- **Packaging:** `npm run package` creates a local Windows development package, and `npm run test:package` checks it. Builds, packages, test profiles, and run reports are not committed.
- **Benchmarks:** Synthetic desktop tasks are available under [benchmarks](benchmarks/README.md).
- **Architecture:** The [architecture overview](docs/architekturpruefung.md) explains the module boundaries.
- **Test results:** The [test report](docs/openhiatus-testprotokoll.md) records dated local checks. Older documents describe the state at the time they were written.

## Contributing

Bug reports and feedback are welcome as [issues](https://github.com/openhiatus/openhiatus/issues). Please don't include personal profiles, credentials, or private data in issues or commits. Use synthetic data for examples and tests.

## License

openHiatus is licensed under the [MIT License](LICENSE). Dependencies and bundled components keep their own licenses.
