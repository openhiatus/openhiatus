import { _electron as electron, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

await mkdir('.test-data', { recursive: true }); await mkdir('artifacts', { recursive: true });
const profile = await mkdtemp(path.resolve('.test-data/fast-model-ui-'));
const base = 'openai/gpt-6.1-sol', fast = `${base}::fast`, requests = [], errors = [];
function respond(response, tool, text) {
  const args = tool ? JSON.stringify({ requestId: 'fast-ui-task', title: 'Fast prüfen', acknowledgement: 'Ich prüfe Fast.', resources: ['*'] }) : '';
  const item = tool ? { id: 'fc_fast', type: 'function_call', call_id: 'call_fast', name: 'start_task', arguments: args }
    : { id: 'msg_fast', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] };
  const events = [
    { type: 'response.created', response: { id: 'resp_fast', status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item: tool ? { ...item, arguments: '' } : { ...item, content: [] } },
    ...(tool ? [{ type: 'response.function_call_arguments.delta', output_index: 0, delta: args }, { type: 'response.function_call_arguments.done', output_index: 0, arguments: args }]
      : [{ type: 'response.content_part.added', item_id: item.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } },
        { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: text }, { type: 'response.output_text.done', item_id: item.id, output_index: 0, content_index: 0, text }]),
    { type: 'response.output_item.done', output_index: 0, item },
    { type: 'response.completed', response: { id: 'resp_fast', status: 'completed', service_tier: 'default', output: [item], usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 } } },
  ];
  response.writeHead(200, { 'content-type': 'text/event-stream' }); response.end(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''));
}
const server = createServer(async (request, response) => {
  try {
    assert.equal(request.url, '/v1/responses');
    let body = ''; for await (const chunk of request) body += chunk;
    const input = JSON.parse(body), dialog = input.tools?.some(tool => tool.name === 'start_task');
    assert.equal(input.model, 'gpt-6.1-sol', 'local variant suffix must not reach the provider');
    requests.push({ role: dialog ? 'dialog' : 'worker', tier: input.service_tier });
    const tool = dialog && JSON.stringify(input.input).includes('[fast-worker]') && !input.input.some(item => item.type === 'function_call_output');
    const answer = dialog ? 'Die gewählte Modellvariante ist angekommen.' : 'Der Arbeitsauftrag hat Fast angefordert.';
    respond(response, tool, '```openhiatus-reply\n' + JSON.stringify({ spoken: answer, text: answer }) + '\n```');
  } catch (error) { errors.push(String(error)); response.writeHead(500); response.end('Synthetic model check failed'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const executablePath = process.env.OPENHIATUS_TEST_APP || path.resolve('node_modules/electron/dist/electron.exe');
const args = [...(process.env.OPENHIATUS_TEST_APP ? [] : ['.']), `--data-dir=${profile}`];
let instance;
const launch = async () => {
  instance = await electron.launch({ executablePath, args, env, timeout: 30000 });
  const page = await instance.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => Boolean(window.openhiatus)); return page;
};
try {
  let page = await launch();
  await page.getByRole('button', { name: 'Verstanden, Vollzugriff bestätigen', exact: true }).click();
  await page.evaluate(async url => {
    await window.openhiatus.saveProvider({ id: 'openai', apiKey: 'synthetic-fast-ui-key', baseUrl: url, models: ['gpt-6.1-sol'] });
    await window.openhiatus.savePreferences({ memoryAutoSummarize: false, speakReplies: false, earcons: false });
  }, `http://127.0.0.1:${server.address().port}/v1`);
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  for (const role of ['model', 'dialogModel', 'memoryModel']) {
    const select = page.locator(`#role-${role}`);
    assert.deepEqual(await select.locator('option').evaluateAll(options => options.map(option => ({ value: option.value, label: option.textContent }))), [
      { value: base, label: 'OpenAI · gpt-6.1-sol' }, { value: fast, label: 'OpenAI · gpt-6.1-sol (fast)' },
    ]);
    await select.selectOption(fast);
    await expect.poll(() => page.evaluate(async key => (await window.openhiatus.snapshot()).preferences[key], role)).toBe(fast);
  }
  await expect(page.locator('#openai-models')).toHaveAttribute('placeholder', 'gpt-6.1-sol');
  await page.screenshot({ path: 'artifacts/openhiatus-fast-modellauswahl.png' });
  await page.getByRole('button', { name: 'Gespräch', exact: true }).click();
  await expect(page.locator('.composer-footer')).toContainText('Gespräch · OpenAI · gpt-6.1-sol (fast)');
  await expect(page.locator('.composer-footer')).toContainText('Arbeit · OpenAI · gpt-6.1-sol (fast)');
  await page.getByRole('textbox', { name: 'Dein Auftrag', exact: true }).fill('[fast-worker] Prüfe den synthetischen Arbeitsauftrag.');
  await page.getByRole('button', { name: 'Auftrag senden', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).jobs?.[0]?.status), { timeout: 30000 }).toBe('completed');
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).task.status), { timeout: 30000 }).toBe('completed');
  assert.ok(requests.some(request => request.role === 'dialog')); assert.ok(requests.some(request => request.role === 'worker'));
  assert.ok(requests.every(request => request.tier === 'priority'));
  const job = (await page.evaluate(() => window.openhiatus.snapshot())).jobs[0];
  assert.equal(job.model, fast);
  assert.ok(job.modelRequests.some(request => request.role === 'worker' && request.requestedServiceTier === 'fast' && request.actualServiceTier === 'default'), 'requested Fast and returned default must stay distinct');
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.locator('#role-dialogModel').selectOption(base);
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).preferences.dialogModel)).toBe(base);
  await page.getByRole('button', { name: 'Gespräch', exact: true }).click();
  await page.getByRole('textbox', { name: 'Dein Auftrag', exact: true }).fill('Antworte ohne Arbeitsauftrag.');
  await page.getByRole('button', { name: 'Auftrag senden', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).task.status), { timeout: 30000 }).toBe('completed');
  assert.equal(requests.at(-1).tier, undefined, 'switching back removes Fast');
  const count = requests.length; await instance.close(); instance = undefined;
  page = await launch();
  const restored = await page.evaluate(() => window.openhiatus.snapshot());
  assert.equal(restored.preferences.model, fast); assert.equal(restored.preferences.dialogModel, base); assert.equal(restored.preferences.memoryModel, fast);
  assert.equal(requests.length, count, 'restart does not replay work'); assert.deepEqual(errors, []);
  await page.getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await expect(page.locator('#role-model')).toHaveValue(fast); await expect(page.locator('#role-memoryModel')).toHaveValue(fast); await expect(page.locator('#role-dialogModel')).toHaveValue(base);
  const result = { status: 'passed', profile, requests, checks: ['adjacent ordinary and Fast model choices in all three roles', 'base remote model with priority wire parameter', 'real dialog and worker requests', 'separate requested and returned service tier', 'switch back to ordinary processing', 'dialog and work variants visible in conversation', 'restart persists each role without replay', 'no cloud or user profile access'] };
  await writeFile('artifacts/openhiatus-fast-modellpruefung.json', JSON.stringify(result, null, 2), 'utf8'); console.log(JSON.stringify(result, null, 2));
} finally { if (instance) await instance.close(); await new Promise(resolve => server.close(resolve)); }
