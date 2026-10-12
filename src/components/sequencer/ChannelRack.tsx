"use client";

import React, { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ListRestart,
  Music2,
  Plus,
  Settings,
  Usb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { syncPattern } from "@/lib/audio/tauri-bridge";
import { useMidiStore } from "@/stores/midi-store";
import { type Channel, usePatternStore } from "@/stores/pattern-store";
import { usePianoRollStore } from "@/stores/pianoroll-store";
import { useTransportStore } from "@/stores/transport-store";
import { ChannelSettingsModal } from "./ChannelSettingsModal";
import { StepPad } from "./StepPad";

export interface ChannelRackProps {
  onOpenPianoRoll?: (channelId: string) => void;
}

interface MiniPotProps {
  label: "PAN" | "VOL";
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  onChange: (val: number) => void;
  color?: string;
}

/**
 * Compact channel-strip potentiometer for quick pan/volume adjustments.
 */
function MiniPot({
  label,
  value,
  min,
  max,
  defaultValue,
  onChange,
  color = "#ff4400",
}: MiniPotProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startVal = value;
    setIsDragging(true);

    const onPointerMove = (ev: PointerEvent) => {
      const deltaY = startY - ev.clientY;
      const range = max - min;
      const sensitivity = ev.shiftKey ? 200 : 80;
      const nextVal = Math.max(min, Math.min(max, startVal + (deltaY / sensitivity) * range));
      onChange(Number(nextVal.toFixed(2)));
    };

    const onPointerUp = (ev: PointerEvent) => {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId);
      } catch {
        // pointer capture lost
      }
      setIsDragging(false);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const normalized = (value - min) / (max - min || 1);
  const angle = -135 + normalized * 270;

  const tooltipText =
    label === "PAN"
      ? value === 0
        ? "Pan: Center"
        : value < 0
        ? `Pan: ${Math.round(Math.abs(value) * 100)}% Left`
        : `Pan: ${Math.round(value * 100)}% Right`
      : `Vol: ${Math.round(value * 100)}%`;

  return (
    <div
      className="flex flex-col items-center select-none cursor-ns-resize"
      onPointerDown={handlePointerDown}
      onDoubleClick={() => onChange(defaultValue)}
      title={`${tooltipText} (2x-click to reset)`}
    >
      <div
        className={cn(
          "relative flex size-5 items-center justify-center rounded-full border border-zinc-700 bg-[#1a1a22] shadow-[0_1px_2px_rgba(0,0,0,0.8)] transition-all",
          isDragging && "ring-1 ring-telemetry-orange shadow-[0_0_8px_rgba(255,68,0,0.5)]"
        )}
      >
        <div
          className="relative size-3.5 rounded-full bg-[#121216]"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          <div
            className="absolute top-0.5 left-1/2 h-1.5 w-[1.5px] -translate-x-1/2 rounded-full"
            style={{ backgroundColor: color }}
          />
        </div>
      </div>
      <span className="font-mono text-[7px] text-zinc-500 font-bold tracking-tighter">
        {label}
      </span>
    </div>
  );
}

