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

export interface SampleMetadata {
  id: string;
  name: string;
  file_path: string;
  duration_seconds: number;
  sample_rate: number;
  channels: number;
  waveform_peaks: number[];
}

export interface BrowserEntry {
  name: string;
  path: string;
  is_directory: boolean;
  extension: string | null;
  size_bytes: number | null;
}

/**
 * Decodes and loads an audio sample into the Rust audio engine.
 */
export async function loadSample(filePath: string): Promise<SampleMetadata> {
  if (!isTauriEnvironment()) {
    const filename = filePath.split(/[/\\]/).pop() || "sample.wav";
    return {
      id: `sample-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: filename.replace(/\.[^/.]+$/, ""),
      file_path: filePath,
      duration_seconds: 0.85,
      sample_rate: 44100,
      channels: 2,
      waveform_peaks: Array.from({ length: 64 }, () => Math.random() * 0.8 + 0.1),
    };
  }

  return await invoke<SampleMetadata>("load_sample", { filePath });
}

/**
 * Auditions / previews an audio file through the audio engine's audition voice.
 */
export async function previewSample(filePath: string): Promise<void> {
  if (!isTauriEnvironment()) {
    fallbackEngine.init();
    // Simulate short audition beep/hit in browser
    return;
  }

  try {
    await invoke("preview_sample", { filePath });
  } catch (err) {
    console.warn("[AudioBridge] invoke('preview_sample') error:", err);
  }
}

/**
 * Stops any ongoing sample audition preview.
 */
export async function stopPreview(): Promise<void> {
  if (!isTauriEnvironment()) return;

  try {
    await invoke("stop_preview");
  } catch (err) {
    console.warn("[AudioBridge] invoke('stop_preview') error:", err);
  }
}

/**
 * Assigns an audio sample to a specific channel index in the DSP engine.
 */
export async function assignChannelSample(
  channelIndex: number,
  sampleId: string
): Promise<void> {
  if (!isTauriEnvironment()) return;

  try {
    await invoke("assign_channel_sample", { channelIndex, sampleId });
  } catch (err) {
    console.warn("[AudioBridge] invoke('assign_channel_sample') error:", err);
  }
}

/**
 * Lists contents of a directory with audio files and folders for the Sample Browser.
 */
export async function listBrowserDirectory(
  dirPath?: string
): Promise<BrowserEntry[]> {
  if (!isTauriEnvironment()) {
    if (!dirPath) {
      return [
        {
          name: "Factory Drum Kits",
          path: "samples/factory",
          is_directory: true,
          extension: null,
          size_bytes: null,
        },
        {
          name: "Project Samples",
          path: "samples/project",
          is_directory: true,
          extension: null,
          size_bytes: null,
        },
        {
          name: "Desktop",
          path: "desktop",
          is_directory: true,
          extension: null,
          size_bytes: null,
        },
      ];
    }

    return [
      {
        name: "808 Kick Punch.wav",
        path: `${dirPath}/808 Kick Punch.wav`,
        is_directory: false,
        extension: "wav",
        size_bytes: 78200,
      },
      {
        name: "Trap Clap Crisp.wav",
        path: `${dirPath}/Trap Clap Crisp.wav`,
        is_directory: false,
        extension: "wav",
        size_bytes: 62400,
      },
      {
        name: "909 Snare Fat.wav",
        path: `${dirPath}/909 Snare Fat.wav`,
        is_directory: false,
        extension: "wav",
        size_bytes: 54100,
      },
      {
        name: "Closed Hat Metallic.wav",
        path: `${dirPath}/Closed Hat Metallic.wav`,
        is_directory: false,
        extension: "wav",
        size_bytes: 18400,
      },
      {
        name: "Open Hat Sizzle.wav",
        path: `${dirPath}/Open Hat Sizzle.wav`,
        is_directory: false,
        extension: "wav",
        size_bytes: 65200,
      },
      {
        name: "Perc Rimshot Oak.wav",
        path: `${dirPath}/Perc Rimshot Oak.wav`,
        is_directory: false,
        extension: "wav",
        size_bytes: 22800,
      },
      {
        name: "Sub 808 Deep.wav",
        path: `${dirPath}/Sub 808 Deep.wav`,
        is_directory: false,
        extension: "wav",
        size_bytes: 142000,
      },
    ];
  }

  return await invoke<BrowserEntry[]>("list_browser_directory", { dirPath });
}

export interface AudioDeviceDescriptor {
  id: string;
  name: string;
  is_default: boolean;
}

export interface RecordedClipMetadata {
  file_path: string;
  filename: string;
  duration_seconds: number;
  sample_rate: number;
  channels: number;
  waveform_peaks: number[];
  track_id: string;
  track_index: number;
}

/**
 * Enumerates available audio input devices (microphones and line-in ports).
 */
export async function getAudioInputDevices(): Promise<AudioDeviceDescriptor[]> {
  if (!isTauriEnvironment()) {
    return [
      {
        id: "web-audio-input",
        name: "Default Microphone (WASAPI Emulated)",
        is_default: true,
      },
      {
        id: "line-in-2",
        name: "Line In 1/2 (Audio Interface)",
        is_default: false,
      },
    ];
  }
  try {
    return await invoke<AudioDeviceDescriptor[]>("get_audio_input_devices");
  } catch (err) {
    console.warn("[AudioBridge] invoke('get_audio_input_devices') error:", err);
    return [
      {
        id: "default-input",
        name: "Default Microphone / Line In",
        is_default: true,
      },
    ];
  }
}

/**
 * Arms and starts hardware audio recording on the specified track.
 */
export async function startRecording(
  trackId: string,
  trackIndex: number
): Promise<string> {
  if (!isTauriEnvironment()) {
    console.log(
      `[AudioBridge] Web Audio fallback recording started for track ${trackId} (index ${trackIndex})`
    );
    return `recordings/rec_${trackId}_${Date.now()}.wav`;
  }
  return await invoke<string>("start_recording", { trackId, trackIndex });
}

/**
 * Finalizes writing the recorded WAV file, computes normalized peaks, and returns clip metadata.
 */
export async function stopRecording(): Promise<RecordedClipMetadata> {
  if (!isTauriEnvironment()) {
    console.log("[AudioBridge] Web Audio fallback recording stopped");
    const peaks = Array.from({ length: 64 }, (_, i) => {
      const envelope = Math.sin((i / 64) * Math.PI);
      const noise = (Math.random() - 0.5) * 0.3;
      return Math.max(0.05, Math.min(1.0, envelope * 0.8 + noise));
    });

    return {
      file_path: "recordings/browser_take_1.wav",
      filename: "rec_live_take_1.wav",
      duration_seconds: 4.0,
      sample_rate: 44100,
      channels: 2,
      waveform_peaks: peaks,
      track_id: "audio-1",
      track_index: 0,
    };
  }
  return await invoke<RecordedClipMetadata>("stop_recording");
}

/**
 * Returns current real-time peak audio level from the active recording stream.
 */
export async function getRecordingPeakLevel(): Promise<number> {
  if (!isTauriEnvironment()) {
    return Math.random() * 0.35;
  }
  try {
    return await invoke<number>("get_recording_peak_level");
  } catch {
    return 0.0;
  }
}

/**
 * Enables or disables software input monitoring through headphones/speakers.
 */
export async function setRecordingMonitoring(enabled: boolean): Promise<void> {
  if (!isTauriEnvironment()) return;
  try {
    await invoke("set_recording_monitoring", { enabled });
  } catch (err) {
    console.warn("[AudioBridge] invoke('set_recording_monitoring') error:", err);
  }
}

export type CompressorCircuit = "Platinum" | "VintageVca" | "VintageFet" | "VintageOpto";

export interface CompressorParams {
  circuit: CompressorCircuit;
  threshold_db: number;
  ratio: number;
  attack_ms: number;
  release_ms: number;
  knee: number;
  makeup_gain_db: number;
  sidechain_lowcut_hz: number;
  is_enabled: boolean;
  listen_sidechain: boolean;
}

/**
 * Updates real-time parameters for the modeled compressor on trackIndex (0..7 channel, 8 master).
 */
export async function setCompressorParams(
  trackIndex: number,
  params: CompressorParams
): Promise<void> {
  if (!isTauriEnvironment()) {
    return;
  }
  try {
    await invoke("set_compressor_params", { trackIndex, params });
  } catch (err) {
    console.warn("[AudioBridge] invoke('set_compressor_params') error:", err);
  }
}

/**
 * Polls the current gain reduction in dB from the Rust audio thread atomic meter.
 */
export async function getCompressorReduction(
  trackIndex: number
): Promise<number> {
  if (!isTauriEnvironment()) {
    return 0.0;
  }
  try {
    return await invoke<number>("get_compressor_reduction", { trackIndex });
  } catch {
    return 0.0;
  }
}

export type FilterType = "Highpass" | "LowShelf" | "Peaking" | "HighShelf" | "Lowpass";

export interface EqBandParams {
  filter_type: FilterType;
  is_active: boolean;
  frequency_hz: number;
  gain_db: number;
  q: number;
  slope_order: number;
}

export interface EqualizerParams {
  bands: EqBandParams[];
  output_gain_db: number;
  is_enabled: boolean;
  spectrum_post_eq: boolean;
}

/**
 * Updates real-time parameters for the 8-band parametric EQ on trackIndex (0..7 channel, 8 master).
 */
export async function setEqualizerParams(
  trackIndex: number,
  params: EqualizerParams
): Promise<void> {
  if (!isTauriEnvironment()) {
    return;
  }
  try {
    await invoke("set_equalizer_params", { trackIndex, params });
  } catch (err) {
    console.warn("[AudioBridge] invoke('set_equalizer_params') error:", err);
  }
}

/**
 * Polls the current 128 normalized FFT spectrum peaks from the Rust audio thread.
 */
export async function getSpectrumPeaks(
  trackIndex: number
): Promise<number[]> {
  if (!isTauriEnvironment()) {
    return Array.from({ length: 128 }, (_, i) => {
      const freqFactor = Math.sin((i / 128) * Math.PI);
      return Math.max(0, freqFactor * 0.4 + Math.random() * 0.15);
    });
  }
  try {
    return await invoke<number[]>("get_spectrum_peaks", { trackIndex });
  } catch {
    return new Array(128).fill(0);
  }
}

export type OscWaveform =
  | "Sine"
  | "Triangle"
  | "Sawtooth"
  | "Pulse"
  | "WhiteNoise";

export interface OscParams {
  waveform: OscWaveform;
  pulse_width: number; // 0.05 to 0.95
  coarse_tune: number; // -24 to +24
  fine_tune: number; // -100 to +100 cents
  volume: number; // 0.0 to 1.0
  pan: number; // -1.0 to 1.0
  unison_voices: number; // 1 to 4
  unison_detune: number; // 0.0 to 1.0
  is_enabled: boolean;
}

export interface AhdsrParams {
  attack_ms: number; // 0.5 to 10000 ms
  hold_ms: number; // 0.0 to 5000 ms
  decay_ms: number; // 1.0 to 10000 ms
  sustain_level: number; // 0.0 to 1.0
  release_ms: number; // 1.0 to 10000 ms
}

export type FilterMode =
  | "Lowpass12"
  | "Lowpass24"
  | "Highpass12"
  | "Highpass24"
  | "Bandpass"
  | "Notch";

export interface FilterParams {
  mode: FilterMode;
  cutoff_hz: number; // 20.0 to 20000.0 Hz
  resonance: number; // 0.0 to 0.98
  drive: number; // 0.0 to 1.0
  env2_amount: number; // -1.0 to 1.0
  is_enabled: boolean;
}

export type LfoWaveform =
  | "Sine"
  | "Triangle"
  | "Saw"
  | "Square"
  | "SampleAndHold";

export interface LfoParams {
  waveform: LfoWaveform;
  rate_sync_div: number; // 1 to 32 (1/1 to 1/32)
  cutoff_depth: number; // 0.0 to 1.0
  pitch_depth: number; // 0.0 to 1.0
  pwm_depth: number; // 0.0 to 1.0
  is_enabled: boolean;
}

export interface SynthSnapshot {
  name: string;
  x: number;
  y: number;
  osc_a: OscParams;
  osc_b: OscParams;
  filter: FilterParams;
  env1: AhdsrParams;
  env2: AhdsrParams;
}

export interface SynthParams {
  osc_a: OscParams;
  osc_b: OscParams;
  filter: FilterParams;
  env1: AhdsrParams;
  env2: AhdsrParams;
  lfo: LfoParams;
  morph_x: number;
  morph_y: number;
  snapshots: SynthSnapshot[];
  master_volume: number;
  glide_time_ms: number;
}

export const DEFAULT_OSC_A: OscParams = {
  waveform: "Sawtooth",
  pulse_width: 0.5,
  coarse_tune: 0,
  fine_tune: 0,
  volume: 0.8,
  pan: 0.0,
  unison_voices: 1,
  unison_detune: 0.15,
  is_enabled: true,
};

export const DEFAULT_OSC_B: OscParams = {
  waveform: "Pulse",
  pulse_width: 0.35,
  coarse_tune: 0,
  fine_tune: 7,
  volume: 0.6,
  pan: 0.0,
  unison_voices: 1,
  unison_detune: 0.2,
  is_enabled: true,
};

export const DEFAULT_FILTER: FilterParams = {
  mode: "Lowpass24",
  cutoff_hz: 3500,
  resonance: 0.25,
  drive: 0.15,
  env2_amount: 0.4,
  is_enabled: true,
};

export const DEFAULT_ENV1: AhdsrParams = {
  attack_ms: 12,
  hold_ms: 0,
  decay_ms: 320,
  sustain_level: 0.7,
  release_ms: 350,
};

export const DEFAULT_ENV2: AhdsrParams = {
  attack_ms: 5,
  hold_ms: 0,
  decay_ms: 450,
  sustain_level: 0.15,
  release_ms: 250,
};

export const DEFAULT_LFO: LfoParams = {
  waveform: "Triangle",
  rate_sync_div: 4, // 1/4 beat
  cutoff_depth: 0.15,
  pitch_depth: 0.0,
  pwm_depth: 0.25,
  is_enabled: true,
};

export const DEFAULT_SYNTH_SNAPSHOTS: SynthSnapshot[] = [
  {
    name: "Pure Saw",
    x: 0.15,
    y: 0.15,
    osc_a: { ...DEFAULT_OSC_A, waveform: "Sawtooth" },
    osc_b: { ...DEFAULT_OSC_B, is_enabled: false },
    filter: { ...DEFAULT_FILTER, cutoff_hz: 12000, resonance: 0.1 },
    env1: { ...DEFAULT_ENV1 },
    env2: { ...DEFAULT_ENV2 },
  },
  {
    name: "Acid Bite",
    x: 0.5,
    y: 0.1,
    osc_a: { ...DEFAULT_OSC_A, waveform: "Sawtooth" },
    osc_b: { ...DEFAULT_OSC_B, is_enabled: false },
    filter: { ...DEFAULT_FILTER, cutoff_hz: 900, resonance: 0.85, drive: 0.6, env2_amount: 0.8 },
    env1: { ...DEFAULT_ENV1, decay_ms: 180, sustain_level: 0.2 },
    env2: { ...DEFAULT_ENV2, decay_ms: 140, sustain_level: 0.0 },
  },
  {
    name: "Sub Rez",
    x: 0.85,
    y: 0.15,
    osc_a: { ...DEFAULT_OSC_A, waveform: "Sine", volume: 1.0 },
    osc_b: { ...DEFAULT_OSC_B, waveform: "Triangle", coarse_tune: -12, volume: 0.7 },
    filter: { ...DEFAULT_FILTER, cutoff_hz: 450, resonance: 0.4 },
    env1: { ...DEFAULT_ENV1, release_ms: 450 },
    env2: { ...DEFAULT_ENV2 },
  },
  {
    name: "Pulse PWM",
    x: 0.9,
    y: 0.5,
    osc_a: { ...DEFAULT_OSC_A, waveform: "Pulse", pulse_width: 0.2 },
    osc_b: { ...DEFAULT_OSC_B, waveform: "Pulse", pulse_width: 0.7, fine_tune: 12 },
    filter: { ...DEFAULT_FILTER, cutoff_hz: 3200, resonance: 0.3 },
    env1: { ...DEFAULT_ENV1 },
    env2: { ...DEFAULT_ENV2 },
  },
  {
    name: "Lush Pad",
    x: 0.85,
    y: 0.85,
    osc_a: { ...DEFAULT_OSC_A, unison_voices: 4, unison_detune: 0.35 },
    osc_b: { ...DEFAULT_OSC_B, unison_voices: 4, unison_detune: 0.4 },
    filter: { ...DEFAULT_FILTER, cutoff_hz: 1800, resonance: 0.2 },
    env1: { ...DEFAULT_ENV1, attack_ms: 450, sustain_level: 0.8, release_ms: 1200 },
    env2: { ...DEFAULT_ENV2, attack_ms: 350 },
  },
  {
    name: "Pluck Bell",
    x: 0.5,
    y: 0.9,
    osc_a: { ...DEFAULT_OSC_A, waveform: "Sine" },
    osc_b: { ...DEFAULT_OSC_B, waveform: "Triangle", coarse_tune: 19 },
    filter: { ...DEFAULT_FILTER, cutoff_hz: 2400, resonance: 0.5, env2_amount: 0.9 },
    env1: { ...DEFAULT_ENV1, attack_ms: 2, decay_ms: 180, sustain_level: 0.0, release_ms: 220 },
    env2: { ...DEFAULT_ENV2, attack_ms: 1, decay_ms: 120, sustain_level: 0.0, release_ms: 120 },
  },
  {
    name: "Glide Lead",
    x: 0.15,
    y: 0.85,
    osc_a: { ...DEFAULT_OSC_A, waveform: "Sawtooth", unison_voices: 2, unison_detune: 0.18 },
    osc_b: { ...DEFAULT_OSC_B, waveform: "Pulse", coarse_tune: 12 },
    filter: { ...DEFAULT_FILTER, cutoff_hz: 6500, resonance: 0.35, drive: 0.3 },
    env1: { ...DEFAULT_ENV1, attack_ms: 8, release_ms: 280 },
    env2: { ...DEFAULT_ENV2 },
  },
  {
    name: "Retro Noise",
    x: 0.1,
    y: 0.5,
    osc_a: { ...DEFAULT_OSC_A, waveform: "Pulse", pulse_width: 0.15 },
    osc_b: { ...DEFAULT_OSC_B, waveform: "WhiteNoise", volume: 0.3 },
    filter: { ...DEFAULT_FILTER, cutoff_hz: 4000, resonance: 0.6 },
    env1: { ...DEFAULT_ENV1, decay_ms: 240 },
    env2: { ...DEFAULT_ENV2 },
  },
];

export const DEFAULT_SYNTH_PARAMS: SynthParams = {
  osc_a: { ...DEFAULT_OSC_A },
  osc_b: { ...DEFAULT_OSC_B },
  filter: { ...DEFAULT_FILTER },
  env1: { ...DEFAULT_ENV1 },
  env2: { ...DEFAULT_ENV2 },
  lfo: { ...DEFAULT_LFO },
  morph_x: 0.5,
  morph_y: 0.5,
  snapshots: DEFAULT_SYNTH_SNAPSHOTS,
  master_volume: 0.8,
  glide_time_ms: 0.0,
};

/**
 * Updates real-time parameters for the Multi-Engine PolySynth on trackIndex.
 */
export async function setSynthParams(
  trackIndex: number,
  params: SynthParams
): Promise<void> {
  if (!isTauriEnvironment()) {
    return;
  }
  try {
    await invoke("set_synth_params", { trackIndex, params });
  } catch (err) {
    console.warn("[AudioBridge] invoke('set_synth_params') error:", err);
  }
}

/**
 * Sets the 2D XY morph pad position for trackIndex.
 */
export async function setSynthMorph(
  trackIndex: number,
  x: number,
  y: number
): Promise<void> {
  if (!isTauriEnvironment()) {
    return;
  }
  try {
    await invoke("set_synth_morph", { trackIndex, x, y });
  } catch (err) {
    console.warn("[AudioBridge] invoke('set_synth_morph') error:", err);
  }
}

/**
 * Polls the current active polyphony voice count for trackIndex.
 */
export async function getActiveSynthVoices(
  trackIndex: number
): Promise<number> {
  if (!isTauriEnvironment()) {
    return 0;
  }
  try {
    return await invoke<number>("get_active_synth_voices", { trackIndex });
  } catch {
    return 0;
  }
}

/**
 * Manually triggers a note on the polyphonic synth.
 */
export async function triggerSynthNote(
  trackIndex: number,
  note: number,
  velocity: number = 0.85
): Promise<void> {
  if (!isTauriEnvironment()) {
    return;
  }
  try {
    await invoke("trigger_synth_note", { trackIndex, note, velocity });
  } catch (err) {
    console.warn("[AudioBridge] invoke('trigger_synth_note') error:", err);
  }
}

/**
 * Manually releases a note on the polyphonic synth.
 */
export async function releaseSynthNote(
  trackIndex: number,
  note: number
): Promise<void> {
  if (!isTauriEnvironment()) {
    return;
  }
  try {
    await invoke("release_synth_note", { trackIndex, note });
  } catch (err) {
    console.warn("[AudioBridge] invoke('release_synth_note') error:", err);
  }
}

/**
 * Sends a panic command releasing all sounding notes on trackIndex.
 */
export async function synthPanic(trackIndex: number): Promise<void> {
  if (!isTauriEnvironment()) {
    return;
  }
  try {
    await invoke("synth_panic", { trackIndex });
  } catch (err) {
    console.warn("[AudioBridge] invoke('synth_panic') error:", err);
  }
}



