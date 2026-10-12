import { invoke } from "@tauri-apps/api/core";

export interface ChannelSyncData {
  id: string;
  name: string;
  steps: boolean[];
}

/**
 * Checks whether the current execution runtime has Tauri 2 internals present.
 */
export const isTauriEnvironment = (): boolean => {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  );
};

/**
 * Browser Web Audio fallback synthesizer for development outside of Tauri.
 * Simulates the 4 default percussion voices:
 * - Voice 0: 808 Sine Pitch-Drop Kick
 * - Voice 1: Snare / Clap
 * - Voice 2: Metallic Noise Hi-Hat
 * - Voice 3: Snare
 */
class WebAudioFallbackEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private isPlaying = false;
  private bpm = 140.0;
  private currentStep = 0;
  private timer: number | null = null;
  private channels: ChannelSyncData[] = [];

  public init(): void {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
        this.createNoiseBuffer();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  private createNoiseBuffer(): void {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  public setBpm(bpm: number): void {
    this.bpm = bpm;
    if (this.isPlaying) {
      this.stop();
      this.play();
    }
  }

  public syncPattern(channels: ChannelSyncData[]): void {
    this.channels = channels;
  }

  public play(): void {
    this.init();
    if (this.isPlaying) return;
    this.isPlaying = true;

    const stepIntervalMs = (60000 / this.bpm) / 4;
    this.timer = window.setInterval(() => {
      this.triggerStep(this.currentStep);
      this.currentStep = (this.currentStep + 1) % 16;
    }, stepIntervalMs);
  }

  public stop(): void {
    this.isPlaying = false;
    this.currentStep = 0;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private triggerStep(step: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    for (let chIdx = 0; chIdx < this.channels.length; chIdx++) {
      const channel = this.channels[chIdx];
      if (channel.steps[step]) {
        this.playVoice(chIdx, now);
      }
    }
  }

  private playVoice(voiceIndex: number, time: number): void {
    if (!this.ctx) return;

    switch (voiceIndex % 4) {
      case 0:
        // 808 Sine Pitch-Drop Kick
        this.playKick(time);
        break;
      case 1:
        // Clap
        this.playClap(time);
        break;
      case 2:
        // Metallic Hi-Hat
        this.playHiHat(time);
        break;
      case 3:
        // Snare
        this.playSnare(time);
        break;
    }
  }

  private playKick(time: number): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.08);

    gain.gain.setValueAtTime(0.9, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + 0.35);
  }

  private playClap(time: number): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1200, time);
    filter.Q.setValueAtTime(2.0, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.7, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    source.start(time);
    source.stop(time + 0.18);
  }

  private playHiHat(time: number): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(7500, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.06);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    source.start(time);
    source.stop(time + 0.06);
  }

  private playSnare(time: number): void {
    if (!this.ctx || !this.noiseBuffer) return;
    // Tonal body
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.frequency.setValueAtTime(185, time);
    oscGain.gain.setValueAtTime(0.4, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.start(time);
    osc.stop(time + 0.12);

    // Noise snap
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = "highpass";
    noiseFilter.frequency.setValueAtTime(1800, time);
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);
    noise.start(time);
    noise.stop(time + 0.18);
  }
}

const fallbackEngine = new WebAudioFallbackEngine();

/**
 * Starts the native CPAL audio engine or initializes Web Audio fallback.
 */
export async function startAudio(): Promise<string> {
  if (!isTauriEnvironment()) {
    console.info("[AudioBridge] Browser mode: utilizing Web Audio fallback clock.");
    fallbackEngine.init();
    return "browser_web_audio_active";
  }

  try {
    const res = await invoke<string>("start_audio");
    return res;
  } catch (err) {
    console.warn("[AudioBridge] invoke('start_audio') failed, falling back:", err);
    fallbackEngine.init();
    return "fallback_after_error";
  }
}

/**
 * Triggers audio playback across the lock-free ringbuffer or fallback clock.
 */
export async function playTransport(): Promise<void> {
  if (!isTauriEnvironment()) {
    fallbackEngine.play();
    return;
  }

  try {
    await invoke("play_transport");
  } catch (err) {
    console.warn("[AudioBridge] invoke('play_transport') error:", err);
    fallbackEngine.play();
  }
}

/**
 * Stops playback across the lock-free ringbuffer or fallback clock.
 */
export async function stopTransport(): Promise<void> {
  if (!isTauriEnvironment()) {
    fallbackEngine.stop();
    return;
  }

  try {
    await invoke("stop_transport");
  } catch (err) {
    console.warn("[AudioBridge] invoke('stop_transport') error:", err);
    fallbackEngine.stop();
  }
}

/**
 * Updates playback BPM across the lock-free ringbuffer.
 */
export async function setTempo(bpm: number): Promise<void> {
  if (!isTauriEnvironment()) {
    fallbackEngine.setBpm(bpm);
    return;
  }

  try {
    await invoke("set_tempo", { bpm });
  } catch (err) {
    console.warn("[AudioBridge] invoke('set_tempo') error:", err);
    fallbackEngine.setBpm(bpm);
  }
}

/**
 * Synchronizes step sequences for all channels to the Rust DSP engine.
 */
export async function syncPattern(channels: ChannelSyncData[]): Promise<void> {
  if (!isTauriEnvironment()) {
    fallbackEngine.syncPattern(channels);
    return;
  }

  try {
    await invoke("sync_pattern", { channels });
  } catch (err) {
    console.warn("[AudioBridge] invoke('sync_pattern') error:", err);
    fallbackEngine.syncPattern(channels);
  }
}
