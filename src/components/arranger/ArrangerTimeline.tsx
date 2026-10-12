"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type TimelineClip,
  snapToGrid,
  useArrangerStore,
} from "@/stores/arranger-store";
import { useTransportStore } from "@/stores/transport-store";
import { ArrangerRuler } from "./ArrangerRuler";
import { ArrangerToolbar } from "./ArrangerToolbar";
import { TakeFolderView } from "./TakeFolderView";

const HEADER_WIDTH = 240;

export interface ArrangerTimelineProps {
  onOpenPianoRoll?: (channelId?: string) => void;
  onOpenChannelRack?: () => void;
}

export const ArrangerTimeline: React.FC<ArrangerTimelineProps> = ({
  onOpenPianoRoll,
}) => {
  const tracks = useArrangerStore((s) => s.tracks);
  const clips = useArrangerStore((s) => s.clips);
  const zoomX = useArrangerStore((s) => s.zoomX);
  const snapGrid = useArrangerStore((s) => s.snapGrid);
  const activeTool = useArrangerStore((s) => s.activeTool);
  const totalBars = useArrangerStore((s) => s.totalBars);
  const isRecordingActive = useArrangerStore((s) => s.isRecordingActive);
  const recordingStartBar = useArrangerStore((s) => s.recordingStartBar);
  const activeRecordingTrackId = useArrangerStore((s) => s.activeRecordingTrackId);

  const addClip = useArrangerStore((s) => s.addClip);
  const removeClip = useArrangerStore((s) => s.removeClip);
  const moveClip = useArrangerStore((s) => s.moveClip);
  const resizeClip = useArrangerStore((s) => s.resizeClip);
  const splitClipAtBar = useArrangerStore((s) => s.splitClipAtBar);
  const selectClip = useArrangerStore((s) => s.selectClip);
  const clearSelection = useArrangerStore((s) => s.clearSelection);
  const toggleClipMute = useArrangerStore((s) => s.toggleClipMute);

  const toggleTrackMute = useArrangerStore((s) => s.toggleTrackMute);
  const toggleTrackSolo = useArrangerStore((s) => s.toggleTrackSolo);
  const toggleTrackArm = useArrangerStore((s) => s.toggleTrackArm);
  const removeTrack = useArrangerStore((s) => s.removeTrack);

  const position = useTransportStore((s) => s.position);
  const isPlaying = useTransportStore((s) => s.isPlaying);

  const gridScrollRef = useRef<HTMLDivElement>(null);
  const [dragHoverTrackId, setDragHoverTrackId] = useState<string | null>(null);
  const [dragHoverBar, setDragHoverBar] = useState<number | null>(null);

  // Playhead position
  const playheadBar =
    position.bars + (position.beats - 1) / 4 + position.ticks / (4 * 240);
  const playheadPx = (playheadBar - 1) * zoomX;

  // Auto-scroll playhead during playback if out of view
  useEffect(() => {
    if (isPlaying && gridScrollRef.current) {
      const scrollEl = gridScrollRef.current;
      const currentScroll = scrollEl.scrollLeft;
      const viewportWidth = scrollEl.clientWidth;
      if (playheadPx > currentScroll + viewportWidth - 40) {
        scrollEl.scrollLeft = playheadPx - 60;
      }
    }
  }, [isPlaying, playheadPx]);

  // Handle clip move / trim gesture
  const handleClipPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    clip: TimelineClip,
    handleType: "body" | "left" | "right"
  ) => {
    e.stopPropagation();

    // Tool interactions
    if (activeTool === "eraser") {
      removeClip(clip.id);
      return;
    }
    if (activeTool === "mute") {
      toggleClipMute(clip.id);
      return;
    }
    if (activeTool === "scissors") {
      if (!gridScrollRef.current) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const clickPx = e.clientX - rect.left;
      const offsetBars = clickPx / zoomX;
      const splitBar = clip.startBar + offsetBars;
      splitClipAtBar(clip.id, splitBar);
      return;
    }

    // Pointer tool selection
    selectClip(clip.id, e.shiftKey);

    // Start drag
    const startX = e.clientX;
    const startY = e.clientY;
    const origStartBar = clip.startBar;
    const origDuration = clip.durationBars;
    const origOffset = clip.offsetBars;
    const origTrackId = clip.trackId;

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const onPointerMove = (ev: PointerEvent) => {
      const deltaX = ev.clientX - startX;
      const deltaBars = deltaX / zoomX;

      if (handleType === "body") {
        const nextStart = Math.max(1, origStartBar + deltaBars);
        // Track vertical move calculation
        const deltaY = ev.clientY - startY;
        const trackIndexOffset = Math.round(deltaY / 72);
        const curIdx = tracks.findIndex((t) => t.id === origTrackId);
        const newIdx = Math.max(0, Math.min(tracks.length - 1, curIdx + trackIndexOffset));
        const newTrackId = tracks[newIdx]?.id || origTrackId;

        moveClip(clip.id, nextStart, newTrackId);
      } else if (handleType === "left") {
        const nextStart = Math.max(1, origStartBar + deltaBars);
        const nextDuration = Math.max(0.125, origDuration - (nextStart - origStartBar));
        const nextOffset = origOffset + (nextStart - origStartBar);
        resizeClip(clip.id, nextStart, nextDuration, nextOffset);
      } else if (handleType === "right") {
        const nextDuration = Math.max(0.125, origDuration + deltaBars);
        resizeClip(clip.id, origStartBar, nextDuration, origOffset);
      }
    };

    const onPointerUp = (ev: PointerEvent) => {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId);
      } catch {
        // pointer lost
      }
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  // Drag and drop from SampleBrowser onto a track lane
  const handleTrackDragOver = (e: React.DragEvent, trackId: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!gridScrollRef.current) return;
    const rect = gridScrollRef.current.getBoundingClientRect();
    const scrollLeft = gridScrollRef.current.scrollLeft;
    const clickPx = e.clientX - rect.left + scrollLeft - HEADER_WIDTH;
    const bar = Math.max(1, snapToGrid(clickPx / zoomX + 1, snapGrid));

    setDragHoverTrackId(trackId);
    setDragHoverBar(bar);
  };

  const handleTrackDragLeave = () => {
    setDragHoverTrackId(null);
    setDragHoverBar(null);
  };

  const handleTrackDrop = async (e: React.DragEvent, trackId: string) => {
    e.preventDefault();
    e.stopPropagation();

    const targetBar = dragHoverBar || 1;
    setDragHoverTrackId(null);
    setDragHoverBar(null);

    const sampleStr = e.dataTransfer.getData("application/hybrid-daw-sample");
    if (sampleStr) {
      try {
        const data = JSON.parse(sampleStr);
        const fallbackSampleId = `sample-${String(data.name || "drop").replace(/[^a-zA-Z0-9_-]/g, "_")}`;
        addClip({
          trackId,
          name: `${data.name}.wav`,
          type: "audio",
          sourceId: data.sampleId || fallbackSampleId,
          startBar: targetBar,
          durationBars: 4,
          offsetBars: 0,
          color: "#fbbf24",
          isSelected: false,
          isMuted: false,
          waveformPeaks: data.peaks || [],
        });
      } catch (err) {
        console.warn("[Arranger] Drop parse error:", err);
      }
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-sm border border-[#27272A] bg-[#09090b] font-mono select-none">
      {/* ── Arranger Toolbar ── */}
      <ArrangerToolbar />

      {/* ── Scrollable Arranger Grid with Fixed Time Ruler ── */}
      <div
        ref={gridScrollRef}
        onClick={() => clearSelection()}
        className="flex flex-1 flex-col overflow-x-auto overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800"
      >
        {/* ── Time Ruler ── */}
        <ArrangerRuler totalBars={totalBars} headerWidth={HEADER_WIDTH} />

        {/* ── Multi-Track Swimlane Container ── */}
        <div
          style={{ width: `${HEADER_WIDTH + totalBars * zoomX}px` }}
          className="relative flex flex-col divide-y divide-zinc-800/80"
        >
          {/* Playhead Laser Needle Line Gliding Vertically Across All Tracks */}
          <div
            style={{
              transform: `translateX(${HEADER_WIDTH + playheadPx}px)`,
            }}
            className="pointer-events-none absolute top-0 bottom-0 z-30 w-0 -translate-x-1/2"
          >
            <div className="h-full w-[2px] bg-telemetry-orange shadow-[0_0_12px_rgba(255,68,0,0.9)]" />
          </div>

          {tracks.map((track) => {
            const trackClips = clips.filter((c) => c.trackId === track.id);
            const isHovered = dragHoverTrackId === track.id;
            const expandedTakeClip = trackClips.find(
              (c) => c.takeFolder && c.takeFolder.isExpanded
            );
            const takeCount = expandedTakeClip?.takeFolder?.takes.length || 0;
            const effectiveTrackHeight = expandedTakeClip
              ? Math.max(track.height, 64 + takeCount * 36)
              : track.height;

            return (
              <div
                key={track.id}
                style={{ height: `${effectiveTrackHeight}px` }}
                onDragOver={(e) => handleTrackDragOver(e, track.id)}
                onDragLeave={handleTrackDragLeave}
                onDrop={(e) => handleTrackDrop(e, track.id)}
                className="group relative flex shrink-0 transition-all duration-150"
              >
                {/* ── Track Header Column (Left) ── */}
                <div
                  style={{ width: `${HEADER_WIDTH}px` }}
                  className="sticky left-0 z-20 flex h-full items-center justify-between border-r border-[#27272A] bg-[#0d0d12] px-2.5 shadow-[2px_0_5px_rgba(0,0,0,0.6)]"
                >
                  {/* Color Beacon & Name & Armed REC Tally */}
                  <div className="flex items-center gap-2 truncate pr-2">
                    <div
                      className="h-8 w-1 shrink-0 rounded-full shadow-[0_0_8px_currentColor]"
                      style={{ backgroundColor: track.color, color: track.color }}
                    />
                    <div className="flex flex-col truncate">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="truncate text-xs font-bold text-zinc-200">
                          {track.name}
                        </span>
                        {track.isArmed && (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-[2px] px-1 py-0.2 font-mono text-[8px] font-black uppercase tracking-wider transition-all",
                              isRecordingActive && activeRecordingTrackId === track.id
                                ? "border border-red-500 bg-red-900 text-white animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.7)]"
                                : "border border-red-500/60 bg-red-950/80 text-red-400 animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite]"
                            )}
                            title="Track Record Armed"
                          >
                            <span className="size-1.5 rounded-full bg-red-500 animate-ping" />
                            ● REC
                          </span>
                        )}
                      </div>
                      <span className="text-[8px] text-zinc-500 uppercase">
                        {track.type}
                      </span>
                    </div>
                  </div>

                  {/* Tactile Controls: Mute, Solo, Arm, Vol */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTrackMute(track.id);
                      }}
                      className={cn(
                        "flex size-5 items-center justify-center rounded-[2px] border text-[8px] font-bold transition-all",
                        track.isMuted
                          ? "border-red-500 bg-red-950 text-red-400"
                          : "border-zinc-800 bg-[#060608] text-zinc-500 hover:text-zinc-200"
                      )}
                      title="Mute Track"
                    >
                      M
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTrackSolo(track.id);
                      }}
                      className={cn(
                        "flex size-5 items-center justify-center rounded-[2px] border text-[8px] font-bold transition-all",
                        track.isSolo
                          ? "border-amber-500 bg-amber-950 text-amber-400"
                          : "border-zinc-800 bg-[#060608] text-zinc-500 hover:text-zinc-200"
                      )}
                      title="Solo Track"
                    >
                      S
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTrackArm(track.id);
                      }}
                      className={cn(
                        "flex size-5 items-center justify-center rounded-[2px] border text-[8px] font-bold transition-all",
                        track.isArmed
                          ? "border-telemetry-orange bg-orange-950 text-telemetry-orange shadow-[0_0_6px_rgba(255,68,0,0.5)]"
                          : "border-zinc-800 bg-[#060608] text-zinc-500 hover:text-zinc-200"
                      )}
                      title="Record Arm"
                    >
                      R
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTrack(track.id);
                      }}
                      className="hidden size-5 items-center justify-center rounded-[2px] text-zinc-600 hover:text-red-400 group-hover:flex"
                      title="Delete Track"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>

                {/* ── Track Arrangement Lane Surface ── */}
                <div
                  style={{ width: `${totalBars * zoomX}px` }}
                  className={cn(
                    "relative h-full bg-[#08080c] transition-colors",
                    isHovered && "bg-telemetry-orange/5"
                  )}
                >
                  {/* Bar Vertical Grid Ticks */}
                  {Array.from({ length: totalBars }).map((_, barIdx) => (
                    <div
                      key={barIdx}
                      style={{
                        left: `${barIdx * zoomX}px`,
                        width: `${zoomX}px`,
                      }}
                      className="pointer-events-none absolute top-0 bottom-0 border-l border-zinc-800/50"
                    />
                  ))}

                  {/* Drag-over Placement Preview Ghost */}
                  {isHovered && dragHoverBar !== null && (
                    <div
                      style={{
                        left: `${(dragHoverBar - 1) * zoomX}px`,
                        width: `${4 * zoomX}px`,
                      }}
                      className="pointer-events-none absolute top-1 bottom-1 rounded-[2px] border-2 border-dashed border-telemetry-orange bg-telemetry-orange/20 animate-pulse z-10"
                    />
                  )}

                  {/* ── Active Live Recording Bounds Box (Follows Playhead Sweep) ── */}
                  {isRecordingActive && activeRecordingTrackId === track.id && (
                    <div
                      style={{
                        left: `${(recordingStartBar - 1) * zoomX}px`,
                        width: `${Math.max(16, (playheadBar - recordingStartBar) * zoomX)}px`,
                      }}
                      className="pointer-events-none absolute top-1 bottom-1 z-30 flex items-center overflow-hidden rounded-[2px] border-2 border-red-500 bg-red-950/40 shadow-[0_0_16px_rgba(239,68,68,0.5)] backdrop-blur-xs"
                    >
                      <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,rgba(239,68,68,0.2),rgba(239,68,68,0.2)_10px,transparent_10px,transparent_20px)] animate-[pulse_1.5s_ease-in-out_infinite]" />
                      <div className="relative flex items-center gap-1.5 px-2 font-mono text-[9px] font-black tracking-widest text-red-200 uppercase drop-shadow">
                        <span className="size-2 rounded-full bg-red-500 animate-ping" />
                        <span>REC LIVE PCM</span>
                      </div>
                    </div>
                  )}

                  {/* ── Clips inside this track ── */}
                  {trackClips.map((clip) => {
                    if (clip.takeFolder) {
                      return (
                        <TakeFolderView
                          key={clip.id}
                          clip={clip}
                          zoomX={zoomX}
                          snapGrid={snapGrid}
                          trackColor={track.color}
                          onPointerDown={(e, handle) =>
                            handleClipPointerDown(e, clip, handle)
                          }
                        />
                      );
                    }

                    const clipLeft = (clip.startBar - 1) * zoomX;
                    const clipWidth = clip.durationBars * zoomX;

                    return (
                      <div
                        key={clip.id}
                        onPointerDown={(e) => handleClipPointerDown(e, clip, "body")}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (clip.type === "pattern") {
                            onOpenPianoRoll?.(clip.sourceId);
                          }
                        }}
                        className={cn(
                          "group/clip absolute top-1 bottom-1 flex flex-col rounded-[2px] border select-none overflow-hidden transition-shadow shadow-md",
                          clip.isSelected
                            ? "border-white ring-2 ring-white/50 z-20"
                            : "border-zinc-700/80 hover:border-zinc-500 z-10",
                          clip.isMuted && "opacity-40 grayscale"
                        )}
                        style={{
                          left: `${clipLeft}px`,
                          width: `${clipWidth}px`,
                          backgroundColor: `${clip.color}18`,
                          borderColor: clip.isSelected ? "#ffffff" : `${clip.color}88`,
                        }}
                      >
                        {/* ── Clip Header Bar ── */}
                        <div
                          className="flex h-4 items-center justify-between px-1 text-[8px] font-bold"
                          style={{
                            backgroundColor: `${clip.color}35`,
                            color: clip.color,
                          }}
                        >
                          <span className="truncate">{clip.name}</span>
                          <span className="font-mono text-[7px] uppercase opacity-75">
                            {clip.type === "pattern" ? "PTRN" : "AUDIO"}
                          </span>
                        </div>

                        {/* ── Clip Body: Waveform or Step Pattern Visualization ── */}
                        <div className="relative flex flex-1 items-center px-1 overflow-hidden">
                          {clip.type === "audio" ? (
                            /* Audio Waveform Responsive Peak Bars */
                            <div className="flex h-full w-full items-center justify-between gap-[1px] py-1">
                              {(clip.waveformPeaks && clip.waveformPeaks.length > 0
                                ? clip.waveformPeaks
                                : [0.4, 0.7, 0.5, 0.9, 0.3, 0.6, 0.8, 0.5, 0.3, 0.7]
                              ).map((peak, pIdx) => (
                                <div
                                  key={pIdx}
                                  className="flex-1 min-w-[1px] max-w-[4px] rounded-xs transition-all"
                                  style={{
                                    height: `${Math.max(12, Math.round(peak * 90))}%`,
                                    backgroundColor: clip.color,
                                    opacity: 0.9,
                                  }}
                                />
                              ))}
                            </div>
                          ) : (
                            /* Pattern Step Matrix Preview Dots */
                            <div className="grid grid-cols-8 gap-1 opacity-70">
                              {Array.from({ length: 16 }).map((_, dotIdx) => (
                                <div
                                  key={dotIdx}
                                  className={cn(
                                    "size-1.5 rounded-xs",
                                    dotIdx % 4 === 0
                                      ? "bg-telemetry-orange shadow-[0_0_4px_currentColor]"
                                      : "bg-zinc-600"
                                  )}
                                  style={{
                                    backgroundColor: dotIdx % 4 === 0 ? clip.color : undefined,
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </div>

                        {/* ── Left Edge Trim Handle ── */}
                        <div
                          onPointerDown={(e) => handleClipPointerDown(e, clip, "left")}
                          className="absolute top-0 bottom-0 left-0 w-2 cursor-ew-resize hover:bg-white/40 z-30"
                          title="Drag to trim clip start"
                        />

                        {/* ── Right Edge Trim Handle ── */}
                        <div
                          onPointerDown={(e) => handleClipPointerDown(e, clip, "right")}
                          className="absolute top-0 bottom-0 right-0 w-2 cursor-ew-resize hover:bg-white/40 z-30"
                          title="Drag to trim clip end"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
