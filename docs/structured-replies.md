# Structured spoken and written replies

The dialogue and working model receive the same [reply instructions](../src/main/reply-instructions.ts). A final content-bearing answer contains one `openhiatus-reply` fenced JSON block with exactly two string fields:

```json
{
  "spoken": "The direct answer, with important limitations, in a few natural sentences.",
  "text": "The complete written answer. Markdown, links, tables and code are allowed here."
}
```

The model writes both fields in the same request. `spoken` must stand on its own, identify the subject and include important uncertainty or partial completion. A pointer to the conversation may follow the result when details are extensive; it cannot replace the result. Simple answers can use the same content in both fields.

The prompt asks for **at most 450 characters including spaces** in `spoken`. Runtime accepts **up to 500 spoken characters unchanged** after Markdown cleanup. Oversized speech is shortened at complete sentence or word boundaries without failing the task or discarding the full written answer. This is a technical safety net; the model-authored speech is the primary answer, not an extract from `text`. The final speech cue remains at most 500 UTF-16 code units; Unicode characters are not split.

Only `text` appears as the final conversation message and task result. The dedicated speech field is sent to the existing speech queue with its task attribution. No separate summary model call, new credential, service or asynchronous speech-generation step is added. A failed task keeps an explicit failure statement and the reported reason rather than speaking a contradictory success claim.

An already acknowledged task can still end with an empty final dialogue response. Archive-read blocks keep their existing protocol. Working agents can append memory proposals as separate final blocks after the reply envelope; these still require explicit approval. Dialogue agents route memory changes through a working task. Examples quoted inside the written field are data.

The [parser](../src/shared/assistant-reply.ts) accepts a complete reserved fence or a bare object with the two reserved fields. Ordinary legacy text and unrelated JSON remain supported. Invalid speech metadata does not discard a readable written answer. Completely unreadable envelopes remain visible for inspection and produce a short format notice instead of reading raw JSON aloud. Parsing is bounded to 128 KiB UTF-8; it never executes content or starts recovery model requests.

The [speech safety net](../src/shared/spoken-reply.ts) also handles legacy plain-text replies. It can retain complete opening sentences and important qualifications but does not claim to infer a semantic summary of arbitrary older text. The current structured prompt removes that dependency for compliant model responses.

## Validation

On 23 October 2026, architecture checks, TypeScript, all 716 tests and the production build passed. Tests cover the 451–500-character margin, nonfatal shortening above 500, ordinary and malformed JSON, separate memory proposals, quoted proposal examples, complete written replies, failure status, and secret redaction after decoding escaped JSON fields.

The Windows 0.1.7 package passed the real Pi/local-server dialogue and worker workflow, history/context across restart, and pinned audio-device checks. Its dialogue test deliberately puts the useful summary in `spoken` while starting the long written answer with different content, verifies the exact speech cue, and observes only the three planned model requests. These checks use fresh profiles and local synthetic responses, without cloud-model or speech-service calls.

The current alpha is numbered **0.0.7**. This renumbers the same implementation; the earlier 0.1.7 references above identify the original validation run. The renumbered Windows package also passed the package checks; application logic and dependency versions are unchanged.
