import { _electron as electron, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createUiAppFixture } from './helpers/ui-app-fixture.mjs';

await mkdir('.test-data', { recursive: true }); await mkdir('artifacts', { recursive: true });
const profile = await mkdtemp(path.resolve('.test-data/google-calendar-ui-')), fixture = await createUiAppFixture('google-calendar-ui');
const now = Date.now(), start = new Date(now + 2 * 3600000).toISOString(), end = new Date(now + 3 * 3600000).toISOString();
const events = new Map([['initial', { id: 'initial', etag: '"v1"', summary: 'Synthetischer Termin in Köln', start: { dateTime: start }, end: { dateTime: end } }]]);
const googleCalls = [], modelCalls = [], errors = []; let allowLogin = false, loginCalls = 0;
const json = (response, value, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)); };
const server = createServer(async (request, response) => {
  try {
    let body = ''; for await (const chunk of request) body += chunk;
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/browser') { loginCalls++; return json(response, { allow: allowLogin }); }
    if (url.pathname.startsWith('/google/')) {
      googleCalls.push({ method: request.method, path: url.pathname });
      const data = body ? request.headers['content-type']?.includes('json') ? JSON.parse(body) : Object.fromEntries(new URLSearchParams(body)) : {};
      if (url.pathname === '/google/token') { assert.equal(data.client_id, 'synthetic-calendar.apps.googleusercontent.com'); assert.equal(data.client_secret, 'synthetic-client-secret'); return json(response, { access_token: 'synthetic-calendar-access', refresh_token: 'synthetic-calendar-refresh', token_type: 'Bearer', expires_in: 3600, scope: 'https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events' }); }
      if (url.pathname === '/google/revoke') return json(response, {});
      assert.equal(request.headers.authorization, 'Bearer synthetic-calendar-access');
      if (url.pathname.endsWith('/calendarList')) return json(response, { items: [{ id: 'sam@synthetic.example', summary: 'Privat', timeZone: 'Europe/Berlin', accessRole: 'owner', primary: true }, { id: 'family@synthetic.example', summary: 'Familie', timeZone: 'Europe/Berlin', accessRole: 'reader' }] });
      const id = decodeURIComponent(url.pathname.split('/').at(-1));
      if (request.method === 'POST') { assert.equal(url.searchParams.get('sendUpdates'), 'none'); if (events.has(data.id)) return json(response, {}, 409); const event = { ...data, etag: '"v1"' }; events.set(data.id, event); return json(response, event); }
      if (request.method === 'PATCH') { assert.equal(request.headers['if-match'], '"v1"'); const event = { ...events.get(id), ...data, etag: '"v2"' }; events.set(id, event); return json(response, event); }
      return json(response, url.pathname.endsWith('/events') ? { items: [...events.values()] } : events.get(id));
    }
    assert.equal(url.pathname, '/v1/chat/completions');
    const input = JSON.parse(body), tools = input.tools?.map(tool => tool.function.name) ?? [], dialog = tools.includes('start_task');
    modelCalls.push(dialog ? 'dialog' : 'worker');
    let tool;
    const last = input.messages.at(-1), lastResult = last.role === 'tool' ? JSON.parse(typeof last.content === 'string' ? last.content : last.content[0].text) : undefined;
    if (dialog && last.role !== 'tool') tool = { name: 'start_task', args: { requestId: 'calendar-ui-task', title: 'Kalender prüfen', acknowledgement: 'Ich prüfe deinen Kalender.', resources: ['*'] } };
    if (!dialog) {
      const find = name => { const result = tools.find(tool => tool.includes(`_${name}_`)); assert.ok(result, name); return result; };
      assert.ok(input.messages.some(message => ['system', 'developer'].includes(message.role) && JSON.stringify(message.content).includes('Google Kalender ist verbunden')));
      const event = { title: 'UI-Fokusblock', start: { dateTime: start }, end: { dateTime: end } };
      if (!lastResult) tool = { name: find('list_events'), args: { timeMin: new Date(now).toISOString(), timeMax: new Date(now + 7 * 86400000).toISOString() } };
      else if (lastResult.operation === 'list_events') tool = { name: find('create_event'), args: { requestId: 'ui-focus', event } };
      else if (lastResult.operation === 'create_event') tool = { name: find('get_event'), args: { eventId: lastResult.data.result.id } };
      else if (lastResult.operation === 'get_event') tool = { name: find('update_event'), args: { eventId: lastResult.data.result.id, etag: lastResult.data.result.etag, event: { ...event, title: 'UI-Fokusblock geändert' } } };
      else { assert.equal(lastResult.operation, 'update_event'); assert.equal(lastResult.data.status, 'completed'); }
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta, finish_reason = null) => response.write(`data: ${JSON.stringify({ id: 'calendar-ui', object: 'chat.completion.chunk', model: 'calendar-ui', choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
    chunk({ role: 'assistant' });
    if (tool) { chunk({ tool_calls: [{ index: 0, id: `call-${modelCalls.length}`, type: 'function', function: { name: tool.name, arguments: JSON.stringify(tool.args) } }] }); chunk({}, 'tool_calls'); }
    else { const answer = 'Der synthetische Termin ist angelegt und auf UI-Fokusblock geändert.'; chunk({ content: '```openhiatus-reply\n' + JSON.stringify({ spoken: answer, text: answer }) + '\n```' }); chunk({}, 'stop'); }
    response.end('data: [DONE]\n\n');
  } catch (error) { errors.push(String(error)); json(response, { error: { message: 'Synthetic calendar test failed' } }, 500); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
// This shim exists only in the isolated test app; production has no OAuth test endpoint.
await writeFile(path.join(fixture.appDirectory, 'dist/main.cjs'), `
const realFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{const req=new Request(input,init),url=new URL(req.url);if(['oauth2.googleapis.com','www.googleapis.com'].includes(url.hostname)){return realFetch(${JSON.stringify(base)}+'/google'+url.pathname+url.search,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:await req.text()})});}if(url.hostname==='127.0.0.1')return realFetch(input,init);return new Response('{}',{status:401});};
require('electron').shell.openExternal=async value=>{const url=new URL(value);if(url.origin==='https://accounts.google.com'){const mode=await(await realFetch(${JSON.stringify(base)}+'/browser')).json();if(mode.allow){const callback=new URL(url.searchParams.get('redirect_uri'));callback.searchParams.set('state',url.searchParams.get('state'));callback.searchParams.set('code','synthetic-code');await realFetch(callback);}}};
require('./real-main.cjs');
`, 'utf8');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; let instance;
const launch = async () => { instance = await electron.launch({ executablePath: path.resolve('node_modules/electron/dist/electron.exe'), args: [fixture.appDirectory, `--data-dir=${profile}`], env }); const page = await instance.firstWindow(); page.on('pageerror', error => errors.push(error.message)); return page; };
try {
  let page = await launch(); await page.getByRole('button', { name: 'Verstanden, Vollzugriff bestätigen', exact: true }).click();
  await page.getByRole('button', { name: 'Dienste', exact: true }).click();
  await page.getByLabel('Desktop-Client-ID', { exact: true }).fill('synthetic-calendar.apps.googleusercontent.com'); await page.getByLabel(/^Client-Secret/).fill('synthetic-client-secret');
  await page.getByRole('button', { name: 'OAuth-App speichern', exact: true }).click(); await expect(page.getByLabel(/^Client-Secret/)).toHaveValue('');
  await page.getByRole('button', { name: 'Mit Google verbinden', exact: true }).click(); await expect(page.getByRole('button', { name: 'Anmeldung abbrechen', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Anmeldung abbrechen', exact: true }).click(); await expect(page.getByRole('button', { name: 'Mit Google verbinden', exact: true })).toBeEnabled();
  allowLogin = true; await page.getByRole('button', { name: 'Mit Google verbinden', exact: true }).click();
  await expect(page.getByLabel('Verwendeter Kalender', { exact: true })).toHaveValue('sam@synthetic.example'); await expect(page.locator('.calendar-agenda')).toContainText('Synthetischer Termin in Köln');
  await page.getByLabel('Verwendeter Kalender', { exact: true }).selectOption('family@synthetic.example'); await expect(page.getByText('Zeitzone: Europe/Berlin. Dieser Kalender ist nur lesbar.', { exact: true })).toBeVisible();
  await page.getByLabel('Verwendeter Kalender', { exact: true }).selectOption('sam@synthetic.example');
  await page.evaluate(async url => { await window.openhiatus.saveProvider({ id: 'local', baseUrl: url, models: ['calendar-ui'] }); await window.openhiatus.savePreferences({ model: 'local/calendar-ui', dialogModel: 'local/calendar-ui', memoryModel: 'local/calendar-ui', memoryAutoSummarize: false, speakReplies: false, earcons: false }); }, base + '/v1');
  await page.getByRole('button', { name: 'Gespräch', exact: true }).click(); await page.getByRole('textbox', { name: 'Dein Auftrag', exact: true }).fill('Prüfe die Termine und lege den synthetischen Fokusblock an und ändere seinen Titel.'); await page.getByRole('button', { name: 'Auftrag senden', exact: true }).click();
  await expect.poll(() => page.evaluate(async () => (await window.openhiatus.snapshot()).jobs?.[0]?.status), { timeout: 30000 }).toBe('completed');
  assert.equal(googleCalls.filter(call => call.method === 'POST' && call.path.endsWith('/events')).length, 1); assert.equal(googleCalls.filter(call => call.method === 'PATCH').length, 1);
  await page.getByRole('button', { name: 'Dienste', exact: true }).click(); await expect(page.locator('.calendar-agenda')).toContainText('UI-Fokusblock geändert');
  await page.screenshot({ path: 'artifacts/openhiatus-google-kalender.png' });
  const credentials = await readFile(path.join(profile, 'credentials.json'), 'utf8'); for (const secret of ['synthetic-client-secret', 'synthetic-calendar-access', 'synthetic-calendar-refresh']) assert.ok(!credentials.includes(secret));
  const loginCount = loginCalls; await instance.close(); instance = undefined; page = await launch(); await page.getByRole('button', { name: 'Dienste', exact: true }).click(); await expect(page.locator('.calendar-agenda')).toContainText('UI-Fokusblock geändert'); assert.equal(loginCalls, loginCount);
  await page.getByRole('button', { name: 'Verbindung trennen', exact: true }).click(); await expect(page.getByRole('button', { name: 'Mit Google verbinden', exact: true })).toBeEnabled(); assert.ok(googleCalls.some(call => call.path === '/google/revoke')); assert.deepEqual(errors, []);
  const result = { status: 'passed', profile, checks: ['guided client setup', 'cancel and PKCE loopback login through real app', 'calendar and read-only selection', 'agenda with UTF-8', 'actual dialog to worker to calendar read/create/get/update', 'If-Match and one create/patch', 'DPAPI excludes plaintext credentials', 'restart restores connection without login', 'disconnect revokes grant', 'all provider traffic mocked; no real account or events'] };
  await writeFile('artifacts/openhiatus-google-kalender-pruefung.json', JSON.stringify(result, null, 2), 'utf8'); console.log(JSON.stringify(result, null, 2));
} finally { if (instance) await instance.close(); await new Promise(resolve => server.close(resolve)); }
