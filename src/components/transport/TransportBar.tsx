"use client";

import React, { useEffect, useRef } from "react";
import {
  Circle,
  Cpu,
  Pause,
  Play,
  Radio,
  Repeat,
  Square,
  Usb,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMidiStore } from "@/stores/midi-store";
import { useTransportStore } from "@/stores/transport-store";
import { MidiSettingsModal } from "@/components/midi/MidiSettingsModal";
import { BpmLedDisplay, PositionLedDisplay } from "./LedDisplay";

interface TransportButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  glowColor?: "green" | "orange" | "zinc";
  title?: string;
  ariaLabel: string;
}

/**
 * Industrial brutalist tactile button with mechanical bevel and reactive glow.
 */
function TransportButton({
  children,
  className,
  active = false,
  glowColor = "zinc",
  ariaLabel,
  ...props
}: TransportButtonProps) {
  const glowStyles = {
    green: active
      ? "bg-emerald-950/60 text-telemetry-green border-telemetry-green/80 shadow-[0_0_12px_rgba(0,245,155,0.45)]"
      : "hover:text-telemetry-green hover:border-emerald-900/60",
    orange: active
      ? "bg-orange-950/60 text-telemetry-orange border-telemetry-orange/80 shadow-[0_0_12px_rgba(255,68,0,0.5)] animate-pulse"
      : "hover:text-telemetry-orange hover:border-orange-900/60",
    zinc: active
      ? "bg-zinc-800 text-zinc-100 border-zinc-500 shadow-[0_0_8px_rgba(255,255,255,0.15)]"
      : "hover:text-zinc-100 hover:border-zinc-700",
  }[glowColor];

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={cn(
        "relative flex h-9 min-w-9 items-center justify-center rounded-sm border border-zinc-800 bg-[#0c0c10] px-3 font-mono text-xs font-semibold text-zinc-400 transition-all select-none active:translate-y-[1px]",
        "border-t-zinc-700/60 border-l-zinc-700/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_4px_rgba(0,0,0,0.6)]",
        glowStyles,
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Dedicated HTML5 Canvas Master Stereo Peak Meter.
 * Follows HybridDAW Development Protocol:
 * "Never route audio playhead positions or fast VU meters through continuous React re-renders;
 * use dedicated HTML5 Canvas elements or requestAnimationFrame."
 */
function MasterMeterCanvas({ isPlaying }: { isPlaying: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let lLevel = 0;
    let rLevel = 0;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      // Background recessed wells
      ctx.fillStyle = "#050508";
      ctx.fillRect(0, 0, width, height);

      // Target level calculation
      const targetL = isPlaying ? 0.35 + Math.random() * 0.45 : 0.0;
      const targetR = isPlaying ? 0.35 + Math.random() * 0.45 : 0.0;

      // Smooth decay / attack
      lLevel += (targetL - lLevel) * 0.25;
      rLevel += (targetR - rLevel) * 0.25;

      const barHeight = (height - 3) / 2;

      // Draw Left channel
      drawMeterChannel(ctx, 0, 0, width, barHeight, lLevel);
      // Draw Right channel
      drawMeterChannel(ctx, 0, barHeight + 3, width, barHeight, rLevel);

      animId = requestAnimationFrame(render);
    };

    function drawMeterChannel(
      c: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      level: number
    ) {
      const filledW = Math.max(0, Math.min(w, level * w));
      const segmentCount = 18;
      const segmentWidth = w / segmentCount;

      for (let i = 0; i < segmentCount; i++) {
        const segX = x + i * segmentWidth;
        const segEnd = segX + segmentWidth - 1;

        if (segEnd <= filledW) {
          // Color based on threshold: Green -> Orange -> Red
          const ratio = i / segmentCount;
          if (ratio > 0.85) {
            c.fillStyle = "#ef4444"; // Red (clip warning)
          } else if (ratio > 0.65) {
            c.fillStyle = "#ff4400"; // Safety Orange
          } else {
            c.fillStyle = "#00f59b"; // Phosphor Green
          }
        } else {
          c.fillStyle = "#141418"; // Unlit segment well
        }

        c.fillRect(segX, y, segmentWidth - 1, h);
      }
    }

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isPlaying]);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between font-mono text-[8px] text-zinc-600">
        <span>-inf</span>
        <span>-12</span>
        <span>-6</span>
        <span>0dB</span>
      </div>
      <canvas
        ref={canvasRef}
        width={100}
        height={14}
        className="rounded-xs border border-zinc-900 shadow-[inset_0_1px_2px_rgba(0,0,0,0.9)]"
      />
    </div>
  );
}

