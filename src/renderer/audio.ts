import { t, translateDiagnostic } from '../shared/i18n';
import type { AudioClip } from '../shared/contracts';

/** Encode actual microphone samples as mono PCM; the provider receives a normal WAV. */
export function encodeWav(samples: Float32Array, sourceRate: number, targetRate = 16_000): Uint8Array {
  const length = Math.floor(samples.length * targetRate / sourceRate);
  const bytes = new Uint8Array(44 + length * 2);
  const view = new DataView(bytes.buffer);
  const label = (at: number, text: string) => [...text].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)));
  label(0, 'RIFF'); view.setUint32(4, 36 + length * 2, true); label(8, 'WAVE');
  label(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, targetRate, true); view.setUint32(28, targetRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); label(36, 'data'); view.setUint32(40, length * 2, true);
  const ratio = sourceRate / targetRate;
  for (let i = 0; i < length; i++) {
    // Average source samples to avoid dropping most of the captured signal when downsampling.
    const from = Math.floor(i * ratio);
    const to = Math.min(samples.length, Math.max(from + 1, Math.floor((i + 1) * ratio)));
    let sample = 0;
    for (let j = from; j < to; j++) sample += samples[j];
    sample = Math.max(-1, Math.min(1, sample / (to - from)));
    view.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

export class MicrophoneRecorder {
  private stream?: MediaStream;
  private context?: AudioContext;
  private processor?: ScriptProcessorNode;
  private source?: MediaStreamAudioSourceNode;
  private silence?: GainNode;
  private chunks: Float32Array[] = [];
  private length = 0;
  private cancelled = false;
  private timer?: ReturnType<typeof setTimeout>;

  async start(deviceId: string, onLevel: (level: number) => void, onLimit: () => void, limit = 60_000): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: {
      deviceId: deviceId && deviceId !== 'default' ? { exact: deviceId } : undefined,
      channelCount: 1, echoCancellation: true, noiseSuppression: true,
    } });
    if (this.cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
    this.stream = stream;
    this.context = new AudioContext();
    await this.context.resume();
    if (this.cancelled) { this.dispose(); return; }
    this.source = this.context.createMediaStreamSource(stream);
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.silence = this.context.createGain();
    this.silence.gain.value = 0;
    this.processor.onaudioprocess = event => {
      if (this.cancelled) return;
      const samples = new Float32Array(event.inputBuffer.getChannelData(0));
      this.chunks.push(samples); this.length += samples.length;
      const energy = samples.reduce((sum, value) => sum + value * value, 0) / samples.length;
      onLevel(Math.min(1, Math.sqrt(energy) * 5));
    };
    this.source.connect(this.processor); this.processor.connect(this.silence); this.silence.connect(this.context.destination);
    this.timer = setTimeout(onLimit, limit);
  }

  stop(): AudioClip | null {
    const rate = this.context?.sampleRate ?? 48_000;
    this.cancelled = true;
    this.dispose();
    if (this.length < rate * 0.15) return null;
    const samples = new Float32Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) { samples.set(chunk, offset); offset += chunk.length; }
    this.chunks = [];
    return { base64: base64(encodeWav(samples, rate)), mimeType: 'audio/wav' };
  }

  cancel(): void { this.cancelled = true; this.chunks = []; this.length = 0; this.dispose(); }

  private dispose(): void {
    clearTimeout(this.timer);
    if (this.processor) this.processor.onaudioprocess = null;
    this.processor?.disconnect(); this.source?.disconnect(); this.silence?.disconnect();
    this.stream?.getTracks().forEach(track => track.stop());
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
  }
}

export function audioObjectUrl(clip: AudioClip): string {
  const raw = atob(clip.base64);
  const bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: clip.mimeType }));
}

export function friendlyAudioError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return t("Der Mikrofonzugriff wurde nicht erlaubt. Prüfe die Windows-Datenschutzeinstellungen. Du kannst weiterhin schreiben.");
    if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') return t("Das gewählte Mikrofon ist nicht verfügbar. Die Auswahl bleibt gespeichert. Verbinde es erneut oder wähle unter Sprache & Geräte ein anderes Gerät.");
    if (error.name === 'NotReadableError') return t("Das Mikrofon ist gerade nicht erreichbar. Möglicherweise verwendet es eine andere Anwendung.");
  }
  return error instanceof Error ? translateDiagnostic(error.message) : t("Der Sprachweg konnte nicht abgeschlossen werden. Schreiben ist weiterhin möglich.");
}
