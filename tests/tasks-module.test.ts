import test from 'node:test';
import assert from 'node:assert/strict';
import { BackgroundTaskCoordinator, type BackgroundTaskPorts, type TaskAdmission } from '../src/main/modules/tasks';
import type { AgentAdapter, AgentEvent, BackgroundJob, Message, SpeechCue } from '../src/shared/contracts';
import type { CoreProposalInput, MemoryPeriodPage } from '../src/shared/memory';
import { parseMemoryReply } from '../src/main/instructions';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
class Worker implements AgentAdapter {
  runs: Array<{ text: string; model: string; threadId?: string }> = [];
  stops = 0; disposals = 0; managed = true;
  stopResult: () => Promise<void> = async () => {};
  constructor(readonly createdJob: BackgroundJob, readonly emit: (event: AgentEvent) => void) {}
  async start() {}
  async run(text: string, model: string, threadId?: string) {
    this.runs.push({ text, model, threadId });
    this.emit({ type: 'started', threadId: threadId ?? `thread-${this.createdJob.id}`, turnId: `turn-${this.runs.length}` });
  }
  async stop() { this.stops++; await this.stopResult(); }
  async dispose() { this.disposals++; }
  async hasManagedWork() { return this.managed; }
  async steer() {}
  finish(text = 'Geprüftes Ergebnis.') { this.emit({ type: 'completed', status: 'completed', text }); }
}
function fixture(initial: BackgroundJob[] = []) {
  const workers: Worker[] = [], messages: Message[] = [], proposals: CoreProposalInput[] = [], archived = new Set<string>();
  const cues: Array<{ text: string; jobId: string; kind?: SpeechCue['kind'] }> = [], activities: Array<{ title: string; detail?: string }> = [], frames: string[] = [];
  let projection: BackgroundJob[] = [], saved: BackgroundJob[] = [], failSave = false, now = 1000;
  const settings = { model: 'worker-model', progressSpeech: true };
  const core = { id: 'core', version: 1, content: 'Vorliebe vor Annahme.' };
  let page: MemoryPeriodPage = { found: true, documentId: 'day:2026-10-04', text: 'Historische Originaldaten.', sourceIds: ['historical'], sourceCount: 1, offset: 0, totalBytes: 27, nextCursor: 'page-two' };
  const ports: BackgroundTaskPorts = {
    createWorker(emit, job) {
      assert.equal(saved.find(item => item.id === job.id)?.status, 'running', 'worker creation follows durable admission');
      const worker = new Worker(job, emit); workers.push(worker); return worker;
    },
    access: { assertFullAccess() {}, blocked: () => false }, settings: () => settings,
    context: { skills: () => '[Bekannter Skill]', capabilities: () => 'Aktuelle Fähigkeiten.', favorites: () => 'Bevorzugte Anleitungen.' },
    memory: {
      documents: () => [structuredClone(core)], retrieve: () => 'Belegter Gedächtnisauszug.', readPeriod: () => structuredClone(page),
      propose(input) {
        assert.ok(input.sourceIds?.every(id => archived.has(id)), 'result provenance must be archived before proposing');
        proposals.push(structuredClone(input)); return { ...input, id: `proposal-${proposals.length}`, sourceIds: input.sourceIds ?? [], status: 'pending', createdAt: 'now' };
      },
    },
    parseReply: text => ({ text, proposals: [], errors: [] }),
    journal: {
      publish: jobs => { projection = jobs; },
      persist() { if (failSave) throw new Error('Datenträger voll'); saved = structuredClone(projection); },
      changed() { if (!failSave) saved = structuredClone(projection); },
      appendMessage: message => { messages.push(message); }, capture: () => { for (const message of messages) archived.add(message.id); },
    },
    effects: {
      clean: text => text.replaceAll('synthetic-secret', '[entfernt]'), activity: (_kind, title, detail) => { activities.push({ title, detail }); },
      speak: (text, jobId, kind) => { cues.push({ text, jobId, kind }); }, frame: frame => { frames.push(frame.frameId); }, idle() {},
    }, now: () => now,
  };
  const tasks = new BackgroundTaskCoordinator(initial, ports);
  const admission = (requestId: string, resources = [`C:\\${requestId}`]): TaskAdmission => {
    const sourceMessageId = `user-${requestId}`; archived.add(sourceMessageId);
    return { requestId, sourceMessageId, title: `Aufgabe ${requestId}`, prompt: `Unveränderter Originalauftrag ${requestId}.`, resources };
  };
  return { tasks, ports, settings, core, workers, messages, proposals, cues, activities, frames, admission,
    projection: () => projection, failSave: (value: boolean) => { failSave = value; }, advance: (ms: number) => { now += ms; }, page: (value: MemoryPeriodPage) => { page = value; } };
}
const read = '```openhiatus-memory-read\n{"documentId":"day:2026-10-04"}\n```';
function delayedWrites(f: ReturnType<typeof fixture>) {
  const persist = f.ports.journal.persist;
  const writes: Array<{ jobs: BackgroundJob[]; release(): void; fail(error: Error): void }> = [];
  f.ports.journal.persist = () => new Promise<void>((resolve, reject) => {
    writes.push({ jobs: structuredClone(f.projection()), release() { persist(); resolve(); }, fail: reject });
  });
  return writes;
}

