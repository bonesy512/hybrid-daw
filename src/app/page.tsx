"use client";

import React, { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Grid,
  Layers,
  Music2,
  Plus,
  Sliders,
  SlidersHorizontal,
} from "lucide-react";
import { ChannelStrip } from "@/components/mixer/ChannelStrip";
import { MixerDock } from "@/components/mixer/MixerDock";
import { PianoRoll } from "@/components/pianoroll/PianoRoll";
import { SampleBrowser } from "@/components/browser/SampleBrowser";
import { ChannelRack } from "@/components/sequencer/ChannelRack";
import { TransportBar } from "@/components/transport/TransportBar";
import { cn } from "@/lib/utils";
import { useMixerStore } from "@/stores/mixer-store";
import { usePatternStore } from "@/stores/pattern-store";
import { useTransportStore } from "@/stores/transport-store";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"rack" | "pianoroll" | "arranger" | "mixer">("rack");
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [isBrowserOpen, setIsBrowserOpen] = useState(true);

  const channels = usePatternStore((state) => state.channels);
  const addChannel = usePatternStore((state) => state.addChannel);
  const position = useTransportStore((state) => state.position);

  const tracks = useMixerStore((state) => state.tracks);
  const selectedTrackId = useMixerStore((state) => state.selectedTrackId);
  const selectTrack = useMixerStore((state) => state.selectTrack);

  const currentMixerTrack =
    tracks.find((t) => t.id === selectedTrackId) || tracks[0];

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#09090b] font-mono text-zinc-200 select-none">
      {/* ── ZONE 1: TOP TRANSPORT BAR ── */}
      <TransportBar />

      {/* ── MAIN WORKSPACE CONTAINER (ZONES 0, 2 & 3) ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── ZONE 0: LEFT COLLAPSIBLE SAMPLE BROWSER DOCK ── */}
        <SampleBrowser
          isCollapsed={!isBrowserOpen}
          onToggleCollapse={() => setIsBrowserOpen(!isBrowserOpen)}
        />

        {/* ── ZONE 2: CENTRAL WORKSPACE (Channel Rack + Arranger + Mixer Dock) ── */}
        <main className="flex flex-1 flex-col overflow-hidden border-r border-[#27272A] bg-[#09090b]">
          {/* Workspace Sub-header / Mode Selector */}
          <div className="flex h-10 items-center justify-between border-b border-[#27272A] bg-[#0c0c10] px-3 shrink-0">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveTab("rack")}
                className={cn(
                  "flex items-center gap-1.5 rounded-xs border px-3 py-1 font-mono text-xs font-semibold tracking-wider transition-colors uppercase",
                  activeTab === "rack"
                    ? "border-telemetry-orange/70 bg-zinc-900 text-telemetry-orange shadow-[0_0_8px_rgba(255,68,0,0.25)]"
                    : "border-transparent text-zinc-500 hover:border-zinc-800 hover:text-zinc-300"
                )}
              >
                <Grid className="size-3.5" />
                <span>CHANNEL RACK</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("pianoroll")}
                className={cn(
                  "flex items-center gap-1.5 rounded-xs border px-3 py-1 font-mono text-xs font-semibold tracking-wider transition-colors uppercase",
                  activeTab === "pianoroll"
                    ? "border-telemetry-orange/70 bg-zinc-900 text-telemetry-orange shadow-[0_0_8px_rgba(255,68,0,0.25)]"
                    : "border-transparent text-zinc-500 hover:border-zinc-800 hover:text-zinc-300"
                )}
              >
                <Music2 className="size-3.5" />
                <span>PIANO ROLL</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("arranger")}
                className={cn(
                  "flex items-center gap-1.5 rounded-xs border px-3 py-1 font-mono text-xs font-semibold tracking-wider transition-colors uppercase",
                  activeTab === "arranger"
                    ? "border-telemetry-orange/70 bg-zinc-900 text-telemetry-orange shadow-[0_0_8px_rgba(255,68,0,0.25)]"
                    : "border-transparent text-zinc-500 hover:border-zinc-800 hover:text-zinc-300"
                )}
              >
                <Layers className="size-3.5" />
                <span>ARRANGER TIMELINE</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("mixer")}
                className={cn(
                  "flex items-center gap-1.5 rounded-xs border px-3 py-1 font-mono text-xs font-semibold tracking-wider transition-colors uppercase",
                  activeTab === "mixer"
                    ? "border-telemetry-orange/70 bg-zinc-900 text-telemetry-orange shadow-[0_0_8px_rgba(255,68,0,0.25)]"
                    : "border-transparent text-zinc-500 hover:border-zinc-800 hover:text-zinc-300"
                )}
              >
                <Sliders className="size-3.5" />
                <span>MIXER CONSOLE</span>
              </button>
            </div>

            {/* Quick Status / Tools Bar */}
            <div className="flex items-center gap-3 font-mono text-[10px] text-zinc-500">
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-telemetry-green" />
                <span>SNAP: 1/16</span>
              </span>
              <span className="hidden sm:inline">
                BAR {position.bars} : BEAT {position.beats}
              </span>
              <button
                type="button"
                onClick={() => addChannel("Custom Track", "synths/analog", "#00f59b")}
                className="flex items-center gap-1 rounded-xs border border-zinc-800 px-2 py-0.5 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 transition-colors"
                title="Add New Track"
              >
                <Plus className="size-3 text-telemetry-orange" />
                <span>ADD TRACK</span>
              </button>
            </div>
          </div>

          {/* Workspace Body */}
          <div className="flex-1 overflow-hidden p-3">
            {activeTab === "rack" ? (
              /* ── DEDICATED CHANNEL RACK & STEP SEQUENCER ── */
              <ChannelRack onOpenPianoRoll={() => setActiveTab("pianoroll")} />
            ) : activeTab === "pianoroll" ? (
              /* ── HIGH-PERFORMANCE CANVAS PIANO ROLL ── */
              <PianoRoll />
            ) : activeTab === "mixer" ? (
              /* ── FULL MULTI-TRACK MIXER CONSOLE ── */
              <MixerDock />
            ) : (
              /* ── ARRANGER TIMELINE VIEW ── */
              <div className="flex h-full flex-col overflow-y-auto rounded-sm border border-zinc-800 bg-[#0c0c10] p-3">
                {/* Timeline Bar Ruler */}
                <div className="flex h-8 items-center border-b border-zinc-800 bg-[#07070a] px-3 font-mono text-xs text-zinc-400">
                  <div className="w-56 text-[9px] text-zinc-500 uppercase">
                    TRACK LANES // ARRANGEMENT
                  </div>
                  <div className="flex flex-1 justify-between font-mono text-[10px]">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((bar) => (
                      <span key={bar} className="border-l border-zinc-800 pl-1 text-zinc-400">
                        BAR {bar}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Track Lanes connected to PatternStore & MixerStore */}
                <div className="flex flex-col divide-y divide-zinc-800/60">
                  {channels.map((ch, idx) => (
                    <div
                      key={ch.id}
                      onClick={() => selectTrack(tracks[idx % tracks.length]?.id || "track-1")}
                      className="flex h-16 items-center px-2 cursor-pointer transition-colors hover:bg-zinc-900/30"
                    >
                      <div className="flex w-56 shrink-0 flex-col justify-center pr-3">
                        <span className="font-mono text-xs font-bold text-zinc-200 truncate">
                          {ch.name}
                        </span>
                        <span className="font-mono text-[9px] text-zinc-500">
                          INSERT {idx + 1} {"//"} STEREO
                        </span>
                      </div>
                      <div className="relative flex flex-1 h-12 items-center rounded-xs border border-zinc-800/80 bg-[#060609] px-2 overflow-hidden">
                        {/* Audio / Pattern Block Sample */}
                        <div
                          className="flex h-10 w-2/3 items-center rounded-[2px] border px-3"
                          style={{
                            borderColor: `${ch.color}66`,
                            backgroundColor: `${ch.color}15`,
                          }}
                        >
                          <span
                            className="font-mono text-[10px] font-bold uppercase tracking-wider"
                            style={{ color: ch.color }}
                          >
                            PATTERN_01 {"//"} [01:01 - 04:04]
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>

        {/* ── ZONE 3: RIGHT COLLAPSIBLE INSPECTOR / CHANNEL STRIP DOCK ── */}
        <aside
          className={cn(
            "relative flex flex-col border-l border-[#27272A] transition-all duration-200 select-none shrink-0",
            // Selective Glassmorphism per design rule:
            "backdrop-blur-xl bg-zinc-950/90",
            isInspectorOpen ? "w-44" : "w-10"
          )}
        >
          {/* Collapse / Expand Toggle Tab */}
          <div className="flex h-10 items-center justify-between border-b border-[#27272A] bg-[#0c0c10] px-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsInspectorOpen(!isInspectorOpen)}
              className="flex h-7 w-7 items-center justify-center rounded-xs border border-zinc-800 bg-[#070709] text-zinc-400 hover:border-zinc-700 hover:text-zinc-100"
              title={isInspectorOpen ? "Collapse Channel Strip" : "Expand Channel Strip"}
            >
              {isInspectorOpen ? (
                <ChevronRight className="size-4" />
              ) : (
                <ChevronLeft className="size-4 text-telemetry-orange" />
              )}
            </button>

            {isInspectorOpen && (
              <div className="flex items-center gap-1 font-mono text-[9px] font-bold tracking-wider text-zinc-300 uppercase truncate">
                <SlidersHorizontal className="size-3 text-telemetry-orange" />
                <span className="truncate">STRIP: {currentMixerTrack.name}</span>
              </div>
            )}
          </div>

          {/* Dedicated Logic-style Channel Strip Inspector (when expanded) */}
          {isInspectorOpen ? (
            <div className="flex flex-1 flex-col items-center overflow-y-auto p-1.5 scrollbar-thin scrollbar-thumb-zinc-800">
              <ChannelStrip
                track={currentMixerTrack}
                isMaster={currentMixerTrack.id === "track-master"}
              />
            </div>
          ) : (
            /* Slim Vertical Rail when collapsed */
            <div className="flex flex-1 flex-col items-center justify-center py-4">
              <span className="font-mono text-[9px] tracking-[0.3em] text-zinc-600 uppercase [writing-mode:vertical-lr]">
                CHANNEL STRIP
              </span>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
