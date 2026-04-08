import React, { useEffect, useRef, useState, useCallback, memo } from 'react'
import { Terminal as XTerm } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { ImageAddon } from 'xterm-addon-image'
import { SearchAddon } from 'xterm-addon-search'
import { SerializeAddon } from 'xterm-addon-serialize'
import 'xterm/css/xterm.css'
import InlineOverlay, { RichPanel, type OverlayBlock } from './InlineOverlay'
import { detectRichContent } from '../utils/contentDetectors'
import CommandCard, { type CommandRecord } from './CommandCard'
import { analyzeCommandRisk, type RiskResult } from '../utils/commandRisk'
import { getPreviewRequest, previewLabel, type PreviewResult } from '../utils/commandPreview'
import { RiskConfirmation, RiskToast } from './RiskGuard'

interface Props {
  tabId: string
  isActive: boolean
  onActivity?: () => void
  onCommandRun?: (command: string, cwd: string) => void
  onSaveCommand?: (command: string) => void
  historyEnabled?: boolean
}

const nimbusTheme = {
  background: '#0f0f1a',
  foreground: '#e2e0ff',
  cursor: '#7c6af7',
  cursorAccent: '#0f0f1a',
  selectionBackground: '#7c6af730',
  black: '#1a1a2e',
  red: '#f76a6a',
  green: '#6af7a0',
  yellow: '#f7d06a',
  blue: '#6a9ff7',
  magenta: '#c56af7',
  cyan: '#6af7f0',
  white: '#e2e0ff',
  brightBlack: '#4a4870',
  brightRed: '#ff8585',
  brightGreen: '#85ffb5',
  brightYellow: '#ffe585',
  brightBlue: '#85b8ff',
  brightMagenta: '#d885ff',
  brightCyan: '#85fff8',
  brightWhite: '#ffffff',
}

declare global {
  interface Window {
    nimbus: {
      pty: {
        create: (opts: { id: string; cols: number; rows: number; cwd?: string }) => Promise<{ success: boolean; error?: string }>
        write: (id: string, data: string) => Promise<void>
        resize: (id: string, cols: number, rows: number) => Promise<void>
        kill: (id: string) => Promise<void>
        onData: (id: string, cb: (data: string) => void) => () => void
        onExit: (id: string, cb: () => void) => () => void
      }
      apiKey: {
        store: (key: string) => Promise<{ success: boolean }>
        retrieve: () => Promise<{ key: string | null }>
        delete: () => Promise<{ success: boolean }>
      }
      window: {
        create: (initData?: unknown) => Promise<{ success: boolean }>
        getInitData: () => Promise<unknown>
        isFullscreen: () => Promise<boolean>
        onFullscreen: (cb: (fullscreen: boolean) => void) => () => void
      }
      workspace: {
        save: (name: string, data: string) => Promise<{ success: boolean; path?: string }>
        onSaveRequest: (cb: () => void) => () => void
        onOpenRequest: (cb: (data: string) => void) => () => void
        onCloseRequest: (cb: () => void) => () => void
      }
      ai: {
        chat: (messages: { role: string; content: string }[], requestId: string, model?: string) => Promise<{ success: boolean; error?: string }>
        test: () => Promise<{ success: boolean; model?: string; error?: string }>
        onToken: (requestId: string, cb: (token: string) => void) => () => void
        onDone: (requestId: string, cb: () => void) => () => void
        onError: (requestId: string, cb: (error: string) => void) => () => void
      }
      project: {
        detectRoot: (cwd: string) => Promise<{ root: string | null }>
      }
      ui: {
        onToggleHistory: (cb: (enabled: boolean) => void) => () => void
        sendHistoryState: (enabled: boolean) => void
      }
      context: {
        gitBranch: (cwd: string) => Promise<{ branch: string | null }>
      }
      preview: {
        run: (req: { type: string; args: string[]; cwd: string }) => Promise<{ output: string; error?: string }>
      }
    }
  }
}

// ─── Migration support ───────────────────────────────────────────────────────
// Used when a single pane is moved to a new tab. We save its buffer and keep
// the PTY alive so the new Terminal instance can reconnect.

const xtermInstances = new Map<string, XTerm>()
const serializeAddons = new Map<string, SerializeAddon>()

/** Access a pane's xterm instance (for clear, copy, etc.) */
export function getXtermInstance(paneId: string): XTerm | undefined {
  return xtermInstances.get(paneId)
}
const migratingPanes = new Set<string>()
const savedBuffers = new Map<string, string>()

