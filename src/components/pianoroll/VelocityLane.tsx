"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { usePianoRollStore } from "@/stores/pianoroll-store";

export const VelocityLane: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const selectedChannelId = usePianoRollStore((s) => s.selectedChannelId);
  const viewRange = usePianoRollStore((s) => s.viewRange);
  const notes = usePianoRollStore((s) => s.notes);
  const updateNote = usePianoRollStore((s) => s.updateNote);
  const humanizeVelocity = usePianoRollStore((s) => s.humanizeVelocity);
  const setAllVelocity = usePianoRollStore((s) => s.setAllVelocity);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeVelocityTooltip, setActiveVelocityTooltip] = useState<{
    percent: number;
    x: number;
  } | null>(null);

  const isDraggingRef = useRef(false);

  const KEYBOARD_WIDTH = 56;
  const LANE_HEIGHT = 76;

  const totalTicks = Math.max(96, viewRange.endTick - viewRange.startTick);

  // Resize canvas to match container width
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const rect = container.getBoundingClientRect();
      const canvasWidth = Math.max(100, rect.width - KEYBOARD_WIDTH);
      canvas.width = canvasWidth;
      canvas.height = LANE_HEIGHT;
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 60fps velocity stalk render loop
  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas || isCollapsed) {
        animId = requestAnimationFrame(render);
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        animId = requestAnimationFrame(render);
        return;
      }

      const w = canvas.width;
      const h = canvas.height;

      // Dark obsidian background
      ctx.fillStyle = "#0c0c10";
      ctx.fillRect(0, 0, w, h);

      // Top border
      ctx.strokeStyle = "#27272a";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w, 0);
      ctx.stroke();

      // Velocity horizontal guidelines (25%, 50%, 75%, 100%)
      const guidelines = [0.25, 0.5, 0.75, 1.0];
      ctx.strokeStyle = "#18181b";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);

      for (const level of guidelines) {
        const y = h - level * (h - 14) - 4;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Vertical Beat Lines to align with main roll
      const pixelsPerTick = w / totalTicks;
      const firstTick = Math.floor(viewRange.startTick / 96) * 96;

      for (let t = firstTick; t <= viewRange.endTick; t += 96) {
        const x = (t - viewRange.startTick) * pixelsPerTick;
        if (x < 0 || x > w) continue;

        ctx.strokeStyle = t % 384 === 0 ? "#27272a" : "#18181b";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      // Render velocity stalks for notes in view
      const channelNotes = notes.filter((n) => n.channelId === selectedChannelId);

      for (const note of channelNotes) {
        if (
          note.startTick + note.durationTicks < viewRange.startTick ||
          note.startTick > viewRange.endTick
        ) {
          continue;
        }

        const x = (note.startTick - viewRange.startTick) * pixelsPerTick;
        const stalkHeight = note.velocity * (h - 16);
        const yTop = h - stalkHeight - 4;

        const isSelected = note.isSelected;

        // Velocity stalk vertical stem
        ctx.lineWidth = 2;
        ctx.strokeStyle = isSelected
          ? "#ff4400"
          : `rgba(0, 245, 155, ${0.4 + note.velocity * 0.6})`;
        ctx.beginPath();
        ctx.moveTo(x, h);
        ctx.lineTo(x, yTop);
        ctx.stroke();

        // Top knob cap
        ctx.fillStyle = isSelected ? "#ffffff" : "#00f59b";
        ctx.beginPath();
        ctx.arc(x, yTop, 3.5, 0, Math.PI * 2);
        ctx.fill();

        if (isSelected) {
          ctx.strokeStyle = "#ff4400";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [viewRange, notes, selectedChannelId, isCollapsed, totalTicks]);

  // Scrub velocities across stalks
  const handleScrubAt = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      const pixelsPerTick = canvas.width / totalTicks;
      const targetTick = viewRange.startTick + x / pixelsPerTick;

      // Calculate new velocity (0.01 to 1.0)
      const normalizedVel = Math.max(
        0.01,
        Math.min(1.0, (canvas.height - y - 4) / (canvas.height - 16))
      );
      const roundedVel = Number(normalizedVel.toFixed(2));

      // Find note closest to targetTick within a threshold
      const tickThreshold = 24 / pixelsPerTick; // ~24 pixels tolerance
      const channelNotes = notes.filter((n) => n.channelId === selectedChannelId);

      let closestNote = null;
      let minDiff = Infinity;

      for (const note of channelNotes) {
        const diff = Math.abs(note.startTick - targetTick);
        if (diff < minDiff && diff < tickThreshold) {
          minDiff = diff;
          closestNote = note;
        }
      }

      if (closestNote) {
        updateNote(closestNote.id, { velocity: roundedVel });
        setActiveVelocityTooltip({
          percent: Math.round(roundedVel * 100),
          x: Math.max(20, Math.min(canvas.width - 20, x + KEYBOARD_WIDTH)),
        });
      }
    },
    [totalTicks, viewRange.startTick, notes, selectedChannelId, updateNote]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    handleScrubAt(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current) return;
    handleScrubAt(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = false;
    setActiveVelocityTooltip(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture was already released
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col border-t border-[#27272a] bg-[#09090b] select-none shrink-0"
    >
      {/* ── Sub-header / Lane controls ── */}
      <div className="flex h-6 items-center justify-between border-b border-zinc-800 bg-[#0c0c10] px-2 font-mono text-[9px] text-zinc-400">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center gap-1 hover:text-zinc-200 transition-colors uppercase font-bold"
          >
            {isCollapsed ? (
              <ChevronUp className="size-3 text-telemetry-orange" />
            ) : (
              <ChevronDown className="size-3 text-telemetry-orange" />
            )}
            <span>VELOCITY DYNAMICS</span>
          </button>
          <span className="text-zinc-600">{"//"}</span>
          <span className="text-zinc-500 hidden sm:inline">0% - 100% SCALE</span>
        </div>

        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={humanizeVelocity}
              className="flex items-center gap-1 rounded-xs border border-zinc-800 px-1.5 py-0.5 text-zinc-400 hover:border-zinc-700 hover:text-telemetry-green transition-colors"
              title="Add subtle humanized dynamics to notes"
            >
              <Sparkles className="size-2.5 text-telemetry-green" />
              <span>HUMANIZE</span>
            </button>

            <button
              type="button"
              onClick={() => setAllVelocity(1.0)}
              className="rounded-xs border border-zinc-800 px-1.5 py-0.5 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 transition-colors"
              title="Set selected (or all) velocity to 100%"
            >
              100%
            </button>

            <button
              type="button"
              onClick={() => setAllVelocity(0.8)}
              className="rounded-xs border border-zinc-800 px-1.5 py-0.5 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 transition-colors"
              title="Set selected (or all) velocity to standard 80%"
            >
              80%
            </button>
          </div>
        )}
      </div>

      {/* ── Lane Canvas Body ── */}
      {!isCollapsed && (
        <div className="relative flex h-[76px] w-full overflow-hidden">
          {/* Left keyboard gutter spacer */}
          <div
            className="flex flex-col items-center justify-between py-1 border-r border-[#27272a] bg-[#0c0c10] font-mono text-[8px] text-zinc-500 uppercase select-none shrink-0"
            style={{ width: KEYBOARD_WIDTH }}
          >
            <span>100%</span>
            <span>50%</span>
            <span>0%</span>
          </div>

          {/* Stalks Canvas */}
          <div className="relative flex-1 h-full overflow-hidden">
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="block w-full h-full cursor-ns-resize"
            />

            {/* Velocity Tooltip Overlay */}
            {activeVelocityTooltip && (
              <div
                className="pointer-events-none absolute top-1 z-30 rounded-[2px] border border-telemetry-orange bg-zinc-950 px-1.5 py-0.5 font-mono text-[9px] font-bold text-telemetry-orange shadow-[0_0_8px_rgba(255,68,0,0.4)]"
                style={{
                  left: `${activeVelocityTooltip.x}px`,
                  transform: "translateX(-50%)",
                }}
              >
                {activeVelocityTooltip.percent}%
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
