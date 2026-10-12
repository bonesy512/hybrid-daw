"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface StepPadProps {
  stepIndex: number;
  isActive: boolean;
  isCurrentPlayhead: boolean;
  channelColor?: string;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * 16-step tactile trigger pad with classic FL-style 4-step alternating
 * light/dark brutalist chassis, active Phosphor Green LED glow, and
 * real-time playhead sweep indicator.
 */
export function StepPad({
  stepIndex,
  isActive,
  isCurrentPlayhead,
  channelColor = "#00f59b",
  onClick,
  disabled = false,
}: StepPadProps) {
  // Classic 4-step grouping: 0-3 (light), 4-7 (dark), 8-11 (light), 12-15 (dark)
  const isAltGroup = Math.floor(stepIndex / 4) % 2 === 1;
  const isFirstOfGroup = stepIndex % 4 === 0;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isActive}
      aria-label={`Step ${stepIndex + 1}`}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        // Base tactile mechanical geometry
        "group relative flex h-9 flex-1 min-w-[22px] max-w-[42px] flex-col items-center justify-between rounded-[2px] p-1 transition-all duration-75 select-none active:scale-[0.96] active:translate-y-[1px]",
        // Chassis bevel & shadows (Industrial brutalist stepped pad)
        "border border-t-zinc-600/70 border-l-zinc-600/70 border-b-black border-r-black shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_4px_rgba(0,0,0,0.8)]",
        // Alternating 4-step chassis colors
        isAltGroup
          ? "bg-[#141419] hover:bg-[#1c1c24]"
          : "bg-[#25252d] hover:bg-[#2e2e38]",
        // First of 4-step group extra visual boundary
        isFirstOfGroup && "border-l-zinc-500",
        // Active Trigger State (Phosphor Green LED illumination)
        isActive &&
          "border-t-emerald-400/80 border-l-emerald-400/80 border-b-emerald-950 border-r-emerald-950 bg-[#06241a] shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_0_10px_rgba(0,245,155,0.35)]",
        // Playhead sweep highlight
        isCurrentPlayhead &&
          "ring-1 ring-telemetry-orange ring-offset-1 ring-offset-black z-10"
      )}
      title={`Step ${stepIndex + 1} (${isActive ? "ACTIVE" : "EMPTY"})`}
    >
      {/* Top playhead indicator pip */}
      <div
        className={cn(
          "h-1 w-full rounded-[1px] transition-all",
          isCurrentPlayhead
            ? "bg-telemetry-orange shadow-[0_0_6px_rgba(255,68,0,0.9)]"
            : "bg-transparent"
        )}
      />

      {/* Center Tactical LED Cap */}
      <div
        className={cn(
          "relative flex h-3.5 w-full items-center justify-center rounded-[1px] border transition-all duration-75",
          isActive
            ? "border-telemetry-green bg-telemetry-green shadow-[0_0_8px_rgba(0,245,155,0.8)]"
            : "border-black/60 bg-black/40 group-hover:bg-black/60"
        )}
      >
        {/* LED internal filament core */}
        {isActive ? (
          <div className="h-1 w-2.5 rounded-full bg-white shadow-[0_0_4px_rgba(255,255,255,0.9)]" />
        ) : (
          <div className="h-0.5 w-1.5 rounded-full bg-zinc-800/80" />
        )}
      </div>

      {/* Bottom Sub-groove with Channel Accent pip */}
      <div className="flex h-1 w-full items-center justify-center">
        {isActive ? (
          <div
            className="h-0.5 w-3 rounded-full opacity-80"
            style={{ backgroundColor: channelColor }}
          />
        ) : (
          <span className="font-mono text-[7px] text-zinc-600/70 select-none">
            {(stepIndex % 4) + 1}
          </span>
        )}
      </div>
    </button>
  );
}
