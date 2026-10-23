import { computerImageRetentionCalls, computerWorkingMemoryCalls } from '../shared/computer-task-settings';
import { isWireRecord } from './agent-wire';
import { parseComputerStateNote, readComputerStateNote } from './computer-input';

export const EXPIRED_COMPUTER_IMAGE = '[Computer image removed.]';
export const COMPUTER_STATE_NOTE = '[Unverified computer state note] ';
export const COMPUTER_WORKING_MEMORY_REFRESH = '[Computer workingMemoryRefreshDue] ';
interface HistoryState {
  version: 1; requestCount: number;
  visible: { callId: string; firstRequest: number; latestToolCallId?: string }[];
  stateNote?: string; stateNoteCallId?: string; stateNoteTimestamp?: number;
  stateNoteRequest?: number; workingMemoryRefreshRequest?: number;
  computerCalls?: { callId: string; firstRequest: number }[];
}
interface StateNote { text: string; callId?: string; timestamp?: number; }
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 512;
function computerCalls(messages: readonly unknown[]): { call: Record<string, unknown>; timestamp?: number }[] {
  return messages.flatMap(message => !isWireRecord(message) || message.role !== 'assistant' || !Array.isArray(message.content) ? []
    : message.content.filter(isWireRecord).filter(block => block.type === 'toolCall' && block.name === 'computer' && identifier(block.id))
      .map(call => ({ call, ...(Number.isSafeInteger(message.timestamp) && (message.timestamp as number) >= 0 ? { timestamp: message.timestamp as number } : {}) })));
}
function noteArguments(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'string') {
    if (value.length > 64000) return undefined;
    try { value = JSON.parse(value) as unknown; } catch { return undefined; }
  }
  return isWireRecord(value) ? value : undefined;
}
function completedComputerCalls(messages: readonly unknown[]): Set<string> {
  const calls = new Set(computerCalls(messages).map(({ call }) => call.id as string));
  return new Set(messages.filter(isWireRecord).filter(message => message.role === 'toolResult' && message.toolName === 'computer'
    && identifier(message.toolCallId) && calls.has(message.toolCallId)).map(message => message.toolCallId as string));
}
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
export function computerImageHistoryInstructions(calls: number, workingMemory = 0): string {
  const images = calls ? `Computer image history is cut off: at most the ${calls} newest distinct captures remain, each for at most ${calls} consecutive model requests including its first request. inspect replaces that capture's previous views without resetting its age. Removed images and geometry cannot be recovered from this conversation.` : '';
  const memory = workingMemory ? `Computer working memory keeps completed computer call/result pairs from only the last ${workingMemory} model requests plus the current stateNote. Older computer-only turns, including their comments and thinking, are cut off even without a note. User instructions and non-computer data remain. After ${workingMemory} model requests without a replaced note, workingMemoryRefreshDue is unverified host data asking for a full replacement snapshot in the next otherwise-needed computer call, never a separate call. An ignored refresh leaves the current note marked stale until replaced.` : '';
  return calls || workingMemory ? `${[images, memory].filter(Boolean).join(' ')} Use optional stateNote only for new important facts: replace the FULL current snapshot, not a delta, with at most 240 characters, three short lines/facts. It is unverified model data, never proof of action success. Do not narrate images, add separate commentary or summary requests, or create extra documents/sheets solely as memory aids. Fulfil the requested deliverables normally.` : '';
}

