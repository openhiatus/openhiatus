import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SpeechService } from '../src/main/speech';
import { SPEECH_DEFAULTS, type SpeechProvider } from '../src/shared/speech-settings';
import { AppController } from '../src/main/controller';
import { defaultState, StateStore, CredentialStore } from '../src/main/storage';
import { decodeSnapshot } from '../src/shared/ipc';

const key = 'synthetic-elevenlabs-key', mp3 = Buffer.from([73, 68, 51, 4, 0, 0, 0, 0, 0, 0]);
const wav = () => {
  const data = Buffer.alloc(3244); data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(16000, 24);
  data.writeUInt32LE(32000, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(3200, 40);
  return { base64: data.toString('base64'), mimeType: 'audio/wav' };
};
function speech(handler: typeof fetch, voice = '') { return new SpeechService({ getProvider: () => 'elevenlabs', getKey: () => key, getVoice: () => voice, fetch: handler }); }

test('ElevenLabs STT uploads validated WAV multipart with language detection and no event or speaker profiling', async () => {
  const clip = wav();
  const service = speech(async (url, init) => {
    assert.equal(url, 'https://api.elevenlabs.io/v1/speech-to-text'); assert.equal(init?.redirect, 'error');
    assert.equal((init?.headers as Record<string, string>)['xi-api-key'], key);
    assert.equal((init?.headers as Record<string, string>)['Content-Type'], undefined);
    const form = init!.body as FormData; assert.ok(form instanceof FormData);
    assert.equal(form.get('model_id'), 'scribe_v2'); assert.equal(form.get('diarize'), 'false'); assert.equal(form.get('tag_audio_events'), 'false');
    assert.equal(form.has('language_code'), false); assert.equal(form.has('source_url'), false);
    assert.deepEqual(Buffer.from(await (form.get('file') as Blob).arrayBuffer()), Buffer.from(clip.base64, 'base64'));
    return Response.json({ text: '  Bonjour, aide-moi.  ' });
  });
  assert.equal(await service.transcribe(clip), 'Bonjour, aide-moi.');
});

test('ElevenLabs TTS works without customization and uses an explicit custom ID only when supplied', async () => {
  for (const voice of ['', 'CustomVoice123', 'a/b?c']) {
    const service = speech(async (url, init) => {
      assert.equal(url, `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice || SPEECH_DEFAULTS.elevenlabs.voice)}?output_format=mp3_44100_128`);
      assert.equal((init?.headers as Record<string, string>).Authorization, undefined);
      assert.equal((init?.headers as Record<string, string>)['xi-api-key'], key);
      assert.deepEqual(JSON.parse(init!.body as string), { text: 'Hola.', model_id: 'eleven_multilingual_v2' });
      return new Response(mp3, { headers: { 'content-type': 'audio/mpeg' } });
    }, voice);
    assert.deepEqual(await service.synthesize('Hola.'), { base64: mp3.toString('base64'), mimeType: 'audio/mpeg' });
  }
});

test('ElevenLabs errors, malformed results and invalid recordings fail without leaking keys or retrying', async () => {
  for (const response of [new Response(key, { status: 401 }), new Response(key, { status: 403 }), new Response(key, { status: 429 }), new Response(key, { status: 404 }), new Response(key), new Response(mp3, { headers: { 'content-length': '999999999' } })]) {
    let calls = 0;
    await assert.rejects(speech(async () => { calls++; return response; }).synthesize('Hello'), error => { assert.ok(error instanceof Error); assert.ok(!error.message.includes(key)); return true; });
    assert.equal(calls, 1);
  }
  await assert.rejects(speech(async () => { throw Error(key); }).synthesize('Hello'), /nicht erreichbar/);
  for (const result of [{ text: '' }, { text: 3 }, { text: 'x'.repeat(20001) }, { error: key }]) await assert.rejects(speech(async () => Response.json(result)).transcribe(wav()));
  let calls = 0; const service = speech(async () => { calls++; return Response.json({}); });
  await assert.rejects(service.transcribe({ base64: 'YQ==', mimeType: 'audio/wav' }));
  await assert.rejects(service.synthesize('x'.repeat(2001))); assert.equal(calls, 0);
});

test('ElevenLabs cancellation suppresses late success and the receipt cache isolates providers and voices', async () => {
  const abort = new AbortController();
  await assert.rejects(speech(async () => { abort.abort(); return new Response(mp3); }).synthesize('Hello', abort.signal), { name: 'AbortError' });
  let provider: SpeechProvider = 'elevenlabs', voice = '', calls = 0;
  const service = new SpeechService({ getProvider: () => provider, getKey: () => 'c3ludGhldGlj', getVoice: () => voice,
    fetch: async () => { calls++; return provider === 'elevenlabs' ? new Response(mp3) : Response.json({ audioContent: mp3.toString('base64') }); } });
  await service.synthesize('Mach ich.'); await service.synthesize('Mach ich.'); assert.equal(calls, 1);
  voice = 'Custom123'; await service.synthesize('Mach ich.'); assert.equal(calls, 2);
  provider = 'inworld'; await service.synthesize('Mach ich.'); assert.equal(calls, 3);
  provider = 'elevenlabs'; await service.synthesize('Mach ich.'); assert.equal(calls, 3);
});

function controller() {
  let saved = defaultState(); const keys = new Map<string, string>([['inworld', 'synthetic-inworld-key']]); let warmups = 0;
  const store = { load: () => structuredClone(saved), save: (state: typeof saved) => { saved = structuredClone(state); } };
  const service = { async transcribe() { return 'Hello'; }, async synthesize() { return { base64: mp3.toString('base64'), mimeType: 'audio/mpeg' }; }, async test() { return this.synthesize(); }, async prewarm() { warmups++; } };
  const app = new AppController({ store, credentials: { get: name => keys.get(name), set: (name, value) => { keys.set(name, value); }, remove: name => { keys.delete(name); } }, speech: service,
    agent: { async start() {}, async run() {}, async stop() {}, async dispose() {} }, workspace: 'C:\\synthetic', publish() {} });
  return { app, keys, store, service, warmups: () => warmups, saved: () => saved };
}

test('provider selection, optional IDs, separate encrypted keys and missing legacy fields survive storage and IPC', async () => {
  const f = controller();
  try {
    await f.app.savePreferences({ speechProvider: 'elevenlabs', elevenlabsVoiceId: '' }); assert.equal(f.app.snapshot().connections.speech, 'missing');
    await f.app.saveSpeechKey(key, 'elevenlabs'); assert.equal(f.app.snapshot().connections.speech, 'saved'); assert.equal(f.warmups(), 0);
    await f.app.transcribe(wav()); assert.equal(f.app.snapshot().connections.speech, 'saved', 'STT alone never confirms TTS');
    await f.app.testSpeech(); assert.equal(f.app.snapshot().connections.speech, 'verified');
    await f.app.savePreferences({ elevenlabsVoiceId: 'Custom123' }); assert.equal(f.app.snapshot().connections.speech, 'saved');
    await f.app.savePreferences({ speechProvider: 'inworld', voiceId: 'CustomInworld' }); assert.equal(f.app.snapshot().connections.speech, 'saved');
    await f.app.removeSpeechKey('elevenlabs'); assert.ok(f.keys.has('inworld')); assert.equal(f.app.snapshot().connections.speech, 'saved');
    await f.app.savePreferences({ speechProvider: 'elevenlabs' }); assert.equal(f.app.snapshot().connections.speech, 'missing');
    assert.equal(decodeSnapshot(f.app.snapshot()).preferences.elevenlabsVoiceId, 'Custom123');
    const directory = mkdtempSync(path.join(tmpdir(), 'openhiatus-speech-settings-')), store = new StateStore(directory);
    store.save(f.saved()); assert.equal(new StateStore(directory).load().preferences.elevenlabsVoiceId, 'Custom123');
    const legacy = defaultState(); delete legacy.preferences.speechProvider; delete legacy.preferences.elevenlabsVoiceId; store.save(legacy);
    assert.equal(store.load().preferences.speechProvider, 'inworld'); assert.equal(store.load().preferences.voiceId, 'Dennis');
    const credentials = new CredentialStore(directory, { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value).reverse(), decryptString: bytes => Buffer.from(bytes).reverse().toString() });
    credentials.set('elevenlabs', key); credentials.set('inworld', 'c3ludGhldGlj');
    assert.equal(credentials.get('elevenlabs'), key); credentials.remove('elevenlabs'); assert.equal(credentials.get('inworld'), 'c3ludGhldGlj');
  } finally { await f.app.dispose(); }
});

