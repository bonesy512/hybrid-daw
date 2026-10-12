"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { previewSynth } from "@/lib/audio/preview-synth";
import {
  CHORD_STAMP_INTERVALS,
  getSnapTicks,
  MidiNote,
  SCALE_INTERVALS,
  usePianoRollStore,
} from "@/stores/pianoroll-store";
import { useTransportStore } from "@/stores/transport-store";

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

const BLACK_KEYS = [1, 3, 6, 8, 10];

export const getPitchLabel = (pitch: number): string => {
  const note = NOTE_NAMES[pitch % 12];
  const octave = Math.floor(pitch / 12) - 1;
  return `${note}${octave}`;
};

export const isBlackKey = (pitch: number): boolean => {
  return BLACK_KEYS.includes(pitch % 12);
};

interface InteractionState {
  type: "idle" | "draw" | "move" | "resize" | "marquee" | "slice";
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  targetNoteId?: string;
  initialNoteState?: {
    startTick: number;
    durationTicks: number;
    pitch: number;
  };
  draggedNoteIds?: string[];
  initialNotesSnapshot?: Map<
    string,
    { startTick: number; durationTicks: number; pitch: number }
  >;
}

export const PianoRollCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement>(null);
  const keysCanvasRef = useRef<HTMLCanvasElement>(null);

  // Zustand subscriptions
  const selectedChannelId = usePianoRollStore((s) => s.selectedChannelId);
  const snapDivision = usePianoRollStore((s) => s.snapDivision);
  const tool = usePianoRollStore((s) => s.tool);
  const scaleHighlight = usePianoRollStore((s) => s.scaleHighlight);
  const rootPitch = usePianoRollStore((s) => s.rootPitch);
  const chordStamp = usePianoRollStore((s) => s.chordStamp);
  const viewRange = usePianoRollStore((s) => s.viewRange);
  const notes = usePianoRollStore((s) => s.notes);

  // Store actions
  const addNote = usePianoRollStore((s) => s.addNote);
  const removeNote = usePianoRollStore((s) => s.removeNote);
  const updateNote = usePianoRollStore((s) => s.updateNote);
  const selectNote = usePianoRollStore((s) => s.selectNote);
  const clearSelection = usePianoRollStore((s) => s.clearSelection);
  const sliceNotesAtTick = usePianoRollStore((s) => s.sliceNotesAtTick);
  const setViewRange = usePianoRollStore((s) => s.setViewRange);

  const isPlaying = useTransportStore((s) => s.isPlaying);
  const position = useTransportStore((s) => s.position);

  // Interaction tracking state (kept in ref for 60fps canvas loop)
  const interactionRef = useRef<InteractionState>({
    type: "idle",
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  });

  const [hoveredKey, setHoveredKey] = useState<number | null>(null);
  const [cursorStyle, setCursorStyle] = useState<string>("crosshair");

  // Keyboard and Grid layout metrics
  const KEYBOARD_WIDTH = 56;
  const PITCH_HEIGHT = 18;

  const totalPitches = viewRange.maxPitch - viewRange.minPitch + 1;
  const totalTicks = Math.max(96, viewRange.endTick - viewRange.startTick);

  // Helper conversions
  const tickToX = useCallback(
    (tick: number, width: number): number => {
      const pixelsPerTick = width / totalTicks;
      return (tick - viewRange.startTick) * pixelsPerTick;
    },
    [totalTicks, viewRange.startTick]
  );

  const xToTick = useCallback(
    (x: number, width: number): number => {
      const pixelsPerTick = width / totalTicks;
      return Math.round(viewRange.startTick + x / pixelsPerTick);
    },
    [totalTicks, viewRange.startTick]
  );

  const pitchToY = useCallback(
    (pitch: number): number => {
      return (viewRange.maxPitch - pitch) * PITCH_HEIGHT;
    },
    [viewRange.maxPitch]
  );

  const yToPitch = useCallback(
    (y: number): number => {
      const offset = Math.floor(y / PITCH_HEIGHT);
      return Math.max(
        viewRange.minPitch,
        Math.min(viewRange.maxPitch, viewRange.maxPitch - offset)
      );
    },
    [viewRange.maxPitch, viewRange.minPitch]
  );

  // Quantize tick according to current snap
  const quantize = useCallback(
    (tick: number): number => {
      const snapTicks = getSnapTicks(snapDivision);
      if (snapTicks <= 1) return Math.max(0, tick);
      return Math.max(0, Math.round(tick / snapTicks) * snapTicks);
    },
    [snapDivision]
  );

  // Scale degrees lookup
  const isPitchInScale = useCallback(
    (pitch: number): boolean => {
      if (scaleHighlight === "none") return true;
      const intervals = SCALE_INTERVALS[scaleHighlight];
      const relativeDegree = (pitch - rootPitch + 120) % 12;
      return intervals.includes(relativeDegree);
    },
    [scaleHighlight, rootPitch]
  );

  // ─────────────────────────────────────────────────────────────
  // HIGH-RATE CANVAS RENDERING LOOP (requestAnimationFrame)
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let animId: number;

    const render = () => {
      const gridCanvas = gridCanvasRef.current;
      const keysCanvas = keysCanvasRef.current;
      if (!gridCanvas || !keysCanvas) {
        animId = requestAnimationFrame(render);
        return;
      }

      const gridCtx = gridCanvas.getContext("2d");
      const keysCtx = keysCanvas.getContext("2d");
      if (!gridCtx || !keysCtx) {
        animId = requestAnimationFrame(render);
        return;
      }

      const gridW = gridCanvas.width;
      const gridH = gridCanvas.height;
      const keysW = keysCanvas.width;
      const keysH = keysCanvas.height;

      // ── 1. DRAW PIANO KEYS (LEFT SIDE) ──
      keysCtx.fillStyle = "#0c0c10";
      keysCtx.fillRect(0, 0, keysW, keysH);

      for (let p = viewRange.maxPitch; p >= viewRange.minPitch; p--) {
        const y = pitchToY(p);
        const black = isBlackKey(p);
        const inScale = isPitchInScale(p);
        const isC = p % 12 === 0;
        const isHover = hoveredKey === p;

        // Key Background
        if (black) {
          keysCtx.fillStyle = isHover ? "#27272a" : "#09090b";
        } else {
          keysCtx.fillStyle = isHover ? "#3f3f46" : "#18181b";
        }
        keysCtx.fillRect(0, y, keysW - 1, PITCH_HEIGHT);

        // Key Dividers
        keysCtx.strokeStyle = "#27272a";
        keysCtx.lineWidth = 1;
        keysCtx.beginPath();
        keysCtx.moveTo(0, y + PITCH_HEIGHT);
        keysCtx.lineTo(keysW, y + PITCH_HEIGHT);
        keysCtx.stroke();

        // Right edge boundary
        keysCtx.strokeStyle = "#3f3f46";
        keysCtx.strokeRect(keysW - 2, y, 2, PITCH_HEIGHT);

        // Label on C notes or hovered notes
        if (isC || isHover) {
          keysCtx.fillStyle = isC ? "#00f59b" : "#e4e4e7";
          keysCtx.font = "bold 9px monospace";
          keysCtx.textAlign = "right";
          keysCtx.textBaseline = "middle";
          keysCtx.fillText(getPitchLabel(p), keysW - 6, y + PITCH_HEIGHT / 2);
        } else if (inScale && !black) {
          // Subtle scale marker dot on white keys
          keysCtx.fillStyle = "rgba(0, 245, 155, 0.4)";
          keysCtx.beginPath();
          keysCtx.arc(keysW - 8, y + PITCH_HEIGHT / 2, 1.5, 0, Math.PI * 2);
          keysCtx.fill();
        }
      }

      // ── 2. DRAW NOTE GRID (CENTER CANVAS) ──
      gridCtx.fillStyle = "#09090b";
      gridCtx.fillRect(0, 0, gridW, gridH);

      // Pitch Rows Background
      for (let p = viewRange.maxPitch; p >= viewRange.minPitch; p--) {
        const y = pitchToY(p);
        const black = isBlackKey(p);
        const inScale = isPitchInScale(p);

        if (black) {
          gridCtx.fillStyle = inScale
            ? "rgba(24, 24, 30, 0.9)"
            : "rgba(10, 10, 14, 0.95)";
        } else {
          gridCtx.fillStyle = inScale
            ? "rgba(18, 24, 22, 0.85)" // Soft phosphor tint for scale
            : "rgba(15, 15, 20, 0.85)";
        }
        gridCtx.fillRect(0, y, gridW, PITCH_HEIGHT);

        // Row Separator line
        gridCtx.strokeStyle = p % 12 === 0 ? "#3f3f46" : "#18181b";
        gridCtx.lineWidth = 1;
        gridCtx.beginPath();
        gridCtx.moveTo(0, y + PITCH_HEIGHT);
        gridCtx.lineTo(gridW, y + PITCH_HEIGHT);
        gridCtx.stroke();
      }

      // Vertical Beat & Bar Lines
      const pixelsPerTick = gridW / totalTicks;
      const snapTicks = getSnapTicks(snapDivision);
      const firstTick = Math.floor(viewRange.startTick / 24) * 24;

      for (let t = firstTick; t <= viewRange.endTick; t += 24) {
        const x = (t - viewRange.startTick) * pixelsPerTick;
        if (x < 0 || x > gridW) continue;

        const isBar = t % 384 === 0;
        const isBeat = t % 96 === 0;
        const isSnap = snapTicks > 1 && t % snapTicks === 0;

        if (isBar) {
          gridCtx.strokeStyle = "#3f3f46";
          gridCtx.lineWidth = 1.5;
        } else if (isBeat) {
          gridCtx.strokeStyle = "#27272a";
          gridCtx.lineWidth = 1;
        } else if (isSnap) {
          gridCtx.strokeStyle = "#1b1b22";
          gridCtx.lineWidth = 0.75;
        } else {
          continue;
        }

        gridCtx.beginPath();
        gridCtx.moveTo(x, 0);
        gridCtx.lineTo(x, gridH);
        gridCtx.stroke();

        // Render Bar Number in top margin
        if (isBar) {
          const barNum = Math.floor(t / 384) + 1;
          gridCtx.fillStyle = "#71717a";
          gridCtx.font = "bold 9px monospace";
          gridCtx.textAlign = "left";
          gridCtx.textBaseline = "top";
          gridCtx.fillText(`${barNum}`, x + 3, 3);
        }
      }

      // ── 3. DRAW MIDI NOTE BLOCKS ──
      const channelNotes = notes.filter((n) => n.channelId === selectedChannelId);

      for (const note of channelNotes) {
        // Skip notes outside viewport
        if (
          note.startTick + note.durationTicks < viewRange.startTick ||
          note.startTick > viewRange.endTick ||
          note.pitch < viewRange.minPitch ||
          note.pitch > viewRange.maxPitch
        ) {
          continue;
        }

        const noteX = tickToX(note.startTick, gridW);
        const noteW = Math.max(4, note.durationTicks * pixelsPerTick);
        const noteY = pitchToY(note.pitch) + 1;
        const noteH = PITCH_HEIGHT - 2;

        const isSelected = note.isSelected;
        const alpha = Math.max(0.45, Math.min(1.0, 0.4 + note.velocity * 0.6));

        // Note Body Fill
        if (isSelected) {
          // Safety Orange glow for selected notes
          gridCtx.fillStyle = `rgba(255, 68, 0, ${alpha})`;
          gridCtx.strokeStyle = "#ff4400";
        } else {
          // Phosphor Green for standard notes
          gridCtx.fillStyle = `rgba(0, 245, 155, ${alpha})`;
          gridCtx.strokeStyle = "rgba(0, 245, 155, 0.9)";
        }

        // Rounded note rectangle
        gridCtx.lineWidth = 1;
        gridCtx.beginPath();
        gridCtx.roundRect(noteX, noteY, noteW, noteH, 2);
        gridCtx.fill();
        gridCtx.stroke();

        // Top highlight shine
        gridCtx.fillStyle = "rgba(255, 255, 255, 0.3)";
        gridCtx.fillRect(noteX + 1, noteY + 1, Math.max(2, noteW - 2), 2);

        // Right edge resize handle notch
        if (noteW > 12) {
          gridCtx.fillStyle = isSelected
            ? "rgba(255, 255, 255, 0.5)"
            : "rgba(0, 0, 0, 0.4)";
          gridCtx.fillRect(noteX + noteW - 3, noteY + 2, 2, noteH - 4);
        }

        // Note Pitch Text if wide enough
        if (noteW > 28) {
          gridCtx.fillStyle = isSelected ? "#ffffff" : "#09090b";
          gridCtx.font = "bold 9px monospace";
          gridCtx.textAlign = "left";
          gridCtx.textBaseline = "middle";
          gridCtx.fillText(getPitchLabel(note.pitch), noteX + 4, noteY + noteH / 2);
        }
      }

      // ── 4. DRAW ACTIVE INTERACTION OVERLAYS ──
      const inter = interactionRef.current;
      if (inter.type === "marquee") {
        const left = Math.min(inter.startX, inter.currentX);
        const top = Math.min(inter.startY, inter.currentY);
        const width = Math.abs(inter.currentX - inter.startX);
        const height = Math.abs(inter.currentY - inter.startY);

        gridCtx.fillStyle = "rgba(0, 245, 155, 0.12)";
        gridCtx.strokeStyle = "#00f59b";
        gridCtx.lineWidth = 1;
        gridCtx.setLineDash([4, 4]);
        gridCtx.strokeRect(left, top, width, height);
        gridCtx.fillRect(left, top, width, height);
        gridCtx.setLineDash([]);
      } else if (inter.type === "slice") {
        // Vertical cutting laser line
        gridCtx.strokeStyle = "#ff4400";
        gridCtx.lineWidth = 1.5;
        gridCtx.setLineDash([3, 3]);
        gridCtx.beginPath();
        gridCtx.moveTo(inter.currentX, 0);
        gridCtx.lineTo(inter.currentX, gridH);
        gridCtx.stroke();
        gridCtx.setLineDash([]);
      }

      // ── 5. DRAW AUDIO PLAYHEAD LASER LINE ──
      if (isPlaying) {
        // Compute song playhead position in ticks
        const currentSongTick =
          ((position.bars - 1) * 4 + (position.beats - 1)) * 96 +
          Math.floor((position.ticks / 960) * 96);

        const playheadX = tickToX(currentSongTick, gridW);
        if (playheadX >= 0 && playheadX <= gridW) {
          // Playhead Beam
          gridCtx.strokeStyle = "#ff4400";
          gridCtx.lineWidth = 1.5;
          gridCtx.beginPath();
          gridCtx.moveTo(playheadX, 0);
          gridCtx.lineTo(playheadX, gridH);
          gridCtx.stroke();

          // Playhead Triangle Arrow Cap at top
          gridCtx.fillStyle = "#ff4400";
          gridCtx.beginPath();
          gridCtx.moveTo(playheadX - 5, 0);
          gridCtx.lineTo(playheadX + 5, 0);
          gridCtx.lineTo(playheadX, 8);
          gridCtx.closePath();
          gridCtx.fill();
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [
    viewRange,
    notes,
    selectedChannelId,
    snapDivision,
    scaleHighlight,
    rootPitch,
    isPlaying,
    position,
    hoveredKey,
    tickToX,
    pitchToY,
    isPitchInScale,
    totalTicks,
  ]);

  // ─────────────────────────────────────────────────────────────
  // CANVAS RESIZE OBSERVER
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      const gridCanvas = gridCanvasRef.current;
      const keysCanvas = keysCanvasRef.current;
      if (!container || !gridCanvas || !keysCanvas) return;

      const rect = container.getBoundingClientRect();
      const availableGridWidth = Math.max(200, rect.width - KEYBOARD_WIDTH);
      const contentHeight = totalPitches * PITCH_HEIGHT;

      gridCanvas.width = availableGridWidth;
      gridCanvas.height = contentHeight;

      keysCanvas.width = KEYBOARD_WIDTH;
      keysCanvas.height = contentHeight;
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [totalPitches]);

  // ─────────────────────────────────────────────────────────────
  // POINTER INTERACTIONS (DRAW, MOVE, RESIZE, SELECT, SLICE, ERASE)
  // ─────────────────────────────────────────────────────────────

  // Detect which note was hit at (x, y)
  const findNoteAt = useCallback(
    (x: number, y: number): { note: MidiNote; isResizeEdge: boolean } | null => {
      const gridCanvas = gridCanvasRef.current;
      if (!gridCanvas) return null;
      const gridW = gridCanvas.width;
      const pixelsPerTick = gridW / totalTicks;

      const pitch = yToPitch(y);
      const channelNotes = notes.filter((n) => n.channelId === selectedChannelId);

      for (let i = channelNotes.length - 1; i >= 0; i--) {
        const note = channelNotes[i];
        if (note.pitch !== pitch) continue;

        const noteX = tickToX(note.startTick, gridW);
        const noteW = Math.max(4, note.durationTicks * pixelsPerTick);

        if (x >= noteX && x <= noteX + noteW) {
          const isResizeEdge = x >= noteX + noteW - 8;
          return { note, isResizeEdge };
        }
      }
      return null;
    },
    [notes, selectedChannelId, totalTicks, yToPitch, tickToX]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = gridCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Right-click: delete note if hit
    if (e.button === 2) {
      e.preventDefault();
      const hit = findNoteAt(x, y);
      if (hit) {
        removeNote(hit.note.id);
      }
      return;
    }

    const hit = findNoteAt(x, y);

    // Eraser Tool
    if (tool === "erase") {
      if (hit) {
        removeNote(hit.note.id);
      }
      return;
    }

    // Slice Tool
    if (tool === "slice") {
      interactionRef.current = {
        type: "slice",
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
      };
      return;
    }

    // Hit existing note
    if (hit) {
      const { note, isResizeEdge } = hit;

      if (!note.isSelected && !e.shiftKey) {
        selectNote(note.id, false);
      } else if (e.shiftKey) {
        selectNote(note.id, true);
      }

      previewSynth.playNote(note.pitch, 0.25, note.velocity);

      if (isResizeEdge) {
        interactionRef.current = {
          type: "resize",
          startX: x,
          startY: y,
          currentX: x,
          currentY: y,
          targetNoteId: note.id,
          initialNoteState: {
            startTick: note.startTick,
            durationTicks: note.durationTicks,
            pitch: note.pitch,
          },
        };
      } else {
        // Moving selected notes
        const currentNotes = usePianoRollStore.getState().notes;
        const selected = currentNotes.filter((n) => n.isSelected);
        const snapshot = new Map<
          string,
          { startTick: number; durationTicks: number; pitch: number }
        >();
        for (const n of selected) {
          snapshot.set(n.id, {
            startTick: n.startTick,
            durationTicks: n.durationTicks,
            pitch: n.pitch,
          });
        }

        interactionRef.current = {
          type: "move",
          startX: x,
          startY: y,
          currentX: x,
          currentY: y,
          targetNoteId: note.id,
          initialNoteState: {
            startTick: note.startTick,
            durationTicks: note.durationTicks,
            pitch: note.pitch,
          },
          initialNotesSnapshot: snapshot,
        };
      }
      return;
    }

    // Clicked empty area
    if (tool === "select") {
      if (!e.shiftKey) {
        clearSelection();
      }
      interactionRef.current = {
        type: "marquee",
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
      };
      return;
    }

    // Drawing new note(s)
    if (tool === "draw") {
      clearSelection();
      const rawTick = xToTick(x, canvas.width);
      const startTick = quantize(rawTick);
      const pitch = yToPitch(y);
      const snapTicks = getSnapTicks(snapDivision);
      const durationTicks = Math.max(12, snapTicks > 1 ? snapTicks : 24);

      previewSynth.playNote(pitch, 0.3, 0.85);

      if (chordStamp !== "none") {
        // Stamp full chord
        const intervals = CHORD_STAMP_INTERVALS[chordStamp];
        for (const offset of intervals) {
          const chordPitch = pitch + offset;
          if (chordPitch <= 127) {
            addNote({
              channelId: selectedChannelId,
              pitch: chordPitch,
              startTick,
              durationTicks,
              velocity: 0.85,
            });
          }
        }
      } else {
        // Single note
        const noteId = addNote({
          channelId: selectedChannelId,
          pitch,
          startTick,
          durationTicks,
          velocity: 0.88,
          isSelected: true,
        });

        interactionRef.current = {
          type: "draw",
          startX: x,
          startY: y,
          currentX: x,
          currentY: y,
          targetNoteId: noteId,
          initialNoteState: {
            startTick,
            durationTicks,
            pitch,
          },
        };
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = gridCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const inter = interactionRef.current;
    inter.currentX = x;
    inter.currentY = y;

    if (inter.type === "idle") {
      // Update cursor depending on hover target
      if (tool === "erase") {
        setCursorStyle("not-allowed");
      } else if (tool === "slice") {
        setCursorStyle("col-resize");
      } else if (tool === "select") {
        setCursorStyle("crosshair");
      } else {
        const hit = findNoteAt(x, y);
        if (hit?.isResizeEdge) {
          setCursorStyle("ew-resize");
        } else if (hit) {
          setCursorStyle("move");
        } else {
          setCursorStyle("crosshair");
        }
      }
      return;
    }

    if (inter.type === "draw" && inter.targetNoteId && inter.initialNoteState) {
      const currentTick = xToTick(x, canvas.width);
      const snapTicks = getSnapTicks(snapDivision);
      const rawDelta = currentTick - inter.initialNoteState.startTick;
      const quantizedDuration = Math.max(
        snapTicks > 1 ? snapTicks : 12,
        quantize(rawDelta)
      );

      updateNote(inter.targetNoteId, {
        durationTicks: quantizedDuration,
      });
    } else if (inter.type === "resize" && inter.targetNoteId && inter.initialNoteState) {
      const currentTick = xToTick(x, canvas.width);
      const rawDelta = currentTick - inter.initialNoteState.startTick;
      const snapTicks = getSnapTicks(snapDivision);
      const quantizedDuration = Math.max(
        snapTicks > 1 ? snapTicks : 12,
        quantize(rawDelta)
      );

      updateNote(inter.targetNoteId, {
        durationTicks: quantizedDuration,
      });
    } else if (inter.type === "move" && inter.initialNoteState && inter.initialNotesSnapshot) {
      const deltaTick = quantize(xToTick(x, canvas.width) - xToTick(inter.startX, canvas.width));
      const currentPitch = yToPitch(y);
      const deltaPitch = currentPitch - inter.initialNoteState.pitch;

      // Update all selected notes by delta
      inter.initialNotesSnapshot.forEach((initial, id) => {
        const newStart = Math.max(0, initial.startTick + deltaTick);
        const newPitch = Math.max(0, Math.min(127, initial.pitch + deltaPitch));
        updateNote(id, {
          startTick: newStart,
          pitch: newPitch,
        });
      });
    } else if (inter.type === "marquee") {
      // Find all notes inside marquee box
      const leftX = Math.min(inter.startX, inter.currentX);
      const rightX = Math.max(inter.startX, inter.currentX);
      const topY = Math.min(inter.startY, inter.currentY);
      const bottomY = Math.max(inter.startY, inter.currentY);

      const leftTick = xToTick(leftX, canvas.width);
      const rightTick = xToTick(rightX, canvas.width);
      const topPitch = yToPitch(topY);
      const bottomPitch = yToPitch(bottomY);

      const minP = Math.min(topPitch, bottomPitch);
      const maxP = Math.max(topPitch, bottomPitch);

      const allNotes = usePianoRollStore.getState().notes;
      for (const note of allNotes) {
        if (note.channelId !== selectedChannelId) continue;
        const noteEnd = note.startTick + note.durationTicks;
        const overlaps =
          noteEnd >= leftTick &&
          note.startTick <= rightTick &&
          note.pitch >= minP &&
          note.pitch <= maxP;

        if (overlaps !== note.isSelected) {
          updateNote(note.id, { isSelected: overlaps });
        }
      }
    }
  };

  const handlePointerUp = () => {
    const inter = interactionRef.current;
    if (inter.type === "slice") {
      const canvas = gridCanvasRef.current;
      if (canvas) {
        const sliceTick = quantize(xToTick(inter.currentX, canvas.width));
        sliceNotesAtTick(sliceTick);
      }
    }

    interactionRef.current = {
      type: "idle",
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
    };
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = gridCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hit = findNoteAt(x, y);
    if (hit) {
      removeNote(hit.note.id);
    }
  };

  // Keyboard audition interactions
  const handleKeyClick = (pitch: number) => {
    previewSynth.playNote(pitch, 0.35, 0.9);
  };

  // Mouse wheel scrolling & zooming
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.altKey) {
      // Horizontal zoom
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 1.15 : 0.85;
      const currentSpan = viewRange.endTick - viewRange.startTick;
      const newSpan = Math.max(192, Math.min(384 * 32, currentSpan * zoomFactor));
      setViewRange({ endTick: Math.round(viewRange.startTick + newSpan) });
    } else if (e.shiftKey) {
      // Horizontal pan
      const panDelta = Math.round((e.deltaY || e.deltaX) * 2);
      const span = viewRange.endTick - viewRange.startTick;
      const newStart = Math.max(0, viewRange.startTick + panDelta);
      setViewRange({
        startTick: newStart,
        endTick: newStart + span,
      });
    } else {
      // Vertical pitch scroll
      const pitchDelta = e.deltaY > 0 ? -2 : 2;
      const span = viewRange.maxPitch - viewRange.minPitch;
      let newMax = viewRange.maxPitch + pitchDelta;
      let newMin = viewRange.minPitch + pitchDelta;

      if (newMax > 127) {
        newMax = 127;
        newMin = 127 - span;
      }
      if (newMin < 0) {
        newMin = 0;
        newMax = span;
      }

      setViewRange({ minPitch: newMin, maxPitch: newMax });
    }
  };

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      className="relative flex flex-1 w-full h-full overflow-hidden bg-[#09090b] select-none"
    >
      {/* ── Left Keyboard Canvas ── */}
      <div
        className="shrink-0 border-r border-[#27272a] bg-[#0c0c10] shadow-[2px_0_8px_rgba(0,0,0,0.5)] z-10"
        style={{ width: KEYBOARD_WIDTH }}
      >
        <canvas
          ref={keysCanvasRef}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const p = yToPitch(y);
            setHoveredKey(p);
          }}
          onMouseLeave={() => setHoveredKey(null)}
          onMouseDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const p = yToPitch(y);
            handleKeyClick(p);
          }}
          className="cursor-pointer"
        />
      </div>

      {/* ── Center Note Grid Canvas ── */}
      <div className="relative flex-1 h-full overflow-hidden">
        <canvas
          ref={gridCanvasRef}
          onContextMenu={(e) => {
            e.preventDefault();
            const canvas = gridCanvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const hit = findNoteAt(x, y);
            if (hit) {
              removeNote(hit.note.id);
            }
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDoubleClick={handleDoubleClick}
          style={{ cursor: cursorStyle }}
          className="block w-full h-full"
        />
      </div>
    </div>
  );
};
