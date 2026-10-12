import { create } from "zustand";

export type SnapDivision = "1/4" | "1/8" | "1/16" | "1/32" | "1/64" | "none";
export type PianoRollTool = "draw" | "select" | "slice" | "erase";
export type ScaleType = "none" | "major" | "minor" | "pentatonic" | "blues";
export type ChordStampType = "none" | "major" | "minor" | "minor7" | "major7" | "dom7" | "ninth";

export interface MidiNote {
  id: string;
  channelId: string;
  pitch: number; // MIDI note number 0-127 (e.g., 60 = C4)
  startTick: number; // 0 to N (at PPQ resolution)
  durationTicks: number; // Note duration in ticks (e.g. 24 = 1/16th, 96 = 1/4th)
  velocity: number; // 0.0 to 1.0
  isSelected: boolean;
}

export interface ViewRange {
  minPitch: number; // Bottom-most visible pitch (e.g. 48 = C3)
  maxPitch: number; // Top-most visible pitch (e.g. 72 = C5)
  startTick: number; // Left-most tick visible in timeline
  endTick: number; // Right-most tick visible in timeline
}

export interface PianoRollState {
  selectedChannelId: string;
  ppq: number; // Pulses / Ticks per quarter note (standard 96)
  snapDivision: SnapDivision;
  tool: PianoRollTool;
  scaleHighlight: ScaleType;
  rootPitch: number; // 0 = C, 1 = C#, etc.
  chordStamp: ChordStampType;
  viewRange: ViewRange;
  notes: MidiNote[];
}

export interface PianoRollActions {
  setSelectedChannelId: (channelId: string) => void;
  setSnapDivision: (snap: SnapDivision) => void;
  setTool: (tool: PianoRollTool) => void;
  setScaleHighlight: (scale: ScaleType) => void;
  setRootPitch: (root: number) => void;
  setChordStamp: (stamp: ChordStampType) => void;
  setViewRange: (range: Partial<ViewRange>) => void;
  addNote: (note: Omit<MidiNote, "id" | "isSelected"> & Partial<Pick<MidiNote, "id" | "isSelected">>) => string;
  removeNote: (id: string) => void;
  deleteNote: (id: string) => void;
  clearAllNotes: (channelId?: string) => void;
  updateNote: (id: string, partialNote: Partial<MidiNote>) => void;
  selectNote: (id: string, multiSelect?: boolean) => void;
  selectAllNotes: () => void;
  clearSelection: () => void;
  deleteSelectedNotes: () => void;
  quantizeSelectedNotes: () => void;
  sliceNotesAtTick: (tick: number, pitch?: number) => void;
  humanizeVelocity: () => void;
  setAllVelocity: (velocity: number) => void;
}

export type PianoRollStore = PianoRollState & PianoRollActions;

export const PPQ = 96;

/**
 * Returns tick duration for a given snap division at 96 PPQ.
 */
export const getSnapTicks = (snap: SnapDivision): number => {
  switch (snap) {
    case "1/4":
      return 96;
    case "1/8":
      return 48;
    case "1/16":
      return 24;
    case "1/32":
      return 12;
    case "1/64":
      return 6;
    case "none":
      return 1;
  }
};

/**
 * Chord stamp intervals in semitone offsets.
 */
export const CHORD_STAMP_INTERVALS: Record<ChordStampType, number[]> = {
  none: [0],
  major: [0, 4, 7],
  minor: [0, 3, 7],
  minor7: [0, 3, 7, 10],
  major7: [0, 4, 7, 11],
  dom7: [0, 4, 7, 10],
  ninth: [0, 4, 7, 10, 14],
};

/**
 * Scale degree intervals relative to root pitch (0-11).
 */
export const SCALE_INTERVALS: Record<ScaleType, number[]> = {
  none: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
};

const DEFAULT_NOTES: MidiNote[] = [];

