"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface CanvasVuMeterProps {
  isPlaying: boolean;
  isMuted?: boolean;
  volumeDb?: number; // -60 to +6
  pan?: number; // -1 to 1
  height?: number;
  width?: number;
  className?: string;
}

/**
 * Dedicated HTML5 Canvas Dual-Channel (L/R) Segmented Peak VU Meter.
 * Adheres strictly to HybridDAW Protocol:
 * "Never route audio playhead positions or fast VU meters through continuous
 * React re-renders; use dedicated HTML5 Canvas elements or requestAnimationFrame."
 *
 * Brutalist Color Grading:
 * - Phosphor green (-inf to -12 dB)
 * - Amber (-12 to -3 dB)
 * - Safety Orange / Clip Red (-3 to 0+ dB)
 */
export function CanvasVuMeter({
  isPlaying,
  isMuted = false,
  volumeDb = 0.0,
  pan = 0.0,
  height = 160,
  width = 18,
  className,
}: CanvasVuMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peakHoldText, setPeakHoldText] = useState("-inf");

  // Keep live references for animation loop without triggering re-renders
  const stateRef = useRef({
    isPlaying,
    isMuted,
    volumeDb,
    pan,
  });

  useEffect(() => {
    stateRef.current = { isPlaying, isMuted, volumeDb, pan };
  }, [isPlaying, isMuted, volumeDb, pan]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let curL = 0;
    let curR = 0;
    let peakHoldL = 0;
    let peakHoldR = 0;
    let peakTimer = 0;
    let lastTextUpdate = 0;

    const render = (time: number) => {
      const { isPlaying: playing, isMuted: muted, volumeDb: vol, pan: p } = stateRef.current;

      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      // Recessed dark well background
      ctx.fillStyle = "#050508";
      ctx.fillRect(0, 0, w, h);

      // Target level calculation
      let targetL = 0;
      let targetR = 0;

      if (playing && !muted && vol > -55) {
        // Map dB (-60 to +6) to 0.0 - 1.0 linear amplitude ratio
        const volNorm = Math.pow(10, vol / 20);
        // Base bounce + randomized musical variations
        const jitter = Math.sin(time * 0.02) * 0.15 + (Math.random() - 0.5) * 0.25;
        const baseLevel = Math.max(0.05, Math.min(1.15, volNorm * 0.65 + jitter));

        // Pan weighting (-1 to 1)
        const panL = p > 0 ? 1 - p : 1.0;
        const panR = p < 0 ? 1 + p : 1.0;

        targetL = Math.max(0, Math.min(1.2, baseLevel * panL));
        targetR = Math.max(0, Math.min(1.2, baseLevel * panR));
      }

      // Ballistics (instant attack, logarithmic exponential decay)
      if (targetL > curL) curL += (targetL - curL) * 0.45;
      else curL *= 0.92;

      if (targetR > curR) curR += (targetR - curR) * 0.45;
      else curR *= 0.92;

      // Peak hold calculation
      if (curL > peakHoldL) {
        peakHoldL = curL;
        peakTimer = time;
      }
      if (curR > peakHoldR) {
        peakHoldR = curR;
        peakTimer = time;
      }

      // Decay peak hold after 1.2 seconds
      if (time - peakTimer > 1200) {
        peakHoldL *= 0.95;
        peakHoldR *= 0.95;
      }

      // Update peak readout text at ~4Hz (250ms) to avoid DOM churn
      if (time - lastTextUpdate > 250) {
        lastTextUpdate = time;
        const maxPeak = Math.max(peakHoldL, peakHoldR);
        if (maxPeak <= 0.02) {
          setPeakHoldText("-inf");
        } else {
          // Convert linear ratio back to dB
          const peakDb = 20 * Math.log10(maxPeak / 0.7);
          if (peakDb >= 0.1) {
            setPeakHoldText(`+${peakDb.toFixed(1)}`);
          } else {
            setPeakHoldText(peakDb.toFixed(1));
          }
        }
      }

      const channelW = Math.floor((w - 2) / 2);
      const gutter = 2;

      drawMeterChannel(ctx, 0, 0, channelW, h, curL, peakHoldL);
      drawMeterChannel(ctx, channelW + gutter, 0, channelW, h, curR, peakHoldR);

      animId = requestAnimationFrame(render);
    };

    function drawMeterChannel(
      c: CanvasRenderingContext2D,
      x: number,
      y: number,
      cw: number,
      ch: number,
      level: number,
      peakHold: number
    ) {
      const segmentCount = 36;
      const segH = Math.floor(ch / segmentCount);
      const gap = 1;

      for (let i = 0; i < segmentCount; i++) {
        // Bottom to top: segment index 0 is at bottom, segmentCount-1 is at top
        const segY = ch - (i + 1) * segH;
        const ratio = i / segmentCount;
        const isLit = ratio <= level;
        const isPeak = Math.abs(ratio - peakHold) < 1 / segmentCount && peakHold > 0.05;

        if (isLit || isPeak) {
          // Brutalist Color Grading
          if (ratio > 0.88) {
            c.fillStyle = "#ef4444"; // Clip Red (0 to +6 dB)
          } else if (ratio > 0.72) {
            c.fillStyle = "#ff4400"; // Safety Orange (-3 to 0 dB)
          } else if (ratio > 0.50) {
            c.fillStyle = "#fbbf24"; // Amber (-12 to -3 dB)
          } else {
            c.fillStyle = "#00f59b"; // Phosphor Green (-inf to -12 dB)
          }
        } else {
          c.fillStyle = "#111116"; // Unlit well
        }

        c.fillRect(x, segY, cw, segH - gap);
      }
    }

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xs border border-zinc-900 bg-[#050508] p-0.5 select-none",
        className
      )}
    >
      {/* Monospace numeric peak hold badge */}
      <span
        className={cn(
          "w-full text-center font-mono text-[7px] font-bold tabular-nums leading-none mb-1",
          peakHoldText.startsWith("+")
            ? "text-red-400 font-black animate-pulse"
            : peakHoldText === "-inf"
            ? "text-zinc-600"
            : "text-zinc-400"
        )}
      >
        {peakHoldText}
      </span>

      {/* HTML5 Canvas Dual-channel Meter */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="rounded-[1px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.95)]"
      />
    </div>
  );
}
