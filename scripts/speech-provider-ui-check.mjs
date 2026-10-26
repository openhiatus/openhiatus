import { _electron as electron, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createUiAppFixture } from './helpers/ui-app-fixture.mjs';

await mkdir('artifacts', { recursive: true });
const fixture = await createUiAppFixture('speech-provider-ui'), profile = await mkdtemp(path.resolve('.test-data/speech-profile-'));
const mp3 = Buffer.from([73, 68, 51, 4, 0, 0, 0, 0, 0, 0]), secret = 'synthetic-elevenlabs-key';
const requests = [], errors = []; let delayed = false;
const server = createServer(async (request, response) => {
  try {
    const chunks = []; for await (const chunk of request) chunks.push(chunk); const body = Buffer.concat(chunks);
    requests.push(request.url);
    if (request.url === '/v1/speech-to-text') {
      assert.equal(request.headers['xi-api-key'], secret);
      const form = await new Request('http://localhost', { method: 'POST', headers: request.headers, body }).formData();
      assert.equal(form.get('model_id'), 'scribe_v2'); assert.equal(form.get('file').type, 'audio/wav'); assert.equal(form.get('diarize'), 'false');
      response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ text: 'Synthetic recognized speech.' }));
    } else if (request.url.startsWith('/v1/text-to-speech/')) {
      assert.equal(request.headers['xi-api-key'], secret); assert.equal(JSON.parse(body).model_id, 'eleven_multilingual_v2');
      if (request.url.includes('UnavailableVoice')) { response.writeHead(404); response.end(secret); return; }
      if (delayed) return;
      response.setHeader('content-type', 'audio/mpeg'); response.end(mp3);
    } else {
      assert.equal(request.url, '/tts/v1/voice'); assert.equal(request.headers.authorization, 'Basic c3ludGhldGlj');
      response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ audioContent: mp3.toString('base64') }));
    }
  } catch (error) { errors.push(String(error)); if (!response.headersSent) response.writeHead(500); response.end('{}'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
// Only this disposable app copy substitutes the transport; all production HTTP/IPC validation remains active.
await writeFile(path.join(fixture.appDirectory, 'dist/main.cjs'), `
const request = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(String(input));
  if (['https://api.elevenlabs.io', 'https://api.inworld.ai'].includes(url.origin)) return request('http://127.0.0.1:${server.address().port}' + url.pathname + url.search, init);
  throw new Error('Unexpected external request in synthetic speech fixture');
};
require('./real-main.cjs');
`);
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
let instance;
async function launch() {
  instance = await electron.launch({ executablePath: path.resolve('node_modules/electron/dist/electron.exe'), args: [fixture.appDirectory, `--data-dir=${profile}`], env });
  const page = await instance.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await expect(page.locator('.language-trigger')).toBeEnabled({ timeout: 30000 });
  await page.evaluate(() => window.openhiatus.savePreferences({ uiLanguage: 'de', speakReplies: false, earcons: false, memoryAutoSummarize: false }));
  return page;
}
try {
  let page = await launch();
  await page.getByRole('button', { name: 'Verstanden, Vollzugriff bestätigen', exact: true }).click();
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.getByRole('tab', { name: 'Sprache & Geräte', exact: true }).click();
  let card = page.locator('.settings-speech-access:visible');
  const snapshot = () => page.evaluate(() => window.openhiatus.snapshot());
  await card.locator('select').selectOption('elevenlabs');
  await expect.poll(async () => (await snapshot()).preferences.speechProvider).toBe('elevenlabs');
  assert.equal(requests.length, 0);
  await expect(card.locator('details')).not.toHaveAttribute('open');
  await card.locator('input[type=password]').fill(secret); await card.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect.poll(async () => (await snapshot()).connections.speech).toBe('saved'); assert.equal(requests.length, 0);
  assert.ok(!JSON.stringify(await snapshot()).includes(secret));
  assert.ok(!(await readFile(path.join(profile, 'credentials.json'), 'utf8')).includes(secret));
  const defaultClip = await page.evaluate(() => window.openhiatus.testSpeech()); assert.equal(defaultClip.mimeType, 'audio/mpeg');
  assert.ok(requests.at(-1).includes('/6WwXjDDEMyNmFG95zycZ?'));
  await card.locator('summary').click(); await card.locator('input[type=text]').fill('CustomVoice123');
  await card.getByRole('button', { name: 'Stimme speichern', exact: true }).click();
  await expect.poll(async () => (await snapshot()).preferences.elevenlabsVoiceId).toBe('CustomVoice123');
  assert.equal((await snapshot()).connections.speech, 'saved');
  await page.evaluate(() => window.openhiatus.testSpeech()); assert.ok(requests.at(-1).includes('/CustomVoice123?'));
  await card.getByRole('button', { name: 'Standardstimme verwenden', exact: true }).click();
  await expect(card.locator('input[type=text]')).toHaveValue('');
  await page.evaluate(() => window.openhiatus.testSpeech()); assert.ok(requests.at(-1).includes('/6WwXjDDEMyNmFG95zycZ?'));
  const data = Buffer.alloc(3244); data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(16000, 24); data.writeUInt32LE(32000, 28);
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(3200, 40);
  assert.equal(await page.evaluate(base64 => window.openhiatus.transcribe({ base64, mimeType: 'audio/wav' }), data.toString('base64')), 'Synthetic recognized speech.');
  await card.locator('input[type=text]').fill('UnavailableVoice'); await card.getByRole('button', { name: 'Stimme speichern', exact: true }).click();
  await expect.poll(async () => (await snapshot()).preferences.elevenlabsVoiceId).toBe('UnavailableVoice');
  const failure = await page.evaluate(() => window.openhiatus.testSpeech().then(() => '', error => error.message));
  assert.match(failure, /Voice-ID/); assert.ok(!failure.includes(secret)); assert.equal((await snapshot()).connections.speech, 'saved');
  await card.getByRole('button', { name: 'Standardstimme verwenden', exact: true }).click();
  await expect(card.locator('input[type=text]')).toHaveValue('');
  delayed = true; const count = requests.length;
  const stopped = page.evaluate(() => window.openhiatus.testSpeech().then(() => 'unexpected success', error => error.message));
  await expect.poll(() => requests.length).toBe(count + 1); await page.evaluate(() => window.openhiatus.stop());
  assert.match(await stopped, /gestoppt/); delayed = false;
  await card.locator('select').selectOption('inworld');
  await card.locator('input[type=password]').fill('c3ludGhldGlj'); await card.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect.poll(async () => (await snapshot()).connections.speech).toBe('saved');
  await card.locator('input[type=text]').fill('CustomInworld'); await card.getByRole('button', { name: 'Stimme speichern', exact: true }).click();
  await expect.poll(async () => (await snapshot()).preferences.voiceId).toBe('CustomInworld');
  await card.locator('select').selectOption('elevenlabs');
  await expect.poll(async () => (await snapshot()).connections.speech).toBe('saved');
  const main = await instance.browserWindow(page);
  for (const size of [[560, 440], [1360, 900]]) {
    await main.evaluate((window, size) => window.setContentSize(...size), size);
    for (const language of ['en', 'es', 'fr', 'de', 'zh-CN', 'ja', 'pt-BR']) {
      await page.evaluate(language => window.openhiatus.savePreferences({ uiLanguage: language }), language);
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      assert.ok(await card.evaluate(element => element.scrollWidth <= element.clientWidth + 1));
      for (const field of ['select', 'input[type=text]']) assert.ok(await card.locator(field).evaluate(element => element.getBoundingClientRect().height >= 44));
      await expect(card.locator('select')).toHaveValue('elevenlabs');
    }
  }
  await page.evaluate(() => window.openhiatus.savePreferences({ uiLanguage: 'de' }));
  await card.scrollIntoViewIfNeeded(); await page.screenshot({ path: 'artifacts/openhiatus-elevenlabs-settings.png' });
  await instance.close(); instance = undefined; const beforeRestart = requests.length;
  page = await launch(); assert.equal((await snapshot()).preferences.speechProvider, 'elevenlabs'); assert.equal(requests.length, beforeRestart);
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('button', { name: 'Einstellungen', exact: true }).click();
  await page.getByRole('tab', { name: 'Sprache & Geräte', exact: true }).click(); card = page.locator('.settings-speech-access:visible');
  await card.getByRole('button', { name: 'Gespeicherten Sprachzugang entfernen', exact: true }).click();
  await expect.poll(async () => (await snapshot()).connections.speech).toBe('missing');
  await card.locator('select').selectOption('inworld'); await expect.poll(async () => (await snapshot()).connections.speech).toBe('saved');
  assert.equal((await snapshot()).preferences.voiceId, 'CustomInworld'); assert.deepEqual(errors, []);
  console.log('Speech provider UI passed: optional/default/custom voices, provider-specific encrypted keys, STT/TTS protocols, no ElevenLabs calls on setup/restart, errors, Stop, seven languages, compact layout and persistence. Synthetic audio and transport only; no real account or microphone.');
} finally { await instance?.close().catch(() => {}); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
