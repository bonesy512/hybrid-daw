"use client";

import React, { useRef, useState } from "react";
import {
  Circle,
  Plus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type EffectType,
  type MixerTrack,
  useMixerStore,
} from "@/stores/mixer-store";
import { useTransportStore } from "@/stores/transport-store";
import { CanvasVuMeter } from "./CanvasVuMeter";

interface MixerKnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  defaultValue?: number;
  unit?: string;
  formatValue?: (val: number) => string;
  onChange: (val: number) => void;
  color?: string;
}

function MixerKnob({
  label,
  value,
  min,
  max,
  defaultValue = 0,
  unit = "",
  formatValue,
  onChange,
  color = "#ff4400",
}: MixerKnobProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startY: number; startVal: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startVal: value };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const deltaY = dragRef.current.startY - e.clientY;
    const range = max - min;
    const sensitivity = e.shiftKey ? 300 : 100;
    const deltaVal = (deltaY / sensitivity) * range;
    const nextVal = Math.max(min, Math.min(max, dragRef.current.startVal + deltaVal));
    onChange(Number(nextVal.toFixed(1)));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // pointer capture lost
      }
      dragRef.current = null;
      setIsDragging(false);
    }
  };

  const normalized = (value - min) / (max - min || 1);
  const angle = -135 + normalized * 270;
  const displayString = formatValue ? formatValue(value) : `${value > 0 ? `+${value}` : value}${unit}`;

  return (
    <div
      className="flex flex-col items-center gap-0.5 select-none cursor-ns-resize"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={() => onChange(defaultValue)}
      title={`${label}: Drag to adjust, 2x-click to reset (${defaultValue}${unit})`}
    >
      <span className="font-mono text-[8px] font-bold text-zinc-500 uppercase tracking-tighter">
        {label}
      </span>
      <div
        className={cn(
          "relative flex size-6 items-center justify-center rounded-full border border-zinc-700 bg-[#16161d] shadow-[0_1px_2px_rgba(0,0,0,0.8)] transition-all",
          isDragging && "ring-1 ring-telemetry-orange shadow-[0_0_8px_rgba(255,68,0,0.5)]"
        )}
      >
        <div
          className="relative size-4 rounded-full bg-[#0e0e13]"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          <div
            className="absolute top-0.5 left-1/2 h-1.5 w-[1.5px] -translate-x-1/2 rounded-full"
            style={{ backgroundColor: color }}
          />
        </div>
      </div>
      <span className="font-mono text-[8px] text-zinc-400 tabular-nums">
        {displayString}
      </span>
    </div>
  );
}

// Convert volume dB (-60 to +6) to 0..1 linear fader slider travel
function dbToLinear(dB: number): number {
  if (dB <= -60) return 0.0;
  if (dB >= 6) return 1.0;
  // Piecewise curve matching analog audio faders: unity (0dB) sits around 75% fader travel
  if (dB >= 0) {
    return 0.75 + (dB / 6) * 0.25;
  }
  return Math.max(0, 0.75 * Math.pow((dB + 60) / 60, 2.0));
}

// Convert 0..1 linear fader slider travel back to dB (-60 to +6)
function linearToDb(lin: number): number {
  if (lin <= 0.01) return -60;
  if (lin >= 1.0) return 6.0;
  if (lin >= 0.75) {
    return ((lin - 0.75) / 0.25) * 6;
  }
  const ratio = Math.sqrt(lin / 0.75);
  return -60 + ratio * 60;
}

interface ChannelStripProps {
  track: MixerTrack;
  isMaster?: boolean;
}

