import { create } from "zustand";
import {
  startRecording,
  stopRecording,
} from "@/lib/audio/tauri-bridge";
import { useTransportStore } from "@/stores/transport-store";

export type SnapGrid = "bar" | "1/2" | "1/4" | "1/8" | "1/16" | "off";
export type ArrangerTool = "pointer" | "pencil" | "scissors" | "eraser" | "mute";

export interface AudioTake {
  id: string;
  name: string;
  audioFilePath: string;
  waveformPeaks: number[];
  createdTimestamp: number;
}

export interface CompSlice {
  id: string;
  takeId: string;
  startBar: number;
  durationBars: number;
  fadeInMs: number;
  fadeOutMs: number;
}

export interface TakeFolderData {
  takes: AudioTake[];
  activeComp: CompSlice[];
  isExpanded: boolean;
  selectedCompName: string;
}

export interface TimelineClip {
  id: string;
  trackId: string;
  name: string;
  type: "pattern" | "audio" | "automation";
  sourceId: string; // pattern index or sample ID
  startBar: number; // 1-indexed float (e.g. 1.0, 5.0)
  durationBars: number; // Length in bars (e.g. 4.0)
  offsetBars: number; // Start offset within source clip
  color: string;
  isSelected: boolean;
  isMuted: boolean;
  waveformPeaks?: number[];
  takeFolder?: TakeFolderData;
}

export interface ArrangerTrack {
  id: string;
  name: string;
  type: "audio" | "instrument";
  color: string;
  isMuted: boolean;
  isSolo: boolean;
  isArmed: boolean;
  volume: number; // 0.0 to 1.0
  pan: number; // -1.0 to 1.0
  height: number; // Height in pixels
}

export interface ArrangerState {
  zoomX: number; // Pixels per bar (default: 80)
  scrollX: number;
  scrollY: number;
  snapGrid: SnapGrid;
  activeTool: ArrangerTool;
  loopStartBar: number;
  loopEndBar: number;
  totalBars: number;
  tracks: ArrangerTrack[];
  clips: TimelineClip[];
  isRecordingActive: boolean;
  recordingStartBar: number;
  activeRecordingTrackId: string | null;
}

export interface ArrangerActions {
  setZoomX: (zoom: number) => void;
  setScrollX: (scroll: number) => void;
  setScrollY: (scrollY: number) => void;
  setSnapGrid: (snap: SnapGrid) => void;
  setActiveTool: (tool: ArrangerTool) => void;
  setLoopRange: (start: number, end: number) => void;
  setTotalBars: (bars: number) => void;

  // Recording actions
  startRecordingSession: () => Promise<string | null>;
  stopRecordingSession: () => Promise<TimelineClip | null>;

  // Take Folder & Quick-Swipe Comping actions
  createTakeFolder: (clipId: string, initialAudioFilePath?: string) => void;
  addTakeToFolder: (clipId: string, takeFilePath: string, waveformPeaks: number[]) => void;
  toggleTakeFolderExpanded: (clipId: string) => void;
  setCompSlice: (clipId: string, takeId: string, startBar: number, durationBars: number) => void;
  flattenAndMergeComp: (clipId: string) => void;
  setCompPreset: (clipId: string, compName: string) => void;

  // Track actions
  addTrack: (name?: string, type?: "audio" | "instrument", color?: string) => void;
  removeTrack: (id: string) => void;
  toggleTrackMute: (id: string) => void;
  toggleTrackSolo: (id: string) => void;
  toggleTrackArm: (id: string) => void;
  setTrackVolume: (id: string, volume: number) => void;
  setTrackPan: (id: string, pan: number) => void;

  // Clip actions
  addClip: (clip: Omit<TimelineClip, "id"> & { id?: string }) => string;
  removeClip: (id: string) => void;
  moveClip: (id: string, newStartBar: number, newTrackId?: string) => void;
  resizeClip: (
    id: string,
    newStartBar: number,
    newDurationBars: number,
    newOffsetBars?: number
  ) => void;
  splitClipAtBar: (id: string, splitBar: number) => void;
  duplicateClip: (id: string) => void;
  selectClip: (id: string, multi?: boolean) => void;
  clearSelection: () => void;
  toggleClipMute: (id: string) => void;
}

