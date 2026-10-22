import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Message } from '../src/shared/contracts';
import { MemoryStore, memoryPeriodsInQuery } from '../src/main/memory';

function setup() {
  const path = mkdtempSync(join(tmpdir(), 'openhiatus-semantic-memory-test-'));
  return { path, store: new MemoryStore(path, { now: () => new Date('2026-11-02T12:00:00Z') }) };
}
function message(id: string, text: string, day = '2026-10-05'): Message { return { id, text, role: 'user', at: `${day}T12:00:00Z` }; }
function apply(store: MemoryStore, id: string, content?: string) {
  const input = store.summaryInput(id);
  return store.applySummary(input, { content: content || `Ergebnis für ${id}: ${input.records.map(row => row.text).join(' ')}\nBeleg: ${input.sourceIds[0]}`, model: 'synthetic-test-model', citations: input.sourceIds.slice(0, 1) });
}

test('semantic day input includes every complete source, including early evidence omitted from interim excerpts', () => {
  const { store } = setup();
  const messages = Array.from({ length: 30 }, (_, index) => message(`source-${index}`, index === 0 ? 'Frühe verbindliche Entscheidung. ' + 'Ausführlicher Kontext ä🙂. '.repeat(80) : `Weitere Nachricht ${index}`));
  store.capture(messages, 'conversation');
  assert.ok(!store.snapshot().documents.find(doc => doc.id === 'day:2026-10-05')!.content.includes('Frühe verbindliche Entscheidung'));
  const input = store.summaryInput('day:2026-10-05');
  assert.equal(input.records.length, 30); assert.equal(input.sourceIds.length, 30);
  assert.equal(input.records.find(record => record.id === 'source-0')!.text, messages[0].text);
  assert.equal(input.records.find(record => record.id === 'source-0')!.role, 'user');
  assert.ok(input.records.every(record => record.kind === 'source'));
  assert.equal(input.inputDocuments.length, 0);
});

test('plans order prerequisites before weekly/monthly reports and default to closed Berlin periods', () => {
  const { store } = setup();
  store.capture([message('past', 'Abgeschlossen', '2026-09-30'), message('today', 'Heute', '2026-10-06'), message('yesterday', 'Gestern', '2026-10-05')], 'conversation');
  const plan = store.planSummaries({ now: '2026-10-05T22:30:00Z' }); // already October 6 in Berlin
  assert.ok(plan.some(job => job.documentId === 'day:2026-10-05'));
  assert.ok(!plan.some(job => job.documentId === 'day:2026-10-06'));
  assert.ok(!plan.some(job => job.documentId === 'month:2026-10'));
  const month = plan.find(job => job.documentId === 'month:2026-09')!;
  assert.deepEqual(month.blockedBy, ['day:2026-09-30']);
  assert.ok(plan.indexOf(month) > plan.findIndex(job => job.documentId === 'day:2026-09-30'));
  assert.throws(() => store.summaryInput('month:2026-09'), /Zuerst/);
  apply(store, 'day:2026-09-30', 'Tagesergebnis: Vorbereitung abgeschlossen. [past]');
  assert.equal(store.planSummaries({ now: '2026-10-05T22:30:00Z' }).find(job => job.documentId === month.documentId)!.blockedBy.length, 0);
  assert.equal(store.summaryInput(month.documentId).records[0].kind, 'report');
});

test('monthly synthesis consumes all 31 complete day reports and excludes cross-month week content', () => {
  const { store } = setup();
  const sources = [message('september', 'Gehört ausschließlich zu September', '2026-09-30'), ...Array.from({ length: 31 }, (_, index) => message(`oct-${index + 1}`, `Tagesarbeit ${index + 1}`, `2026-10-${String(index + 1).padStart(2, '0')}`)), message('november', 'Gehört ausschließlich zu November', '2026-11-01')];
  store.capture(sources, 'conversation');
  for (let day = 1; day <= 31; day++) apply(store, `day:2026-10-${String(day).padStart(2, '0')}`, `Vollständiger Tagesbericht ${day}: Ergebnis und offene Aufgaben. [oct-${day}]`);
  const input = store.summaryInput('month:2026-10');
  assert.equal(input.records.length, 31); assert.equal(input.inputDocuments.length, 31); assert.equal(input.sourceIds.length, 31);
  assert.ok(input.records.every(record => record.id.startsWith('day:2026-10-')));
  assert.ok(!JSON.stringify(input).includes('ausschließlich'));
  assert.ok(!input.sourceIds.includes('september')); assert.ok(!input.sourceIds.includes('november'));
  assert.ok(input.records.find(record => record.id === 'day:2026-10-01')!.text.includes('Tagesbericht 1:'));
  assert.ok(input.records.find(record => record.id === 'day:2026-10-31')!.text.includes('Tagesbericht 31:'));
});