export function ChannelRack({ onOpenPianoRoll }: ChannelRackProps = {}) {
  const channels = usePatternStore((state) => state.channels);
  const activePatternIndex = usePatternStore((state) => state.activePatternIndex);
  const currentStep = usePatternStore((state) => state.currentStep);
  const stepCount = usePatternStore((state) => state.stepCount);
  const swing = usePatternStore((state) => state.swing);

  const toggleStep = usePatternStore((state) => state.toggleStep);
  const setChannelPan = usePatternStore((state) => state.setChannelPan);
  const setChannelVolume = usePatternStore((state) => state.setChannelVolume);
  const toggleChannelMute = usePatternStore((state) => state.toggleChannelMute);
  const toggleChannelSolo = usePatternStore((state) => state.toggleChannelSolo);
  const addChannel = usePatternStore((state) => state.addChannel);
  const clearPattern = usePatternStore((state) => state.clearPattern);
  const setCurrentStep = usePatternStore((state) => state.setCurrentStep);
  const setActivePatternIndex = usePatternStore((state) => state.setActivePatternIndex);
  const setSwing = usePatternStore((state) => state.setSwing);
  const setStepCount = usePatternStore((state) => state.setStepCount);

  const isPlaying = useTransportStore((state) => state.isPlaying);
  const position = useTransportStore((state) => state.position);

  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [isDraggingMidi, setIsDraggingMidi] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingMidi(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingMidi(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingMidi(false);

    const file = e.dataTransfer.files[0];
    if (!file || !file.name.match(/\.(mid|midi)$/i)) return;

    const parsed = await useMidiStore.getState().parseMidiFile(file);
    if (!parsed || parsed.tracks.length === 0) return;

    const currentChannels = usePatternStore.getState().channels;
    const currentStepCount = usePatternStore.getState().stepCount;
    const ppq = parsed.ppq || 96;
    const ticksPerStep = Math.max(1, ppq / 4);

    const newChannelSteps: Record<string, boolean[]> = {};
    for (const ch of currentChannels) {
      newChannelSteps[ch.id] = new Array(currentStepCount).fill(false);
    }

    const findChannel = (kw: string) =>
      currentChannels.find((c) => c.name.toLowerCase().includes(kw));

    const kickCh = findChannel("kick") || currentChannels[0];
    const clapCh =
      findChannel("clap") ||
      findChannel("snare") ||
      currentChannels[1] ||
      currentChannels[0];
    const hatCh = findChannel("hat") || currentChannels[2] || currentChannels[0];
    const snareCh = findChannel("snare") || clapCh;

    let hasMapped = false;

    parsed.tracks.forEach((track, trackIdx) => {
      track.notes.forEach((note) => {
        const stepIndex =
          Math.round(note.start_tick / ticksPerStep) % currentStepCount;
        if (stepIndex >= 0 && stepIndex < currentStepCount) {
          let targetChannelId = "";

          // General MIDI drum mapping
          if (note.pitch === 35 || note.pitch === 36) {
            targetChannelId = kickCh.id;
          } else if (note.pitch === 38 || note.pitch === 40) {
            targetChannelId = snareCh.id;
          } else if (note.pitch === 39) {
            targetChannelId = clapCh.id;
          } else if (note.pitch === 42 || note.pitch === 44 || note.pitch === 46) {
            targetChannelId = hatCh.id;
          } else if (track.name && findChannel(track.name.toLowerCase())) {
            targetChannelId = findChannel(track.name.toLowerCase())!.id;
          } else {
            const ch = currentChannels[trackIdx % currentChannels.length];
            targetChannelId = ch ? ch.id : currentChannels[0].id;
          }

          if (targetChannelId && newChannelSteps[targetChannelId]) {
            newChannelSteps[targetChannelId][stepIndex] = true;
            hasMapped = true;
          }
        }
      });
    });

    if (hasMapped) {
      usePatternStore.setState((state) => {
        const updatedChannels = state.channels.map((ch) => ({
          ...ch,
          steps: newChannelSteps[ch.id] || ch.steps,
        }));

        syncPattern(
          updatedChannels.map((c) => ({
            id: c.id,
            name: c.name,
            steps: c.steps,
          }))
        ).catch(() => {});

        return { channels: updatedChannels };
      });
    }
  };

  // Sync currentStep with transport position when playing
  useEffect(() => {
    if (isPlaying) {
      const step =
        ((position.beats - 1) * 4 + Math.floor(position.ticks / 240)) % stepCount;
      setCurrentStep(step);
    }
  }, [isPlaying, position.beats, position.ticks, stepCount, setCurrentStep]);

  const handleOpenSettings = (channel: Channel) => {
    setSelectedChannel(channel);
    setIsModalOpen(true);
  };

  const PRESET_INSTRUMENTS = [
    { name: "Kick 909", url: "synths/kick-909", color: "#ff4400" },
    { name: "Sub 808 Bass", url: "synths/sub-808", color: "#ff4400" },
    { name: "Clap Tight", url: "samples/clap-tight", color: "#00f59b" },
    { name: "Rimshot Metal", url: "samples/rim-metal", color: "#00f59b" },
    { name: "Hi-Hat Open", url: "samples/hat-open", color: "#a1a1aa" },
    { name: "Percussion Shaker", url: "samples/shaker", color: "#38bdf8" },
    { name: "Acid 303 Saw", url: "synths/acid-303", color: "#fbbf24" },
  ];

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex h-full flex-col overflow-hidden rounded-sm border border-zinc-800 bg-[#09090c] font-mono select-none"
    >
      {/* ── MIDI File Dropzone Overlay ── */}
      {isDraggingMidi && (
        <div className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center border-2 border-dashed border-telemetry-green bg-zinc-950/90 backdrop-blur-md animate-in fade-in duration-100">
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <div className="flex size-14 items-center justify-center rounded-sm border border-telemetry-green/50 bg-black/80 shadow-[0_0_20px_rgba(0,245,155,0.3)]">
              <Music2 className="size-8 text-telemetry-green animate-pulse" />
            </div>
            <div className="flex items-center gap-2">
              <Usb className="size-4 text-telemetry-orange" />
              <h3 className="font-mono text-sm font-bold tracking-wider text-zinc-100 uppercase">
                DROP STANDARD MIDI FILE (.MID)
              </h3>
            </div>
            <p className="font-mono text-xs text-zinc-400 max-w-sm">
              Auto-detects drum notes (Kick, Snare, Clap, Hi-Hats) and populates
              the 16/32 step sequencer triggers.
            </p>
          </div>
        </div>
      )}

      {/* ── Rack Header / Telemetry ── */}
      <div className="flex h-11 items-center justify-between border-b border-zinc-800 bg-[#0f0f14] px-3">
        {/* Left: Pattern Selector & Swing */}
        <div className="flex items-center gap-3">
          {/* Pattern Stepper */}
          <div className="flex items-center rounded-xs border border-zinc-700 bg-black/60 px-1.5 py-0.5">
            <button
              type="button"
              onClick={() => setActivePatternIndex(Math.max(0, activePatternIndex - 1))}
              className="p-0.5 text-zinc-400 hover:text-zinc-100 disabled:opacity-30"
              disabled={activePatternIndex === 0}
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <span className="px-2 font-mono text-xs font-bold tracking-wider text-telemetry-orange">
              PATTERN {String(activePatternIndex + 1).padStart(2, "0")}
            </span>
            <button
              type="button"
              onClick={() => setActivePatternIndex(activePatternIndex + 1)}
              className="p-0.5 text-zinc-400 hover:text-zinc-100"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>

          {/* Swing Groove Slider */}
          <div
            className="hidden items-center gap-2 rounded-xs border border-zinc-800 bg-black/40 px-2 py-1 sm:flex"
            title="Swing Groove (% offset on off-beat 16ths)"
          >
            <span className="font-mono text-[9px] text-zinc-500 uppercase">SWING</span>
            <input
              type="range"
              min={0}
              max={100}
              value={swing}
              onChange={(e) => setSwing(Number(e.target.value))}
              className="h-1.5 w-16 accent-telemetry-green cursor-pointer"
            />
            <span className="font-mono text-[9px] text-zinc-300 tabular-nums">
              {swing}%
            </span>
          </div>
        </div>

        {/* Right: Step Count Toggle (16/32) & Clear Pattern */}
        <div className="flex items-center gap-2">
          {/* Step Count Toggle */}
          <div className="flex rounded-[2px] border border-zinc-700 bg-black/60 p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setStepCount(16)}
              className={cn(
                "rounded-xs px-2 py-0.5 font-bold transition-colors",
                stepCount === 16
                  ? "bg-zinc-800 text-telemetry-green shadow-[0_0_6px_rgba(0,245,155,0.4)]"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              16 STEPS
            </button>
            <button
              type="button"
              onClick={() => setStepCount(32)}
              className={cn(
                "rounded-xs px-2 py-0.5 font-bold transition-colors",
                stepCount === 32
                  ? "bg-zinc-800 text-telemetry-green shadow-[0_0_6px_rgba(0,245,155,0.4)]"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              32 STEPS
            </button>
          </div>

          {/* Clear Pattern */}
          <button
            type="button"
            onClick={clearPattern}
            className="flex items-center gap-1 rounded-xs border border-zinc-800 bg-black/40 px-2 py-1 text-[10px] text-zinc-400 hover:border-zinc-700 hover:text-red-400 transition-colors"
            title="Clear all steps in current pattern"
          >
            <ListRestart className="size-3" />
            <span className="hidden md:inline">CLEAR</span>
          </button>
        </div>
      </div>

      {/* ── Channel List & Step Pads Container ── */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* Step Marker Timeline Header */}
        <div className="flex items-center border-b border-zinc-800/80 pb-2 mb-2">
          <div className="w-64 pr-3 font-mono text-[9px] tracking-wider text-zinc-500 uppercase">
            CHANNELS // ROUTE
          </div>

          <div className="flex flex-1 items-center gap-1">
            {Array.from({ length: stepCount / 4 }).map((_, beatIdx) => (
              <div
                key={beatIdx}
                className="flex flex-1 items-center justify-between px-1 border-l border-zinc-800"
              >
                <span className="font-mono text-[9px] font-bold text-zinc-400">
                  {beatIdx + 1}
                </span>
                <span className="font-mono text-[8px] text-zinc-600">
                  {stepCount === 16 ? `.${beatIdx * 4 + 1}` : `.${beatIdx + 1}`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Channel Rows */}
        <div className="flex flex-col gap-2">
          {channels.map((channel) => {
            return (
              <div
                key={channel.id}
                className="group flex items-center rounded-sm border border-zinc-800/90 bg-[#0d0d12] p-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.6)] hover:border-zinc-700 transition-all"
              >
                {/* ── Left Module: Mute, Solo, Pots, Channel Button ── */}
                <div className="flex w-64 shrink-0 items-center gap-2 pr-3 border-r border-zinc-800">
                  {/* Mute & Solo Tactile Buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleChannelMute(channel.id)}
                      className={cn(
                        "flex size-5 items-center justify-center rounded-[2px] border font-mono text-[9px] font-bold transition-all",
                        channel.isMuted
                          ? "border-red-500 bg-red-950 text-red-400 shadow-[0_0_6px_rgba(239,68,68,0.6)]"
                          : "border-zinc-800 bg-[#060608] text-zinc-500 hover:text-zinc-200"
                      )}
                      title="Mute"
                    >
                      M
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleChannelSolo(channel.id)}
                      className={cn(
                        "flex size-5 items-center justify-center rounded-[2px] border font-mono text-[9px] font-bold transition-all",
                        channel.isSolo
                          ? "border-amber-500 bg-amber-950 text-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.6)]"
                          : "border-zinc-800 bg-[#060608] text-zinc-500 hover:text-zinc-200"
                      )}
                      title="Solo"
                    >
                      S
                    </button>
                  </div>

                  {/* Pan & Volume Pots */}
                  <div className="flex items-center gap-1.5 px-1 border-x border-zinc-800/60">
                    <MiniPot
                      label="PAN"
                      value={channel.pan}
                      min={-1}
                      max={1}
                      defaultValue={0}
                      onChange={(v) => setChannelPan(channel.id, v)}
                      color="#38bdf8"
                    />
                    <MiniPot
                      label="VOL"
                      value={channel.volume}
                      min={0}
                      max={1}
                      defaultValue={0.8}
                      onChange={(v) => setChannelVolume(channel.id, v)}
                      color="#00f59b"
                    />
                  </div>

                  {/* Tactile Channel Label Button (Click opens Piano Roll, Right-click opens Settings) */}
                  <button
                    type="button"
                    onClick={() => {
                      usePianoRollStore.getState().setSelectedChannelId(channel.id);
                      onOpenPianoRoll?.(channel.id);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      handleOpenSettings(channel);
                    }}
                    className="relative flex h-8 flex-1 items-center gap-2 overflow-hidden rounded-[2px] border border-t-zinc-600/60 border-l-zinc-600/60 border-b-black border-r-black bg-gradient-to-r from-[#202028] to-[#16161c] px-2 text-left shadow-[0_1px_2px_rgba(0,0,0,0.8)] hover:from-[#282834] hover:to-[#1e1e26] active:translate-y-[1px] transition-all group/btn"
                    title="Click to open in Piano Roll, right-click for Settings"
                  >
                    {/* Channel Color Beacon */}
                    <div
                      className="h-4 w-1 rounded-full shrink-0 shadow-[0_0_6px_currentColor]"
                      style={{ backgroundColor: channel.color, color: channel.color }}
                    />

                    <div className="flex flex-col truncate">
                      <span className="truncate font-mono text-xs font-bold text-zinc-200">
                        {channel.name}
                      </span>
                      {channel.pitchOffset !== 0 && (
                        <span className="font-mono text-[8px] text-telemetry-orange font-bold">
                          {channel.pitchOffset > 0
                            ? `+${channel.pitchOffset}st`
                            : `${channel.pitchOffset}st`}
                        </span>
                      )}
                    </div>

                    <div
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenSettings(channel);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          handleOpenSettings(channel);
                        }
                      }}
                      className="ml-auto hidden size-5 items-center justify-center rounded-[2px] text-zinc-500 hover:text-zinc-200 group-hover/btn:flex transition-colors cursor-pointer"
                      title="Channel Settings"
                    >
                      <Settings className="size-3" />
                    </div>
                  </button>
                </div>

                {/* ── Right Module: 16/32 Step Grid ── */}
                <div className="flex flex-1 items-center gap-1 pl-3">
                  {channel.steps.slice(0, stepCount).map((isActive, stepIdx) => (
                    <StepPad
                      key={stepIdx}
                      stepIndex={stepIdx}
                      isActive={isActive}
                      isCurrentPlayhead={isPlaying && currentStep === stepIdx}
                      channelColor={channel.color}
                      onClick={() => toggleStep(channel.id, stepIdx)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Add Channel Button & Quick Preset Menu ── */}
        <div className="relative mt-4">
          <button
            type="button"
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="flex items-center gap-2 rounded-xs border border-dashed border-zinc-700 bg-zinc-950/40 px-3 py-2 font-mono text-xs font-semibold text-zinc-400 hover:border-telemetry-orange hover:text-telemetry-orange transition-colors"
          >
            <Plus className="size-4" />
            <span>ADD ONE-SHOT // SYNTH PRESET</span>
          </button>

          {/* Preset Selector Dropdown */}
          {showAddMenu && (
            <div className="absolute top-10 left-0 z-40 flex w-60 flex-col rounded-sm border border-zinc-800 bg-[#0e0e14] p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.9)]">
              <span className="px-2 py-1 font-mono text-[9px] text-zinc-500 uppercase tracking-wider">
                SELECT INSTRUMENT PRESET
              </span>
              {PRESET_INSTRUMENTS.map((inst) => (
                <button
                  key={inst.name}
                  type="button"
                  onClick={() => {
                    addChannel(inst.name, inst.url, inst.color);
                    setShowAddMenu(false);
                  }}
                  className="flex items-center gap-2 rounded-xs px-2 py-1.5 text-left font-mono text-xs text-zinc-200 hover:bg-zinc-800 transition-colors"
                >
                  <div
                    className="size-2 rounded-full"
                    style={{ backgroundColor: inst.color }}
                  />
                  <span>{inst.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Floating Channel Settings Modal */}
      <ChannelSettingsModal
        channel={selectedChannel}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedChannel(null);
        }}
      />
    </div>
  );
}
