import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemorySummaryProgress, MemoryView, ProposalCard, RelatedReports, ReportProvenance, memoryDayIdentifier, memoryDocumentTitle, memoryLongTermDocuments } from '../src/renderer/MemoryView';
import type { CoreProposal, MemoryDocument, MemorySummaryMetadata, SummaryJobState } from '../src/shared/memory';

const document: MemoryDocument = {
  id: 'core', kind: 'core', title: 'Geschützter Kern', content: 'Aktuelle Fassung: Antworte kurz.', version: 3,
  updatedAt: '2026-10-05T12:00:00.000Z', sourceIds: [], edited: true,
  history: [{ version: 2, content: 'Frühere Fassung: Antworte ausführlich.', updatedAt: '2026-10-04T12:00:00.000Z', sourceIds: [], reason: 'user-edit' }],
};
const proposal: CoreProposal = {
  id: 'proposal-ui-test', documentId: 'core', baseVersion: 3, content: 'Neue Fassung: Antworte in Stichpunkten.',
  reason: 'Du hast kurze Listen bevorzugt.', sourceIds: [], status: 'pending', createdAt: '2026-10-05T12:05:00.000Z',
};

test('memory presents the four identity files and a single agent and user area', () => {
  const plain = renderToStaticMarkup(createElement(MemoryView, { active: false }));
  assert.match(plain, /<h1>Gedächtnis\.<\/h1>/);
  assert.match(plain, /Agent &amp; Nutzer/); assert.match(plain, /Technische Vorgaben/);
  for (const name of ['SOUL.md', 'IDENTITY.md', 'USER.md', 'MEMORY.md']) assert.ok(plain.includes(name));
  assert.doesNotMatch(plain, /Gedächtnis &amp; Identität|Identität &amp; Kern|Persönlichkeit öffnen/);
});

test('display titles replace legacy identity labels consistently without changing stored documents', () => {
  const identity = { ...document, id: 'identity', kind: 'identity' as const, title: 'Identität' };
  assert.equal(memoryDocumentTitle(document), 'MEMORY.md');
  assert.equal(memoryDocumentTitle(identity), 'Frühere Hintergrundnotiz');
  assert.equal(document.title, 'Geschützter Kern'); assert.equal(identity.title, 'Identität');
  assert.equal(memoryDocumentTitle({ id: 'day:2026-10-05', title: 'Tag · 2026-10-05' }), 'Tag · 2026-10-05');
  const html = renderToStaticMarkup(createElement(ProposalCard, { proposal: { ...proposal, documentId: 'identity' }, document: identity, busy: false, onDecide: () => {}, onOpenDocument: () => {} }));
  assert.match(html, /<h2>Frühere Hintergrundnotiz<\/h2>/); assert.match(html, /Notiz öffnen/);
});

test('background notes are hidden by default, explicit opening reveals them, and dirty drafts remain visible', () => {
  const identity = { ...document, id: 'identity', kind: 'identity' as const };
  const day = { ...document, id: 'day:2026-10-05', kind: 'day' as const };
  const documents = [identity, day, document];
  assert.deepEqual(memoryLongTermDocuments(documents, false).map(item => item.id), ['core']);
  assert.deepEqual(memoryLongTermDocuments(documents, true).map(item => item.id), ['core', 'identity']);
  assert.deepEqual(memoryLongTermDocuments(documents, false, { content: 'Geänderter Entwurf', original: 'Bisher' }).map(item => item.id), ['core', 'identity']);
  assert.deepEqual(memoryLongTermDocuments(documents, false, { content: 'Bisher', original: 'Bisher' }).map(item => item.id), ['core']);
  assert.deepEqual(documents.map(item => item.id), ['identity', 'day:2026-10-05', 'core']);
});
function markup(value: CoreProposal, target: MemoryDocument | undefined = document) {
  return renderToStaticMarkup(createElement(ProposalCard, { proposal: value, document: target, busy: false, onDecide: () => {} }));
}
function approveButton(html: string) { return html.match(/<button[^>]*class="primary-button"[^>]*>/)?.[0]; }

test('protected-memory approval displays the exact before and after, with an enabled explicit action', () => {
  const html = markup(proposal);
  assert.ok(html.includes(document.content));
  assert.ok(html.includes(proposal.content));
  assert.ok(html.includes('Genau diese Fassung freigeben'));
  assert.ok(approveButton(html));
  assert.ok(!approveButton(html)?.includes('disabled'));
});

test('stale proposals show their actual historical base and cannot be approved', () => {
  const html = markup({ ...proposal, baseVersion: 2 });
  assert.ok(html.includes(document.history[0].content));
  assert.ok(!html.includes(document.content));
  assert.ok(approveButton(html)?.includes('disabled'));
  assert.ok(html.includes('Eine Freigabe dieser alten Fassung ist gesperrt.'));
});

