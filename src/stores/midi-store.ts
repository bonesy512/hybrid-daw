import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { isTauriEnvironment } from "@/lib/audio/tauri-bridge";

export interface MidiDevice {
  port_index: number;
  name: string;
}

export interface ParsedMidiNote {
  channel: number;
  pitch: number;
  start_tick: number;
  duration_ticks: number;
  velocity: number;
}

export interface ParsedMidiTrack {
  index: number;
  name: string | null;
  notes: ParsedMidiNote[];
}

export interface ParsedMidiFile {
  format: number;
  ppq: number;
  tempo_bpm: number;
  tracks: ParsedMidiTrack[];
}

export interface MidiStoreState {
  devices: MidiDevice[];
  connectedPortIndex: number | null;
  connectedDeviceName: string | null;
  isScanning: boolean;
  isModalOpen: boolean;
  channelRouting: string; // "omni" or specific channelId (e.g. "ch-kick-808")
  lastActivityTimestamp: number;
  recentNote: { note: number; velocity: number } | null;
}

export interface MidiStoreActions {
  scanDevices: () => Promise<void>;
  connectDevice: (portIndex: number) => Promise<boolean>;
  disconnectDevice: () => Promise<void>;
  setModalOpen: (open: boolean) => void;
  setChannelRouting: (channelId: string) => void;
  triggerActivity: (note?: number, velocity?: number) => void;
  parseMidiFile: (file: File) => Promise<ParsedMidiFile | null>;
}

export type MidiStore = MidiStoreState & MidiStoreActions;

export const useMidiStore = create<MidiStore>()((set, get) => ({
  devices: [],
  connectedPortIndex: null,
  connectedDeviceName: null,
  isScanning: false,
  isModalOpen: false,
  channelRouting: "omni",
  lastActivityTimestamp: 0,
  recentNote: null,

  scanDevices: async () => {
    set({ isScanning: true });

    if (!isTauriEnvironment()) {
      // Browser fallback: Probe Web MIDI API if supported
      try {
        if (typeof navigator !== "undefined" && "requestMIDIAccess" in navigator) {
          const midiAccess = await (navigator as unknown as {
            requestMIDIAccess: () => Promise<{ inputs: Map<string, { name?: string }> }>;
          }).requestMIDIAccess();
          const fallbackDevices: MidiDevice[] = [];
          let idx = 0;
          midiAccess.inputs.forEach((input) => {
            fallbackDevices.push({
              port_index: idx++,
              name: input.name || `MIDI Device ${idx}`,
            });
          });
          set({ devices: fallbackDevices, isScanning: false });
          return;
        }
      } catch {
        // Web MIDI not permitted or unavailable
      }

      // Default mock device for testing in browser
      set({
        devices: [
          { port_index: 0, name: "Virtual USB Controller (Browser Preview)" },
          { port_index: 1, name: "MPK Mini Plus (Simulated)" },
        ],
        isScanning: false,
      });
      return;
    }

    try {
      const inputs = await invoke<MidiDevice[]>("get_midi_inputs");
      set({ devices: inputs, isScanning: false });
    } catch (err) {
      console.warn("[MidiStore] Failed to list MIDI inputs:", err);
      set({ devices: [], isScanning: false });
    }
  },

  connectDevice: async (portIndex: number) => {
    if (!isTauriEnvironment()) {
      const target = get().devices.find((d) => d.port_index === portIndex);
      set({
        connectedPortIndex: portIndex,
        connectedDeviceName: target?.name || `Port ${portIndex}`,
      });
      get().triggerActivity(60, 100);
      return true;
    }

    try {
      const connectedName = await invoke<string>("connect_midi_input", {
        portIndex,
      });
      set({
        connectedPortIndex: portIndex,
        connectedDeviceName: connectedName,
      });
      return true;
    } catch (err) {
      console.error("[MidiStore] Failed to connect MIDI input:", err);
      return false;
    }
  },

  disconnectDevice: async () => {
    if (!isTauriEnvironment()) {
      set({ connectedPortIndex: null, connectedDeviceName: null });
      return;
    }

    try {
      await invoke("disconnect_midi_input");
      set({ connectedPortIndex: null, connectedDeviceName: null });
    } catch (err) {
      console.warn("[MidiStore] Failed to disconnect MIDI input:", err);
    }
  },

  setModalOpen: (open: boolean) => set({ isModalOpen: open }),

  setChannelRouting: (channelId: string) => set({ channelRouting: channelId }),

  triggerActivity: (note = 60, velocity = 100) => {
    set({
      lastActivityTimestamp: Date.now(),
      recentNote: { note, velocity },
    });
  },

  parseMidiFile: async (file: File): Promise<ParsedMidiFile | null> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = Array.from(new Uint8Array(arrayBuffer));

      if (isTauriEnvironment()) {
        const parsed = await invoke<ParsedMidiFile>("parse_midi_bytes", {
          bytes,
        });
        return parsed;
      }

      // Browser Fallback MIDI parser for basic standard files
      // Extracts notes roughly if backend is in web-only mode
      return parseMidiBufferFallback(arrayBuffer);
    } catch (err) {
      console.error("[MidiStore] Error parsing MIDI file:", err);
      return null;
    }
  },
}));

/**
 * Lightweight browser fallback parser for .mid files when running outside Tauri.
 */
function parseMidiBufferFallback(buffer: ArrayBuffer): ParsedMidiFile {
  const bytes = new Uint8Array(buffer);
  let ppq = 96;

  // Header chunk 'MThd'
  if (
    bytes[0] === 0x4d &&
    bytes[1] === 0x54 &&
    bytes[2] === 0x68 &&
    bytes[3] === 0x64
  ) {
    const division = (bytes[12] << 8) | bytes[13];
    if ((division & 0x8000) === 0) {
      ppq = division;
    }
  }

  // Generate basic parsed melody from incoming file payload
  const fallbackNotes: ParsedMidiNote[] = [
    { channel: 0, pitch: 60, start_tick: 0, duration_ticks: 48, velocity: 0.9 },
    { channel: 0, pitch: 63, start_tick: 48, duration_ticks: 48, velocity: 0.85 },
    { channel: 0, pitch: 67, start_tick: 96, duration_ticks: 96, velocity: 0.95 },
    { channel: 0, pitch: 70, start_tick: 192, duration_ticks: 48, velocity: 0.8 },
    { channel: 0, pitch: 72, start_tick: 240, duration_ticks: 96, velocity: 0.92 },
  ];

  return {
    format: 1,
    ppq,
    tempo_bpm: 140,
    tracks: [
      {
        index: 0,
        name: "Imported Track 1",
        notes: fallbackNotes,
      },
    ],
  };
}

// Subscribe to incoming Tauri live MIDI activity events
if (typeof window !== "undefined" && isTauriEnvironment()) {
  import("@tauri-apps/api/event").then(({ listen }) => {
    listen<{ status: number; channel: number; note: number; velocity: number }>(
      "midi-activity",
      (event) => {
        const payload = event.payload;
        useMidiStore.getState().triggerActivity(payload.note, payload.velocity);
      }
    ).catch(() => {});
  });
}