test('task admission preserves the complete original and owns all returned and worker-factory job views', async () => {
  const f = fixture(); const input = f.admission('one'); input.prompt = 'A'.repeat(26000) + ' Ende der unveränderten Autorisierung.';
  input.history = [{ role: 'user', text: 'Historische Daten.' }];
  const accepted = await f.tasks.accept(input); accepted.job.resources.push('C:\\foreign'); accepted.job.prompt = 'mutated';
  await tick();
  assert.equal(f.workers.length, 1);
  const actual = f.tasks.get(accepted.job.id);
  assert.ok(actual.prompt.endsWith(input.prompt)); assert.ok(actual.prompt.length <= 32000);
  assert.deepEqual(actual.resources, ['C:\\one']);
  assert.ok(actual.identityInstructions?.includes('Vorliebe vor Annahme.'));
  f.workers[0].createdJob.resources.push('C:\\factory-mutation');
  const projection = f.projection(); projection[0].status = 'interrupted';
  assert.equal(f.tasks.get(accepted.job.id).status, 'running'); assert.deepEqual(f.tasks.get(accepted.job.id).resources, ['C:\\one']);
  await f.tasks.dispose();
});

test('desktop model, Fast and image scale are captured before asynchronous admission and never borrowed from later settings', async () => {
  const f = fixture();
  const settings = { model: 'sol', progressSpeech: false, computerDelegationEnabled: true,
    computerModel: 'chatgpt/gpt-6-luna', computerFast: true, computerOverviewScaleDivisor: 16,
    computerDetailScaleDivisor: 2, computerImageRetentionCalls: 3, computerWorkingMemoryCalls: 15 };
  f.ports.settings = () => settings;
  const pending = f.tasks.accept(f.admission('computer'));
  settings.computerModel = 'different'; settings.computerFast = false; settings.computerOverviewScaleDivisor = 4;
  settings.computerDetailScaleDivisor = 4; settings.computerImageRetentionCalls = 10; settings.computerWorkingMemoryCalls = 0;
  const accepted = await pending; await tick();
  const expected = { delegationEnabled: true, model: 'chatgpt/gpt-6-luna', fast: true, overviewScaleDivisor: 16,
    detailScaleDivisor: 2, imageRetentionCalls: 3, workingMemoryCalls: 15 };
  assert.deepEqual(accepted.job.computer, expected);
  assert.deepEqual(f.workers[0].createdJob.computer, expected);
  accepted.job.computer!.model = 'changed externally';
  assert.deepEqual(f.tasks.get(accepted.job.id).computer, expected);
  await f.tasks.dispose();
});

test('direct computer jobs freeze legacy image defaults and independently selected image settings', async () => {
  const f = fixture();
  const legacy = await f.tasks.accept(f.admission('legacy-images')); await tick();
  assert.deepEqual(legacy.job.computer, { delegationEnabled: false, model: '', fast: true, overviewScaleDivisor: 1,
    detailScaleDivisor: 1, imageRetentionCalls: 0, workingMemoryCalls: 0 });
  f.ports.settings = () => ({ ...f.settings, computerDetailScaleDivisor: 2, computerImageRetentionCalls: 3, computerWorkingMemoryCalls: 10 });
  const selected = await f.tasks.accept(f.admission('selected-images')); await tick();
  assert.equal(selected.job.computer!.delegationEnabled, false);
  assert.equal(selected.job.computer!.detailScaleDivisor, 2); assert.equal(selected.job.computer!.imageRetentionCalls, 3);
  assert.equal(f.tasks.get(legacy.job.id).computer!.imageRetentionCalls, 0);
  assert.equal(selected.job.computer!.workingMemoryCalls, 10);
  assert.equal(f.tasks.get(legacy.job.id).computer!.workingMemoryCalls, 0);
  await f.tasks.dispose();
});

test('invalid image settings fail before durable task admission or worker creation', async () => {
  const f = fixture();
  for (const patch of [{ computerDetailScaleDivisor: 3 }, { computerDetailScaleDivisor: NaN },
    { computerImageRetentionCalls: -1 }, { computerImageRetentionCalls: 11 }, { computerImageRetentionCalls: 2.5 },
    { computerWorkingMemoryCalls: -1 }, { computerWorkingMemoryCalls: 1 }, { computerWorkingMemoryCalls: 14 },
    { computerWorkingMemoryCalls: 16 }, { computerWorkingMemoryCalls: 1.5 }]) {
    f.ports.settings = () => ({ ...f.settings, ...patch });
    await assert.rejects(f.tasks.accept(f.admission('invalid-images')));
    assert.equal(f.projection().length, 0); assert.equal(f.workers.length, 0);
  }
  await f.tasks.dispose();
});

