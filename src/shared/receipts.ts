/** Neutral receipts: they confirm only that a message arrived, never that work started or succeeded. */
export const RECEIPT_PHRASES = [
  'Okay, ich bin dran.',
  'Mach ich.',
  'Alles klar.',
  'Verstanden.',
  'Gut, ich schau mir das an.',
  'Moment, ich kümmere mich darum.',
  'Okay, einen Augenblick.',
  'Geht klar.',
  'In Ordnung.',
  'Bin dran.',
] as const;

const phrases: ReadonlySet<string> = new Set(RECEIPT_PHRASES);
export function isReceiptPhrase(text: string): boolean { return phrases.has(text); }

/** Picks a phrase that differs from the last one; `random` is injectable for tests. */
export function nextReceipt(last?: string, random: () => number = Math.random): string {
  const choices = RECEIPT_PHRASES.filter(phrase => phrase !== last);
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
}
