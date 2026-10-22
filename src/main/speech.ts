import { APP_DISPLAY_NAME } from '../shared/branding';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AudioClip } from '../shared/contracts';
import { isReceiptPhrase } from '../shared/receipts';
import { toSpokenText } from '../shared/spoken-text';

export const STT_MODEL = 'inworld/inworld-stt-1';
export const TTS_MODEL = 'inworld-tts-2';
export const DEFAULT_VOICE = 'Dennis';
const ORIGIN = 'https://api.inworld.ai';
const MAX_RECORDING_BYTES = 60 * 16_000 * 2 + 4096;
const MAX_RESPONSE_BYTES = 24 * 1024 * 1024;
const MAX_TTS_CHARACTERS = 2000;
const TIMEOUT_MS = 60_000;

export interface SpeechOptions {
  getKey: () => string | undefined;
  getVoice: () => string;
  fetch?: typeof fetch;
  /** Receipt phrases are vertont once per voice and kept here, so they play without a provider round trip. */
  cacheDirectory?: string;
}

class SpeechError extends Error {}

function isMp3(audio: Buffer): boolean {
  return audio.length > 3 && (audio.toString('ascii', 0, 3) === 'ID3' || (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0));
}

function decodeBase64(value: unknown, maxBytes: number): Buffer {
  if (typeof value !== 'string' || value.length === 0 || value.length > Math.ceil(maxBytes / 3) * 4 ||
      value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new SpeechError('Die Audiodaten sind ungültig oder zu groß.');
  }
  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length || bytes.length > maxBytes) throw new SpeechError('Die Audiodaten sind ungültig oder zu groß.');
  return bytes;
}

/** Accept only the demo's actual recording format; a MIME label alone is not validation. */
function validateRecording(clip: AudioClip): void {
  if (!clip || !['audio/wav', 'audio/wave', 'audio/x-wav'].includes(clip.mimeType)) {
    throw new SpeechError('Bitte eine WAV-Aufnahme verwenden.');
  }
  const bytes = decodeBase64(clip.base64, MAX_RECORDING_BYTES);
  if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE' ||
      bytes.readUInt32LE(4) + 8 !== bytes.length) throw new SpeechError('Die WAV-Aufnahme ist beschädigt.');
  let format = false;
  let dataBytes = 0;
  for (let position = 12; position + 8 <= bytes.length;) {
    const name = bytes.toString('ascii', position, position + 4);
    const size = bytes.readUInt32LE(position + 4);
    const start = position + 8;
    if (start + size > bytes.length) throw new SpeechError('Die WAV-Aufnahme ist unvollständig.');
    if (name === 'fmt ') {
      if (size < 16 || bytes.readUInt16LE(start) !== 1 || bytes.readUInt16LE(start + 2) !== 1 ||
          bytes.readUInt32LE(start + 4) !== 16000 || bytes.readUInt32LE(start + 8) !== 32000 ||
          bytes.readUInt16LE(start + 12) !== 2 || bytes.readUInt16LE(start + 14) !== 16) {
        throw new SpeechError('Die Aufnahme muss PCM-WAV mit 16 kHz, 16 Bit und einem Kanal sein.');
      }
      format = true;
    }
    if (name === 'data') dataBytes += size;
    position = start + size + (size % 2);
  }
  if (!format || dataBytes < 2 || dataBytes % 2 || dataBytes > 60 * 32000) {
    throw new SpeechError('Die Aufnahme muss Ton enthalten und darf höchstens 60 Sekunden dauern.');
  }
}

