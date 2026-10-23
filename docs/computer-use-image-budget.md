# Computer-use image budget

The experimental image budget has two independent settings: detail resolution and the number of model requests that retain a computer image. The working model can use both without a separate computer model. The next comparison uses Sol only; the proposed Sol/Luna microtask orchestration is deferred in [issue #10](https://github.com/openhiatus/openhiatus/issues/10).

## Settings and defaults

| Preference | Values | Existing-profile default | Next comparison |
| --- | --- | --- | --- |
| `computerOverviewScaleDivisor` | UI: 1, 4, 8, 16, 32 | 1 | 16 |
| `computerDetailScaleDivisor` | 1, 2, 4 | 1 | 2 |
| `computerImageRetentionCalls` | Integers 0–10; 0 means unlimited | 0 | 3 |
| `computerDelegationEnabled` | Boolean | false | false |

Controls are under **Einstellungen → Bedienung**. Settings are captured when a background task is accepted. Changing them later does not alter a queued or running task. Missing fields in older saved tasks resolve to their compatible defaults.

These settings are experimental, not a proven faster default. They do not change the working model, provider, reasoning level, or service tier. Preparing a comparison does not start a model or desktop session.

## Detail resolution and coordinates

Automatic detail selection still operates on the native image. Only the selected crop's delivered resolution changes. With a divisor of 2, a 432 × 324 source region becomes a 216 × 162 image. Each axis is rounded independently and remains at least one pixel. The physical source rectangle remains unchanged.

The view contract carries the physical source rectangle and actual delivered dimensions. Points, drags, and requested subregions are mapped using those dimensions rather than a guessed factor or Windows display scaling. The preview displays the same encoded images that the model receives and identifies scaled details.

`inspect` explicitly returns a crop at original resolution from the current capture. A screenshot with `resolution: "original"` returns a fresh full-display image at original resolution. Neither request changes the configured resolution of later automatic details. Existing age, ownership, pixel-area, focus, and stop checks remain active.

Halving both dimensions removes approximately 75% of the crop's pixels. This is not a promise of 75% fewer image tokens or lower total task cost. Small text can become unreadable, and the need for original images can offset savings. [OpenAI image preprocessing](https://developers.openai.com/api/docs/guides/images-vision)

## A bounded visual history

With a retention of 3, a captured computer frame may be included in three consecutive model requests, beginning with its first inclusion. Its images are omitted from subsequent model contexts. Asking for another crop with `inspect` does not restart the same frame's retention period. A fresh capture starts a new period. This measures model requests, not mouse clicks, elapsed time, or preview updates.

The host enforces the boundary; it does not depend on the model obeying a request to forget. Tool calls and their results remain paired. Expired computer image payloads and their obsolete image metadata are replaced with a short marker. Error reports and other useful result text remain. User attachments and images returned by unrelated tools are outside this policy.

The working model receives an initial explanation of the policy and is told to record only important exact values, completed work, and unresolved points in concise text during its existing turns. The host does not launch an additional summarization model or require a separate summary request. Such notes are observations, not independent proof that the task succeeded.

The original local session log is preserved for auditing. Expiration affects what is sent to the model; it is not deletion of files or a promise that the provider erases previously received content. Resuming a session must not give old images a fresh retention period.

## Cache tradeoff and comparison

Removing an old image changes the prompt prefix and can reduce cache reuse. A smaller context can still reduce work when earlier prefixes are not reused. Compare recorded uncached input, cache reads, request time, total task time, and successful completion rather than extrapolating from PNG bytes. [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching#preserve-conversation-history)

Keep the two settings independently adjustable. Compare detail scaling and visual-history expiration separately when attributing their effects. Original inputs, final acceptance criteria, working model, and display conditions should remain comparable; personal benchmark archives and profiles remain outside the repository.

## Automated validation

Source validation on 23 October 2026 passed architecture checks, TypeScript, all 653 tests, and the production build. Synthetic Electron checks cover actual resized PNG dimensions, rounded coordinates, original-resolution fallback, the displayed preview, and independent settings without a computer-model delegation.

The real Pi runtime with a local synthetic Responses stream verifies image expiration on the wire after three requests, preservation of file images and original logs, frame age across `inspect` and restart, and failure/stop handling without extra summary requests. Compaction projection preserves literal wrapper-like text in user content and supplemental instructions.

These checks make no external model requests or native desktop inputs. A real-task comparison of completion, readability, cache reuse, cost, and elapsed time remains pending.
