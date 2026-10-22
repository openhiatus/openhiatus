import type { Earcon } from './features/voice';
export type { Earcon } from './features/voice';

/** Short, quiet, locally synthesised cues. They never reach a provider and carry no claim beyond the event itself. */

interface Tone { frequency: number; at: number; length: number; gain?: number; type?: OscillatorType }
const tones: Record<Earcon, Tone[]> = {
  listen: [{ frequency: 660, at: 0, length: 0.07 }, { frequency: 880, at: 0.075, length: 0.09 }],
  heard: [{ frequency: 880, at: 0, length: 0.07 }, { frequency: 660, at: 0.075, length: 0.09 }],
  sent: [{ frequency: 1046, at: 0, length: 0.08, gain: 0.6 }],
  done: [{ frequency: 523, at: 0, length: 0.12 }, { frequency: 659, at: 0.1, length: 0.12 }, { frequency: 784, at: 0.2, length: 0.2 }],
  error: [{ frequency: 330, at: 0, length: 0.12, type: 'triangle' }, { frequency: 262, at: 0.13, length: 0.18, type: 'triangle' }],
};

export class EarconPlayer {
  private context?: AudioContext;
  private sink = 'default';
  private sources = new Set<OscillatorNode>();
  private generation = 0;
  private disposed = false;

  async play(name: Earcon, outputDeviceId = 'default', volume = 0.08): Promise<void> {
    if (this.disposed || typeof AudioContext === 'undefined') return;
    const generation = this.generation;
    const context = this.context ??= new AudioContext({ latencyHint: 'interactive' });
    if (outputDeviceId !== this.sink && 'setSinkId' in context) {
      try { await (context as AudioContext & { setSinkId(id: string): Promise<void> }).setSinkId(outputDeviceId === 'default' ? '' : outputDeviceId); this.sink = outputDeviceId; }
      catch { /* an unavailable device falls back to the current output */ }
    }
    if (this.disposed || generation !== this.generation) return;
    if (context.state === 'suspended') await context.resume().catch(() => {});
    if (this.disposed || generation !== this.generation) return;
    const start = context.currentTime + 0.01;
    for (const tone of tones[name]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = tone.type ?? 'sine';
      oscillator.frequency.value = tone.frequency;
      const peak = volume * (tone.gain ?? 1);
      // Soft attack and release avoid clicks.
      gain.gain.setValueAtTime(0, start + tone.at);
      gain.gain.linearRampToValueAtTime(peak, start + tone.at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.at + tone.length);
      oscillator.connect(gain).connect(context.destination);
      oscillator.onended = () => { this.sources.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      this.sources.add(oscillator);
      oscillator.start(start + tone.at); oscillator.stop(start + tone.at + tone.length + 0.02);
    }
  }

  /** Stop silences cues immediately as well. */
  stop(): void { this.generation++; for (const source of this.sources) { try { source.stop(); } catch { /* already ended */ } } this.sources.clear(); }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.stop();
    const context = this.context; this.context = undefined;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }
}
