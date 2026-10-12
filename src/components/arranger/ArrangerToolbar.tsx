"use client";

import React from "react";
import {
  Eraser,
  Magnet,
  MousePointer,
  Pencil,
  Plus,
  Repeat,
  Scissors,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type ArrangerTool,
  type SnapGrid,
  useArrangerStore,
} from "@/stores/arranger-store";
import { useTransportStore } from "@/stores/transport-store";

const TOOLS: { id: ArrangerTool; label: string; icon: React.ElementType }[] = [
  { id: "pointer", label: "Select / Move", icon: MousePointer },
  { id: "pencil", label: "Draw Clip", icon: Pencil },
  { id: "scissors", label: "Slice Clip", icon: Scissors },
  { id: "eraser", label: "Erase Clip", icon: Eraser },
  { id: "mute", label: "Mute Clip", icon: VolumeX },
];

const SNAP_OPTIONS: { id: SnapGrid; label: string }[] = [
  { id: "bar", label: "1 BAR" },
  { id: "1/2", label: "1/2" },
  { id: "1/4", label: "1/4 BEAT" },
  { id: "1/8", label: "1/8" },
  { id: "1/16", label: "1/16 STEP" },
  { id: "off", label: "OFF" },
];

export const ArrangerToolbar: React.FC = () => {
  const activeTool = useArrangerStore((s) => s.activeTool);
  const setActiveTool = useArrangerStore((s) => s.setActiveTool);
  const snapGrid = useArrangerStore((s) => s.snapGrid);
  const setSnapGrid = useArrangerStore((s) => s.setSnapGrid);
  const zoomX = useArrangerStore((s) => s.zoomX);
  const setZoomX = useArrangerStore((s) => s.setZoomX);
  const addTrack = useArrangerStore((s) => s.addTrack);

  const isLooping = useTransportStore((s) => s.isLooping);
  const toggleLoop = useTransportStore((s) => s.toggleLoop);

  const handleZoomIn = () => setZoomX(zoomX + 15);
  const handleZoomOut = () => setZoomX(zoomX - 15);

  return (
    <div className="flex h-10 items-center justify-between border-b border-[#27272A] bg-[#0c0c10] px-3 font-mono select-none shrink-0">
      {/* ── Left: Tool Buttons ── */}
      <div className="flex items-center gap-1">
        <div className="flex rounded-xs border border-zinc-800 bg-[#07070a] p-0.5">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            const isActive = activeTool === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTool(t.id)}
                className={cn(
                  "flex size-7 items-center justify-center rounded-xs transition-colors",
                  isActive
                    ? "bg-zinc-800 text-telemetry-orange shadow-[0_0_8px_rgba(255,68,0,0.35)]"
                    : "text-zinc-500 hover:text-zinc-200"
                )}
                title={`${t.label} Tool (${t.id.toUpperCase()})`}
              >
                <Icon className="size-3.5" />
              </button>
            );
          })}
        </div>

        {/* Snap Grid Selector */}
        <div className="ml-2 flex items-center gap-1 rounded-xs border border-zinc-800 bg-[#07070a] px-2 py-1 text-[10px]">
          <Magnet className="size-3 text-telemetry-green" />
          <span className="text-zinc-500 uppercase mr-1">SNAP:</span>
          <select
            value={snapGrid}
            onChange={(e) => setSnapGrid(e.target.value as SnapGrid)}
            className="bg-transparent font-bold text-zinc-200 outline-none cursor-pointer"
          >
            {SNAP_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id} className="bg-zinc-950 text-zinc-200">
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Right: Zoom, Loop Toggle, Add Track ── */}
      <div className="flex items-center gap-2">
        {/* Cycle / Loop Toggle */}
        <button
          type="button"
          onClick={toggleLoop}
          className={cn(
            "flex items-center gap-1.5 rounded-xs border px-2 py-1 text-[10px] font-bold transition-all",
            isLooping
              ? "border-amber-500/70 bg-amber-950/40 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.3)]"
              : "border-zinc-800 bg-[#07070a] text-zinc-500 hover:text-zinc-300"
          )}
          title="Toggle Timeline Cycle / Loop Mode"
        >
          <Repeat className="size-3" />
          <span>LOOP</span>
        </button>

        {/* Zoom Controls */}
        <div className="flex items-center rounded-xs border border-zinc-800 bg-[#07070a] p-0.5">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoomX <= 30}
            className="flex size-6 items-center justify-center rounded-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
            title="Zoom Out Timeline"
          >
            <ZoomOut className="size-3.5" />
          </button>
          <span className="px-1.5 text-[9px] text-zinc-500 font-mono tabular-nums">
            {zoomX}px
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoomX >= 240}
            className="flex size-6 items-center justify-center rounded-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
            title="Zoom In Timeline"
          >
            <ZoomIn className="size-3.5" />
          </button>
        </div>

        {/* Add Track */}
        <button
          type="button"
          onClick={() => addTrack("New Track", "audio", "#38bdf8")}
          className="flex items-center gap-1 rounded-xs border border-dashed border-zinc-700 bg-zinc-950/60 px-2 py-1 text-[10px] font-bold text-zinc-300 hover:border-telemetry-orange hover:text-telemetry-orange transition-colors"
          title="Add New Track to Arrangement"
        >
          <Plus className="size-3" />
          <span className="hidden sm:inline">ADD TRACK</span>
        </button>
      </div>
    </div>
  );
};