test('AI reports and exact provenance survive restart, while rebuild preserves AI content', () => {
  const { path, store } = setup(); store.capture([message('one', 'Wir haben Aufgabe A abgeschlossen.')], 'conversation');
  const input = store.summaryInput('day:2026-10-05');
  store.applySummary(input, { content: 'Ergebnis: Aufgabe A abgeschlossen. [one]', model: 'codex-selected-model', citations: ['one'] });
  store.rebuild();
  const document = new MemoryStore(path).snapshot().documents.find(doc => doc.id === input.documentId)!;
  assert.equal(document.content, 'Ergebnis: Aufgabe A abgeschlossen. [one]');
  assert.equal(document.version, input.baseVersion + 1); assert.equal(document.summary!.model, 'codex-selected-model');
  assert.equal(document.summary!.inputHash, input.inputHash); assert.equal(document.summary!.stale, false);
  assert.deepEqual(document.summary!.citations, ['one']); assert.deepEqual(document.sourceIds, ['one']);
  assert.equal(document.history.at(-1)!.reason, 'ai-summary'); assert.deepEqual(document.history.at(-1)!.summary, document.summary);
  assert.equal(JSON.parse(readFileSync(join(path, 'memory.json'), 'utf8')).version, 1); // compatible envelope
});

test('new capture invalidates day and descendants without replacing AI text, and rejects in-flight stale results', () => {
  const { store } = setup(); store.capture([message('one', 'Erster Stand', '2026-09-28')], 'conversation');
  apply(store, 'day:2026-09-28', 'Geprüfter erster Tagesstand. [one]');
  apply(store, 'week:2026-W40', 'Geprüfter erster Wochenstand. [one]');
  apply(store, 'month:2026-09', 'Geprüfter erster Monatsstand. [one]');
  const inFlight = store.summaryInput('day:2026-09-28');
  store.capture([message('two', 'Neue relevante Entscheidung', '2026-09-28')], 'conversation');
  for (const id of ['day:2026-09-28', 'week:2026-W40', 'month:2026-09']) {
    const document = store.snapshot().documents.find(doc => doc.id === id)!;
    assert.equal(document.summary!.stale, true); assert.ok(document.content.startsWith('Geprüfter erster'));
  }
  assert.throws(() => store.applySummary(inFlight, { content: 'Zu spät', model: 'test' }), /inzwischen geändert/);
  assert.throws(() => store.summaryInput('month:2026-09'), /Zuerst/);
  apply(store, 'day:2026-09-28', 'Aktualisierter Tagesstand mit neuer Entscheidung. [two]');
  const monthly = store.summaryInput('month:2026-09');
  assert.ok(monthly.records[0].text.includes('Aktualisierter')); assert.deepEqual(monthly.sourceIds, ['one', 'two']);
  // Month depends on day reports, so the still-stale week cannot contaminate/block it.
  store.applySummary(monthly, { content: 'Aktualisierter Monatsstand. [two]', model: 'test', citations: ['two'] });
  assert.equal(store.snapshot().documents.find(doc => doc.id === monthly.documentId)!.summary!.stale, false);
});

test('user corrections cannot be overwritten; aggregate inputs retain later unincorporated messages explicitly', () => {
  const { store } = setup(); store.capture([message('old', 'Dienstag wäre geplant.')], 'conversation');
  const inFlight = store.summaryInput('day:2026-10-05');
  store.edit('day:2026-10-05', 'Korrektur: Freitag ist vereinbart.', 1);
  assert.throws(() => store.applySummary(inFlight, { content: 'Dienstag ist vereinbart.', model: 'test' }), /korrigiert/);
  store.capture([message('new', 'Zusätzlich ist ein Budget von 500 Euro freigegeben.')], 'conversation');
  assert.ok(!store.planSummaries({ closedOnly: false }).some(job => job.documentId === 'day:2026-10-05'));
  const weekly = store.summaryInput('week:2026-W41');
  assert.equal(weekly.records.length, 2);
  assert.equal(weekly.records[0].edited, true); assert.match(weekly.records[0].text, /Freitag/);
  assert.equal(weekly.records[1].id, 'new'); assert.match(weekly.records[1].text, /500 Euro/);
  assert.ok(!weekly.records.some(row => row.kind === 'source' && row.id === 'old'));
  assert.deepEqual(new Set(weekly.sourceIds), new Set(['old', 'new']));
  assert.throws(() => store.summaryInput('identity'), /Nur vorhandene/);
  assert.throws(() => store.applySummary({ ...inFlight, documentId: 'core' }, { content: 'Nicht erlaubt', model: 'test' }), /Nur vorhandene/);
});

