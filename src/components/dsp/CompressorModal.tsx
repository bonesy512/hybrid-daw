"use client";

import React, { useEffect, useRef, useState } from "react";
import { Activity, Gauge, Power, Volume2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type CompressorCircuit,
  type CompressorParams,
  getCompressorReduction,
  setCompressorParams,
} from "@/lib/audio/tauri-bridge";
import { useMixerStore } from "@/stores/mixer-store";

interface HardwareKnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  unit: string;
  step?: number;
  formatValue?: (val: number) => string;
  onChange: (val: number) => void;
  accentColor?: string;
  scale?: "linear" | "log";
}

function HardwareKnob({
  label,
  value,
  min,
  max,
  defaultValue,
  unit,
  step = 0.1,
  formatValue,
  onChange,
  accentColor = "#ff4400",
  scale = "linear",
}: HardwareKnobProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startY: number; startVal: number } | null>(null);

  const valueToNorm = (val: number): number => {
    if (scale === "log") {
      const minLog = Math.log(Math.max(0.001, min));
      const maxLog = Math.log(Math.max(0.001, max));
      return (Math.log(Math.max(0.001, val)) - minLog) / (maxLog - minLog);
    }
    return (val - min) / (max - min);
  };

  const normToValue = (norm: number): number => {
    const clamped = Math.max(0, Math.min(1, norm));
    if (scale === "log") {
      const minLog = Math.log(Math.max(0.001, min));
      const maxLog = Math.log(Math.max(0.001, max));
      return Math.exp(minLog + clamped * (maxLog - minLog));
    }
    return min + clamped * (max - min);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startVal: value };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const deltaY = dragRef.current.startY - e.clientY;
    const sensitivity = e.shiftKey ? 600 : 150;
    const currentNorm = valueToNorm(dragRef.current.startVal);
    const nextNorm = currentNorm + deltaY / sensitivity;
    const rawVal = normToValue(nextNorm);

    // Round according to step
    const precision = step < 1 ? Math.round(-Math.log10(step)) : 0;
    const rounded = Number(
      (Math.round(rawVal / step) * step).toFixed(Math.max(0, precision))
    );
    const finalVal = Math.max(min, Math.min(max, rounded));
    onChange(finalVal);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // pointer capture released
      }
      dragRef.current = null;
      setIsDragging(false);
    }
  };

  const norm = valueToNorm(value);
  const angle = -140 + norm * 280;
  const display = formatValue
    ? formatValue(value)
    : `${value > 0 ? `+${value}` : value}${unit}`;

  return (
    <div
      className="flex flex-col items-center gap-1 select-none cursor-ns-resize group"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={() => onChange(defaultValue)}
      title={`${label}: Drag to adjust, Shift for fine-tuning, Double-click to reset (${defaultValue}${unit})`}
    >
      <span className="font-mono text-[9px] font-black tracking-wider text-zinc-400 uppercase group-hover:text-zinc-200 transition-colors">
        {label}
      </span>

      {/* Tactile Outer Bezel */}
      <div
        className={cn(
          "relative flex size-12 items-center justify-center rounded-full border-2 border-zinc-700 bg-gradient-to-b from-[#222228] to-[#121216] shadow-[0_3px_8px_rgba(0,0,0,0.85),inset_0_1px_1px_rgba(255,255,255,0.15)] transition-all",
          isDragging && "ring-1 ring-telemetry-orange shadow-[0_0_12px_rgba(255,68,0,0.5)] border-zinc-500"
        )}
      >
        {/* Metal Cap Face */}
        <div
          className="relative size-8 rounded-full bg-gradient-to-tr from-[#16161b] via-[#2a2a34] to-[#121216] shadow-inner"
          style={{ transform: `rotate(${angle}deg)` }}
        >
          {/* Notch / Pointer Indicator */}
          <div
            className="absolute top-1 left-1/2 h-2.5 w-[2px] -translate-x-1/2 rounded-full shadow-[0_0_4px_currentColor]"
            style={{ backgroundColor: accentColor, color: accentColor }}
          />
        </div>
      </div>

      {/* Numeric Readout Badge */}
      <span className="rounded-xs border border-zinc-800/80 bg-black/60 px-1 py-0.5 font-mono text-[9px] font-bold text-zinc-300 tabular-nums">
        {display}
      </span>
    </div>
  );
}

