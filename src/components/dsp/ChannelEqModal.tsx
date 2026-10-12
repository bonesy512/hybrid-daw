"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Activity, Power, Volume2, X, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type EqBandParams,
  type EqualizerParams,
  type FilterType,
  getSpectrumPeaks,
  setEqualizerParams,
} from "@/lib/audio/tauri-bridge";
import { useMixerStore } from "@/stores/mixer-store";

// Visual token palette for the 8 bands
export const BAND_COLORS: string[] = [
  "#f97316", // Band 1: Highpass (Safety Orange)
  "#eab308", // Band 2: Low Shelf (Amber)
  "#84cc16", // Band 3: Bell Low-Mid (Lime)
  "#10b981", // Band 4: Bell Mid (Emerald)
  "#06b6d4", // Band 5: Bell High-Mid (Cyan)
  "#6366f1", // Band 6: Bell Presence (Indigo)
  "#a855f7", // Band 7: High Shelf (Purple)
  "#ec4899", // Band 8: Lowpass (Rose)
];

export const BAND_TYPE_LABELS: Record<FilterType, string> = {
  Highpass: "HPF",
  LowShelf: "L-SHELF",
  Peaking: "BELL",
  HighShelf: "H-SHELF",
  Lowpass: "LPF",
};

const DEFAULT_BANDS: EqBandParams[] = [
  { filter_type: "Highpass", is_active: false, frequency_hz: 30, gain_db: 0, q: 0.7071, slope_order: 1 },
  { filter_type: "LowShelf", is_active: true, frequency_hz: 100, gain_db: 0, q: 0.7071, slope_order: 1 },
  { filter_type: "Peaking", is_active: true, frequency_hz: 250, gain_db: 0, q: 1.0, slope_order: 1 },
  { filter_type: "Peaking", is_active: true, frequency_hz: 1000, gain_db: 0, q: 1.0, slope_order: 1 },
  { filter_type: "Peaking", is_active: true, frequency_hz: 3000, gain_db: 0, q: 1.0, slope_order: 1 },
  { filter_type: "Peaking", is_active: true, frequency_hz: 8000, gain_db: 0, q: 1.0, slope_order: 1 },
  { filter_type: "HighShelf", is_active: true, frequency_hz: 12000, gain_db: 0, q: 0.7071, slope_order: 1 },
  { filter_type: "Lowpass", is_active: false, frequency_hz: 18000, gain_db: 0, q: 0.7071, slope_order: 1 },
];

