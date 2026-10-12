import { create } from "zustand";

export type TransportState = "stopped" | "playing" | "recording";

interface TransportStore {
  state: TransportState;
  bpm: number;
  play: () => void;
  stop: () => void;
  toggleRecord: () => void;
  setBpm: (bpm: number) => void;
}

/**
 * Low-frequency transport/UI state only. Playhead position and meter levels
 * must NOT live here — they are drawn via canvas + requestAnimationFrame to
 * avoid React re-renders at audio rates (see .agents/rules/daw-standards.md).
 */
export const useTransportStore = create<TransportStore>()((set) => ({
  state: "stopped",
  bpm: 120,
  play: () => set({ state: "playing" }),
  stop: () => set({ state: "stopped" }),
  toggleRecord: () =>
    set((s) => ({ state: s.state === "recording" ? "playing" : "recording" })),
  setBpm: (bpm) => set({ bpm: Math.min(999, Math.max(20, bpm)) }),
}));
