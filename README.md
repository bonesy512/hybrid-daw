# HybridDAW

A low-latency hybrid digital audio workstation.

| Layer         | Stack                                                        |
| ------------- | ------------------------------------------------------------ |
| Desktop shell | Tauri 2 (Rust)                                               |
| Frontend      | Next.js (App Router, static export), React 19, TypeScript    |
| Styling / UI  | Tailwind CSS v4, shadcn/ui, lucide-react                     |
| State         | zustand (UI state only; audio-rate data goes through canvas) |
| Audio engine  | Rust `cpal` + `rtrb` (planned)                               |

## Prerequisites

- Node.js 20+ and npm
- Rust toolchain (stable, >= 1.90) via [rustup](https://rustup.rs)
- Windows: Microsoft C++ Build Tools and WebView2 (see the
  [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/))

## Development

```bash
npm install
npm run tauri dev     # Next.js dev server + native Tauri window
npm run dev           # frontend only, in the browser at http://localhost:3000
```

## Build

```bash
npm run tauri build   # runs `next build` (static export to out/) then bundles the app
```

## Project layout

```
src/                  Next.js frontend
  app/                App Router entry (layout, page, globals.css theme)
  components/ui/      shadcn/ui primitives (add more with `npx shadcn@latest add <name>`)
  lib/utils.ts        cn() class-merge helper
  stores/             zustand stores
src-tauri/            Rust backend / Tauri shell
  tauri.conf.json     window, build and bundle config
  capabilities/       Tauri permission sets
.agents/rules/        project development standards
```
