import { toSpokenText } from './spoken-text';
import type { AssistantReply } from './assistant-reply';

const MAX_REPLY_LENGTH = 500;
const DETAILS = 'Weitere Details stehen im Gespräch.';
const sentences = new Intl.Segmenter('de', { granularity: 'sentence' });

/** Render ordinary Markdown tables as labeled rows rather than reading pipes aloud. */
function readableTables(text: string): string {
  const lines = text.split('\n');
  const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map(value => value.trim());
  const output: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('|') || !lines[i + 1]?.includes('|')
      || !cells(lines[i + 1]).every(value => /^:?-{3,}:?$/.test(value))) {
      output.push(lines[i]); continue;
    }
    const headers = cells(lines[i]);
    i++;
    while (lines[i + 1]?.includes('|') && lines[i + 1].trim()) {
      const values = cells(lines[++i]);
      output.push(values.map((value, index) => headers[index] ? `${headers[index]}: ${value}` : value).join('; ') + '.');
    }
  }
  return output.join('\n');
}

const genericIntroduction = (text: string): boolean => /^(?:Hier (?:ist|sind) (?:die Antwort|das Ergebnis|die Ergebnisse|eine Übersicht)|Ich habe (?:die Angaben|die Informationen|deine Anfrage|das Ergebnis) (?:geprüft|untersucht|ausgewertet))[.!:]?$/i.test(text);

function excerptUnits(text: string): string[] {
  // Fenced code can contain tool data; keep it out of an excerpt entirely.
  const prose = text.replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g, '\n\n');
  const units: string[] = [];
  let heading = '';
  for (const block of prose.split(/\n\s*\n/)) {
    const lines = block.trim().split('\n');
    while (/^\s{0,3}#{1,6}\s+/.test(lines[0] ?? '')) heading = toSpokenText(lines.shift()!);
    const body = toSpokenText(lines.join('\n')).trim();
    if (!body || genericIntroduction(body)) continue;
    const content = heading ? `${heading.replace(/[:.!?]$/, '')}: ${body}` : body;
    heading = '';
    for (const sentence of sentences.segment(content.replace(/\s+/g, ' '))) {
      const value = sentence.segment.trim();
      if (value) units.push(value);
    }
  }
  return units;
}

function beginningExcerpt(text: string, limit: number): string {
  // Preserve Unicode characters and mark a rare unfinished sentence as an excerpt.
  let beginning = '';
  for (const character of text) {
    if (beginning.length + character.length > limit - 2) break;
    beginning += character;
  }
  const wordEnd = beginning.lastIndexOf(' ');
  if (wordEnd > limit / 2) beginning = beginning.slice(0, wordEnd);
  return `${beginning} …`;
}

/** A 500-character safety net; normally the model supplies its own <=450-character speech. */
export function toSpokenReply(text: string): string {
  const readable = readableTables(text);
  const spoken = toSpokenText(readable);
  if (spoken.length <= MAX_REPLY_LENGTH) return spoken;

  const units = excerptUnits(readable);
  const suffix = spoken.length > 1200 ? ` ${DETAILS}` : '';
  const available = MAX_REPLY_LENGTH - suffix.length;
  const selected: string[] = [];
  let length = 0;
  for (const unit of units) {
    if (selected.length && (selected.length >= 3 || length + unit.length + 1 > available)) break;
    if (!selected.length && unit.length > available) {
      selected.push(beginningExcerpt(unit, available)); break;
    }
    selected.push(unit); length += unit.length + (selected.length > 1 ? 1 : 0);
  }
  // Code-only output has no prose to extract, but its existing safe pointer is useful.
  const excerpt = selected.join(' ') || beginningExcerpt(spoken, available);
  return `${excerpt}${suffix}`;
}

/** Model-authored speech is primary; legacy text and malformed output stay recoverable. */
export function toSpokenAssistantReply(reply: Pick<AssistantReply, 'text' | 'spoken' | 'unreadable'>): string {
  if (reply.unreadable) return 'Die Antwort konnte nicht vollständig aufbereitet werden. Der Originaltext bleibt im Gespräch erhalten.';
  return toSpokenReply(reply.spoken?.trim() || reply.text);
}