// Mode 1: Analog Galvanometer VU Meter
function drawAnalogNeedleVu(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  grDb: number
) {
  // Vintage textured meter plate background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, "#18181f");
  bgGrad.addColorStop(0.6, "#141418");
  bgGrad.addColorStop(1, "#0a0a0d");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // Warm vintage amber backlight glow
  const glowGrad = ctx.createRadialGradient(w / 2, h + 20, 10, w / 2, h * 0.4, w * 0.6);
  glowGrad.addColorStop(0, "rgba(255, 120, 0, 0.18)");
  glowGrad.addColorStop(0.6, "rgba(255, 100, 0, 0.05)");
  glowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, w, h);

  // Dial pivot & arc geometry
  const pivotX = w / 2;
  const pivotY = h + 45;
  const radius = h * 0.95;

  // Scale markings: 0 dB is on the far RIGHT, gain reduction swings LEFT into -30 dB
  const minAngle = -Math.PI * 0.26; // 0 dB
  const maxAngle = Math.PI * 0.26;  // 30 dB

  // Draw main scale arc
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#3f3f46";
  ctx.beginPath();
  ctx.arc(pivotX, pivotY, radius, -Math.PI * 0.5 - maxAngle, -Math.PI * 0.5 - minAngle, false);
  ctx.stroke();

  // Heavy compression warning zone (> 12 dB reduction)
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255, 68, 0, 0.8)";
  ctx.beginPath();
  const warnNorm = 12 / 30;
  const warnAngle = minAngle + warnNorm * (maxAngle - minAngle);
  ctx.arc(pivotX, pivotY, radius, -Math.PI * 0.5 - maxAngle, -Math.PI * 0.5 - warnAngle, false);
  ctx.stroke();

  // Tick marks
  const ticks = [0, 1, 2, 3, 4, 6, 8, 10, 15, 20, 30];
  ctx.fillStyle = "#a1a1aa";
  ctx.font = "bold 9px monospace";
  ctx.textAlign = "center";

  for (const val of ticks) {
    const norm = val / 30;
    const ang = -Math.PI * 0.5 + (minAngle + norm * (maxAngle - minAngle));

    const tickStart = radius - 4;
    const isMajor = [0, 4, 8, 12, 20, 30].includes(val);
    const tickEnd = isMajor ? radius - 14 : radius - 9;

    const x1 = pivotX + Math.sin(ang) * tickStart;
    const y1 = pivotY - Math.cos(ang) * tickStart;
    const x2 = pivotX + Math.sin(ang) * tickEnd;
    const y2 = pivotY - Math.cos(ang) * tickEnd;

    ctx.lineWidth = isMajor ? 2 : 1;
    ctx.strokeStyle = val >= 12 ? "#ff4400" : "#71717a";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    if (isMajor) {
      const textDist = radius - 24;
      const tx = pivotX + Math.sin(ang) * textDist;
      const ty = pivotY - Math.cos(ang) * textDist;
      ctx.fillStyle = val >= 12 ? "#ff6622" : "#9ca3af";
      ctx.fillText(`${val}`, tx, ty + 3);
    }
  }

  // Header label on meter face
  ctx.fillStyle = "#52525b";
  ctx.font = "black 10px monospace";
  ctx.fillText("GAIN REDUCTION [dB]", pivotX, h * 0.35);

  // Calculate dynamic needle position based on polled reduction dB
  const clampedGr = Math.max(0, Math.min(30, grDb));
  const grNorm = clampedGr / 30;
  const needleAngle = -Math.PI * 0.5 + (minAngle + grNorm * (maxAngle - minAngle));

  const needleLen = radius - 2;
  const nx = pivotX + Math.sin(needleAngle) * needleLen;
  const ny = pivotY - Math.cos(needleAngle) * needleLen;

  // Needle drop shadow
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
  ctx.beginPath();
  ctx.moveTo(pivotX + 2, pivotY + 2);
  ctx.lineTo(nx + 2, ny + 2);
  ctx.stroke();

  // Safety Orange Galvanometer Needle
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#ff4400";
  ctx.beginPath();
  ctx.moveTo(pivotX, pivotY);
  ctx.lineTo(nx, ny);
  ctx.stroke();

  // Pivot cap bezel
  ctx.fillStyle = "#1e1e24";
  ctx.beginPath();
  ctx.arc(pivotX, pivotY, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#52525b";
  ctx.stroke();

  ctx.fillStyle = "#ff4400";
  ctx.beginPath();
  ctx.arc(pivotX, pivotY, 4, 0, Math.PI * 2);
  ctx.fill();

  // Digital LED Readout badge at bottom
  ctx.fillStyle = "#0a0a0e";
  ctx.fillRect(w / 2 - 50, h - 22, 100, 16);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#27272a";
  ctx.strokeRect(w / 2 - 50, h - 22, 100, 16);

  ctx.fillStyle = grDb > 0.1 ? "#ff4400" : "#52525b";
  ctx.font = "bold 10px monospace";
  ctx.textAlign = "center";
  ctx.fillText(`GR: -${grDb.toFixed(1)} dB`, w / 2, h - 10);
}

