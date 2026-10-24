import { _electron as electron, expect, type ElectronApplication } from '@playwright/test';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { StateStore, defaultState } from '../src/main/storage';
import { MemoryStore } from '../src/main/memory';

// Isolated, visibly synthetic historical data; no account, microphone or paid provider needed.
await mkdir('.test-data', { recursive: true }); await mkdir('artifacts', { recursive: true });
const profile = await mkdtemp(path.resolve('.test-data/m3-ui-'));
const saved = defaultState();
saved.preferences.speakReplies = false;
saved.preferences.memoryAutoSummarize = false;
saved.messages = [
  { id: 'demo-august', role: 'user', text: 'Synthetischer Test: Für das Projekt Mondgarten haben wir im August blaue Beete gewählt.', at: '2026-08-31T10:00:00.000Z' },
  { id: 'demo-september', role: 'user', text: 'Synthetischer Test: Im September fällt die Entscheidung auf drei Hochbeete aus Holz. Termin ist der 12. Oktober.', at: '2026-09-30T10:00:00.000Z' },
  { id: 'demo-october', role: 'user', text: 'Synthetischer Test: Mira besorgt für Mondgarten die Erde; Jonas prüft die Bewässerung.', at: '2026-10-05T10:00:00.000Z' },
];
new StateStore(profile).save(saved);
const memory = new MemoryStore(path.join(profile, 'Gedächtnis'));
memory.capture(saved.messages, 'synthetic-m3-demo');
// Semantic reports are explicit fixtures, never claimed as real model output. This
// exercises the genuine store format, provenance and renderer without paid calls.
const fixtureModel = 'synthetic-agent-ui-fixture';
const octoberFirst = '# Synthetischer Tagesbericht · erste Fassung\n\nKonkrete Ergebnisse: Für Mondgarten sind die nächsten Zuständigkeiten festgehalten. Mira besorgt die Erde. Jonas prüft die Bewässerung.\n\nOffene Aufgaben: Die Lieferung der Erde und die Prüfung der Bewässerung stehen noch aus. Ein Abschluss wurde in der Originalnachricht nicht bestätigt.\n\nGrenzen der Erinnerung: Für diese Aufgaben wurde am 5. Oktober kein neuer Termin genannt. Der Bericht behauptet keine bereits ausgeführten Arbeiten.';
const octoberLatest = '# Synthetischer Tagesbericht · überarbeitete Fassung\n\nZuständigkeiten: Mira besorgt für Mondgarten die Erde; Jonas prüft die Bewässerung.\n\nStand: Beide Aufgaben sind als nächste Schritte festgehalten. Eine Erledigung ist nicht belegt. Für diese Aufgaben wurde am 5. Oktober kein neuer Termin genannt.\n\nNachvollziehbarkeit: Dieser ausführliche Testbericht bleibt vollständig lesbar, auch wenn die Ausgabe über mehrere Gedächtnisseiten verteilt wird. Die Originalquelle ist unverändert hinterlegt.';
const dayFixtures: Record<string, string> = {
  'day:2026-08-31': '# Synthetischer Tagesbericht\n\nEntscheidung: Für Mondgarten wurden blaue Beete gewählt. Weitere Zuständigkeiten und Termine wurden in dieser Quelle nicht festgelegt.',
  'day:2026-09-30': '# Synthetischer Tagesbericht\n\nEntscheidung: Drei Hochbeete aus Holz sind vorgesehen. Der genannte Termin ist der 12. Oktober. Ein Abschluss ist nicht belegt.',
  'day:2026-10-05': octoberFirst,
};
for (const kind of ['day', 'week', 'month'] as const) {
  for (const document of memory.snapshot().documents.filter(item => item.kind === kind)) {
    const input = memory.summaryInput(document.id);
    memory.applySummary(input, {
      content: kind === 'day' ? dayFixtures[document.id] : kind === 'week'
        ? `# Synthetischer Wochenbericht · ${document.title}\n\nÜbergeordneter Stand: Die dokumentierten Tagesentscheidungen werden zusammengeführt. Zuständigkeiten und offene Punkte bleiben über die verlinkten Tagesberichte nachvollziehbar. Keine unbestätigten Arbeiten gelten als abgeschlossen.`
        : `# Synthetischer Monatsbericht · ${document.title}\n\nLängerfristige Entwicklung: Mondgarten wird schrittweise konkretisiert. Dieser Testbericht bewahrt die belegten Entscheidungen und unterscheidet offene Aufgaben von bestätigten Ergebnissen. Einzelheiten bleiben in den ursprünglichen Tagesberichten erhalten.`,
      model: fixtureModel, citations: input.sourceIds,
    });
  }
}
const firstOctoberVersion = memory.snapshot().documents.find(item => item.id === 'day:2026-10-05')!.version;
// Keep the earlier version as actual input provenance for the existing week/month.
memory.applySummary(memory.summaryInput('day:2026-10-05'), { content: octoberLatest, model: fixtureModel, citations: ['demo-october'] });
const latestOctoberVersion = memory.snapshot().documents.find(item => item.id === 'day:2026-10-05')!.version;
const pending = memory.propose({ documentId: 'core', baseVersion: 1, content: 'Bei Aufgabenlisten zuerst die Zuständigkeit nennen.', reason: 'Synthetischer, noch nicht freigegebener Vorschlag.', sourceIds: ['demo-october'] });
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.OPENHIATUS_TEST_APP || path.resolve('node_modules/electron/dist/electron.exe');
const args = process.env.OPENHIATUS_TEST_APP ? [] : ['.']; args.push(`--data-dir=${profile}`);
let instance: ElectronApplication | undefined;
const errors: string[] = [];
try {
  instance = await electron.launch({ executablePath, args, env, timeout: 30000 });
  const page = await instance.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => Boolean(window.openhiatus));
  const initial = await page.evaluate(() => window.openhiatus.memorySnapshot());
  assert.equal(initial.sourceCount, 3);
  assert.ok(['day', 'week', 'month', 'identity', 'core'].every(kind => initial.documents.some(d => d.kind === kind)));
  assert.equal(initial.documents.find(d => d.id === 'core')!.version, 1);
  assert.equal(initial.proposals.find(p => p.id === pending.id)!.status, 'pending');
  assert.ok(initial.runtimeInstructions?.some(d => d.title.includes('Agent') && d.content.includes('Arbeits')));
  for (const kind of ['day', 'week', 'month']) assert.ok(initial.documents.filter(item => item.kind === kind).every(item => item.summary?.model === fixtureModel));
  const initialOctober = initial.documents.find(item => item.id === 'day:2026-10-05')!;
  assert.equal(initialOctober.content, octoberLatest);
  assert.equal(initialOctober.history.find(item => item.version === firstOctoberVersion)?.content, octoberFirst);
  assert.equal(initial.documents.find(item => item.id === 'week:2026-W41')!.summary!.stale, true);
  const source = await page.evaluate(() => window.openhiatus.memorySource('demo-september'));
  assert.match(source!.text, /12. Oktober/);
  const search = await page.evaluate(() => window.openhiatus.searchMemory('Bewässerung'));
  assert.ok(search.length > 0);
  await page.getByRole('button', { name: 'Gedächtnis', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Gedächtnis/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Berichte aktualisieren', exact: true })).toBeVisible();
  const autoCheckbox = page.getByRole('checkbox', { name: /^Abgeschlossene Zeiträume automatisch aufbereiten/ });
  await expect(autoCheckbox).not.toBeChecked();
  // An isolated profile without configured providers makes preference testing incapable of paid work.
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).connections.agent), { timeout: 30000 }).toBe('missing');
  await expect(page.getByRole('button', { name: 'Berichte aktualisieren', exact: true })).toBeDisabled();
  await page.screenshot({ path: 'artifacts/m3-gedaechtnis.png' });

  await page.locator('#memory-day').fill('05.10.2026');
  await page.getByRole('button', { name: 'Tag nachlesen', exact: true }).click();
  await expect(page.locator('.memory-document h2')).toHaveText('Tag · 2026-10-05');
  await expect(page.locator('.memory-document > .memory-document-text')).toHaveText(octoberLatest);
  await expect(page.locator('.memory-document > .memory-report-provenance')).toContainText('KI-Bericht mit openHiatus');
  await expect(page.locator('.memory-document > .memory-report-provenance')).toContainText(fixtureModel);
  await page.screenshot({ path: 'artifacts/m3-1-tagesbericht.png' });
  await page.locator('#memory-day').fill('04.10.2026');
  await page.getByRole('button', { name: 'Tag nachlesen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Für diesen Tag liegt kein Bericht vor.', exact: true })).toBeVisible();
  await expect(page.locator('.memory-document')).toHaveCount(0); // Never silently substitute a recent day.
  await page.getByRole('button', { name: 'Alle Tage', exact: true }).click();

  await page.getByRole('button', { name: /^Wochen/ }).click();
  await page.locator('.memory-index-item').filter({ hasText: 'Woche · 2026-W41' }).click();
  await expect(page.locator('.memory-document > .memory-report-provenance')).toContainText('Aktualisierung ausstehend');
  const weekInputs = page.locator('.memory-document > details.memory-disclosure').filter({ hasText: 'Verwendete Berichte' }).first();
  await weekInputs.locator(':scope > summary').click();
  const historicalDay = weekInputs.locator('.memory-related-reports > details').filter({ hasText: 'Tag · 2026-10-05' });
  await expect(historicalDay.locator(':scope > summary')).toContainText(`Verwendete Version ${firstOctoberVersion} · aktuell Version ${latestOctoberVersion}`);
  await historicalDay.locator(':scope > summary').click();
  await expect(historicalDay.locator(':scope > pre')).toHaveText(octoberFirst);
  await page.screenshot({ path: 'artifacts/m3-1-wochenbericht-mit-quellen.png' });
  await historicalDay.getByRole('button', { name: 'Aktuelle Fassung öffnen', exact: true }).click();
  await expect(page.locator('.memory-document > .memory-document-text')).toHaveText(octoberLatest);

  await page.getByRole('button', { name: /^Monate/ }).click();
  await page.locator('.memory-index-item').filter({ hasText: 'Monat · 2026-10' }).click();
  await expect(page.locator('.memory-document > .memory-document-text')).toContainText('Längerfristige Entwicklung');
  const monthInputs = page.locator('.memory-document > details.memory-disclosure').filter({ hasText: 'Verwendete Berichte' }).first();
  await monthInputs.locator(':scope > summary').click();
  await expect(monthInputs).toContainText(`Verwendete Version ${firstOctoberVersion}`);
  assert.equal((await page.evaluate(() => window.openhiatus.memorySnapshot())).documents.find(item => item.id === 'day:2026-10-05')!.content, octoberLatest);

  const pages = await page.evaluate(async () => {
    const result = []; let cursor: string | undefined;
    do {
      const next = await window.openhiatus.readMemoryPeriod({ date: '05.10.2026', maxBytes: 512, ...(cursor ? { cursor } : {}) });
      result.push(next); cursor = next.nextCursor;
      if (result.length > 30) throw new Error('Synthetic period paging did not terminate.');
    } while (cursor);
    return result;
  });
  assert.ok(pages.length > 1);
  let expectedOffset = 0;
  for (const entry of pages) {
    assert.equal(entry.found, true); assert.equal(entry.documentId, 'day:2026-10-05');
    assert.equal(entry.offset, expectedOffset); expectedOffset += entry.text.length;
    assert.ok(Buffer.byteLength(entry.text) <= 512); assert.ok(!entry.text.includes('\uFFFD'));
    assert.equal(entry.sourceCount, 1);
  }
  const wholePeriod = pages.map(entry => entry.text).join('');
  assert.ok(wholePeriod.includes(octoberLatest));
  assert.ok(wholePeriod.includes(saved.messages.find(item => item.id === 'demo-october')!.text));
  assert.deepEqual([...new Set(pages.flatMap(entry => entry.sourceIds))], ['demo-october']);
  assert.equal(Buffer.byteLength(wholePeriod), pages[0].totalBytes);
  const absentPeriod = await page.evaluate(() => window.openhiatus.readMemoryPeriod({ date: '04.10.2026' }));
  assert.equal(absentPeriod.found, false); assert.equal(absentPeriod.documentId, 'day:2026-10-04');
  assert.deepEqual(absentPeriod.sourceIds, []); assert.ok(!absentPeriod.text.includes('Mira'));
  // This controlled input receives its new value through the asynchronous IPC snapshot.
  // Wait for that confirmation rather than assuming it is set inside the click event.
  await autoCheckbox.click();
  await expect(autoCheckbox).toBeChecked();
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).preferences.memoryAutoSummarize)).toBe(true);
  assert.equal((await page.evaluate(() => window.openhiatus.snapshot())).summary?.calls, 0);

  await page.getByRole('button', { name: 'Technische Vorgaben', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Agent-Anweisungen/ })).toBeVisible();
  await page.screenshot({ path: 'artifacts/m3-laufzeitvorgaben.png' });
  await page.getByRole('button', { name: 'Agent & Nutzer', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Frühere Hintergrundnotiz anzeigen', exact: true }).check();
  await page.locator('.memory-index-item').filter({ hasText: 'Frühere Hintergrundnotiz' }).click();
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await page.locator('#memory-document-editor').fill('Ich bin openHiatus. Ich antworte auf Deutsch und nenne Unsicherheit klar.');
  // A navigation roundtrip must not lose an unsaved identity edit.
  await page.getByRole('button', { name: 'Gespräch', exact: true }).click();
  await page.getByRole('button', { name: 'Gedächtnis', exact: true }).click();
  await expect(page.locator('#memory-document-editor')).toHaveValue('Ich bin openHiatus. Ich antworte auf Deutsch und nenne Unsicherheit klar.');
  await page.getByRole('button', { name: 'Änderung speichern', exact: true }).click();
  await expect(page.locator('#memory-document-editor')).toHaveCount(0);

  // Cross-process guards: a stale renderer cannot overwrite a newer version, and an
  // arbitrary IPC caller cannot treat unknown decision strings as approval.
  const edited = await page.evaluate(() => window.openhiatus.memorySnapshot());
  assert.equal(edited.documents.find(d => d.id === 'identity')!.version, 2);
  const stale = await page.evaluate(async () => {
    try { await window.openhiatus.editMemory('identity', 'Veraltete Änderung', 1); return false; } catch { return true; }
  });
  assert.equal(stale, true);
  await page.evaluate(() => window.openhiatus.newConversation());
  assert.equal((await page.evaluate(() => window.openhiatus.snapshot())).messages.length, 0);
  assert.equal((await page.evaluate(() => window.openhiatus.memorySnapshot())).sourceCount, 3);
  await page.getByRole('button', { name: /^Vorschläge/ }).click();
  await expect(page.getByText('Synthetischer, noch nicht freigegebener Vorschlag.')).toBeVisible();
  await page.screenshot({ path: 'artifacts/m3-kernvorschlag.png' });
  await page.getByRole('button', { name: 'Genau diese Fassung freigeben', exact: true }).click();
  await expect.poll(async () => (await page.evaluate(() => window.openhiatus.memorySnapshot())).proposals.find(p => p.id === pending.id)?.status).toBe('approved');
  const approved = await page.evaluate(() => window.openhiatus.memorySnapshot());
  assert.equal(approved.documents.find(d => d.id === 'core')!.version, 2);
  assert.equal(approved.proposals.find(p => p.id === pending.id)!.status, 'approved');
  const day = approved.documents.find(d => d.kind === 'day' && d.sourceIds.includes('demo-september'))!;
  await page.evaluate(d => window.openhiatus.editMemory(d.id, 'Korrektur durch den Nutzer: Der Termin ist der 14. Oktober.', d.version), day);
  const rebuilt = await page.evaluate(() => window.openhiatus.rebuildMemory());
  assert.match(rebuilt.documents.find(d => d.id === day.id)!.content, /14. Oktober/);
  assert.equal(rebuilt.documents.find(d => d.id === 'core')!.version, 2);
  await page.keyboard.press('Escape');
  assert.equal((await page.evaluate(() => window.openhiatus.snapshot())).task.status, 'idle');
  await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 760));
  await page.getByRole('button', { name: 'Erinnerungen', exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: 'artifacts/m3-gedaechtnis-kompakt.png' });
  assert.deepEqual(errors, []);
  await instance.close(); instance = undefined;
  instance = await electron.launch({ executablePath, args, env, timeout: 30000 });
  const restarted = await instance.firstWindow();
  await restarted.waitForFunction(() => Boolean(window.openhiatus));
  const restored = await restarted.evaluate(() => window.openhiatus.memorySnapshot());
  assert.equal(restored.sourceCount, 3);
  assert.equal(restored.documents.find(d => d.id === 'identity')!.version, 2);
  assert.equal(restored.documents.find(d => d.id === 'core')!.version, 2);
  assert.equal(restored.proposals.find(p => p.id === pending.id)!.status, 'approved');
  assert.equal((await restarted.evaluate(() => window.openhiatus.snapshot())).messages.length, 0);
  assert.equal((await restarted.evaluate(() => window.openhiatus.snapshot())).preferences.memoryAutoSummarize, true);
  assert.equal((await restarted.evaluate(() => window.openhiatus.snapshot())).summary?.calls, 0);
  assert.equal(restored.documents.find(item => item.id === 'day:2026-10-05')!.content, octoberLatest);
  assert.equal(restored.documents.find(item => item.id === 'day:2026-10-05')!.summary?.model, fixtureModel);
  await restarted.getByRole('button', { name: 'Gedächtnis', exact: true }).click();
  await expect(restarted.getByRole('checkbox', { name: /^Abgeschlossene Zeiträume automatisch aufbereiten/ })).toBeChecked();
  const disk = await readFile(restored.storagePath, 'utf8');
  assert.ok(disk.includes('Bewässerung') && disk.includes('Zuständigkeit'));
  console.log(JSON.stringify({ status: 'passed', profile, sources: restored.sourceCount,
    checks: ['historical migration across day/week/month', 'synthetic semantic report provenance', 'exact date UI lookup with no missing-date fallback', 'historical report input versions', 'complete period read across bounded UTF-8 pages', 'automatic preference persistence without provider calls', 'exact sources and local search', 'identity version and stale edit rejection', 'pending core approval', 'new conversation preserves archive', 'manual correction survives rebuild', 'Escape in memory view', 'compact layout', 'restart persists history and approval', 'UTF-8'] }, null, 2));
} finally { if (instance) await instance.close(); }
