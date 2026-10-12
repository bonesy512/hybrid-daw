"use client";

import React, { useEffect, useState, useTransition } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileAudio,
  Folder,
  FolderOpen,
  HardDrive,
  Music,
  Play,
  RefreshCw,
  Search,
  Square,
  Volume2,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type BrowserEntry,
  type SampleMetadata,
  listBrowserDirectory,
  loadSample,
  previewSample,
  stopPreview,
} from "@/lib/audio/tauri-bridge";

export interface SampleBrowserProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const SampleBrowser: React.FC<SampleBrowserProps> = ({
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [entries, setEntries] = useState<BrowserEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeAuditionPath, setActiveAuditionPath] = useState<string | null>(null);
  const [selectedSampleMeta, setSelectedSampleMeta] = useState<SampleMetadata | null>(null);
  const [, startTransition] = useTransition();

  // Load directory items
  const fetchDirectory = async (path: string | null) => {
    setIsLoading(true);
    try {
      const items = await listBrowserDirectory(path || undefined);
      setEntries(items);
    } catch (err) {
      console.warn("[SampleBrowser] Failed to list directory:", err);
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDirectory(currentPath);
  }, [currentPath]);

  // Handle navigate into folder
  const handleOpenFolder = (dirPath: string) => {
    if (currentPath) {
      setHistory((prev) => [...prev, currentPath]);
    }
    setCurrentPath(dirPath);
    setSearchQuery("");
  };

  // Handle navigate back up
  const handleGoBack = () => {
    if (history.length > 0) {
      const prev = history[history.length - 1];
      setHistory((h) => h.slice(0, -1));
      setCurrentPath(prev);
    } else {
      setCurrentPath(null);
    }
  };

  // Audition playback
  const handleAudition = async (entry: BrowserEntry) => {
    if (activeAuditionPath === entry.path) {
      // Toggle off
      await stopPreview();
      setActiveAuditionPath(null);
      return;
    }

    setActiveAuditionPath(entry.path);
    await previewSample(entry.path);

    // Eagerly fetch/cache metadata for waveform preview
    startTransition(async () => {
      try {
        const meta = await loadSample(entry.path);
        setSelectedSampleMeta(meta);
      } catch (err) {
        console.warn("[SampleBrowser] Metadata load failed:", err);
      }
    });
  };

  // Spacebar hotkey to toggle preview of active or selected sample
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === "Space" &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
        if (activeAuditionPath) {
          e.preventDefault();
          stopPreview();
          setActiveAuditionPath(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeAuditionPath]);

  // Filtered files
  const filteredEntries = entries.filter((e) =>
    e.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Format bytes to clean text
  const formatSize = (bytes: number | null | undefined): string => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Drag start handler
  const handleDragStart = (e: React.DragEvent, entry: BrowserEntry) => {
    const dragPayload = {
      filePath: entry.path,
      name: entry.name.replace(/\.[^/.]+$/, ""),
      sampleId: selectedSampleMeta?.id || `file-${Date.now()}`,
      peaks: selectedSampleMeta?.waveform_peaks || [],
    };

    e.dataTransfer.setData("application/hybrid-daw-sample", JSON.stringify(dragPayload));
    e.dataTransfer.setData("text/plain", entry.path);
    e.dataTransfer.effectAllowed = "copyMove";
  };

  if (isCollapsed) {
    return (
      <aside className="relative flex w-10 flex-col items-center border-r border-[#27272A] bg-[#0c0c10] py-3 select-none shrink-0 transition-all">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex h-8 w-8 items-center justify-center rounded-xs border border-zinc-800 bg-[#070709] text-zinc-400 hover:border-zinc-700 hover:text-telemetry-orange transition-colors"
          title="Expand Sample Browser"
        >
          <ChevronRight className="size-4" />
        </button>

        <div className="flex flex-1 flex-col items-center justify-center py-6">
          <span className="font-mono text-[9px] font-bold tracking-[0.25em] text-zinc-500 uppercase [writing-mode:vertical-lr]">
            SAMPLE BROWSER
          </span>
        </div>

        <Folder className="size-4 text-zinc-600 mb-2" />
      </aside>
    );
  }

  return (
    <aside className="relative flex w-64 flex-col border-r border-[#27272A] bg-[#0c0c10] font-mono select-none shrink-0 transition-all duration-200">
      {/* ── Header ── */}
      <div className="flex h-10 items-center justify-between border-b border-[#27272A] bg-[#0f0f15] px-2.5 shrink-0">
        <div className="flex items-center gap-1.5 text-zinc-200">
          <FolderOpen className="size-3.5 text-telemetry-orange" />
          <span className="text-[11px] font-bold tracking-wider uppercase">
            BROWSER
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Refresh */}
          <button
            type="button"
            onClick={() => fetchDirectory(currentPath)}
            disabled={isLoading}
            className="flex size-6 items-center justify-center rounded-xs border border-zinc-800 bg-[#08080a] text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
            title="Refresh Directory"
          >
            <RefreshCw className={cn("size-3", isLoading && "animate-spin text-telemetry-orange")} />
          </button>

          {/* Collapse Button */}
          <button
            type="button"
            onClick={onToggleCollapse}
            className="flex size-6 items-center justify-center rounded-xs border border-zinc-800 bg-[#08080a] text-zinc-400 hover:text-zinc-200"
            title="Collapse Browser"
          >
            <ChevronLeft className="size-3.5" />
          </button>
        </div>
      </div>

      {/* ── Search & Filter ── */}
      <div className="border-b border-zinc-800/80 bg-[#09090c] p-2">
        <div className="relative flex items-center">
          <Search className="absolute left-2 size-3 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search samples..."
            className="w-full rounded-xs border border-zinc-800 bg-black/60 py-1 pr-2 pl-7 font-mono text-[10px] text-zinc-200 placeholder:text-zinc-600 focus:border-telemetry-orange focus:outline-none"
          />
        </div>
      </div>

      {/* ── Breadcrumb Bar ── */}
      <div className="flex h-7 items-center gap-1.5 border-b border-zinc-800/60 bg-[#08080a] px-2 text-[10px] text-zinc-400 overflow-hidden">
        {currentPath ? (
          <>
            <button
              type="button"
              onClick={handleGoBack}
              className="flex items-center gap-0.5 text-telemetry-orange hover:text-zinc-200 font-bold"
            >
              <ChevronLeft className="size-3" />
              <span>UP</span>
            </button>
            <span className="text-zinc-600">/</span>
            <span className="truncate text-zinc-300 font-semibold" title={currentPath}>
              {currentPath.split(/[/\\]/).pop()}
            </span>
          </>
        ) : (
          <span className="flex items-center gap-1 text-[9px] text-zinc-500 font-bold uppercase tracking-wider">
            <HardDrive className="size-3" />
            <span>LOCATIONS & BOOKMARKS</span>
          </span>
        )}
      </div>

      {/* ── File & Folder List ── */}
      <div className="flex-1 overflow-y-auto p-1.5 scrollbar-thin scrollbar-thumb-zinc-800">
        {filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-zinc-600">
            <Music className="size-6 mb-1.5 opacity-40" />
            <span className="text-[10px]">No audio files found</span>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {filteredEntries.map((entry) => {
              const isPlaying = activeAuditionPath === entry.path;

              if (entry.is_directory) {
                return (
                  <button
                    key={entry.path}
                    type="button"
                    onClick={() => handleOpenFolder(entry.path)}
                    className="group flex h-7 items-center gap-2 rounded-xs px-2 text-left text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-100 transition-colors"
                  >
                    <Folder className="size-3.5 text-amber-500/80 group-hover:text-amber-400 shrink-0" />
                    <span className="truncate text-[11px]">{entry.name}</span>
                  </button>
                );
              }

              // Audio format badge colors
              const ext = (entry.extension || "").toLowerCase();
              const badgeColor =
                ext === "wav"
                  ? "text-telemetry-green border-telemetry-green/30"
                  : ext === "flac"
                  ? "text-sky-400 border-sky-400/30"
                  : ext === "mp3"
                  ? "text-amber-400 border-amber-400/30"
                  : "text-zinc-400 border-zinc-700";

              return (
                <div
                  key={entry.path}
                  draggable
                  onDragStart={(e) => handleDragStart(e, entry)}
                  onClick={() => handleAudition(entry)}
                  className={cn(
                    "group flex h-8 items-center gap-2 rounded-xs px-2 cursor-grab active:cursor-grabbing select-none border transition-all",
                    isPlaying
                      ? "border-telemetry-green/60 bg-telemetry-green/10 text-zinc-100 shadow-[0_0_10px_rgba(0,245,155,0.15)]"
                      : "border-transparent text-zinc-400 hover:border-zinc-800 hover:bg-zinc-900/60 hover:text-zinc-200"
                  )}
                  title={`${entry.name} (Click or Space to Audition, Drag into Channel Rack)`}
                >
                  {/* Play/Stop Icon Trigger */}
                  <div className="shrink-0">
                    {isPlaying ? (
                      <Square className="size-3 text-telemetry-green fill-telemetry-green animate-pulse" />
                    ) : (
                      <FileAudio className="size-3.5 text-zinc-500 group-hover:text-telemetry-orange transition-colors" />
                    )}
                  </div>

                  {/* Name */}
                  <div className="flex flex-1 items-center truncate">
                    <span className="truncate text-[11px] font-medium">
                      {entry.name.replace(/\.[^/.]+$/, "")}
                    </span>
                  </div>

                  {/* Ext badge & size */}
                  <div className="flex items-center gap-1 shrink-0 text-[8px]">
                    {entry.size_bytes && (
                      <span className="text-zinc-600 font-mono hidden group-hover:inline">
                        {formatSize(entry.size_bytes)}
                      </span>
                    )}
                    <span
                      className={cn(
                        "rounded-[2px] border px-1 py-0.2 uppercase font-bold tracking-tighter",
                        badgeColor
                      )}
                    >
                      {ext || "AUD"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Active Audition Waveform Preview Footer ── */}
      {selectedSampleMeta && (
        <div className="border-t border-[#27272A] bg-[#08080c] p-2 shrink-0 animate-in fade-in duration-150">
          <div className="flex items-center justify-between text-[9px] text-zinc-400 pb-1">
            <span className="truncate font-bold text-zinc-200">
              {selectedSampleMeta.name}
            </span>
            <span className="text-telemetry-green font-mono">
              {selectedSampleMeta.duration_seconds.toFixed(2)}s
            </span>
          </div>

          {/* Mini Waveform Visualization */}
          <div className="flex h-7 items-center justify-between gap-[1px] rounded-[2px] border border-zinc-800/80 bg-black/60 px-1 py-0.5 overflow-hidden">
            {selectedSampleMeta.waveform_peaks.slice(0, 48).map((peak, idx) => {
              const heightPct = Math.max(10, Math.round(peak * 100));
              return (
                <div
                  key={idx}
                  className={cn(
                    "w-[3px] rounded-xs transition-all",
                    activeAuditionPath === selectedSampleMeta.file_path
                      ? "bg-telemetry-green"
                      : "bg-zinc-600"
                  )}
                  style={{ height: `${heightPct}%` }}
                />
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-1 font-mono text-[8px] text-zinc-500">
            <span>{selectedSampleMeta.sample_rate} Hz</span>
            <span className="text-telemetry-orange font-bold uppercase">
              DRAG TO CHANNEL RACK
            </span>
          </div>
        </div>
      )}
    </aside>
  );
};
