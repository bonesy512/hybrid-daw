"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useTransportStore } from "@/stores/transport-store";

interface BpmLedDisplayProps {
  className?: string;
}

/**
 * 7-Segment / Technical Digital LED Display for BPM.
 * - Double-click to type exact tempo.
 * - Vertical pointer drag to scrub tempo (Shift for 0.1 fine precision).
 * - Faint ghost segment background for authentic rackmount hardware look.
 */
export function BpmLedDisplay({ className }: BpmLedDisplayProps) {
  const bpm = useTransportStore((state) => state.bpm);
  const setBpm = useTransportStore((state) => state.setBpm);

  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(bpm.toFixed(1));
  const [isDragging, setIsDragging] = useState(false);

  const dragStartRef = useRef<{ y: number; initialBpm: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = () => {
    setInputValue(bpm.toFixed(1));
    setIsEditing(true);
  };

  // Focus and select input on double-click edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const commitValue = useCallback(() => {
    const parsed = parseFloat(inputValue);
    if (!Number.isNaN(parsed)) {
      setBpm(parsed);
    }
    setIsEditing(false);
  }, [inputValue, setBpm]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      commitValue();
    } else if (e.key === "Escape") {
      setInputValue(bpm.toFixed(1));
      setIsEditing(false);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isEditing || e.button !== 0) return;

    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStartRef.current = { y: e.clientY, initialBpm: bpm };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;

    const deltaY = dragStartRef.current.y - e.clientY;
    // Shift key enables fine precision mode (0.1 BPM increments)
    const step = e.shiftKey ? 0.1 : 0.5;
    const deltaBpm = Math.round(deltaY / 2) * step;
    const nextBpm = dragStartRef.current.initialBpm + deltaBpm;

    setBpm(nextBpm);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartRef.current) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture was already lost
      }
      dragStartRef.current = null;
      setIsDragging(false);
    }
  };

  const formattedBpm = bpm.toFixed(1).padStart(5, " ");

  return (
    <div
      className={cn(
        "group relative flex flex-col items-center justify-center rounded-sm border border-zinc-800 bg-[#050507] px-3 py-1 shadow-[inset_0_2px_4px_rgba(0,0,0,0.85)] select-none",
        isDragging && "border-telemetry-orange/70 shadow-[0_0_12px_rgba(255,68,0,0.2)]",
        className
      )}
      onDoubleClick={startEditing}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      title="BPM: Double-click to edit, drag up/down to scrub (Shift for fine adjust)"
      style={{ cursor: isEditing ? "text" : "ns-resize" }}
    >
      {/* Module Header / Technical Label */}
      <div className="flex w-full items-center justify-between font-mono text-[9px] tracking-wider text-zinc-500 uppercase">
        <span>TEMPO</span>
        <span className="text-[8px] text-zinc-600">BPM</span>
      </div>

      {/* Screen Frame */}
      <div className="relative flex h-8 w-24 items-center justify-center overflow-hidden font-mono text-xl font-bold tracking-widest tabular-nums">
        {/* Ghost background segments for hardware authenticity */}
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-end font-mono text-xl font-bold tracking-widest text-zinc-900/80 select-none"
        >
          888.8
        </span>

        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={commitValue}
            onKeyDown={handleKeyDown}
            className="z-10 h-full w-full bg-transparent text-right font-mono text-xl font-bold tracking-widest text-telemetry-orange outline-none drop-shadow-[0_0_8px_rgba(255,68,0,0.8)]"
          />
        ) : (
          <span className="z-10 flex w-full items-center justify-end text-telemetry-orange drop-shadow-[0_0_8px_rgba(255,68,0,0.6)]">
            {formattedBpm}
          </span>
        )}

        {/* Scanline / Glass glare overlay */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.04] via-transparent to-black/30" />
      </div>

      {/* Mini drag indicator line */}
      <div className="mt-0.5 flex h-0.5 w-full items-center justify-center space-x-1">
        <div
          className={cn(
            "h-full w-4 rounded-full transition-colors",
            isDragging ? "bg-telemetry-orange" : "bg-zinc-800 group-hover:bg-zinc-700"
          )}
        />
      </div>
    </div>
  );
}

interface PositionLedDisplayProps {
  className?: string;
}

/**
 * Technical 7-segment LED Display for Song Position (Bars . Beats . Ticks).
 */
export function PositionLedDisplay({ className }: PositionLedDisplayProps) {
  const position = useTransportStore((state) => state.position);

  const formattedBars = String(position.bars).padStart(3, "0");
  const formattedBeats = String(position.beats).padStart(2, "0");
  const formattedTicks = String(position.ticks).padStart(3, "0");

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center rounded-sm border border-zinc-800 bg-[#050507] px-3 py-1 shadow-[inset_0_2px_4px_rgba(0,0,0,0.85)] select-none",
        className
      )}
      title="Song Position (Bars : Beats : Ticks)"
    >
      {/* Module Header */}
      <div className="flex w-full items-center justify-between font-mono text-[9px] tracking-wider text-zinc-500 uppercase">
        <span>POSITION</span>
        <span className="text-[8px] text-zinc-600">BAR.BEAT.TICK</span>
      </div>

      {/* Screen Frame */}
      <div className="relative flex h-8 items-center justify-center space-x-1.5 overflow-hidden font-mono text-xl font-bold tracking-widest tabular-nums">
        {/* Ghost background segments */}
        <div
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center space-x-1.5 font-mono text-xl font-bold tracking-widest text-zinc-900/80 select-none"
        >
          <span>888</span>
          <span className="text-zinc-900/50">:</span>
          <span>88</span>
          <span className="text-zinc-900/50">:</span>
          <span>888</span>
        </div>

        {/* Active glowing readout in Phosphor Green */}
        <div className="z-10 flex items-center justify-center space-x-1.5 text-telemetry-green drop-shadow-[0_0_8px_rgba(0,245,155,0.6)]">
          <span>{formattedBars}</span>
          <span className="animate-pulse text-telemetry-green/70">:</span>
          <span>{formattedBeats}</span>
          <span className="text-telemetry-green/70">:</span>
          <span className="text-base text-telemetry-green/90">{formattedTicks}</span>
        </div>

        {/* Scanline / Glass glare overlay */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.04] via-transparent to-black/30" />
      </div>

      {/* Grid status footer */}
      <div className="mt-0.5 flex h-0.5 w-full items-center justify-center space-x-1">
        <div className="h-full w-8 rounded-full bg-zinc-800" />
      </div>
    </div>
  );
}

export function LedDisplay() {
  return (
    <div className="flex items-center gap-2">
      <BpmLedDisplay />
      <PositionLedDisplay />
    </div>
  );
}