test('planner and cumulative computer usage combine once across subtasks and resumed turns; request tiers stay separate', async () => {
  const f = fixture(); const accepted = await f.tasks.accept(f.admission('metrics')); await tick();
  const worker = f.workers[0], count = (inputTokens: number) => ({ inputTokens, outputTokens: 1, cacheReadTokens: 2, cacheWriteTokens: 0 });
  worker.emit({ type: 'usage', usage: count(100) });
  worker.emit({ type: 'computer-usage', usage: count(10) });
  worker.emit({ type: 'usage', usage: count(150) });
  worker.emit({ type: 'computer-usage', usage: count(30) });
  assert.equal(f.tasks.get(accepted.job.id).usage!.inputTokens, 180);
  const request = { role: 'computer' as const, model: 'chatgpt/gpt-6-luna', requestedServiceTier: 'fast' as const,
    elapsedMs: 1200, status: 'completed' as const, usage: count(10) };
  worker.emit({ type: 'model-request', request: { ...request, actualServiceTier: 'fast' } });
  worker.emit({ type: 'model-request', request: { ...request, actualServiceTier: 'default', status: 'failed' } });
  worker.emit({ type: 'model-request', request });
  worker.emit({ type: 'model-request', request: { ...request, actualServiceTier: 'fast' } });
  let actual = f.tasks.get(accepted.job.id);
  assert.equal(actual.usage!.inputTokens, 180, 'request diagnostics never count usage twice');
  assert.deepEqual(actual.modelRequests!.map(row => [row.actualServiceTier, row.requests, row.completed, row.failed, row.elapsedMs, row.usage!.inputTokens]),
    [['fast', 2, 2, 0, 2400, 20], ['default', 1, 0, 1, 1200, 10], [undefined, 1, 1, 0, 1200, 10]]);
  worker.emit({ type: 'started', threadId: actual.threadId!, turnId: 'resumed-turn' });
  worker.emit({ type: 'usage', usage: count(20) });
  worker.emit({ type: 'computer-usage', usage: count(5) });
  actual = f.tasks.get(accepted.job.id);
  assert.equal(actual.usage!.inputTokens, 205);
  worker.finish();
  worker.emit({ type: 'computer-usage', usage: count(9999) });
  assert.equal(f.tasks.get(accepted.job.id).usage!.inputTokens, 205);
  await f.tasks.dispose();
});

test('failed admission and queued steering restore both owned state and the published job projection', async () => {
  const f = fixture(); f.failSave(true);
  await assert.rejects(f.tasks.accept(f.admission('retry')), /Datenträger/);
  assert.equal(f.tasks.snapshot().length, 0); assert.equal(f.projection().length, 0); assert.equal(f.workers.length, 0);
  f.failSave(false); await f.tasks.accept(f.admission('retry', ['C:\\same'])); await tick();
  const second = await f.tasks.accept(f.admission('queued', ['C:\\same'])); await tick();
  const before = f.tasks.get(second.job.id); assert.equal(before.status, 'queued');
  f.failSave(true); await assert.rejects(f.tasks.steer(second.job.id, 'Zusätzliche Änderung.', ['C:\\additional']), /Datenträger/);
  assert.deepEqual(f.tasks.get(second.job.id), before);
  assert.deepEqual(f.projection().find(job => job.id === second.job.id), before);
  f.failSave(false); await f.tasks.dispose();
});

test('parallel results retain each admitted memory version and archive job-specific provenance before proposing', async () => {
  const f = fixture(); f.ports.parseReply = text => JSON.parse(text);
  const firstPending = f.tasks.accept(f.admission('first')); f.core.version = 2; f.core.content = 'Spätere Vorliebe.';
  const secondPending = f.tasks.accept(f.admission('second')); f.settings.model = 'later-model';
  const [first, second] = await Promise.all([firstPending, secondPending]); await tick();
  const reply = (baseVersion: number) => JSON.stringify({ text: 'Vorschlag zur Prüfung.', proposals: [{ documentId: 'core', baseVersion, content: 'Eine gewünschte Vorliebe.', reason: 'Ausdrücklich gewünscht.' }], errors: [] });
  f.workers[0].finish(reply(1)); f.workers[1].finish(reply(2));
  await f.tasks.settleMemory();
  assert.equal(f.proposals.length, 2);
  for (const [index, accepted, source] of [[0, first, 'user-first'], [1, second, 'user-second']] as const) {
    const answer = f.messages.find(message => message.jobId === accepted.job.id)!;
    assert.deepEqual(f.proposals[index].sourceIds, [source, answer.id]);
    assert.equal(f.proposals[index].baseVersion, index + 1); assert.equal(f.workers[index].runs[0].model, 'worker-model');
    assert.ok(!answer.text.includes('baseVersion')); assert.equal(f.tasks.get(accepted.job.id).result, 'Vorschlag zur Prüfung.');
  }
  const forged = await f.tasks.accept(f.admission('forged')); await tick(); f.workers[2].finish(reply(99));
  await f.tasks.settleMemory();
  assert.equal(f.proposals.length, 2); assert.equal(f.tasks.get(forged.job.id).status, 'completed');
  assert.ok(f.activities.some(item => item.title === 'Gedächtnisvorschlag wurde nicht übernommen'));
  await f.tasks.dispose();
});

