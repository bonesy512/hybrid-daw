"use client";

import React, { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { snapToGrid, useArrangerStore } from "@/stores/arranger-store";
import { useTransportStore } from "@/stores/transport-store";

export interface ArrangerRulerProps {
  totalBars?: number;
  headerWidth?: number;
}

export const ArrangerRuler: React.FC<ArrangerRulerProps> = ({
  totalBars: propTotalBars,
  headerWidth = 240,
}) => {
  const zoomX = useArrangerStore((s) => s.zoomX);
  const snapGrid = useArrangerStore((s) => s.snapGrid);
  const loopStartBar = useArrangerStore((s) => s.loopStartBar);
  const loopEndBar = useArrangerStore((s) => s.loopEndBar);
  const setLoopRange = useArrangerStore((s) => s.setLoopRange);
  const storeTotalBars = useArrangerStore((s) => s.totalBars);

  const totalBars = propTotalBars || storeTotalBars;

  const position = useTransportStore((s) => s.position);
  const setPosition = useTransportStore((s) => s.setPosition);
  const isLooping = useTransportStore((s) => s.isLooping);

  const rulerRef = useRef<HTMLDivElement>(null);

  // Playhead coordinate: 1-indexed bar float
  const playheadBar =
    position.bars + (position.beats - 1) / 4 + position.ticks / (4 * 240);
  const playheadPx = (playheadBar - 1) * zoomX;

  // Convert pointer event clientX to bar float and update transport position
  const seekToClientX = useCallback(
    (clientX: number, isDragging = false) => {
      if (!rulerRef.current) return;
      const rect = rulerRef.current.getBoundingClientRect();
      const clickPx = clientX - rect.left;
      const rawBar = Math.max(1, clickPx / zoomX + 1);
      const snapped = isDragging ? snapToGrid(rawBar, snapGrid) : snapToGrid(rawBar, snapGrid);

      const wholeBar = Math.floor(snapped);
      const frac = snapped - wholeBar;
      const beat = Math.min(4, Math.floor(frac * 4) + 1);
      const tick = Math.round(((frac * 4) % 1) * 240);

      setPosition({ bars: wholeBar, beats: beat, ticks: tick });
    },
    [zoomX, snapGrid, setPosition]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    seekToClientX(e.clientX);

    const onPointerMove = (ev: PointerEvent) => {
      seekToClientX(ev.clientX, true);
    };

    const onPointerUp = (ev: PointerEvent) => {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId);
      } catch {
        // pointer lost
      }
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  // Loop range pixels
  const loopLeftPx = (loopStartBar - 1) * zoomX;
  const loopWidthPx = (loopEndBar - loopStartBar) * zoomX;

  return (
    <div className="relative flex h-8 w-full border-b border-[#27272A] bg-[#0c0c12] font-mono select-none shrink-0">
      {/* ── Left Fixed Header Spacer ── */}
      <div
        style={{ width: `${headerWidth}px` }}
        className="flex items-center justify-between border-r border-[#27272A] bg-[#09090d] px-3 shrink-0"
      >
        <span className="text-[9px] font-bold tracking-wider text-zinc-500 uppercase">
          BARS // BEATS
        </span>
        <span className="text-[9px] text-zinc-600 font-mono">
          4/4 · {zoomX}px/bar
        </span>
      </div>

      {/* ── Scrollable Ruler Surface ── */}
      <div
        ref={rulerRef}
        onPointerDown={handlePointerDown}
        style={{ width: `${totalBars * zoomX}px` }}
        className="relative h-full cursor-pointer bg-gradient-to-b from-[#111118] to-[#0a0a0f] overflow-hidden"
      >
        {/* ── Cycle / Loop Range Band ── */}
        {isLooping && (
          <div
            style={{
              left: `${loopLeftPx}px`,
              width: `${loopWidthPx}px`,
            }}
            className="pointer-events-none absolute top-0 bottom-0 border-x-2 border-amber-400/80 bg-amber-400/15"
          >
            <div className="flex h-3 items-center px-1 font-mono text-[8px] font-bold text-amber-300">
              LOOP [{loopStartBar} - {loopEndBar}]
            </div>
          </div>
        )}

        {/* ── Bar Markers and Grid Ticks ── */}
        {Array.from({ length: totalBars }).map((_, barIdx) => {
          const barNum = barIdx + 1;
          const barX = barIdx * zoomX;

          return (
            <div
              key={barNum}
              style={{ left: `${barX}px`, width: `${zoomX}px` }}
              className="absolute top-0 bottom-0 border-l border-zinc-700/80 pointer-events-none"
            >
              {/* Bar Number Label */}
              <span className="absolute top-0.5 left-1 font-mono text-[10px] font-bold text-zinc-400">
                {barNum}
              </span>

              {/* Sub-beat ticks (beats 2, 3, 4) */}
              <div className="absolute right-0 bottom-0 left-0 flex h-2 justify-between px-[1px]">
                <div className="h-1.5 w-[1px] bg-zinc-800" />
                <div className="h-1.5 w-[1px] bg-zinc-800" />
                <div className="h-1.5 w-[1px] bg-zinc-800" />
              </div>
            </div>
          );
        })}

        {/* ── Playhead Needle Cursor on Ruler ── */}
        <div
          style={{ transform: `translateX(${playheadPx}px)` }}
          className="pointer-events-none absolute top-0 bottom-0 z-30 w-0 -translate-x-1/2 transition-transform duration-75"
        >
          {/* Triangular Playhead Arrow */}
          <div className="absolute -top-0 -left-1.5 size-0 border-t-[7px] border-r-[6px] border-l-[6px] border-t-telemetry-orange border-r-transparent border-l-transparent drop-shadow-[0_0_6px_rgba(255,68,0,0.8)]" />
          {/* Vertical Playhead Rule */}
          <div className="h-full w-[2px] bg-telemetry-orange shadow-[0_0_8px_rgba(255,68,0,0.9)]" />
        </div>
      </div>
    </div>
  );
};
