export interface AssistantReply {
  text: string;
  spoken?: string;
  structured: boolean;
  invalid?: boolean;
  /** No readable conversation text was recovered; never speak the raw envelope. */
  unreadable?: boolean;
}

const MAX_ENVELOPE_BYTES = 128 * 1024;
const owns = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

/** Separate model-authored speech from the transcript without executing any data. */
export function parseAssistantReply(raw: string): AssistantReply {
  const original = raw.trim();
  const fenced = /^```openhiatus-reply(?:\s|$)/.test(original);
  const bare = original.startsWith('{');
  if (!fenced && !bare) return { text: original, structured: false };

  const legacy = (): AssistantReply => ({ text: original, structured: false });
  const unreadable = (): AssistantReply => ({ text: original, structured: true, invalid: true, unreadable: true });
  // Malformed bare JSON is a protocol error only when both reserved field names
  // occur. A normal configuration containing a "spoken" option remains data.
  const hintedEnvelope = fenced || /"spoken"\s*:/.test(original) && /"text"\s*:/.test(original);
  const unparsed = (): AssistantReply => hintedEnvelope ? unreadable() : legacy();
  // Bound both scanning/allocation and UTF-8 JSON parsing. A valid UTF-16 string
  // cannot encode to fewer UTF-8 bytes than its number of code units.
  if (original.length > MAX_ENVELOPE_BYTES) return unparsed();
  const match = fenced ? /^```openhiatus-reply[ \t]*\r?\n([\s\S]*)\r?\n```$/.exec(original) : undefined;
  if (fenced && !match) return unreadable();
  const encoded = match?.[1] ?? original;
  if (new TextEncoder().encode(encoded).byteLength > MAX_ENVELOPE_BYTES) return unparsed();

  let value: unknown;
  try { value = JSON.parse(encoded); } catch { return unparsed(); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return unreadable();
  const reply = value as Record<string, unknown>;
  // Inspect parsed own keys, so nested fields and escaped JSON key names do not
  // confuse ordinary document data with a top-level reply envelope.
  if (!fenced && (!owns(reply, 'spoken') || !owns(reply, 'text'))) return legacy();
  if (!owns(reply, 'text') || typeof reply.text !== 'string') return unreadable();

  const text = reply.text.trim();
  const keys = Object.keys(reply);
  if (keys.length !== 2 || !owns(reply, 'spoken') || typeof reply.spoken !== 'string'
    || (text.length > 0 && !reply.spoken.trim())) {
    return { text, structured: true, invalid: true };
  }
  // Keep a useful answer if the model populated speech but omitted its copy in
  // the transcript; an acknowledged empty/empty reply still stays silent.
  if (!text && reply.spoken.trim()) return { text: reply.spoken.trim(), spoken: reply.spoken.trim(), structured: true, invalid: true };
  return { text, spoken: reply.spoken.trim(), structured: true };
}
