import { computerImageRetentionCalls } from '../shared/computer-task-settings';
import { isWireRecord } from './agent-wire';

export const EXPIRED_COMPUTER_IMAGE = '[Computer image expired. Request a fresh screenshot if the current UI is needed.]';
interface HistoryState { version: 1; requestCount: number; visible: { callId: string; firstRequest: number }[]; }
const computerImage = (message: unknown): message is Record<string, unknown> & { toolCallId: string; content: unknown[] } =>
  isWireRecord(message) && message.role === 'toolResult' && message.toolName === 'computer' && typeof message.toolCallId === 'string'
  && Array.isArray(message.content) && message.content.some(block => isWireRecord(block) && block.type === 'image');
function observationId(message: { toolCallId: string; content: unknown[] }): string {
  for (const block of message.content) if (isWireRecord(block) && block.type === 'text' && typeof block.text === 'string') {
    const match = /^OPENHIATUS_COMPUTER_METADATA_V[12] (\{[^]*\})/.exec(block.text);
    if (!match) continue;
    try {
      const metadata: unknown = JSON.parse(match[1]);
      if (isWireRecord(metadata) && typeof metadata.frameId === 'string' && metadata.frameId.length > 0 && metadata.frameId.length <= 100) return `frame:${metadata.frameId}`;
    } catch { /* Unknown legacy metadata remains scoped conservatively to its tool call. */ }
  }
  return `call:${message.toolCallId}`;
}
const geometry = (text: string): boolean => /^OPENHIATUS_COMPUTER_(?:METADATA_V[12]|DIAGNOSTICS_V1)\s/.test(text)
  || /^(?:overview|detail) viewId=[^\r\n]+; image \d+ x \d+; local origin \(0,0\)\.$/.test(text);
export function computerImageHistoryInstructions(calls: number): string {
  return calls ? `Computer images remain visible for at most ${calls} consecutive model requests, including this request when first seen. Expired images and their old image metadata are replaced by a short marker; ordinary text remains. When useful, briefly retain exact task-relevant values, completed steps and unresolved points in your existing response before those images expire. Do not transcribe the whole screen or add separate summary requests. Your note records observations and uncertainty, not proof of task success. Request a fresh screenshot for current UI state.` : '';
}

/** Request-clock projection only. It never changes the canonical message objects or image files. */
export class ComputerImageHistory {
  readonly retentionCalls: number;
  private requestCount = 0;
  private readonly seen = new Set<string>();
  private readonly visible = new Map<string, number>();
  constructor(calls: number, restored?: unknown, previousMessages: readonly unknown[] = []) {
    this.retentionCalls = computerImageRetentionCalls(calls);
    if (isWireRecord(restored) && restored.version === 1 && Number.isSafeInteger(restored.requestCount) && (restored.requestCount as number) >= 0
      && Array.isArray(restored.visible) && restored.visible.length <= 4096 && restored.visible.every(row => isWireRecord(row)
        && typeof row.callId === 'string' && row.callId.length <= 512 && Number.isSafeInteger(row.firstRequest)
        && (row.firstRequest as number) >= 1 && (row.firstRequest as number) <= (restored.requestCount as number))) {
      this.requestCount = restored.requestCount as number;
      for (const row of restored.visible as HistoryState['visible']) { this.visible.set(row.callId, row.firstRequest); this.seen.add(row.callId); }
    }
    // A missing legacy/corrupt clock must not rejuvenate recovered screenshots.
    for (const message of previousMessages) if (computerImage(message)) this.seen.add(observationId(message));
  }
  nextRequest<Message>(messages: readonly Message[]): Message[] {
    if (!this.retentionCalls) return messages as Message[];
    if (!Number.isSafeInteger(this.requestCount + 1)) throw new Error('Computer image request clock is exhausted.');
    this.requestCount++;
    for (const message of messages) if (computerImage(message)) {
      const id = observationId(message);
      if (!this.seen.has(id)) { this.seen.add(id); this.visible.set(id, this.requestCount); }
    }
    for (const [id, first] of this.visible) if (this.requestCount - first >= this.retentionCalls) this.visible.delete(id);
    return this.project(messages);
  }
  project<Message>(messages: readonly Message[]): Message[] {
    if (!this.retentionCalls) return messages as Message[];
    return messages.map(message => {
      if (!computerImage(message) || !this.seen.has(observationId(message)) || this.visible.has(observationId(message))) return message;
      const content = message.content.filter(block => !isWireRecord(block) || (block.type !== 'image'
        && !(block.type === 'text' && typeof block.text === 'string' && geometry(block.text))));
      content.push({ type: 'text', text: EXPIRED_COMPUTER_IMAGE });
      const details = isWireRecord(message.details) ? { ...message.details } : undefined;
      if (details) delete details.computerViews;
      return { ...message, content, ...(details ? { details } : {}) } as Message;
    });
  }
  snapshot(): HistoryState {
    return { version: 1, requestCount: this.requestCount, visible: [...this.visible].map(([callId, firstRequest]) => ({ callId, firstRequest })) };
  }

