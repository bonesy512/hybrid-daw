import { create } from "zustand";

export type EffectType = "eq" | "compressor" | "delay" | "reverb" | "saturation";

export interface InsertEffect {
  id: string;
  name: string;
  type: EffectType;
  isActive: boolean;
  params: Record<string, number | string | boolean>;
}

export interface TrackSend {
  targetTrackId: string;
  amount: number; // 0.0 to 1.0 (-inf to 0dB)
  isPreFader: boolean;
}

export interface MixerTrack {
  id: string;
  name: string;
  color: string;
  inputGain: number; // dB: -24.0 to +24.0
  phaseInvert: boolean;
  pan: number; // -1.0 (Left) to 1.0 (Right)
  volume: number; // dB: -60.0 to +6.0, default 0.0 (-60 is treated as -inf)
  isMuted: boolean;
  isSolo: boolean;
  isArmed: boolean;
  inserts: InsertEffect[];
  sends: TrackSend[];
  peakL: number;
  peakR: number;
}

export interface ActiveCompressorModalState {
  isOpen: boolean;
  trackId: string | null;
  trackIndex: number;
  insertId: string | null;
}

export interface ActiveChannelEqModalState {
  isOpen: boolean;
  trackId: string | null;
  trackIndex: number;
  insertId: string | null;
}

export interface MixerStoreState {
  tracks: MixerTrack[];
  selectedTrackId: string;
  masterVolume: number;
  compressorModal: ActiveCompressorModalState;
  channelEqModal: ActiveChannelEqModalState;
}

export interface MixerStoreActions {
  setTrackVolume: (trackId: string, dB: number) => void;
  setTrackPan: (trackId: string, pan: number) => void;
  setTrackGain: (trackId: string, dB: number) => void;
  togglePhaseInvert: (trackId: string) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackSolo: (trackId: string) => void;
  toggleTrackArm: (trackId: string) => void;
  toggleInsertActive: (trackId: string, insertId: string) => void;
  addInsert: (trackId: string, type: EffectType) => void;
  removeInsert: (trackId: string, insertId: string) => void;
  setSendAmount: (trackId: string, targetTrackId: string, amount: number) => void;
  toggleSendPreFader: (trackId: string, targetTrackId: string) => void;
  selectTrack: (trackId: string) => void;
  setMasterVolume: (dB: number) => void;
  openCompressorModal: (trackId: string, trackIndex: number, insertId: string) => void;
  closeCompressorModal: () => void;
  openChannelEqModal: (trackId: string, trackIndex: number, insertId?: string) => void;
  closeChannelEqModal: () => void;
  updateInsertParams: (
    trackId: string,
    insertId: string,
    params: Record<string, number | string | boolean>
  ) => void;
}

export type MixerStore = MixerStoreState & MixerStoreActions;

const DEFAULT_EFFECT_PRESETS: Record<
  EffectType,
  { name: string; params: Record<string, number | string | boolean> }