export type ArrangerStore = ArrangerState & ArrangerActions;

/**
 * Snaps a fractional bar coordinate to the musical snap grid.
 */
export function snapToGrid(bar: number, snapGrid: SnapGrid): number {
  if (snapGrid === "off") return Math.max(1, Number(bar.toFixed(3)));
  const step =
    snapGrid === "bar"
      ? 1
      : snapGrid === "1/2"
      ? 0.5
      : snapGrid === "1/4"
      ? 0.25
      : snapGrid === "1/8"
      ? 0.125
      : 0.0625; // 1/16
  const snapped = Math.round((bar - 1) / step) * step + 1;
  return Math.max(1, Number(snapped.toFixed(4)));
}

/**
 * Recomputes the composite 64-point normalized waveform peaks from the active comp slices.
 */
export function computeCompositePeaks(
  clipStartBar: number,
  clipDurationBars: number,
  takes: AudioTake[],
  activeComp: CompSlice[]
): number[] {
  const points = 64;
  const composite: number[] = new Array(points).fill(0.35);
  if (takes.length === 0) return composite;

  for (let i = 0; i < points; i++) {
    const fraction = i / points;
    const currentBar = clipStartBar + fraction * clipDurationBars;
    const slice = activeComp.find(
      (s) => currentBar >= s.startBar && currentBar < s.startBar + s.durationBars
    );
    const takeId = slice ? slice.takeId : takes[0].id;
    const take = takes.find((t) => t.id === takeId) || takes[0];
    if (take && take.waveformPeaks.length > 0) {
      const takeIdx = Math.min(
        take.waveformPeaks.length - 1,
        Math.floor(fraction * take.waveformPeaks.length)
      );
      composite[i] = take.waveformPeaks[takeIdx] ?? 0.4;
    }
  }

  return composite;
}

/**
 * Computes non-overlapping seamless comp slices when swiping across a target take.
 */
