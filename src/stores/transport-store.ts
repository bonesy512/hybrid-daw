import { create } from "zustand";

export interface Position {
  bars: number;
  beats: number;
  ticks: number;
}

export interface TransportState {
  isPlaying: boolean;
  isRecording: boolean;
  isLooping: boolean;
  bpm: number;
  position: Position;
  cpuUsage: number;
  bufferSize: number;
}

export interface TransportActions {
  togglePlay: () => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  toggleRecord: () => void;
  toggleLoop: () => void;
  setBpm: (bpm: number) => void;
  setPosition: (pos: Partial<Position>) => void;
  resetPosition: () => void;
  setCpuUsage: (cpuUsage: number) => void;
  setBufferSize: (bufferSize: number) => void;
}

export type TransportStore = TransportState & TransportActions;

const DEFAULT_POSITION: Position = {
  bars: 1,
  beats: 1,
  ticks: 0,
};

/**
 * Transport and low-frequency telemetry store.
 * Audio playback and high-rate playhead positions use requestAnimationFrame
 * or Canvas, but discrete transport state, tempo, and song cursor coordinate
 * are managed here for the UI shell.
 */
export const useTransportStore = create<TransportStore>()((set) => ({
  isPlaying: false,
  isRecording: false,
  isLooping: true,
  bpm: 140.0,
  position: { ...DEFAULT_POSITION },
  cpuUsage: 8.4,
  bufferSize: 256,

  togglePlay: () =>
    set((state) => ({
      isPlaying: !state.isPlaying,
    })),

  play: () =>
    set(() => ({
      isPlaying: true,
    })),

  pause: () =>
    set(() => ({
      isPlaying: false,
    })),

  stop: () =>
    set((state) => {
      // If already stopped, pressing stop resets transport position to beginning
      if (!state.isPlaying && !state.isRecording) {
        return {
          position: { ...DEFAULT_POSITION },
        };
      }
      return {
        isPlaying: false,
        isRecording: false,
      };
    }),

  toggleRecord: () =>
    set((state) => ({
      isRecording: !state.isRecording,
    })),

  toggleLoop: () =>
    set((state) => ({
      isLooping: !state.isLooping,
    })),

  setBpm: (bpm: number) =>
    set(() => {
      const sanitized = Math.min(999.0, Math.max(20.0, Number(bpm.toFixed(1))));
      return {
        bpm: Number.isNaN(sanitized) ? 140.0 : sanitized,
      };
    }),

  setPosition: (pos: Partial<Position>) =>
    set((state) => ({
      position: {
        bars: Math.max(1, pos.bars ?? state.position.bars),
        beats: Math.max(1, Math.min(4, pos.beats ?? state.position.beats)),
        ticks: Math.max(0, Math.min(960, pos.ticks ?? state.position.ticks)),
      },
    })),

  resetPosition: () =>
    set(() => ({
      position: { ...DEFAULT_POSITION },
    })),

  setCpuUsage: (cpuUsage: number) =>
    set(() => ({
      cpuUsage: Math.max(0, Math.min(100, cpuUsage)),
    })),

  setBufferSize: (bufferSize: number) =>
    set(() => ({
      bufferSize,
    })),
}));