// Helper: Calculate single biquad response in dB at a given frequency
function evaluateBiquadDb(
  band: EqBandParams,
  freqHz: number,
  sampleRate = 44100
): number {
  if (!band.is_active) return 0.0;

  const sr = Math.max(8000, sampleRate);
  const f0 = Math.max(20, Math.min(sr * 0.495, band.frequency_hz));
  const q = Math.max(0.1, Math.min(30.0, band.q));
  const w0 = (2.0 * Math.PI * f0) / sr;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2.0 * q);
  const aGain = Math.pow(10.0, band.gain_db / 40.0);

  let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;

  switch (band.filter_type) {
    case "Peaking":
      b0 = 1.0 + alpha * aGain;
      b1 = -2.0 * cosW0;
      b2 = 1.0 - alpha * aGain;
      a0 = 1.0 + alpha / aGain;
      a1 = -2.0 * cosW0;
      a2 = 1.0 - alpha / aGain;
      break;
    case "LowShelf": {
      const sqrtA = Math.sqrt(aGain);
      b0 = aGain * ((aGain + 1.0) - (aGain - 1.0) * cosW0 + 2.0 * sqrtA * alpha);
      b1 = 2.0 * aGain * ((aGain - 1.0) - (aGain + 1.0) * cosW0);
      b2 = aGain * ((aGain + 1.0) - (aGain - 1.0) * cosW0 - 2.0 * sqrtA * alpha);
      a0 = (aGain + 1.0) + (aGain - 1.0) * cosW0 + 2.0 * sqrtA * alpha;
      a1 = -2.0 * ((aGain - 1.0) + (aGain + 1.0) * cosW0);
      a2 = (aGain + 1.0) + (aGain - 1.0) * cosW0 - 2.0 * sqrtA * alpha;
      break;
    }
    case "HighShelf": {
      const sqrtA = Math.sqrt(aGain);
      b0 = aGain * ((aGain + 1.0) + (aGain - 1.0) * cosW0 + 2.0 * sqrtA * alpha);
      b1 = -2.0 * aGain * ((aGain - 1.0) + (aGain + 1.0) * cosW0);
      b2 = aGain * ((aGain + 1.0) + (aGain - 1.0) * cosW0 - 2.0 * sqrtA * alpha);
      a0 = (aGain + 1.0) - (aGain - 1.0) * cosW0 + 2.0 * sqrtA * alpha;
      a1 = 2.0 * ((aGain - 1.0) - (aGain + 1.0) * cosW0);
      a2 = (aGain + 1.0) - (aGain - 1.0) * cosW0 - 2.0 * sqrtA * alpha;
      break;
    }
    case "Highpass":
      b0 = (1.0 + cosW0) * 0.5;
      b1 = -(1.0 + cosW0);
      b2 = (1.0 + cosW0) * 0.5;
      a0 = 1.0 + alpha;
      a1 = -2.0 * cosW0;
      a2 = 1.0 - alpha;
      break;
    case "Lowpass":
      b0 = (1.0 - cosW0) * 0.5;
      b1 = 1.0 - cosW0;
      b2 = (1.0 - cosW0) * 0.5;
      a0 = 1.0 + alpha;
      a1 = -2.0 * cosW0;
      a2 = 1.0 - alpha;
      break;
  }

  if (Math.abs(a0) < 1e-12) return 0.0;

  // Normalized coefficients
  const nb0 = b0 / a0;
  const nb1 = b1 / a0;
  const nb2 = b2 / a0;
  const na1 = a1 / a0;
  const na2 = a2 / a0;

  const w = (2.0 * Math.PI * freqHz) / sr;
  const cosW = Math.cos(w);
  const sinW = Math.sin(w);
  const cos2W = Math.cos(2.0 * w);
  const sin2W = Math.sin(2.0 * w);

  const numR = nb0 + nb1 * cosW + nb2 * cos2W;
  const numI = -nb1 * sinW - nb2 * sin2W;
  const denR = 1.0 + na1 * cosW + na2 * cos2W;
  const denI = -na1 * sinW - na2 * sin2W;

  const magSq = (numR * numR + numI * numI) / Math.max(1e-18, denR * denR + denI * denI);
  let db = 10.0 * Math.log10(Math.max(1e-12, magSq));

  // If 24 dB/oct slope (slope_order >= 2 for HPF/LPF), multiply response by 2 stages
  if ((band.filter_type === "Highpass" || band.filter_type === "Lowpass") && band.slope_order >= 2) {
    db *= 2.0;
  }

  return db;
}

// Convert frequency (20 - 20000 Hz) to normalized X (0.0 to 1.0) logarithmically
function freqToNorm(freq: number): number {
  const minLog = Math.log10(20);
  const maxLog = Math.log10(20000);
  const clamped = Math.max(20, Math.min(20000, freq));
  return (Math.log10(clamped) - minLog) / (maxLog - minLog);
}

// Convert normalized X (0.0 to 1.0) back to frequency (20 - 20000 Hz)
function normToFreq(norm: number): number {
  const minLog = Math.log10(20);
  const maxLog = Math.log10(20000);
  const logVal = minLog + Math.max(0, Math.min(1, norm)) * (maxLog - minLog);
  return Math.pow(10, logVal);
}

// Convert gain dB (-24 to +24 dB) to normalized Y (0.0 at +24dB to 1.0 at -24dB)
function dbToNorm(dB: number): number {
  const clamped = Math.max(-24, Math.min(24, dB));
  return (24 - clamped) / 48;
}

