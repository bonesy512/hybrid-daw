import { create } from "zustand";
import { syncPattern } from "@/lib/audio/tauri-bridge";

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
  toggleChannelMute: (channelId: string) => void;
  toggleChannelSolo: (channelId: string) => void;
  setChannelPitch: (channelId: string, pitch: number) => void;
  setChannelTimeShift: (channelId: string, timeShift: number) => void;
  setChannelName: (channelId: string, name: string) => void;
  addChannel: (name?: string, sampleUrl?: string, color?: string) => void;
  removeChannel: (channelId: string) => void;
  clearPattern: () => void;
  setCurrentStep: (step: number) => void;
  setActivePatternIndex: (index: number) => void;
  setSwing: (swing: number) => void;
  setStepCount: (stepCount: 16 | 32) => void;
}

export type PatternStore = PatternStoreState & PatternStoreActions;

const createSteps = (totalSteps: number, activeIndices: number[]): boolean[] => {
  const steps = new Array(totalSteps).fill(false);
  for (const idx of activeIndices) {
    if (idx < totalSteps) {
      steps[idx] = true;
    }
  }
  return steps;
};

const DEFAULT_CHANNELS: Channel[] = [
  {
    id: "ch-kick-808",
    name: "Kick 808",
    sampleUrl: "synths/kick-808",
    color: "#ff4400", // Safety Orange
    pan: 0,
    volume: 0.88,
    isMuted: false,
    isSolo: false,
    pitchOffset: 0,
    timeShift: 0,
    // steps 0, 8 active
    steps: createSteps(16, [0, 8]),
  },
  {
    id: "ch-clap-tight",
    name: "Clap Tight",
    sampleUrl: "samples/clap-tight",
    color: "#00f59b", // Phosphor Green
    pan: 0,
    volume: 0.75,
    isMuted: false,
    isSolo: false,
    pitchOffset: 0,
    timeShift: 0,
    // steps 4, 12 active
    steps: createSteps(16, [4, 12]),
  },
  {
    id: "ch-hat-closed",
    name: "Hi-Hat Closed",
    sampleUrl: "samples/hat-closed",
    color: "#a1a1aa", // Stark Zinc
    pan: 0.15,
    volume: 0.65,
    isMuted: false,
    isSolo: false,
    pitchOffset: 0,
    timeShift: 0,
    // steps 0, 2, 4, 6, 8, 10, 12, 14 active
    steps: createSteps(16, [0, 2, 4, 6, 8, 10, 12, 14]),
  },
  {
    id: "ch-snare-90s",
    name: "Snare 90s",
    sampleUrl: "samples/snare-90s",
    color: "#38bdf8", // Sky Blue
    pan: 0,
    volume: 0.8,
    isMuted: false,
    isSolo: false,
    pitchOffset: 0,
    timeShift: 0,
    // step 12 active
    steps: createSteps(16, [12]),
  },
];

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

      // Automatically sync pattern updates to backend audio engine
      syncPattern(
        nextChannels.map((c) => ({
          id: c.id,
          name: c.name,
          steps: c.steps,
        }))
      ).catch(() => {});

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

  toggleChannelMute: (channelId: string) =>
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, isMuted: !ch.isMuted } : ch
      ),
    })),

  toggleChannelSolo: (channelId: string) =>
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, isSolo: !ch.isSolo } : ch
      ),
    })),

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

  addChannel: (name = "New Instrument", sampleUrl = "synths/analog-sub", color = "#ff4400") =>
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
        steps: new Array(state.stepCount).fill(false),
      };
      const nextChannels = [...state.channels, newChannel];
      syncPattern(
        nextChannels.map((c) => ({
          id: c.id,
          name: c.name,
          steps: c.steps,
        }))
      ).catch(() => {});
      return { channels: nextChannels };
    }),

  removeChannel: (channelId: string) =>
    set((state) => {
      const nextChannels = state.channels.filter((ch) => ch.id !== channelId);
      syncPattern(
        nextChannels.map((c) => ({
          id: c.id,
          name: c.name,
          steps: c.steps,
        }))
      ).catch(() => {});
      return { channels: nextChannels };
    }),

  clearPattern: () =>
    set((state) => {
      const nextChannels = state.channels.map((ch) => ({
        ...ch,
        steps: new Array(state.stepCount).fill(false),
      }));
      syncPattern(
        nextChannels.map((c) => ({
          id: c.id,
          name: c.name,
          steps: c.steps,
        }))
      ).catch(() => {});
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
        if (nextSteps.length < stepCount) {
          while (nextSteps.length < stepCount) {
            nextSteps.push(false);
          }
        } else if (nextSteps.length > stepCount) {
          nextSteps.length = stepCount;
        }
        return { ...ch, steps: nextSteps };
      });
      syncPattern(
        nextChannels.map((c) => ({
          id: c.id,
          name: c.name,
          steps: c.steps,
        }))
      ).catch(() => {});
      return {
        stepCount,
        channels: nextChannels,
      };
    }),
}));

// Eagerly sync default pattern upon initialization
if (typeof window !== "undefined") {
  syncPattern(
    DEFAULT_CHANNELS.map((c) => ({
      id: c.id,
      name: c.name,
      steps: c.steps,
    }))
  ).catch(() => {});
}
