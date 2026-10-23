# Computer-use image budget

The experimental computer-context budget independently controls detail resolution, image lifetime, and the rolling UI working history. The working model can use these without a separate computer model. The next comparison uses Sol only; the proposed Sol/Luna microtask orchestration is deferred in [issue #10](https://github.com/openhiatus/openhiatus/issues/10).

## Settings and defaults

| Preference | Values | Existing-profile default | Next comparison |
| --- | --- | --- | --- |
| `computerOverviewScaleDivisor` | UI: 1, 4, 8, 16, 32 | 1 | 16 |
| `computerDetailScaleDivisor` | 1, 2, 4 | 1 | 2 |
| `computerImageRetentionCalls` | Integers 0–10; 0 means unlimited | 0 | 2 |
| `computerWorkingMemoryCalls` | 0, 10, 15; 0 keeps existing UI history | 0 | 15 |
| `computerDelegationEnabled` | Boolean | false | false |

Controls are under **Einstellungen → Bedienung**. Settings are captured when a background task is accepted. Changing them later does not alter a queued or running task. Missing fields in older saved tasks resolve to their compatible defaults.

These settings are experimental, not a proven faster default. They do not change the working model, provider, reasoning level, or service tier. Preparing a comparison does not start a model or desktop session.

## Detail resolution and coordinates

Automatic detail selection still operates on the native image. Only the selected crop's delivered resolution changes. With a divisor of 2, a 432 × 324 source region becomes a 216 × 162 image. Each axis is rounded independently and remains at least one pixel. The physical source rectangle remains unchanged.

The view contract carries the physical source rectangle and actual delivered dimensions. Points, drags, and requested subregions are mapped using those dimensions rather than a guessed factor or Windows display scaling. The preview displays the same encoded images that the model receives and identifies scaled details.

`inspect` explicitly returns a crop at original resolution from the current capture. A screenshot with `resolution: "original"` returns a fresh full-display image at original resolution. Neither request changes the configured resolution of later automatic details. Existing age, ownership, pixel-area, focus, and stop checks remain active.

Halving both dimensions removes approximately 75% of the crop's pixels. This is not a promise of 75% fewer image tokens or lower total task cost. Small text can become unreadable, and the need for original images can offset savings. [OpenAI image preprocessing](https://developers.openai.com/api/docs/guides/images-vision)

## A bounded visual history

With a retention of 2, a captured computer frame may be included in two consecutive model requests, beginning with its first inclusion. Independently, at most two distinct captured frames may be present, even when one model turn requests several captures. The same rule applies to other nonzero settings: at most N frames, each for at most N model requests. Older frames are omitted before the provider request.

An overview and its detail crop belong to one frame; the setting does not count them as two captures. Only the latest returned view set of a frame is retained. Asking for another crop with `inspect` replaces the earlier views and does not restart that frame's retention period. A fresh capture starts a new period. The request clock measures model requests, not mouse clicks, elapsed time, or preview updates.

The host enforces the boundary; it does not depend on the model obeying a request to forget. Tool calls and their results remain paired. Expired computer image payloads and their obsolete image metadata are replaced with a short marker. Error reports and other useful result text remain. User attachments and images returned by unrelated tools are outside this policy.

The working model receives the exact limits at startup. It can supply an optional `stateNote` with an existing `computer` call when new task-relevant facts need to survive image expiration. Runtime validation limits the note to 240 characters and three lines. Native input never receives this field.

With a nonzero computer-context budget, the host retains only the latest note in the outgoing model context and strips historical note fields from earlier computer-call arguments. The note remains explicitly unverified data, not an instruction or proof of success. A compact note belongs to the same task and is carried across a resume; the original local transcript still retains the full audit trail.

The policy asks for essential exact values, completed work, or unresolved points only when needed. It does not request image descriptions after every action or additional documents solely as a memory aid. The host does not launch an additional summarization model or require a separate summary request.

The original local session log is preserved for auditing. Expiration affects what is sent to the model; it is not deletion of files or a promise that the provider erases previously received content. Resuming a session must not give old images a fresh retention period.

## Rolling UI working memory

Image expiration and working history use separate limits. A working-history window of 15 retains computer tool calls and their completed results for the last 15 model requests, alongside the latest short working note. Older computer call/result pairs are removed together from the outgoing context. Mixed tool turns retain their unrelated tool calls and data. The user request, user attachments, file/service outputs, and original local logs are preserved.

The initial policy explains this limit and asks the model to replace the note with a complete short snapshot of essential facts, progress, and unresolved points, rather than append a sequence of image comments. The host indicates when refresh is due after 15 requests. The model supplies the replacement in its next existing computer call; there is no separate summarization request. If refresh is missed, the old note is explicitly unverified and stale; the history cutoff still applies.

Both 10 and 15 are available for experiments. Zero disables working-history removal. Missing legacy values resolve to zero. A resumed clock must not make old computer history newly eligible. Local logs remain complete so removed context can still be audited independently.

## Cache tradeoff and comparison

Removing an old image changes the prompt prefix and can reduce cache reuse. A smaller context can still reduce work when earlier prefixes are not reused. Compare recorded uncached input, cache reads, request time, total task time, and successful completion rather than extrapolating from PNG bytes. [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching#preserve-conversation-history)

Keep the settings independently adjustable. Compare detail scaling, visual-history expiration, and working-history removal separately when attributing their effects. Original inputs, final acceptance criteria, working model, and display conditions should remain comparable; personal benchmark archives and profiles remain outside the repository.

Compare model usage and elapsed time per computer call as well as for the entire task. Different runs can choose different numbers of UI operations. The cost target for the benchmark is well below USD 5 using a consistent API-equivalent rate card; this is a measurement target, not a demonstrated result or a claim about ChatGPT billing. The two-frame policy alone has no established cost reduction.

## Automated validation

Source validation on 23 October 2026 passed architecture checks, TypeScript, all 674 tests, and the production build. Synthetic Electron checks cover actual resized PNG dimensions, rounded coordinates, original-resolution fallback, the displayed preview, and independent settings without a computer-model delegation.

The real Pi runtime with a local synthetic Responses stream verifies the two-frame/two-request limit, latest-view replacement, native input without note metadata, and preservation of file images and original logs. A longer loop verifies that computer pairs older than 15 request sightings disappear together, note refresh is signaled and replaces the current snapshot, and settings remain frozen across a run. Compaction and resume preserve a singleton note, unrelated user/file data, and correct ages. Failure and stop handling launch no extra summary requests. Compaction projection preserves literal wrapper-like text in user content and supplemental instructions.

These checks make no external model requests or native desktop inputs. A real-task comparison of completion, readability, cache reuse, cost, and elapsed time remains pending.
