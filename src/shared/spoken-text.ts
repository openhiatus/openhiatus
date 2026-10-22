/** Supports ordinary links and angle-wrapped paths containing spaces. */
export function markdownLinkPattern(): RegExp {
  return /!?\[([^\]\n]+)\]\(\s*(?:<([^>\n]+)>|((?:[^()\n]|\([^()\n]*\))*))\s*\)/g;
}

/** Keep prose intelligible for speech without reading Markdown or file paths aloud. */
export function toSpokenText(text: string): string {
  return text
    .replace(/```[\s\S]*?(?:```|$)/g, '\nDer Code steht im Gespräch.\n')
    .replace(/~~~[\s\S]*?(?:~~~|$)/g, '\nDer Code steht im Gespräch.\n')
    .replace(markdownLinkPattern(), (_match, label: string) => label)
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_match, stars: string | undefined, underscores: string | undefined) => stars ?? underscores ?? '')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s.,!?;)])/g, '$1$2')
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s.,!?;)])/g, '$1$2')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+(?:\[[ xX]\]\s+)?/gm, '')
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '')
    .replace(/<((?:https?:\/\/)[^>\s]+)>/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
