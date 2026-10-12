/**
 * Lightweight Web Audio preview synthesizer for auditioning notes in the Piano Roll.
 */
class PreviewSynth {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playNote(pitch: number, durationSec = 0.28, velocity = 0.8): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const freq = 440 * Math.pow(2, (pitch - 69) / 12);
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      // Dual oscillator character (sawtooth + subtle sine body)
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, now);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(Math.min(12000, freq * 4), now);
      filter.frequency.exponentialRampToValueAtTime(Math.min(4000, freq * 1.5), now + durationSec);

      const targetGain = Math.max(0.01, Math.min(0.35, velocity * 0.35));
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(targetGain, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + durationSec);
    } catch {
      // Audio context might be restricted before interaction
    }
  }
}

export const previewSynth = new PreviewSynth();