> = {
  eq: {
    name: "Channel EQ 8-Band",
    params: {
      is_enabled: true,
      output_gain_db: 0,
      spectrum_post_eq: true,
      bands: JSON.stringify([
        { filter_type: "Highpass", is_active: false, frequency_hz: 30, gain_db: 0, q: 0.7071, slope_order: 1 },
        { filter_type: "LowShelf", is_active: true, frequency_hz: 100, gain_db: 0, q: 0.7071, slope_order: 1 },
        { filter_type: "Peaking", is_active: true, frequency_hz: 250, gain_db: 0, q: 1.0, slope_order: 1 },
        { filter_type: "Peaking", is_active: true, frequency_hz: 1000, gain_db: 0, q: 1.0, slope_order: 1 },
        { filter_type: "Peaking", is_active: true, frequency_hz: 3000, gain_db: 0, q: 1.0, slope_order: 1 },
        { filter_type: "Peaking", is_active: true, frequency_hz: 8000, gain_db: 0, q: 1.0, slope_order: 1 },
        { filter_type: "HighShelf", is_active: true, frequency_hz: 12000, gain_db: 0, q: 0.7071, slope_order: 1 },
        { filter_type: "Lowpass", is_active: false, frequency_hz: 18000, gain_db: 0, q: 0.7071, slope_order: 1 },
      ]),
    },
  },
  compressor: {
    name: "Vintage VCA Comp",
    params: {
      circuit: "VintageVca",
      threshold_db: -18,
      ratio: 4,
      attack_ms: 15,
      release_ms: 150,
      knee: 0.5,
      makeup_gain_db: 0,
      sidechain_lowcut_hz: 80,
      is_enabled: true,
      listen_sidechain: false,
    },
  },
  delay: {
    name: "Stereo Tape Delay",
    params: { time: 250, feedback: 35, mix: 30, highDamp: 6000 },
  },
  reverb: {
    name: "Plate Reverb",
    params: { decay: 2.2, preDelay: 20, size: 70, mix: 25 },
  },
  saturation: {
    name: "Tube Saturation",
    params: { drive: 3.5, tone: 50, output: -1 },
  },
};

const DEFAULT_TRACKS: MixerTrack[] = [
  {
    id: "track-1",
    name: "Drums Bus",
    color: "#ff4400", // Safety Orange
    inputGain: 0.0,
    phaseInvert: false,
    pan: 0.0,
    volume: -1.5,
    isMuted: false,
    isSolo: false,
    isArmed: false,
    inserts: [
      {
        id: "ins-1-1",
        name: "Channel EQ 8-Band",
        type: "eq",
        isActive: true,
        params: DEFAULT_EFFECT_PRESETS.eq.params,
      },
      {
        id: "ins-1-2",
        name: "Vintage VCA Comp",
        type: "compressor",
        isActive: true,
        params: DEFAULT_EFFECT_PRESETS.compressor.params,
      },
    ],
    sends: [
      { targetTrackId: "track-4", amount: 0.25, isPreFader: false },
    ],
    peakL: 0.0,
    peakR: 0.0,
  },
  {
    id: "track-2",
    name: "Bass 808",
    color: "#00f59b", // Phosphor Green
    inputGain: 1.0,
    phaseInvert: false,
    pan: 0.0,
    volume: -3.0,
    isMuted: false,
    isSolo: false,
    isArmed: false,
    inserts: [
      {
        id: "ins-2-1",
        name: "Tube Saturation",
        type: "saturation",
        isActive: true,
        params: DEFAULT_EFFECT_PRESETS.saturation.params,
      },
    ],
    sends: [],
    peakL: 0.0,
    peakR: 0.0,
  },
  {
    id: "track-3",
    name: "Vocals / Leads",
    color: "#38bdf8", // Sky Blue
    inputGain: 0.0,
    phaseInvert: false,
    pan: 0.05,
    volume: 0.0,
    isMuted: false,
    isSolo: false,
    isArmed: true,
    inserts: [
      {
        id: "ins-3-1",
        name: "Vintage Opto Comp",
        type: "compressor",
        isActive: true,
        params: {
          circuit: "VintageOpto",
          threshold_db: -14,
          ratio: 3,
          attack_ms: 10,
          release_ms: 200,
          knee: 0.7,
          makeup_gain_db: 3,
          sidechain_lowcut_hz: 100,
          is_enabled: true,
          listen_sidechain: false,
        },
      },
      {
        id: "ins-3-2",
        name: "Plate Reverb",
        type: "reverb",
        isActive: true,
        params: DEFAULT_EFFECT_PRESETS.reverb.params,
      },
    ],
    sends: [
      { targetTrackId: "track-4", amount: 0.45, isPreFader: false },
    ],
    peakL: 0.0,
    peakR: 0.0,
  },
  {
    id: "track-4",
    name: "Aux 1: Delay",
    color: "#fbbf24", // Amber
    inputGain: 0.0,
    phaseInvert: false,
    pan: 0.0,
    volume: -6.0,
    isMuted: false,
    isSolo: false,
    isArmed: false,
    inserts: [
      {
        id: "ins-4-1",
        name: "Stereo Tape Delay",
        type: "delay",
        isActive: true,
        params: DEFAULT_EFFECT_PRESETS.delay.params,
      },
    ],
    sends: [],
    peakL: 0.0,
    peakR: 0.0,
  },
  {
    id: "track-master",
    name: "Master Out 1/2",
    color: "#fafafa", // Pure Zinc
    inputGain: 0.0,
    phaseInvert: false,
    pan: 0.0,
    volume: 0.0,
    isMuted: false,
    isSolo: false,
    isArmed: false,
    inserts: [
      {
        id: "ins-m-1",
        name: "Platinum Master Comp",
        type: "compressor",
        isActive: true,
        params: {
          circuit: "Platinum",
          threshold_db: -2.0,
          ratio: 10,
          attack_ms: 1.0,
          release_ms: 100,
          knee: 0.2,
          makeup_gain_db: 0,
          sidechain_lowcut_hz: 30,
          is_enabled: true,
          listen_sidechain: false,
        },
      },
    ],
    sends: [],
    peakL: 0.0,
    peakR: 0.0,
  },
];