  /** Pi's public compaction serializer discards images before streamFn. Match a complete
   * canonical conversation span so quoted user text/file results cannot be mistaken for a tool. */
  projectSummary<Message>(messages: readonly Message[], source: readonly unknown[], serialize: (message: unknown) => string): Message[] {
    if (!this.retentionCalls || !messages.some(message => isWireRecord(message) && message.role === 'system'
      && (typeof message.content === 'string' ? message.content : Array.isArray(message.content)
        ? message.content.filter(isWireRecord).map(block => block.text ?? '').join('') : '').startsWith('You are a context summarization assistant.'))) return messages as Message[];
    const pieces = source.flatMap(message => {
      const before = serialize(message); if (!before) return [];
      const projected = this.project([message])[0];
      return [{ before, after: projected === message ? before : serialize(projected) }];
    });
    if (!pieces.some(piece => piece.before !== piece.after)) return messages as Message[];
    const rewrite = (text: string): string => {
      const opening = text.startsWith('<conversation>\n') ? '<conversation>\n' : text.startsWith('# Conversation\n') ? '# Conversation\n' : '';
      if (!opening) return text;
      const closing = opening[0] === '<' ? '\n</conversation>' : '\n\n# Instructions\n';
      let expiredSectionFound = false;
      // Literal delimiters may occur in user/file content, a previous summary or
      // custom focus instructions. Only a whole canonical span identifies the wrapper.
      for (let end = text.lastIndexOf(closing); end >= opening.length; end = text.lastIndexOf(closing, end - 1)) {
        const conversation = text.slice(opening.length, end);
        if (!pieces.some(piece => piece.before !== piece.after && conversation.includes(piece.before))) continue;
        expiredSectionFound = true;
        for (let first = 0; first < pieces.length; first++) {
          let position = 0; const projected: string[] = [];
          for (let index = first; index < pieces.length; index++) {
            const prefix = index === first ? '' : '\n\n', piece = pieces[index];
            if (!conversation.startsWith(prefix + piece.before, position)) break;
            position += prefix.length + piece.before.length; projected.push(piece.after);
            if (position === conversation.length) return opening + projected.join('\n\n') + text.slice(end);
          }
        }
      }
      if (expiredSectionFound) throw new Error('Computer image expiry could not verify the compaction conversation projection.');
      return text;
    };
    return messages.map(message => {
      if (!isWireRecord(message) || message.role !== 'user') return message;
      if (typeof message.content === 'string') return { ...message, content: rewrite(message.content) } as Message;
      if (!Array.isArray(message.content)) return message;
      return { ...message, content: message.content.map(block => isWireRecord(block) && block.type === 'text' && typeof block.text === 'string'
        ? { ...block, text: rewrite(block.text) } : block) } as Message;
    });
  }
}