export const usePianoRollStore = create<PianoRollStore>()((set, get) => ({
  selectedChannelId: "ch-sampler-1",
  ppq: PPQ,
  snapDivision: "1/16",
  tool: "draw",
  scaleHighlight: "minor",
  rootPitch: 0, // C
  chordStamp: "none",
  viewRange: {
    minPitch: 53, // F3
    maxPitch: 77, // F5
    startTick: 0,
    endTick: 384 * 4, // 4 bars = 1536 ticks
  },
  notes: DEFAULT_NOTES,

  setSelectedChannelId: (channelId: string) =>
    set(() => ({ selectedChannelId: channelId })),

  setSnapDivision: (snap: SnapDivision) =>
    set(() => ({ snapDivision: snap })),

  setTool: (tool: PianoRollTool) =>
    set(() => ({ tool })),

  setScaleHighlight: (scale: ScaleType) =>
    set(() => ({ scaleHighlight: scale })),

  setRootPitch: (rootPitch: number) =>
    set(() => ({ rootPitch })),

  setChordStamp: (chordStamp: ChordStampType) =>
    set(() => ({ chordStamp })),

  setViewRange: (range: Partial<ViewRange>) =>
    set((state) => ({
      viewRange: { ...state.viewRange, ...range },
    })),

  addNote: (noteData) => {
    const id = noteData.id || `note-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const newNote: MidiNote = {
      id,
      channelId: noteData.channelId || get().selectedChannelId,
      pitch: Math.max(0, Math.min(127, noteData.pitch)),
      startTick: Math.max(0, Math.round(noteData.startTick)),
      durationTicks: Math.max(1, Math.round(noteData.durationTicks)),
      velocity: Math.max(0.01, Math.min(1.0, noteData.velocity ?? 0.85)),
      isSelected: noteData.isSelected ?? false,
    };

    set((state) => ({
      notes: [...state.notes, newNote],
    }));

    return id;
  },

  removeNote: (id: string) =>
    set((state) => ({
      notes: state.notes.filter((n) => n.id !== id),
    })),

  deleteNote: (id: string) =>
    set((state) => ({
      notes: state.notes.filter((n) => n.id !== id),
    })),

  clearAllNotes: (channelId?: string) =>
    set((state) => {
      const targetChannel = channelId ?? state.selectedChannelId;
      if (!targetChannel) {
        return { notes: [] };
      }
      return {
        notes: state.notes.filter((n) => n.channelId !== targetChannel),
      };
    }),

  updateNote: (id: string, partialNote: Partial<MidiNote>) =>
    set((state) => ({
      notes: state.notes.map((n) =>
        n.id === id ? { ...n, ...partialNote } : n
      ),
    })),

  selectNote: (id: string, multiSelect = false) =>
    set((state) => ({
      notes: state.notes.map((n) => {
        if (n.id === id) {
          return { ...n, isSelected: multiSelect ? !n.isSelected : true };
        }
        return multiSelect ? n : { ...n, isSelected: false };
      }),
    })),

  selectAllNotes: () =>
    set((state) => ({
      notes: state.notes.map((n) =>
        n.channelId === state.selectedChannelId ? { ...n, isSelected: true } : n
      ),
    })),

  clearSelection: () =>
    set((state) => ({
      notes: state.notes.map((n) => ({ ...n, isSelected: false })),
    })),

  deleteSelectedNotes: () =>
    set((state) => ({
      notes: state.notes.filter((n) => !n.isSelected),
    })),

  quantizeSelectedNotes: () => {
    const state = get();
    const snapTicks = getSnapTicks(state.snapDivision);
    if (snapTicks <= 1) return;

    set((s) => {
      const hasSelection = s.notes.some((n) => n.isSelected);
      return {
        notes: s.notes.map((note) => {
          if (hasSelection && !note.isSelected) return note;
          const quantizedStart = Math.round(note.startTick / snapTicks) * snapTicks;
          return {
            ...note,
            startTick: Math.max(0, quantizedStart),
          };
        }),
      };
    });
  },

  sliceNotesAtTick: (tick: number, pitch?: number) => {
    set((state) => {
      const newNotes: MidiNote[] = [];
      for (const note of state.notes) {
        // Only slice matching channel and optionally matching pitch
        if (note.channelId !== state.selectedChannelId) {
          newNotes.push(note);
          continue;
        }
        if (pitch !== undefined && note.pitch !== pitch) {
          newNotes.push(note);
          continue;
        }

        const noteEnd = note.startTick + note.durationTicks;
        // Check if slice tick is strictly within note duration
        if (tick > note.startTick && tick < noteEnd) {
          const firstPartDuration = tick - note.startTick;
          const secondPartDuration = noteEnd - tick;

          newNotes.push({
            ...note,
            durationTicks: firstPartDuration,
          });
          newNotes.push({
            id: `note-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            channelId: note.channelId,
            pitch: note.pitch,
            startTick: tick,
            durationTicks: secondPartDuration,
            velocity: note.velocity,
            isSelected: false,
          });
        } else {
          newNotes.push(note);
        }
      }

      return { notes: newNotes };
    });
  },

  humanizeVelocity: () =>
    set((state) => ({
      notes: state.notes.map((n) => {
        if (!n.isSelected && state.notes.some((x) => x.isSelected)) return n;
        const delta = (Math.random() * 0.2 - 0.1);
        const nextVel = Math.max(0.1, Math.min(1.0, n.velocity + delta));
        return { ...n, velocity: Number(nextVel.toFixed(2)) };
      }),
    })),

  setAllVelocity: (velocity: number) =>
    set((state) => ({
      notes: state.notes.map((n) => {
        if (!n.isSelected && state.notes.some((x) => x.isSelected)) return n;
        return { ...n, velocity: Math.max(0.01, Math.min(1.0, velocity)) };
      }),
    })),
}));
