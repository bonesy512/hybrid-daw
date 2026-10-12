"use client";

import React, { useEffect, useState } from "react";
import {
  Cable,
  Check,
  RefreshCw,
  Usb,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMidiStore } from "@/stores/midi-store";
import { usePatternStore } from "@/stores/pattern-store";

export const MidiSettingsModal: React.FC = () => {
  const isModalOpen = useMidiStore((s) => s.isModalOpen);
  const setModalOpen = useMidiStore((s) => s.setModalOpen);
  const devices = useMidiStore((s) => s.devices);
  const isScanning = useMidiStore((s) => s.isScanning);
  const connectedPortIndex = useMidiStore((s) => s.connectedPortIndex);
  const connectedDeviceName = useMidiStore((s) => s.connectedDeviceName);
  const channelRouting = useMidiStore((s) => s.channelRouting);
  const lastActivityTimestamp = useMidiStore((s) => s.lastActivityTimestamp);
  const recentNote = useMidiStore((s) => s.recentNote);

  const scanDevices = useMidiStore((s) => s.scanDevices);
  const connectDevice = useMidiStore((s) => s.connectDevice);
  const disconnectDevice = useMidiStore((s) => s.disconnectDevice);
  const setChannelRouting = useMidiStore((s) => s.setChannelRouting);

  const channels = usePatternStore((s) => s.channels);

  const [selectedPort, setSelectedPort] = useState<number>(0);
  const [isActivityActive, setIsActivityActive] = useState(false);

  // Initial device scan upon open
  useEffect(() => {
    if (isModalOpen) {
      scanDevices();
    }
  }, [isModalOpen, scanDevices]);

  // Flash activity LED beacon when lastActivityTimestamp changes
  useEffect(() => {
    if (lastActivityTimestamp > 0) {
      const flashTimer = setTimeout(() => setIsActivityActive(true), 0);
      const resetTimer = setTimeout(() => setIsActivityActive(false), 140);
      return () => {
        clearTimeout(flashTimer);
        clearTimeout(resetTimer);
      };
    }
  }, [lastActivityTimestamp]);

  if (!isModalOpen) return null;

  const isCurrentConnected =
    connectedPortIndex !== null && connectedPortIndex === selectedPort;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="midi-settings-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-in fade-in duration-150 select-none"
    >
      <div
        className={cn(
          "relative flex w-full max-w-lg flex-col overflow-hidden rounded-md border",
          // Glassmorphic Brutalism per DAW design standards:
          "border-white/10 bg-zinc-950/90 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.9)]"
        )}
      >
        {/* ── Modal Header ── */}
        <div className="flex h-12 items-center justify-between border-b border-zinc-800 bg-[#0e0e14] px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-[2px] border border-zinc-700 bg-zinc-900 text-telemetry-orange shadow-[0_0_8px_rgba(255,68,0,0.3)]">
              <Usb className="size-4" />
            </div>
            <div>
              <h2
                id="midi-settings-title"
                className="font-mono text-xs font-black tracking-widest text-zinc-100 uppercase"
              >
                HARDWARE MIDI CONTROLLER
              </h2>
              <div className="flex items-center gap-1.5 font-mono text-[9px] text-zinc-500">
                <span>I/O ENGINE</span>
                <span>{"//"}</span>
                <span>WASAPI / COREMIDI / ALSA</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setModalOpen(false)}
            className="flex size-7 items-center justify-center rounded-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* ── Modal Body ── */}
        <div className="flex flex-col gap-4 p-5 font-mono">
          {/* 1. Device Selection & Live Connection */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="midi-input-select"
                className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase"
              >
                AVAILABLE MIDI PORTS
              </label>
              <button
                type="button"
                onClick={() => scanDevices()}
                disabled={isScanning}
                className="flex items-center gap-1 text-[9px] text-telemetry-orange hover:text-orange-400 transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  className={cn("size-2.5", isScanning && "animate-spin")}
                />
                <span>RESCAN PORTS</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <select
                id="midi-input-select"
                value={selectedPort}
                onChange={(e) => setSelectedPort(Number(e.target.value))}
                className="h-9 flex-1 rounded-xs border border-zinc-800 bg-black/60 px-3 font-mono text-xs text-zinc-200 outline-none focus:border-telemetry-orange transition-colors"
              >
                {devices.length === 0 ? (
                  <option value={0}>No MIDI hardware ports detected</option>
                ) : (
                  devices.map((d) => (
                    <option key={d.port_index} value={d.port_index}>
                      Port {d.port_index}: {d.name}
                    </option>
                  ))
                )}
              </select>

              {isCurrentConnected ? (
                <button
                  type="button"
                  onClick={() => disconnectDevice()}
                  className="flex h-9 items-center gap-1.5 rounded-xs border border-red-500/80 bg-red-950/60 px-3.5 text-xs font-bold text-red-400 hover:bg-red-900/80 transition-all shadow-[0_0_10px_rgba(239,68,68,0.3)]"
                >
                  <X className="size-3.5" />
                  <span>DISCONNECT</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => connectDevice(selectedPort)}
                  disabled={devices.length === 0}
                  className="flex h-9 items-center gap-1.5 rounded-xs border border-telemetry-green/80 bg-zinc-900 px-3.5 text-xs font-bold text-telemetry-green hover:bg-zinc-800 hover:shadow-[0_0_12px_rgba(0,245,155,0.4)] transition-all disabled:opacity-40"
                >
                  <Cable className="size-3.5" />
                  <span>CONNECT</span>
                </button>
              )}
            </div>

            {connectedDeviceName && (
              <div className="flex items-center gap-1.5 text-[9px] text-telemetry-green">
                <Check className="size-3" />
                <span>
                  Active stream: <strong>{connectedDeviceName}</strong>
                </span>
              </div>
            )}
          </div>

          {/* 2. Live Telemetry & Activity Beacon */}
          <div className="rounded-xs border border-zinc-800 bg-black/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-zinc-400 uppercase">
                INPUT TELEMETRY BEACON
              </span>

              {/* Phosphor Green Activity LED */}
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-zinc-500">SIGNAL</span>
                <div
                  className={cn(
                    "size-3 rounded-full border border-zinc-700 transition-all duration-75",
                    isActivityActive
                      ? "border-telemetry-green bg-telemetry-green shadow-[0_0_12px_#00f59b]"
                      : "bg-zinc-900 opacity-40"
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-400">
              <div className="flex flex-col rounded-[2px] bg-zinc-900/60 p-2 border border-zinc-800">
                <span className="text-[8px] text-zinc-500 uppercase">
                  LAST NOTE AUDITION
                </span>
                <span className="font-bold text-zinc-100 text-xs">
                  {recentNote ? `MIDI ${recentNote.note}` : "None"}
                </span>
              </div>
              <div className="flex flex-col rounded-[2px] bg-zinc-900/60 p-2 border border-zinc-800">
                <span className="text-[8px] text-zinc-500 uppercase">
                  RAW VELOCITY
                </span>
                <span className="font-bold text-zinc-100 text-xs">
                  {recentNote ? `${recentNote.velocity} / 127` : "0 / 127"}
                </span>
              </div>
            </div>
          </div>

          {/* 3. Input Channelization / Omni Routing */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="midi-channel-route"
              className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase"
            >
              CHANNEL ROUTING TARGET
            </label>
            <select
              id="midi-channel-route"
              value={channelRouting}
              onChange={(e) => setChannelRouting(e.target.value)}
              className="h-9 w-full rounded-xs border border-zinc-800 bg-black/60 px-3 font-mono text-xs text-zinc-200 outline-none focus:border-telemetry-orange transition-colors"
            >
              <option value="omni">Omni Routing (Triggers All / Drum Map)</option>
              {channels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  Direct to: {ch.name}
                </option>
              ))}
            </select>
            <span className="text-[8px] text-zinc-500">
              In Omni mode, standard General MIDI percussion keys (35-46) map to
              Kick, Clap, Hi-Hat, and Snare voices automatically.
            </span>
          </div>
        </div>

        {/* ── Modal Footer ── */}
        <div className="flex h-11 items-center justify-end border-t border-zinc-800 bg-[#0c0c10] px-4">
          <button
            type="button"
            onClick={() => setModalOpen(false)}
            className="rounded-xs border border-zinc-700 bg-zinc-900 px-4 py-1.5 font-mono text-xs font-bold text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800 transition-colors uppercase"
          >
            DONE
          </button>
        </div>
      </div>
    </div>
  );
};
