"use client";

import React, { useCallback, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FolderGit2,
  Layers,
  Scissors,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type CompSlice,
  type SnapGrid,
  type TimelineClip,
  snapToGrid,
  useArrangerStore,
} from "@/stores/arranger-store";

export interface TakeFolderViewProps {
  clip: TimelineClip;
  zoomX: number;
  snapGrid: SnapGrid;
  trackColor?: string;
  onPointerDown?: (
    e: React.PointerEvent<HTMLDivElement>,
    handle: "body" | "left" | "right"
  ) => void;
}

const TAKE_COLOR_PALETTE = [
  { bg: "#06b6d4", border: "#22d3ee", glow: "rgba(6,182,212,0.35)", name: "cyan" },
  { bg: "#00f59b", border: "#34d399", glow: "rgba(0,245,155,0.35)", name: "green" },
  { bg: "#fbbf24", border: "#fde047", glow: "rgba(251,191,36,0.35)", name: "amber" },
  { bg: "#a855f7", border: "#c084fc", glow: "rgba(168,85,247,0.35)", name: "purple" },
  { bg: "#f43f5e", border: "#fb7185", glow: "rgba(244,63,94,0.35)", name: "rose" },
];

const getTakeColor = (index: number) => {
  return TAKE_COLOR_PALETTE[index % TAKE_COLOR_PALETTE.length];
};

