import { create } from "zustand";

export type SnapGrid = "bar" | "1/2" | "1/4" | "1/8" | "1/16" | "off";
export type ArrangerTool = "pointer" | "pencil" | "scissors" | "eraser" | "mute";

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
}

export interface ArrangerActions {
  setZoomX: (zoom: number) => void;
  setScrollX: (scroll: number) => void;
  setScrollY: (scroll: number) => void;
  setSnapGrid: (snap: SnapGrid) => void;
  setActiveTool: (tool: ArrangerTool) => void;
  setLoopRange: (start: number, end: number) => void;
  setTotalBars: (bars: number) => void;

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

const DEFAULT_TRACKS: ArrangerTrack[] = [
  {
    id: "track-drums",
    name: "Drums & Percussion",
    type: "instrument",
    color: "#ff4400", // Safety Orange
    isMuted: false,
    isSolo: false,
    isArmed: true,
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

const DEFAULT_CLIPS: TimelineClip[] = [
  {
    id: "clip-drums-1",
    trackId: "track-drums",
    name: "Drums Pattern 01",
    type: "pattern",
    sourceId: "pattern-0",
    startBar: 1,
    durationBars: 4,
    offsetBars: 0,
    color: "#ff4400",
    isSelected: false,
    isMuted: false,
  },
  {
    id: "clip-drums-2",
    trackId: "track-drums",
    name: "Drums Pattern 01",
    type: "pattern",
    sourceId: "pattern-0",
    startBar: 5,
    durationBars: 4,
    offsetBars: 0,
    color: "#ff4400",
    isSelected: false,
    isMuted: false,
  },
  {
    id: "clip-drums-3",
    trackId: "track-drums",
    name: "Drums Fill & Roll",
    type: "pattern",
    sourceId: "pattern-0",
    startBar: 9,
    durationBars: 4,
    offsetBars: 0,
    color: "#ff4400",
    isSelected: false,
    isMuted: false,
  },
  {
    id: "clip-bass-1",
    trackId: "track-bass",
    name: "808 Sub Drop",
    type: "pattern",
    sourceId: "pattern-1",
    startBar: 5,
    durationBars: 4,
    offsetBars: 0,
    color: "#00f59b",
    isSelected: false,
    isMuted: false,
  },
  {
    id: "clip-bass-2",
    trackId: "track-bass",
    name: "808 Sub Slide",
    type: "pattern",
    sourceId: "pattern-1",
    startBar: 9,
    durationBars: 4,
    offsetBars: 0,
    color: "#00f59b",
    isSelected: false,
    isMuted: false,
  },
  {
    id: "clip-chords-1",
    trackId: "track-chords",
    name: "Retro Saw Chords",
    type: "pattern",
    sourceId: "pattern-2",
    startBar: 1,
    durationBars: 4,
    offsetBars: 0,
    color: "#38bdf8",
    isSelected: false,
    isMuted: false,
  },
  {
    id: "clip-chords-2",
    trackId: "track-chords",
    name: "Lead Arpeggiator",
    type: "pattern",
    sourceId: "pattern-2",
    startBar: 5,
    durationBars: 8,
    offsetBars: 0,
    color: "#38bdf8",
    isSelected: false,
    isMuted: false,
  },
  {
    id: "clip-vocals-1",
    trackId: "track-vocals",
    name: "Topline Hook Loop.wav",
    type: "audio",
    sourceId: "sample-vocal",
    startBar: 5,
    durationBars: 4,
    offsetBars: 0,
    color: "#fbbf24",
    isSelected: false,
    isMuted: false,
    waveformPeaks: [
      0.3, 0.5, 0.8, 0.4, 0.7, 0.9, 0.6, 0.3, 0.5, 0.8, 0.9, 0.7, 0.4, 0.6, 0.8, 0.3,
      0.4, 0.6, 0.7, 0.5, 0.8, 0.9, 0.7, 0.4, 0.5, 0.7, 0.9, 0.6, 0.4, 0.5, 0.8, 0.2,
    ],
  },
  {
    id: "clip-vocals-2",
    trackId: "track-vocals",
    name: "Noise Riser FX.wav",
    type: "audio",
    sourceId: "sample-riser",
    startBar: 4,
    durationBars: 1,
    offsetBars: 0,
    color: "#a855f7",
    isSelected: false,
    isMuted: false,
    waveformPeaks: [
      0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 1.0, 0.6, 0.1,
    ],
  },
];

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
    const id = clipData.id || `clip-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newClip: TimelineClip = {
      ...clipData,
      id,
    };
    set((state) => ({ clips: [...state.clips, newClip] }));
    return id;
  },

  removeClip: (id) =>
    set((state) => ({
      clips: state.clips.filter((c) => c.id !== id),
    })),

  moveClip: (id, newStartBar, newTrackId) =>
    set((state) => {
      const snap = state.snapGrid;
      const snappedBar = snapToGrid(Math.max(1, newStartBar), snap);
      return {
        clips: state.clips.map((c) => {
          if (c.id !== id) return c;
          return {
            ...c,
            startBar: snappedBar,
            trackId: newTrackId || c.trackId,
          };
        }),
      };
    }),

  resizeClip: (id, newStartBar, newDurationBars, newOffsetBars) =>
    set((state) => {
      const snap = state.snapGrid;
      const minDuration = snap === "bar" ? 0.25 : 0.0625;
      const duration = Math.max(minDuration, newDurationBars);
      return {
        clips: state.clips.map((c) => {
          if (c.id !== id) return c;
          return {
            ...c,
            startBar: snapToGrid(Math.max(1, newStartBar), snap),
            durationBars: duration,
            offsetBars: newOffsetBars !== undefined ? Math.max(0, newOffsetBars) : c.offsetBars,
          };
        }),
      };
    }),

  splitClipAtBar: (id, splitBar) =>
    set((state) => {
      const clip = state.clips.find((c) => c.id === id);
      if (!clip) return state;

      const snap = state.snapGrid;
      const snappedSplit = snapToGrid(splitBar, snap);

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