export function computeCompSlicesAfterSwipe(
  currentSlices: CompSlice[],
  newTakeId: string,
  swipeStart: number,
  swipeDuration: number,
  clipStartBar: number,
  clipDurationBars: number
): CompSlice[] {
  const clipEnd = clipStartBar + clipDurationBars;
  const rawStart = Math.min(swipeStart, swipeStart + swipeDuration);
  const rawEnd = Math.max(swipeStart, swipeStart + swipeDuration);
  const start = Math.max(clipStartBar, Math.min(clipEnd, rawStart));
  const end = Math.max(clipStartBar, Math.min(clipEnd, rawEnd));
  const dur = Number((end - start).toFixed(4));
  if (dur <= 0.001) return currentSlices;

  const result: CompSlice[] = [];

  for (const s of currentSlices) {
    const sStart = Number(s.startBar.toFixed(4));
    const sEnd = Number((s.startBar + s.durationBars).toFixed(4));

    if (sEnd <= start || sStart >= end) {
      result.push(s);
    } else if (sStart < start && sEnd > end) {
      result.push({
        ...s,
        id: `slice-${Date.now()}-a`,
        durationBars: Number((start - sStart).toFixed(4)),
      });
      result.push({
        ...s,
        id: `slice-${Date.now()}-b`,
        startBar: end,
        durationBars: Number((sEnd - end).toFixed(4)),
      });
    } else if (sStart < start && sEnd <= end) {
      result.push({
        ...s,
        durationBars: Number((start - sStart).toFixed(4)),
      });
    } else if (sStart >= start && sEnd > end) {
      result.push({
        ...s,
        startBar: end,
        durationBars: Number((sEnd - end).toFixed(4)),
      });
    }
  }

  result.push({
    id: `slice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    takeId: newTakeId,
    startBar: start,
    durationBars: dur,
    fadeInMs: 5,
    fadeOutMs: 5,
  });

  result.sort((a, b) => a.startBar - b.startBar);

  const merged: CompSlice[] = [];
  for (const sl of result) {
    if (sl.durationBars <= 0.001) continue;
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.takeId === sl.takeId &&
      Math.abs(prev.startBar + prev.durationBars - sl.startBar) < 0.01
    ) {
      prev.durationBars = Number((prev.durationBars + sl.durationBars).toFixed(4));
    } else {
      merged.push({ ...sl });
    }
  }

  return merged;
}

const DEFAULT_TRACKS: ArrangerTrack[] = [
  {
    id: "track-drums",
    name: "Drums & Percussion",
    type: "instrument",
    color: "#ff4400", // Safety Orange
    isMuted: false,
    isSolo: false,
    isArmed: false,
    volume: 0.85,
    pan: 0,
    height: 72,
  },
  {
    id: "track-bass",
    name: "Bass 808",
    type: "instrument",
    color: "#00f59b", // Phosphor Green
    isMuted: false,
    isSolo: false,
    isArmed: false,
    volume: 0.9,
    pan: 0,
    height: 72,
  },
  {
    id: "track-chords",
    name: "Chords & Melodies",
    type: "instrument",
    color: "#38bdf8", // Sky Blue
    isMuted: false,
    isSolo: false,
    isArmed: false,
    volume: 0.75,
    pan: 0.2,
    height: 72,
  },
  {
    id: "track-vocals",
    name: "Vocal Chops & FX",
    type: "audio",
    color: "#fbbf24", // Amber
    isMuted: false,
    isSolo: false,
    isArmed: false,
    volume: 0.8,
    pan: -0.15,
    height: 72,
  },
];

const DEFAULT_CLIPS: TimelineClip[] = [];

export const useArrangerStore = create<ArrangerStore>()((set, get) => ({
  zoomX: 80, // Default 80px per bar
  scrollX: 0,
  scrollY: 0,
  snapGrid: "bar",
  activeTool: "pointer",
  loopStartBar: 1,
  loopEndBar: 5,
  totalBars: 32,
  tracks: DEFAULT_TRACKS,
  clips: DEFAULT_CLIPS,
  isRecordingActive: false,
  recordingStartBar: 1,
  activeRecordingTrackId: null,

  startRecordingSession: async () => {
    const state = get();
    if (state.isRecordingActive) return null;

    // Check if any track actually has isArmed: true before invoking native recording stream
    const armedTrack = state.tracks.find((t) => t.isArmed);
    if (!armedTrack) {
      return null;
    }

    const trackIndex = state.tracks.findIndex((t) => t.id === armedTrack.id);
    const transportState = useTransportStore.getState();
    const currentStartBar = Math.max(
      1,
      transportState.position.bars +
        (transportState.position.beats - 1) / 4 +
        transportState.position.ticks / (4 * 240)
    );

    try {
      const filePath = await startRecording(armedTrack.id, Math.max(0, trackIndex));
      set({
        isRecordingActive: true,
        recordingStartBar: currentStartBar,
        activeRecordingTrackId: armedTrack.id,
      });
      return filePath;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("No default audio input device available")) {
        console.warn(
          "[ArrangerStore] Audio recording skipped: No default audio input device available"
        );
      } else {
        console.warn("[ArrangerStore] Audio recording unavailable:", errMsg);
      }
      return null;
    }
  },

  stopRecordingSession: async () => {
    const state = get();
    if (!state.isRecordingActive) return null;

    try {
      const meta = await stopRecording();
      const transportState = useTransportStore.getState();
      const currentEndBar = Math.max(
        state.recordingStartBar + 0.25,
        transportState.position.bars +
          (transportState.position.beats - 1) / 4 +
          transportState.position.ticks / (4 * 240)
      );

      const bpm = transportState.bpm || 140;
      const secondsPerBar = (60 / bpm) * 4;
      const computedBars = meta.duration_seconds
        ? meta.duration_seconds / secondsPerBar
        : currentEndBar - state.recordingStartBar;
      const durationBars = Math.max(0.25, Number(computedBars.toFixed(3)));

      const targetTrackId =
        state.activeRecordingTrackId ||
        state.tracks.find((t) => t.isArmed)?.id ||
        state.tracks[0]?.id ||
        "track-audio-1";

      const isLooping = transportState.isLooping;
      // Cycle recording auto-take stacking: check if an existing audio clip overlaps
      const overlappingClip = state.clips.find(
        (c) =>
          c.trackId === targetTrackId &&
          c.type === "audio" &&
          Math.max(c.startBar, state.recordingStartBar) <
            Math.min(c.startBar + c.durationBars, currentEndBar)
      );

      if (overlappingClip && isLooping) {
        get().addTakeToFolder(
          overlappingClip.id,
          meta.file_path,
          meta.waveform_peaks && meta.waveform_peaks.length > 0
            ? meta.waveform_peaks
            : Array.from({ length: 64 }, () => Math.random() * 0.8)
        );

        set({
          isRecordingActive: false,
          activeRecordingTrackId: null,
        });
        return overlappingClip;
      }

      const clipId = `rec-${Date.now()}`;
      const newClip: TimelineClip = {
        id: clipId,
        trackId: targetTrackId,
        name: meta.filename || `Take ${new Date().toLocaleTimeString()}`,
        type: "audio",
        sourceId: meta.file_path,
        startBar: snapToGrid(
          state.recordingStartBar,
          state.snapGrid === "off" ? "1/16" : state.snapGrid
        ),
        durationBars,
        offsetBars: 0,
        color: "#ff2200", // Recording Crimson
        isSelected: true,
        isMuted: false,
        waveformPeaks:
          meta.waveform_peaks && meta.waveform_peaks.length > 0
            ? meta.waveform_peaks
            : Array.from({ length: 64 }, () => Math.random() * 0.8),
      };

      set((s) => ({
        isRecordingActive: false,
        activeRecordingTrackId: null,
        clips: [...s.clips.map((c) => ({ ...c, isSelected: false })), newClip],
      }));

      return newClip;
    } catch (err) {
      console.error("[ArrangerStore] stopRecording error:", err);
      set({
        isRecordingActive: false,
        activeRecordingTrackId: null,
      });
      return null;
    }
  },

  createTakeFolder: (clipId, initialAudioFilePath) =>
    set((state) => {
      return {
        clips: state.clips.map((clip) => {
          if (clip.id !== clipId || clip.type !== "audio") return clip;
          if (clip.takeFolder) return clip;

          const take1: AudioTake = {
            id: `take-${Date.now()}-1`,
            name: "Take 1",
            audioFilePath: initialAudioFilePath || clip.sourceId,
            waveformPeaks: clip.waveformPeaks || [0.4, 0.7, 0.5, 0.8],
            createdTimestamp: Date.now(),
          };

          const activeComp: CompSlice[] = [
            {
              id: `slice-${Date.now()}-1`,
              takeId: take1.id,
              startBar: clip.startBar,
              durationBars: clip.durationBars,
              fadeInMs: 5,
              fadeOutMs: 5,
            },
          ];

          return {
            ...clip,
            takeFolder: {
              takes: [take1],
              activeComp,
              isExpanded: true,
              selectedCompName: "Comp A",
            },
          };
        }),
      };
    }),

  addTakeToFolder: (clipId, takeFilePath, waveformPeaks) =>
    set((state) => {
      return {
        clips: state.clips.map((clip) => {
          if (clip.id !== clipId) return clip;

          const existingFolder = clip.takeFolder;
          const takes = existingFolder ? [...existingFolder.takes] : [];

          if (takes.length === 0) {
            takes.push({
              id: `take-${Date.now()}-1`,
              name: "Take 1",
              audioFilePath: clip.sourceId,
              waveformPeaks: clip.waveformPeaks || [0.4, 0.6, 0.8],
              createdTimestamp: Date.now() - 60000,
            });
          }

          const nextNum = takes.length + 1;
          const newTake: AudioTake = {
            id: `take-${Date.now()}-${nextNum}`,
            name: `Take ${nextNum}`,
            audioFilePath: takeFilePath,
            waveformPeaks,
            createdTimestamp: Date.now(),
          };
          takes.push(newTake);

          const activeComp = existingFolder
            ? existingFolder.activeComp
            : [
                {
                  id: `slice-${Date.now()}-1`,
                  takeId: takes[0].id,
                  startBar: clip.startBar,
                  durationBars: clip.durationBars,
                  fadeInMs: 5,
                  fadeOutMs: 5,
                },
              ];

          const updatedFolder: TakeFolderData = {
            takes,
            activeComp,
            isExpanded: true,
            selectedCompName: existingFolder?.selectedCompName || "Comp A",
          };

          const newPeaks = computeCompositePeaks(
            clip.startBar,
            clip.durationBars,
            takes,
            activeComp
          );

          return {
            ...clip,
            waveformPeaks: newPeaks,
            takeFolder: updatedFolder,
          };
        }),
      };
    }),

  toggleTakeFolderExpanded: (clipId) =>
    set((state) => ({
      clips: state.clips.map((clip) => {
        if (clip.id !== clipId || !clip.takeFolder) return clip;
        return {
          ...clip,
          takeFolder: {
            ...clip.takeFolder,
            isExpanded: !clip.takeFolder.isExpanded,
          },
        };
      }),
    })),

  setCompSlice: (clipId, takeId, startBar, durationBars) =>
    set((state) => ({
      clips: state.clips.map((clip) => {
        if (clip.id !== clipId || !clip.takeFolder) return clip;

        const updatedComp = computeCompSlicesAfterSwipe(
          clip.takeFolder.activeComp,
          takeId,
          startBar,
          durationBars,
          clip.startBar,
          clip.durationBars
        );

        const newPeaks = computeCompositePeaks(
          clip.startBar,
          clip.durationBars,
          clip.takeFolder.takes,
          updatedComp
        );

        return {
          ...clip,
          waveformPeaks: newPeaks,
          takeFolder: {
            ...clip.takeFolder,
            activeComp: updatedComp,
          },
        };
      }),
    })),

  flattenAndMergeComp: (clipId) =>
    set((state) => ({
      clips: state.clips.map((clip) => {
        if (clip.id !== clipId || !clip.takeFolder) return clip;
        const compPeaks = computeCompositePeaks(
          clip.startBar,
          clip.durationBars,
          clip.takeFolder.takes,
          clip.takeFolder.activeComp
        );

        return {
          ...clip,
          name: `${clip.name.replace(/\s*\(.*Takes\)/, "")} (Comp Flattened)`,
          waveformPeaks: compPeaks,
          takeFolder: undefined,
        };
      }),
    })),

  setCompPreset: (clipId, compName) =>
    set((state) => ({
      clips: state.clips.map((clip) => {
        if (clip.id !== clipId || !clip.takeFolder) return clip;
        return {
          ...clip,
          takeFolder: {
            ...clip.takeFolder,
            selectedCompName: compName,
          },
        };
      }),
    })),

  setZoomX: (zoom) => set({ zoomX: Math.max(30, Math.min(240, zoom)) }),
  setScrollX: (scrollX) => set({ scrollX }),
  setScrollY: (scrollY) => set({ scrollY }),
  setSnapGrid: (snapGrid) => set({ snapGrid }),
  setActiveTool: (activeTool) => set({ activeTool }),
  setLoopRange: (loopStartBar, loopEndBar) =>
    set({
      loopStartBar: Math.max(1, loopStartBar),
      loopEndBar: Math.max(loopStartBar + 0.25, loopEndBar),
    }),
  setTotalBars: (totalBars) => set({ totalBars: Math.max(16, totalBars) }),

  addTrack: (name = "Audio Track", type = "audio", color = "#ff4400") =>
    set((state) => {
      const id = `track-${Date.now()}`;
      const newTrack: ArrangerTrack = {
        id,
        name,
        type,
        color,
        isMuted: false,
        isSolo: false,
        isArmed: false,
        volume: 0.8,
        pan: 0,
        height: 72,
      };
      return { tracks: [...state.tracks, newTrack] };
    }),

  removeTrack: (id) =>
    set((state) => ({
      tracks: state.tracks.filter((t) => t.id !== id),
      clips: state.clips.filter((c) => c.trackId !== id),
    })),

  toggleTrackMute: (id) =>
    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === id ? { ...t, isMuted: !t.isMuted } : t)),
    })),

  toggleTrackSolo: (id) =>
    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === id ? { ...t, isSolo: !t.isSolo } : t)),
    })),

  toggleTrackArm: (id) =>
    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === id ? { ...t, isArmed: !t.isArmed } : t)),
    })),

  setTrackVolume: (id, volume) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === id ? { ...t, volume: Math.max(0, Math.min(1, volume)) } : t
      ),
    })),

  setTrackPan: (id, pan) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === id ? { ...t, pan: Math.max(-1, Math.min(1, pan)) } : t
      ),
    })),

  addClip: (clipData) => {
    const id = clipData.id || `clip-${Date.now()}`;
    const newClip: TimelineClip = {
      ...clipData,
      id,
    };
    set((state) => ({
      clips: [...state.clips, newClip],
    }));
    return id;
  },

  removeClip: (id) =>
    set((state) => ({
      clips: state.clips.filter((c) => c.id !== id),
    })),

  moveClip: (id, newStartBar, newTrackId) =>
    set((state) => ({
      clips: state.clips.map((c) => {
        if (c.id !== id) return c;
        const delta = newStartBar - c.startBar;
        // Shift active comp slices with the clip if takeFolder is present
        const updatedTakeFolder = c.takeFolder
          ? {
              ...c.takeFolder,
              activeComp: c.takeFolder.activeComp.map((s) => ({
                ...s,
                startBar: Number((s.startBar + delta).toFixed(4)),
              })),
            }
          : undefined;

        return {
          ...c,
          startBar: Math.max(1, newStartBar),
          trackId: newTrackId || c.trackId,
          takeFolder: updatedTakeFolder,
        };
      }),
    })),

  resizeClip: (id, newStartBar, newDurationBars, newOffsetBars) =>
    set((state) => ({
      clips: state.clips.map((c) => {
        if (c.id !== id) return c;
        return {
          ...c,
          startBar: Math.max(1, newStartBar),
          durationBars: Math.max(0.125, newDurationBars),
          offsetBars: newOffsetBars !== undefined ? newOffsetBars : c.offsetBars,
        };
      }),
    })),

  splitClipAtBar: (id, splitBar) =>
    set((state) => {
      const clip = state.clips.find((c) => c.id === id);
      if (!clip) return state;

      const snappedSplit = snapToGrid(splitBar, state.snapGrid);
      if (snappedSplit <= clip.startBar || snappedSplit >= clip.startBar + clip.durationBars) {
        return state;
      }

      const durationFirst = snappedSplit - clip.startBar;
      const durationSecond = clip.durationBars - durationFirst;

      const firstPiece: TimelineClip = {
        ...clip,
        durationBars: durationFirst,
      };

      const secondPiece: TimelineClip = {
        ...clip,
        id: `clip-${Date.now()}-split`,
        startBar: snappedSplit,
        durationBars: durationSecond,
        offsetBars: clip.offsetBars + durationFirst,
        isSelected: false,
      };

      return {
        clips: state.clips.map((c) => (c.id === id ? firstPiece : c)).concat(secondPiece),
      };
    }),

  duplicateClip: (id) =>
    set((state) => {
      const clip = state.clips.find((c) => c.id === id);
      if (!clip) return state;

      const duplicate: TimelineClip = {
        ...clip,
        id: `clip-${Date.now()}-dup`,
        startBar: clip.startBar + clip.durationBars,
        isSelected: false,
      };

      return {
        clips: [...state.clips, duplicate],
      };
    }),

  selectClip: (id, multi = false) =>
    set((state) => ({
      clips: state.clips.map((c) => {
        if (c.id === id) {
          return { ...c, isSelected: multi ? !c.isSelected : true };
        }
        return multi ? c : { ...c, isSelected: false };
      }),
    })),

  clearSelection: () =>
    set((state) => ({
      clips: state.clips.map((c) => (c.isSelected ? { ...c, isSelected: false } : c)),
    })),

  toggleClipMute: (id) =>
    set((state) => ({
      clips: state.clips.map((c) => (c.id === id ? { ...c, isMuted: !c.isMuted } : c)),
    })),
}));
