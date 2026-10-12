import { create } from "zustand";
import {
  type SynthParams,
  type OscParams,
  type FilterParams,
  type AhdsrParams,
  type LfoParams,
  DEFAULT_SYNTH_PARAMS,
  DEFAULT_OSC_A,
  DEFAULT_OSC_B,
  DEFAULT_FILTER,
  DEFAULT_LFO,
  setSynthParams,
  setSynthMorph,
  getActiveSynthVoices,
  triggerSynthNote,
  releaseSynthNote,
  synthPanic,
} from "@/lib/audio/tauri-bridge";

export interface SynthPreset {
  name: string;
  category: string;
  params: SynthParams;
}

export const SYNTH_PRESETS: Record<string, SynthPreset> = {
  "Init Saw": {
    name: "Init Saw",
    category: "Init",
    params: {
      ...DEFAULT_SYNTH_PARAMS,
      osc_a: {
        ...DEFAULT_OSC_A,
        waveform: "Sawtooth",
        volume: 0.8,
        unison_voices: 1,
      },
      osc_b: {
        ...DEFAULT_OSC_B,
        is_enabled: false,
      },
      filter: {
        ...DEFAULT_FILTER,
        mode: "Lowpass24",
        cutoff_hz: 14000,
        resonance: 0.1,
        drive: 0.0,
        env2_amount: 0.0,
      },
      env1: {
        attack_ms: 5,
        hold_ms: 0,
        decay_ms: 220,
        sustain_level: 0.8,
        release_ms: 200,
      },
      env2: {
        attack_ms: 5,
        hold_ms: 0,
        decay_ms: 300,
        sustain_level: 0.2,
        release_ms: 200,
      },
      lfo: {
        ...DEFAULT_LFO,
        cutoff_depth: 0.0,
        pitch_depth: 0.0,
        pwm_depth: 0.0,
      },
      morph_x: 0.15,
      morph_y: 0.15,
    },
  },
  "Acid Bass": {
    name: "Acid Bass",
    category: "Bass",
    params: {
      ...DEFAULT_SYNTH_PARAMS,
      osc_a: {
        ...DEFAULT_OSC_A,
        waveform: "Sawtooth",
        coarse_tune: -12,
        fine_tune: 0,
        volume: 0.85,
        unison_voices: 1,
      },
      osc_b: {
        ...DEFAULT_OSC_B,
        waveform: "Pulse",
        pulse_width: 0.25,
        coarse_tune: -12,
        fine_tune: 4,
        volume: 0.65,
        unison_voices: 1,
        is_enabled: true,
      },
      filter: {
        ...DEFAULT_FILTER,
        mode: "Lowpass24",
        cutoff_hz: 650,
        resonance: 0.82,
        drive: 0.55,
        env2_amount: 0.85,
      },
      env1: {
        attack_ms: 2,
        hold_ms: 0,
        decay_ms: 220,
        sustain_level: 0.1,
        release_ms: 180,
      },
      env2: {
        attack_ms: 1,
        hold_ms: 0,
        decay_ms: 160,
        sustain_level: 0.0,
        release_ms: 140,
      },
      lfo: {
        ...DEFAULT_LFO,
        rate_sync_div: 8,
        cutoff_depth: 0.25,
        pwm_depth: 0.3,
      },
      morph_x: 0.5,
      morph_y: 0.1,
    },
  },
  "Lush PolyPad": {
    name: "Lush PolyPad",
    category: "Pad",
    params: {
      ...DEFAULT_SYNTH_PARAMS,
      osc_a: {
        ...DEFAULT_OSC_A,
        waveform: "Sawtooth",
        coarse_tune: 0,
        fine_tune: -7,
        volume: 0.72,
        unison_voices: 4,
        unison_detune: 0.35,
      },
      osc_b: {
        ...DEFAULT_OSC_B,
        waveform: "Sawtooth",
        coarse_tune: 0,
        fine_tune: 7,
        volume: 0.72,
        unison_voices: 4,
        unison_detune: 0.4,
        is_enabled: true,
      },
      filter: {
        ...DEFAULT_FILTER,
        mode: "Lowpass12",
        cutoff_hz: 2200,
        resonance: 0.22,
        drive: 0.1,
        env2_amount: 0.3,
      },
      env1: {
        attack_ms: 450,
        hold_ms: 50,
        decay_ms: 600,
        sustain_level: 0.75,
        release_ms: 1300,
      },
      env2: {
        attack_ms: 550,
        hold_ms: 0,
        decay_ms: 800,
        sustain_level: 0.4,
        release_ms: 1100,
      },
      lfo: {
        ...DEFAULT_LFO,
        waveform: "Sine",
        rate_sync_div: 2,
        cutoff_depth: 0.15,
        pitch_depth: 0.05,
      },
      morph_x: 0.85,
      morph_y: 0.85,
    },
  },
  "808 Lead": {
    name: "808 Lead",
    category: "Lead",
    params: {
      ...DEFAULT_SYNTH_PARAMS,
      osc_a: {
        ...DEFAULT_OSC_A,
        waveform: "Pulse",
        pulse_width: 0.4,
        coarse_tune: 0,
        fine_tune: 0,
        volume: 0.8,
        unison_voices: 2,
        unison_detune: 0.15,
      },
      osc_b: {
        ...DEFAULT_OSC_B,
        waveform: "Triangle",
        coarse_tune: -12,
        fine_tune: 0,
        volume: 0.75,
        unison_voices: 1,
        is_enabled: true,
      },
      filter: {
        ...DEFAULT_FILTER,
        mode: "Lowpass24",
        cutoff_hz: 4500,
        resonance: 0.4,
        drive: 0.35,
        env2_amount: 0.5,
      },
      env1: {
        attack_ms: 8,
        hold_ms: 0,
        decay_ms: 450,
        sustain_level: 0.6,
        release_ms: 350,
      },
      env2: {
        attack_ms: 4,
        hold_ms: 0,
        decay_ms: 250,
        sustain_level: 0.2,
        release_ms: 200,
      },
      lfo: {
        ...DEFAULT_LFO,
        waveform: "Triangle",
        rate_sync_div: 4,
        cutoff_depth: 0.1,
        pitch_depth: 0.08,
        pwm_depth: 0.2,
      },
      morph_x: 0.15,
      morph_y: 0.85,
    },
  },
  "Pluck Bell": {
    name: "Pluck Bell",
    category: "Pluck",
    params: {
      ...DEFAULT_SYNTH_PARAMS,
      osc_a: {
        ...DEFAULT_OSC_A,
        waveform: "Sine",
        coarse_tune: 12,
        fine_tune: 0,
        volume: 0.85,
        unison_voices: 1,
      },
      osc_b: {
        ...DEFAULT_OSC_B,
        waveform: "Triangle",
        coarse_tune: 19,
        fine_tune: 5,
        volume: 0.65,
        unison_voices: 2,
        unison_detune: 0.1,
        is_enabled: true,
      },
      filter: {
        ...DEFAULT_FILTER,
        mode: "Bandpass",
        cutoff_hz: 3200,
        resonance: 0.5,
        drive: 0.1,
        env2_amount: 0.85,
      },
      env1: {
        attack_ms: 2,
        hold_ms: 0,
        decay_ms: 180,
        sustain_level: 0.0,
        release_ms: 250,
      },
      env2: {
        attack_ms: 1,
        hold_ms: 0,
        decay_ms: 110,
        sustain_level: 0.0,
        release_ms: 120,
      },
      lfo: {
        ...DEFAULT_LFO,
        waveform: "Sine",
        rate_sync_div: 8,
        cutoff_depth: 0.1,
        pitch_depth: 0.02,
        pwm_depth: 0.0,
      },
      morph_x: 0.5,
      morph_y: 0.9,
    },
  },
};

