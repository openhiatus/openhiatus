# openHiatus

**A personal Windows assistant you can talk to, write to, and hand tasks off to.**

openHiatus is a desktop app that combines your choice of AI models, speech services, and a personal memory. You keep the conversation going while up to two tasks run in the background, and each task returns a result you can trace.

![Status: alpha](https://img.shields.io/badge/status-alpha-orange)
![Version 0.0.8](https://img.shields.io/badge/version-0.0.8-blue)
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

Spoken replies include the actual answer. The system prompt asks the model to return an `openhiatus-reply` block with two fields: `spoken`, a self-contained answer of at most 450 characters including important limitations, and `text`, the complete written reply. Both are produced in the same model request. The app accepts speech up to 500 characters unchanged and shortens longer speech without failing the task. Only the full written answer appears in the conversation. Older plain-text replies remain supported, and malformed output stays recoverable without reading raw protocol data aloud. See the [structured-reply contract](docs/structured-replies.md).

### Window layout and background activity

The left navigation automatically collapses to icons below 960 pixels of content width and expands in wider windows. Use the button at its bottom-right edge to choose either layout manually; your choice survives restart. The small reset button or **Einstellungen → Bedienung → Linke Navigation → Automatisch** restores automatic behavior. The central symbol scales with the space available in the conversation view.

Enable **Arbeitsanzeige im Hintergrund** (Background activity indicator) under **Einstellungen → Bedienung** to see an optional symbol at the top-right of the app's monitor while work continues in the background. It appears only during active conversation, task, or memory work, and hides when the app returns to the foreground or work ends. Drag its right-hand bar down to enlarge it or up to shrink it; the size is saved. The indicator stays out of keyboard focus, and desktop operations temporarily hide it before input and capture.

### Keyboard shortcuts

Choose a specific microphone and speaker to keep using those devices. A disconnected choice remains selected and is marked as unavailable; reconnecting the device restores its use when it can be identified. If several identical devices cannot be distinguished, select the intended device again. Choose **Windows-Standardgerät** (Windows default device) only when you want to follow the current Windows selection.

| Key | Action |
| --- | --- |
| <kbd>F8</kbd> | Start or stop recording |
| <kbd>F9</kbd> | Send the transcript draft (when **Transkript prüfen** / Review transcript is on) |
| <kbd>Ctrl</kbd>+<kbd>Enter</kbd> | Send a message in the app window |
| <kbd>Esc</kbd> / <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>F12</kbd> | Stop the conversation and managed execution |

You can also stop individual tasks in the task view. If another program already uses a global hotkey, the app shows a notice, and the buttons in the window keep working.

### Experimental desktop views (source builds)

Under **Einstellungen → Bedienung → Bildschirmübersicht** (Settings → Controls → Screen overview), choose a true scaling factor of 1:4, 1:8, 1:16 or 1:32. The next desktop task receives a small overview and at most one detail crop. Automatic detail resolution is independently selectable as 1:1, 1:2 or 1:4. A local pixel comparison selects changed regions; the model can request an original-resolution crop with `inspect` or predict the next region with an action. The first observation has no change history and starts with the overview. If orientation is insufficient, the model can request `screenshot` with `resolution: "original"` for one fresh, unscaled full-display image. Subsequent ordinary observations resume the configured factors. No additional model is used for selection. The app detects the primary display's resolution automatically.

**Bildaufbewahrung** (Image retention) bounds both the lifetime and number of captured computer frames. With a value of 2, at most two captures are present and each is included in at most two model requests. New views of the same capture replace its earlier images without extending its lifetime. An optional working note supplied with an existing computer call is limited to 240 characters; only its latest version remains in the outgoing context. User attachments, unrelated tool images, and local audit logs are preserved. No additional summarization calls are made. Removing earlier images can reduce prompt-cache reuse, so reduced context alone does not establish a cost or speed improvement. See [the image-budget contract](docs/computer-use-image-budget.md).

**Arbeitsgedächtnis** (Working memory) separately limits UI interaction history to 10 or 15 model requests. Older computer calls and their completed results are removed together, while the latest short working note remains. The host signals when that note should be replaced during an existing computer call. The user request, file/service data, and local logs are preserved. The compatible default keeps existing UI history; this experimental cutoff must be enabled deliberately.

**Full screen, original-resolution details, and unlimited image retention remain the compatible defaults.** In a [four-run LibreOffice comparison](docs/computer-use-image-budget.md#manual-comparison-23-october-2026), the latest configuration reduced API-equivalent cost per computer call from about **USD 0.189 to USD 0.0144** (92.37%) while passing first-phase artifact acceptance. Its total task cost was USD 5.04; this is a single-task result using Standard API comparison prices, not a ChatGPT billing claim or a general guarantee. Smaller images can require more inspection steps. Only the primary display is supported. The [computer-use plan](docs/computer-use-uebersicht-und-detail-plan.md) documents the contract and comparison criteria.

### Experimental separate computer model

Under **Einstellungen → Bedienung → Bildschirmübersicht**, optionally enable **Eigenes Computer-Modell verwenden** (Use a separate computer model), select a model such as `gpt-6-luna`, and enable **Fast** for its requests. The work model keeps planning and checking the task. It delegates bounded UI subtasks through `computer_task`; the computer model receives screenshots and performs several observed actions before returning a text report. The work model can explicitly request screenshots for its own verification. The mode is off by default and changes apply to newly admitted tasks.

The computer runtime has the desktop tool and a bounded result-reporting tool: no shell, file, skill, service or delegation tools. One host executor retains the existing frame, coordinate and Stop checks. Short observation handles reduce identifier copying; stale or misspelled handles are still rejected exactly. Subtasks are limited to 40 desktop calls and four minutes; reaching a limit returns control to the planner. Task details show usage and request timing by model, and distinguish requested Fast from the service tier actually returned by the provider. Fast currently requires an OpenAI Responses model. Availability and charges depend on your connection. End-to-end speed, cost and task accuracy need a fresh comparison; a cheaper model alone does not establish an improvement. See the [computer-model experiment](docs/computer-use-computermodell.md).

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
- Window layouts adapt down to a 560 × 440 outer window; broader display-scaling and enlarged-text coverage is still planned.

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
npm run test:computer-images
npm run test:computer-preview
npm run test:computer-model-ui
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
