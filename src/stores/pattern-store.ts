import { create } from "zustand";
import { assignChannelSample, syncPattern } from "@/lib/audio/tauri-bridge";

export interface Channel {
  id: string;
  name: string;
  sampleUrl: string;
  color: string;
  pan: number; // -1.0 (Left) to 1.0 (Right)
  volume: number; // 0.0 to 1.0
  isMuted: boolean;
  isSolo: boolean;
  pitchOffset: number; // semitones: -24 to +24
  timeShift: number; // ms or ticks offset (0 to 100ms)
  steps: boolean[]; // 16 or 32 steps
  sampleId?: string; // Loaded native sample ID
  samplePath?: string; // File system path to audio asset
  waveformPeaks?: number[]; // Waveform preview points
  isSynth?: boolean; // Multi-Engine PolySynth mode
}

export interface PatternStoreState {
  activePatternIndex: number;
  currentStep: number;
  stepCount: 16 | 32;
  swing: number; // 0 to 100%
  channels: Channel[];
}

export interface PatternStoreActions {
  toggleStep: (channelId: string, stepIndex: number) => void;
  setChannelPan: (channelId: string, pan: number) => void;
  setChannelVolume: (channelId: string, volume: number) => void;
  toggleMute: (channelId: string) => void;
  toggleChannelMute: (channelId: string) => void;
  toggleSolo: (channelId: string) => void;
  toggleChannelSolo: (channelId: string) => void;
  clearChannelSteps: (channelId: string) => void;
  setChannelPitch: (channelId: string, pitch: number) => void;
  setChannelTimeShift: (channelId: string, timeShift: number) => void;
  setChannelName: (channelId: string, name: string) => void;
  assignSampleToChannel: (
    channelId: string,
    sampleId: string,
    samplePath: string,
    name?: string,
    peaks?: number[]
  ) => Promise<void>;
  addChannel: (name?: string, sampleUrl?: string, color?: string, isSynth?: boolean) => void;
  setChannelIsSynth: (channelId: string, isSynth: boolean) => void;
  removeChannel: (channelId: string) => void;
  clearPattern: () => void;
  setCurrentStep: (step: number) => void;
  setActivePatternIndex: (index: number) => void;
  setSwing: (swing: number) => void;
  setStepCount: (stepCount: 16 | 32) => void;
}

export type PatternStore = PatternStoreState & PatternStoreActions;

const DEFAULT_CHANNELS: Channel[] = [
  {
    id: "ch-sampler-1",
    name: "Sampler 1",
    sampleUrl: "samples/empty-1",
    color: "#ff4400", // Safety Orange
    pan: 0,
    volume: 0.85,
    isMuted: false,
    isSolo: false,
    pitchOffset: 0,
    timeShift: 0,
    steps: new Array(32).fill(false),
  },
  {
    id: "ch-sampler-2",
    name: "Sampler 2",
    sampleUrl: "samples/empty-2",
    color: "#00f59b", // Phosphor Green
    pan: 0,
    volume: 0.85,
    isMuted: false,
    isSolo: false,
    pitchOffset: 0,
    timeShift: 0,
    steps: new Array(32).fill(false),
  },
  {
    id: "ch-sampler-3",
    name: "Sampler 3",
    sampleUrl: "samples/empty-3",
    color: "#38bdf8", // Sky Blue
    pan: 0,
    volume: 0.85,
    isMuted: false,
    isSolo: false,
    pitchOffset: 0,
    timeShift: 0,
    steps: new Array(32).fill(false),
  },
  {
    id: "ch-sampler-4",
    name: "Sampler 4",
    sampleUrl: "samples/empty-4",
    color: "#a855f7", // Electric Violet
    pan: 0,
    volume: 0.85,
    isMuted: false,
    isSolo: false,
    pitchOffset: 0,
    timeShift: 0,
    steps: new Array(32).fill(false),
  },
];

/**
 * Computes step data sent to native DSP engine, masking steps
 * for muted channels or non-soloed channels when solo is active.
 */
export function computeAudibleChannels(channels: Channel[]) {
  const hasSolo = channels.some((c) => c.isSolo);
  return channels.map((c) => {
    const isAudible = hasSolo ? (c.isSolo && !c.isMuted) : !c.isMuted;
    return {
      id: c.id,
      name: c.name,
      steps: isAudible ? c.steps : new Array(c.steps.length).fill(false),
    };
  });
}