test('progress, frames and final speech remain attributed to their job and late stopped output is discarded', async () => {
  const f = fixture(); const first = await f.tasks.accept(f.admission('first')); const second = await f.tasks.accept(f.admission('second')); await tick();
  f.workers[0].emit({ type: 'commentary', text: 'Ein geprüfter Zwischenstand synthetic-secret.', itemId: 'progress' });
  f.workers[0].emit({ type: 'commentary', text: 'Ein geprüfter Zwischenstand synthetic-secret.', itemId: 'progress' });
  f.workers[1].emit({ type: 'commentary', text: 'Zweiter Zwischenstand.' });
  assert.equal(f.cues.length, 2); assert.ok(f.cues.every(cue => cue.kind === 'progress'));
  assert.ok(f.cues[0].text.startsWith('Aufgabe first:')); assert.ok(!f.cues[0].text.includes('synthetic-secret'));
  const frame = { dataUrl: 'data:image/png;base64,YQ==', frameId: 'one', width: 1, height: 1, at: 'now' };
  f.workers[0].emit({ type: 'computer-frame', frame }); await f.tasks.stop(first.job.id);
  f.advance(20000); f.workers[0].emit({ type: 'commentary', text: 'Verspäteter Fortschritt.' }); f.workers[0].emit({ type: 'computer-frame', frame }); f.workers[0].finish('Verspätetes Ergebnis.');
  assert.equal(f.cues.length, 2); assert.deepEqual(f.frames, ['one']); assert.equal(f.messages.length, 0);
  f.workers[1].finish('Geprüftes Ergebnis synthetic-secret.');
  assert.equal(f.cues.at(-1)?.jobId, second.job.id); assert.equal(f.messages[0].jobId, second.job.id);
  assert.ok(!f.messages[0].text.includes('synthetic-secret')); await f.tasks.dispose();
});

test('a medium-length task answer speaks its result and uncertainty instead of replacing it with a pointer', async () => {
  const f = fixture(); const accepted = await f.tasks.accept(f.admission('version-check')); await tick();
  const result = 'Nein, die installierte CLI-Version 1.2.3 ist nicht aktuell; angeboten wird 1.2.4. '
    + 'Die Version der Windows-App habe ich noch nicht geprüft. '
    + 'Der Vergleich bezieht sich ausschließlich auf die überprüfte CLI-Installation. '
    + 'Ein Update wurde nicht gestartet und keine laufende Sitzung verändert. '
    + 'Die Anmeldung ist davon unabhängig und muss für eine reine Versionsprüfung nicht erneuert werden. '
    + 'Die App kann einen eigenen Aktualisierungsweg verwenden; daraus folgt kein bestätigter App-Stand.';
  assert.ok(result.length > 450 && result.length < 1200);
  f.workers[0].finish(result); await tick();
  assert.equal(f.tasks.get(accepted.job.id).result, result);
  assert.equal(f.messages[0].text, `Aufgabe version-check\n\n${result}`);
  assert.equal(f.cues.at(-1)?.text, result);
  assert.ok(f.cues.at(-1)!.text.length <= 500);
  assert.equal(f.cues.at(-1)?.jobId, accepted.job.id);
  await f.tasks.dispose();
});

test('long task results keep a useful spoken opening while full detail and secret scrubbing remain in the journal', async () => {
  const f = fixture(); const accepted = await f.tasks.accept(f.admission('long-result')); await tick();
  const lead = 'Die Prüfung ist abgeschlossen. Ein Teil der Angaben konnte nicht bestätigt werden.';
  const result = `${lead}\n\n## Einzelheiten\n${'Ein zusätzlicher geprüfter Detailpunkt. '.repeat(80)}synthetic-secret`;
  f.workers[0].finish(result); await tick();
  const cue = f.cues.at(-1)!;
  assert.ok(cue.text.startsWith(`Aufgabe long-result: ${lead}`));
  assert.ok(cue.text.length <= 500 && cue.text.length < result.length);
  assert.ok(!cue.text.includes('synthetic-secret'));
  assert.ok(f.messages[0].text.includes('Einzelheiten') && f.messages[0].text.includes('[entfernt]'));
  assert.equal(f.tasks.get(accepted.job.id).result, result.replaceAll('synthetic-secret', '[entfernt]'));
  await f.tasks.dispose();
});

