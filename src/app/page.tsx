"use client";

import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Grid,
  Layers,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import { TransportBar } from "@/components/transport/TransportBar";
import { cn } from "@/lib/utils";
import { useTransportStore } from "@/stores/transport-store";

interface Channel {
  id: string;
  name: string;
  color: string;
  type: "audio" | "midi";
  pan: number;
  volume: number;
  muted: boolean;
  solo: boolean;
  steps: boolean[];
}

const INITIAL_CHANNELS: Channel[] = [
  {
    id: "ch-1",
    name: "909 KICK // SUB",
    color: "#ff4400",
    type: "midi",
    pan: 0,
    volume: 0.85,
    muted: false,
    solo: false,
    steps: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
  },
  {
    id: "ch-2",
    name: "ANALOG SNARE",
    color: "#00f59b",
    type: "midi",
    pan: 0,
    volume: 0.72,
    muted: false,
    solo: false,
    steps: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
  },
  {
    id: "ch-3",
    name: "CLOSED HAT 808",
    color: "#a1a1aa",
    type: "midi",
    pan: 15,
    volume: 0.6,
    muted: false,
    solo: false,
    steps: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
  },
  {
    id: "ch-4",
    name: "303 ACID BASS",
    color: "#ff4400",
    type: "midi",
    pan: -10,
    volume: 0.8,
    muted: false,
    solo: false,
    steps: [true, false, false, true, false, false, true, false, false, true, false, false, true, true, false, false],
  },
  {
    id: "ch-5",
    name: "VOCAL STEM // DRY",
    color: "#38bdf8",
    type: "audio",
    pan: 0,
    volume: 0.9,
    muted: false,
    solo: false,
    steps: [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  },
];

export default function Home() {
  const [channels, setChannels] = useState<Channel[]>(INITIAL_CHANNELS);
  const [activeTab, setActiveTab] = useState<"rack" | "arranger">("rack");
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [selectedChannelId, setSelectedChannelId] = useState<string>("ch-1");

  const position = useTransportStore((state) => state.position);
  const isPlaying = useTransportStore((state) => state.isPlaying);

  // Toggle step sequencer pad
  const toggleStep = (channelId: string, stepIndex: number) => {
    setChannels((prev) =>
      prev.map((ch) => {
        if (ch.id !== channelId) return ch;
        const newSteps = [...ch.steps];
        newSteps[stepIndex] = !newSteps[stepIndex];
        return { ...ch, steps: newSteps };
      })
    );
  };

  // Toggle channel mute
  const toggleMute = (channelId: string) => {
    setChannels((prev) =>
      prev.map((ch) => (ch.id === channelId ? { ...ch, muted: !ch.muted } : ch))
    );
  };

  // Toggle channel solo
  const toggleSolo = (channelId: string) => {
    setChannels((prev) =>
      prev.map((ch) => (ch.id === channelId ? { ...ch, solo: !ch.solo } : ch))
    );
  };

  // Current playing 16th-note step (0..15) mapped from beats & ticks
  const currentStep = ((position.beats - 1) * 4 + Math.floor(position.ticks / 240)) % 16;
  const selectedChannel = channels.find((c) => c.id === selectedChannelId) || channels[0];

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
              <span className="hidden sm:inline">PATTERN 01 [4 BARS]</span>
              <button
                type="button"
                className="flex items-center gap-1 rounded-xs border border-zinc-800 px-2 py-0.5 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                title="Add New Channel"
              >
                <Plus className="size-3 text-telemetry-orange" />
                <span>ADD TRACK</span>
              </button>
            </div>
          </div>

          {/* Workspace Body */}
          <div className="flex-1 overflow-auto p-4">
            {activeTab === "rack" ? (
              /* ── CHANNEL RACK VIEW ── */
              <div className="flex flex-col gap-2">
                {/* Sequencer Grid Header with 16-step indicators */}
                <div className="flex items-center border-b border-zinc-800 pb-2">
                  <div className="w-56 pr-2 font-mono text-[9px] tracking-wider text-zinc-500 uppercase">
                    CHANNEL STRIP // ROUTE
                  </div>
                  <div className="flex flex-1 items-center gap-1 font-mono text-[9px] text-zinc-500">
                    {[1, 2, 3, 4].map((beat) => (
                      <div
                        key={beat}
                        className="flex flex-1 items-center justify-between px-1 border-l border-zinc-800/80"
                      >
                        <span className="text-zinc-400 font-bold">BEAT {beat}</span>
                        <span className="text-[8px] text-zinc-600">.1 .2 .3 .4</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Channel Rows */}
                {channels.map((channel) => {
                  const isSelected = channel.id === selectedChannelId;
                  return (
                    <div
                      key={channel.id}
                      onClick={() => setSelectedChannelId(channel.id)}
                      className={cn(
                        "group flex items-center rounded-sm border bg-[#0d0d12] p-1.5 transition-all cursor-pointer",
                        isSelected
                          ? "border-zinc-600 bg-zinc-900/60 shadow-[0_0_8px_rgba(0,0,0,0.5)]"
                          : "border-zinc-800/80 hover:border-zinc-700"
                      )}
                    >
                      {/* Channel Info & Quick Controls */}
                      <div className="flex w-52 shrink-0 items-center justify-between pr-3 border-r border-zinc-800">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <div
                            className="h-6 w-1 rounded-xs shrink-0"
                            style={{ backgroundColor: channel.color }}
                          />
                          <div className="truncate">
                            <div className="truncate font-mono text-xs font-bold text-zinc-200">
                              {channel.name}
                            </div>
                            <div className="font-mono text-[8px] text-zinc-500 uppercase">
                              {channel.type === "midi" ? "SYNTH ENGINE" : "AUDIO STREAM"}
                            </div>
                          </div>
                        </div>

                        {/* Mute / Solo Buttons */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleMute(channel.id);
                            }}
                            className={cn(
                              "flex size-5 items-center justify-center rounded-[2px] border font-mono text-[9px] font-bold transition-colors",
                              channel.muted
                                ? "border-red-500/80 bg-red-950/80 text-red-400"
                                : "border-zinc-800 bg-[#070709] text-zinc-500 hover:text-zinc-300"
                            )}
                            title="Mute"
                          >
                            M
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSolo(channel.id);
                            }}
                            className={cn(
                              "flex size-5 items-center justify-center rounded-[2px] border font-mono text-[9px] font-bold transition-colors",
                              channel.solo
                                ? "border-amber-500/80 bg-amber-950/80 text-amber-400"
                                : "border-zinc-800 bg-[#070709] text-zinc-500 hover:text-zinc-300"
                            )}
                            title="Solo"
                          >
                            S
                          </button>
                        </div>
                      </div>

                      {/* 16-Step Trigger Sequencer Matrix */}
                      <div className="flex flex-1 items-center gap-1 pl-3">
                        {channel.steps.map((isActive, stepIdx) => {
                          const isBeatStart = stepIdx % 4 === 0;
                          const isPlayheadHere = isPlaying && currentStep === stepIdx;

                          return (
                            <button
                              key={stepIdx}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleStep(channel.id, stepIdx);
                              }}
                              className={cn(
                                "relative h-8 flex-1 rounded-[2px] border transition-all duration-75 select-none",
                                // Beat grouping visual accent
                                isBeatStart ? "border-zinc-700/80" : "border-zinc-800/80",
                                // Active step trigger state
                                isActive
                                  ? "bg-zinc-200 border-white text-black shadow-[0_0_8px_rgba(255,255,255,0.4)]"
                                  : "bg-[#050508] hover:bg-zinc-800/50",
                                // Real-time running playhead sweep highlight
                                isPlayheadHere &&
                                  "ring-2 ring-telemetry-green ring-offset-1 ring-offset-black"
                              )}
                              title={`Step ${stepIdx + 1} (${isActive ? "ON" : "OFF"})`}
                            >
                              {isActive && (
                                <div
                                  className="absolute inset-x-0 bottom-0 h-1"
                                  style={{ backgroundColor: channel.color }}
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* ── ARRANGER TIMELINE VIEW ── */
              <div className="flex flex-col rounded-sm border border-zinc-800 bg-[#0c0c10] p-3">
                {/* Timeline Bar Ruler */}
                <div className="flex h-8 items-center border-b border-zinc-800 bg-[#07070a] px-3 font-mono text-xs text-zinc-400">
                  <div className="w-48 text-[9px] text-zinc-500 uppercase">TRACK LANES</div>
                  <div className="flex flex-1 justify-between font-mono text-[10px]">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((bar) => (
                      <span key={bar} className="border-l border-zinc-800 pl-1 text-zinc-400">
                        BAR {bar}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Track Lanes */}
                <div className="flex flex-col divide-y divide-zinc-800/60">
                  {channels.map((ch, idx) => (
                    <div key={ch.id} className="flex h-16 items-center">
                      <div className="flex w-48 shrink-0 flex-col justify-center pr-3">
                        <span className="font-mono text-xs font-bold text-zinc-200">
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
                            CLIP_{idx + 1} {"//"} [01:01 - 04:04]
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
                    {selectedChannel.type}
                  </span>
                </div>
                <div className="mt-2 font-mono text-sm font-black text-zinc-100">
                  {selectedChannel.name}
                </div>
                <div className="mt-1 flex justify-between font-mono text-[10px] text-zinc-400">
                  <span>ROUTING: BUS 1-2</span>
                  <span>PAN: {selectedChannel.pan > 0 ? `R${selectedChannel.pan}` : selectedChannel.pan < 0 ? `L${Math.abs(selectedChannel.pan)}` : "CENTER"}</span>
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