export function ChannelStrip({ track, isMaster = false }: ChannelStripProps) {
  const isPlaying = useTransportStore((state) => state.isPlaying);

  const selectedTrackId = useMixerStore((state) => state.selectedTrackId);
  const selectTrack = useMixerStore((state) => state.selectTrack);
  const setTrackVolume = useMixerStore((state) => state.setTrackVolume);
  const setTrackPan = useMixerStore((state) => state.setTrackPan);
  const setTrackGain = useMixerStore((state) => state.setTrackGain);
  const togglePhaseInvert = useMixerStore((state) => state.togglePhaseInvert);
  const toggleTrackMute = useMixerStore((state) => state.toggleTrackMute);
  const toggleTrackSolo = useMixerStore((state) => state.toggleTrackSolo);
  const toggleTrackArm = useMixerStore((state) => state.toggleTrackArm);
  const toggleInsertActive = useMixerStore((state) => state.toggleInsertActive);
  const addInsert = useMixerStore((state) => state.addInsert);
  const removeInsert = useMixerStore((state) => state.removeInsert);
  const setSendAmount = useMixerStore((state) => state.setSendAmount);
  const toggleSendPreFader = useMixerStore((state) => state.toggleSendPreFader);
  const tracks = useMixerStore((state) => state.tracks);
  const openCompressorModal = useMixerStore((state) => state.openCompressorModal);
  const openChannelEqModal = useMixerStore((state) => state.openChannelEqModal);

  const trackIndex =
    isMaster || track.id === "track-master"
      ? 8
      : Math.max(0, tracks.findIndex((t) => t.id === track.id));

  const [isEditingVolume, setIsEditingVolume] = useState(false);
  const [volInputVal, setVolInputVal] = useState(track.volume.toFixed(1));
  const [showInsertMenu, setShowInsertMenu] = useState(false);

  const faderWellRef = useRef<HTMLDivElement>(null);
  const isSelected = selectedTrackId === track.id;

  // Fader drag handling
  const handleFaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const updateFaderFromY = (clientY: number) => {
      const well = faderWellRef.current;
      if (!well) return;
      const rect = well.getBoundingClientRect();
      // Invert Y so bottom is 0, top is 1
      const normalizedLin = Math.max(0, Math.min(1, (rect.bottom - clientY) / rect.height));
      const nextDb = Number(linearToDb(normalizedLin).toFixed(1));
      setTrackVolume(track.id, nextDb);
    };

    updateFaderFromY(e.clientY);

    const onPointerMove = (ev: PointerEvent) => {
      updateFaderFromY(ev.clientY);
    };

    const onPointerUp = (ev: PointerEvent) => {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId);
      } catch {
        // pointer capture lost
      }
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const handleCommitVolInput = () => {
    const parsed = parseFloat(volInputVal);
    if (!Number.isNaN(parsed)) {
      setTrackVolume(track.id, parsed);
    }
    setIsEditingVolume(false);
  };

  const faderHeightPercent = dbToLinear(track.volume) * 100;
  const faderDbDisplay = track.volume <= -55 ? "-inf" : `${track.volume > 0 ? `+${track.volume.toFixed(1)}` : track.volume.toFixed(1)} dB`;

  const AVAILABLE_EFFECTS: { label: string; type: EffectType }[] = [
    { label: "8-Band Parametric EQ", type: "eq" },
    { label: "Vintage VCA Compressor", type: "compressor" },
    { label: "Tape Stereo Delay", type: "delay" },
    { label: "Studio Plate Reverb", type: "reverb" },
    { label: "Tube Preamp Saturation", type: "saturation" },
  ];

  return (
    <div
      onClick={() => selectTrack(track.id)}
      className={cn(
        "flex w-36 shrink-0 flex-col rounded-sm border bg-[#09090d] p-1.5 transition-all select-none",
        isSelected
          ? "border-telemetry-orange/80 bg-[#0e0e15] shadow-[0_0_12px_rgba(255,68,0,0.2)]"
          : "border-zinc-800/90 hover:border-zinc-700",
        isMaster && "border-zinc-700 bg-[#0b0b10]"
      )}
    >
      {/* ── TOP SECTION: GAIN / TRIM & PHASE ── */}
      <div className="flex flex-col gap-1 rounded-xs border border-zinc-900 bg-[#060609] p-1.5">
        <div className="flex items-center justify-between">
          <MixerKnob
            label="TRIM"
            value={track.inputGain}
            min={-24}
            max={24}
            unit="dB"
            defaultValue={0}
            onChange={(v) => setTrackGain(track.id, v)}
            color="#fbbf24"
          />

          {/* Phase Invert Toggle Button (Ø) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              togglePhaseInvert(track.id);
            }}
            className={cn(
              "flex size-6 items-center justify-center rounded-xs border font-mono text-xs font-bold transition-all",
              track.phaseInvert
                ? "border-telemetry-orange bg-orange-950 text-telemetry-orange shadow-[0_0_6px_rgba(255,68,0,0.6)]"
                : "border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300"
            )}
            title="Phase Invert (Ø)"
          >
            Ø
          </button>

          <MixerKnob
            label="PAN"
            value={track.pan}
            min={-1}
            max={1}
            defaultValue={0}
            formatValue={(v) => (v === 0 ? "C" : v < 0 ? `L${Math.round(Math.abs(v) * 100)}` : `R${Math.round(v * 100)}`)}
            onChange={(v) => setTrackPan(track.id, v)}
            color="#38bdf8"
          />
        </div>
      </div>

      {/* ── CHANNEL EQ DISPLAY THUMBNAIL ── */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          const eqIns = track.inserts.find((ins) => ins.type === "eq");
          openChannelEqModal(track.id, trackIndex, eqIns?.id);
        }}
        className="mt-1.5 flex h-6 cursor-pointer items-center justify-between rounded-xs border border-zinc-900 bg-[#060609] px-1.5 hover:border-cyan-500/70 transition-colors group"
        title="Open 8-Band Channel EQ"
      >
        <span className="font-mono text-[7px] font-black text-cyan-400 group-hover:text-cyan-300">
          EQ
        </span>
        <svg className="h-3 w-16 overflow-visible opacity-70 group-hover:opacity-100" viewBox="0 0 80 16">
          <path
            d="M 0,8 Q 14,8 22,4 T 42,8 T 62,12 T 80,8"
            fill="none"
            stroke="#22d3ee"
            strokeWidth="1.2"
          />
        </svg>
        <span className="font-mono text-[6px] font-bold text-zinc-500">
          8-BAND
        </span>
      </div>

      {/* ── INSERTS SECTION (UP TO 8 SLOTS) ── */}
      <div className="mt-1.5 flex flex-col gap-0.5 rounded-xs border border-zinc-900 bg-[#060609] p-1">
        <div className="flex items-center justify-between px-1">
          <span className="font-mono text-[7px] font-bold text-zinc-500 uppercase tracking-widest">
            INSERTS [1-8]
          </span>
          {track.inserts.length < 8 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowInsertMenu(!showInsertMenu);
              }}
              className="text-zinc-500 hover:text-telemetry-orange"
              title="Add Insert Plugin"
            >
              <Plus className="size-2.5" />
            </button>
          )}
        </div>

        {/* Plugin slots */}
        <div className="flex flex-col gap-0.5 min-h-[92px]">
          {track.inserts.map((ins) => (
            <div
              key={ins.id}
              onClick={(e) => {
                e.stopPropagation();
                if (ins.type === "compressor") {
                  openCompressorModal(track.id, trackIndex, ins.id);
                } else if (ins.type === "eq") {
                  openChannelEqModal(track.id, trackIndex, ins.id);
                }
              }}
              className={cn(
                "group flex h-5 items-center justify-between rounded-[1px] border px-1 font-mono text-[8px] transition-colors",
                ins.type === "compressor" && "cursor-pointer hover:border-telemetry-orange/70",
                ins.type === "eq" && "cursor-pointer hover:border-cyan-500/70",
                ins.isActive
                  ? "border-zinc-700/80 bg-zinc-900/90 text-zinc-200"
                  : "border-zinc-900 bg-zinc-950 text-zinc-600 line-through"
              )}
              title={
                ins.type === "compressor"
                  ? `Open Modeled Compressor (${ins.name})`
                  : ins.type === "eq"
                  ? `Open 8-Band Channel EQ (${ins.name})`
                  : ins.name
              }
            >
              {/* Power LED toggle */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleInsertActive(track.id, ins.id);
                }}
                className={cn(
                  "size-2 rounded-full transition-all shrink-0 mr-1",
                  ins.isActive
                    ? "bg-telemetry-green shadow-[0_0_4px_rgba(0,245,155,0.9)]"
                    : "bg-zinc-800"
                )}
                title={ins.isActive ? "Bypass Effect" : "Activate Effect"}
              />

              <span className={cn(
                "truncate flex-1 text-left font-semibold",
                ins.type === "compressor" && "group-hover:text-telemetry-orange transition-colors",
                ins.type === "eq" && "group-hover:text-cyan-400 transition-colors"
              )}>
                {ins.name}
              </span>

              {/* Remove button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeInsert(track.id, ins.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400"
                title="Remove Slot"
              >
                <X className="size-2" />
              </button>
            </div>
          ))}

          {/* Empty slot indicators up to 4 preview rows */}
          {Array.from({ length: Math.max(0, 4 - track.inserts.length) }).map((_, i) => (
            <div
              key={i}
              className="flex h-5 items-center rounded-[1px] border border-dashed border-zinc-900 px-1 font-mono text-[7px] text-zinc-700"
            >
              -- EMPTY --
            </div>
          ))}
        </div>

        {/* Insert Preset Selector Dropdown */}
        {showInsertMenu && (
          <div
            className="absolute z-50 left-2 mt-1 w-44 rounded-sm border border-zinc-700 bg-zinc-950 p-1 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="block px-1.5 py-0.5 font-mono text-[8px] text-zinc-500 uppercase">
              ADD DSP EFFECT
            </span>
            {AVAILABLE_EFFECTS.map((eff) => (
              <button
                key={eff.label}
                type="button"
                onClick={() => {
                  addInsert(track.id, eff.type);
                  setShowInsertMenu(false);
                }}
                className="w-full text-left rounded-xs px-1.5 py-1 font-mono text-[9px] text-zinc-200 hover:bg-zinc-800"
              >
                {eff.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── SENDS MATRIX (FL/LOGIC STYLE) ── */}
      {!isMaster && (
        <div className="mt-1.5 flex flex-col gap-0.5 rounded-xs border border-zinc-900 bg-[#060609] p-1">
          <div className="flex items-center justify-between px-1">
            <span className="font-mono text-[7px] font-bold text-zinc-500 uppercase tracking-widest">
              AUX SENDS
            </span>
            <span className="font-mono text-[7px] text-zinc-600">POST-FDR</span>
          </div>

          <div className="flex items-center justify-between px-1 py-0.5">
            <span className="font-mono text-[8px] text-zinc-400 truncate max-w-[50px]">
              DLY AUX
            </span>
            <div className="flex items-center gap-1">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={track.sends[0]?.amount ?? 0}
                onChange={(e) => {
                  setSendAmount(track.id, "track-4", parseFloat(e.target.value));
                }}
                className="h-1 w-14 accent-telemetry-orange cursor-pointer"
                title={`Send to Delay: ${Math.round((track.sends[0]?.amount ?? 0) * 100)}%`}
              />
              <button
                type="button"
                onClick={() => toggleSendPreFader(track.id, "track-4")}
                className={cn(
                  "px-1 font-mono text-[7px] font-bold rounded-[1px] border",
                  track.sends[0]?.isPreFader
                    ? "border-telemetry-orange text-telemetry-orange"
                    : "border-zinc-800 text-zinc-600"
                )}
                title="Toggle Pre/Post Fader"
              >
                P
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FADER WELL (100MM THROW & DUAL VU METERS) ── */}
      <div className="mt-2 flex flex-1 flex-col items-center">
        {/* dB Scale & Fader Assembly */}
        <div className="relative flex w-full items-stretch justify-between px-1">
          {/* Accurate logarithmic dB tick marks */}
          <div className="flex flex-col justify-between py-1 font-mono text-[7px] text-zinc-600 select-none">
            <span>+6</span>
            <span className="font-bold text-zinc-500"> 0</span>
            <span>-6</span>
            <span>-12</span>
            <span>-24</span>
            <span>-inf</span>
          </div>

          {/* 100mm Vertical Fader Track */}
          <div
            ref={faderWellRef}
            onPointerDown={handleFaderPointerDown}
            className="relative flex h-44 w-10 items-center justify-center rounded-xs border border-zinc-900 bg-[#040407] shadow-[inset_0_2px_4px_rgba(0,0,0,0.9)] cursor-ns-resize"
          >
            {/* Center rail slot */}
            <div className="absolute inset-y-2 w-1 rounded-full bg-black shadow-[inset_0_0_2px_rgba(0,0,0,0.9)]" />

            {/* Zero dB unity notch guide */}
            <div className="absolute top-[25%] left-0 right-0 h-[1px] bg-zinc-700/60 pointer-events-none" />

            {/* Tactical Aluminum Fader Cap */}
            <div
              className="absolute left-1/2 w-8 -translate-x-1/2 rounded-[2px] border border-t-zinc-400 border-l-zinc-500 border-b-black border-r-black bg-gradient-to-b from-[#2e2e38] via-[#1a1a24] to-[#121218] p-0.5 shadow-[0_4px_8px_rgba(0,0,0,0.9),inset_0_1px_1px_rgba(255,255,255,0.2)]"
              style={{
                bottom: `calc(${faderHeightPercent}% - 14px)`,
                height: "28px",
              }}
            >
              {/* Center White Marker Line */}
              <div className="absolute top-1/2 left-0 right-0 h-[2px] -translate-y-1/2 bg-white shadow-[0_0_2px_rgba(255,255,255,0.9)]" />
              {/* Grip ridges */}
              <div className="flex h-full w-full flex-col justify-between py-1 opacity-40">
                <div className="h-[1px] bg-black" />
                <div className="h-[1px] bg-black" />
              </div>
            </div>
          </div>

          {/* Dual Channel (L/R) Segmented Peak VU Meter */}
          <CanvasVuMeter
            isPlaying={isPlaying}
            isMuted={track.isMuted}
            volumeDb={track.volume}
            pan={track.pan}
            height={176}
            width={18}
          />
        </div>

        {/* Fader Readout Badge */}
        <div
          onDoubleClick={() => setIsEditingVolume(true)}
          className="mt-1 flex h-6 w-full items-center justify-center rounded-xs border border-zinc-800 bg-[#050508] px-1 font-mono text-[10px] font-bold"
          title="Double-click to type dB value"
        >
          {isEditingVolume ? (
            <input
              type="text"
              autoFocus
              value={volInputVal}
              onChange={(e) => setVolInputVal(e.target.value)}
              onBlur={handleCommitVolInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCommitVolInput();
                if (e.key === "Escape") setIsEditingVolume(false);
              }}
              className="w-full bg-transparent text-center font-mono text-[10px] font-bold text-telemetry-orange outline-none"
            />
          ) : (
            <span
              className={cn(
                "tabular-nums",
                track.volume > 0
                  ? "text-red-400 font-black"
                  : track.volume === 0
                  ? "text-telemetry-green"
                  : "text-zinc-300"
              )}
            >
              {faderDbDisplay}
            </span>
          )}
        </div>
      </div>

      {/* ── TRACK CONTROL BLOCK (REC ARM, SOLO, MUTE, LABEL) ── */}
      <div className="mt-2 flex flex-col gap-1 border-t border-zinc-800 pt-1.5">
        <div className="flex items-center justify-between gap-1">
          {/* Record Arm Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleTrackArm(track.id);
            }}
            className={cn(
              "flex size-6 items-center justify-center rounded-xs border transition-all",
              track.isArmed
                ? "border-red-500 bg-red-950 text-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)] animate-pulse"
                : "border-zinc-800 bg-zinc-900 text-zinc-600 hover:text-zinc-400"
            )}
            title="Arm for Recording"
          >
            <Circle className="size-2.5 fill-current" />
          </button>

          {/* Solo Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleTrackSolo(track.id);
            }}
            className={cn(
              "flex size-6 items-center justify-center rounded-xs border font-mono text-[10px] font-bold transition-all",
              track.isSolo
                ? "border-amber-500 bg-amber-950 text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.7)]"
                : "border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300"
            )}
            title="Solo"
          >
            S
          </button>

          {/* Mute Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleTrackMute(track.id);
            }}
            className={cn(
              "flex size-6 items-center justify-center rounded-xs border font-mono text-[10px] font-bold transition-all",
              track.isMuted
                ? "border-red-500 bg-red-950 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.7)]"
                : "border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300"
            )}
            title="Mute"
          >
            M
          </button>
        </div>

        {/* Track Label Button */}
        <div
          className="flex h-7 items-center justify-between rounded-xs border border-zinc-800 bg-zinc-900/90 px-1.5"
          style={{ borderLeftColor: track.color, borderLeftWidth: "3px" }}
        >
          <span className="truncate font-mono text-[10px] font-bold text-zinc-100">
            {track.name}
          </span>
          <span className="font-mono text-[8px] text-zinc-500">
            {isMaster ? "MST" : track.id.replace("track-", "CH")}
          </span>
        </div>
      </div>
    </div>
  );
}
