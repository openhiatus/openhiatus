import type { IdentityDocument } from './identity-documents';

export const REPLY_STYLES = {
  current: '',
  brief: 'Antworte knapp und direkt. Beginne mit dem Ergebnis und beschränke dich auf das Wesentliche.',
  detailed: 'Erkläre Zusammenhänge ausführlich und verständlich. Nutze passende Beispiele und begründe wichtige Entscheidungen.',
  guided: 'Führe mich in kleinen, leicht verständlichen Schritten durch Aufgaben. Erkläre jeweils den nächsten Schritt und vermeide unnötige Fachbegriffe.',
} as const;
export interface SetupIdentity {
  agentName: string; agentRole: string; userName: string; userContext: string;
  replyStyle: keyof typeof REPLY_STYLES; replyNotes: string;
}
export const EMPTY_SETUP_IDENTITY: SetupIdentity = { agentName: '', agentRole: '', userName: '', userContext: '', replyStyle: 'current', replyNotes: '' };

function linePattern(labels: string): RegExp { return new RegExp(`^([ \\t]*(?:[-*][ \\t]+)?(?:\\*\\*)?(?:${labels}):(?:\\*\\*)?)[ \\t]*(.*)$`, 'gim'); }
function lineValue(content: string, labels: string): string { return [...content.matchAll(linePattern(labels))][0]?.[2]?.trim() ?? ''; }
function replaceLine(content: string, labels: string, label: string, value: string): string {
  const matches = [...content.matchAll(linePattern(labels))];
  if (matches.length > 1) throw new Error('Mehrdeutige Identitätsangabe. Bitte zuerst unter Agent & Nutzer bearbeiten.');
  return matches.length ? content.replace(linePattern(labels), (_match, prefix: string) => `${prefix} ${value}`) : `${content.trimEnd()}\n\n- **${label}:** ${value}\n`;
}
function block(content: string, key: string): { start: number; end: number; value: string } | undefined {
  const startTag = `<!-- openhiatus:setup-${key}:start -->`, endTag = `<!-- openhiatus:setup-${key}:end -->`;
  const start = content.indexOf(startTag), end = content.indexOf(endTag);
  if (start < 0 && end < 0) return undefined;
  if (start < 0 || end < start || content.indexOf(startTag, start + 1) >= 0 || content.indexOf(endTag, end + 1) >= 0)
    throw new Error('Der Einrichtungsabschnitt wurde verändert. Bitte zuerst unter Agent & Nutzer bearbeiten.');
  return { start, end: end + endTag.length, value: content.slice(start + startTag.length, end).trim() };
}
function replaceBlock(content: string, key: string, value: string): string {
  const current = block(content, key);
  if (value.includes('<!-- openhiatus:')) throw new Error('Reservierte Markierungen sind in Einrichtungsangaben nicht erlaubt.');
  const replacement = value ? `<!-- openhiatus:setup-${key}:start -->\n${value}\n<!-- openhiatus:setup-${key}:end -->` : '';
  return current ? content.slice(0, current.start) + replacement + content.slice(current.end) : replacement ? `${content.trimEnd()}\n\n${replacement}\n` : content;
}
function document(documents: readonly IdentityDocument[], id: string): IdentityDocument {
  const result = documents.find(document => document.id === id);
  if (!result) throw new Error('Die Identitätsdateien sind noch nicht verfügbar.');
  return result;
}
export function readSetupIdentity(documents: readonly IdentityDocument[]): SetupIdentity {
  const agent = document(documents, 'agent').content, user = document(documents, 'user').content, soul = document(documents, 'soul').content;
  const style = block(soul, 'style')?.value ?? '';
  return { agentName: lineValue(agent, 'Name|Rufname'), agentRole: lineValue(agent, 'Rolle'), userName: lineValue(user, 'Anrede'),
    userContext: block(user, 'context')?.value ?? '', replyNotes: block(soul, 'replies')?.value ?? '',
    replyStyle: (Object.keys(REPLY_STYLES) as SetupIdentity['replyStyle'][]).find(key => REPLY_STYLES[key] === style) ?? 'current' };
}
export function setupIdentityChanges(documents: readonly IdentityDocument[], draft: SetupIdentity): IdentityDocument[] {
  const before = readSetupIdentity(documents), changed = new Map<string, IdentityDocument>();
  function update(id: string, field: keyof SetupIdentity, limit: number, multiline: boolean, write: (content: string, value: string) => string) {
    if (draft[field] === before[field]) return;
    const value = draft[field].trim();
    if (value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || (!multiline && /[\r\n\t]/.test(value))) throw new Error('Die Einrichtungsangabe ist zu lang oder enthält ungültige Zeichen.');
    const original = changed.get(id) ?? document(documents, id);
    const content = write(original.content, value);
    if (content.length > 8000) throw new Error('Die Identitätsdatei ist zu lang. Bitte unter Agent & Nutzer kürzen.');
    changed.set(id, { ...original, content });
  }
  update('agent', 'agentName', 60, false, (text, value) => replaceLine(text, 'Name|Rufname', 'Name', value));
  update('agent', 'agentRole', 500, false, (text, value) => replaceLine(text, 'Rolle', 'Rolle', value));
  update('user', 'userName', 100, false, (text, value) => replaceLine(text, 'Anrede', 'Anrede', value));
  update('user', 'userContext', 1500, true, (text, value) => replaceBlock(text, 'context', value));
  update('soul', 'replyStyle', 20, false, (text, value) => {
    if (!Object.hasOwn(REPLY_STYLES, value)) throw new Error('Ungültiger Antwortstil.');
    return replaceBlock(text, 'style', REPLY_STYLES[value as SetupIdentity['replyStyle']]);
  });
  update('soul', 'replyNotes', 1000, true, (text, value) => replaceBlock(text, 'replies', value));
  return [...changed.values()].filter(changed => changed.content !== document(documents, changed.id).content);
}

/** Keep confirmed documents after each write, so retrying a partial save never repeats it. */
export async function saveSetupIdentity(documents: IdentityDocument[], draft: SetupIdentity, api: {
  memorySnapshot(): Promise<{ documents: IdentityDocument[] }>;
  editMemory(id: string, content: string, version: number): Promise<{ documents: IdentityDocument[] }>;
}): Promise<void> {
  const changes = setupIdentityChanges(documents, draft);
  if (!changes.length) return;
  const current = await api.memorySnapshot();
  for (const change of changes) {
    const original = document(documents, change.id), latest = document(current.documents, change.id);
    if (latest.version !== original.version || latest.content !== original.content) throw new Error('Die Angaben wurden inzwischen geändert. Lade sie neu, bevor du speicherst.');
  }
  for (const change of changes) {
    const result = await api.editMemory(change.id, change.content, change.version);
    documents[documents.findIndex(document => document.id === change.id)] = { ...document(result.documents, change.id) };
  }
}