// Mode 2: Scrolling History & Static Transfer Function Curve
function drawTransferGraph(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  history: Float32Array,
  histIdx: number,
  threshold: number,
  ratio: number,
  knee: number,
  currentGr: number
) {
  // Dark grid background
  ctx.fillStyle = "#0c0c10";
  ctx.fillRect(0, 0, w, h);

  const splitX = w * 0.68;

  // Draw grid lines
  ctx.strokeStyle = "#1f1f28";
  ctx.lineWidth = 1;

  // Horizontal dB grid lines
  for (let db = 0; db <= 30; db += 6) {
    const y = (db / 30) * (h - 20) + 10;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();

    ctx.fillStyle = "#3f3f46";
    ctx.font = "8px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`-${db}dB`, 4, y - 2);
  }

  // ── LEFT PANE: Scrolling Gain Reduction History Envelope ──
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, splitX, h);
  ctx.clip();

  ctx.fillStyle = "#52525b";
  ctx.font = "bold 9px monospace";
  ctx.fillText("GAIN REDUCTION HISTORY (ROLLING 60FPS)", 32, 14);

  // Draw filled reduction area
  ctx.beginPath();
  ctx.moveTo(0, 10);
  const count = history.length;
  for (let i = 0; i < count; i++) {
    const idx = (histIdx + i) % count;
    const x = (i / (count - 1)) * splitX;
    const val = history[idx];
    const y = 10 + (val / 30) * (h - 25);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(splitX, 10);
  ctx.closePath();

  const areaGrad = ctx.createLinearGradient(0, 10, 0, h);
  areaGrad.addColorStop(0, "rgba(255, 68, 0, 0.45)");
  areaGrad.addColorStop(1, "rgba(255, 68, 0, 0.02)");
  ctx.fillStyle = areaGrad;
  ctx.fill();

  // History curve stroke line
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const idx = (histIdx + i) % count;
    const x = (i / (count - 1)) * splitX;
    const val = history[idx];
    const y = 10 + (val / 30) * (h - 25);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = "#ff4400";
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.restore();

  // ── DIVIDER LINE ──
  ctx.strokeStyle = "#27272a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(splitX, 0);
  ctx.lineTo(splitX, h);
  ctx.stroke();

  // ── RIGHT PANE: Static Input vs Output Transfer Curve ──
  const tfPad = 12;
  const tfW = w - splitX - tfPad * 2;
  const tfH = h - tfPad * 2;

  ctx.fillStyle = "#52525b";
  ctx.font = "bold 9px monospace";
  ctx.textAlign = "center";
  ctx.fillText("TRANSFER CURVE", splitX + tfW / 2 + tfPad, 14);

  // 1:1 Unity Gain Reference Diagonal Line (grey dashed)
  ctx.setLineDash([2, 3]);
  ctx.strokeStyle = "#3f3f46";
  ctx.beginPath();
  ctx.moveTo(splitX + tfPad, h - tfPad);
  ctx.lineTo(splitX + tfPad + tfW, tfPad + 10);
  ctx.stroke();
  ctx.setLineDash([]);

  // Transfer curve function: In dB domain from -60 dB to 0 dB
  ctx.beginPath();
  const kneeWidth = knee * 12.0;

  for (let i = 0; i <= tfW; i++) {
    const inNorm = i / tfW;
    const inDb = -60 + inNorm * 60; // -60 dB to 0 dB

    let outDb = inDb;
    const halfKnee = kneeWidth * 0.5;
    const delta = inDb - threshold;

    if (kneeWidth < 0.01) {
      if (inDb > threshold) {
        outDb = threshold + (inDb - threshold) / ratio;
      }
    } else {
      if (delta <= -halfKnee) {
        outDb = inDb;
      } else if (delta >= halfKnee) {
        outDb = threshold + (inDb - threshold) / ratio;
      } else {
        const x = delta + halfKnee;
        outDb = inDb + (((1.0 / ratio) - 1.0) * (x * x)) / (2.0 * kneeWidth);
      }
    }

    const outNorm = (outDb + 60) / 60;
    const px = splitX + tfPad + inNorm * tfW;
    const py = (h - tfPad) - outNorm * tfH;

    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }

  ctx.strokeStyle = "#00f59b"; // Phosphor Green transfer curve
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw active operating point indicator (bouncing dot)
  const activeInDb = Math.max(-60, Math.min(0, threshold + currentGr));
  const activeInNorm = (activeInDb + 60) / 60;
  const activeOutDb = activeInDb - currentGr;
  const activeOutNorm = (activeOutDb + 60) / 60;

  const dotX = splitX + tfPad + activeInNorm * tfW;
  const dotY = (h - tfPad) - activeOutNorm * tfH;

  ctx.fillStyle = "#ff4400";
  ctx.beginPath();
  ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.stroke();
}

