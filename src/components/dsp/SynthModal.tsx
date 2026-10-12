"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  X,
  Sliders,
  Sparkles,
  Zap,
  Activity,
  Waves,
  Crosshair,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useSynthStore,
  SYNTH_PRESETS,
} from "@/stores/synth-store";
import {
  type OscWaveform,
  type FilterMode,
  type LfoWaveform,
} from "@/lib/audio/tauri-bridge";

/* ─────────────────────────────────────────────────────────────────────────────
   TACTILE INDUSTRIAL ROTARY POT (Self-contained)
───────────────────────────────────────────────────────────────────────────── */
interface SynthKnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  unit?: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  color?: string;
  size?: "sm" | "md";
}

function SynthKnob({
  label,
  value,
  min,
  max,
  step = 1,
  defaultValue = 0,
  unit = "",
  format,
  onChange,
  color = "#a855f7",
  size = "md",
}: SynthKnobProps) {
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
    const sensitivity = e.shiftKey ? 320 : 130;
    const deltaVal = (deltaY / sensitivity) * range;
    let next = dragRef.current.startVal + deltaVal;
    if (step > 0) {
      next = Math.round(next / step) * step;
    }
    next = Math.max(min, Math.min(max, next));
    onChange(next);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      dragRef.current = null;
      setIsDragging(false);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const range = max - min;
    const stepDelta = step > 0 ? step : range * 0.02;
    const direction = e.deltaY < 0 ? 1 : -1;
    const next = Math.max(min, Math.min(max, value + direction * stepDelta));
    onChange(next);
  };

  const norm = (value - min) / (max - min || 1);
  const angle = -135 + norm * 270;
  const isSm = size === "sm";

  const display = format
    ? format(value)
    : `${step < 1 ? value.toFixed(1) : Math.round(value)}${unit}`;

  return (
    <div
      className="flex flex-col items-center gap-1 select-none cursor-ns-resize group"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      onDoubleClick={() => onChange(defaultValue)}
      title={`${label}: Drag up/down, scroll, or double-click to reset`}
    >
      <span className="font-mono text-[8px] font-bold text-zinc-400 uppercase tracking-wider group-hover:text-zinc-200 transition-colors">
        {label}
      </span>

      <div
        className={cn(
          "relative flex items-center justify-center rounded-full border border-zinc-700 bg-gradient-to-b from-[#22222a] to-[#121216] shadow-inner transition-transform",
          isSm ? "size-7" : "size-9",
          isDragging && "scale-105 border-zinc-400"
        )}
      >
        {/* Glow indicator track */}
        <svg
          className="absolute inset-0 size-full -rotate-90 pointer-events-none"
          viewBox="0 0 36 36"
        >
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="#27272a"
            strokeWidth="2.5"
            strokeDasharray="70 100"
            strokeDashoffset="-15"
          />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeDasharray={`${norm * 70} 100`}
            strokeDashoffset="-15"
            strokeLinecap="round"
          />
        </svg>

        {/* Dial pointer needle */}
        <div
          className="absolute inset-0 flex items-start justify-center pt-0.5"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          <div
            className="w-0.5 rounded-full"
            style={{
              height: isSm ? "7px" : "9px",
              backgroundColor: color,
              boxShadow: `0 0 5px ${color}`,
            }}
          />
        </div>
      </div>

      <span className="font-mono text-[8px] font-semibold text-zinc-300">
        {display}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   AHDSR ENVELOPE CANVAS VISUALIZER
───────────────────────────────────────────────────────────────────────────── */
interface AhdsrCanvasProps {
  label: string;
  attackMs: number;
  holdMs: number;
  decayMs: number;
  sustain: number;
  releaseMs: number;
  onChange: (partial: {
    attack_ms?: number;
    hold_ms?: number;
    decay_ms?: number;
    sustain_level?: number;
    release_ms?: number;
  }) => void;
  accentColor?: string;
}

function AhdsrCanvas({
  label,
  attackMs,
  holdMs,
  decayMs,
  sustain,
  releaseMs,
  onChange,
  accentColor = "#00f59b",
}: AhdsrCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDraggingRef = useRef<string | null>(null);

  // Compute normalized point positions (0..1 coordinate space)
  const totalTimeMs = Math.max(500, attackMs + holdMs + decayMs + 400 + releaseMs);
  const aNorm = attackMs / totalTimeMs;
  const hNorm = (attackMs + holdMs) / totalTimeMs;
  const dNorm = (attackMs + holdMs + decayMs) / totalTimeMs;
  const sNorm = (attackMs + holdMs + decayMs + 400) / totalTimeMs;
  const rNorm = 1.0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const padX = 12;
    const padY = 8;
    const drawW = width - padX * 2;
    const drawH = height - padY * 2;

    ctx.clearRect(0, 0, width, height);

    // Background grid lines
    ctx.strokeStyle = "#1a1a22";
    ctx.lineWidth = 1;
    for (let y = 0; y <= 4; y++) {
      const py = padY + (y / 4) * drawH;
      ctx.beginPath();
      ctx.moveTo(padX, py);
      ctx.lineTo(width - padX, py);
      ctx.stroke();
    }

    // Points
    const p0 = { x: padX, y: height - padY };
    const pA = { x: padX + aNorm * drawW, y: padY };
    const pH = { x: padX + hNorm * drawW, y: padY };
    const pD = { x: padX + dNorm * drawW, y: padY + (1 - sustain) * drawH };
    const pS = { x: padX + sNorm * drawW, y: padY + (1 - sustain) * drawH };
    const pR = { x: padX + rNorm * drawW, y: height - padY };

    // Gradient fill under envelope curve
    const grad = ctx.createLinearGradient(0, padY, 0, height - padY);
    grad.addColorStop(0, `${accentColor}33`);
    grad.addColorStop(1, "transparent");

    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(pA.x, pA.y);
    ctx.lineTo(pH.x, pH.y);
    ctx.lineTo(pD.x, pD.y);
    ctx.lineTo(pS.x, pS.y);
    ctx.lineTo(pR.x, pR.y);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Envelope outline stroke
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(pA.x, pA.y);
    ctx.lineTo(pH.x, pH.y);
    ctx.lineTo(pD.x, pD.y);
    ctx.lineTo(pS.x, pS.y);
    ctx.lineTo(pR.x, pR.y);
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw interactive handle nodes
    const handles = [
      { name: "A", pt: pA },
      { name: "H", pt: pH },
      { name: "D", pt: pD },
      { name: "S", pt: pS },
      { name: "R", pt: pR },
    ];

    for (const h of handles) {
      ctx.beginPath();
      ctx.arc(h.pt.x, h.pt.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [attackMs, holdMs, decayMs, sustain, releaseMs, aNorm, hNorm, dNorm, sNorm, rNorm, accentColor]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const normX = x / rect.width;

    if (normX < aNorm + 0.05) {
      isDraggingRef.current = "A";
    } else if (normX < hNorm + 0.05) {
      isDraggingRef.current = "H";
    } else if (normX < dNorm + 0.05) {
      isDraggingRef.current = "D";
    } else if (normX < sNorm + 0.05) {
      isDraggingRef.current = "S";
    } else {
      isDraggingRef.current = "R";
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));

    const total = 3000;
    if (isDraggingRef.current === "A") {
      onChange({ attack_ms: Math.max(1, Math.round(normX * total)) });
    } else if (isDraggingRef.current === "H") {
      onChange({ hold_ms: Math.max(0, Math.round(normX * 1000)) });
    } else if (isDraggingRef.current === "D") {
      onChange({
        decay_ms: Math.max(5, Math.round(normX * total)),
        sustain_level: Math.round(normY * 100) / 100,
      });
    } else if (isDraggingRef.current === "S") {
      onChange({ sustain_level: Math.round(normY * 100) / 100 });
    } else if (isDraggingRef.current === "R") {
      onChange({ release_ms: Math.max(5, Math.round((1 - normX) * total + 50)) });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-sm border border-zinc-800 bg-[#0a0a0f] p-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] font-bold text-zinc-300 uppercase tracking-wider">
          {label}
        </span>
        <div className="flex items-center gap-2 font-mono text-[8px] text-zinc-500">
          <span>A: {Math.round(attackMs)}ms</span>
          <span>H: {Math.round(holdMs)}ms</span>
          <span>D: {Math.round(decayMs)}ms</span>
          <span>S: {Math.round(sustain * 100)}%</span>
          <span>R: {Math.round(releaseMs)}ms</span>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={340}
        height={90}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="w-full h-[76px] rounded-[2px] bg-[#07070a] border border-zinc-900 cursor-crosshair touch-none"
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   DYNAMIC RESONANT SVF FREQUENCY RESPONSE CANVAS
───────────────────────────────────────────────────────────────────────────── */
interface FilterCurveCanvasProps {
  mode: FilterMode;
  cutoffHz: number;
  resonance: number;
  drive: number;
}

function FilterCurveCanvas({
  mode,
  cutoffHz,
  resonance,
  drive,
}: FilterCurveCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Draw logarithmic frequency grid lines (100 Hz, 1 kHz, 10 kHz)
    const logMin = Math.log10(20);
    const logMax = Math.log10(20000);
    const fMarkers = [100, 1000, 10000];

    ctx.strokeStyle = "#1a1a24";
    ctx.lineWidth = 1;
    for (const f of fMarkers) {
      const x = ((Math.log10(f) - logMin) / (logMax - logMin)) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      ctx.fillStyle = "#52525b";
      ctx.font = "8px monospace";
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x + 2, 10);
    }

    // Horizontal 0dB line
    const zeroY = height * 0.45;
    ctx.strokeStyle = "#27272a";
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(width, zeroY);
    ctx.stroke();

    // Calculate response curve points
    ctx.beginPath();
    const pointsCount = 120;
    const resPeakDb = resonance * 24.0;
    const driveDb = drive * 4.0;

    for (let i = 0; i < pointsCount; i++) {
      const normX = i / (pointsCount - 1);
      const f = Math.pow(10, logMin + normX * (logMax - logMin));
      const ratio = f / Math.max(20, cutoffHz);

      let gainDb = 0;
      switch (mode) {
        case "Lowpass12": {
          const mag = 1.0 / Math.sqrt(1 + Math.pow(ratio, 2));
          gainDb = 20 * Math.log10(mag);
          if (ratio > 0.8 && ratio < 1.3) gainDb += resPeakDb * Math.exp(-Math.pow((ratio - 1.0) / 0.25, 2));
          break;
        }
        case "Lowpass24": {
          const mag = 1.0 / (1 + Math.pow(ratio, 2));
          gainDb = 40 * Math.log10(mag);
          if (ratio > 0.8 && ratio < 1.3) gainDb += resPeakDb * Math.exp(-Math.pow((ratio - 1.0) / 0.2, 2));
          break;
        }
        case "Highpass12": {
          const mag = ratio / Math.sqrt(1 + Math.pow(ratio, 2));
          gainDb = 20 * Math.log10(Math.max(1e-4, mag));
          if (ratio > 0.8 && ratio < 1.3) gainDb += resPeakDb * Math.exp(-Math.pow((ratio - 1.0) / 0.25, 2));
          break;
        }
        case "Highpass24": {
          const mag = Math.pow(ratio, 2) / (1 + Math.pow(ratio, 2));
          gainDb = 40 * Math.log10(Math.max(1e-4, mag));
          if (ratio > 0.8 && ratio < 1.3) gainDb += resPeakDb * Math.exp(-Math.pow((ratio - 1.0) / 0.2, 2));
          break;
        }
        case "Bandpass": {
          const dist = Math.abs(Math.log2(Math.max(1e-4, ratio)));
          gainDb = -Math.min(48, dist * 18.0) + resPeakDb * Math.exp(-dist * 3.0);
          break;
        }
        case "Notch": {
          const dist = Math.abs(Math.log2(Math.max(1e-4, ratio)));
          gainDb = dist < 0.3 ? -36 * (1 - dist / 0.3) : 0;
          break;
        }
      }

      gainDb += driveDb;
      // Map dB (-40dB to +20dB) to canvas Y
      const normY = (gainDb - 20) / -60;
      const py = Math.max(2, Math.min(height - 2, normY * height));

      const px = normX * width;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }

    ctx.strokeStyle = "#38bdf8"; // Sky Blue
    ctx.lineWidth = 2;
    ctx.shadowColor = "#38bdf8";
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [mode, cutoffHz, resonance, drive]);

  return (
    <canvas
      ref={canvasRef}
      width={280}
      height={85}
      className="w-full h-[76px] rounded-[2px] bg-[#07070a] border border-zinc-900"
    />
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   8-SNAPSHOT TRANSFORM PAD (XY MORPH RADAR)
───────────────────────────────────────────────────────────────────────────── */
interface TransformPadProps {
  morphX: number;
  morphY: number;
  onMorphChange: (x: number, y: number) => void;
}

const SNAPSHOT_TARGETS = [
  { id: 0, label: "Pure Saw", x: 0.15, y: 0.15 },
  { id: 1, label: "Acid Bite", x: 0.5, y: 0.1 },
  { id: 2, label: "Sub Rez", x: 0.85, y: 0.15 },
  { id: 3, label: "Pulse PWM", x: 0.9, y: 0.5 },
  { id: 4, label: "Lush Pad", x: 0.85, y: 0.85 },
  { id: 5, label: "Pluck Bell", x: 0.5, y: 0.9 },
  { id: 6, label: "Glide Lead", x: 0.15, y: 0.85 },
  { id: 7, label: "Retro Noise", x: 0.1, y: 0.5 },
];

function TransformPad({
  morphX,
  morphY,
  onMorphChange,
}: TransformPadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Radar coordinate grid with subtle concentric rings
    ctx.strokeStyle = "#181822";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, width * 0.22, 0, Math.PI * 2);
    ctx.arc(width / 2, height / 2, width * 0.42, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshairs
    ctx.strokeStyle = "#22222e";
    ctx.beginPath();
    ctx.moveTo(width / 2, 8);
    ctx.lineTo(width / 2, height - 8);
    ctx.moveTo(8, height / 2);
    ctx.lineTo(width - 8, height / 2);
    ctx.stroke();

    // Draw snapshot targets
    for (const target of SNAPSHOT_TARGETS) {
      const tx = target.x * width;
      const ty = target.y * height;

      // Outer target ring
      ctx.beginPath();
      ctx.arc(tx, ty, 5, 0, Math.PI * 2);
      ctx.strokeStyle = "#a855f7";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Inner dot
      ctx.beginPath();
      ctx.arc(tx, ty, 2, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      // Label
      ctx.fillStyle = "#71717a";
      ctx.font = "8px monospace";
      ctx.textAlign = "center";
      ctx.fillText(target.label, tx, ty > height / 2 ? ty + 12 : ty - 8);
    }

    // Draw active reticle crosshair & beacon
    const rx = morphX * width;
    const ry = morphY * height;

    // Reticle beacon glow
    const grad = ctx.createRadialGradient(rx, ry, 0, rx, ry, 18);
    grad.addColorStop(0, "rgba(0, 245, 155, 0.45)");
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(rx, ry, 18, 0, Math.PI * 2);
    ctx.fill();

    // Reticle crosshair lines
    ctx.strokeStyle = "#00f59b";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rx - 8, ry);
    ctx.lineTo(rx + 8, ry);
    ctx.moveTo(rx, ry - 8);
    ctx.lineTo(rx, ry + 8);
    ctx.stroke();

    // Reticle circle
    ctx.beginPath();
    ctx.arc(rx, ry, 4, 0, Math.PI * 2);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [morphX, morphY]);

  const updateFromPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    onMorphChange(x, y);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    updateFromPointer(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current) return;
    updateFromPointer(e);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-sm border border-zinc-800 bg-[#0a0a0f] p-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-mono text-[9px] font-bold text-zinc-300 uppercase tracking-wider">
          <Crosshair className="size-3 text-telemetry-green" />
          <span>8-SNAPSHOT TRANSFORM PAD (XY MORPH)</span>
        </div>
        <div className="font-mono text-[8px] text-telemetry-green font-semibold">
          {`X: ${morphX.toFixed(2)} // Y: ${morphY.toFixed(2)}`}
        </div>
      </div>

      <div className="relative flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={280}
          height={180}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="w-full h-[170px] rounded-[2px] bg-[#060609] border border-zinc-900 cursor-crosshair touch-none shadow-inner"
        />
      </div>

      {/* Snapshot quick-select buttons */}
      <div className="grid grid-cols-4 gap-1">
        {SNAPSHOT_TARGETS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onMorphChange(t.x, t.y)}
            className="truncate rounded-xs border border-zinc-800 bg-zinc-900/60 px-1 py-0.5 font-mono text-[8px] text-zinc-400 hover:border-telemetry-green hover:text-telemetry-green transition-colors"
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN SYNTH MODAL DIALOG
───────────────────────────────────────────────────────────────────────────── */
export function SynthModal() {
  const isModalOpen = useSynthStore((s) => s.isModalOpen);
  const activeTrackIndex = useSynthStore((s) => s.activeTrackIndex);
  const trackParams = useSynthStore((s) => s.trackParams);
  const activeVoices = useSynthStore((s) => s.activeVoices);
  const selectedPreset = useSynthStore((s) => s.selectedPreset);

  const closeModal = useSynthStore((s) => s.closeModal);
  const updateOscA = useSynthStore((s) => s.updateOscA);
  const updateOscB = useSynthStore((s) => s.updateOscB);
  const updateFilter = useSynthStore((s) => s.updateFilter);
  const updateEnv1 = useSynthStore((s) => s.updateEnv1);
  const updateEnv2 = useSynthStore((s) => s.updateEnv2);
  const updateLfo = useSynthStore((s) => s.updateLfo);
  const setMorph = useSynthStore((s) => s.setMorph);
  const loadPreset = useSynthStore((s) => s.loadPreset);
  const triggerNote = useSynthStore((s) => s.triggerNote);
  const releaseNote = useSynthStore((s) => s.releaseNote);
  const panic = useSynthStore((s) => s.panic);
  const pollVoices = useSynthStore((s) => s.pollVoices);

  // Poll voice telemetry at 30 fps when modal is open
  useEffect(() => {
    if (!isModalOpen) return;
    const interval = setInterval(() => {
      pollVoices().catch(() => {});
    }, 33);
    return () => clearInterval(interval);
  }, [isModalOpen, pollVoices]);

  const currentParams = trackParams[activeTrackIndex];

  const handleAuditionStart = useCallback(
    (note: number) => {
      triggerNote(note, 0.85);
    },
    [triggerNote]
  );

  const handleAuditionEnd = useCallback(
    (note: number) => {
      releaseNote(note);
    },
    [releaseNote]
  );

  if (!isModalOpen || !currentParams) return null;

  const oscA = currentParams.osc_a;
  const oscB = currentParams.osc_b;
  const filter = currentParams.filter;
  const env1 = currentParams.env1;
  const env2 = currentParams.env2;
  const lfo = currentParams.lfo;

  const waveforms: OscWaveform[] = [
    "Sine",
    "Triangle",
    "Sawtooth",
    "Pulse",
    "WhiteNoise",
  ];

  const filterModes: { label: string; mode: FilterMode }[] = [
    { label: "LP 12", mode: "Lowpass12" },
    { label: "LP 24", mode: "Lowpass24" },
    { label: "HP 12", mode: "Highpass12" },
    { label: "HP 24", mode: "Highpass24" },
    { label: "BP", mode: "Bandpass" },
    { label: "NOTCH", mode: "Notch" },
  ];

  const lfoWaves: LfoWaveform[] = [
    "Sine",
    "Triangle",
    "Saw",
    "Square",
    "SampleAndHold",
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="synth-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150"
    >
      <div className="relative flex flex-col w-[1140px] max-w-[96vw] max-h-[94vh] rounded-md border border-zinc-700/80 bg-zinc-950/95 shadow-2xl backdrop-blur-2xl overflow-hidden text-zinc-200">
        {/* ── TOP HEADER: Branding, Presets, Voice Meter, Panic ── */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-[#0d0d14] px-4 py-2.5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-telemetry-green shadow-[0_0_8px_#00f59b] animate-pulse" />
              <h2
                id="synth-modal-title"
                className="font-mono text-xs font-bold tracking-wider text-zinc-100 uppercase"
              >
                ALCHEMY-LITE // MULTI-ENGINE SYNTHESIZER
              </h2>
            </div>
            <span className="rounded-xs border border-purple-500/40 bg-purple-950/30 px-1.5 py-0.5 font-mono text-[9px] font-bold text-purple-400">
              TRACK {activeTrackIndex + 1}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Preset Selector */}
            <div className="flex items-center gap-1.5 rounded-xs border border-zinc-800 bg-[#08080c] px-2 py-1">
              <Sparkles className="size-3 text-purple-400" />
              <span className="font-mono text-[9px] text-zinc-500 font-bold">PRESET:</span>
              <select
                value={selectedPreset}
                onChange={(e) => loadPreset(e.target.value)}
                className="bg-transparent font-mono text-[10px] font-bold text-zinc-200 outline-none cursor-pointer"
              >
                {Object.keys(SYNTH_PRESETS).map((p) => (
                  <option key={p} value={p} className="bg-zinc-900 text-zinc-200">
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {/* Polyphony Voice Telemetry */}
            <div className="flex items-center gap-2 rounded-xs border border-zinc-800 bg-[#08080c] px-2.5 py-1">
              <Activity className="size-3 text-telemetry-green" />
              <span className="font-mono text-[9px] text-zinc-400 font-bold">
                VOICES:
              </span>
              <span
                className={cn(
                  "font-mono text-[10px] font-bold",
                  activeVoices > 0
                    ? "text-telemetry-green shadow-[0_0_8px_#00f59b]"
                    : "text-zinc-600"
                )}
              >
                {activeVoices} / 16
              </span>
            </div>

            {/* Audition Keys */}
            <div className="flex items-center gap-1">
              {[
                { name: "C3", note: 48 },
                { name: "C4", note: 60 },
                { name: "E4", note: 64 },
                { name: "G4", note: 67 },
                { name: "C5", note: 72 },
              ].map((k) => (
                <button
                  key={k.name}
                  type="button"
                  onPointerDown={() => handleAuditionStart(k.note)}
                  onPointerUp={() => handleAuditionEnd(k.note)}
                  onPointerLeave={() => handleAuditionEnd(k.note)}
                  className="rounded-xs border border-zinc-800 bg-zinc-900/80 px-1.5 py-1 font-mono text-[9px] font-bold text-zinc-300 hover:border-zinc-600 active:bg-telemetry-green active:text-black transition-colors"
                  title={`Audition Note ${k.name}`}
                >
                  {k.name}
                </button>
              ))}
            </div>

            {/* Panic Button */}
            <button
              type="button"
              onClick={panic}
              className="flex items-center gap-1 rounded-xs border border-red-800/80 bg-red-950/40 px-2.5 py-1 font-mono text-[9px] font-bold text-red-400 hover:bg-red-900/60 active:scale-95 transition-all shadow-[0_0_6px_rgba(239,68,68,0.3)]"
              title="Panic: Kill all active notes"
            >
              <Zap className="size-3" />
              PANIC
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={closeModal}
              className="rounded-xs p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
              title="Close Synthesizer"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* ── MAIN SYNTH BODY: GRID COLUMNS ── */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
          {/* TOP ROW: OSC A & OSC B */}
          <div className="grid grid-cols-2 gap-3">
            {/* SOURCE A */}
            <div className="flex flex-col gap-2 rounded-sm border border-zinc-800/90 bg-[#0e0e13] p-3 shadow-md">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                <div className="flex items-center gap-2">
                  <Waves className="size-3.5 text-telemetry-orange" />
                  <span className="font-mono text-[10px] font-bold tracking-wider text-zinc-200 uppercase">
                    SOURCE A // OSCILLATOR
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => updateOscA({ is_enabled: !oscA.is_enabled })}
                  className={cn(
                    "rounded-xs border px-1.5 py-0.5 font-mono text-[8px] font-bold transition-all",
                    oscA.is_enabled
                      ? "border-telemetry-orange bg-telemetry-orange/20 text-telemetry-orange shadow-[0_0_6px_rgba(255,68,0,0.5)]"
                      : "border-zinc-800 bg-black/40 text-zinc-600"
                  )}
                >
                  {oscA.is_enabled ? "ON" : "OFF"}
                </button>
              </div>

              {/* Waveform Selector */}
              <div className="flex items-center gap-1 bg-[#060609] p-1 rounded-xs border border-zinc-900">
                {waveforms.map((wf) => (
                  <button
                    key={wf}
                    type="button"
                    onClick={() => updateOscA({ waveform: wf })}
                    className={cn(
                      "flex-1 py-1 text-center font-mono text-[9px] font-bold rounded-xs transition-colors",
                      oscA.waveform === wf
                        ? "bg-telemetry-orange text-black shadow-[0_0_6px_rgba(255,68,0,0.5)]"
                        : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    {wf.replace("WhiteNoise", "NOISE").toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Pots Grid */}
              <div className="grid grid-cols-5 gap-2 pt-1 border-t border-zinc-800/60">
                <SynthKnob
                  label="VOL"
                  value={oscA.volume}
                  min={0}
                  max={1}
                  step={0.01}
                  defaultValue={0.8}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => updateOscA({ volume: v })}
                  color="#ff4400"
                />
                <SynthKnob
                  label="COARSE"
                  value={oscA.coarse_tune}
                  min={-24}
                  max={24}
                  step={1}
                  defaultValue={0}
                  unit="st"
                  onChange={(v) => updateOscA({ coarse_tune: v })}
                  color="#ff4400"
                />
                <SynthKnob
                  label="FINE"
                  value={oscA.fine_tune}
                  min={-100}
                  max={100}
                  step={1}
                  defaultValue={0}
                  unit="ct"
                  onChange={(v) => updateOscA({ fine_tune: v })}
                  color="#ff4400"
                />
                <SynthKnob
                  label="PAN"
                  value={oscA.pan}
                  min={-1}
                  max={1}
                  step={0.02}
                  defaultValue={0}
                  format={(v) =>
                    v === 0 ? "C" : v < 0 ? `L${Math.round(Math.abs(v) * 100)}` : `R${Math.round(v * 100)}`
                  }
                  onChange={(v) => updateOscA({ pan: v })}
                  color="#38bdf8"
                />
                <SynthKnob
                  label="PWM"
                  value={oscA.pulse_width}
                  min={0.05}
                  max={0.95}
                  step={0.01}
                  defaultValue={0.5}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => updateOscA({ pulse_width: v })}
                  color="#ff4400"
                />
              </div>

              {/* Unison Controls */}
              <div className="flex items-center justify-between rounded-xs border border-zinc-800 bg-[#08080c] px-2.5 py-1.5 mt-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[9px] font-bold text-zinc-400">
                    UNISON:
                  </span>
                  {[1, 2, 3, 4].map((voices) => (
                    <button
                      key={voices}
                      type="button"
                      onClick={() => updateOscA({ unison_voices: voices })}
                      className={cn(
                        "size-5 rounded-xs font-mono text-[9px] font-bold border transition-colors",
                        oscA.unison_voices === voices
                          ? "border-telemetry-orange bg-telemetry-orange/20 text-telemetry-orange"
                          : "border-zinc-800 text-zinc-600 hover:text-zinc-300"
                      )}
                    >
                      {voices}x
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono text-[8px] font-bold text-zinc-500">
                    DETUNE: {Math.round(oscA.unison_detune * 100)}%
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={oscA.unison_detune}
                    onChange={(e) =>
                      updateOscA({ unison_detune: parseFloat(e.target.value) })
                    }
                    className="w-16 h-1 accent-telemetry-orange bg-zinc-800 rounded-sm cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* SOURCE B */}
            <div className="flex flex-col gap-2 rounded-sm border border-zinc-800/90 bg-[#0e0e13] p-3 shadow-md">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                <div className="flex items-center gap-2">
                  <Waves className="size-3.5 text-purple-400" />
                  <span className="font-mono text-[10px] font-bold tracking-wider text-zinc-200 uppercase">
                    SOURCE B // OSCILLATOR
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => updateOscB({ is_enabled: !oscB.is_enabled })}
                  className={cn(
                    "rounded-xs border px-1.5 py-0.5 font-mono text-[8px] font-bold transition-all",
                    oscB.is_enabled
                      ? "border-purple-500 bg-purple-950/30 text-purple-400 shadow-[0_0_6px_rgba(168,85,247,0.5)]"
                      : "border-zinc-800 bg-black/40 text-zinc-600"
                  )}
                >
                  {oscB.is_enabled ? "ON" : "OFF"}
                </button>
              </div>

              {/* Waveform Selector */}
              <div className="flex items-center gap-1 bg-[#060609] p-1 rounded-xs border border-zinc-900">
                {waveforms.map((wf) => (
                  <button
                    key={wf}
                    type="button"
                    onClick={() => updateOscB({ waveform: wf })}
                    className={cn(
                      "flex-1 py-1 text-center font-mono text-[9px] font-bold rounded-xs transition-colors",
                      oscB.waveform === wf
                        ? "bg-purple-600 text-white shadow-[0_0_6px_rgba(168,85,247,0.5)]"
                        : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    {wf.replace("WhiteNoise", "NOISE").toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Pots Grid */}
              <div className="grid grid-cols-5 gap-2 pt-1 border-t border-zinc-800/60">
                <SynthKnob
                  label="VOL"
                  value={oscB.volume}
                  min={0}
                  max={1}
                  step={0.01}
                  defaultValue={0.6}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => updateOscB({ volume: v })}
                  color="#a855f7"
                />
                <SynthKnob
                  label="COARSE"
                  value={oscB.coarse_tune}
                  min={-24}
                  max={24}
                  step={1}
                  defaultValue={0}
                  unit="st"
                  onChange={(v) => updateOscB({ coarse_tune: v })}
                  color="#a855f7"
                />
                <SynthKnob
                  label="FINE"
                  value={oscB.fine_tune}
                  min={-100}
                  max={100}
                  step={1}
                  defaultValue={7}
                  unit="ct"
                  onChange={(v) => updateOscB({ fine_tune: v })}
                  color="#a855f7"
                />
                <SynthKnob
                  label="PAN"
                  value={oscB.pan}
                  min={-1}
                  max={1}
                  step={0.02}
                  defaultValue={0}
                  format={(v) =>
                    v === 0 ? "C" : v < 0 ? `L${Math.round(Math.abs(v) * 100)}` : `R${Math.round(v * 100)}`
                  }
                  onChange={(v) => updateOscB({ pan: v })}
                  color="#38bdf8"
                />
                <SynthKnob
                  label="PWM"
                  value={oscB.pulse_width}
                  min={0.05}
                  max={0.95}
                  step={0.01}
                  defaultValue={0.35}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => updateOscB({ pulse_width: v })}
                  color="#a855f7"
                />
              </div>

              {/* Unison Controls */}
              <div className="flex items-center justify-between rounded-xs border border-zinc-800 bg-[#08080c] px-2.5 py-1.5 mt-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[9px] font-bold text-zinc-400">
                    UNISON:
                  </span>
                  {[1, 2, 3, 4].map((voices) => (
                    <button
                      key={voices}
                      type="button"
                      onClick={() => updateOscB({ unison_voices: voices })}
                      className={cn(
                        "size-5 rounded-xs font-mono text-[9px] font-bold border transition-colors",
                        oscB.unison_voices === voices
                          ? "border-purple-500 bg-purple-950/30 text-purple-400"
                          : "border-zinc-800 text-zinc-600 hover:text-zinc-300"
                      )}
                    >
                      {voices}x
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono text-[8px] font-bold text-zinc-500">
                    DETUNE: {Math.round(oscB.unison_detune * 100)}%
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={oscB.unison_detune}
                    onChange={(e) =>
                      updateOscB({ unison_detune: parseFloat(e.target.value) })
                    }
                    className="w-16 h-1 accent-purple-500 bg-zinc-800 rounded-sm cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* MIDDLE ROW: FILTER & ENVELOPES */}
          <div className="grid grid-cols-12 gap-3">
            {/* RESONANT SVF FILTER (4 cols) */}
            <div className="col-span-4 flex flex-col gap-2 rounded-sm border border-zinc-800/90 bg-[#0e0e13] p-3 shadow-md">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                <div className="flex items-center gap-2">
                  <Sliders className="size-3.5 text-sky-400" />
                  <span className="font-mono text-[10px] font-bold tracking-wider text-zinc-200 uppercase">
                    STATE-VARIABLE FILTER (SVF)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => updateFilter({ is_enabled: !filter.is_enabled })}
                  className={cn(
                    "rounded-xs border px-1.5 py-0.5 font-mono text-[8px] font-bold transition-all",
                    filter.is_enabled
                      ? "border-sky-500 bg-sky-950/30 text-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.5)]"
                      : "border-zinc-800 bg-black/40 text-zinc-600"
                  )}
                >
                  {filter.is_enabled ? "ON" : "OFF"}
                </button>
              </div>

              {/* Mode Selector */}
              <div className="grid grid-cols-6 gap-1 bg-[#060609] p-1 rounded-xs border border-zinc-900">
                {filterModes.map((fm) => (
                  <button
                    key={fm.mode}
                    type="button"
                    onClick={() => updateFilter({ mode: fm.mode })}
                    className={cn(
                      "py-1 text-center font-mono text-[8px] font-bold rounded-xs transition-colors",
                      filter.mode === fm.mode
                        ? "bg-sky-500 text-black shadow-[0_0_6px_rgba(56,189,248,0.5)]"
                        : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    {fm.label}
                  </button>
                ))}
              </div>

              {/* Dynamic Response Canvas */}
              <FilterCurveCanvas
                mode={filter.mode}
                cutoffHz={filter.cutoff_hz}
                resonance={filter.resonance}
                drive={filter.drive}
              />

              {/* Filter Knobs */}
              <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-zinc-800/60">
                <SynthKnob
                  label="CUTOFF"
                  value={filter.cutoff_hz}
                  min={20}
                  max={20000}
                  step={10}
                  defaultValue={3500}
                  format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`)}
                  onChange={(v) => updateFilter({ cutoff_hz: v })}
                  color="#38bdf8"
                />
                <SynthKnob
                  label="RESONANCE"
                  value={filter.resonance}
                  min={0}
                  max={0.98}
                  step={0.01}
                  defaultValue={0.25}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => updateFilter({ resonance: v })}
                  color="#38bdf8"
                />
                <SynthKnob
                  label="DRIVE"
                  value={filter.drive}
                  min={0}
                  max={1}
                  step={0.01}
                  defaultValue={0.15}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => updateFilter({ drive: v })}
                  color="#ff4400"
                />
                <SynthKnob
                  label="ENV MOD"
                  value={filter.env2_amount}
                  min={-1}
                  max={1}
                  step={0.02}
                  defaultValue={0.4}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => updateFilter({ env2_amount: v })}
                  color="#00f59b"
                />
              </div>
            </div>

            {/* DUAL AHDSR ENVELOPES (5 cols) */}
            <div className="col-span-5 flex flex-col gap-2 rounded-sm border border-zinc-800/90 bg-[#0e0e13] p-3 shadow-md">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                <span className="font-mono text-[10px] font-bold tracking-wider text-zinc-200 uppercase">
                  DUAL AHDSR ENVELOPE GENERATORS
                </span>
                <span className="font-mono text-[8px] text-zinc-500">
                  DRAG CANVAS HANDLES
                </span>
              </div>

              {/* ENV 1: AMPLITUDE */}
              <AhdsrCanvas
                label="ENV 1 // AMPLITUDE"
                attackMs={env1.attack_ms}
                holdMs={env1.hold_ms}
                decayMs={env1.decay_ms}
                sustain={env1.sustain_level}
                releaseMs={env1.release_ms}
                onChange={updateEnv1}
                accentColor="#00f59b"
              />

              {/* ENV 2: FILTER & MOD */}
              <AhdsrCanvas
                label="ENV 2 // FILTER & PITCH MOD"
                attackMs={env2.attack_ms}
                holdMs={env2.hold_ms}
                decayMs={env2.decay_ms}
                sustain={env2.sustain_level}
                releaseMs={env2.release_ms}
                onChange={updateEnv2}
                accentColor="#38bdf8"
              />
            </div>

            {/* TRANSFORM PAD & LFO (3 cols) */}
            <div className="col-span-3 flex flex-col gap-2">
              <TransformPad
                morphX={currentParams.morph_x}
                morphY={currentParams.morph_y}
                onMorphChange={setMorph}
              />
            </div>
          </div>

          {/* BOTTOM ROW: LFO MATRIX & GLOBAL CONTROLS */}
          <div className="flex items-center justify-between rounded-sm border border-zinc-800/90 bg-[#0e0e13] px-3.5 py-2.5 shadow-md">
            {/* LFO Section */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Activity className="size-3.5 text-telemetry-green" />
                <span className="font-mono text-[9px] font-bold text-zinc-300 uppercase tracking-wider">
                  TEMPO-SYNC LFO:
                </span>
                <button
                  type="button"
                  onClick={() => updateLfo({ is_enabled: !lfo.is_enabled })}
                  className={cn(
                    "rounded-xs border px-1.5 py-0.5 font-mono text-[8px] font-bold",
                    lfo.is_enabled
                      ? "border-telemetry-green bg-telemetry-green/20 text-telemetry-green"
                      : "border-zinc-800 text-zinc-600"
                  )}
                >
                  {lfo.is_enabled ? "ON" : "OFF"}
                </button>
              </div>

              <div className="flex items-center gap-1 bg-[#060609] p-0.5 rounded-xs border border-zinc-900">
                {lfoWaves.map((lw) => (
                  <button
                    key={lw}
                    type="button"
                    onClick={() => updateLfo({ waveform: lw })}
                    className={cn(
                      "px-1.5 py-0.5 font-mono text-[8px] font-bold rounded-xs transition-colors",
                      lfo.waveform === lw
                        ? "bg-telemetry-green text-black"
                        : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    {lw.replace("SampleAndHold", "S&H").toUpperCase()}
                  </button>
                ))}
              </div>

              {/* LFO Sync Rates */}
              <div className="flex items-center gap-1">
                <span className="font-mono text-[8px] text-zinc-500 font-bold">
                  RATE:
                </span>
                {[1, 2, 4, 8, 16, 32].map((div) => (
                  <button
                    key={div}
                    type="button"
                    onClick={() => updateLfo({ rate_sync_div: div })}
                    className={cn(
                      "rounded-xs border px-1 py-0.5 font-mono text-[8px] font-bold transition-colors",
                      lfo.rate_sync_div === div
                        ? "border-telemetry-green bg-telemetry-green/20 text-telemetry-green"
                        : "border-zinc-800 text-zinc-600 hover:text-zinc-400"
                    )}
                  >
                    1/{div}
                  </button>
                ))}
              </div>

              {/* LFO Depths */}
              <div className="flex items-center gap-3 pl-2 border-l border-zinc-800">
                <SynthKnob
                  label="FLT DEPTH"
                  value={lfo.cutoff_depth}
                  min={0}
                  max={1}
                  step={0.01}
                  defaultValue={0.15}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => updateLfo({ cutoff_depth: v })}
                  color="#00f59b"
                  size="sm"
                />
                <SynthKnob
                  label="PITCH VIB"
                  value={lfo.pitch_depth}
                  min={0}
                  max={1}
                  step={0.01}
                  defaultValue={0.0}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => updateLfo({ pitch_depth: v })}
                  color="#00f59b"
                  size="sm"
                />
                <SynthKnob
                  label="PWM MOD"
                  value={lfo.pwm_depth}
                  min={0}
                  max={1}
                  step={0.01}
                  defaultValue={0.25}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => updateLfo({ pwm_depth: v })}
                  color="#00f59b"
                  size="sm"
                />
              </div>
            </div>

            {/* Master Volume & Glide */}
            <div className="flex items-center gap-3 pl-4 border-l border-zinc-800">
              <SynthKnob
                label="MASTER VOL"
                value={currentParams.master_volume}
                min={0}
                max={1}
                step={0.01}
                defaultValue={0.8}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => useSynthStore.getState().setMasterVolume(v)}
                color="#ffffff"
                size="sm"
              />
              <SynthKnob
                label="GLIDE"
                value={currentParams.glide_time_ms}
                min={0}
                max={500}
                step={5}
                defaultValue={0}
                unit="ms"
                onChange={(v) => useSynthStore.getState().setGlideTime(v)}
                color="#a855f7"
                size="sm"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
