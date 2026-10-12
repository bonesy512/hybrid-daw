---
trigger: always_on
description: "Core architectural, aesthetic, and audio-safety constraints for HybridDAW."
---

# HybridDAW Development Protocol

1. **Stack & Runtimes:**
   - Desktop Shell: Tauri 2.x with Rust backend.
   - Frontend: Next.js (App Router, Static Export / SPA mode), React 19, Tailwind CSS v4, Lucide React.
   - UI Toolkit: shadcn/ui primitives.
   - Audio Engine: Rust `cpal` for low-latency WASAPI/ASIO streams, `rtrb` for lock-free ringbuffers.

2. **Design Language:**
   - Style: Industrial Brutalism crossed with Selective Glassmorphism.
   - Palette: Pitch obsidian canvas (`#09090B`), stark zinc borders (`#27272A`), neon telemetry accents (Safety Orange `#FF4400`, Phosphor Green `#00F59B`).
   - Glassmorphism: Reserved strictly for floating inspector panes, popovers, and slide-out routing matrices (`backdrop-blur-xl bg-zinc-950/70 border border-white/10`).
   - High-rate renders: Never route audio playhead positions or fast VU meters through continuous React re-renders; use dedicated HTML5 Canvas elements or `requestAnimationFrame`.

3. **Audio Safety in Rust:**
   - Audio callback loops must remain lock-free and zero-allocation. No heap resizing (`Vec::push`) or blocking mutex locks inside the real-time stream.
