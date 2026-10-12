"use client";

import React, { useState } from "react";
import {
  Maximize2,
  Minimize2,
  Sliders,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMixerStore } from "@/stores/mixer-store";
import { ChannelStrip } from "./ChannelStrip";

interface MixerDockProps {
  className?: string;
}

/**
 * Logic Pro / Industrial Brutalist Multi-Track Mixer Console.
 * Holds all channel strips side-by-side with horizontal scroll,
 * and pins the Master Stereo Output strip on the far right.
 */
export function MixerDock({ className }: MixerDockProps) {
  const tracks = useMixerStore((state) => state.tracks);

  const [isExpanded, setIsExpanded] = useState(false);

  const regularTracks = tracks.filter((t) => t.id !== "track-master");
  const masterTrack = tracks.find((t) => t.id === "track-master") || tracks[tracks.length - 1];

  return (
    <div
      className={cn(
        "flex flex-col rounded-sm border border-zinc-800 bg-[#07070b] font-mono select-none overflow-hidden",
        isExpanded ? "h-full" : "h-full",
        className
      )}
    >
      {/* ── Console Header ── */}
      <div className="flex h-10 items-center justify-between border-b border-zinc-800 bg-[#0d0d12] px-3 shrink-0">
        <div className="flex items-center gap-2">
          <Sliders className="size-3.5 text-telemetry-orange" />
          <span className="font-mono text-xs font-black tracking-widest text-zinc-100 uppercase">
            MIXER CONSOLE // BUS MATRIX
          </span>
          <span className="rounded-xs border border-zinc-800 bg-black/50 px-1.5 py-0.5 text-[8px] text-zinc-500">
            {regularTracks.length} BUSSES + 1 MASTER
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 font-mono text-[9px] text-zinc-500">
            <span className="flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-telemetry-green" />
              <span>32-BIT FLOAT INTERNAL</span>
            </span>
          </div>

          {/* Quick toggle view button */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 rounded-xs border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
            title={isExpanded ? "Standard View" : "Maximize Console"}
          >
            {isExpanded ? (
              <Minimize2 className="size-3" />
            ) : (
              <Maximize2 className="size-3" />
            )}
            <span className="hidden md:inline">{isExpanded ? "COMPACT" : "EXPAND"}</span>
          </button>
        </div>
      </div>

      {/* ── Console Channel Strips Deck ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Scrollable Track Strips */}
        <div className="flex flex-1 overflow-x-auto p-2 gap-2 scrollbar-thin scrollbar-thumb-zinc-800">
          {regularTracks.map((track) => (
            <ChannelStrip key={track.id} track={track} isMaster={false} />
          ))}
        </div>

        {/* Right Pinned Master Bus Strip */}
        <div className="flex shrink-0 border-l border-zinc-800 bg-[#08080c] p-2 pl-3">
          {masterTrack && (
            <ChannelStrip key={masterTrack.id} track={masterTrack} isMaster={true} />
          )}
        </div>
      </div>
    </div>
  );
}