export function TransportBar() {
  const isPlaying = useTransportStore((state) => state.isPlaying);
  const isRecording = useTransportStore((state) => state.isRecording);
  const isLooping = useTransportStore((state) => state.isLooping);
  const cpuUsage = useTransportStore((state) => state.cpuUsage);
  const bufferSize = useTransportStore((state) => state.bufferSize);
  const bpm = useTransportStore((state) => state.bpm);

  const togglePlay = useTransportStore((state) => state.togglePlay);
  const toggleRecord = useTransportStore((state) => state.toggleRecord);
  const toggleLoop = useTransportStore((state) => state.toggleLoop);
  const stop = useTransportStore((state) => state.stop);
  const setPosition = useTransportStore((state) => state.setPosition);

  const setMidiModalOpen = useMidiStore((state) => state.setModalOpen);
  const connectedDeviceName = useMidiStore((state) => state.connectedDeviceName);
  const lastActivityTimestamp = useMidiStore((state) => state.lastActivityTimestamp);

  const [isMidiFlashing, setIsMidiFlashing] = React.useState(false);

  useEffect(() => {
    if (lastActivityTimestamp > 0) {
      const flashTimer = setTimeout(() => setIsMidiFlashing(true), 0);
      const resetTimer = setTimeout(() => setIsMidiFlashing(false), 120);
      return () => {
        clearTimeout(flashTimer);
        clearTimeout(resetTimer);
      };
    }
  }, [lastActivityTimestamp]);

  // Simulation loop for clock when playing in standalone UI preview mode
  useEffect(() => {
    if (!isPlaying) return;

    // Advance position by 16th note steps according to tempo
    const intervalMs = (60000 / bpm / 4);
    const timer = setInterval(() => {
      const current = useTransportStore.getState().position;
      let nextTicks = current.ticks + 240;
      let nextBeats = current.beats;
      let nextBars = current.bars;

      if (nextTicks >= 960) {
        nextTicks = 0;
        nextBeats += 1;
        if (nextBeats > 4) {
          nextBeats = 1;
          nextBars += 1;
        }
      }

      setPosition({ bars: nextBars, beats: nextBeats, ticks: nextTicks });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, bpm, setPosition]);

  return (
    <header className="flex h-14 w-full items-center justify-between border-b border-border bg-[#09090b] px-3 select-none">
      {/* ── Left: Branding & Core Transport Controls ── */}
      <div className="flex items-center gap-3">
        {/* Hardware badge */}
        <div className="flex flex-col pr-2 border-r border-zinc-800">
          <div className="font-mono text-xs font-black tracking-[0.25em] text-zinc-100 uppercase">
            HYBRID<span className="text-telemetry-orange">DAW</span>
          </div>
          <div className="flex items-center gap-1 font-mono text-[8px] tracking-wider text-zinc-500">
            <span className="size-1 rounded-full bg-telemetry-green" />
            <span>v0.1.0-ALPHA</span>
          </div>
        </div>

        {/* Tactile Transport Switchboard */}
        <div className="flex items-center gap-1">
          {/* Play Button */}
          <TransportButton
            ariaLabel="Play / Pause transport"
            active={isPlaying}
            glowColor="green"
            onClick={togglePlay}
            title={isPlaying ? "Pause (Space)" : "Play (Space)"}
          >
            {isPlaying ? (
              <Pause className="size-4 fill-current text-telemetry-green" />
            ) : (
              <Play className="size-4 fill-current" />
            )}
            <span className="ml-1.5 hidden font-mono text-[10px] tracking-widest sm:inline">
              {isPlaying ? "PAUSE" : "PLAY"}
            </span>
          </TransportButton>

          {/* Stop Button */}
          <TransportButton
            ariaLabel="Stop transport"
            glowColor="zinc"
            onClick={stop}
            title="Stop & Reset (Enter/Return)"
          >
            <Square className="size-3.5 fill-current" />
            <span className="ml-1.5 hidden font-mono text-[10px] tracking-widest sm:inline">
              STOP
            </span>
          </TransportButton>

          {/* Record Button */}
          <TransportButton
            ariaLabel="Toggle record arm"
            active={isRecording}
            glowColor="orange"
            onClick={toggleRecord}
            title="Toggle Arm / Record (R)"
          >
            <Circle className={cn("size-3.5", isRecording && "fill-current")} />
            <span className="ml-1.5 hidden font-mono text-[10px] tracking-widest sm:inline">
              REC
            </span>
          </TransportButton>

          {/* Loop Toggle */}
          <TransportButton
            ariaLabel="Toggle loop mode"
            active={isLooping}
            glowColor="zinc"
            onClick={toggleLoop}
            className={cn(isLooping && "text-telemetry-green border-telemetry-green/50")}
            title="Toggle Loop / Cycle (L)"
          >
            <Repeat className="size-3.5" />
            <span className="ml-1.5 hidden font-mono text-[10px] tracking-widest sm:inline">
              LOOP
            </span>
          </TransportButton>
        </div>
      </div>

      {/* ── Center: Technical LED Displays (Tempo & Position) ── */}
      <div className="flex items-center gap-2">
        <BpmLedDisplay />
        <PositionLedDisplay />
      </div>

      {/* ── Right: Telemetry & Master Output Block ── */}
      <div className="flex items-center gap-4">
        {/* Master Stereo Peak Meter */}
        <div className="hidden items-center gap-2 border-r border-zinc-800 pr-3 lg:flex">
          <MasterMeterCanvas isPlaying={isPlaying} />
        </div>

        {/* Minimalist Telemetry: MIDI Pill, CPU & Buffer */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* MIDI Controller Status Pill */}
          <button
            type="button"
            onClick={() => setMidiModalOpen(true)}
            className={cn(
              "flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-[9px] font-bold uppercase transition-all shadow-sm",
              connectedDeviceName
                ? isMidiFlashing
                  ? "border-telemetry-green bg-telemetry-green/30 text-telemetry-green shadow-[0_0_10px_#00f59b]"
                  : "border-zinc-700 bg-[#050507] text-telemetry-green hover:border-zinc-500"
                : isMidiFlashing
                  ? "border-telemetry-orange bg-telemetry-orange/30 text-telemetry-orange shadow-[0_0_10px_#ff4400]"
                  : "border-zinc-800 bg-[#050507] text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
            )}
            title={
              connectedDeviceName
                ? `Active MIDI Device: ${connectedDeviceName} (Click to open settings)`
                : "Configure MIDI Hardware Controller"
            }
          >
            <Usb className="size-2.5 text-current" />
            <span className="hidden sm:inline">MIDI</span>
            <span
              className={cn(
                "size-1.5 rounded-full transition-all",
                isMidiFlashing
                  ? "bg-telemetry-green shadow-[0_0_6px_#00f59b]"
                  : connectedDeviceName
                    ? "bg-telemetry-green"
                    : "bg-zinc-600"
              )}
            />
          </button>

          {/* CPU Meter */}
          <div
            className="flex flex-col rounded-sm border border-zinc-800 bg-[#050507] px-2.5 py-1"
            title={`Real-time Audio DSP Thread CPU load: ${cpuUsage.toFixed(1)}%`}
          >
            <div className="flex items-center justify-between gap-3 font-mono text-[8px] text-zinc-500 uppercase">
              <span className="flex items-center gap-1">
                <Cpu className="size-2.5 text-zinc-400" />
                DSP
              </span>
              <span className="font-bold text-zinc-300">{cpuUsage.toFixed(1)}%</span>
            </div>
            {/* Multi-segment micro gauge */}
            <div className="mt-1 flex h-1.5 w-16 gap-0.5">
              {[0.2, 0.4, 0.6, 0.8, 1.0].map((step, idx) => {
                const isLit = cpuUsage / 100 >= step - 0.15;
                const isHot = idx >= 3;
                return (
                  <div
                    key={step}
                    className={cn(
                      "flex-1 rounded-[1px] transition-colors",
                      isLit
                        ? isHot
                          ? "bg-telemetry-orange shadow-[0_0_4px_rgba(255,68,0,0.8)]"
                          : "bg-telemetry-green shadow-[0_0_4px_rgba(0,245,155,0.8)]"
                        : "bg-zinc-800/80"
                    )}
                  />
                );
              })}
            </div>
          </div>

          {/* Audio Buffer & Engine Status */}
          <div
            className="hidden flex-col rounded-sm border border-zinc-800 bg-[#050507] px-2.5 py-1 sm:flex"
            title="Audio Hardware Buffer Configuration (WASAPI Exclusive)"
          >
            <div className="flex items-center justify-between gap-3 font-mono text-[8px] text-zinc-500 uppercase">
              <span className="flex items-center gap-1">
                <Radio className="size-2.5 text-telemetry-green" />
                BUFFER
              </span>
              <span className="font-bold text-zinc-300">{bufferSize} SMP</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between font-mono text-[8px] text-zinc-600">
              <span>5.8ms</span>
              <span className="text-telemetry-green">44.1k</span>
            </div>
          </div>
        </div>
      </div>

      {/* Hardware MIDI Settings Modal */}
      <MidiSettingsModal />
    </header>
  );
}