function serializeBuffer(xterm: XTerm): string {
  const buffer = xterm.buffer.active
  const lines: string[] = []
  for (let i = 0; i < buffer.length; i++) {
    const line = buffer.getLine(i)
    if (line) lines.push(line.translateToString())
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop()
  }
  return lines.join('\r\n')
}

/**
 * Call BEFORE detaching a pane. Saves the xterm buffer and marks the pane
 * so that Terminal cleanup skips killing its PTY.
 */
export function prepareMigration(paneId: string) {
  const serAddon = serializeAddons.get(paneId)
  const xterm = xtermInstances.get(paneId)

  let bufferContent = ''
  if (serAddon) {
    try { bufferContent = serAddon.serialize() } catch { /* ignore */ }
  }
  // Fallback to plain text if SerializeAddon produced nothing
  if (!bufferContent && xterm) {
    bufferContent = serializeBuffer(xterm)
  }
  if (bufferContent) savedBuffers.set(paneId, bufferContent)

  const cwd = paneCwds.get(paneId)
  if (cwd) pendingCwds.set(paneId, cwd)

  // Preserve command history cards so they survive the remount
  const records = paneCommandRecordsMap.get(paneId)
  if (records && records.length > 0) pendingCommandRecords.set(paneId, [...records])

  migratingPanes.add(paneId)
}

/** Get serialized buffer content for a pane (for cross-window transfer) */
export function getPaneBuffer(paneId: string): string {
  const serAddon = serializeAddons.get(paneId)
  if (serAddon) return serAddon.serialize()
  const xterm = xtermInstances.get(paneId)
  return xterm ? serializeBuffer(xterm) : ''
}

/**
 * Register a pane as migrated with its buffer content.
 * Call BEFORE the Terminal component mounts (e.g. before setWorkspaces in init data handler).
 * This allows the Terminal to reconnect to the existing PTY instead of creating a new one.
 */
export function registerIncomingMigration(paneId: string, bufferContent: string) {
  migratingPanes.add(paneId)
  if (bufferContent) savedBuffers.set(paneId, bufferContent)
}

// ─── Buffer preload (for workspace snapshot restore) ─────────────────────────
// Unlike migration (which reconnects to existing PTYs), preload just writes
// saved content into a freshly-created terminal so the user sees their history.

const pendingPreloads = new Map<string, string>()

/**
 * Register buffer content to be written into a Terminal after it creates its PTY.
 * Call BEFORE the Terminal component mounts.
 */
export function preloadBuffer(paneId: string, content: string) {
  if (content) pendingPreloads.set(paneId, content)
}

// ─── CWD tracking (for workspace snapshot) ───────────────────────────────────

const paneCwds = new Map<string, string>()         // live: updated on every OSC 633 P
const pendingCwds = new Map<string, string>()      // set before mount, read at PTY create time
const cwdListeners = new Map<string, (cwd: string) => void>()

/** Returns the last known CWD for a pane (used when saving a snapshot). */
export function getPaneCwd(paneId: string): string | undefined {
  return paneCwds.get(paneId)
}

/** Queue a CWD to be passed to the PTY when this pane next creates its process. */
export function preloadCwd(paneId: string, cwd: string) {
  if (cwd) pendingCwds.set(paneId, cwd)
}

/** Subscribe to CWD changes for a specific pane. Returns an unsubscribe function. */
export function subscribeCwd(paneId: string, listener: (cwd: string) => void): () => void {
  cwdListeners.set(paneId, listener)
  return () => { if (cwdListeners.get(paneId) === listener) cwdListeners.delete(paneId) }
}

// ─── Command record tracking (for workspace snapshot) ────────────────────────

const paneCommandRecordsMap = new Map<string, CommandRecord[]>()
const pendingCommandRecords = new Map<string, CommandRecord[]>()

/** Returns the current command history for a pane (used when saving a snapshot). */
export function getPaneCommandRecords(paneId: string): CommandRecord[] {
  return paneCommandRecordsMap.get(paneId) ?? []
}

/** Queue command records to be restored into a pane when it next mounts. */
export function preloadCommandRecords(paneId: string, records: CommandRecord[]) {
  if (records.length > 0) pendingCommandRecords.set(paneId, records)
}

// ─── Search ──────────────────────────────────────────────────────────────────

const searchDecorations = {
  matchBackground: '#7c6af720',
  matchBorder: '#7c6af750',
  matchOverviewRuler: '#7c6af7',
  activeMatchBackground: '#7c6af750',
  activeMatchBorder: '#7c6af7',
  activeMatchColorOverviewRuler: '#c56af7',
}

const searchBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-muted)',
  fontSize: 14,
  cursor: 'pointer',
  padding: '0 3px',
  lineHeight: 1,
  display: 'flex',
  alignItems: 'center',
}

// ─── OSC 633 shell integration parser ────────────────────────────────────────

type Osc633Event =
  | { type: 'E'; command: string }
  | { type: 'C' }
  | { type: 'D'; exitCode: number }
  | { type: 'P'; cwd: string }

function parseOsc633(data: string): Osc633Event[] {
  const events: Osc633Event[] = []
  // OSC = ESC ] 633 ; <payload> ( BEL | ESC \ )
  const re = /\x1b\]633;([^\x07\x1b]*?)(?:\x07|\x1b\\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(data)) !== null) {
    const payload = m[1]
    if (payload.startsWith('E;')) {
      events.push({ type: 'E', command: payload.slice(2) })
    } else if (payload === 'C') {
      events.push({ type: 'C' })
    } else if (payload.startsWith('D;')) {
      events.push({ type: 'D', exitCode: parseInt(payload.slice(2), 10) || 0 })
    } else if (payload === 'D') {
      events.push({ type: 'D', exitCode: 0 })
    } else if (payload.startsWith('P;Cwd=')) {
      events.push({ type: 'P', cwd: payload.slice(6) })
    }
  }
  return events
}

// Strip ANSI escape sequences for clean output capture
function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b[\\NO]/g, '')
    .replace(/\r/g, '')
}

// ─── Component ───────────────────────────────────────────────────────────────