export const TakeFolderView: React.FC<TakeFolderViewProps> = ({
  clip,
  zoomX,
  snapGrid,
  onPointerDown,
}) => {
  const toggleTakeFolderExpanded = useArrangerStore(
    (s) => s.toggleTakeFolderExpanded
  );
  const setCompSlice = useArrangerStore((s) => s.setCompSlice);
  const flattenAndMergeComp = useArrangerStore((s) => s.flattenAndMergeComp);
  const setCompPreset = useArrangerStore((s) => s.setCompPreset);

  const takeFolder = clip.takeFolder;
  const isExpanded = Boolean(takeFolder?.isExpanded);
  const takes = takeFolder?.takes || [];
  const activeComp = takeFolder?.activeComp || [];
  const selectedCompName = takeFolder?.selectedCompName || "Comp A";

  const clipLeft = (clip.startBar - 1) * zoomX;
  const clipWidth = clip.durationBars * zoomX;

  // Quick-Swipe interaction state
  const [swipingTakeId, setSwipingTakeId] = useState<string | null>(null);
  const [swipeStartBar, setSwipeStartBar] = useState<number | null>(null);
  const [swipeCurrentBar, setSwipeCurrentBar] = useState<number | null>(null);

  const clipContainerRef = useRef<HTMLDivElement>(null);
  const swipeTakeRef = useRef<string | null>(null);
  const swipeStartRef = useRef<number | null>(null);

  // Compute bar coordinate from mouse clientX relative to clip start
  const getBarFromClientX = useCallback(
    (clientX: number): number => {
      if (!clipContainerRef.current) return clip.startBar;
      const rect = clipContainerRef.current.getBoundingClientRect();
      const offsetX = clientX - rect.left;
      const fraction = offsetX / rect.width;
      const rawBar = clip.startBar + fraction * clip.durationBars;
      return snapToGrid(rawBar, snapGrid);
    },
    [clip.startBar, clip.durationBars, snapGrid]
  );

  // Initiate quick-swipe on a specific take sub-lane
  const handleTakePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    takeId: string
  ) => {
    e.stopPropagation();
    const startBar = getBarFromClientX(e.clientX);
    swipeTakeRef.current = takeId;
    swipeStartRef.current = startBar;
    setSwipingTakeId(takeId);
    setSwipeStartBar(startBar);
    setSwipeCurrentBar(startBar);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const currentBar = getBarFromClientX(moveEvent.clientX);
      setSwipeCurrentBar(currentBar);
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);

      const endBar = getBarFromClientX(upEvent.clientX);
      const start = swipeStartRef.current ?? startBar;
      const minBar = Math.min(start, endBar);
      const rawDur = Math.abs(endBar - start);
      const minDur = snapGrid === "off" ? 0.0625 : 0.125;
      const finalDur = Math.max(minDur, rawDur);

      setCompSlice(clip.id, takeId, minBar, finalDur);

      swipeTakeRef.current = null;
      swipeStartRef.current = null;
      setSwipingTakeId(null);
      setSwipeStartBar(null);
      setSwipeCurrentBar(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  // Helper to calculate pixel position for a slice within the clip
  const getSliceGeometry = (slice: CompSlice) => {
    const startOffsetBars = Math.max(0, slice.startBar - clip.startBar);
    const leftPx = startOffsetBars * zoomX;
    const widthPx = slice.durationBars * zoomX;
    return { leftPx, widthPx };
  };

  // ── Render Folded Compact View ──
  if (!isExpanded) {
    return (
      <div
        ref={clipContainerRef}
        onPointerDown={(e) => onPointerDown?.(e, "body")}
        className={cn(
          "group/clip absolute top-1 bottom-1 flex flex-col rounded-[2px] border select-none overflow-hidden shadow-lg transition-all",
          clip.isSelected
            ? "border-white ring-2 ring-white/50 z-20"
            : "border-cyan-600/60 hover:border-cyan-400 z-10",
          clip.isMuted && "opacity-40 grayscale"
        )}
        style={{
          left: `${clipLeft}px`,
          width: `${clipWidth}px`,
          backgroundColor: "#09090d",
        }}
      >
        {/* Compact Header Bar */}
        <div className="flex h-5 items-center justify-between border-b border-cyan-800/40 bg-zinc-950/90 px-1.5 text-[8px] font-bold">
          <div className="flex items-center gap-1.5 truncate">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleTakeFolderExpanded(clip.id);
              }}
              className="flex size-3.5 items-center justify-center rounded-[2px] bg-cyan-950/80 text-cyan-300 hover:bg-cyan-800/60 hover:text-white"
              title="Expand Take Folder (Quick-Swipe Comping)"
            >
              <ChevronRight className="size-2.5" />
            </button>
            <FolderGit2 className="size-3 text-cyan-400 shrink-0" />
            <span className="truncate text-zinc-200">{clip.name}</span>
            <span className="rounded-[2px] border border-cyan-500/50 bg-cyan-950/60 px-1 font-mono text-[7px] text-cyan-300">
              {takes.length} TAKES
            </span>
          </div>

          <div className="flex items-center gap-1">
            <span className="font-mono text-[7px] font-bold text-cyan-400 uppercase">
              {selectedCompName}
            </span>
            <span className="rounded-[2px] bg-zinc-800 px-1 font-mono text-[6px] text-zinc-400 uppercase">
              FOLDED
            </span>
          </div>
        </div>

        {/* Compact Master Comp Composite Waveform Preview */}
        <div className="relative flex flex-1 items-center overflow-hidden px-1 bg-black/40">
          {/* Active Slice Segment Backgrounds & Divider Notches */}
          {activeComp.map((slice, sIdx) => {
            const takeIdx = takes.findIndex((t) => t.id === slice.takeId);
            const color = getTakeColor(takeIdx >= 0 ? takeIdx : 0);
            const { leftPx, widthPx } = getSliceGeometry(slice);

            return (
              <div
                key={slice.id || sIdx}
                style={{
                  left: `${leftPx}px`,
                  width: `${widthPx}px`,
                  borderColor: color.border,
                }}
                className="absolute top-0 bottom-0 border-r border-zinc-700/80 bg-cyan-950/20"
              >
                {/* Take Identity Badge */}
                <span
                  style={{ color: color.border }}
                  className="absolute top-0.5 left-1 font-mono text-[6px] font-black uppercase opacity-80"
                >
                  T{takeIdx + 1}
                </span>

                {/* Micro Crossfade Indicator Marker at slice seam */}
                <div
                  style={{ backgroundColor: color.border }}
                  className="absolute top-0 right-0 h-full w-[2px] opacity-75 shadow-[0_0_4px_currentColor]"
                />
              </div>
            );
          })}

          {/* Master Stitched Waveform Bars */}
          <div className="relative z-10 flex h-full w-full items-center justify-between gap-[1px] py-1">
            {(clip.waveformPeaks && clip.waveformPeaks.length > 0
              ? clip.waveformPeaks
              : [0.3, 0.6, 0.8, 0.4, 0.7, 0.9, 0.5, 0.8, 0.6, 0.4]
            ).map((peak, pIdx) => (
              <div
                key={pIdx}
                className="flex-1 min-w-[1px] max-w-[4px] rounded-xs transition-all"
                style={{
                  height: `${Math.max(12, Math.round(peak * 90))}%`,
                  backgroundColor: "#06b6d4",
                  opacity: 0.9,
                }}
              />
            ))}
          </div>
        </div>

        {/* Edge Trim Handles */}
        <div
          onPointerDown={(e) => onPointerDown?.(e, "left")}
          className="absolute top-0 bottom-0 left-0 w-2 cursor-ew-resize hover:bg-white/40 z-30"
          title="Drag to trim clip start"
        />
        <div
          onPointerDown={(e) => onPointerDown?.(e, "right")}
          className="absolute top-0 bottom-0 right-0 w-2 cursor-ew-resize hover:bg-white/40 z-30"
          title="Drag to trim clip end"
        />
      </div>
    );
  }

  // ── Render Expanded Logic Pro-Style Quick-Swipe Comping View ──
  return (
    <div
      ref={clipContainerRef}
      onPointerDown={(e) => onPointerDown?.(e, "body")}
      className={cn(
        "group/clip absolute top-1 bottom-1 flex flex-col rounded-[2px] border select-none overflow-hidden shadow-2xl transition-all z-20",
        clip.isSelected
          ? "border-cyan-400 ring-2 ring-cyan-400/40"
          : "border-cyan-600/80 hover:border-cyan-400"
      )}
      style={{
        left: `${clipLeft}px`,
        width: `${clipWidth}px`,
        backgroundColor: "#0b0b10",
      }}
    >
      {/* ── Take Folder Master Header Bar ── */}
      <div className="flex h-7 shrink-0 items-center justify-between border-b border-[#27272A] bg-[#09090f] px-2 text-[9px] font-bold">
        {/* Left: Fold Chevron & Folder Name */}
        <div className="flex items-center gap-2 truncate">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleTakeFolderExpanded(clip.id);
            }}
            className="flex size-4 items-center justify-center rounded-[2px] bg-cyan-950/80 text-cyan-300 hover:bg-cyan-800/80 hover:text-white"
            title="Fold Take Folder"
          >
            <ChevronDown className="size-3" />
          </button>
          <FolderGit2 className="size-3.5 text-cyan-400 shrink-0" />
          <span className="truncate text-zinc-100 font-semibold">{clip.name}</span>
          <span className="rounded-[2px] border border-cyan-500/40 bg-cyan-950/80 px-1 py-0.2 font-mono text-[7px] text-cyan-300">
            {takes.length} TAKES
          </span>
        </div>

        {/* Center/Right: Comp Presets & Flatten Action */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Comp Preset Switcher */}
          <div className="flex items-center rounded-[2px] border border-zinc-800 bg-[#060608] p-0.5">
            {["Comp A", "Comp B"].map((compName) => (
              <button
                key={compName}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCompPreset(clip.id, compName);
                }}
                className={cn(
                  "rounded-[2px] px-1.5 py-0.5 font-mono text-[7px] font-bold uppercase transition-all",
                  selectedCompName === compName
                    ? "bg-cyan-950 text-cyan-300 shadow-[0_0_4px_rgba(6,182,212,0.4)] border border-cyan-500/50"
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                {compName}
              </button>
            ))}
          </div>

          {/* Flatten & Merge Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              flattenAndMergeComp(clip.id);
            }}
            className="flex items-center gap-1 rounded-[2px] border border-amber-500/60 bg-amber-950/60 px-2 py-0.5 font-mono text-[7px] font-bold text-amber-300 uppercase hover:bg-amber-900/70 hover:text-white transition-all shadow-[0_0_6px_rgba(245,158,11,0.25)]"
            title="Commit and flatten active comp slices into a single unified audio clip"
          >
            <Scissors className="size-2.5" />
            FLATTEN & MERGE
          </button>
        </div>
      </div>

      {/* ── Top Lane: Master Composite Preview (The Sounding Track) ── */}
      <div className="relative flex h-8 shrink-0 items-center border-b border-[#27272A] bg-[#0e0e16] px-1.5 overflow-hidden">
        {/* Lane Label */}
        <div className="absolute top-0.5 left-1 z-20 flex items-center gap-1 font-mono text-[7px] font-black uppercase tracking-wider text-cyan-400/90 drop-shadow">
          <Layers className="size-2.5" />
          <span>COMPOSITE RESULT ({selectedCompName})</span>
        </div>

        {/* Slice Color Bands & Crossfade Boundary Indicators */}
        {activeComp.map((slice, sIdx) => {
          const takeIdx = takes.findIndex((t) => t.id === slice.takeId);
          const color = getTakeColor(takeIdx >= 0 ? takeIdx : 0);
          const { leftPx, widthPx } = getSliceGeometry(slice);

          return (
            <div
              key={slice.id || sIdx}
              style={{
                left: `${leftPx}px`,
                width: `${widthPx}px`,
                borderColor: color.border,
              }}
              className="absolute top-0 bottom-0 border-r border-white/60 bg-cyan-950/15"
            >
              {/* Slice Label */}
              <span
                style={{ color: color.border }}
                className="absolute bottom-0.5 right-1 font-mono text-[7px] font-black uppercase opacity-75"
              >
                T{takeIdx + 1}
              </span>

              {/* Diagonal Micro Crossfade Seam Marker */}
              <div
                style={{ backgroundColor: color.border }}
                className="absolute top-0 right-0 h-full w-[2px] opacity-80 shadow-[0_0_6px_currentColor]"
              />
            </div>
          );
        })}

        {/* Master Stitched Composite Waveform */}
        <div className="relative z-10 flex h-full w-full items-center justify-between gap-[1px] py-1">
          {(clip.waveformPeaks && clip.waveformPeaks.length > 0
            ? clip.waveformPeaks
            : [0.4, 0.7, 0.9, 0.5, 0.8, 0.6, 0.3, 0.8, 0.9, 0.4]
          ).map((peak, pIdx) => (
            <div
              key={pIdx}
              className="flex-1 min-w-[1px] max-w-[4px] rounded-xs transition-all"
              style={{
                height: `${Math.max(14, Math.round(peak * 85))}%`,
                backgroundColor: "#06b6d4",
                opacity: 0.95,
              }}
            />
          ))}
        </div>
      </div>

      {/* ── Sub-Lanes: Individual Takes Stacked Vertically ── */}
      <div className="flex flex-1 flex-col divide-y divide-[#27272A]/70 overflow-hidden bg-[#07070b]">
        {takes.map((take, tIdx) => {
          const takeColor = getTakeColor(tIdx);
          const activeSlicesOnThisTake = activeComp.filter(
            (s) => s.takeId === take.id
          );
          const isCurrentlySwiping = swipingTakeId === take.id;

          // Compute temporary live swipe highlight geometry
          let liveSwipeGeometry: { leftPx: number; widthPx: number } | null = null;
          if (
            isCurrentlySwiping &&
            swipeStartBar !== null &&
            swipeCurrentBar !== null
          ) {
            const minB = Math.min(swipeStartBar, swipeCurrentBar);
            const maxB = Math.max(swipeStartBar, swipeCurrentBar);
            const startOffset = Math.max(0, minB - clip.startBar);
            const leftPx = startOffset * zoomX;
            const widthPx = Math.max(4, (maxB - minB) * zoomX);
            liveSwipeGeometry = { leftPx, widthPx };
          }

          return (
            <div
              key={take.id}
              onPointerDown={(e) => handleTakePointerDown(e, take.id)}
              className="group/lane relative flex h-9 shrink-0 items-center cursor-crosshair transition-colors hover:bg-white/[0.02]"
              title={`Quick-Swipe across ${take.name} to highlight and comp this phrase`}
            >
              {/* Left Take Tag Overlay */}
              <div
                style={{
                  backgroundColor: `${takeColor.bg}22`,
                  borderColor: `${takeColor.border}66`,
                }}
                className="absolute top-1 left-1.5 z-20 flex items-center gap-1.5 rounded-[2px] border px-1.5 py-0.5 backdrop-blur-xs select-none"
              >
                <div
                  style={{ backgroundColor: takeColor.bg }}
                  className="size-1.5 rounded-full shadow-[0_0_6px_currentColor]"
                />
                <span
                  style={{ color: takeColor.border }}
                  className="font-mono text-[7px] font-black uppercase tracking-wider"
                >
                  {take.name}
                </span>
                {activeSlicesOnThisTake.length > 0 && (
                  <span className="font-mono text-[6px] text-zinc-400">
                    ({activeSlicesOnThisTake.length} SEL)
                  </span>
                )}
              </div>

              {/* Active Comp Highlight Beams for this Take */}
              {activeSlicesOnThisTake.map((slice, sIdx) => {
                const { leftPx, widthPx } = getSliceGeometry(slice);
                return (
                  <div
                    key={slice.id || sIdx}
                    style={{
                      left: `${leftPx}px`,
                      width: `${widthPx}px`,
                      backgroundColor: `${takeColor.bg}30`,
                      borderColor: takeColor.border,
                      boxShadow: `0 0 10px ${takeColor.glow}`,
                    }}
                    className="absolute top-0 bottom-0 z-10 border-x-2 border-dashed"
                  >
                    {/* Subtle Diagonal Crossfade Marker */}
                    <div
                      style={{ backgroundColor: takeColor.border }}
                      className="absolute top-0 right-0 h-full w-[2px] opacity-80"
                    />
                  </div>
                );
              })}

              {/* Active Real-Time Swipe Beam Feedback */}
              {liveSwipeGeometry && (
                <div
                  style={{
                    left: `${liveSwipeGeometry.leftPx}px`,
                    width: `${liveSwipeGeometry.widthPx}px`,
                  }}
                  className="absolute top-0 bottom-0 z-30 border-2 border-cyan-300 bg-cyan-400/40 shadow-[0_0_12px_rgba(6,182,212,0.6)] animate-pulse"
                />
              )}

              {/* Waveform Peaks for This Take */}
              <div className="relative z-0 flex h-full w-full items-center justify-between gap-[1px] px-2 py-1">
                {(take.waveformPeaks && take.waveformPeaks.length > 0
                  ? take.waveformPeaks
                  : [0.3, 0.5, 0.7, 0.4, 0.6, 0.8, 0.5, 0.4, 0.6, 0.3]
                ).map((peak, pIdx) => {
                  // Check if this point falls inside any active slice for this take
                  const fraction = pIdx / (take.waveformPeaks.length || 64);
                  const barAtPoint = clip.startBar + fraction * clip.durationBars;
                  const isPointActive = activeSlicesOnThisTake.some(
                    (s) =>
                      barAtPoint >= s.startBar &&
                      barAtPoint < s.startBar + s.durationBars
                  );

                  return (
                    <div
                      key={pIdx}
                      className={cn(
                        "flex-1 min-w-[1px] max-w-[4px] rounded-xs transition-all",
                        isPointActive ? "opacity-100" : "opacity-30"
                      )}
                      style={{
                        height: `${Math.max(12, Math.round(peak * 80))}%`,
                        backgroundColor: isPointActive ? takeColor.border : "#52525b",
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Edge Trim Handles */}
      <div
        onPointerDown={(e) => onPointerDown?.(e, "left")}
        className="absolute top-0 bottom-0 left-0 w-2 cursor-ew-resize hover:bg-white/40 z-40"
        title="Drag to trim clip start"
      />
      <div
        onPointerDown={(e) => onPointerDown?.(e, "right")}
        className="absolute top-0 bottom-0 right-0 w-2 cursor-ew-resize hover:bg-white/40 z-40"
        title="Drag to trim clip end"
      />
    </div>
  );
};