test('unrelated capture does not invalidate a finished period; forged citations and stale child versions do', () => {
  const { store } = setup(); store.capture([message('one', 'Ergebnis A')], 'conversation');
  apply(store, 'day:2026-10-05', 'Ergebnis A. [one]');
  const week = store.summaryInput('week:2026-W41');
  store.capture([message('unrelated', 'Anderer Monat', '2026-11-01')], 'conversation');
  assert.equal(store.snapshot().documents.find(doc => doc.id === 'day:2026-10-05')!.summary!.stale, false);
  assert.throws(() => store.applySummary(week, { content: 'Falscher Beleg', model: 'test', citations: ['unrelated'] }), /unbekannten Quellenbeleg/);
  const day = store.snapshot().documents.find(doc => doc.id === 'day:2026-10-05')!;
  store.edit(day.id, 'Vom Nutzer korrigiertes Ergebnis A.', day.version);
  assert.throws(() => store.applySummary(week, { content: 'Alter Wochenstand', model: 'test', citations: ['one'] }), /inzwischen geändert/);
});

test('explicit German and ISO dates retrieve the exact older report instead of recent lexical matches', () => {
  const { store } = setup();
  store.capture([message('old', 'Früher wurde ein blauer Ordner erstellt.', '2026-02-05'), message('recent', 'Was haben wir an dem Tag gemacht? Diese aktuellen Stichwörter sind irreführend.', '2026-10-31')], 'conversation');
  apply(store, 'day:2026-02-05', 'Tagesbericht: Blauen Projektordner erstellt und die offenen Punkte dokumentiert. [old]');
  for (const query of ['Was haben wir am 05.02.2026 gemacht?', 'Erinnere dich an 2026-02-05.', 'Was war am 5. Februar 2026?']) {
    const result = store.retrieve(query, { maxBytes: 10000 });
    assert.ok(result.retrieval.documentIds.includes('day:2026-02-05')); assert.match(result.text, /Blauen Projektordner/);
    assert.ok(!result.text.includes('irreführend')); assert.ok(!result.retrieval.sourceIds.includes('recent'));
    assert.match(result.text, /openhiatus-memory-read/);
  }
  assert.deepEqual(memoryPeriodsInQuery('am 5. März 2026'), ['day:2026-03-05']);
  assert.deepEqual(memoryPeriodsInQuery('in KW 41 2026'), ['week:2026-W41']);
  assert.deepEqual(memoryPeriodsInQuery('Woche 2026-W41'), ['week:2026-W41']);
  assert.deepEqual(memoryPeriodsInQuery('im Oktober 2026'), ['month:2026-10']);
});

test('an explicitly absent date reports absence and never falls back to a different period', () => {
  const { store } = setup(); store.capture([message('recent', 'Aktuell geheimer Projektname.')], 'conversation');
  const result = store.retrieve('Was passierte am 06.02.2026?');
  assert.match(result.text, /day:2026-02-06.*keine Gedächtnisdaten/);
  assert.ok(!result.text.includes('Projektname')); assert.equal(result.retrieval.sourceIds.length, 0);
  assert.equal(store.readPeriod({ date: '6. Februar 2026' }).found, false);
});

test('period pages reconstruct the complete long report and every original source without byte splits or omissions', () => {
  const { store } = setup();
  const sources = Array.from({ length: 4 }, (_, index) => message(`source-${index}`, `Original ${index}: ` + 'Vollständig äöü🙂 \uFFFD '.repeat(90)));
  store.capture(sources, 'conversation');
  const content = 'Vollständiger Bericht: ' + 'Arbeit und Entscheidung🙂. '.repeat(220);
  store.applySummary(store.summaryInput('day:2026-10-05'), { content, model: 'test', citations: ['source-0', 'source-3'] });
  let cursor: string | undefined; let accumulated = ''; const seen = new Set<string>(); let pages = 0;
  do {
    const page = store.readPeriod({ documentId: 'day:2026-10-05', cursor, maxBytes: 512 });
    assert.ok(Buffer.byteLength(page.text) <= 512); assert.ok(page.text.length > 0); assert.equal(page.sourceCount, 4);
    assert.equal(page.offset, accumulated.length); accumulated += page.text;
    page.sourceIds.forEach(id => seen.add(id)); cursor = page.nextCursor; pages++;
    assert.ok(pages < 200);
  } while (cursor);
  assert.ok(accumulated.includes(content.trim())); for (const source of sources) assert.ok(accumulated.includes(source.text));
  assert.deepEqual(seen, new Set(sources.map(source => source.id))); assert.ok(pages > 10);
  assert.equal(accumulated.split('\uFFFD').length, sources.reduce((sum, source) => sum + source.text.split('\uFFFD').length - 1, 1));
});