test('missing protected targets fail closed in the approval UI', () => {
  const html = renderToStaticMarkup(createElement(ProposalCard, { proposal, busy: false, onDecide: () => {} }));
  assert.ok(approveButton(html)?.includes('disabled'));
  assert.ok(html.includes('Die Ausgangsversion ist nicht mehr verfügbar.'));
});

test('decided proposals do not render an approval action', () => {
  for (const status of ['approved', 'rejected', 'stale'] as const) assert.equal(approveButton(markup({ ...proposal, status })), undefined);
});

test('proposal text is inert text, including HTML and executable-looking links', () => {
  const html = markup({ ...proposal, content: '<script>alert("x")</script> [öffnen](javascript:alert(1))', reason: '<img src=x onerror=alert(1)>' });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img '));
  assert.ok(!html.includes('<a '));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('javascript:alert(1)'));
});

test('day lookup accepts German and ISO calendar dates without silently rolling invalid dates', () => {
  assert.equal(memoryDayIdentifier(' 5.10.2026 '), 'day:2026-10-05');
  assert.equal(memoryDayIdentifier('2026-10-05'), 'day:2026-10-05');
  assert.equal(memoryDayIdentifier('29.02.2024'), 'day:2024-02-29');
  assert.equal(memoryDayIdentifier('31.12.2026'), 'day:2026-12-31');
  for (const invalid of ['29.02.2026', '31.04.2026', '2026-13-01', '00.10.2026', '2026-10-05T23:00:00Z', 'gestern', '05.10.26']) assert.equal(memoryDayIdentifier(invalid), undefined, invalid);
});

const summary: MemorySummaryMetadata = {
  method: 'ai', model: 'synthetic-model', generatedAt: '2026-10-05T12:00:00.000Z', inputHash: 'synthetic-input-hash',
  inputDocuments: [{ id: 'day:2026-10-04', version: 2 }], citations: ['synthetic-source'], stale: false,
};

test('local excerpts are not advertised as generated AI reports and stale reports stay visibly stale', () => {
  const interim = renderToStaticMarkup(createElement(ReportProvenance, {}));
  assert.ok(interim.includes('Vorläufige Auszüge · noch kein KI-Bericht'));
  assert.ok(!interim.includes('KI-Bericht mit openHiatus'));
  const generated = renderToStaticMarkup(createElement(ReportProvenance, { summary }));
  assert.ok(generated.includes('KI-Bericht mit openHiatus'));
  assert.ok(generated.includes(summary.model));
  const stale = renderToStaticMarkup(createElement(ReportProvenance, { summary: { ...summary, stale: true } }));
  assert.ok(stale.includes('Aktualisierung ausstehend'));
  assert.ok(!stale.includes('KI-Bericht mit openHiatus'));
});

test('manual correction is prominent while preserving attribution to the original AI report', () => {
  const corrected = renderToStaticMarkup(createElement(ReportProvenance, { summary: { ...summary, stale: true }, edited: true }));
  assert.ok(corrected.includes('Von dir korrigiert'));
  assert.ok(corrected.includes('Berichtsgrundlage:'));
  assert.ok(corrected.includes(summary.model));
  assert.ok(corrected.includes('Deine Korrektur bleibt'));
  assert.ok(!corrected.includes('Aktualisierung ausstehend'));
});

test('report drilldown shows the exact input version instead of a later replacement', () => {
  const inputDocument: MemoryDocument = { ...document, id: 'day:2026-10-04', kind: 'day', title: 'Tag · 2026-10-04' };
  const html = renderToStaticMarkup(createElement(RelatedReports, { inputs: summary.inputDocuments, documents: [inputDocument], onOpen: () => {} }));
  assert.ok(html.includes('Verwendete Version 2'));
  assert.ok(html.includes('aktuell Version 3'));
  assert.ok(html.includes(document.history[0].content));
  assert.ok(!html.includes(document.content));
  assert.ok(html.includes('Aktuelle Fassung öffnen'));
});

test('partial, stopped and failed summary batches never claim every report was refreshed', () => {
  const job: SummaryJobState = { status: 'completed', mode: 'manual', model: 'synthetic-model', calls: 2, maxCalls: 2, completed: 1, total: 3, remaining: 2 };
  const partial = renderToStaticMarkup(createElement(MemorySummaryProgress, { job }));
  assert.ok(partial.includes('Durchlauf beendet · weitere Berichte offen'));
  assert.ok(!partial.includes('Berichte aktualisiert'));
  for (const status of ['interrupted', 'failed'] as const) {
    const html = renderToStaticMarkup(createElement(MemorySummaryProgress, { job: { ...job, status, error: status === 'failed' ? 'synthetic failure' : undefined } }));
    assert.ok(!html.includes('Berichte aktualisiert'));
    assert.ok(html.includes('Originalquellen bleiben erhalten'));
    if (status === 'failed') assert.ok(html.includes('synthetic failure'));
  }
});
