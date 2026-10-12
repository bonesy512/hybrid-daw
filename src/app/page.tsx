"use client";

import { Circle, Play, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTransportStore } from "@/stores/transport-store";

export default function Home() {
  const { state, bpm, play, stop, toggleRecord } = useTransportStore();

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex h-12 items-center justify-between border-b border-border px-4">
        <h1 className="font-mono text-sm font-semibold tracking-[0.3em] uppercase">
          Hybrid<span className="text-telemetry-orange">DAW</span>
        </h1>

        <div className="flex items-center gap-1">
          <Button
            id="transport-play"
            size="icon-sm"
            variant={state === "playing" ? "default" : "ghost"}
            aria-label="Play"
            onClick={play}
          >
            <Play />
          </Button>
          <Button
            id="transport-stop"
            size="icon-sm"
            variant="ghost"
            aria-label="Stop"
            onClick={stop}
          >
            <Square />
          </Button>
          <Button
            id="transport-record"
            size="icon-sm"
            variant="ghost"
            aria-label="Record"
            onClick={toggleRecord}
            className={cn(state === "recording" && "text-telemetry-orange")}
          >
            <Circle className={cn(state === "recording" && "fill-current")} />
          </Button>
        </div>

        <div className="flex items-center gap-4 font-mono text-xs text-muted-foreground">
          <span>{bpm.toFixed(1)} BPM</span>
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "size-2 rounded-full",
                state === "stopped" ? "bg-muted-foreground" : "bg-telemetry-green",
              )}
            />
            {state.toUpperCase()}
          </span>
        </div>
      </header>

      <section className="flex flex-1 items-center justify-center">
        <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
          Engine offline — foundation initialized
        </p>
      </section>
    </main>
  );
}