async function readJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new SpeechError('Die Sprachantwort ist zu groß.');
  }
  if (!response.body) throw new SpeechError('Der Sprachdienst hat keine Antwort geliefert.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_RESPONSE_BYTES) throw new SpeechError('Die Sprachantwort ist zu groß.');
      chunks.push(value);
    }
    signal.throwIfAborted();
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new SpeechError('Der Sprachdienst hat eine ungültige Antwort geliefert.'); }
  } finally { await reader.cancel().catch(() => {}); }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export class SpeechService {
  private readonly request: typeof fetch;
  private readonly phrases = new Map<string, AudioClip>();
  constructor(private readonly options: SpeechOptions) { this.request = options.fetch ?? fetch; }

  private async post(path: string, payload: unknown, signal?: AbortSignal): Promise<Record<string, unknown>> {
    signal?.throwIfAborted();
    const key = this.options.getKey()?.trim();
    if (!key) throw new SpeechError('Bitte zuerst den Inworld-Schlüssel in Verbindungen speichern.');
    if (key.length > 8192 || !/^[A-Za-z0-9+/]+={0,2}$/.test(key)) {
      throw new SpeechError('Bitte die Base64-Zugangsdaten aus dem Inworld-Portal verwenden.');
    }
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const response = await this.request(`${ORIGIN}${path}`, {
        method: 'POST', redirect: 'error', signal: combined,
        headers: { Authorization: `Basic ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      combined.throwIfAborted();
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        if (response.status === 401 || response.status === 403) throw new SpeechError('Inworld hat den Schlüssel abgelehnt. Bitte Schlüssel und Berechtigungen prüfen.');
        if (response.status === 429) throw new SpeechError('Das Inworld-Limit ist erreicht. Bitte Guthaben und Anfragelimit prüfen.');
        throw new SpeechError(`Der Inworld-Sprachdienst hat die Anfrage abgelehnt (HTTP ${response.status}).`);
      }
      const result = record(await readJson(response, combined));
      if (!result || result.error || (typeof result.code === 'number' && result.code !== 0)) {
        throw new SpeechError('Der Inworld-Sprachdienst hat die Anfrage nicht erfolgreich verarbeitet.');
      }
      return result;
    } catch (error) {
      // Provider bodies and network exception messages can contain request secrets. Never forward them.
      if (signal?.aborted) throw new DOMException('Sprachanfrage gestoppt.', 'AbortError');
      if (timeout.aborted) throw new SpeechError('Der Sprachdienst hat nach 60 Sekunden nicht geantwortet. Bitte erneut versuchen.');
      if (error instanceof SpeechError) throw error;
      throw new SpeechError('Der Sprachdienst ist nicht erreichbar. Bitte die Internetverbindung prüfen.');
    }
  }

  async transcribe(clip: AudioClip, signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted();
    validateRecording(clip);
    const result = await this.post('/stt/v1/transcribe', {
      transcribeConfig: {
        modelId: STT_MODEL, audioEncoding: 'LINEAR16', language: 'de', sampleRateHertz: 16000, numberOfChannels: 1,
        voiceProfileConfig: { enableVoiceProfile: false },
      },
      audioData: { content: clip.base64 },
    }, signal);
    const transcription = record(result.transcription);
    if (typeof transcription?.transcript !== 'string' || transcription.transcript.length > 20000 || transcription.isFinal === false) {
      throw new SpeechError('Der Sprachdienst hat kein vollständiges Transkript geliefert.');
    }
    const text = transcription.transcript.trim();
    if (!text) throw new SpeechError('Keine Sprache erkannt. Bitte erneut aufnehmen.');
    return text;
  }

  async synthesize(text: string, signal?: AbortSignal): Promise<AudioClip> {
    signal?.throwIfAborted();
    if (typeof text !== 'string' || !text.trim()) throw new SpeechError('Es gibt noch keinen Text zum Vorlesen.');
    text = toSpokenText(text);
    if (!text) throw new SpeechError('Es gibt keinen lesbaren Text zum Vorlesen.');
    if (text.length > MAX_TTS_CHARACTERS) {
      throw new SpeechError('Diese Antwort ist länger als 2.000 Zeichen. Sie bleibt vollständig im Chat; die Sprachausgabe wurde übersprungen.');
    }
    const voiceId = this.options.getVoice().trim() || DEFAULT_VOICE;
    if (voiceId.length > 200 || /[\r\n\x00]/.test(voiceId)) throw new SpeechError('Die gewählte Stimme ist ungültig.');
    const cacheKey = isReceiptPhrase(text) ? createHash('sha256').update(`${TTS_MODEL}|${voiceId}|${text}`).digest('hex') : undefined;
    const cached = cacheKey && this.cachedPhrase(cacheKey);
    if (cached) return cached;
    const result = await this.post('/tts/v1/voice', {
      text, voiceId, modelId: TTS_MODEL, language: 'de-DE', deliveryMode: 'STABLE',
      audioConfig: { audioEncoding: 'MP3' },
    }, signal);
    const audio = decodeBase64(result.audioContent, 16 * 1024 * 1024);
    if (!isMp3(audio)) throw new SpeechError('Der Sprachdienst hat keine gültige MP3-Antwort geliefert.');
    const clip: AudioClip = { base64: result.audioContent as string, mimeType: 'audio/mpeg' };
    if (cacheKey) this.storePhrase(cacheKey, audio, clip);
    return clip;
  }

  /** Vertont fehlende Bestätigungssätze nacheinander; bereits gespeicherte kosten keinen Aufruf. */
  async prewarm(texts: readonly string[], signal?: AbortSignal): Promise<void> {
    for (const text of texts) { signal?.throwIfAborted(); await this.synthesize(text, signal); }
  }

  private cachedPhrase(key: string): AudioClip | undefined {
    const memory = this.phrases.get(key);
    if (memory || !this.options.cacheDirectory) return memory;
    try {
      const audio = readFileSync(join(this.options.cacheDirectory, `${key}.mp3`));
      if (!isMp3(audio)) return undefined;
      const clip: AudioClip = { base64: audio.toString('base64'), mimeType: 'audio/mpeg' };
      this.phrases.set(key, clip);
      return clip;
    } catch { return undefined; }
  }

  private storePhrase(key: string, audio: Buffer, clip: AudioClip): void {
    this.phrases.set(key, clip);
    if (!this.options.cacheDirectory) return;
    // The cache is a convenience; a failed write only means the phrase is vertont again later.
    try { mkdirSync(this.options.cacheDirectory, { recursive: true }); writeFileSync(join(this.options.cacheDirectory, `${key}.mp3`), audio); } catch { /* ignore */ }
  }

  test(signal?: AbortSignal): Promise<AudioClip> {
    return this.synthesize(`Hallo, ich bin ${APP_DISPLAY_NAME}. Die Sprachausgabe ist verbunden.`, signal);
  }
}
