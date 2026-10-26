# Using openHiatus

[Back to the project](../README.md) · [Development](development.md)

This guide covers setup, everyday controls and the optional experiments in the current Windows alpha. For a quick introduction and the first commands to run, start with the [README](../README.md#getting-started).

- [Install and update](#install-on-windows)
- [First-time setup](#first-time-setup): language, accounts, models and voice
- [Assistant name and personality](#assistant-name-and-personality)
- [Work history](#work-history)
- [Window layout and background activity](#window-layout-and-background-activity)
- [Start with Windows](#start-with-windows)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Screen help](#screen-help-without-switching-programs)
- [Google Calendar](#google-calendar)
- [Experimental desktop views](#experimental-desktop-views-source-builds) and [separate computer model](#experimental-separate-computer-model)
- [Privacy and safety](#privacy-and-safety) · [Known limitations](#known-limitations)

## Install on Windows

Use `openHiatus-Setup-<version>-x64.exe` on Windows 10 (2004 or newer) or Windows 11, x64. Open Setup, optionally select a Desktop icon, and click **Installieren** (Install). It installs for your Windows account without administrator rights and adds openHiatus to the Start menu. Node.js, Git and separate agent runtimes are not required to use the installed app.

The app stays in `%LOCALAPPDATA%\Programs\openHiatus`. To update, close openHiatus and open the newer Setup file. Settings, credentials, memory and the Windows autostart choice are preserved. Remove the app through Windows **Installed apps**; your profile in `%APPDATA%\openhiatus` stays available. Setup never enables autostart automatically.

These alpha builds are unsigned, so Windows may show a SmartScreen warning. See the [Windows installation guide](windows-installation.md) for installation, updates, removal and building Setup.

## First-time setup

### Language

The app and Windows Setup support English, Spanish, French, German, Simplified Chinese, Japanese and Brazilian Portuguese. Open **Language · 语言** directly above **Workspace folder** in the left sidebar to switch immediately, including before acknowledging the access notice. Its A/文 symbol remains visible when the sidebar is collapsed. Every language appears in its own script with a flag symbol; the menu supports keyboard navigation. The choice is saved; the current view, running tasks and unsaved drafts are preserved. Setup's language seeds a new profile; existing profiles keep their choice (German for older profiles). Without Setup, a new normal profile follows the Windows locale, with English as fallback. Messages, files, model replies and editable agent instructions retain their original content. The interface language does not select the assistant's reply language or speech voice. See [localization](localization.md).

### Guided setup

New profiles open a guided setup with five steps. Each step explains what to do; Back and Next stay visible in small windows. Select any step in the overview to jump directly to it.

1. **Welcome:** Choose a language, read the access notice and explicitly acknowledge it. Stop and Esc remain accessible throughout setup.
2. **You and your agent (optional):** Choose an agent name, how the agent addresses you, its role, relevant personal context and response preferences. Leave fields unchanged or choose **Skip** to continue without saving this draft. Moving to another step or choosing **Continue later** saves edits in the existing `IDENTITY.md`, `USER.md` and `SOUL.md` files; other content is preserved. Edit these details later under **Memory → Agent & user**. They become model context in subsequent conversations, so only enter information you want to share with your model provider.
3. **Account:** Sign in with ChatGPT or open the alternative-provider section for an API account or local server. The conversation model selector is directly visible here and in the final step. It lists models from connected accounts. Separate role settings remain under **Settings → Models & access**.
4. **Voice (optional):** Continue with text, or open microphone and voice setup. The local microphone test requires no cloud account. Choose Inworld or ElevenLabs and save your own provider key for speech recognition and spoken replies. Voice customization is optional: leave the Voice ID empty for the built-in default, or enter an ID from your provider under **Customize voice (optional)**. Choose devices and test the output if desired.
5. **First reply:** Explicitly request a short greeting. This uses the selected conversation model and its normal provider quota, with no tools, files, screenshots, identity details or conversation history. Finishing requires a nonempty successful reply from the current model; changing models clears the result. Errors, Stop and a 30-second timeout allow retry. This checks text connectivity, not desktop tools or voice recognition. The agent name and response preferences apply from the first regular conversation.

**Continue later** saves the current step. **Continue setup** resumes it, including after restart. Already configured profiles keep their normal entry point; **Settings → Set up step by step** always reopens the guide at Welcome, with saved values retained and direct navigation to every step. Incomplete older setup progress offers the new optional identity step; completed profiles are not forced through setup again. Merely opening or navigating the guide does not sign in, contact a model, start recording or activate desktop control.

### Models and Fast

GPT-6.1 Terra (`gpt-6.1-terra`) is included in the default OpenAI API catalog. With a ChatGPT connection, refresh the model list; Terra appears when your account makes it available. A custom API model list stays unchanged: add `gpt-6.1-terra` there if needed. It can be selected for conversation, work, memory and the separate computer role, with Fast and the existing `medium` thinking default. Its supported thinking requests are off, low, medium, high, xhigh and max; minimal is raised to low. Model capabilities follow the [official OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-6.1-terra).

Eligible ChatGPT and OpenAI models appear as adjacent choices such as **gpt-6.1-sol** and **gpt-6.1-sol (fast)**. Each role saves its own choice. The Fast variant requests faster processing with the same underlying model; a choice without `(fast)` sends no explicit Fast request. The provider determines the actual processing tier, which can differ from the request. API Fast requests may cost more. The conversation view shows both the selected conversation and work model, including `(fast)`. Existing model selections remain unchanged. The experimental separate computer model retains its own Fast switch under **Bedienung**.

### Thinking levels

Each model role has its own **Thinking level** selector, with **medium** selected by default. Choose `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max` next to Work, Conversation, and Memory under **Settings → Models & access**. The separate computer model has the same selector next to its model settings under **Behavior**. Higher levels may increase response time and cost. Pi adapts the request to the selected model: models without reasoning use `off`, while a model that requires reasoning may raise an `off` request to its minimum. Thinking and Fast are independent. Accepted tasks retain their captured settings; new conversation turns and reports use the current selection. Memory reports now explicitly request medium unless changed. See [thinking levels](thinking-levels.md) for scope and verification.

### Voice

Speech devices and credentials remain available under **Einstellungen → Sprache & Geräte** (Settings → Speech & devices) after setup. Text input works without a speech service.

The speech provider applies to both recognition and output. Each provider keeps its own encrypted key and voice preference; switching providers or removing one key preserves the other. Existing profiles continue using Inworld and their previous voice. Empty voice fields select Dennis for Inworld or Eldrin for ElevenLabs; **Use default voice** clears a custom choice. IDs are text, not necessarily numbers. Saving an ElevenLabs key or opening setup sends no speech request. A successful output test confirms TTS; recognition alone does not mark the output as tested. See [speech providers](speech-providers.md) for protocols and test coverage.

Model and speech providers are used with your own accounts. Their availability, usage limits, and costs depend on the service you choose.

### Written and spoken replies

Spoken replies include the actual answer. The system prompt asks the model to return an `openhiatus-reply` block with two fields: `spoken`, a self-contained answer of at most 450 characters including important limitations, and `text`, the complete written reply. Both are produced in the same model request. The app accepts speech up to 500 characters unchanged and shortens longer speech without failing the task. Only the full written answer appears in the conversation. Older plain-text replies remain supported, and malformed output stays recoverable without reading raw protocol data aloud. See the [structured-reply contract](structured-replies.md).

## Assistant name and personality

Under **Gedächtnis → Agent & Nutzer** (Memory → Agent & user), edit four real Markdown files: **SOUL.md** for personality, values, style and boundaries; **IDENTITY.md** for the assistant's name, role, presence and emoji; **USER.md** for your information and preferences; and **MEMORY.md** for durable facts, decisions and insights. Settings → Personality links directly to this same editor. openHiatus remains the app name; the name in IDENTITY.md appears in the conversation.

The files live in `%APPDATA%\openhiatus\Gedächtnis` and can be edited in the UI or with a text editor. External changes are versioned when loaded; **Dateien neu einlesen** (Reload files) refreshes the editor. Saved changes apply before the next message. Already running or queued tasks retain their captured instructions. Stale UI drafts cannot overwrite a newer file version. Each file supports up to 8,000 characters. The app retains earlier versions and pending memory approvals.

The existing built-in and custom styles remain in **Stilvorlagen verwalten** (Manage style templates). Choose or edit a template and copy it into a SOUL.md draft, then review and save the file to apply it. The four files are the active model instructions; template library changes alone do not change the active style. Migration seeds SOUL.md from the previously selected style and IDENTITY.md from the saved name, preserves existing long-term facts and keeps the older background document and its history available separately.

The style applies to both spoken and written replies. Style strength remains model-dependent; automated checks establish prompt delivery, file synchronization and persistence rather than guaranteeing a particular tone. Reports, original sources and the existing explicit approval flow remain in Memory. See the [identity and memory file guide](identity-and-memory-files.md).

## Work history

Under **Aufgaben → Arbeitsverlauf** (Tasks → Work history), each newly accepted conversation request and direct-agent request has its own record. Delegated jobs link back to that request; the parent remains active while its subtasks run. Open, failed and interrupted records can be filtered together. **Hintergrundaufgaben** (Background tasks) retains the existing individual Stop and usage controls. The global Stop remains available in both views.

The record contains the request, timestamps, latest reported result and individual tool starts/outcomes. Supported tools also retain a bounded path, command, action name or task reference. Tool completion is separate from verification of the user's intended outcome. Raw tool outputs, typed text, file contents and screenshots are not copied into this journal. Existing background jobs are imported without inventing earlier actions. This first increment captures work; it does not yet replace memory retrieval, extract decisions automatically, merge separate requests by topic, or introduce a retention/deletion policy. The journal shares the existing bounded local state store and reports storage failures instead of silently deleting history.

## Window layout and background activity

The left navigation automatically collapses to icons below 960 pixels of content width and expands in wider windows. Use the button at its bottom-right edge to choose either layout manually; your choice survives restart. The small reset button or **Einstellungen → Bedienung → Linke Navigation → Automatisch** restores automatic behavior. The central symbol scales with the space available in the conversation view.

Enable **Arbeitsanzeige im Hintergrund** (Background activity indicator) under **Einstellungen → Bedienung** to see a round symbol with a short status at the top-right of the app's monitor. It stays visible throughout listening, transcription, thinking, work, speech synthesis, and playback while the main window is in the background. Transcript review keeps a ready indicator; idle hides it. The former rectangular transcript overlay is replaced by this same optional symbol. Full transcripts and replies stay in the main window.

Choose **Größe der Arbeitsanzeige** (Indicator size) in the same settings card, or drag the symbol's right-hand grip down to enlarge it and up to shrink it. The size is saved. The indicator stays out of keyboard focus, and desktop operations temporarily hide it before input and capture.

Background tasks show **Hintergrundarbeit · Arbeitsplatz frei** in the app: you can keep using your mouse and keyboard. When the agent actually acquires desktop control, a mandatory amber frame and a large **Agent steuert deinen PC** banner appear on every connected display. Your ordinary physical mouse and keyboard input is blocked while the agent owns the desktop, including pauses between model requests. The banner remains visible even when the optional background indicator is disabled. Screen help that only observes and marks a target leaves input available.

Press **Esc** to stop the agent and take over; the banner displays this shortcut throughout the takeover. **Ctrl+Alt+F12** also stops it. Registered **F8/F9** voice shortcuts remain available. Completion or Stop releases the input lock. A separate Windows helper releases it if the app exits or stops responding; the watchdog is about two seconds. Already admitted input may have taken effect. This prevents ordinary input conflicts on the current desktop; it is not a security boundary against other software injecting input and does not cover Windows secure desktops. See the [desktop-control contract](desktop-control.md).

## Start with Windows

In the Windows package, open **Einstellungen → Bedienung → Windows-Autostart** and enable **Mit Windows starten** (Start with Windows). It is off until you enable it. After signing into Windows, openHiatus starts minimized in the taskbar without taking focus. Click the taskbar icon or launch the app manually to open its existing window. Another automatic launch leaves it minimized.

The switch reads the actual Windows registration, including a disable action in Task Manager or Windows Settings. Enabling it explicitly reactivates the entry; merely opening the app does not rewrite it. Turning it off removes the app's login entry for the current Windows user. No administrator rights are required. The setting belongs to this computer and is not copied into agent preferences.

Setup updates use the same install folder and preserve this registration, including a disable action in Windows. When switching from a portable folder to the installed app, enable the option in the installed copy once to update its path. For portable use, keep the complete package in a stable folder, re-enable the option after moving it, and turn it off before deleting it. The uninstaller removes only an autostart entry pointing to its own copy. Source/development runs and launches with a separate `--data-dir` profile cannot change your normal Windows autostart. The minimized launch uses the fixed `--autostart` argument; debug and profile arguments are never registered.

## Keyboard shortcuts

Choose a specific microphone and speaker to keep using those devices. A disconnected choice remains selected and is marked as unavailable; reconnecting the device restores its use when it can be identified. If several identical devices cannot be distinguished, select the intended device again. Choose **Windows-Standardgerät** (Windows default device) only when you want to follow the current Windows selection.

| Key | Action |
| --- | --- |
| <kbd>F8</kbd> | Start or stop recording |
| <kbd>F9</kbd> | Send the transcript draft (when **Transkript prüfen** / Review transcript is on) |
| <kbd>Ctrl</kbd>+<kbd>Enter</kbd> | Send a message in the app window |
| <kbd>Esc</kbd> / <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>F12</kbd> | Stop the conversation and managed execution |

You can also stop individual tasks in the task view. If another program already uses a global hotkey, the app shows a notice, and the buttons in the window keep working.

During desktop takeover, use **Esc** from any program. Outside takeover, Esc works in the openHiatus window; **Ctrl+Alt+F12** is the global Stop shortcut.

## Experimental desktop views (source builds)

Under **Einstellungen → Bedienung → Bildschirmübersicht** (Settings → Controls → Screen overview), choose a true scaling factor of 1:4, 1:8, 1:16 or 1:32. The next desktop task receives a small overview and at most one detail crop. Automatic detail resolution is independently selectable as 1:1, 1:2 or 1:4. A local pixel comparison selects changed regions; the model can request an original-resolution crop with `inspect` or predict the next region with an action. The first observation has no change history and starts with the overview. If orientation is insufficient, the model can request `screenshot` with `resolution: "original"` for one fresh, unscaled full-display image. Subsequent ordinary observations resume the configured factors. No additional model is used for selection. The app detects the primary display's resolution automatically.

**Bildaufbewahrung** (Image retention) bounds both the lifetime and number of captured computer frames. With a value of 2, at most two captures are present and each is included in at most two model requests. New views of the same capture replace its earlier images without extending its lifetime. An optional working note supplied with an existing computer call is limited to 240 characters; only its latest version remains in the outgoing context. User attachments, unrelated tool images, and local audit logs are preserved. No additional summarization calls are made. Removing earlier images can reduce prompt-cache reuse, so reduced context alone does not establish a cost or speed improvement. See [the image-budget contract](computer-use-image-budget.md).

**Arbeitsgedächtnis** (Working memory) separately limits UI interaction history to 10 or 15 model requests. Older computer calls and their completed results are removed together, while the latest short working note remains. The host signals when that note should be replaced during an existing computer call. The user request, file/service data, and local logs are preserved. The compatible default keeps existing UI history; this experimental cutoff must be enabled deliberately.

**Full screen, original-resolution details, and unlimited image retention remain the compatible defaults.** In a [four-run LibreOffice comparison](computer-use-image-budget.md#manual-comparison-23-october-2026), the latest configuration reduced API-equivalent cost per computer call from about **USD 0.189 to USD 0.0144** (92.37%) while passing first-phase artifact acceptance. Its total task cost was USD 5.04; this is a single-task result using Standard API comparison prices, not a ChatGPT billing claim or a general guarantee. Smaller images can require more inspection steps. Only the primary display is supported. The [computer-use plan](computer-use-uebersicht-und-detail-plan.md) documents the contract and comparison criteria.

## Experimental separate computer model

Under **Einstellungen → Bedienung → Bildschirmübersicht**, optionally enable **Eigenes Computer-Modell verwenden** (Use a separate computer model), select a model such as `gpt-6-luna`, and enable **Fast** for its requests. The work model keeps planning and checking the task. It delegates bounded UI subtasks through `computer_task`; the computer model receives screenshots and performs several observed actions before returning a text report. The work model can explicitly request screenshots for its own verification. The mode is off by default and changes apply to newly admitted tasks.

The computer runtime has the desktop tool and a bounded result-reporting tool: no shell, file, skill, service or delegation tools. One host executor retains the existing frame, coordinate and Stop checks. Short observation handles reduce identifier copying; stale or misspelled handles are still rejected exactly. Subtasks are limited to 40 desktop calls and four minutes; reaching a limit returns control to the planner. Task details show usage and request timing by model, and distinguish requested Fast from the service tier actually returned by the provider. Fast currently requires an OpenAI Responses model. Availability and charges depend on your connection. End-to-end speed, cost and task accuracy need a fresh comparison; a cheaper model alone does not establish an improvement. See the [computer-model experiment](computer-use-computermodell.md).

## Screen help without switching programs

Keep your program in front and ask by voice using F8, for example: “Where is the bold button?” The conversation model can observe the primary display and show a thick circle with an arrow directly around the target. It selects **red, black or white** for contrast with the observed background; the app draws a 7-DIP stroke with a 12-DIP contrasting halo. The overlay does not take keyboard focus and lets your clicks pass through. You operate the program yourself; a help question does not need an executing background task. Existing voice submission/review settings still apply.

Enable **Einstellungen → Bedienung → IT-Supporter** (Settings → Controls → IT supporter) to make guidance the assistant's primary role throughout the interaction. It uses context and the user's goal rather than matching keywords: indirect requests, confusion, finding things and changing settings normally lead to explanation and visible next steps. Explicit requests to execute work remain available. In this mode, **Gespräch** becomes a read-only **Protokoll** (Log), voice and desktop hints carry the help, and the regular text composer is hidden. Transcript review remains available for recognized speech. Disabling the mode restores the normal conversation and any retained text draft. Existing profiles keep this optional mode off until selected; changing it applies to the next message and does not replace identity files or audio preferences.

The editable **bildschirmhilfe** skill is installed at `%APPDATA%\openhiatus\pi\skills\bildschirmhilfe\SKILL.md`. Its instructions are loaded with a help observation, rather than repeated in every system prompt. Existing edits survive app upgrades; the known unedited 0.0.16 factory instruction is updated with a backup. The read-only tool supports observation, original-resolution detail inspection, marking and clearing; it has no desktop input operations. Screen images go to your selected conversation model and are omitted after two model requests. They are not added to the chat view.

A local comparison checks the target before drawing. Keyboard input, mouse clicks or scrolling, foreground-window/geometry changes and Stop invalidate the marker; it also expires after 30 seconds. Automatic changes within a program after the marker appears are not continuously verified. Recognition accuracy depends on the selected image-capable model. See the [screen-help guide](screen-help.md).

## Google Calendar

Under **Dienste → Google Kalender** (Services → Google Calendar), follow the setup guide to register a Google OAuth **Desktop app**, save its client ID and optional client secret, and sign in through your normal browser. Enable the Google Calendar API in that Cloud project first. You can then choose a calendar, preview the next seven days, and ask openHiatus to read, create or change events in conversation. Your chosen calendar and connection survive restart; tokens are kept in the local encrypted credential store.

This first version creates and changes personal single events without attendees. It reads recurring instances and supports timed and all-day events. Invitations, attendee management, deletion and series-wide changes remain outside the exposed tools. Read-only calendars stay read-only. Updates require the version previously read, and uncertain write outcomes are reported for inspection rather than silently retried. Your Google account is connected only after you supply a Desktop client and approve Google's consent screen. See the [Google Calendar setup guide](google-calendar.md).

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