export default memo(function Terminal({ tabId, isActive, onActivity, onCommandRun, onSaveCommand, historyEnabled = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isActiveRef = useRef(isActive)
  const onActivityRef = useRef(onActivity)
  const onCommandRunRef = useRef(onCommandRun)
  const hasNotifiedActivityRef = useRef(false)
  const searchOpenRef = useRef(false)
  const initializedRef = useRef(false)
  const [overlays, setOverlays] = useState<OverlayBlock[]>([])
  const [panelBlock, setPanelBlock] = useState<OverlayBlock | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [matchInfo, setMatchInfo] = useState<{ index: number; count: number } | null>(null)
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Tracks the buffer line position at the last detection pass.
  // We only scan lines written AFTER this point, so dismissed overlays
  // can never re-appear from old buffer content.
  const lastDetectedLineRef = useRef(-1)

  // ── Command Cards state ──
  const [commandRecords, setCommandRecords] = useState<CommandRecord[]>(
    () => pendingCommandRecords.get(tabId) ?? []
  )
  const [showCards, setShowCards] = useState(true)
  // Set of card IDs that are collapsed. Cards start expanded (not in set).
  const [collapsedCards, setCollapsedCards] = useState<Set<string>>(new Set())
  const activeRecordRef = useRef<CommandRecord | null>(null)
  const captureOutputRef = useRef(false)
  const currentCwdRef = useRef('~')
  const cardsScrollRef = useRef<HTMLDivElement>(null)

  // ── Risk Guard state ──────────────────────────────────────────────────────
  const currentInputRef = useRef('')
  const pendingRiskRef = useRef(false) // true while destructive overlay is showing — blocks re-entry
  const [pendingRisk, setPendingRisk] = useState<{ command: string; risk: RiskResult } | null>(null)
  const [riskToast, setRiskToast] = useState<{ key: number; risk: RiskResult } | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const toggleCard = useCallback((id: string) => {
    setCollapsedCards(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const collapseAll = useCallback(() => {
    setCollapsedCards(new Set(commandRecords.map(r => r.id)))
  }, [commandRecords])

  const expandAll = useCallback(() => {
    setCollapsedCards(new Set())
  }, [])

  const flushOutputBuffer = useCallback(() => {
    flushTimerRef.current = null
    const xterm = xtermRef.current
    if (!xterm) return

    const buffer = xterm.buffer.active
    const currentLine = buffer.baseY + buffer.cursorY

    // Nothing new since last scan
    if (currentLine <= lastDetectedLineRef.current) return

    const startLine = Math.max(0, lastDetectedLineRef.current)
    lastDetectedLineRef.current = currentLine

    const lines: string[] = []
    for (let i = startLine; i <= currentLine; i++) {
      const line = buffer.getLine(i)
      if (line) lines.push(line.translateToString())
    }

    const blocks = detectRichContent(lines.join('\n'))
    if (blocks.length > 0) {
      setOverlays(prev => [...prev, ...blocks].slice(-20))
    }
  }, [])

  const dismissOverlay = useCallback((id: string) => {
    setOverlays(prev => prev.filter(o => o.id !== id))
  }, [])

  const openInPanel = useCallback((block: OverlayBlock) => {
    setPanelBlock(block)
    setOverlays(prev => prev.filter(o => o.id !== block.id))
  }, [])

  const closePanel = useCallback(() => {
    setPanelBlock(null)
  }, [])

  const closeSearch = useCallback(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    setSearchOpen(false)
    setSearchQuery('')
    setMatchInfo(null)
    searchAddonRef.current?.clearDecorations()
    xtermRef.current?.focus()
  }, [])

  const doFindNext = useCallback((query: string) => {
    if (!query) return
    searchAddonRef.current?.findNext(query, { caseSensitive: false, decorations: searchDecorations })
  }, [])

  const doFindPrevious = useCallback((query: string) => {
    if (!query) return
    searchAddonRef.current?.findPrevious(query, { caseSensitive: false, decorations: searchDecorations })
  }, [])

  // Called from the search input's onChange — debounced 150ms
  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    if (!query) {
      searchAddonRef.current?.clearDecorations()
      setMatchInfo(null)
      return
    }
    searchDebounceRef.current = setTimeout(() => {
      searchAddonRef.current?.findNext(query, { caseSensitive: false, decorations: searchDecorations })
    }, 150)
  }, [])

  // Keep ref in sync for once-registered event handlers
  useEffect(() => { searchOpenRef.current = searchOpen }, [searchOpen])

  // Cmd+F to open search (registered once, reads from refs)
  useEffect(() => {
    const handleCmdF = (e: KeyboardEvent) => {
      if (!isActiveRef.current) return
      if (e.metaKey && e.key === 'f') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handleCmdF)
    return () => window.removeEventListener('keydown', handleCmdF)
  }, [])

  useEffect(() => {
    isActiveRef.current = isActive
    if (isActive) hasNotifiedActivityRef.current = false
  }, [isActive])

  useEffect(() => { onActivityRef.current = onActivity }, [onActivity])
  useEffect(() => { onCommandRunRef.current = onCommandRun }, [onCommandRun])

  // Keep module-level command record map current so App.tsx can snapshot it
  useEffect(() => {
    paneCommandRecordsMap.set(tabId, commandRecords)
  }, [tabId, commandRecords])

  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return
    initializedRef.current = true

    const isMigrated = migratingPanes.has(tabId)
    console.log('[nimbus] Terminal mounting', tabId, isMigrated ? '(migrated)' : '')

    const xterm = new XTerm({
      theme: nimbusTheme,
      fontFamily: '"MapleMono NF", "Maple Mono NF", "JetBrains Mono", "Fira Code", monospace',
      fontSize: 14,
      lineHeight: 1.4,
      letterSpacing: 0.5,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowTransparency: true,
      allowProposedApi: true,
      scrollback: 2000,
      macOptionIsMeta: true,
      overviewRulerWidth: 15,
    })

    const fitAddon = new FitAddon()
    xterm.loadAddon(fitAddon)
    xterm.loadAddon(new WebLinksAddon())
    try { xterm.loadAddon(new ImageAddon()) } catch { /* CSP may block WASM */ }

    // open() must be called before SearchAddon so the decoration/viewport system is ready
    xterm.open(containerRef.current)

    const searchAddon = new SearchAddon()
    xterm.loadAddon(searchAddon)
    searchAddonRef.current = searchAddon
    searchAddon.onDidChangeResults((results) => {
      if (results && results.resultCount > 0) {
        setMatchInfo({ index: results.resultIndex + 1, count: results.resultCount })
      } else {
        setMatchInfo(results?.resultCount === 0 ? { index: 0, count: 0 } : null)
      }
    })

    const serializeAddon = new SerializeAddon()
    xterm.loadAddon(serializeAddon)
    serializeAddons.set(tabId, serializeAddon)

    xtermRef.current = xterm
    fitAddonRef.current = fitAddon
    xtermInstances.set(tabId, xterm)

    // Let app-level shortcuts pass through xterm
    xterm.attachCustomKeyEventHandler((e) => {
      if (e.metaKey && (
        e.key === 'd' || e.key === 'D' ||
        e.key === 'w' || e.key === 'j' ||
        e.key === 't' || e.key === 'T' ||
        e.key === 'k' || e.key === 'f' ||
        e.key === 'm'
      )) {
        return false
      }
      return true
    })

    xterm.onData((data) => {
      // While a destructive-command overlay is showing, swallow ALL input
      // (the overlay's keyboard handler takes over Enter/Escape)
      if (pendingRiskRef.current) return

      // Track typed input for risk analysis
      if (data === '\r') {
        // Read the actual command from the xterm buffer — this captures
        // tab-completed text that onData never sees (PTY echo, not keystrokes)
        const buf = xterm.buffer.active
        const line = buf.getLine(buf.baseY + buf.cursorY)
        const rawLine = line?.translateToString().trimEnd() ?? ''
        // Greedy match to find the last prompt suffix ($ % # >) and take the rest
        const bufferMatch = rawLine.match(/.*[$%#>]\s+(.+)$/)
        const bufferCommand = bufferMatch ? bufferMatch[1].trim() : ''
        // Fall back to char-tracked input if buffer parse yields nothing
        const command = bufferCommand || currentInputRef.current.trim()
        currentInputRef.current = ''

        if (command) {
          const risk = analyzeCommandRisk(command)
          if (risk.level === 'destructive') {
            // Block — show confirmation overlay; fetch preview async
            pendingRiskRef.current = true
            setPendingRisk({ command, risk })
            setPreview(null)
            const previewReq = getPreviewRequest(command, currentCwdRef.current)
            if (previewReq) {
              setPreviewLoading(true)
              // Convert typed PreviewRequest fields to generic args[]
              const args: string[] = []
              if ('path' in previewReq && previewReq.path) args.push(previewReq.path)
              if ('maxDepth' in previewReq && previewReq.maxDepth != null) args.push('-maxdepth', String(previewReq.maxDepth))
              if ('flags' in previewReq && previewReq.flags) args.push(previewReq.flags)
              if ('pid' in previewReq && previewReq.pid != null) args.push(String(previewReq.pid))
              if ('name' in previewReq && previewReq.name) args.push(previewReq.name)
              window.nimbus.preview.run({ type: previewReq.type, args, cwd: previewReq.cwd }).then(res => {
                const lines = res.output ? res.output.split('\n').filter(Boolean) : []
                setPreview({ lines, label: previewReq.label ?? previewLabel(previewReq.type), error: res.error })
                setPreviewLoading(false)
              }).catch(() => setPreviewLoading(false))
            }
            return // don't write to PTY yet
          }
          if (risk.level === 'elevated' || risk.level === 'network') {
            setRiskToast({ key: Date.now(), risk })
          }
        }
        window.nimbus.pty.write(tabId, data)
        return
      }
      // Track characters; reset on Ctrl+C, Ctrl+U, or history navigation
      if (data === '\x03' || data === '\x15') {
        currentInputRef.current = ''
      } else if (data === '\x1b[A' || data === '\x1b[B') {
        // Up/Down arrow — shell will echo a history item; clear our tracking
        // so the buffer-read at Enter time is used instead
        currentInputRef.current = ''
      } else if (data === '\x7f') {
        // Backspace
        currentInputRef.current = currentInputRef.current.slice(0, -1)
      } else if (data.length === 1 && data >= ' ') {
        currentInputRef.current += data
      }
      window.nimbus.pty.write(tabId, data)
    })

    const safeFit = (): boolean => {
      try {
        const el = containerRef.current
        if (el && el.offsetWidth > 0 && el.offsetHeight > 0) {
          fitAddon.fit()
          return true
        }
      } catch (e) {
        console.warn('[nimbus] fitAddon.fit() error:', e)
      }
      return false
    }

    // Restore buffer if this pane was migrated from another tab
    if (isMigrated) {
      const saved = savedBuffers.get(tabId)
      if (saved) {
        xterm.write(saved)
      }
      // Defer clearing the migration flag AND saved buffer. The timeout must survive
      // StrictMode's immediate unmount→remount cycle (~0ms) but fire before the user
      // notices. 500ms is safe.
      setTimeout(() => {
        migratingPanes.delete(tabId)
        savedBuffers.delete(tabId)
      }, 500)
    }

    // Restore buffer from workspace snapshot (new PTY, just historical output)
    // Written synchronously so StrictMode's double-mount both get the content.
    const hasPreload = pendingPreloads.has(tabId)
    if (hasPreload) {
      const preloaded = pendingPreloads.get(tabId)!
      xterm.write(preloaded)
      setTimeout(() => pendingPreloads.delete(tabId), 500)
    }

    // Grab and schedule cleanup of preloaded CWD / command records
    const initialCwd = pendingCwds.get(tabId)
    setTimeout(() => {
      pendingCwds.delete(tabId)
      pendingCommandRecords.delete(tabId)
    }, 500)

    // PTY creation is isolated so a fit() error can never prevent the shell from starting.
    const startPty = () => {
      // Anchor detection cursor so preloaded/migrated buffer isn't re-detected
      lastDetectedLineRef.current = xterm.buffer.active.baseY + xterm.buffer.active.cursorY

      if (isMigrated) {
        // PTY already exists — just sync dimensions
        window.nimbus.pty.resize(tabId, xterm.cols, xterm.rows)
          .then(() => {
            ptyReady = true
            console.log('[nimbus] PTY reconnected', tabId)
            xterm.focus()
          })
          .catch(err => {
            console.error('[nimbus] PTY resize failed during migration, creating fresh PTY', err)
            window.nimbus.pty.create({ id: tabId, cols: xterm.cols, rows: xterm.rows, cwd: initialCwd })
              .then(() => { ptyReady = true; xterm.focus() })
          })
      } else {
        window.nimbus.pty.create({ id: tabId, cols: xterm.cols, rows: xterm.rows, cwd: initialCwd })
          .then((result) => {
            ptyReady = true
            if (result.success) {
              console.log('[nimbus] PTY created', tabId, xterm.cols, 'x', xterm.rows)
            } else {
              console.warn('[nimbus] PTY create returned error (may already exist):', result.error)
            }
            xterm.focus()
          })
          .catch(err => console.error('[nimbus] PTY create error', err))
      }
    }

    // Two-frame initialization: first RAF fits the terminal once layout is committed;
    // if the container still has no dimensions (display:none→flex transition hasn't
    // flushed yet), the second RAF retries. PTY creation always runs.
    requestAnimationFrame(() => {
      const ready = safeFit()
      if (ready) {
        startPty()
      } else {
        // Container not sized yet — wait one more frame then start regardless
        requestAnimationFrame(() => {
          safeFit()
          startPty()
        })
      }
    })

    let ptyReady = false
    xterm.onResize(({ cols, rows }) => {
      if (ptyReady) window.nimbus.pty.resize(tabId, cols, rows)
      // Cancel any pending detection flush — resize reflows buffer, don't re-detect old content
      if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null }
    })

    const offData = window.nimbus.pty.onData(tabId, (data) => {
      xterm.write(data)

      // ── OSC 633 shell integration ──
      const events = parseOsc633(data)
      for (const ev of events) {
        if (ev.type === 'E') {
          // Command text arrived (preexec) — create an in-progress record
          const rec: CommandRecord = {
            id: crypto.randomUUID(),
            command: ev.command,
            cwd: currentCwdRef.current,
            startTime: Date.now(),
            outputLines: [],
          }
          activeRecordRef.current = rec
          captureOutputRef.current = false
          setCommandRecords(prev => [...prev, rec])
          // Notify app-level usage recording
          if (ev.command.trim()) {
            onCommandRunRef.current?.(ev.command, currentCwdRef.current)
          }
        } else if (ev.type === 'C') {
          // Output is about to start
          captureOutputRef.current = true
        } else if (ev.type === 'D') {
          // Command finished
          const rec = activeRecordRef.current
          if (rec) {
            const finished: CommandRecord = {
              ...rec,
              endTime: Date.now(),
              exitCode: ev.exitCode,
            }
            activeRecordRef.current = null
            captureOutputRef.current = false
            setCommandRecords(prev =>
              prev.map(r => r.id === rec.id ? finished : r)
            )
            // Auto-scroll cards panel to bottom
            requestAnimationFrame(() => {
              if (cardsScrollRef.current) {
                cardsScrollRef.current.scrollTop = cardsScrollRef.current.scrollHeight
              }
            })
          }
        } else if (ev.type === 'P') {
          currentCwdRef.current = ev.cwd
          paneCwds.set(tabId, ev.cwd)   // keep snapshot-accessible map current
          cwdListeners.get(tabId)?.(ev.cwd)
          // Update cwd on running record
          const rec = activeRecordRef.current
          if (rec) {
            rec.cwd = ev.cwd
          }
        }
      }

      // Capture output lines for the active record
      if (captureOutputRef.current && activeRecordRef.current) {
        const rec = activeRecordRef.current
        const cleaned = stripAnsi(data)
        const newLines = cleaned.split('\n').filter(l => l.trim().length > 0)
        if (newLines.length > 0) {
          // Keep last 100 lines max
          const updated = [...rec.outputLines, ...newLines].slice(-100)
          rec.outputLines = updated
          setCommandRecords(prev =>
            prev.map(r => r.id === rec.id ? { ...rec, outputLines: updated } : r)
          )
        }
      }

      // Notify parent tab has unseen activity (fires once per background period)
      if (!isActiveRef.current && !hasNotifiedActivityRef.current) {
        hasNotifiedActivityRef.current = true
        onActivityRef.current?.()
      }

      // Debounced rich content detection — scans xterm buffer after output settles
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
      flushTimerRef.current = setTimeout(flushOutputBuffer, 500)
    })

    const handleKey = (e: KeyboardEvent) => {
      if (!isActiveRef.current) return

      if (e.metaKey && (
        e.key === 'd' || e.key === 'D' ||
        e.key === 'w' || e.key === 'j' ||
        e.key === 't' || e.key === 'T' ||
        e.key === 'k' || e.key === 'm'
      )) return

      const target = e.target as HTMLElement
      if (target?.classList?.contains('xterm-helper-textarea')) return
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return

      const seq = keyEventToSequence(e)
      if (seq !== null) {
        e.preventDefault()
        window.nimbus.pty.write(tabId, seq)
      }
    }

    window.addEventListener('keydown', handleKey)

    let resizeRafId = 0
    const resizeObserver = new ResizeObserver(() => {
      if (resizeRafId) return
      resizeRafId = requestAnimationFrame(() => {
        resizeRafId = 0
        safeFit()
      })
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      console.log('[nimbus] Terminal cleanup', tabId, migratingPanes.has(tabId) ? '(migrating — keeping PTY)' : '')
      xtermInstances.delete(tabId)
      serializeAddons.delete(tabId)
      offData()
      window.removeEventListener('keydown', handleKey)
      resizeObserver.disconnect()
      if (resizeRafId) cancelAnimationFrame(resizeRafId)
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current)

      if (!migratingPanes.has(tabId)) {
        window.nimbus.pty.kill(tabId)
      }

      paneCwds.delete(tabId)
      paneCommandRecordsMap.delete(tabId)
      xterm.dispose()
      initializedRef.current = false
    }
  }, [tabId])

  useEffect(() => {
    if (isActive) {
      requestAnimationFrame(() => {
        if (containerRef.current && containerRef.current.offsetWidth > 0) {
          fitAddonRef.current?.fit()
        }
        xtermRef.current?.focus()
      })
    }
  }, [isActive])

  const handleRiskConfirm = useCallback(() => {
    if (!pendingRisk) return
    pendingRiskRef.current = false
    setPendingRisk(null)
    setPreview(null)
    window.nimbus.pty.write(tabId, '\r')
  }, [pendingRisk, tabId])

  const handleRiskCancel = useCallback(() => {
    pendingRiskRef.current = false
    setPendingRisk(null)
    setPreview(null)
    window.nimbus.pty.write(tabId, '\x15') // Ctrl+U clears the line
  }, [tabId])

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>

      {/* ── Command cards panel (only when history is enabled and there are records) ── */}
      {historyEnabled && commandRecords.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: showCards ? '0 1 45%' : '0 0 auto', minHeight: 0 }}>

          {/* Panel header */}
          <div
            onClick={() => setShowCards(v => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              height: 26,
              flexShrink: 0,
              padding: '0 10px',
              background: 'var(--bg-base)',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              cursor: 'pointer',
              gap: 7,
              userSelect: 'none',
            }}
          >
            <span style={{
              fontSize: 8,
              color: 'var(--text-muted)',
              opacity: 0.5,
              display: 'inline-block',
              transform: showCards ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 0.15s',
              lineHeight: 1,
            }}>▼</span>
            <span style={{
              fontSize: 10.5,
              color: 'var(--text-muted)',
              opacity: 0.7,
              flex: 1,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
              fontWeight: 600,
              fontFamily: 'system-ui, sans-serif',
            }}>
              History
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.4, fontFamily: 'system-ui, sans-serif' }}>
              {commandRecords.length} cmd{commandRecords.length !== 1 ? 's' : ''}
            </span>
            {/* Action buttons — only visible, no background */}
            {showCards && (<>
              <button
                onClick={e => { e.stopPropagation(); collapseAll() }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', opacity: 0.55, fontSize: 10, padding: '1px 5px', cursor: 'pointer', fontFamily: 'system-ui, sans-serif' }}
              >collapse all</button>
              <button
                onClick={e => { e.stopPropagation(); expandAll() }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', opacity: 0.55, fontSize: 10, padding: '1px 5px', cursor: 'pointer', fontFamily: 'system-ui, sans-serif' }}
              >expand all</button>
              <button
                onClick={e => { e.stopPropagation(); setCommandRecords([]); setCollapsedCards(new Set()) }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', opacity: 0.55, fontSize: 10, padding: '1px 5px', cursor: 'pointer', fontFamily: 'system-ui, sans-serif' }}
              >clear</button>
            </>)}
          </div>

          {/* Cards list */}
          {showCards && (
            <div
              ref={cardsScrollRef}
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                padding: '6px 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              {commandRecords.map(rec => (
                <CommandCard
                  key={rec.id}
                  record={rec}
                  collapsed={collapsedCards.has(rec.id)}
                  onToggle={() => toggleCard(rec.id)}
                  onSaveToMemory={onSaveCommand ? () => onSaveCommand(rec.command) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Terminal area ── */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex' }}>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {/* RiskToast — non-blocking, stays as absolute overlay */}
          {riskToast && (
            <RiskToast
              key={riskToast.key}
              level={riskToast.risk.level}
              reasons={riskToast.risk.reasons}
            />
          )}
          <div
            ref={containerRef}
            onClick={() => xtermRef.current?.focus()}
            style={{ width: '100%', height: '100%', background: 'var(--bg-base)', cursor: 'text' }}
          />
          {overlays.length > 0 && (
            <InlineOverlay
              overlays={overlays}
              onDismiss={dismissOverlay}
              onOpenInPanel={openInPanel}
            />
          )}

          {searchOpen && (
            <div style={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 200,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '5px 8px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            }}>
              <input
                autoFocus
                value={searchQuery}
                onChange={e => handleSearchChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') { closeSearch(); return }
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    e.shiftKey ? doFindPrevious(searchQuery) : doFindNext(searchQuery)
                  }
                }}
                placeholder="Search..."
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  fontFamily: '"JetBrains Mono", monospace',
                  width: 150,
                }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 48, textAlign: 'right' }}>
                {matchInfo
                  ? matchInfo.count === 0
                    ? 'No results'
                    : `${matchInfo.index}/${matchInfo.count}`
                  : ''}
              </span>
              <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 2px' }} />
              <button onClick={() => doFindPrevious(searchQuery)} title="Previous (Shift+Enter)" style={searchBtnStyle}>↑</button>
              <button onClick={() => doFindNext(searchQuery)} title="Next (Enter)" style={searchBtnStyle}>↓</button>
              <button onClick={closeSearch} title="Close (Esc)" style={{ ...searchBtnStyle, marginLeft: 2, fontSize: 16 }}>×</button>
            </div>
          )}
        </div>
        {panelBlock && (
          <RichPanel block={panelBlock} onClose={closePanel} />
        )}
      </div>

      {/* ── Risk confirmation — flex item BELOW terminal so xterm shrinks to make room ── */}
      {pendingRisk && (
        <RiskConfirmation
          command={pendingRisk.command}
          risk={pendingRisk.risk}
          preview={preview}
          previewLoading={previewLoading}
          onConfirm={handleRiskConfirm}
          onCancel={handleRiskCancel}
          onFitTerminal={() => fitAddonRef.current?.fit()}
        />
      )}
    </div>
  )
})