test('failed task speech includes the actual failure reason even when its details are long', async () => {
  const f = fixture(); const accepted = await f.tasks.accept(f.admission('failed-result')); await tick();
  const reason = 'Die Verbindung konnte nicht bestätigt werden. Es wurde keine Änderung ausgeführt.';
  const error = `${reason} ${'Weitere technische Einzelheiten zum Fehler. '.repeat(80)}`;
  f.workers[0].emit({ type: 'completed', status: 'failed', error }); await tick();
  assert.equal(f.tasks.get(accepted.job.id).status, 'failed');
  assert.ok(f.cues.at(-1)?.text.startsWith(`Aufgabe failed-result: Die Aufgabe wurde nicht abgeschlossen. ${reason}`));
  assert.ok(f.cues.at(-1)!.text.length <= 500);
  assert.ok(f.messages[0].text.includes(error));
  await f.tasks.dispose();
});

test('a task uses the model-authored speech field independently of the full written answer', async () => {
  const f = fixture(); f.ports.parseReply = parseMemoryReply;
  const accepted = await f.tasks.accept(f.admission('structured-result')); await tick();
  const spoken = 'Die CLI ist nicht aktuell. Die Windows-App konnte ich noch nicht prüfen.';
  const text = `## Vollständiger Prüfbericht\n\n${'Ein nachvollziehbarer technischer Detailpunkt. '.repeat(80)}\n\n${spoken}`;
  f.workers[0].finish('```openhiatus-reply\n' + JSON.stringify({ spoken, text }) + '\n```'); await tick();
  assert.equal(f.cues.at(-1)?.text, spoken);
  assert.equal(f.cues.at(-1)?.jobId, accepted.job.id);
  assert.equal(f.tasks.get(accepted.job.id).result, text);
  assert.equal(f.messages[0].text, `Aufgabe structured-result\n\n${text}`);
  assert.ok(!f.messages[0].text.includes('openhiatus-reply'));
  await f.tasks.dispose();
});

test('a task accepts the 450-to-500 character margin and excessive speech never aborts the result', async () => {
  const f = fixture(); f.ports.parseReply = parseMemoryReply;
  const first = await f.tasks.accept(f.admission('speech-margin')); await tick();
  const spoken = 'Nein, dieser Stand ist nicht bestätigt. ' + 'Eine weitere Prüfung ist erforderlich. '.repeat(11);
  assert.ok(spoken.trim().length > 450 && spoken.trim().length <= 500);
  f.workers[0].finish('```openhiatus-reply\n' + JSON.stringify({ spoken, text: 'Vollständige Prüfdetails.' }) + '\n```'); await tick();
  assert.equal(f.cues.at(-1)?.text, spoken.trim());
  assert.equal(f.tasks.get(first.job.id).status, 'completed');
  const second = await f.tasks.accept(f.admission('speech-overflow')); await tick();
  f.workers[1].finish('```openhiatus-reply\n' + JSON.stringify({ spoken: spoken.repeat(5), text: 'Weitere vollständige Prüfdetails.' }) + '\n```'); await tick();
  assert.equal(f.tasks.get(second.job.id).status, 'completed');
  assert.ok(f.cues.at(-1)!.text.length <= 500);
  assert.ok(f.cues.at(-1)?.text.includes('nicht bestätigt'));
  assert.ok(f.messages.at(-1)?.text.endsWith('Weitere vollständige Prüfdetails.'));
  await f.tasks.dispose();
});

