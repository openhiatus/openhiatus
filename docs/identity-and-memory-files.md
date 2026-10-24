# Identity and memory files

The shared editor is **Gedächtnis → Agent & Nutzer** (Memory → Agent & user). Settings → Personality is a shortcut to this editor. The files are local to the current app profile, under `%APPDATA%\openhiatus\Gedächtnis`.

| File | Purpose |
| --- | --- |
| `SOUL.md` | Personality, values, communication style, tone and personal boundaries. |
| `IDENTITY.md` | Assistant name, role, presence and emoji. |
| `USER.md` | User information, preferences, communication needs and personal context. |
| `MEMORY.md` | Important facts, decisions and insights that should last. |

Conversation and working models receive the same current files. These instructions do not grant additional tools or permissions or override the app's Stop, truthfulness and output rules. USER.md and MEMORY.md supply context. Their contents go to the selected model providers when needed for conversation or work, like the existing memory context.

## Editing and synchronization

Edit a file in the UI and save, or edit the corresponding UTF-8 file in a text editor. Files are loaded at startup, when opening or refreshing Memory, and before a new conversation request. **Dateien neu einlesen** reloads them without a model call. Running and queued tasks keep their captured instructions; later tasks use the updated context.

Each file supports 8,000 characters. Invalid UTF-8, oversized files and non-regular files produce a visible warning and remain untouched. Unsaved UI drafts survive navigation. An external change creates a version and prevents an older draft from overwriting it. The app also checks for concurrent changes before writing Markdown. If a Markdown export cannot complete, the saved version remains available and synchronization can retry without importing the old export over it.

The name displayed by the app is read from the `Name:` field in IDENTITY.md. Keep this field when changing the name; an empty field uses “Assistent”. For example:

```markdown
# IDENTITY.md

- **Name:** Juno
- **Rolle:** Persönlicher Assistent
- **Ausstrahlung:** Ruhig und aufmerksam
- **Emoji:** 🌙
```

Editing USER.md is the place to provide user information. New profiles start with empty fields, rather than invented personal facts.

## Style templates

**Stilvorlagen verwalten** retains the four built-in styles and up to twelve custom templates. Managing this library does not change the active files. **Ausgewählte Vorlage in SOUL.md übernehmen** copies the selected style into an unsaved SOUL.md draft. Review the draft and save to apply it. Existing unsaved SOUL drafts must be saved or discarded first.

## Existing profiles and history

Migration uses the previously saved name and selected style, preserves the existing long-term core as MEMORY.md and retains its versions and approvals. The older identity document remains separately available through **Frühere Hintergrundnotiz anzeigen**. Its later edits do not change the four active files. Existing custom templates remain in the library.

The versioned ledger, sources and approvals remain in `memory.json`; editable Markdown files are synchronized with it. The ledger uses format version 2 once the four files are initialized. Earlier app versions cannot read that format; use the pre-upgrade profile backup when reverting to an earlier app.

Agent-proposed changes to the long-term core still require approval of the exact proposed version. Identity changes are user edits; agents are instructed to use the editor and the existing approval path rather than rewriting identity files with general file tools. openHiatus continues to run with the Windows user's permissions.

## Validation

`tests/identity-documents.test.ts` checks migration, real files, historical versions, external edits, stale drafts, pending export repair, invalid UTF-8 and redaction. Worker tests verify the acknowledged instruction cache. Task tests verify that the four files are captured together and replace the old profile without duplicate prompt text.

`node scripts/identity-files-ui-check.mjs` exercises the real Electron editor, template application, navigation, external changes, the conversation name, actual local dialog/worker requests and restart. `scripts/assistant-profile-ui-check.mjs` remains a compatibility entry point for this unified workflow. The Windows package check runs it against the shipped executable. Model responses are synthetic; this establishes wiring and persistence rather than measuring personality quality.