test('date retrieval continuation starts at the exact unread report character and cursors invalidate on source changes', () => {
  const { store } = setup(); store.capture([message('one', 'Originalquelle')], 'conversation');
  const content = 'Ergebnisliste: ' + 'Einzelne Entscheidung🙂. '.repeat(400);
  store.applySummary(store.summaryInput('day:2026-10-05'), { content, model: 'test', citations: ['one'] });
  const context = store.retrieve('Was haben wir am 05.10.2026 gemacht?', { maxBytes: 2400 }).text;
  assert.ok(Buffer.byteLength(context) <= 2400);
  const match = context.match(/openhiatus-memory-read (\{[^\n]+\})/); assert.ok(match);
  const request = JSON.parse(match[1]); assert.ok(request.cursor);
  const cursor = JSON.parse(Buffer.from(request.cursor, 'base64url').toString('utf8'));
  const page = store.readPeriod(request); assert.equal(page.offset, cursor.offset);
  store.capture([message('two', 'Nachträgliche Nachricht')], 'conversation');
  assert.throws(() => store.readPeriod(request), /veraltet/);
  assert.throws(() => store.readPeriod({ documentId: '../credentials.json' }), /Ungültige Gedächtnisdatei/);
});

test('M3.0 documents without summary fields remain loadable and queued without rewriting user edits', () => {
  const { path, store } = setup(); store.capture([message('one', 'Alter Auszug')], 'conversation');
  store.edit('day:2026-10-05', 'Alte Nutzerkorrektur', 1);
  const persisted = JSON.parse(readFileSync(join(path, 'memory.json'), 'utf8'));
  assert.ok(persisted.state.documents.every((doc: { summary?: unknown }) => doc.summary === undefined));
  const upgraded = new MemoryStore(path);
  assert.equal(upgraded.snapshot().documents.find(doc => doc.id === 'day:2026-10-05')!.content, 'Alte Nutzerkorrektur');
  assert.ok(upgraded.planSummaries({ closedOnly: false }).some(job => job.kind === 'month'));
  assert.ok(!upgraded.planSummaries({ closedOnly: false }).some(job => job.kind === 'day'));
});

test('a semantic pipeline revision invalidates legacy hashes without changing original sources, report content or history', () => {
  const { path, store } = setup();
  store.capture([message('one', 'Belegtes Ergebnis bleibt unverändert.')], 'conversation');
  const input = store.summaryInput('day:2026-10-05');
  apply(store, input.documentId, 'Vorhandener echter KI-Bericht. [one]');
  assert.ok(!store.planSummaries({ closedOnly: false }).some(job => job.documentId === input.documentId));
  const sha = (value: string) => createHash('sha256').update(value).digest('hex');
  // This is the exact pre-revision fingerprint format, with unchanged input records and sources.
  const legacyHash = sha(JSON.stringify({ documentId: input.documentId, sourceIds: input.sourceIds, records: input.records, inputDocuments: input.inputDocuments,
    sourceHashes: input.sourceIds.map(id => [id, sha(JSON.stringify(store.source(id)))]) }));
  assert.notEqual(legacyHash, input.inputHash);
  const file = join(path, 'memory.json'); const envelope = JSON.parse(readFileSync(file, 'utf8'));
  const document = envelope.state.documents.find((doc: { id: string }) => doc.id === input.documentId);
  document.summary.inputHash = legacyHash; document.history.at(-1).summary.inputHash = legacyHash;
  const originalSources = structuredClone(envelope.state.sources); const originalHistory = structuredClone(document.history);
  const originalFile = JSON.stringify(envelope); writeFileSync(file, originalFile, 'utf8');
  const upgraded = new MemoryStore(path);
  const restored = upgraded.snapshot().documents.find(doc => doc.id === input.documentId)!;
  assert.equal(restored.summary!.stale, true);
  assert.equal(restored.content, document.content); assert.equal(restored.version, document.version);
  assert.deepEqual(restored.history, originalHistory);
  assert.deepEqual(originalSources, originalSources.map((source: { id: string }) => upgraded.source(source.id)));
  assert.ok(upgraded.planSummaries({ closedOnly: false }).some(job => job.documentId === input.documentId));
  assert.equal(readFileSync(file, 'utf8'), originalFile); // read-only migration does not rewrite evidence
  assert.match(upgraded.readPeriod({ documentId: input.documentId }).text, /Aktualisierung ausstehend/);
});
