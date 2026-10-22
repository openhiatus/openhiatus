import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpeechService, STT_MODEL, TTS_MODEL } from '../src/main/speech';
import type { AudioClip } from '../src/shared/contracts';

const key = Buffer.from('synthetic-api-key:synthetic-secret').toString('base64');
const mp3 = Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]).toString('base64');
function wav(samples = 160, rate = 16000): AudioClip {
  const data = Buffer.alloc(44 + samples * 2);
  data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(samples * 2, 40);
  return { base64: data.toString('base64'), mimeType: 'audio/wav' };
}
function service(handler: (input: string | URL | Request, init?: RequestInit) => Promise<Response>, getKey = () => key) {
  return new SpeechService({ getKey, getVoice: () => 'Dennis', fetch: handler as typeof fetch });
}

test('STT sends the documented direct protocol and does not request voice profiling', async () => {
  let calls = 0;
  const clip = wav();
  const speech = service(async (input, init) => {
    calls++;
    assert.equal(input, 'https://api.inworld.ai/stt/v1/transcribe');
    assert.equal(init?.redirect, 'error');
    assert.equal((init?.headers as Record<string, string>).Authorization, `Basic ${key}`);
    assert.deepEqual(JSON.parse(init?.body as string), {
      transcribeConfig: { modelId: STT_MODEL, audioEncoding: 'LINEAR16', language: 'de', sampleRateHertz: 16000, numberOfChannels: 1,
        voiceProfileConfig: { enableVoiceProfile: false } }, audioData: { content: clip.base64 },
    });
    return Response.json({ transcription: { transcript: '  Schreibe eine Übersicht.  ', isFinal: true } });
  });
  assert.equal(await speech.transcribe(clip), 'Schreibe eine Übersicht.');
  assert.equal(calls, 1);
});

test('invalid, forged and overlong audio fails before transmitting anything', async () => {
  let calls = 0;
  const speech = service(async () => { calls++; return Response.json({}); });
  await assert.rejects(speech.transcribe({ base64: 'YQ==', mimeType: 'audio/webm' }), /WAV/);
  await assert.rejects(speech.transcribe({ base64: 'YQ==', mimeType: 'audio/wav' }), /beschädigt/);
  await assert.rejects(speech.transcribe(wav(160, 48000)), /16 kHz/);
  await assert.rejects(speech.transcribe(wav(16000 * 61)), /groß|Sekunden/);
  await assert.rejects(speech.transcribe(wav(0)), /Ton/);
  assert.equal(calls, 0);
});

test('TTS returns the MP3 payload with explicit model, voice and German language', async () => {
  const speech = service(async (input, init) => {
    assert.equal(input, 'https://api.inworld.ai/tts/v1/voice');
    assert.deepEqual(JSON.parse(init?.body as string), {
      text: 'Grüße aus Köln.', voiceId: 'Dennis', modelId: TTS_MODEL, language: 'de-DE', deliveryMode: 'STABLE', audioConfig: { audioEncoding: 'MP3' },
    });
    return Response.json({ audioContent: mp3, usage: { processedCharactersCount: 15, modelId: TTS_MODEL } });
  });
  assert.deepEqual(await speech.synthesize('Grüße aus Köln.'), { base64: mp3, mimeType: 'audio/mpeg' });
});

test('overlong TTS is neither silently truncated nor billed', async () => {
  let called = false;
  const speech = service(async () => { called = true; return Response.json({ audioContent: mp3 }); });
  await assert.rejects(speech.synthesize('a'.repeat(2001)), /2.000/);
  await assert.rejects(speech.synthesize('  '), /keinen Text/);
  assert.equal(called, false);
});

test('HTTP and network failures never expose provider bodies or headers and do not retry', async () => {
  let count = 0;
  const speech = service(async () => { count++; return new Response(`request Authorization: Basic ${key}`, { status: 401 }); });
  await assert.rejects(speech.synthesize('Hallo'), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /Schlüssel abgelehnt/);
    assert.ok(!error.message.includes(key));
    return true;
  });
  assert.equal(count, 1);
  const network = service(async () => { throw new Error(`Authorization: Basic ${key}`); });
  await assert.rejects(network.synthesize('Hallo'), /nicht erreichbar/);
});

test('malformed and error responses are rejected safely', async () => {
  for (const response of [Response.json({ error: { message: key } }), Response.json({ code: 16, message: key }), new Response('{'), Response.json({ audioContent: 'aGVsbG8=' })]) {
    await assert.rejects(service(async () => response).synthesize('Hallo'), (error: unknown) => {
      assert.ok(error instanceof Error); assert.ok(!error.message.includes(key)); return true;
    });
  }
  await assert.rejects(service(async () => Response.json({ transcription: { transcript: '' } })).transcribe(wav()), /Keine Sprache/);
  await assert.rejects(service(async () => Response.json({ transcription: { transcript: 'Halb', isFinal: false } })).transcribe(wav()), /vollständiges/);
});

test('pre-cancelled requests never reach provider; in-flight cancellation suppresses late reply', async () => {
  let called = false;
  const before = new AbortController(); before.abort();
  await assert.rejects(service(async () => { called = true; return Response.json({ audioContent: mp3 }); }).synthesize('Hallo', before.signal), { name: 'AbortError' });
  assert.equal(called, false);
  const during = new AbortController();
  const speech = service(async (_input, init) => {
    assert.ok(init?.signal); during.abort();
    return Response.json({ audioContent: mp3 });
  });
  await assert.rejects(speech.synthesize('Hallo', during.signal), { name: 'AbortError' });
});

test('response size is bounded and missing keys never trigger a request', async () => {
  await assert.rejects(service(async () => new Response('{}', { headers: { 'content-length': '999999999' } })).synthesize('Hallo'), /groß/);
  let called = false;
  const speech = new SpeechService({ getKey: () => undefined, getVoice: () => 'Dennis', fetch: (async () => { called = true; return Response.json({}); }) as typeof fetch });
  await assert.rejects(speech.synthesize('Hallo'), /Verbindungen/);
  assert.equal(called, false);
});

test('receipt phrases are vertont once per voice and then served from memory and disk', async () => {
  const { mkdtempSync, readdirSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = mkdtempSync(join(tmpdir(), 'openhiatus-speech-cache-'));
  try {
    let calls = 0; let voice = 'Dennis';
    const handler = (async () => { calls++; return Response.json({ audioContent: mp3 }); }) as typeof fetch;
    const speech = new SpeechService({ getKey: () => key, getVoice: () => voice, fetch: handler, cacheDirectory: directory });
    await speech.prewarm(['Mach ich.', 'Verstanden.']);
    assert.equal(calls, 2);
    assert.deepEqual(await speech.synthesize('Mach ich.'), { base64: mp3, mimeType: 'audio/mpeg' });
    assert.equal(calls, 2, 'a cached receipt needs no provider call');
    assert.equal(readdirSync(directory).length, 2);
    const restarted = new SpeechService({ getKey: () => key, getVoice: () => voice, fetch: handler, cacheDirectory: directory });
    await restarted.prewarm(['Mach ich.', 'Verstanden.']);
    assert.equal(calls, 2, 'a restart reuses the stored phrases');
    voice = 'Josef';
    await restarted.synthesize('Mach ich.');
    assert.equal(calls, 3, 'another voice is vertont separately');
    await restarted.synthesize('Eine normale Antwort.'); await restarted.synthesize('Eine normale Antwort.');
    assert.equal(calls, 5, 'ordinary replies are never cached');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