export const useMixerStore = create<MixerStore>()((set) => ({
  tracks: DEFAULT_TRACKS,
  selectedTrackId: "track-1",
  masterVolume: 0.0,
  compressorModal: {
    isOpen: false,
    trackId: null,
    trackIndex: 0,
    insertId: null,
  },
  channelEqModal: {
    isOpen: false,
    trackId: null,
    trackIndex: 0,
    insertId: null,
  },

  setTrackVolume: (trackId: string, dB: number) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId
          ? { ...t, volume: Math.max(-60, Math.min(6, Number(dB.toFixed(1)))) }
          : t
      ),
      masterVolume: trackId === "track-master" ? Math.max(-60, Math.min(6, dB)) : state.masterVolume,
    })),

  setTrackPan: (trackId: string, pan: number) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId
          ? { ...t, pan: Math.max(-1.0, Math.min(1.0, Number(pan.toFixed(2)))) }
          : t
      ),
    })),

  setTrackGain: (trackId: string, dB: number) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId
          ? { ...t, inputGain: Math.max(-24, Math.min(24, Number(dB.toFixed(1)))) }
          : t
      ),
    })),

  togglePhaseInvert: (trackId: string) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId ? { ...t, phaseInvert: !t.phaseInvert } : t
      ),
    })),

  toggleTrackMute: (trackId: string) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId ? { ...t, isMuted: !t.isMuted } : t
      ),
    })),

  toggleTrackSolo: (trackId: string) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId ? { ...t, isSolo: !t.isSolo } : t
      ),
    })),

  toggleTrackArm: (trackId: string) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId ? { ...t, isArmed: !t.isArmed } : t
      ),
    })),

  toggleInsertActive: (trackId: string, insertId: string) =>
    set((state) => ({
      tracks: state.tracks.map((t) => {
        if (t.id !== trackId) return t;
        return {
          ...t,
          inserts: t.inserts.map((ins) =>
            ins.id === insertId ? { ...ins, isActive: !ins.isActive } : ins
          ),
        };
      }),
    })),

  addInsert: (trackId: string, type: EffectType) =>
    set((state) => ({
      tracks: state.tracks.map((t) => {
        if (t.id !== trackId || t.inserts.length >= 8) return t;
        const preset = DEFAULT_EFFECT_PRESETS[type];
        const newInsert: InsertEffect = {
          id: `ins-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: preset.name,
          type,
          isActive: true,
          params: { ...preset.params },
        };
        return { ...t, inserts: [...t.inserts, newInsert] };
      }),
    })),

  removeInsert: (trackId: string, insertId: string) =>
    set((state) => ({
      tracks: state.tracks.map((t) => {
        if (t.id !== trackId) return t;
        return {
          ...t,
          inserts: t.inserts.filter((ins) => ins.id !== insertId),
        };
      }),
    })),

  setSendAmount: (trackId: string, targetTrackId: string, amount: number) =>
    set((state) => ({
      tracks: state.tracks.map((t) => {
        if (t.id !== trackId) return t;
        const existing = t.sends.find((s) => s.targetTrackId === targetTrackId);
        if (existing) {
          return {
            ...t,
            sends: t.sends.map((s) =>
              s.targetTrackId === targetTrackId
                ? { ...s, amount: Math.max(0, Math.min(1, amount)) }
                : s
            ),
          };
        }
        return {
          ...t,
          sends: [
            ...t.sends,
            { targetTrackId, amount: Math.max(0, Math.min(1, amount)), isPreFader: false },
          ],
        };
      }),
    })),

  toggleSendPreFader: (trackId: string, targetTrackId: string) =>
    set((state) => ({
      tracks: state.tracks.map((t) => {
        if (t.id !== trackId) return t;
        return {
          ...t,
          sends: t.sends.map((s) =>
            s.targetTrackId === targetTrackId
              ? { ...s, isPreFader: !s.isPreFader }
              : s
          ),
        };
      }),
    })),

  selectTrack: (trackId: string) =>
    set(() => ({
      selectedTrackId: trackId,
    })),

  setMasterVolume: (dB: number) =>
    set((state) => ({
      masterVolume: Math.max(-60, Math.min(6, dB)),
      tracks: state.tracks.map((t) =>
        t.id === "track-master" ? { ...t, volume: dB } : t
      ),
    })),

  openCompressorModal: (trackId: string, trackIndex: number, insertId: string) =>
    set(() => ({
      compressorModal: {
        isOpen: true,
        trackId,
        trackIndex,
        insertId,
      },
    })),

  closeCompressorModal: () =>
    set((state) => ({
      compressorModal: {
        ...state.compressorModal,
        isOpen: false,
      },
    })),

  openChannelEqModal: (trackId: string, trackIndex: number, insertId?: string) =>
    set((state) => {
      let targetInsertId = insertId;
      let nextTracks = state.tracks;

      if (!targetInsertId) {
        const tr = state.tracks.find((t) => t.id === trackId);
        const existingEq = tr?.inserts.find((ins) => ins.type === "eq");
        if (existingEq) {
          targetInsertId = existingEq.id;
        } else {
          const newEqId = `ins-${trackId}-eq-${Date.now()}`;
          targetInsertId = newEqId;
          nextTracks = state.tracks.map((t) =>
            t.id === trackId
              ? {
                  ...t,
                  inserts: [
                    ...t.inserts,
                    {
                      id: newEqId,
                      name: "Channel EQ 8-Band",
                      type: "eq" as EffectType,
                      isActive: true,
                      params: DEFAULT_EFFECT_PRESETS.eq.params,
                    },
                  ],
                }
              : t
          );
        }
      }

      return {
        tracks: nextTracks,
        channelEqModal: {
          isOpen: true,
          trackId,
          trackIndex,
          insertId: targetInsertId,
        },
      };
    }),

  closeChannelEqModal: () =>
    set((state) => ({
      channelEqModal: {
        ...state.channelEqModal,
        isOpen: false,
      },
    })),

  updateInsertParams: (
    trackId: string,
    insertId: string,
    params: Record<string, number | string | boolean>
  ) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId
          ? {
              ...t,
              inserts: t.inserts.map((ins) =>
                ins.id === insertId
                  ? { ...ins, params: { ...ins.params, ...params } }
                  : ins
              ),
            }
          : t
      ),
    })),
}));