export const usePatternStore = create<PatternStore>()((set) => ({
  activePatternIndex: 0,
  currentStep: 0,
  stepCount: 16,
  swing: 0,
  channels: DEFAULT_CHANNELS,

  toggleStep: (channelId: string, stepIndex: number) =>
    set((state) => {
      const nextChannels = state.channels.map((ch) => {
        if (ch.id !== channelId) return ch;
        const newSteps = [...ch.steps];
        while (newSteps.length <= stepIndex) {
          newSteps.push(false);
        }
        newSteps[stepIndex] = !newSteps[stepIndex];
        return { ...ch, steps: newSteps };
      });

      // Automatically sync audible pattern updates with active stepCount to backend audio engine
      syncPattern(computeAudibleChannels(nextChannels), state.stepCount).catch(() => {});

      return {
        channels: nextChannels,
      };
    }),

  setChannelPan: (channelId: string, pan: number) =>
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId
          ? { ...ch, pan: Math.max(-1.0, Math.min(1.0, pan)) }
          : ch
      ),
    })),

  setChannelVolume: (channelId: string, volume: number) =>
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId
          ? { ...ch, volume: Math.max(0.0, Math.min(1.0, volume)) }
          : ch
      ),
    })),

  toggleMute: (channelId: string) =>
    set((state) => {
      const nextChannels = state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, isMuted: !ch.isMuted } : ch
      );
      syncPattern(computeAudibleChannels(nextChannels), state.stepCount).catch(() => {});
      return { channels: nextChannels };
    }),

  toggleChannelMute: (channelId: string) =>
    set((state) => {
      const nextChannels = state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, isMuted: !ch.isMuted } : ch
      );
      syncPattern(computeAudibleChannels(nextChannels), state.stepCount).catch(() => {});
      return { channels: nextChannels };
    }),

  toggleSolo: (channelId: string) =>
    set((state) => {
      const nextChannels = state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, isSolo: !ch.isSolo } : ch
      );
      syncPattern(computeAudibleChannels(nextChannels), state.stepCount).catch(() => {});
      return { channels: nextChannels };
    }),

  toggleChannelSolo: (channelId: string) =>
    set((state) => {
      const nextChannels = state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, isSolo: !ch.isSolo } : ch
      );
      syncPattern(computeAudibleChannels(nextChannels), state.stepCount).catch(() => {});
      return { channels: nextChannels };
    }),

  clearChannelSteps: (channelId: string) =>
    set((state) => {
      const nextChannels = state.channels.map((ch) =>
        ch.id === channelId
          ? { ...ch, steps: new Array(Math.max(32, state.stepCount)).fill(false) }
          : ch
      );
      syncPattern(computeAudibleChannels(nextChannels), state.stepCount).catch(() => {});
      return { channels: nextChannels };
    }),

  setChannelPitch: (channelId: string, pitch: number) =>
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId
          ? { ...ch, pitchOffset: Math.max(-24, Math.min(24, Math.round(pitch))) }
          : ch
      ),
    })),

  setChannelTimeShift: (channelId: string, timeShift: number) =>
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId
          ? { ...ch, timeShift: Math.max(0, Math.min(100, Math.round(timeShift))) }
          : ch
      ),
    })),

  setChannelName: (channelId: string, name: string) =>
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, name } : ch
      ),
    })),

  assignSampleToChannel: async (
    channelId: string,
    sampleId: string,
    samplePath: string,
    name?: string,
    peaks?: number[]
  ) => {
    let targetIndex = -1;
    set((state) => {
      const nextChannels = state.channels.map((ch, idx) => {
        if (ch.id === channelId) {
          targetIndex = idx;
          return {
            ...ch,
            name: name || ch.name,
            sampleId,
            samplePath,
            isSynth: false,
            waveformPeaks: peaks || ch.waveformPeaks,
          };
        }
        return ch;
      });
      return { channels: nextChannels };
    });

    if (targetIndex >= 0) {
      await assignChannelSample(targetIndex, sampleId);
    }
  },

  addChannel: (
    name = "New Instrument",
    sampleUrl = "synths/analog-sub",
    color = "#ff4400",
    isSynth = false
  ) =>
    set((state) => {
      const id = `ch-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const newChannel: Channel = {
        id,
        name,
        sampleUrl,
        color,
        pan: 0,
        volume: 0.8,
        isMuted: false,
        isSolo: false,
        pitchOffset: 0,
        timeShift: 0,
        steps: new Array(Math.max(32, state.stepCount)).fill(false),
        isSynth,
      };
      const nextChannels = [...state.channels, newChannel];
      syncPattern(computeAudibleChannels(nextChannels), state.stepCount).catch(() => {});
      return { channels: nextChannels };
    }),

  setChannelIsSynth: (channelId: string, isSynth: boolean) =>
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, isSynth } : ch
      ),
    })),

  removeChannel: (channelId: string) =>
    set((state) => {
      const nextChannels = state.channels.filter((ch) => ch.id !== channelId);
      syncPattern(computeAudibleChannels(nextChannels), state.stepCount).catch(() => {});
      return { channels: nextChannels };
    }),

  clearPattern: () =>
    set((state) => {
      const nextChannels = state.channels.map((ch) => ({
        ...ch,
        steps: new Array(Math.max(32, state.stepCount)).fill(false),
      }));
      syncPattern(computeAudibleChannels(nextChannels), state.stepCount).catch(() => {});
      return { channels: nextChannels };
    }),

  setCurrentStep: (currentStep: number) =>
    set(() => ({
      currentStep,
    })),

  setActivePatternIndex: (activePatternIndex: number) =>
    set(() => ({
      activePatternIndex,
    })),

  setSwing: (swing: number) =>
    set(() => ({
      swing: Math.max(0, Math.min(100, swing)),
    })),

  setStepCount: (stepCount: 16 | 32) =>
    set((state) => {
      const nextChannels = state.channels.map((ch) => {
        const nextSteps = [...ch.steps];
        while (nextSteps.length < stepCount) {
          nextSteps.push(false);
        }
        return { ...ch, steps: nextSteps };
      });
      syncPattern(computeAudibleChannels(nextChannels), stepCount).catch(() => {});
      return {
        stepCount,
        channels: nextChannels,
      };
    }),
}));

// Eagerly sync default pattern upon initialization
if (typeof window !== "undefined") {
  syncPattern(computeAudibleChannels(DEFAULT_CHANNELS), 16).catch(() => {});
}
