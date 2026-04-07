# Nimbus

A beautiful, AI-powered terminal for macOS. Nimbus combines multi-pane terminal management, workspace organization, a real-time Claude AI assistant, and intelligent command memory — all in one native desktop app.

## Features

### Terminal
- Full PTY emulation with zsh support and shell integration hooks
- Split panes — vertical (`Cmd+D`) and horizontal (`Cmd+Shift+D`) with draggable resize handles
- Multiple tabs — create, close, rename (double-click), reorder
- In-terminal rich content overlays — auto-detects JSON, tables, and markdown; renders as draggable cards
- In-terminal search (`Cmd+F`) with highlighted match results

### Command History
- Per-pane command history with live status cards (running, success, failure)
- Visual hierarchy: command text anchored, metadata receded, status colored with calm accent
- Collapse/expand individual cards or all at once; clear panel
- Animated card output with smooth height transitions
- **Save to Memory** button on each card (hover to reveal)

### Command Memory
- Curated saved-command layer with scopes: Global, Workspace, or Project
- Open with `Cmd+M` — fuzzy-searchable palette
- **Suggestions** — scored by usage frequency × recency × context (project > workspace > global)
- **Insert** a command into the active prompt (Tab or Cmd+Enter)
- **Run** a command directly in the active terminal (Enter)
- Quick-save from the palette (`Cmd+S`)
- Save button on every history card; manage in the sidebar Commands panel
- Usage records stored locally; exponential decay (72h half-life) keeps suggestions fresh

### Workspaces
- Multiple isolated workspaces with named tab collections
- Persist workspaces to `.nimbus` snapshot files (`Cmd+S` / `Cmd+O`)
- Full restore: tabs, split panes, CWD per pane, command history per pane, active pane focus
- Move tabs and workspaces to new windows with PTY survival (no process restart)
- Workspace crossfade animation when switching

### AI Integration
- Dockable Claude chat panel — left, right, or bottom (`Cmd+J`)
- Real-time streaming responses with elapsed-time indicator
- Model selector: Sonnet 4.6 (fast), Opus 4.6 (smart), Haiku 4.5 (instant)
- API key stored in macOS Keychain — never written to disk as plaintext

### UI
- Command palette (`Cmd+K`) with fuzzy search across all app commands
- Command Memory palette (`Cmd+M`) for saved and suggested shell commands
- Sidebar panel with bookmarked tabs, command memory management, and notes
- Deep purple dark theme with Framer Motion animations (fast, soft, understated)
- Context menus on each pane: copy, paste, clear, detach

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron 41 |
| UI | React 19 + TypeScript 5 |
| Build | electron-vite + Vite 8 |
| Terminal | xterm.js 5 + node-pty |
| Shell Integration | OSC 633 (preexec / precmd hooks, CWD tracking) |
| AI | Anthropic SDK (`@anthropic-ai/sdk`) |
| Animation | Framer Motion 12 |
| Packaging | electron-builder (macOS DMG/ZIP) |

## Getting Started

### Prerequisites
- Node.js 18+
- macOS (uses macOS Keychain for API key storage)
- An [Anthropic API key](https://console.anthropic.com/)

### Install & Run

```bash
npm install
npm run dev
```

### Build

```bash
npm run build
```

Produces a distributable macOS app in `dist/`.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+T` | New tab |
| `Cmd+W` | Close tab / pane |
| `Cmd+D` | Split pane vertically |
| `Cmd+Shift+D` | Split pane horizontally |
| `Cmd+Shift+T` | Detach pane to new tab |
| `Cmd+1–9` | Switch to tab N |
| `Cmd+Shift+]` / `[` | Next / previous tab |
| `Cmd+J` | Toggle AI panel |
| `Cmd+K` | Open command palette |
| `Cmd+M` | Open command memory palette |
| `Cmd+F` | Search in active terminal |
| `Cmd+Option+N` | New workspace |
| `Cmd+Option+←/→` | Switch workspace |
| `Cmd+S` | Save workspace snapshot |
| `Cmd+O` | Open workspace snapshot |
| `Cmd+Shift+W` | Close active workspace |

### Command Memory Palette (`Cmd+M`)

| Key | Action |
|-----|--------|
| `↑↓` | Navigate |
| `Enter` | Run selected command |
| `Tab` or `Cmd+Enter` | Insert into prompt (without running) |
| `Cmd+S` | Save selected/typed command to memory |
| `Esc` | Close |

## Project Structure

```
src/
  main/           # Electron main process — PTY, AI streaming, Keychain, project detection
  preload/        # Context bridge — exposes window.nimbus.* IPC API
  renderer/
    components/   # React UI components
    hooks/        # Custom hooks (commands, command memory)
    types/        # TypeScript interfaces
    utils/        # Split tree, layout, fuzzy match, content detectors, command memory logic
designs/          # Early HTML prototypes (reference only)
scripts/          # Build helpers
```

## How Command Memory Works

Commands run in any terminal pane are automatically recorded in a usage log (up to 2000 entries, stored in `localStorage`). The memory palette scores commands using:

```
score = context_multiplier × (0.4 + 0.6 × recency_decay)
```

Where:
- **Context multiplier**: 2.5× for project scope, 1.5× for workspace, 0.6× global
- **Recency decay**: `exp(-hours / 72)` — half-life of ~3 days
- Trivial commands (`ls`, `cd`, `pwd`, etc.) are excluded from suggestions

Saved commands have three scopes:
- **Global** — visible everywhere
- **Workspace** — visible only in the current workspace
- **Project** — visible only when your CWD is inside the detected project root

Project root detection walks up from CWD looking for `.git`, `package.json`, `go.mod`, `Cargo.toml`, and other markers.

## Security

- API keys stored via `safeStorage` (macOS Keychain) — renderer never sees the key
- PTY environment variables filtered: 30+ sensitive vars (API keys, tokens, DB URLs) are blocked
- Context isolation + Content Security Policy prevent renderer XSS
- All PTY IDs validated against UUID format

## License

MIT
