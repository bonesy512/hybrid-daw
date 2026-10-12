"use client";

import React, { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Grid,
  Layers,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import { ChannelRack } from "@/components/sequencer/ChannelRack";
import { TransportBar } from "@/components/transport/TransportBar";
import { cn } from "@/lib/utils";
import { usePatternStore } from "@/stores/pattern-store";
import { useTransportStore } from "@/stores/transport-store";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"rack" | "arranger">("rack");
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [selectedChannelId, setSelectedChannelId] = useState<string>("ch-kick-808");

  const channels = usePatternStore((state) => state.channels);
  const addChannel = usePatternStore((state) => state.addChannel);
  const position = useTransportStore((state) => state.position);

  // Sync or fallback selected channel
  const selectedChannel =
    channels.find((c) => c.id === selectedChannelId) || channels[0] || {
      id: "ch-default",
      name: "MASTER TRACK",
      color: "#ff4400",
      sampleUrl: "synths/master",
      pan: 0,
      volume: 0.8,
      isMuted: false,
      isSolo: false,
      pitchOffset: 0,
      timeShift: 0,
      steps: [],
    };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#09090b] font-mono text-zinc-200 select-none">
      {/* ── ZONE 1: TOP TRANSPORT BAR ── */}
      <TransportBar />

      {/* ── MAIN WORKSPACE CONTAINER (ZONES 2 & 3) ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── ZONE 2: CENTRAL WORKSPACE (Channel Rack + Arrangement Dock) ── */}
        <main className="flex flex-1 flex-col overflow-hidden border-r border-[#27272A] bg-[#09090b]">
          {/* Workspace Sub-header / Mode Selector */}
          <div className="flex h-10 items-center justify-between border-b border-[#27272A] bg-[#0c0c10] px-3">
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
              <ChannelRack />
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

                {/* Track Lanes connected to PatternStore */}
                <div className="flex flex-col divide-y divide-zinc-800/60">
                  {channels.map((ch, idx) => (
                    <div
                      key={ch.id}
                      onClick={() => setSelectedChannelId(ch.id)}
                      className={cn(
                        "flex h-16 items-center px-2 cursor-pointer transition-colors",
                        selectedChannelId === ch.id
                          ? "bg-zinc-900/40"
                          : "hover:bg-zinc-900/20"
                      )}
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

        {/* ── ZONE 3: RIGHT COLLAPSIBLE INSPECTOR / MIXER DOCK ── */}
        <aside
          className={cn(
            "relative flex flex-col border-l border-[#27272A] transition-all duration-200 select-none",
            // Selective Glassmorphism per design rule:
            "backdrop-blur-xl bg-zinc-950/90",
            isInspectorOpen ? "w-80" : "w-10"
          )}
        >
          {/* Collapse / Expand Toggle Tab */}
          <div className="flex h-10 items-center justify-between border-b border-[#27272A] bg-[#0c0c10] px-2">
            <button
              type="button"
              onClick={() => setIsInspectorOpen(!isInspectorOpen)}
              className="flex h-7 w-7 items-center justify-center rounded-xs border border-zinc-800 bg-[#070709] text-zinc-400 hover:border-zinc-700 hover:text-zinc-100"
              title={isInspectorOpen ? "Collapse Inspector" : "Expand Inspector"}
            >
              {isInspectorOpen ? (
                <ChevronRight className="size-4" />
              ) : (
                <ChevronLeft className="size-4 text-telemetry-orange" />
              )}
            </button>

            {isInspectorOpen && (
              <div className="flex items-center gap-1 font-mono text-[10px] font-bold tracking-wider text-zinc-300 uppercase">
                <SlidersHorizontal className="size-3.5 text-telemetry-orange" />
                <span>INSPECTOR & DSP</span>
              </div>
            )}
          </div>

          {/* Inspector Content (when expanded) */}
          {isInspectorOpen ? (
            <div className="flex flex-1 flex-col overflow-y-auto p-3 gap-4">
              {/* Selected Channel Hardware Overview */}
              <div className="rounded-sm border border-zinc-800 bg-[#07070a] p-3">
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                  <span className="font-mono text-[9px] tracking-wider text-zinc-500 uppercase">
                    ACTIVE STRIP
                  </span>
                  <span
                    className="font-mono text-[9px] font-bold uppercase"
                    style={{ color: selectedChannel.color }}
                  >
                    INSERT ROUTE
                  </span>
                </div>
                <div className="mt-2 font-mono text-sm font-black text-zinc-100 truncate">
                  {selectedChannel.name}
                </div>
                <div className="mt-1 flex justify-between font-mono text-[10px] text-zinc-400">
                  <span>ROUTING: BUS 1-2</span>
                  <span>
                    PAN:{" "}
                    {selectedChannel.pan > 0
                      ? `R${Math.round(selectedChannel.pan * 100)}`
                      : selectedChannel.pan < 0
                      ? `L${Math.round(Math.abs(selectedChannel.pan) * 100)}`
                      : "CENTER"}
                  </span>
                </div>
                <div className="mt-1 flex justify-between font-mono text-[10px] text-zinc-400">
                  <span>PITCH TUNING:</span>
                  <span className="text-telemetry-orange">
                    {selectedChannel.pitchOffset > 0
                      ? `+${selectedChannel.pitchOffset} st`
                      : `${selectedChannel.pitchOffset} st`}
                  </span>
                </div>
              </div>

              {/* DSP Processing Chain Slots */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between font-mono text-[9px] tracking-wider text-zinc-500 uppercase">
                  <span>DSP INSERT MATRIX</span>
                  <span className="text-[8px] text-telemetry-green">0.0ms LATENCY</span>
                </div>

                {[
                  { name: "01 // TUBE PREAMP SATURATION", active: true },
                  { name: "02 // 4-BAND SURGICAL EQ", active: true },
                  { name: "03 // OPTICAL BUS COMPRESSOR", active: false },
                  { name: "04 // TRUE PEAK BRICKWALL LIMITER", active: false },
                ].map((slot) => (
                  <div
                    key={slot.name}
                    className={cn(
                      "flex items-center justify-between rounded-sm border px-2.5 py-2 font-mono text-[10px] transition-colors",
                      slot.active
                        ? "border-zinc-700 bg-zinc-900/80 text-zinc-200"
                        : "border-zinc-850 bg-[#050508] text-zinc-500"
                    )}
                  >
                    <span>{slot.name}</span>
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        slot.active
                          ? "bg-telemetry-green shadow-[0_0_6px_rgba(0,245,155,0.8)]"
                          : "bg-zinc-800"
                      )}
                    />
                  </div>
                ))}
              </div>

              {/* Master Output Channel Fader & VU Well */}
              <div className="mt-auto rounded-sm border border-zinc-800 bg-[#07070a] p-3">
                <div className="flex items-center justify-between font-mono text-[9px] text-zinc-500 uppercase">
                  <span>MASTER STRIP</span>
                  <span className="text-telemetry-green">WASAPI OUT 1-2</span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex flex-col font-mono text-xs font-bold text-zinc-300">
                    <span>MAIN VOL</span>
                    <span className="text-telemetry-orange">0.0 dB</span>
                  </div>
                  {/* Master Fader Track */}
                  <div className="relative flex h-24 w-6 items-center justify-center rounded-xs border border-zinc-800 bg-[#040406]">
                    <div className="absolute inset-y-1 w-1 bg-zinc-800" />
                    <div className="absolute top-8 h-4 w-5 rounded-[1px] border border-zinc-500 bg-zinc-200 shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Slim Vertical Rail when collapsed */
            <div className="flex flex-1 flex-col items-center justify-center py-4">
              <span className="font-mono text-[9px] tracking-[0.3em] text-zinc-600 uppercase [writing-mode:vertical-lr]">
                INSPECTOR DOCK
              </span>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