const CIRCUITS: { id: CompressorCircuit; name: string; desc: string }[] = [
  {
    id: "Platinum",
    name: "PLATINUM",
    desc: "Clean Digital Feed-Forward Peak Detection",
  },
  {
    id: "VintageVca",
    name: "VINTAGE VCA",
    desc: "Console Bus Glue with Feedback Detection",
  },
  {
    id: "VintageFet",
    name: "VINTAGE FET",
    desc: "1176-Style Ultra-Fast Limiting with Harmonic Bite",
  },
  {
    id: "VintageOpto",
    name: "VINTAGE OPTO",
    desc: "LA-2A Dual-Stage Release with Photocell Lag",
  },
];

export function CompressorModal() {
  const modalState = useMixerStore((state) => state.compressorModal);
  const closeModal = useMixerStore((state) => state.closeCompressorModal);
  const tracks = useMixerStore((state) => state.tracks);
  const updateInsertParams = useMixerStore((state) => state.updateInsertParams);

  const [viewMode, setViewMode] = useState<"needle" | "graph">("needle");

  // Canvas visualizer refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Ballistics state for smooth needle animation (independent of React state)
  const ballisticsRef = useRef({
    currentReductionDb: 0,
    smoothedReductionDb: 0,
    history: new Float32Array(160),
    historyIdx: 0,
  });

  const currentTrack = tracks.find((t) => t.id === modalState.trackId);
  const currentInsert = currentTrack?.inserts.find(
    (ins) => ins.id === modalState.insertId
  );

  // Parse typed params with robust fallbacks
  const circuit: CompressorCircuit =
    (currentInsert?.params?.circuit as CompressorCircuit) || "VintageVca";
  const threshold_db =
    typeof currentInsert?.params?.threshold_db === "number"
      ? currentInsert.params.threshold_db
      : -18.0;
  const ratio =
    typeof currentInsert?.params?.ratio === "number"
      ? currentInsert.params.ratio
      : 4.0;
  const attack_ms =
    typeof currentInsert?.params?.attack_ms === "number"
      ? currentInsert.params.attack_ms
      : 15.0;
  const release_ms =
    typeof currentInsert?.params?.release_ms === "number"
      ? currentInsert.params.release_ms
      : 150.0;
  const knee =
    typeof currentInsert?.params?.knee === "number"
      ? currentInsert.params.knee
      : 0.5;
  const makeup_gain_db =
    typeof currentInsert?.params?.makeup_gain_db === "number"
      ? currentInsert.params.makeup_gain_db
      : 0.0;
  const sidechain_lowcut_hz =
    typeof currentInsert?.params?.sidechain_lowcut_hz === "number"
      ? currentInsert.params.sidechain_lowcut_hz
      : 80.0;
  const is_enabled = currentInsert?.params?.is_enabled !== false;
  const listen_sidechain = Boolean(currentInsert?.params?.listen_sidechain);

  const params: CompressorParams = {
    circuit,
    threshold_db,
    ratio,
    attack_ms,
    release_ms,
    knee,
    makeup_gain_db,
    sidechain_lowcut_hz,
    is_enabled,
    listen_sidechain,
  };

  // 60fps Native HTML5 Canvas Renderer (Zero React Re-renders)
  useEffect(() => {
    if (!modalState.isOpen || !modalState.trackId) {
      return;
    }

    let isCancelled = false;

    const renderLoop = async () => {
      if (isCancelled) return;

      // 1. Poll reduction level from Rust lock-free atomic meter
      const reductionDb = await getCompressorReduction(modalState.trackIndex);
      const b = ballisticsRef.current;
      b.currentReductionDb = reductionDb;

      // Smooth ballistics with simulated galvanometer damping & spring response
      const attackSpeed = 0.28;
      const releaseSpeed = 0.08;
      const speed = reductionDb > b.smoothedReductionDb ? attackSpeed : releaseSpeed;
      b.smoothedReductionDb += (reductionDb - b.smoothedReductionDb) * speed;

      // Append to rolling history
      b.history[b.historyIdx] = b.smoothedReductionDb;
      b.historyIdx = (b.historyIdx + 1) % b.history.length;

      // 2. Draw canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;

          ctx.clearRect(0, 0, w, h);

          if (viewMode === "needle") {
            drawAnalogNeedleVu(ctx, w, h, b.smoothedReductionDb);
          } else {
            drawTransferGraph(
              ctx,
              w,
              h,
              b.history,
              b.historyIdx,
              threshold_db,
              ratio,
              knee,
              b.smoothedReductionDb
            );
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      isCancelled = true;
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [
    modalState.isOpen,
    modalState.trackId,
    modalState.trackIndex,
    viewMode,
    threshold_db,
    ratio,
    knee,
  ]);

  if (!modalState.isOpen || !modalState.trackId || !modalState.insertId || !currentTrack || !currentInsert) {
    return null;
  }

  const handleUpdate = (partial: Partial<CompressorParams>) => {
    if (!modalState.trackId || !modalState.insertId) return;
    const next: CompressorParams = { ...params, ...partial };

    updateInsertParams(
      modalState.trackId,
      modalState.insertId,
      next as unknown as Record<string, number | string | boolean>
    );
    setCompressorParams(modalState.trackIndex, next);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-150"
      onClick={closeModal}
    >
      {/* ── CHASSIS MAIN CONTAINER ── */}
      <div
        className="relative flex w-full max-w-2xl flex-col rounded-sm border border-zinc-700/80 bg-zinc-950/95 shadow-[0_25px_60px_rgba(0,0,0,0.9),0_0_1px_rgba(255,255,255,0.2)] backdrop-blur-2xl font-mono select-none overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Chassis Corner Screws */}
        <div className="absolute top-2 left-2 size-2 rounded-full border border-zinc-600 bg-zinc-800 shadow-inner flex items-center justify-center">
          <div className="h-1.5 w-[1px] bg-zinc-500 rotate-45" />
        </div>
        <div className="absolute top-2 right-2 size-2 rounded-full border border-zinc-600 bg-zinc-800 shadow-inner flex items-center justify-center">
          <div className="h-1.5 w-[1px] bg-zinc-500 -rotate-45" />
        </div>
        <div className="absolute bottom-2 left-2 size-2 rounded-full border border-zinc-600 bg-zinc-800 shadow-inner flex items-center justify-center">
          <div className="h-1.5 w-[1px] bg-zinc-500 -rotate-12" />
        </div>
        <div className="absolute bottom-2 right-2 size-2 rounded-full border border-zinc-600 bg-zinc-800 shadow-inner flex items-center justify-center">
          <div className="h-1.5 w-[1px] bg-zinc-500 rotate-60" />
        </div>

        {/* ── TOP HEADER / CHASSIS BADGE ── */}
        <div className="flex h-11 items-center justify-between border-b border-zinc-800 bg-gradient-to-r from-[#141419] via-[#1a1a24] to-[#141419] px-6">
          <div className="flex items-center gap-3">
            {/* Power Toggle */}
            <button
              type="button"
              onClick={() => handleUpdate({ is_enabled: !params.is_enabled })}
              className={cn(
                "flex size-6 items-center justify-center rounded-xs border transition-all",
                params.is_enabled
                  ? "border-telemetry-green bg-green-950/80 text-telemetry-green shadow-[0_0_8px_rgba(0,245,155,0.7)]"
                  : "border-zinc-800 bg-zinc-900 text-zinc-600"
              )}
              title={params.is_enabled ? "Bypass Compressor" : "Enable Compressor"}
            >
              <Power className="size-3.5" />
            </button>

            <div className="flex flex-col">
              <span className="font-mono text-xs font-black tracking-widest text-zinc-100 uppercase">
                HYBRID-DAW // MODELED COMPRESSOR SUITE
              </span>
              <span className="text-[8px] font-bold text-zinc-500 tracking-wider">
                TRACK: {currentTrack?.name.toUpperCase()} (BUS {modalState.trackIndex + 1})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Visualizer Mode Toggle */}
            <div className="flex rounded-xs border border-zinc-800 bg-black/60 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("needle")}
                className={cn(
                  "flex items-center gap-1 rounded-xs px-2 py-0.5 text-[9px] font-bold transition-colors",
                  viewMode === "needle"
                    ? "bg-zinc-800 text-telemetry-orange shadow-xs"
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <Gauge className="size-3" />
                <span>VU NEEDLE</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("graph")}
                className={cn(
                  "flex items-center gap-1 rounded-xs px-2 py-0.5 text-[9px] font-bold transition-colors",
                  viewMode === "graph"
                    ? "bg-zinc-800 text-telemetry-green shadow-xs"
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <Activity className="size-3" />
                <span>TRANSFER</span>
              </button>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={closeModal}
              className="flex size-7 items-center justify-center rounded-xs border border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-100 transition-colors"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>

        {/* ── CIRCUIT TOPOLOGY SELECTOR BAR ── */}
        <div className="grid grid-cols-4 border-b border-zinc-800 bg-[#0e0e14] p-1.5 gap-1.5">
          {CIRCUITS.map((circ) => {
            const isActive = params.circuit === circ.id;
            return (
              <button
                key={circ.id}
                type="button"
                onClick={() => handleUpdate({ circuit: circ.id })}
                className={cn(
                  "flex flex-col items-center justify-center rounded-xs border px-2 py-1.5 transition-all",
                  isActive
                    ? "border-telemetry-orange bg-gradient-to-b from-orange-950/40 to-zinc-900 text-telemetry-orange shadow-[0_0_10px_rgba(255,68,0,0.3)]"
                    : "border-zinc-800/80 bg-zinc-900/60 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "size-1.5 rounded-full transition-all",
                      isActive
                        ? "bg-telemetry-orange shadow-[0_0_6px_rgba(255,68,0,1)]"
                        : "bg-zinc-700"
                    )}
                  />
                  <span className="font-mono text-[10px] font-black tracking-wider">
                    {circ.name}
                  </span>
                </div>
                <span className="truncate text-[7px] text-zinc-500 mt-0.5">
                  {circ.desc}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── DUAL-MODE CANVAS VISUALIZER ── */}
        <div className="relative border-b border-zinc-800 bg-[#0a0a0d] p-3 flex justify-center">
          <canvas
            ref={canvasRef}
            width={600}
            height={170}
            className="rounded-xs border border-zinc-800/80 shadow-inner w-full max-w-[600px] h-[170px]"
          />
        </div>

        {/* ── ROTARY HARDWARE CONTROLS ── */}
        <div className="p-4 bg-gradient-to-b from-[#111116] to-[#0c0c10]">
          {/* Main 6 Dynamics Dials */}
          <div className="grid grid-cols-6 gap-2 items-center justify-items-center">
            <HardwareKnob
              label="THRESHOLD"
              value={params.threshold_db}
              min={-60}
              max={0}
              defaultValue={-18}
              unit="dB"
              step={0.5}
              onChange={(val) => handleUpdate({ threshold_db: val })}
              accentColor="#ff4400"
            />

            <HardwareKnob
              label="RATIO"
              value={params.ratio}
              min={1.1}
              max={30}
              defaultValue={4}
              unit=":1"
              step={0.1}
              onChange={(val) => handleUpdate({ ratio: val })}
              accentColor="#fbbf24"
            />

            <HardwareKnob
              label="ATTACK"
              value={params.attack_ms}
              min={0.1}
              max={200}
              defaultValue={15}
              unit="ms"
              step={0.5}
              scale="log"
              onChange={(val) => handleUpdate({ attack_ms: val })}
              accentColor="#00f59b"
            />

            <HardwareKnob
              label="RELEASE"
              value={params.release_ms}
              min={10}
              max={1200}
              defaultValue={150}
              unit="ms"
              step={5}
              scale="log"
              onChange={(val) => handleUpdate({ release_ms: val })}
              accentColor="#38bdf8"
            />

            <HardwareKnob
              label="KNEE"
              value={params.knee}
              min={0}
              max={1}
              defaultValue={0.5}
              unit=""
              step={0.05}
              formatValue={(v) => v.toFixed(2)}
              onChange={(val) => handleUpdate({ knee: val })}
              accentColor="#a855f7"
            />

            <HardwareKnob
              label="MAKE-UP"
              value={params.makeup_gain_db}
              min={-24}
              max={24}
              defaultValue={0}
              unit="dB"
              step={0.5}
              onChange={(val) => handleUpdate({ makeup_gain_db: val })}
              accentColor="#f43f5e"
            />
          </div>

          {/* ── BOTTOM SIDECHAIN & AUDITION STRIP ── */}
          <div className="mt-4 flex items-center justify-between border-t border-zinc-800/80 pt-3 px-2">
            <div className="flex items-center gap-4">
              <HardwareKnob
                label="SC LOW-CUT"
                value={params.sidechain_lowcut_hz}
                min={20}
                max={1000}
                defaultValue={80}
                unit="Hz"
                step={5}
                scale="log"
                onChange={(val) => handleUpdate({ sidechain_lowcut_hz: val })}
                accentColor="#eab308"
              />

              <div className="flex flex-col gap-1">
                <span className="font-mono text-[8px] font-bold text-zinc-500 uppercase tracking-widest">
                  DETECTOR FILTER
                </span>
                <button
                  type="button"
                  onClick={() =>
                    handleUpdate({ listen_sidechain: !params.listen_sidechain })
                  }
                  className={cn(
                    "flex items-center gap-1.5 rounded-xs border px-3 py-1 font-mono text-[9px] font-bold transition-all uppercase",
                    params.listen_sidechain
                      ? "border-amber-500 bg-amber-950/80 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.6)]"
                      : "border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300"
                  )}
                  title="Audition detection filter signal directly through speakers"
                >
                  <Volume2 className="size-3" />
                  <span>LISTEN SC</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 font-mono text-[8px] text-zinc-500">
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-telemetry-green" />
                <span>LOCK-FREE RTRB RINGBUFFER</span>
              </span>
              <span>ZERO-ALLOCATION DSP</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
