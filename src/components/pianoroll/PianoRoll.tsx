"use client";

import React, { useState } from "react";
import {
  BoxSelect,
  ChevronDown,
  Eraser,
  Magnet,
  Music2,
  Pencil,
  Scissors,
  Sparkles,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ChordStampType,
  ScaleType,
  SnapDivision,
  usePianoRollStore,
} from "@/stores/pianoroll-store";
import { usePatternStore } from "@/stores/pattern-store";
import { PianoRollCanvas } from "./PianoRollCanvas";
import { VelocityLane } from "./VelocityLane";

const ROOT_NOTES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

export const PianoRoll: React.FC = () => {
  const selectedChannelId = usePianoRollStore((s) => s.selectedChannelId);
  const setSelectedChannelId = usePianoRollStore((s) => s.setSelectedChannelId);
  const snapDivision = usePianoRollStore((s) => s.snapDivision);
  const setSnapDivision = usePianoRollStore((s) => s.setSnapDivision);
  const tool = usePianoRollStore((s) => s.tool);
  const setTool = usePianoRollStore((s) => s.setTool);
  const scaleHighlight = usePianoRollStore((s) => s.scaleHighlight);
  const setScaleHighlight = usePianoRollStore((s) => s.setScaleHighlight);
  const rootPitch = usePianoRollStore((s) => s.rootPitch);
  const setRootPitch = usePianoRollStore((s) => s.setRootPitch);
  const chordStamp = usePianoRollStore((s) => s.chordStamp);
  const setChordStamp = usePianoRollStore((s) => s.setChordStamp);
  const quantizeSelectedNotes = usePianoRollStore((s) => s.quantizeSelectedNotes);
  const deleteSelectedNotes = usePianoRollStore((s) => s.deleteSelectedNotes);
  const viewRange = usePianoRollStore((s) => s.viewRange);
  const setViewRange = usePianoRollStore((s) => s.setViewRange);

  const channels = usePatternStore((s) => s.channels);
  const activeChannel =
    channels.find((c) => c.id === selectedChannelId) || channels[0];

  const [showChannelDropdown, setShowChannelDropdown] = useState(false);
  const [showSnapDropdown, setShowSnapDropdown] = useState(false);
  const [showScaleDropdown, setShowScaleDropdown] = useState(false);
  const [showChordDropdown, setShowChordDropdown] = useState(false);

  // Zoom handlers
  const handleZoomIn = () => {
    const currentSpan = viewRange.endTick - viewRange.startTick;
    const newSpan = Math.max(192, Math.round(currentSpan * 0.75));
    setViewRange({ endTick: viewRange.startTick + newSpan });
  };

  const handleZoomOut = () => {
    const currentSpan = viewRange.endTick - viewRange.startTick;
    const newSpan = Math.min(384 * 32, Math.round(currentSpan * 1.33));
    setViewRange({ endTick: viewRange.startTick + newSpan });
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-sm border border-[#27272a] bg-[#09090b] shadow-[0_4px_20px_rgba(0,0,0,0.8)]">
      {/* ── TOP INDUSTRIAL TOOLBAR ── */}
      <div className="flex h-11 items-center justify-between border-b border-[#27272a] bg-[#0d0d12] px-3 shrink-0 select-none">
        {/* Left: Channel Selector + Tool Switchers */}
        <div className="flex items-center gap-2">
          {/* Channel Selector Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowChannelDropdown(!showChannelDropdown)}
              className="flex h-7 items-center gap-2 rounded-xs border border-zinc-700 bg-zinc-900/90 px-2.5 font-mono text-xs font-bold text-zinc-200 hover:border-zinc-500 transition-all shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
            >
              <div
                className="size-2 rounded-full shrink-0 shadow-[0_0_6px_currentColor]"
                style={{
                  backgroundColor: activeChannel?.color || "#ff4400",
                  color: activeChannel?.color || "#ff4400",
                }}
              />
              <span className="max-w-[110px] truncate uppercase">
                {activeChannel?.name || "Channel"}
              </span>
              <ChevronDown className="size-3 text-zinc-400" />
            </button>

            {showChannelDropdown && (
              <div className="absolute top-8 left-0 z-50 flex min-w-44 flex-col rounded-xs border border-zinc-700 bg-zinc-950 p-1 shadow-2xl backdrop-blur-xl">
                {channels.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => {
                      setSelectedChannelId(ch.id);
                      setShowChannelDropdown(false);
                    }}
                    className={cn(
                      "flex items-center gap-2 rounded-xs px-2 py-1.5 text-left font-mono text-xs font-semibold transition-colors uppercase",
                      ch.id === selectedChannelId
                        ? "bg-zinc-800 text-telemetry-orange font-bold"
                        : "text-zinc-300 hover:bg-zinc-900"
                    )}
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: ch.color }}
                    />
                    <span className="truncate">{ch.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="h-5 w-px bg-zinc-800" />

          {/* Primary Tool Switcher (Pencil, Marquee, Slice, Eraser) */}
          <div className="flex items-center rounded-xs border border-zinc-800 bg-black/60 p-0.5">
            <button
              type="button"
              onClick={() => setTool("draw")}
              className={cn(
                "flex size-6 items-center justify-center rounded-[2px] transition-all",
                tool === "draw"
                  ? "bg-zinc-800 text-telemetry-green shadow-[0_0_8px_rgba(0,245,155,0.4)]"
                  : "text-zinc-500 hover:text-zinc-200"
              )}
              title="Draw / Edit Note (Click and drag to extend)"
            >
              <Pencil className="size-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setTool("select")}
              className={cn(
                "flex size-6 items-center justify-center rounded-[2px] transition-all",
                tool === "select"
                  ? "bg-zinc-800 text-telemetry-green shadow-[0_0_8px_rgba(0,245,155,0.4)]"
                  : "text-zinc-500 hover:text-zinc-200"
              )}
              title="Select / Marquee Box"
            >
              <BoxSelect className="size-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setTool("slice")}
              className={cn(
                "flex size-6 items-center justify-center rounded-[2px] transition-all",
                tool === "slice"
                  ? "bg-zinc-800 text-telemetry-orange shadow-[0_0_8px_rgba(255,68,0,0.4)]"
                  : "text-zinc-500 hover:text-zinc-200"
              )}
              title="Slice / Cut Tool (Click to split notes)"
            >
              <Scissors className="size-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setTool("erase")}
              className={cn(
                "flex size-6 items-center justify-center rounded-[2px] transition-all",
                tool === "erase"
                  ? "bg-zinc-800 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.4)]"
                  : "text-zinc-500 hover:text-zinc-200"
              )}
              title="Eraser (Click note to delete)"
            >
              <Eraser className="size-3.5" />
            </button>
          </div>

          <div className="h-5 w-px bg-zinc-800" />

          {/* Snap Division Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSnapDropdown(!showSnapDropdown)}
              className="flex h-7 items-center gap-1.5 rounded-xs border border-zinc-800 bg-black/40 px-2 font-mono text-[10px] font-bold text-zinc-300 hover:border-zinc-700 transition-colors"
              title="Timing Grid Snap Division"
            >
              <Magnet className="size-3 text-telemetry-green" />
              <span>SNAP: {snapDivision.toUpperCase()}</span>
              <ChevronDown className="size-2.5 text-zinc-500" />
            </button>

            {showSnapDropdown && (
              <div className="absolute top-8 left-0 z-50 flex w-28 flex-col rounded-xs border border-zinc-700 bg-zinc-950 p-1 shadow-2xl backdrop-blur-xl font-mono text-[10px]">
                {(["1/4", "1/8", "1/16", "1/32", "1/64", "none"] as SnapDivision[]).map(
                  (snap) => (
                    <button
                      key={snap}
                      type="button"
                      onClick={() => {
                        setSnapDivision(snap);
                        setShowSnapDropdown(false);
                      }}
                      className={cn(
                        "rounded-xs px-2 py-1 text-left font-semibold uppercase transition-colors",
                        snapDivision === snap
                          ? "bg-zinc-800 text-telemetry-green"
                          : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                      )}
                    >
                      {snap === "none" ? "OFF (NONE)" : snap}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Scale Highlights, Chord Stamps & Quantize Actions */}
        <div className="flex items-center gap-2">
          {/* Scale Highlight Dropdown */}
          <div className="relative hidden md:block">
            <button
              type="button"
              onClick={() => setShowScaleDropdown(!showScaleDropdown)}
              className="flex h-7 items-center gap-1.5 rounded-xs border border-zinc-800 bg-black/40 px-2 font-mono text-[10px] font-bold text-zinc-300 hover:border-zinc-700 transition-colors"
              title="Highlight Scale Degrees on Piano Roll Grid"
            >
              <Music2 className="size-3 text-telemetry-orange" />
              <span>
                SCALE: {ROOT_NOTES[rootPitch]} {scaleHighlight.toUpperCase()}
              </span>
              <ChevronDown className="size-2.5 text-zinc-500" />
            </button>

            {showScaleDropdown && (
              <div className="absolute top-8 right-0 z-50 flex w-48 flex-col rounded-xs border border-zinc-700 bg-zinc-950 p-1.5 shadow-2xl backdrop-blur-xl font-mono text-[10px]">
                {/* Root pitch selector row */}
                <div className="mb-1.5 border-b border-zinc-800 pb-1">
                  <div className="text-[9px] text-zinc-500 uppercase mb-1">
                    ROOT KEY
                  </div>
                  <div className="grid grid-cols-6 gap-0.5">
                    {ROOT_NOTES.map((name, idx) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setRootPitch(idx)}
                        className={cn(
                          "rounded-xs py-0.5 text-center font-bold",
                          rootPitch === idx
                            ? "bg-telemetry-orange text-black"
                            : "bg-zinc-900 text-zinc-400 hover:text-white"
                        )}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Scale mode list */}
                <div className="text-[9px] text-zinc-500 uppercase mb-1">
                  SCALE TYPE
                </div>
                {(["none", "major", "minor", "pentatonic", "blues"] as ScaleType[]).map(
                  (sc) => (
                    <button
                      key={sc}
                      type="button"
                      onClick={() => {
                        setScaleHighlight(sc);
                        setShowScaleDropdown(false);
                      }}
                      className={cn(
                        "rounded-xs px-2 py-1 text-left font-semibold uppercase transition-colors",
                        scaleHighlight === sc
                          ? "bg-zinc-800 text-telemetry-orange"
                          : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                      )}
                    >
                      {sc === "none" ? "CHROMATIC (OFF)" : sc}
                    </button>
                  )
                )}
              </div>
            )}
          </div>

          {/* Chord Stamp Selector */}
          <div className="relative hidden lg:block">
            <button
              type="button"
              onClick={() => setShowChordDropdown(!showChordDropdown)}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-xs border px-2 font-mono text-[10px] font-bold transition-colors",
                chordStamp !== "none"
                  ? "border-telemetry-green/80 bg-zinc-900 text-telemetry-green shadow-[0_0_6px_rgba(0,245,155,0.3)]"
                  : "border-zinc-800 bg-black/40 text-zinc-300 hover:border-zinc-700"
              )}
              title="Stamp Chords (click canvas to place full chord)"
            >
              <Sparkles className="size-3 text-telemetry-green" />
              <span>
                STAMP: {chordStamp === "none" ? "OFF" : chordStamp.toUpperCase()}
              </span>
              <ChevronDown className="size-2.5 text-zinc-500" />
            </button>

            {showChordDropdown && (
              <div className="absolute top-8 right-0 z-50 flex w-36 flex-col rounded-xs border border-zinc-700 bg-zinc-950 p-1 shadow-2xl backdrop-blur-xl font-mono text-[10px]">
                {(
                  [
                    "none",
                    "major",
                    "minor",
                    "minor7",
                    "major7",
                    "dom7",
                    "ninth",
                  ] as ChordStampType[]
                ).map((stamp) => (
                  <button
                    key={stamp}
                    type="button"
                    onClick={() => {
                      setChordStamp(stamp);
                      setShowChordDropdown(false);
                    }}
                    className={cn(
                      "rounded-xs px-2 py-1 text-left font-semibold uppercase transition-colors",
                      chordStamp === stamp
                        ? "bg-zinc-800 text-telemetry-green"
                        : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                    )}
                  >
                    {stamp === "none" ? "OFF (SINGLE NOTE)" : stamp}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quantize Button */}
          <button
            type="button"
            onClick={quantizeSelectedNotes}
            className="flex h-7 items-center gap-1 rounded-xs border border-zinc-800 bg-black/40 px-2 font-mono text-[10px] font-bold text-zinc-300 hover:border-zinc-700 hover:text-telemetry-green transition-colors"
            title="Snap selected notes to nearest grid timing"
          >
            <span>QUANTIZE</span>
          </button>

          {/* Delete Selected Notes */}
          <button
            type="button"
            onClick={deleteSelectedNotes}
            className="flex size-7 items-center justify-center rounded-xs border border-zinc-800 bg-black/40 text-zinc-400 hover:border-zinc-700 hover:text-red-400 transition-colors"
            title="Delete Selected Notes"
          >
            <Trash2 className="size-3.5" />
          </button>

          <div className="h-5 w-px bg-zinc-800" />

          {/* Zoom Buttons */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={handleZoomIn}
              className="flex size-6 items-center justify-center rounded-[2px] border border-zinc-800 bg-black/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 transition-colors"
              title="Zoom In Timeline"
            >
              <ZoomIn className="size-3" />
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              className="flex size-6 items-center justify-center rounded-[2px] border border-zinc-800 bg-black/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 transition-colors"
              title="Zoom Out Timeline"
            >
              <ZoomOut className="size-3" />
            </button>
          </div>
        </div>
      </div>

      {/* ── CENTRAL HIGH-PERFORMANCE PIANO ROLL CANVAS ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <PianoRollCanvas />
      </div>

      {/* ── BOTTOM VELOCITY LANE DOCK ── */}
      <VelocityLane />
    </div>
  );
};