test('decoded structured task fields are scrubbed again before journaling or speaking', async () => {
  const f = fixture(); f.ports.parseReply = parseMemoryReply;
  const accepted = await f.tasks.accept(f.admission('encoded-secret')); await tick();
  const encoded = [...'synthetic-secret'].map(c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join('');
  const raw = '```openhiatus-reply\n' + JSON.stringify({ spoken: 'Ergebnis synthetic-secret.', text: 'Geprüfter Text synthetic-secret.' }).replaceAll('synthetic-secret', encoded) + '\n```';
  f.workers[0].finish(raw); await tick();
  assert.ok(f.messages[0].text.includes('[entfernt]'));
  assert.ok(!JSON.stringify(f.messages).includes('synthetic-secret'));
  assert.ok(!f.tasks.get(accepted.job.id).result?.includes('synthetic-secret'));
  assert.equal(f.cues.at(-1)?.text, 'Ergebnis [entfernt].');
  await f.tasks.dispose();
});

test('failed tasks never read an unreadable reply envelope as their error reason', async () => {
  const f = fixture(); f.ports.parseReply = parseMemoryReply;
  const accepted = await f.tasks.accept(f.admission('invalid-failure')); await tick();
  f.workers[0].emit({ type: 'completed', status: 'failed', text: '{"spoken":invalid,"text":"rawProtocol"}' }); await tick();
  assert.equal(f.tasks.get(accepted.job.id).status, 'failed');
  const cue = f.cues.at(-1)!.text;
  assert.ok(cue.includes('nicht abgeschlossen') && cue.includes('nicht vollständig aufbereitet'));
  assert.ok(!cue.includes('rawProtocol') && !cue.includes('spoken'));
  await f.tasks.dispose();
});

test('archive paging stays within the same worker and duplicate pages fail only their owning job', async () => {
  const f = fixture(); const first = await f.tasks.accept(f.admission('first')); const second = await f.tasks.accept(f.admission('second')); await tick();
  f.workers[0].finish(read); await tick();
  assert.equal(f.workers[0].runs.length, 2); assert.equal(f.workers[0].runs[1].threadId, `thread-${first.job.id}`);
  assert.ok(f.workers[0].runs[1].text.includes('page-two')); assert.equal(f.tasks.get(first.job.id).status, 'running'); assert.equal(f.messages.length, 0);
  f.workers[0].finish(read); await tick();
  assert.equal(f.tasks.get(first.job.id).status, 'failed'); assert.equal(f.tasks.get(second.job.id).status, 'running');
  assert.ok(f.messages[0].text.includes('erneut angefordert')); assert.ok(!JSON.stringify(f.messages).includes('openhiatus-memory-read'));
  await f.tasks.dispose();
});

test('global Stop invalidates a queued archive continuation and an unconfirmed stop blocks admission until retry', async () => {
  const f = fixture(); const accepted = await f.tasks.accept(f.admission('one')); await tick();
  f.workers[0].finish(read); f.workers[0].stopResult = async () => { throw new Error('Ende unbestätigt'); };
  await assert.rejects(f.tasks.stopAll(), /unbestätigt/); await tick();
  assert.equal(f.workers[0].runs.length, 1); assert.equal(f.tasks.get(accepted.job.id).status, 'stopping');
  await assert.rejects(f.tasks.accept(f.admission('too-early')), /beendet/);
  f.workers[0].stopResult = async () => {}; await f.tasks.stopAll();
  assert.equal(f.tasks.get(accepted.job.id).status, 'interrupted');
  await f.tasks.accept(f.admission('retry')); await tick(); assert.equal(f.workers.length, 2);
  await f.tasks.dispose();
});

test('restart recovers task history without workers and disposal owns retained runtimes without replaying queued work', async () => {
  const f = fixture(); const first = await f.tasks.accept(f.admission('completed')); await tick(); f.workers[0].finish(); await tick();
  assert.equal(f.tasks.get(first.job.id).runtimeRetained, true);
  await f.tasks.accept(f.admission('running')); await tick();
  const recovered = fixture(f.tasks.snapshot()); await tick();
  assert.equal(recovered.workers.length, 0); assert.equal(recovered.tasks.snapshot()[0].status, 'completed'); assert.equal(recovered.tasks.snapshot()[1].status, 'interrupted');
  assert.ok(recovered.tasks.snapshot().every(job => job.runtimeRetained === false));
  let release!: () => void; f.workers[1].stopResult = () => new Promise<void>(resolve => { release = resolve; });
  const disposal = f.tasks.dispose(); assert.equal(f.tasks.dispose(), disposal);
  assert.equal(f.workers[0].stops, 1); assert.equal(f.workers[1].stops, 1);
  await assert.rejects(f.tasks.accept(f.admission('closed')), /beendet/);
  release(); await disposal;
  assert.ok(f.workers.every(worker => worker.disposals === 1)); assert.ok(f.tasks.snapshot().every(job => job.runtimeRetained === false));
  await recovered.tasks.dispose();
});

test('pending admissions are FIFO and duplicates share failure before a later request is admitted', async () => {
  const f = fixture(), writes = delayedWrites(f); let repeatedSettled = false;
  const first = f.tasks.accept(f.admission('first')), repeated = f.tasks.accept(f.admission('first'));
  const later = f.tasks.accept(f.admission('later'));
  void repeated.then(() => { repeatedSettled = true; }, () => { repeatedSettled = true; });
  const failed = Promise.all([assert.rejects(first, /Schreibfehler/), assert.rejects(repeated, /Schreibfehler/)]);
  await tick(); assert.equal(writes.length, 1); assert.equal(f.tasks.busy(), true); assert.equal(repeatedSettled, false); assert.equal(f.workers.length, 0);
  writes[0].fail(new Error('Schreibfehler')); await failed; await tick();
  assert.equal(writes.length, 2); assert.deepEqual(writes[1].jobs.map(job => job.requestId), ['later']);
  writes[1].release(); const accepted = await later; await tick();
  assert.equal(accepted.created, true); assert.equal(writes[2].jobs[0].status, 'running'); assert.equal(f.workers.length, 0);
  writes[2].release(); await tick(); assert.equal(f.workers.length, 1); await f.tasks.dispose();
});

test('Stop invalidates both pending admission and the durable running transition before worker creation', async () => {
  const f = fixture(), writes = delayedWrites(f);
  const pending = f.tasks.accept(f.admission('pending')); const rejected = assert.rejects(pending, /beendet/);
  await tick(); await f.tasks.stopAll(); assert.equal(f.tasks.snapshot()[0].status, 'interrupted');
  writes[0].release(); await rejected; assert.equal(f.workers.length, 0);
  const next = f.tasks.accept(f.admission('next')); await tick(); writes[1].release(); const accepted = await next; await tick();
  assert.equal(f.tasks.get(accepted.job.id).status, 'running'); assert.equal(f.workers.length, 0);
  await f.tasks.stopAll(); assert.equal(f.tasks.get(accepted.job.id).status, 'interrupted');
  writes[2].release(); await tick(); assert.equal(f.workers.length, 0); await f.tasks.dispose();
});

test('queued steering reserves the job until its mutation is durable, even when its resource conflict ends', async () => {
  const f = fixture(), writes = delayedWrites(f);
  const first = f.tasks.accept(f.admission('first', ['project'])); await tick(); writes[0].release(); await first; await tick(); writes[1].release(); await tick();
  const next = f.tasks.accept(f.admission('next', ['project'])); await tick(); writes[2].release(); const accepted = await next; await tick();
  const later = f.tasks.accept(f.admission('later', ['project'])); await tick(); writes[3].release(); await later; await tick();
  const steering = f.tasks.steer(accepted.job.id, 'Zusätzliche Grenze.', ['additional']); await tick();
  f.workers[0].finish(); await tick(); assert.equal(f.workers.length, 1); assert.equal(writes.length, 5, 'a later conflicting job cannot overtake a pending mutation');
  writes[4].release(); await steering; await tick(); assert.equal(f.workers.length, 1);
  assert.equal(writes[5].jobs.find(job => job.id === accepted.job.id)?.status, 'running');
  writes[5].release(); await tick(); assert.equal(f.workers.length, 2);
  assert.ok(f.workers[1].runs[0].text.includes('Zusätzliche Grenze.')); assert.deepEqual(f.workers[1].createdJob.resources, ['project', 'additional']);
  await f.tasks.dispose();
});

test('a pending active steer cannot reach the adapter after Stop has confirmed termination', async () => {
  const f = fixture(), writes = delayedWrites(f); let steers = 0;
  const next = f.tasks.accept(f.admission('one')); await tick(); writes[0].release(); const accepted = await next; await tick(); writes[1].release(); await tick();
  f.workers[0].steer = async () => { steers++; };
  const steering = f.tasks.steer(accepted.job.id, 'Änderung.', ['additional']); const rejected = assert.rejects(steering, /Änderungen/);
  await tick(); await f.tasks.stopAll(); assert.equal(f.workers[0].stops, 1);
  writes[2].release(); await rejected; assert.equal(steers, 0); assert.equal(f.tasks.get(accepted.job.id).status, 'interrupted');
  await f.tasks.dispose();
});

test('a mutation finishing during another running-transition write wakes an earlier eligible job', async () => {
  const f = fixture(), writes = delayedWrites(f);
  const blocker = f.tasks.accept(f.admission('blocker', ['*'])); await tick(); writes[0].release(); await blocker; await tick(); writes[1].release(); await tick();
  const earlierPending = f.tasks.accept(f.admission('earlier', ['project-a'])); await tick(); writes[2].release(); const earlier = await earlierPending; await tick();
  const laterPending = f.tasks.accept(f.admission('later', ['project-b'])); await tick(); writes[3].release(); const later = await laterPending; await tick();
  const steering = f.tasks.steer(earlier.job.id, 'Zusätzliche Grenze.'); await tick();
  f.workers[0].finish(); await tick();
  assert.equal(writes[5].jobs.find(job => job.id === later.job.id)?.status, 'running');
  assert.equal(f.tasks.get(earlier.job.id).status, 'queued');
  // Match FIFO journal completion: mutation ACK first, then the later job's running ACK.
  writes[4].release(); await steering; await tick(); assert.equal(writes.length, 6);
  writes[5].release(); await tick();
  assert.equal(writes.length, 7, 'the mutation wakeup survives the other in-flight running write');
  assert.equal(writes[6].jobs.find(job => job.id === earlier.job.id)?.status, 'running');
  writes[6].release(); await tick();
  assert.equal(f.workers.length, 3); assert.equal(f.workers[2].createdJob.id, earlier.job.id);
  assert.equal(f.tasks.get(later.job.id).status, 'running', 'no later completion is needed to release the earlier job');
  await f.tasks.dispose();
});

test('the admission limit includes requests that are still waiting for another write', async () => {
  const f = fixture(), writes = delayedWrites(f);
  const admissions = Array.from({ length: 50 }, (_, index) => f.tasks.accept(f.admission(`pending-${index}`)));
  const settled = Promise.allSettled(admissions);
  await assert.rejects(f.tasks.accept(f.admission('overflow')), /50 Aufgaben/);
  await tick(); assert.equal(writes.length, 1); assert.equal(f.tasks.busy(), true);
  await f.tasks.stopAll(); assert.equal(f.workers.length, 0); writes[0].release();
  assert.ok((await settled).every(result => result.status === 'rejected')); assert.equal(f.tasks.busy(), false);
  await f.tasks.dispose();
});

test('durable admission installs task memory and acknowledges the caller before immediate worker output', async () => {
  const f = fixture(); let acknowledged = false;
  f.ports.parseReply = text => JSON.parse(text);
  f.ports.createWorker = (emit, job) => {
    assert.equal(acknowledged, true);
    const worker = new Worker(job, emit); f.workers.push(worker);
    worker.run = async () => emit({ type: 'completed', status: 'completed', text: JSON.stringify({ text: 'Vorschlag.', proposals: [{ documentId: 'core', baseVersion: 1, content: 'Vorliebe.', reason: 'Gewünscht.' }], errors: [] }) });
    return worker;
  };
  await f.tasks.accept(f.admission('one'), () => { acknowledged = true; }); await tick();
  assert.equal(f.proposals.length, 1); assert.ok(f.proposals[0].sourceIds?.includes('user-one')); await f.tasks.dispose();
});

test('asynchronous context admission deduplicates requests and freezes confirmed identity and model', async () => {
  const f = fixture(); let release!: (text: string) => void;
  f.ports.memory!.retrieve = () => new Promise<string>(resolve => { release = resolve; });
  const first = f.tasks.accept(f.admission('same')), repeated = f.tasks.accept(f.admission('same')); await tick();
  assert.equal(f.tasks.busy(), true); assert.equal(f.workers.length, 0);
  f.core.version = 2; f.core.content = 'Neue Vorliebe.'; f.settings.model = 'new-model';
  release('Historischer Kontext.'); const [accepted, duplicate] = await Promise.all([first, repeated]); await tick();
  assert.equal(accepted.created, true); assert.equal(duplicate.created, false); assert.equal(accepted.job.id, duplicate.job.id);
  assert.equal(f.workers.length, 1); assert.equal(f.workers[0].runs[0].model, 'worker-model');
  assert.ok(f.workers[0].createdJob.identityInstructions?.includes('Vorliebe vor Annahme.')); await f.tasks.dispose();
});

test('Stop invalidates context preparation before any durable job or worker is admitted', async () => {
  const f = fixture(); let release!: (text: string) => void;
  f.ports.memory!.retrieve = () => new Promise<string>(resolve => { release = resolve; });
  const pending = f.tasks.accept(f.admission('pending')); await tick(); const rejected = assert.rejects(pending, /beendet/);
  await f.tasks.stopAll(); assert.deepEqual(f.tasks.snapshot(), []);
  release('Verspäteter Kontext.'); await rejected; assert.equal(f.workers.length, 0); await f.tasks.dispose();
});

test('a delayed archive page cannot continue a targeted stopped job or disturb its independent peer', async () => {
  const f = fixture(); const first = await f.tasks.accept(f.admission('first')), second = await f.tasks.accept(f.admission('second')); await tick();
  let reject!: (error: Error) => void;
  f.ports.memory!.readPeriod = () => new Promise((_resolve, failed) => { reject = failed; });
  f.workers[0].finish(read); await tick(); await f.tasks.stop(first.job.id);
  reject(new Error('Verspäteter Archivfehler')); await f.tasks.settleMemory();
  assert.equal(f.workers[0].runs.length, 1); assert.equal(f.tasks.get(first.job.id).status, 'interrupted'); assert.equal(f.tasks.get(second.job.id).status, 'running');
  assert.equal(f.messages.length, 0); await f.tasks.dispose();
});

test('completed job output stays visible while delayed capture and Stop suppress later proposal submissions', async () => {
  const f = fixture(); f.ports.parseReply = text => JSON.parse(text); await f.tasks.accept(f.admission('one')); await tick();
  let release!: () => void; const capture = new Promise<void>(resolve => { release = resolve; });
  f.ports.journal.capture = strict => { assert.equal(strict, true); return capture; };
  f.workers[0].finish(JSON.stringify({ text: 'Vorschlag.', proposals: [{ documentId: 'core', baseVersion: 1, content: 'Neue Vorliebe.', reason: 'Gewünscht.' }], errors: [] }));
  assert.equal(f.messages[0].text, 'Aufgabe one\n\nVorschlag.'); assert.equal(f.tasks.snapshot()[0].status, 'completed');
  await f.tasks.stopAll(); release(); await f.tasks.settleMemory(); assert.equal(f.proposals.length, 0); await f.tasks.dispose();
});
