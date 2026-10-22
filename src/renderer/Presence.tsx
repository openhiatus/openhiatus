import { useEffect, useRef } from 'react';

export type PresenceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'working' | 'offline' | 'error';

/** Measures what the player actually outputs; the element keeps its own sink, the analyser is not audible. */
export class OutputMeter {
  private context?: AudioContext;
  private analyser?: AnalyserNode;
  private source?: MediaStreamAudioSourceNode;
  private samples?: Uint8Array<ArrayBuffer>;

  attach(audio: HTMLAudioElement): boolean {
    this.detach();
    const capture = (audio as HTMLAudioElement & { captureStream?(): MediaStream }).captureStream;
    if (!capture || typeof AudioContext === 'undefined') return false;
    try {
      const stream = capture.call(audio);
      if (!stream.getAudioTracks().length) return false;
      const context = this.context ??= new AudioContext();
      this.analyser = context.createAnalyser(); this.analyser.fftSize = 512;
      this.samples = new Uint8Array(this.analyser.fftSize);
      this.source = context.createMediaStreamSource(stream); this.source.connect(this.analyser);
      if (context.state === 'suspended') void context.resume().catch(() => {});
      return true;
    } catch { this.detach(); return false; }
  }

  level(): number {
    if (!this.analyser || !this.samples) return 0;
    this.analyser.getByteTimeDomainData(this.samples);
    let energy = 0;
    for (const sample of this.samples) { const value = (sample - 128) / 128; energy += value * value; }
    return Math.min(1, Math.sqrt(energy / this.samples.length) * 4);
  }

  get active(): boolean { return !!this.analyser; }
  detach(): void { this.source?.disconnect(); this.analyser?.disconnect(); this.source = undefined; this.analyser = undefined; this.samples = undefined; }
  dispose(): void {
    this.detach();
    const context = this.context; this.context = undefined;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * openHiatus' visible presence. Level-driven states read `level()` per animation frame and write a CSS variable,
 * so audio levels never cause React renders.
 */
export function Presence({ state, level, size = 'compact', label }: { state: PresenceState; level?: () => number | undefined; size?: 'compact' | 'large'; label?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const levelRef = useRef(level);
  levelRef.current = level;
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    element.style.setProperty('--level', '0');
    if ((state !== 'listening' && state !== 'speaking') || reducedMotion()) return;
    let frame = 0; let smoothed = 0; let phase = 0;
    const tick = () => {
      const measured = levelRef.current?.();
      // Without a measurable output the speaking state still moves gently instead of freezing.
      const target = measured ?? (state === 'speaking' ? 0.3 + Math.sin(phase += 0.17) * 0.18 : 0);
      smoothed += (target - smoothed) * (target > smoothed ? 0.35 : 0.12);
      element.style.setProperty('--level', smoothed.toFixed(3));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); element.style.setProperty('--level', '0'); };
  }, [state]);
  return <div ref={root} className={`presence ${size} ${state}`} role="img" aria-label={label ?? `openHiatus: ${state}`}>
    <span className="presence-halo" />
    <span className="presence-ring" />
    <span className="presence-core"><span className="presence-mark"><span /><i /></span></span>
    <span className="presence-orbit"><i /></span>
  </div>;
}