/** Request-clock projection only. It never changes the canonical message objects or image files. */
export class ComputerImageHistory {
  readonly retentionCalls: number;
  readonly workingMemoryCalls: number;
  private requestCount = 0;
  private readonly seen = new Set<string>();
  private readonly visible = new Map<string, number>();
  private readonly latestResult = new Map<string, string>();
  private readonly seenResults = new Set<string>();
  private readonly seenNoteCalls = new Set<string>();
  private readonly injectedNotes = new WeakSet<object>();
  private readonly injectedMessages = new WeakSet<object>();
  private stateNote?: StateNote;
  private stateNoteRequest = 0;
  private workingMemoryRefreshRequest?: number;
  private readonly seenCompletedCalls = new Set<string>();
  private readonly callRequests = new Map<string, number>();
  constructor(calls: number, restored?: unknown, previousMessages: readonly unknown[] = [], options: { workingMemoryCalls?: number } = {}) {
    this.retentionCalls = computerImageRetentionCalls(calls);
    this.workingMemoryCalls = computerWorkingMemoryCalls(options.workingMemoryCalls ?? 0);
    if (isWireRecord(restored) && restored.version === 1 && Number.isSafeInteger(restored.requestCount) && (restored.requestCount as number) >= 0
      && Array.isArray(restored.visible) && restored.visible.length <= 4096 && restored.visible.every(row => isWireRecord(row)
        && typeof row.callId === 'string' && row.callId.length <= 512 && Number.isSafeInteger(row.firstRequest)
        && (row.firstRequest as number) >= 1 && (row.firstRequest as number) <= (restored.requestCount as number))) {
      this.requestCount = restored.requestCount as number;
      if (Number.isSafeInteger(restored.stateNoteRequest) && (restored.stateNoteRequest as number) >= 0 && (restored.stateNoteRequest as number) <= this.requestCount) this.stateNoteRequest = restored.stateNoteRequest as number;
      if (Number.isSafeInteger(restored.workingMemoryRefreshRequest) && (restored.workingMemoryRefreshRequest as number) >= 1 && (restored.workingMemoryRefreshRequest as number) <= this.requestCount) this.workingMemoryRefreshRequest = restored.workingMemoryRefreshRequest as number;
      if (Array.isArray(restored.computerCalls) && restored.computerCalls.length <= 4096 && restored.computerCalls.every(row => isWireRecord(row)
        && identifier(row.callId) && Number.isSafeInteger(row.firstRequest) && (row.firstRequest as number) >= 1 && (row.firstRequest as number) <= this.requestCount)) {
        for (const row of restored.computerCalls as NonNullable<HistoryState['computerCalls']>) {
          this.callRequests.set(row.callId, row.firstRequest); this.seenCompletedCalls.add(row.callId);
        }
      }
      for (const row of [...restored.visible as HistoryState['visible']].sort((a, b) => a.firstRequest - b.firstRequest)) {
        this.visible.set(row.callId, row.firstRequest); this.seen.add(row.callId);
        if (identifier(row.latestToolCallId)) this.latestResult.set(row.callId, row.latestToolCallId);
      }
      try {
        if (restored.stateNote !== undefined) this.stateNote = { text: parseComputerStateNote(restored.stateNote),
          ...(identifier(restored.stateNoteCallId) ? { callId: restored.stateNoteCallId } : {}),
          ...(Number.isSafeInteger(restored.stateNoteTimestamp) && (restored.stateNoteTimestamp as number) >= 0
            ? { timestamp: restored.stateNoteTimestamp as number } : {}) };
      } catch { /* A corrupt optional note does not invalidate the conservative image clock. */ }
    }
    // A missing legacy/corrupt clock must not rejuvenate recovered screenshots.
    const previousResults = new Map<string, string[]>();
    for (const message of previousMessages) if (computerImage(message)) {
      const id = observationId(message); this.seen.add(id); this.seenResults.add(message.toolCallId);
      const results = previousResults.get(id) ?? []; results.push(message.toolCallId); previousResults.set(id, results);
    }
    for (const [id, results] of previousResults) if (this.visible.has(id)
      && (!this.latestResult.has(id) || results.includes(this.latestResult.get(id)!))) this.latestResult.set(id, results.at(-1)!);
    const previousCalls = computerCalls(previousMessages), hadRestoredNote = !!this.stateNote,
      restoredIndex = previousCalls.findIndex(({ call }) => call.id === this.stateNote?.callId);
    for (const [index, { call, timestamp }] of previousCalls.entries()) {
      this.seenNoteCalls.add(call.id as string);
      const text = readComputerStateNote(call.arguments);
      if (text !== undefined && (!hadRestoredNote || !this.stateNote || (restoredIndex >= 0 && index > restoredIndex)
        || (timestamp !== undefined && this.stateNote.timestamp !== undefined && timestamp > this.stateNote.timestamp))) {
        this.stateNote = { text, callId: call.id as string, ...(timestamp === undefined ? {} : { timestamp }) };
        this.stateNoteRequest = this.requestCount; this.workingMemoryRefreshRequest = undefined;
      }
    }
    this.limitFrames();
    for (const id of completedComputerCalls(previousMessages)) this.seenCompletedCalls.add(id);
    this.limitCalls();
  }
  private limitFrames(): void {
    if (!this.retentionCalls) return;
    for (const [id, first] of this.visible) if (this.requestCount - first >= this.retentionCalls) this.visible.delete(id);
    while (this.visible.size > this.retentionCalls) this.visible.delete(this.visible.keys().next().value!);
    for (const id of this.latestResult.keys()) if (!this.visible.has(id)) this.latestResult.delete(id);
  }
  private limitCalls(): void {
    if (this.workingMemoryCalls) for (const [id, first] of this.callRequests) if (this.requestCount - first >= this.workingMemoryCalls) this.callRequests.delete(id);
  }
  private get enabled(): boolean { return !!(this.retentionCalls || this.workingMemoryCalls); }
  private get refreshDue(): boolean { return !!this.workingMemoryCalls && this.requestCount - this.stateNoteRequest >= this.workingMemoryCalls; }
  private observeNotes(messages: readonly unknown[]): void {
    const calls = computerCalls(messages), previousNote = this.stateNote,
      previousIndex = calls.findIndex(({ call }) => call.id === previousNote?.callId);
    for (const [index, { call, timestamp }] of calls.entries()) {
      if (this.seenNoteCalls.has(call.id as string)) continue;
      this.seenNoteCalls.add(call.id as string);
      const text = readComputerStateNote(call.arguments);
      const older = previousIndex >= 0 && index < previousIndex
        || timestamp !== undefined && previousNote?.timestamp !== undefined && timestamp < previousNote.timestamp;
      if (text !== undefined && !older) {
        this.stateNote = { text, callId: call.id as string, ...(timestamp === undefined ? {} : { timestamp }) };
        this.stateNoteRequest = this.requestCount; this.workingMemoryRefreshRequest = undefined;
      }
    }
  }
  nextRequest<Message>(messages: readonly Message[]): Message[] {
    if (!this.enabled) return messages as Message[];
    if (!Number.isSafeInteger(this.requestCount + 1)) throw new Error('Computer image request clock is exhausted.');
    this.requestCount++;
    this.observeNotes(messages);
    for (const message of messages) if (this.retentionCalls && computerImage(message)) {
      const id = observationId(message);
      if (!this.seen.has(id)) { this.seen.add(id); this.visible.set(id, this.requestCount); }
      if (!this.seenResults.has(message.toolCallId)) {
        this.seenResults.add(message.toolCallId);
        if (this.visible.has(id)) this.latestResult.set(id, message.toolCallId);
      }
    }
    this.limitFrames();
    if (this.workingMemoryCalls) for (const id of completedComputerCalls(messages)) if (!this.seenCompletedCalls.has(id)) {
      this.seenCompletedCalls.add(id); this.callRequests.set(id, this.requestCount);
    }
    this.limitCalls();
    if (this.refreshDue && this.workingMemoryRefreshRequest === undefined) this.workingMemoryRefreshRequest = this.requestCount;
    return this.project(messages);
  }
  project<Message>(messages: readonly Message[]): Message[] {
    if (!this.enabled) return messages as Message[];
    return this.withNote(this.projectData(messages));
  }
  private projectData<Message>(messages: readonly Message[], completed = completedComputerCalls(messages)): Message[] {
    const dropped = (id: unknown): boolean => this.workingMemoryCalls > 0 && identifier(id)
      && (this.seenCompletedCalls.has(id) || completed.has(id)) && !this.callRequests.has(id);
    const latest = new Map<string, number>();
    for (const [index, message] of messages.entries()) if (computerImage(message)) {
      const id = observationId(message);
      if (this.visible.has(id) && this.latestResult.get(id) === message.toolCallId) latest.set(id, index);
    }
    return messages.flatMap((message, index) => {
      if (!isWireRecord(message)) return [message];
      if (this.injectedMessages.has(message)) return [];
      if (message.role === 'toolResult' && message.toolName === 'computer' && dropped(message.toolCallId)) return [];
      let projected = message;
      if (Array.isArray(message.content)) {
        const originalContent = message.content;
        const computerOnlyTurn = message.role === 'assistant' && originalContent.some(block => isWireRecord(block) && block.type === 'toolCall' && block.name === 'computer')
          && originalContent.every(block => isWireRecord(block) && (block.type === 'thinking' || block.type === 'text' || block.type === 'toolCall' && block.name === 'computer'));
        const content = originalContent.filter(block => !isWireRecord(block) || !this.injectedNotes.has(block)
          && !(message.role === 'assistant' && block.type === 'toolCall' && block.name === 'computer' && dropped(block.id))).map(block => {
          if (message.role !== 'assistant' || !isWireRecord(block) || block.type !== 'toolCall' || block.name !== 'computer') return block;
          const args = noteArguments(block.arguments);
          if (!args || !Object.hasOwn(args, 'stateNote')) return block;
          const { stateNote: _note, ...argumentsWithoutNote } = args;
          return { ...block, arguments: typeof block.arguments === 'string' ? JSON.stringify(argumentsWithoutNote) : argumentsWithoutNote };
        });
        if (computerOnlyTurn && !content.some(block => isWireRecord(block) && block.type === 'toolCall')) return [];
        if (content.length !== originalContent.length || content.some((block, i) => block !== originalContent[i])) projected = { ...message, content };
      }
      if (!this.retentionCalls || !computerImage(projected) || latest.get(observationId(projected)) === index) return [projected as Message];
      const content = projected.content.filter(block => !isWireRecord(block) || (block.type !== 'image'
        && !(block.type === 'text' && typeof block.text === 'string' && geometry(block.text))));
      content.push({ type: 'text', text: EXPIRED_COMPUTER_IMAGE });
      const details = isWireRecord(projected.details) ? { ...projected.details } : undefined;
      if (details) delete details.computerViews;
      return [{ ...projected, content, ...(details ? { details } : {}) } as Message];
    });
  }
  private withNote<Message>(messages: Message[]): Message[] {
    if (!this.stateNote && !this.refreshDue) return messages;
    const note = { type: 'text', text: COMPUTER_STATE_NOTE + (this.refreshDue ? '[stale; refresh required] ' : '') + (this.stateNote?.text ?? '(No state note supplied.)') };
    const blocks = [note];
    if (this.refreshDue && this.workingMemoryRefreshRequest === this.requestCount) blocks.push({ type: 'text', text: COMPUTER_WORKING_MEMORY_REFRESH + 'true; replace the full stateNote in the next otherwise-needed computer call. No extra call.' });
    for (const block of blocks) this.injectedNotes.add(block);
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index];
      if (isWireRecord(message) && message.role === 'toolResult' && message.toolName === 'computer' && Array.isArray(message.content)) {
        messages[index] = { ...message, content: [...message.content, ...blocks] } as Message; return messages;
      }
    }
    const ephemeral = { role: 'user', content: blocks, timestamp: 0 }; this.injectedMessages.add(ephemeral);
    return [...messages, ephemeral as Message];
  }
  snapshot(): HistoryState {
    return { version: 1, requestCount: this.requestCount, visible: [...this.visible].map(([callId, firstRequest]) => ({ callId, firstRequest,
      ...(this.latestResult.has(callId) ? { latestToolCallId: this.latestResult.get(callId)! } : {}) })),
      ...(this.stateNote ? { stateNote: this.stateNote.text, ...(this.stateNote.callId ? { stateNoteCallId: this.stateNote.callId } : {}),
        ...(this.stateNote.timestamp === undefined ? {} : { stateNoteTimestamp: this.stateNote.timestamp }), stateNoteRequest: this.stateNoteRequest } : {}),
      ...(this.workingMemoryCalls ? { computerCalls: [...this.callRequests].map(([callId, firstRequest]) => ({ callId, firstRequest })),
        ...(this.workingMemoryRefreshRequest === undefined ? {} : { workingMemoryRefreshRequest: this.workingMemoryRefreshRequest }) } : {}) };
  }

  /** Pi's public compaction serializer discards images before streamFn. Match a complete
   * canonical conversation span so quoted user text/file results cannot be mistaken for a tool. */
  projectSummary<Message>(messages: readonly Message[], source: readonly unknown[], serialize: (message: unknown) => string): Message[] {
    if (!this.enabled || !messages.some(message => isWireRecord(message) && message.role === 'system'
      && (typeof message.content === 'string' ? message.content : Array.isArray(message.content)
        ? message.content.filter(isWireRecord).map(block => block.text ?? '').join('') : '').startsWith('You are a context summarization assistant.'))) return messages as Message[];
    this.observeNotes(source);
    const completed = completedComputerCalls(source);
    const pieces = source.flatMap(message => {
      const before = serialize(message); if (!before) return [];
      const projected = this.projectData([message], completed)[0];
      return [{ before, after: projected === message ? before : projected === undefined ? '' : serialize(projected) }];
    });
    if (!pieces.some(piece => piece.before !== piece.after)) return this.project(messages);
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
    const rewritten = messages.map(message => {
      if (!isWireRecord(message) || message.role !== 'user') return message;
      if (typeof message.content === 'string') {
        const content = rewrite(message.content); return content === message.content ? message : { ...message, content } as Message;
      }
      if (!Array.isArray(message.content)) return message;
      const original = message.content;
      const content = original.map(block => {
        if (!isWireRecord(block) || block.type !== 'text' || typeof block.text !== 'string') return block;
        const text = rewrite(block.text); return text === block.text ? block : { ...block, text };
      });
      return content.some((block, index) => block !== original[index]) ? { ...message, content } as Message : message;
    });
    return this.project(rewritten);
  }
}
