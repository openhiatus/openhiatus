# Screen help

Keep a program on the primary display in front, press F8 and ask where to find a visible control. The conversation model receives a screen observation and can request an original-resolution crop, then shows a thick circle and an arrow pointing at its edge. The model chooses red, black or white based on the observed background. The app enforces that palette and draws a 7-DIP colored stroke with a 12-DIP contrasting halo. A short spoken answer explains the next step. Voice submission and transcript review retain their existing behavior. The model needs image input support.

The separate transparent hint window has no app preload, Node access or input handlers. It is non-focusable and passes mouse input to the program underneath. The assistant does not click, type, open files or run commands through the help tool. An explicitly requested executing task still uses the normal work path. No image is inserted into the conversation view; the existing diagnostic computer preview remains a separate feature.

## IT supporter role

Enable **Einstellungen → Bedienung → IT-Supporter** to make helping the user operate their PC the primary interaction role. This is a persistent mode, not a keyword classifier or a special rule for one sentence. The model uses the whole request and context to decide how to guide the user. Indirect requests to find something or get unstuck should lead to the next visible step; a bare filename or path is not enough when the user needs to know where to click. Explicitly requested execution can still be delegated to a worker.

The navigation calls the conversation **Protokoll**. Its entries remain readable for later analysis, while ordinary text composition is hidden and voice plus desktop marks provide help. A recognized speech transcript can still be reviewed and submitted if transcript review is enabled. Keyboard submission cannot send an unrelated hidden draft. Switching back restores the normal composer and its retained draft. Mode selection survives restart and leaves voice settings, personality and identity documents intact.

The selected role is captured with the dialog context. A mode change refreshes the next thread; an active response retains its captured instructions. The dialog-only role is not injected into explicitly executing workers. Existing profiles default to normal conversation until this option is selected.

## Editable skill

The shipped source is [resources/bildschirmhilfe/SKILL.md](../resources/bildschirmhilfe/SKILL.md). At startup it seeds `%APPDATA%\openhiatus\pi\skills\bildschirmhilfe\SKILL.md` if missing. The exact known unedited 0.0.16 factory text can also be upgraded, keeping `SKILL.factory-0.0.16.md` as a backup. Any user edits, other content and symbolic links are preserved. `screen_help` with `action: "observe"` reads that file together with a fresh image; the routing prompt only points to the tool. The skill contains the workflow and communication rules, while the host enforces the available operations and validates geometry. The optional IT supporter role is selected by the host and applies to the whole dialog, including requests before a skill has been loaded.

The dialog-only `screen_help` tool supports:

- `observe`: fresh primary-display capture, initially at 1:2; optional `resolution: "original"` requests full resolution.
- `inspect`: original-resolution crop from the same frame, up to the existing detail pixel limit. Local view coordinates and exact frame/view IDs are required.
- `mark`: the observed target rectangle, required `color` (`red`, `black` or `white`) and optional short label. Local pixels map through the crop origin and actual capture dimensions to display-local DIP; the monitor's desktop origin positions the overlay.
- `clear`: remove the hint and retained observation.

No general desktop action is exposed by this tool. A worker controlling the desktop blocks help operations; starting a desktop operation clears hints. The help images use the existing two-request image-retention policy, including replacement views of the same capture. Original images can remain in the local provider session log, as with other computer observations.

## Freshness and lifecycle

Before showing a marker, a second local capture checks display geometry and target pixels without another model request. An observation expires after 60 seconds. A hidden Windows observer tracks only foreground-window identity/geometry and an input revision; it never exports key values, typed text or window titles. Keyboard presses, mouse-button presses and wheel input invalidate the observation and marker. Mouse movement alone does not erase the hint. The hooks always pass input through.

Hints expire after 30 seconds and are cleared by new conversation work, a new recording, display changes, Stop and shutdown. Hint and activity overlays are hidden before help captures. A late asynchronous load or stopped tool call cannot restore an invalidated hint. Automatic in-program changes after a marker appears are not continuously tracked; request fresh help when the application changes its layout by itself. This first implementation supports the primary display only.

The input observer starts lazily for help and exits after 65 seconds without a help operation. A later help request can start it again. Unexpected observer exit clears stale state; subsequent requests can reconnect instead of requiring an app restart.

## Validation

Unit tests cover inspected-coordinate mapping, multiple scale factors, exact view identities, changed or expired targets, desktop ownership, Stop races, delayed overlay loads, editable skill installation and two-request image expiry. `node scripts/screen-help-ui-check.mjs` exercises the actual app and local model protocol with an isolated synthetic editor. It verifies real screen capture, circle/arrow placement, retained foreground focus, a guarded native user click through the overlay, input invalidation and absence of background work or chat images. The test activates only its own fixture and exports only its verified synthetic region. It does not establish recognition quality with a cloud model or live speech-service quality.

Electron's [screen capture API](https://www.electronjs.org/docs/latest/api/desktop-capturer) provides images. The hint uses [BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window) focus and mouse pass-through controls.