// Convert normalized Y (0.0 at top to 1.0 at bottom) back to gain dB
function normToDb(norm: number): number {
  return 24 - Math.max(0, Math.min(1, norm)) * 48;
}

export function ChannelEqModal() {
  const modalState = useMixerStore((state) => state.channelEqModal);
  const closeModal = useMixerStore((state) => state.closeChannelEqModal);
  const tracks = useMixerStore((state) => state.tracks);
  const updateInsertParams = useMixerStore((state) => state.updateInsertParams);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Selected node being dragged: index 0..7
  const [selectedNodeIndex, setSelectedNodeIndex] = useState<number | null>(null);
  const [hoveredNodeIndex, setHoveredNodeIndex] = useState<number | null>(null);
  const dragRef = useRef<{ isDragging: boolean; nodeIndex: number } | null>(null);

  const currentTrack = tracks.find((t) => t.id === modalState.trackId);
  const currentInsert = currentTrack?.inserts.find(
    (ins) => ins.id === modalState.insertId
  );

  // Parse EQ parameters
  const isEnabled = currentInsert?.params?.is_enabled !== false;
  const outputGainDb =
    typeof currentInsert?.params?.output_gain_db === "number"
      ? currentInsert.params.output_gain_db
      : 0.0;
  const spectrumPostEq = currentInsert?.params?.spectrum_post_eq !== false;

  let bands: EqBandParams[] = DEFAULT_BANDS;
  if (currentInsert?.params?.bands && typeof currentInsert.params.bands === "string") {
    try {
      bands = JSON.parse(currentInsert.params.bands);
    } catch {
      bands = DEFAULT_BANDS;
    }
  }

  // Rolling spectrum peaks buffer for smooth falloff
  const spectrumPeaksRef = useRef<Float32Array>(new Float32Array(128));

  // Sync to Rust engine
  const syncToEngine = useCallback(
    (nextBands: EqBandParams[], nextOutGain: number, nextEnabled: boolean, nextPostEq: boolean) => {
      if (!modalState.trackId || !modalState.insertId) return;

      const fullParams: EqualizerParams = {
        bands: nextBands,
        output_gain_db: nextOutGain,
        is_enabled: nextEnabled,
        spectrum_post_eq: nextPostEq,
      };

      updateInsertParams(modalState.trackId, modalState.insertId, {
        bands: JSON.stringify(nextBands),
        output_gain_db: nextOutGain,
        is_enabled: nextEnabled,
        spectrum_post_eq: nextPostEq,
      });

      setEqualizerParams(modalState.trackIndex, fullParams);
    },
    [modalState.trackId, modalState.insertId, modalState.trackIndex, updateInsertParams]
  );

  // Update a single band parameter
  const updateBand = (bandIndex: number, partial: Partial<EqBandParams>) => {
    const nextBands = bands.map((b, idx) =>
      idx === bandIndex ? { ...b, ...partial } : b
    );
    syncToEngine(nextBands, outputGainDb, isEnabled, spectrumPostEq);
  };

  // 60fps Native HTML5 Canvas Visualizer
  useEffect(() => {
    if (!modalState.isOpen || !modalState.trackId) {
      return;
    }

    let isCancelled = false;

    const renderLoop = async () => {
      if (isCancelled) return;

      // 1. Poll FFT spectrum magnitudes (128 bins)
      const peaks = await getSpectrumPeaks(modalState.trackIndex);
      const peaksArr = spectrumPeaksRef.current;
      for (let i = 0; i < 128; i++) {
        const target = peaks[i] || 0;
        // Smooth peak response with slight decay
        peaksArr[i] = Math.max(target, peaksArr[i] * 0.92);
      }

      // 2. Render Canvas Frame
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;

          const padL = 36;
          const padR = 24;
          const padT = 20;
          const padB = 24;
          const plotW = w - padL - padR;
          const plotH = h - padT - padB;

          // ── A. Clear & Dark Obsidian Canvas Background ──
          ctx.fillStyle = "#08080c";
          ctx.fillRect(0, 0, w, h);

          // ── B. Logarithmic Frequency Grid Lines ──
          const gridFreqs = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
          ctx.font = "8px monospace";
          ctx.textAlign = "center";
          ctx.lineWidth = 1;

          for (const gf of gridFreqs) {
            const gx = padL + freqToNorm(gf) * plotW;
            ctx.strokeStyle = "#16161e";
            ctx.beginPath();
            ctx.moveTo(gx, padT);
            ctx.lineTo(gx, padT + plotH);
            ctx.stroke();

            ctx.fillStyle = "#52525b";
            const label = gf >= 1000 ? `${gf / 1000}k` : `${gf}`;
            ctx.fillText(label, gx, h - 8);
          }

          // ── C. Horizontal Gain (dB) Grid Lines ──
          const gridDbs = [24, 18, 12, 6, 0, -6, -12, -18, -24];
          ctx.textAlign = "right";

          for (const gdb of gridDbs) {
            const gy = padT + dbToNorm(gdb) * plotH;
            ctx.strokeStyle = gdb === 0 ? "#3f3f46" : "#16161e";
            if (gdb === 0) {
              ctx.setLineDash([3, 3]);
            } else {
              ctx.setLineDash([]);
            }
            ctx.beginPath();
            ctx.moveTo(padL, gy);
            ctx.lineTo(padL + plotW, gy);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = gdb === 0 ? "#a1a1aa" : "#3f3f46";
            const dLabel = gdb > 0 ? `+${gdb}` : `${gdb}`;
            ctx.fillText(dLabel, padL - 6, gy + 3);
          }

          // ── D. Spectrum Analyzer Background Glow ──
          if (peaksArr.length > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(padL, padT, plotW, plotH);
            ctx.clip();

            ctx.beginPath();
            ctx.moveTo(padL, padT + plotH);

            for (let i = 0; i < 128; i++) {
              const normX = i / 127;
              const px = padL + normX * plotW;
              const mag = Math.min(1.0, peaksArr[i]);
              const py = padT + plotH - mag * plotH;
              ctx.lineTo(px, py);
            }

            ctx.lineTo(padL + plotW, padT + plotH);
            ctx.closePath();

            const specGrad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
            specGrad.addColorStop(0, "rgba(0, 245, 155, 0.35)");
            specGrad.addColorStop(0.5, "rgba(0, 245, 155, 0.12)");
            specGrad.addColorStop(1, "rgba(0, 245, 155, 0.01)");
            ctx.fillStyle = specGrad;
            ctx.fill();

            // Spectrum top stroke
            ctx.beginPath();
            for (let i = 0; i < 128; i++) {
              const normX = i / 127;
              const px = padL + normX * plotW;
              const mag = Math.min(1.0, peaksArr[i]);
              const py = padT + plotH - mag * plotH;
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.strokeStyle = "rgba(0, 245, 155, 0.75)";
            ctx.lineWidth = 1.2;
            ctx.stroke();
            ctx.restore();
          }

          // ── E. Composite EQ Transfer Curve ──
          ctx.save();
          ctx.beginPath();
          ctx.rect(padL, padT, plotW, plotH);
          ctx.clip();

          // Evaluate transfer function across horizontal pixels
          const stepPx = 2;
          const points: { x: number; y: number }[] = [];

          for (let px = padL; px <= padL + plotW; px += stepPx) {
            const normX = (px - padL) / plotW;
            const f = normToFreq(normX);

            let totalDb = outputGainDb;
            if (isEnabled) {
              for (const band of bands) {
                totalDb += evaluateBiquadDb(band, f);
              }
            }

            const clampedDb = Math.max(-24, Math.min(24, totalDb));
            const py = padT + dbToNorm(clampedDb) * plotH;
            points.push({ x: px, y: py });
          }

          // Shaded area under the curve
          ctx.beginPath();
          ctx.moveTo(padL, padT + dbToNorm(0) * plotH);
          for (const pt of points) {
            ctx.lineTo(pt.x, pt.y);
          }
          ctx.lineTo(padL + plotW, padT + dbToNorm(0) * plotH);
          ctx.closePath();

          const curveFillGrad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
          curveFillGrad.addColorStop(0, "rgba(6, 182, 212, 0.22)");
          curveFillGrad.addColorStop(0.5, "rgba(6, 182, 212, 0.05)");
          curveFillGrad.addColorStop(1, "rgba(6, 182, 212, 0.0)");
          ctx.fillStyle = curveFillGrad;
          ctx.fill();

          // Primary Cyan Stroke Curve
          ctx.beginPath();
          for (let i = 0; i < points.length; i++) {
            if (i === 0) ctx.moveTo(points[i].x, points[i].y);
            else ctx.lineTo(points[i].x, points[i].y);
          }
          ctx.shadowColor = "rgba(6, 182, 212, 0.85)";
          ctx.shadowBlur = 6;
          ctx.strokeStyle = isEnabled ? "#22d3ee" : "#52525b";
          ctx.lineWidth = 2.2;
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.restore();

          // ── F. 8 Color-Coded Interactive Control Nodes ──
          for (let idx = 0; idx < bands.length; idx++) {
            const band = bands[idx];
            const color = BAND_COLORS[idx];
            const isHovered = hoveredNodeIndex === idx;
            const isSelected = selectedNodeIndex === idx;

            const nx = padL + freqToNorm(band.frequency_hz) * plotW;
            const effectiveDb =
              band.filter_type === "Highpass" || band.filter_type === "Lowpass"
                ? 0
                : band.gain_db;
            const ny = padT + dbToNorm(effectiveDb) * plotH;

            // Outer bandwidth / Q indicator halo
            if (isHovered || isSelected) {
              const qRadius = Math.max(14, 30 / Math.max(0.2, band.q));
              ctx.strokeStyle = color;
              ctx.lineWidth = 1;
              ctx.setLineDash([2, 2]);
              ctx.beginPath();
              ctx.arc(nx, ny, qRadius, 0, Math.PI * 2);
              ctx.stroke();
              ctx.setLineDash([]);
            }

            // Outer node ring
            ctx.beginPath();
            ctx.arc(nx, ny, isHovered || isSelected ? 8 : 6, 0, Math.PI * 2);
            ctx.fillStyle = band.is_active ? color : "#27272a";
            ctx.fill();
            ctx.strokeStyle = isSelected ? "#ffffff" : "#09090b";
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Center node text (1..8)
            ctx.fillStyle = band.is_active ? "#000000" : "#71717a";
            ctx.font = "bold 8px monospace";
            ctx.textAlign = "center";
            ctx.fillText(`${idx + 1}`, nx, ny + 2.5);
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
    bands,
    outputGainDb,
    isEnabled,
    spectrumPostEq,
    hoveredNodeIndex,
    selectedNodeIndex,
  ]);

  if (!modalState.isOpen || !modalState.trackId || !currentTrack) {
    return null;
  }

  // Pointer event handlers on Canvas
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const padL = 36;
    const padR = 24;
    const padT = 20;
    const padB = 24;
    const plotW = canvas.width - padL - padR;
    const plotH = canvas.height - padT - padB;

    // Detect click hit on any of the 8 nodes
    let hitIndex: number | null = null;
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i];
      const nx = padL + freqToNorm(b.frequency_hz) * plotW;
      const effectiveDb =
        b.filter_type === "Highpass" || b.filter_type === "Lowpass" ? 0 : b.gain_db;
      const ny = padT + dbToNorm(effectiveDb) * plotH;

      const dist = Math.hypot(clickX - nx, clickY - ny);
      if (dist <= 14) {
        hitIndex = i;
        break;
      }
    }

    if (hitIndex !== null) {
      setSelectedNodeIndex(hitIndex);
      dragRef.current = { isDragging: true, nodeIndex: hitIndex };
      canvas.setPointerCapture(e.pointerId);
    } else {
      setSelectedNodeIndex(null);
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const currX = e.clientX - rect.left;
    const currY = e.clientY - rect.top;

    const padL = 36;
    const padR = 24;
    const padT = 20;
    const padB = 24;
    const plotW = canvas.width - padL - padR;
    const plotH = canvas.height - padT - padB;

    // If dragging node
    if (dragRef.current?.isDragging) {
      const idx = dragRef.current.nodeIndex;
      const normX = Math.max(0, Math.min(1, (currX - padL) / plotW));
      const nextFreq = Math.round(normToFreq(normX));

      const band = bands[idx];
      let nextGain = band.gain_db;

      if (band.filter_type !== "Highpass" && band.filter_type !== "Lowpass") {
        const normY = Math.max(0, Math.min(1, (currY - padT) / plotH));
        nextGain = Number(normToDb(normY).toFixed(1));
      }

      updateBand(idx, {
        frequency_hz: nextFreq,
        gain_db: nextGain,
      });
      return;
    }

    // Hover detection
    let hoverIdx: number | null = null;
    for (let i = 0; i < bands.length; i++) {
      const b = bands[i];
      const nx = padL + freqToNorm(b.frequency_hz) * plotW;
      const effectiveDb =
        b.filter_type === "Highpass" || b.filter_type === "Lowpass" ? 0 : b.gain_db;
      const ny = padT + dbToNorm(effectiveDb) * plotH;

      const dist = Math.hypot(currX - nx, currY - ny);
      if (dist <= 12) {
        hoverIdx = i;
        break;
      }
    }
    setHoveredNodeIndex(hoverIdx);
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.isDragging) {
      try {
        canvasRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        // pointer capture lost
      }
      dragRef.current = null;
    }
  };

  // Adjust Q with mouse wheel
  const handleCanvasWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const targetIdx = selectedNodeIndex ?? hoveredNodeIndex;
    if (targetIdx === null) return;

    e.preventDefault();
    const b = bands[targetIdx];
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    const nextQ = Math.max(0.1, Math.min(30.0, Number((b.q + delta).toFixed(2))));
    updateBand(targetIdx, { q: nextQ });
  };

  // Double click resets node to unity gain
  const handleCanvasDoubleClick = () => {
    if (selectedNodeIndex !== null) {
      const b = bands[selectedNodeIndex];
      const defaultQ =
        b.filter_type === "Highpass" ||
        b.filter_type === "LowShelf" ||
        b.filter_type === "HighShelf" ||
        b.filter_type === "Lowpass"
          ? 0.7071
          : 1.0;
      updateBand(selectedNodeIndex, {
        gain_db: 0.0,
        q: defaultQ,
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-150"
      onClick={closeModal}
    >
      {/* ── CHASSIS MAIN CONTAINER ── */}
      <div
        className="relative flex w-full max-w-4xl flex-col rounded-sm border border-zinc-700/80 bg-zinc-950/95 shadow-[0_25px_60px_rgba(0,0,0,0.9),0_0_1px_rgba(255,255,255,0.2)] backdrop-blur-2xl font-mono select-none overflow-hidden"
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
            {/* Master EQ Power Toggle */}
            <button
              type="button"
              onClick={() => syncToEngine(bands, outputGainDb, !isEnabled, spectrumPostEq)}
              className={cn(
                "flex size-6 items-center justify-center rounded-xs border transition-all",
                isEnabled
                  ? "border-telemetry-green bg-green-950/80 text-telemetry-green shadow-[0_0_8px_rgba(0,245,155,0.7)]"
                  : "border-zinc-800 bg-zinc-900 text-zinc-600"
              )}
              title={isEnabled ? "Bypass Equalizer" : "Enable Equalizer"}
            >
              <Power className="size-3.5" />
            </button>

            <div className="flex flex-col">
              <span className="font-mono text-xs font-black tracking-widest text-zinc-100 uppercase">
                HYBRID-DAW // 8-BAND SURGICAL CHANNEL EQ
              </span>
              <span className="text-[8px] font-bold text-zinc-500 tracking-wider">
                TRACK: {currentTrack?.name.toUpperCase()} (BUS {modalState.trackIndex + 1})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Pre / Post FFT Mode Toggle */}
            <button
              type="button"
              onClick={() => syncToEngine(bands, outputGainDb, isEnabled, !spectrumPostEq)}
              className={cn(
                "flex items-center gap-1.5 rounded-xs border px-2.5 py-1 text-[9px] font-bold uppercase transition-all",
                spectrumPostEq
                  ? "border-telemetry-green bg-green-950/40 text-telemetry-green shadow-xs"
                  : "border-amber-500/60 bg-amber-950/40 text-amber-300"
              )}
              title="Toggle Pre/Post EQ spectrum analysis"
            >
              <Activity className="size-3" />
              <span>{spectrumPostEq ? "POST FFT" : "PRE FFT"}</span>
            </button>

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

        {/* ── INTERACTIVE CANVAS VIEW (800x340px) ── */}
        <div className="relative border-b border-zinc-800 bg-[#08080c] p-3 flex justify-center">
          <canvas
            ref={canvasRef}
            width={800}
            height={320}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onWheel={handleCanvasWheel}
            onDoubleClick={handleCanvasDoubleClick}
            className="cursor-crosshair rounded-xs border border-zinc-800/80 shadow-inner w-full max-w-[800px] h-[320px]"
          />
        </div>

        {/* ── BOTTOM PARAMETER STRIP (8 BANDS + MASTER) ── */}
        <div className="p-3 bg-gradient-to-b from-[#111116] to-[#0c0c10]">
          <div className="grid grid-cols-8 gap-1.5">
            {bands.map((band, idx) => {
              const color = BAND_COLORS[idx];
              const isSelected = selectedNodeIndex === idx;
              const hasGain =
                band.filter_type !== "Highpass" && band.filter_type !== "Lowpass";
              const hasSlope =
                band.filter_type === "Highpass" || band.filter_type === "Lowpass";

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedNodeIndex(idx)}
                  className={cn(
                    "flex flex-col rounded-xs border p-2 transition-all cursor-pointer",
                    isSelected
                      ? "border-zinc-500 bg-zinc-900/90 shadow-[0_0_8px_rgba(255,255,255,0.1)]"
                      : "border-zinc-800/80 bg-zinc-900/40 hover:border-zinc-700"
                  )}
                >
                  {/* Band Header: Badge + Type + Power LED */}
                  <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800/80">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="flex size-4 items-center justify-center rounded-xs text-[9px] font-black text-black"
                        style={{ backgroundColor: color }}
                      >
                        {idx + 1}
                      </span>
                      <span className="text-[8px] font-black tracking-wider text-zinc-300">
                        {BAND_TYPE_LABELS[band.filter_type]}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateBand(idx, { is_active: !band.is_active });
                      }}
                      className={cn(
                        "size-2 rounded-full transition-all",
                        band.is_active
                          ? "bg-telemetry-green shadow-[0_0_4px_rgba(0,245,155,0.9)]"
                          : "bg-zinc-700"
                      )}
                      title={band.is_active ? "Bypass Band" : "Activate Band"}
                    />
                  </div>

                  {/* Frequency Scrub */}
                  <div className="mt-1.5 flex flex-col">
                    <span className="text-[7px] text-zinc-500 tracking-widest font-bold">
                      FREQ (Hz)
                    </span>
                    <input
                      type="number"
                      min={20}
                      max={20000}
                      value={Math.round(band.frequency_hz)}
                      onChange={(e) =>
                        updateBand(idx, { frequency_hz: Number(e.target.value) || 20 })
                      }
                      className="w-full rounded-[1px] border border-zinc-800 bg-black/60 px-1 py-0.5 text-[9px] text-zinc-200 tabular-nums focus:border-cyan-500 focus:outline-hidden"
                    />
                  </div>

                  {/* Gain Scrub (or N/A for HPF/LPF) */}
                  <div className="mt-1 flex flex-col">
                    <span className="text-[7px] text-zinc-500 tracking-widest font-bold">
                      GAIN (dB)
                    </span>
                    {hasGain ? (
                      <input
                        type="number"
                        min={-24}
                        max={24}
                        step={0.5}
                        value={band.gain_db}
                        onChange={(e) =>
                          updateBand(idx, { gain_db: Number(e.target.value) || 0 })
                        }
                        className="w-full rounded-[1px] border border-zinc-800 bg-black/60 px-1 py-0.5 text-[9px] text-zinc-200 tabular-nums focus:border-cyan-500 focus:outline-hidden"
                      />
                    ) : (
                      <div className="flex h-[21px] items-center justify-center rounded-[1px] border border-zinc-900 bg-black/20 text-[9px] text-zinc-600">
                        ---
                      </div>
                    )}
                  </div>

                  {/* Q Factor */}
                  <div className="mt-1 flex flex-col">
                    <span className="text-[7px] text-zinc-500 tracking-widest font-bold">
                      Q (WIDTH)
                    </span>
                    <input
                      type="number"
                      min={0.1}
                      max={30}
                      step={0.1}
                      value={band.q}
                      onChange={(e) =>
                        updateBand(idx, { q: Number(e.target.value) || 0.7071 })
                      }
                      className="w-full rounded-[1px] border border-zinc-800 bg-black/60 px-1 py-0.5 text-[9px] text-zinc-200 tabular-nums focus:border-cyan-500 focus:outline-hidden"
                    />
                  </div>

                  {/* Slope Switch for HPF / LPF */}
                  {hasSlope && (
                    <div className="mt-1.5 flex items-center justify-between border-t border-zinc-800/60 pt-1">
                      <span className="text-[7px] text-zinc-500 font-bold">SLOPE</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateBand(idx, {
                            slope_order: band.slope_order === 1 ? 2 : 1,
                          });
                        }}
                        className="rounded-xs border border-zinc-700 bg-zinc-800 px-1 py-0.5 text-[7px] font-bold text-zinc-200 hover:border-zinc-500 transition-colors"
                      >
                        {band.slope_order === 2 ? "24dB" : "12dB"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── FOOTER: MASTER TRIM & TELEMETRY ── */}
          <div className="mt-3 flex items-center justify-between border-t border-zinc-800/80 pt-2.5 px-2">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[8px] font-bold text-zinc-500 tracking-widest uppercase">
                  MASTER OUTPUT TRIM
                </span>
                <input
                  type="range"
                  min={-24}
                  max={24}
                  step={0.5}
                  value={outputGainDb}
                  onChange={(e) =>
                    syncToEngine(
                      bands,
                      Number(e.target.value),
                      isEnabled,
                      spectrumPostEq
                    )
                  }
                  className="h-1.5 w-28 accent-cyan-400 bg-zinc-800 rounded-lg cursor-pointer"
                />
                <span className="font-mono text-[9px] font-bold text-cyan-400 w-12 tabular-nums">
                  {outputGainDb > 0 ? `+${outputGainDb.toFixed(1)}` : outputGainDb.toFixed(1)} dB
                </span>
              </div>

              <button
                type="button"
                onClick={() => syncToEngine(DEFAULT_BANDS, 0.0, isEnabled, spectrumPostEq)}
                className="flex items-center gap-1 rounded-xs border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[8px] font-bold text-zinc-400 hover:text-zinc-200 transition-colors"
                title="Reset all bands to default"
              >
                <RefreshCw className="size-2.5" />
                <span>RESET FLAT</span>
              </button>
            </div>

            <div className="flex items-center gap-3 font-mono text-[8px] text-zinc-500">
              <span className="flex items-center gap-1">
                <Volume2 className="size-3 text-telemetry-green" />
                <span>1024-PT FFT RADIX-2</span>
              </span>
              <span>DIRECT FORM II TRANSPOSED BIQUADS</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