interface SynthStoreState {
  isModalOpen: boolean;
  activeTrackIndex: number; // 0 to 7
  activeChannelId: string | null;
  selectedPreset: string;
  activeVoices: number;
  trackParams: Record<number, SynthParams>;
}

interface SynthStoreActions {
  openModal: (trackIndex: number, channelId?: string) => void;
  closeModal: () => void;
  setTrackIndex: (trackIndex: number) => void;
  updateOscA: (partial: Partial<OscParams>) => void;
  updateOscB: (partial: Partial<OscParams>) => void;
  updateFilter: (partial: Partial<FilterParams>) => void;
  updateEnv1: (partial: Partial<AhdsrParams>) => void;
  updateEnv2: (partial: Partial<AhdsrParams>) => void;
  updateLfo: (partial: Partial<LfoParams>) => void;
  setMorph: (x: number, y: number) => void;
  setMasterVolume: (volume: number) => void;
  setGlideTime: (glideMs: number) => void;
  loadPreset: (presetName: string) => void;
  triggerNote: (note?: number, velocity?: number) => void;
  releaseNote: (note?: number) => void;
  panic: () => void;
  pollVoices: () => Promise<void>;
}

export type SynthStore = SynthStoreState & SynthStoreActions;

export const useSynthStore = create<SynthStore>((set, get) => ({
  isModalOpen: false,
  activeTrackIndex: 0,
  activeChannelId: null,
  selectedPreset: "Init Saw",
  activeVoices: 0,
  trackParams: {
    0: { ...DEFAULT_SYNTH_PARAMS },
    1: { ...DEFAULT_SYNTH_PARAMS },
    2: { ...DEFAULT_SYNTH_PARAMS },
    3: { ...DEFAULT_SYNTH_PARAMS },
    4: { ...DEFAULT_SYNTH_PARAMS },
    5: { ...DEFAULT_SYNTH_PARAMS },
    6: { ...DEFAULT_SYNTH_PARAMS },
    7: { ...DEFAULT_SYNTH_PARAMS },
  },

  openModal: (trackIndex, channelId) => {
    set({
      isModalOpen: true,
      activeTrackIndex: trackIndex,
      activeChannelId: channelId || null,
    });
  },

  closeModal: () => {
    set({ isModalOpen: false });
  },

  setTrackIndex: (trackIndex) => {
    set({ activeTrackIndex: trackIndex });
  },

  updateOscA: (partial) => {
    const { activeTrackIndex, trackParams } = get();
    const current = trackParams[activeTrackIndex] || { ...DEFAULT_SYNTH_PARAMS };
    const updated: SynthParams = {
      ...current,
      osc_a: { ...current.osc_a, ...partial },
    };
    set({
      trackParams: { ...trackParams, [activeTrackIndex]: updated },
    });
    setSynthParams(activeTrackIndex, updated).catch(() => {});
  },

  updateOscB: (partial) => {
    const { activeTrackIndex, trackParams } = get();
    const current = trackParams[activeTrackIndex] || { ...DEFAULT_SYNTH_PARAMS };
    const updated: SynthParams = {
      ...current,
      osc_b: { ...current.osc_b, ...partial },
    };
    set({
      trackParams: { ...trackParams, [activeTrackIndex]: updated },
    });
    setSynthParams(activeTrackIndex, updated).catch(() => {});
  },

  updateFilter: (partial) => {
    const { activeTrackIndex, trackParams } = get();
    const current = trackParams[activeTrackIndex] || { ...DEFAULT_SYNTH_PARAMS };
    const updated: SynthParams = {
      ...current,
      filter: { ...current.filter, ...partial },
    };
    set({
      trackParams: { ...trackParams, [activeTrackIndex]: updated },
    });
    setSynthParams(activeTrackIndex, updated).catch(() => {});
  },

  updateEnv1: (partial) => {
    const { activeTrackIndex, trackParams } = get();
    const current = trackParams[activeTrackIndex] || { ...DEFAULT_SYNTH_PARAMS };
    const updated: SynthParams = {
      ...current,
      env1: { ...current.env1, ...partial },
    };
    set({
      trackParams: { ...trackParams, [activeTrackIndex]: updated },
    });
    setSynthParams(activeTrackIndex, updated).catch(() => {});
  },

  updateEnv2: (partial) => {
    const { activeTrackIndex, trackParams } = get();
    const current = trackParams[activeTrackIndex] || { ...DEFAULT_SYNTH_PARAMS };
    const updated: SynthParams = {
      ...current,
      env2: { ...current.env2, ...partial },
    };
    set({
      trackParams: { ...trackParams, [activeTrackIndex]: updated },
    });
    setSynthParams(activeTrackIndex, updated).catch(() => {});
  },

  updateLfo: (partial) => {
    const { activeTrackIndex, trackParams } = get();
    const current = trackParams[activeTrackIndex] || { ...DEFAULT_SYNTH_PARAMS };
    const updated: SynthParams = {
      ...current,
      lfo: { ...current.lfo, ...partial },
    };
    set({
      trackParams: { ...trackParams, [activeTrackIndex]: updated },
    });
    setSynthParams(activeTrackIndex, updated).catch(() => {});
  },

  setMorph: (x, y) => {
    const { activeTrackIndex, trackParams } = get();
    const current = trackParams[activeTrackIndex] || { ...DEFAULT_SYNTH_PARAMS };
    const clampedX = Math.max(0, Math.min(1, x));
    const clampedY = Math.max(0, Math.min(1, y));
    const updated: SynthParams = {
      ...current,
      morph_x: clampedX,
      morph_y: clampedY,
    };
    set({
      trackParams: { ...trackParams, [activeTrackIndex]: updated },
    });
    setSynthMorph(activeTrackIndex, clampedX, clampedY).catch(() => {});
  },

  setMasterVolume: (master_volume) => {
    const { activeTrackIndex, trackParams } = get();
    const current = trackParams[activeTrackIndex] || { ...DEFAULT_SYNTH_PARAMS };
    const updated: SynthParams = { ...current, master_volume };
    set({
      trackParams: { ...trackParams, [activeTrackIndex]: updated },
    });
    setSynthParams(activeTrackIndex, updated).catch(() => {});
  },

  setGlideTime: (glide_time_ms) => {
    const { activeTrackIndex, trackParams } = get();
    const current = trackParams[activeTrackIndex] || { ...DEFAULT_SYNTH_PARAMS };
    const updated: SynthParams = { ...current, glide_time_ms };
    set({
      trackParams: { ...trackParams, [activeTrackIndex]: updated },
    });
    setSynthParams(activeTrackIndex, updated).catch(() => {});
  },

  loadPreset: (presetName) => {
    const preset = SYNTH_PRESETS[presetName];
    if (!preset) return;
    const { activeTrackIndex, trackParams } = get();
    const cloned = JSON.parse(JSON.stringify(preset.params)) as SynthParams;
    set({
      selectedPreset: presetName,
      trackParams: { ...trackParams, [activeTrackIndex]: cloned },
    });
    setSynthParams(activeTrackIndex, cloned).catch(() => {});
  },

  triggerNote: (note = 60, velocity = 0.85) => {
    const { activeTrackIndex } = get();
    triggerSynthNote(activeTrackIndex, note, velocity).catch(() => {});
  },

  releaseNote: (note = 60) => {
    const { activeTrackIndex } = get();
    releaseSynthNote(activeTrackIndex, note).catch(() => {});
  },

  panic: () => {
    const { activeTrackIndex } = get();
    synthPanic(activeTrackIndex).catch(() => {});
  },

  pollVoices: async () => {
    const { activeTrackIndex } = get();
    const voices = await getActiveSynthVoices(activeTrackIndex);
    set({ activeVoices: voices });
  },
}));
