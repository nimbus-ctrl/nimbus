# Nimbus

A beautiful, AI-powered terminal for macOS. Nimbus combines multi-pane terminal management, workspace organization, and a real-time Claude AI assistant — all in one native desktop app.

![Dark theme with split panes and AI panel](designs/4-inline-terminal.html)

## Features

### Terminal
- Full PTY emulation with zsh, bash, and fish support
- Split panes — vertical (`Cmd+D`) and horizontal (`Cmd+Shift+D`) with draggable resize handles
- Multiple tabs — create (`Cmd+T`), close (`Cmd+W`), rename (double-click), reorder
- Rich content overlays — auto-detects JSON, tables, and markdown in output and renders draggable cards

### Workspaces
- Multiple isolated workspaces with named tab collections
- Persist workspaces to `.nimbus` snapshot files (`Cmd+S` / `Cmd+O`)
- Move tabs and workspaces between windows with PTY survival

### AI Integration
- Dockable Claude chat panel — left, right, or bottom (`Cmd+J`)
- Real-time streaming responses with elapsed-time indicator
- Model selector: Sonnet 4 (fast), Opus 4 (smart), Haiku 4.5 (instant)
- API key stored in macOS Keychain — never written to disk as plaintext

### UI
- Command palette (`Cmd+K`) with fuzzy search across all commands
- Deep purple dark theme with smooth Framer Motion animations
- Sidebar with bookmarked tabs and saved commands

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron 41 |
| UI | React 19 + TypeScript 5 |
| Build | electron-vite + Vite 8 |
| Terminal | xterm.js 5 + node-pty |
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
| `Cmd+J` | Toggle AI panel |
| `Cmd+K` | Open command palette |
| `Cmd+Option+N` | New workspace |
| `Cmd+Option+←/→` | Switch workspace |
| `Cmd+S` | Save workspace snapshot |
| `Cmd+O` | Open workspace snapshot |

## Project Structure

```
src/
  main/           # Electron main process — PTY, AI streaming, Keychain
  preload/        # Context bridge — exposes window.nimbus.* IPC API
  renderer/
    components/   # React UI components
    hooks/        # Custom hooks (command registry)
    types/        # TypeScript interfaces
    utils/        # Split tree, layout, fuzzy match, content detectors
designs/          # Early HTML prototypes (reference only)
scripts/          # Build helpers
```

## Security

- API keys stored via `safeStorage` (macOS Keychain) — renderer never sees the key
- PTY environment variables filtered: 30+ sensitive vars (API keys, tokens, DB URLs) are blocked
- Context isolation + Content Security Policy prevent renderer XSS
- All PTY IDs validated against UUID format

## License

MIT
