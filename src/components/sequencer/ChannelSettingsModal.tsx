"use client";

import React, { useRef, useState } from "react";
import {
  FolderOpen,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { loadSample, pickAudioFile } from "@/lib/audio/tauri-bridge";
import { type Channel, usePatternStore } from "@/stores/pattern-store";
import { useSynthStore } from "@/stores/synth-store";

interface RotaryKnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  unit?: string;
  formatValue?: (val: number) => string;
  onChange: (val: number) => void;
  color?: string;
}

/**
 * Tactile industrial rotary knob with vertical pointer-drag scrubbing
 * and double-click to reset.
 */
export function RotaryKnob({
  label,
  value,
  min,
  max,
  step = 1,
  defaultValue = 0,
  unit = "",
  formatValue,
  onChange,
  color = "#ff4400",
}: RotaryKnobProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startY: number; startVal: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startVal: value };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const deltaY = dragRef.current.startY - e.clientY;
    const range = max - min;
    const sensitivity = e.shiftKey ? 300 : 120;
    const deltaVal = (deltaY / sensitivity) * range;
    let nextVal = dragRef.current.startVal + deltaVal;

    if (step > 0) {
      nextVal = Math.round(nextVal / step) * step;
    }
    nextVal = Math.max(min, Math.min(max, nextVal));
    onChange(nextVal);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // pointer capture already lost
      }
      dragRef.current = null;
      setIsDragging(false);
    }
  };

  // Convert value to -135deg to +135deg dial rotation angle
  const normalized = (value - min) / (max - min || 1);
  const angle = -135 + normalized * 270;

  const displayString = formatValue
    ? formatValue(value)
    : `${step < 1 ? value.toFixed(1) : Math.round(value)}${unit}`;

  return (
    <div
      className="flex flex-col items-center gap-1 select-none cursor-ns-resize"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={() => onChange(defaultValue)}
      title={`${label}: Drag up/down to adjust (Shift for precision, 2x-click reset)`}
    >
      <span className="font-mono text-[9px] font-semibold text-zinc-400 uppercase tracking-wider">
        {label}
      </span>

      {/* Hardware Knob Dial Bezel */}
      <div
        className={cn(
          "relative flex size-10 items-center justify-center rounded-full border border-zinc-700 bg-gradient-to-b from-[#2a2a32] to-[#121216] shadow-[0_2px_5px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.15)] transition-all",
          isDragging && "ring-2 ring-telemetry-orange shadow-[0_0_12px_rgba(255,68,0,0.4)]"
        )}
      >
        {/* Outer radial tick ring */}
        <div className="absolute inset-0.5 rounded-full border border-black/60" />

        {/* Rotating Dial Top with indicator needle */}
        <div
          className="relative size-7 rounded-full bg-[#18181e] shadow-[inset_0_1px_2px_rgba(0,0,0,0.9)]"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          {/* Neon needle marker */}
          <div
            className="absolute top-0.5 left-1/2 h-2.5 w-0.5 -translate-x-1/2 rounded-full shadow-[0_0_4px_currentColor]"
            style={{ backgroundColor: color, color }}
          />
        </div>
      </div>

      {/* Numeric Readout Badge */}
      <span
        className={cn(
          "font-mono text-[10px] tabular-nums font-bold transition-colors",
          isDragging ? "text-telemetry-orange" : "text-zinc-300"
        )}
      >
        {displayString}
      </span>
    </div>
  );
}

interface ChannelSettingsModalProps {
  channel: Channel | null;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Selective Glassmorphism inspector pane for channel tuning, time-shift, and fine DSP routing.
 * Follows HybridDAW Development Protocol:
 * "Glassmorphism: Reserved strictly for floating inspector panes, popovers,
 * and slide-out routing matrices (backdrop-blur-xl bg-zinc-950/80 border border-white/10)."
 */
function ChannelSettingsModalContent({
  channel,
  onClose,
}: {
  channel: Channel;
  onClose: () => void;
}) {
  const setChannelPitch = usePatternStore((state) => state.setChannelPitch);
  const setChannelTimeShift = usePatternStore((state) => state.setChannelTimeShift);
  const setChannelPan = usePatternStore((state) => state.setChannelPan);
  const setChannelVolume = usePatternStore((state) => state.setChannelVolume);
  const setChannelName = usePatternStore((state) => state.setChannelName);
  const removeChannel = usePatternStore((state) => state.removeChannel);
  const setChannelIsSynth = usePatternStore((state) => state.setChannelIsSynth);
  const channels = usePatternStore((state) => state.channels);

  const [nameInput, setNameInput] = useState(channel.name);

  return (
    <div
      className="relative w-96 rounded-sm border border-white/10 bg-zinc-950/85 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.9)] backdrop-blur-xl"
      onClick={(e) => e.stopPropagation()}
    >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <div
              className="size-3 rounded-full shadow-[0_0_6px_currentColor]"
              style={{ backgroundColor: channel.color, color: channel.color }}
            />
            <div className="flex flex-col">
              <span className="font-mono text-[9px] tracking-widest text-zinc-500 uppercase">
                CHANNEL SETTINGS // DSP
              </span>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => {
                  setNameInput(e.target.value);
                  setChannelName(channel.id, e.target.value);
                }}
                className="bg-transparent font-mono text-sm font-bold text-zinc-100 outline-none border-b border-transparent focus:border-telemetry-orange"
                title="Click to rename channel"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex size-6 items-center justify-center rounded-xs border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-100"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* Preset / Sample Source Path & Generator Mode */}
        <div className="mt-3 flex items-center justify-between rounded-xs border border-zinc-900 bg-black/50 px-2.5 py-1.5 font-mono text-[10px]">
          <span className="text-zinc-500">GENERATOR:</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setChannelIsSynth(channel.id, !channel.isSynth)}
              className={cn(
                "rounded-xs border px-1.5 py-0.5 font-bold transition-all",
                channel.isSynth
                  ? "border-purple-500 bg-purple-950/40 text-purple-400 shadow-[0_0_6px_rgba(168,85,247,0.4)]"
                  : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200"
              )}
            >
              {channel.isSynth ? "ALCHEMY SYNTH" : "SAMPLE / PCM"}
            </button>
            {channel.isSynth && (
              <button
                type="button"
                onClick={() => {
                  const trackIdx = channels.findIndex((c) => c.id === channel.id);
                  useSynthStore.getState().openModal(trackIdx >= 0 ? trackIdx : 0, channel.id);
                  onClose();
                }}
                className="flex items-center gap-1 rounded-xs border border-purple-500/80 bg-purple-900/40 px-2 py-0.5 text-purple-300 hover:bg-purple-800/50 transition-colors"
                title="Launch Alchemy-Lite Synthesizer Modal"
              >
                <Sparkles className="size-3" />
                <span>EDIT</span>
              </button>
            )}
          </div>
        </div>