function keyEventToSequence(e: KeyboardEvent): string | null {
  if (e.ctrlKey && !e.altKey && !e.metaKey) {
    if (e.key.length === 1) {
      const code = e.key.toUpperCase().charCodeAt(0) - 64
      if (code > 0 && code < 32) return String.fromCharCode(code)
    }
    if (e.key === '[') return '\x1b'
    if (e.key === '\\') return '\x1c'
    if (e.key === ']') return '\x1d'
    if (e.key === '_') return '\x1f'
  }

  if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.length === 1) {
    return '\x1b' + e.key
  }

  switch (e.key) {
    case 'Backspace': return '\x7f'
    case 'Tab': return e.shiftKey ? '\x1b[Z' : '\t'
    case 'Enter': return '\r'
    case 'Escape': return '\x1b'
    case 'Delete': return '\x1b[3~'
    case 'ArrowUp': return '\x1b[A'
    case 'ArrowDown': return '\x1b[B'
    case 'ArrowRight': return '\x1b[C'
    case 'ArrowLeft': return '\x1b[D'
    case 'Home': return '\x1b[H'
    case 'End': return '\x1b[F'
    case 'PageUp': return '\x1b[5~'
    case 'PageDown': return '\x1b[6~'
    default:
      if (!e.ctrlKey && !e.metaKey && e.key.length === 1) return e.key
      return null
  }
}