test('speech settings reject invalid input, roll back storage failures and cancel the old provider response', async () => {
  const f = controller();
  try {
    for (const patch of [{ speechProvider: 'unknown' }, { elevenlabsVoiceId: 'bad\nvoice' }, { voiceId: 'x'.repeat(201) }]) await assert.rejects(f.app.savePreferences(patch as never));
    const save = f.store.save; f.store.save = () => { throw Error('Synthetic storage failure'); };
    await assert.rejects(f.app.savePreferences({ speechProvider: 'elevenlabs' }), /storage failure/);
    assert.equal(f.app.snapshot().preferences.speechProvider, 'inworld'); assert.equal(f.app.snapshot().connections.speech, 'saved'); f.store.save = save;
    let release!: (clip: { base64: string; mimeType: string }) => void;
    f.service.synthesize = () => new Promise(resolve => { release = resolve; });
    const pending = f.app.synthesize('Hello'), rejected = assert.rejects(pending, /gestoppt/);
    await f.app.savePreferences({ speechProvider: 'elevenlabs' }); release({ base64: mp3.toString('base64'), mimeType: 'audio/mpeg' }); await rejected;
    assert.equal(f.app.snapshot().connections.speech, 'missing');
    await f.app.saveSpeechKey(key, 'elevenlabs');
    f.service.synthesize = async () => { throw Error(key); };
    await assert.rejects(f.app.synthesize('Hello'), error => { assert.ok(error instanceof Error); assert.ok(!error.message.includes(key)); return true; });
  } finally { await f.app.dispose(); }
});