        {/* 4-Knob Hardware Rack for Tuning & Mix */}
        <div className="mt-4 grid grid-cols-4 gap-2 rounded-sm border border-zinc-800/80 bg-[#09090d]/90 p-3">
          {/* Pitch Tuning Knob */}
          <RotaryKnob
            label="PITCH"
            value={channel.pitchOffset}
            min={-24}
            max={24}
            step={1}
            defaultValue={0}
            formatValue={(v) => (v > 0 ? `+${v} st` : `${v} st`)}
            onChange={(v) => setChannelPitch(channel.id, v)}
            color="#ff4400"
          />

          {/* Time Shift Offset Knob */}
          <RotaryKnob
            label="SHIFT"
            value={channel.timeShift}
            min={0}
            max={100}
            step={1}
            defaultValue={0}
            unit="ms"
            onChange={(v) => setChannelTimeShift(channel.id, v)}
            color="#00f59b"
          />

          {/* Pan Knob */}
          <RotaryKnob
            label="PAN"
            value={channel.pan}
            min={-1}
            max={1}
            step={0.05}
            defaultValue={0}
            formatValue={(v) => {
              if (Math.abs(v) < 0.05) return "C";
              return v < 0 ? `L${Math.round(Math.abs(v) * 100)}` : `R${Math.round(v * 100)}`;
            }}
            onChange={(v) => setChannelPan(channel.id, v)}
            color="#38bdf8"
          />

          {/* Volume Knob */}
          <RotaryKnob
            label="VOL"
            value={channel.volume}
            min={0}
            max={1}
            step={0.02}
            defaultValue={0.8}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => setChannelVolume(channel.id, v)}
            color="#00f59b"
          />
        </div>

        {/* Secondary Routing Options */}
        <div className="mt-4 flex flex-col gap-2 font-mono text-xs">
          <div className="flex items-center justify-between text-[10px] text-zinc-400">
            <span>RESAMPLING ENGINE:</span>
            <span className="text-zinc-200">SINC 64-POINT</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-zinc-400">
            <span>VELOCITY DYNAMICS:</span>
            <span className="text-zinc-200">EXPONENTIAL [127 MAX]</span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-5 flex items-center justify-between border-t border-zinc-800/80 pt-3">
          <button
            type="button"
            onClick={() => {
              removeChannel(channel.id);
              onClose();
            }}
            className="flex items-center gap-1.5 rounded-xs border border-red-950 bg-red-950/30 px-2.5 py-1 font-mono text-[10px] text-red-400 hover:border-red-800 hover:bg-red-950/60 transition-colors"
          >
            <Trash2 className="size-3" />
            <span>DELETE TRACK</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              try {
                const selectedPath = await pickAudioFile();
                if (!selectedPath) return;
                const meta = await loadSample(selectedPath);
                await usePatternStore.getState().assignSampleToChannel(
                  channel.id,
                  meta.id,
                  meta.file_path,
                  meta.name,
                  meta.waveform_peaks
                );
                setNameInput(meta.name);
              } catch (err) {
                console.warn("[ChannelSettingsModal] Load sample failed:", err);
              }
            }}
            className="flex items-center gap-1.5 rounded-xs border border-zinc-700 bg-zinc-900 px-2.5 py-1 font-mono text-[10px] text-zinc-300 hover:border-telemetry-orange hover:text-telemetry-orange transition-colors"
            title="Choose sample from disk"
          >
            <FolderOpen className="size-3 text-telemetry-orange" />
            <span>LOAD SAMPLE...</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xs border border-zinc-700 bg-zinc-800 px-3 py-1 font-mono text-[10px] font-bold text-zinc-100 hover:bg-zinc-700"
          >
            DONE
          </button>
        </div>
      </div>
  );
}

export function ChannelSettingsModal({
  channel,
  isOpen,
  onClose,
}: ChannelSettingsModalProps) {
  if (!isOpen || !channel) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs select-none"
      onClick={onClose}
    >
      <ChannelSettingsModalContent
        key={channel.id}
        channel={channel}
        onClose={onClose}
      />
    </div>
  );
}
