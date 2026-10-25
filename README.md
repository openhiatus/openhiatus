# openHiatus

**A computer-use assistant for your own Windows PC: it works in your programs for you, and you can talk to it while it does.**

openHiatus is a desktop app that operates visible Windows applications with your choice of AI models. You describe a task by voice or text, keep the conversation going while up to two tasks run in the background, and each task returns a result you can trace. The project focuses on reliable, affordable computer use on your own device; see [Direction](#direction).

![Status: alpha](https://img.shields.io/badge/status-alpha-orange)
![Version 0.0.18](https://img.shields.io/badge/version-0.0.18-blue)
![Platform: Windows x64](https://img.shields.io/badge/platform-Windows%20x64-0078D6)
![License: MIT](https://img.shields.io/badge/license-MIT-green)

> [!WARNING]
> openHiatus is an **early public alpha**. Features, the interface, and data formats may change, and you should expect bugs and unfinished areas. This repository contains the source code only; there are no prebuilt Windows packages yet.

## Features

- 🖥️ **Works in your programs.** Windows desktop control from current screenshots, plus tools for files and the shell and your own local skills.
- 🎯 **Shows you where to click.** Ask about the visible program; a circle and arrow highlight the target directly on your primary display while you keep control.
- 🎙️ **Talk or type.** Voice and text conversations, with push-to-talk via global hotkeys and an optional transcript review before sending.
- ⚙️ **Background tasks.** Up to two tasks run while the conversation stays available. Each task shows its progress, result, and usage.
- 🧠 **Personal memory.** Memories with sources, reports, and history, along with core instructions you can edit.
- 📅 **Google Calendar (optional).** Read your agenda and create or change personal events through your own Google OAuth client.
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

Eligible ChatGPT and OpenAI models appear as adjacent choices such as **gpt-6.1-sol** and **gpt-6.1-sol (fast)**. Each role saves its own choice. The Fast variant requests faster processing with the same underlying model; a choice without `(fast)` sends no explicit Fast request. The provider determines the actual processing tier, which can differ from the request. API Fast requests may cost more. The conversation view shows both the selected conversation and work model, including `(fast)`. Existing model selections remain unchanged. The experimental separate computer model retains its own Fast switch under **Bedienung**.
3. **Speech (optional):** Under **Einstellungen → Sprache & Geräte** (Settings → Speech & devices), add your Inworld credentials, choose your audio devices, and run the speech test. Text input works without a speech service.

Model and speech providers are used with your own accounts. Their availability, usage limits, and costs depend on the service you choose.

Spoken replies include the actual answer. The system prompt asks the model to return an `openhiatus-reply` block with two fields: `spoken`, a self-contained answer of at most 450 characters including important limitations, and `text`, the complete written reply. Both are produced in the same model request. The app accepts speech up to 500 characters unchanged and shortens longer speech without failing the task. Only the full written answer appears in the conversation. Older plain-text replies remain supported, and malformed output stays recoverable without reading raw protocol data aloud. See the [structured-reply contract](docs/structured-replies.md).

### Assistant name and personality

Under **Gedächtnis → Agent & Nutzer** (Memory → Agent & user), edit four real Markdown files: **SOUL.md** for personality, values, style and boundaries; **IDENTITY.md** for the assistant's name, role, presence and emoji; **USER.md** for your information and preferences; and **MEMORY.md** for durable facts, decisions and insights. Settings → Personality links directly to this same editor. openHiatus remains the app name; the name in IDENTITY.md appears in the conversation.

The files live in `%APPDATA%\openhiatus\Gedächtnis` and can be edited in the UI or with a text editor. External changes are versioned when loaded; **Dateien neu einlesen** (Reload files) refreshes the editor. Saved changes apply before the next message. Already running or queued tasks retain their captured instructions. Stale UI drafts cannot overwrite a newer file version. Each file supports up to 8,000 characters. The app retains earlier versions and pending memory approvals.

The existing built-in and custom styles remain in **Stilvorlagen verwalten** (Manage style templates). Choose or edit a template and copy it into a SOUL.md draft, then review and save the file to apply it. The four files are the active model instructions; template library changes alone do not change the active style. Migration seeds SOUL.md from the previously selected style and IDENTITY.md from the saved name, preserves existing long-term facts and keeps the older background document and its history available separately.

The style applies to both spoken and written replies. Style strength remains model-dependent; automated checks establish prompt delivery, file synchronization and persistence rather than guaranteeing a particular tone. Reports, original sources and the existing explicit approval flow remain in Memory. See the [identity and memory file guide](docs/identity-and-memory-files.md).

### Window layout and background activity

The left navigation automatically collapses to icons below 960 pixels of content width and expands in wider windows. Use the button at its bottom-right edge to choose either layout manually; your choice survives restart. The small reset button or **Einstellungen → Bedienung → Linke Navigation → Automatisch** restores automatic behavior. The central symbol scales with the space available in the conversation view.

Enable **Arbeitsanzeige im Hintergrund** (Background activity indicator) under **Einstellungen → Bedienung** to see a round symbol with a short status at the top-right of the app's monitor. It stays visible throughout listening, transcription, thinking, work, speech synthesis, and playback while the main window is in the background. Transcript review keeps a ready indicator; idle hides it. The former rectangular transcript overlay is replaced by this same optional symbol. Full transcripts and replies stay in the main window.

Choose **Größe der Arbeitsanzeige** (Indicator size) in the same settings card, or drag the symbol's right-hand grip down to enlarge it and up to shrink it. The size is saved. The indicator stays out of keyboard focus, and desktop operations temporarily hide it before input and capture.

Background tasks show **Hintergrundarbeit · Arbeitsplatz frei** in the app: you can keep using your mouse and keyboard. When the agent actually acquires desktop control, a mandatory amber frame and a large **Agent steuert deinen PC** banner appear on every connected display. Your ordinary physical mouse and keyboard input is blocked while the agent owns the desktop, including pauses between model requests. The banner remains visible even when the optional background indicator is disabled. Screen help that only observes and marks a target leaves input available.

Press **Esc** to stop the agent and take over; the banner displays this shortcut throughout the takeover. **Ctrl+Alt+F12** also stops it. Registered **F8/F9** voice shortcuts remain available. Completion or Stop releases the input lock. A separate Windows helper releases it if the app exits or stops responding; the watchdog is about two seconds. Already admitted input may have taken effect. This prevents ordinary input conflicts on the current desktop; it is not a security boundary against other software injecting input and does not cover Windows secure desktops. See the [desktop-control contract](docs/desktop-control.md).

### Keyboard shortcuts

Choose a specific microphone and speaker to keep using those devices. A disconnected choice remains selected and is marked as unavailable; reconnecting the device restores its use when it can be identified. If several identical devices cannot be distinguished, select the intended device again. Choose **Windows-Standardgerät** (Windows default device) only when you want to follow the current Windows selection.

| Key | Action |
| --- | --- |
| <kbd>F8</kbd> | Start or stop recording |
| <kbd>F9</kbd> | Send the transcript draft (when **Transkript prüfen** / Review transcript is on) |
| <kbd>Ctrl</kbd>+<kbd>Enter</kbd> | Send a message in the app window |
| <kbd>Esc</kbd> / <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>F12</kbd> | Stop the conversation and managed execution |

You can also stop individual tasks in the task view. If another program already uses a global hotkey, the app shows a notice, and the buttons in the window keep working.

During desktop takeover, use **Esc** from any program. Outside takeover, Esc works in the openHiatus window; **Ctrl+Alt+F12** is the global Stop shortcut.

### Experimental desktop views (source builds)

Under **Einstellungen → Bedienung → Bildschirmübersicht** (Settings → Controls → Screen overview), choose a true scaling factor of 1:4, 1:8, 1:16 or 1:32. The next desktop task receives a small overview and at most one detail crop. Automatic detail resolution is independently selectable as 1:1, 1:2 or 1:4. A local pixel comparison selects changed regions; the model can request an original-resolution crop with `inspect` or predict the next region with an action. The first observation has no change history and starts with the overview. If orientation is insufficient, the model can request `screenshot` with `resolution: "original"` for one fresh, unscaled full-display image. Subsequent ordinary observations resume the configured factors. No additional model is used for selection. The app detects the primary display's resolution automatically.

**Bildaufbewahrung** (Image retention) bounds both the lifetime and number of captured computer frames. With a value of 2, at most two captures are present and each is included in at most two model requests. New views of the same capture replace its earlier images without extending its lifetime. An optional working note supplied with an existing computer call is limited to 240 characters; only its latest version remains in the outgoing context. User attachments, unrelated tool images, and local audit logs are preserved. No additional summarization calls are made. Removing earlier images can reduce prompt-cache reuse, so reduced context alone does not establish a cost or speed improvement. See [the image-budget contract](docs/computer-use-image-budget.md).

**Arbeitsgedächtnis** (Working memory) separately limits UI interaction history to 10 or 15 model requests. Older computer calls and their completed results are removed together, while the latest short working note remains. The host signals when that note should be replaced during an existing computer call. The user request, file/service data, and local logs are preserved. The compatible default keeps existing UI history; this experimental cutoff must be enabled deliberately.

**Full screen, original-resolution details, and unlimited image retention remain the compatible defaults.** In a [four-run LibreOffice comparison](docs/computer-use-image-budget.md#manual-comparison-23-october-2026), the latest configuration reduced API-equivalent cost per computer call from about **USD 0.189 to USD 0.0144** (92.37%) while passing first-phase artifact acceptance. Its total task cost was USD 5.04; this is a single-task result using Standard API comparison prices, not a ChatGPT billing claim or a general guarantee. Smaller images can require more inspection steps. Only the primary display is supported. The [computer-use plan](docs/computer-use-uebersicht-und-detail-plan.md) documents the contract and comparison criteria.

### Experimental separate computer model

Under **Einstellungen → Bedienung → Bildschirmübersicht**, optionally enable **Eigenes Computer-Modell verwenden** (Use a separate computer model), select a model such as `gpt-6-luna`, and enable **Fast** for its requests. The work model keeps planning and checking the task. It delegates bounded UI subtasks through `computer_task`; the computer model receives screenshots and performs several observed actions before returning a text report. The work model can explicitly request screenshots for its own verification. The mode is off by default and changes apply to newly admitted tasks.

The computer runtime has the desktop tool and a bounded result-reporting tool: no shell, file, skill, service or delegation tools. One host executor retains the existing frame, coordinate and Stop checks. Short observation handles reduce identifier copying; stale or misspelled handles are still rejected exactly. Subtasks are limited to 40 desktop calls and four minutes; reaching a limit returns control to the planner. Task details show usage and request timing by model, and distinguish requested Fast from the service tier actually returned by the provider. Fast currently requires an OpenAI Responses model. Availability and charges depend on your connection. End-to-end speed, cost and task accuracy need a fresh comparison; a cheaper model alone does not establish an improvement. See the [computer-model experiment](docs/computer-use-computermodell.md).

### Screen help without switching programs

Keep your program in front and ask by voice using F8, for example: “Where is the bold button?” The conversation model can observe the primary display and show a thick circle with an arrow directly around the target. It selects **red, black or white** for contrast with the observed background; the app draws a 7-DIP stroke with a 12-DIP contrasting halo. The overlay does not take keyboard focus and lets your clicks pass through. You operate the program yourself; a help question does not need an executing background task. Existing voice submission/review settings still apply.

Enable **Einstellungen → Bedienung → IT-Supporter** (Settings → Controls → IT supporter) to make guidance the assistant's primary role throughout the interaction. It uses context and the user's goal rather than matching keywords: indirect requests, confusion, finding things and changing settings normally lead to explanation and visible next steps. Explicit requests to execute work remain available. In this mode, **Gespräch** becomes a read-only **Protokoll** (Log), voice and desktop hints carry the help, and the regular text composer is hidden. Transcript review remains available for recognized speech. Disabling the mode restores the normal conversation and any retained text draft. Existing profiles keep this optional mode off until selected; changing it applies to the next message and does not replace identity files or audio preferences.

The editable **bildschirmhilfe** skill is installed at `%APPDATA%\openhiatus\pi\skills\bildschirmhilfe\SKILL.md`. Its instructions are loaded with a help observation, rather than repeated in every system prompt. Existing edits survive app upgrades; the known unedited 0.0.16 factory instruction is updated with a backup. The read-only tool supports observation, original-resolution detail inspection, marking and clearing; it has no desktop input operations. Screen images go to your selected conversation model and are omitted after two model requests. They are not added to the chat view.

A local comparison checks the target before drawing. Keyboard input, mouse clicks or scrolling, foreground-window/geometry changes and Stop invalidate the marker; it also expires after 30 seconds. Automatic changes within a program after the marker appears are not continuously verified. Recognition accuracy depends on the selected image-capable model. See the [screen-help guide](docs/screen-help.md).

### Google Calendar

Under **Dienste → Google Kalender** (Services → Google Calendar), follow the setup guide to register a Google OAuth **Desktop app**, save its client ID and optional client secret, and sign in through your normal browser. Enable the Google Calendar API in that Cloud project first. You can then choose a calendar, preview the next seven days, and ask openHiatus to read, create or change events in conversation. Your chosen calendar and connection survive restart; tokens are kept in the local encrypted credential store.

This first version creates and changes personal single events without attendees. It reads recurring instances and supports timed and all-day events. Invitations, attendee management, deletion and series-wide changes remain outside the exposed tools. Read-only calendars stay read-only. Updates require the version previously read, and uncertain write outcomes are reported for inspection rather than silently retried. Your Google account is connected only after you supply a Desktop client and approve Google's consent screen. See the [Google Calendar setup guide](docs/google-calendar.md).

## Privacy and safety

> [!IMPORTANT]
> openHiatus runs with **your Windows user's permissions and has no sandbox**. Desktop actions can operate visible applications and modify files.

- **Stopping:** Stop prevents further managed execution, but changes that were already made stay in place. Work windows that were explicitly handed off as independent keep running.
- **Clipboard:** Text input through the clipboard replaces the clipboard's contents.
- **Cloud services:** When you use cloud models or speech services, the data a task needs is sent to the selected provider. Local storage alone does not make the assistant offline.
- **Local data:** Settings, history, and memory are stored in `%APPDATA%\openhiatus`. Credentials are protected with Electron safeStorage and Windows DPAPI.
- **Skills:** Your own skills are local folders containing a `SKILL.md` file, stored in `%APPDATA%\openhiatus\pi\skills`. The app seeds the editable screen-help skill; no personal skill collection is bundled.

## Known limitations

- Google Calendar requires a user-configured Desktop OAuth client; a shared verified openHiatus Google client is not bundled. Further service integrations such as Gmail are not currently planned.
- Desktop control sees screenshots only; reading UI elements through Windows accessibility data, approval of critical actions, and multi-monitor support are planned.
- Live audio is not available yet.
- How reliably desktop control works depends partly on the selected model and the application being controlled.
- Window layouts adapt down to a 560 × 440 outer window; broader display-scaling and enlarged-text coverage is still planned.

## Direction

openHiatus is moving from a general personal assistant toward device-bound computer use: operating programs on your behalf, and guiding you step by step through tasks you want to do yourself. The primary audience is people who decide about their own PC, such as freelancers and small businesses. Guided help for people who find computers difficult is being explored with real users before dedicated features are built. Enterprise deployment and new service integrations are not current goals.

Planned next steps, in order:

1. Read UI elements through Windows accessibility data alongside screenshots, with pixel control as fallback.
2. Repeatable benchmarks measuring success, duration, cost and human interventions per run.
3. Approval before critical actions, fixed limits around payments, passwords and remote-access tools, allowed applications, and a per-task action log.
4. Sharing the screen safely: user input pauses the agent, with explicit hand-over and resumption.
5. Saving successful workflows as reusable recipes.
6. Extend screen guidance with step verification and real-user trials.
7. Multi-monitor support and a signed, easy-to-install Windows package.

The existing [planning issues](https://github.com/openhiatus/openhiatus/issues?q=is%3Aissue+is%3Aopen+label%3Aplanning) predate this direction and will be realigned. For details, see the [vision](docs/vision.md), the [roadmap](docs/roadmap.md), and the [implementation plan](docs/gesamtplan.md). These documents are written in German.

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
node scripts/fast-model-ui-check.mjs
npm run test:workflow
node scripts/google-calendar-ui-check.mjs
node scripts/google-calendar-setup-ui-check.mjs
npm run test:ipc
npm run test:storage-ui
npm run test:memory-storage-ui
npm run test:memory-ui
npm run test:computer-images
npm run test:computer-preview
npm run test:computer-model-ui
npm run test:input-guard
npm run test:desktop-control
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
