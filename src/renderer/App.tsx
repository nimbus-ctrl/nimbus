import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import TabBar from './components/TabBar'
import Sidebar from './components/Sidebar'
import AiPanel, { type DockPosition } from './components/AiPanel'
import SplitPaneContainer from './components/SplitPaneContainer'
import WorkspaceSwitcher from './components/WorkspaceSwitcher'
import CommandPalette from './components/CommandPalette'
import CommandMemoryPalette from './components/CommandMemoryPalette'
import {
  prepareMigration, getPaneBuffer, registerIncomingMigration, preloadBuffer,
  getPaneCwd, preloadCwd,
  getPaneCommandRecords, preloadCommandRecords,
} from './components/Terminal'
import type { CommandRecord } from './components/CommandCard'
import { useCommands } from './hooks/useCommands'
import { useCommandMemory } from './hooks/useCommandMemory'
import type { SplitNode, SplitDirection } from './types/splitTree'
import type { Workspace } from './types/workspace'
import { splitPane, removePane, findAllPaneIds, setRatioAtBranch } from './utils/splitTree'

export interface Tab {
  id: string
  title: string
  bookmarked: boolean
  hasActivity: boolean
  createdAt: Date
  splitRoot: SplitNode
  activePaneId: string
}

let workspaceCounter = 2

function nextTerminalNumber(existingTabs: Tab[]): number {
  const used = new Set(
    existingTabs
      .map(t => /^Terminal (\d+)$/.exec(t.title)?.[1])
      .filter((n): n is string => n !== undefined)
      .map(Number)
  )
  let n = 1
  while (used.has(n)) n++
  return n
}

function createTab(existingTabs: Tab[] = []): Tab {
  const paneId = crypto.randomUUID()
  return {
    id: crypto.randomUUID(),
    title: `Terminal ${nextTerminalNumber(existingTabs)}`,
    bookmarked: false,
    hasActivity: false,
    createdAt: new Date(),
    splitRoot: { type: 'leaf', id: paneId },
    activePaneId: paneId,
  }
}

function createWorkspace(name?: string): Workspace {
  const tab = createTab()
  // Override the first tab's name to "Terminal 1" style
  return {
    id: crypto.randomUUID(),
    name: name ?? `Workspace ${workspaceCounter++}`,
    tabs: [tab],
    activeTabId: tab.id,
    createdAt: new Date(),
  }
}

function killPane(paneId: string) {
  window.nimbus.pty.kill(paneId)
}

// ─── Serialization for cross-window transfer ──────────────────────────────────

interface SerializedTab {
  id: string
  title: string
  bookmarked: boolean
  splitRoot: SplitNode
  activePaneId: string
}

interface WindowInitData {
  type: 'tab' | 'workspace'
  tab?: SerializedTab
  workspace?: { name: string; tabs: SerializedTab[]; activeTabId: string }
  /** Buffer contents keyed by pane ID — used to restore terminal output in new window */
  buffers?: Record<string, string>
}

function serializeTab(tab: Tab): SerializedTab {
  return { id: tab.id, title: tab.title, bookmarked: tab.bookmarked, splitRoot: tab.splitRoot, activePaneId: tab.activePaneId }
}

function deserializeTab(s: SerializedTab): Tab {
  return { ...s, hasActivity: false, createdAt: new Date() }
}

// ─── Workspace snapshot (save/open from file) ────────────────────────────────

interface SnapshotTab {
  title: string
  bookmarked: boolean
  splitRoot: SplitNode
  activePaneId?: string
  cwds?: Record<string, string>
  commandRecords?: Record<string, CommandRecord[]>
}

interface WorkspaceData {
  name: string
  tabs: SnapshotTab[]
  activeTabIndex: number
  buffers?: Record<string, string>
}

// v2 saves every open workspace; v1 (legacy) saved only the active one
interface WorkspaceSnapshot {
  nimbus: 'workspace-snapshot'
  version: 2
  workspaces: WorkspaceData[]
  activeWorkspaceIndex: number
}

/** Deep-clone a split tree, replacing every leaf ID with a fresh UUID.
 *  Returns the new tree and a map of old leaf ID → new leaf ID. */
function regenerateIds(node: SplitNode): { root: SplitNode; idMap: Map<string, string> } {
  const idMap = new Map<string, string>()
  function walk(n: SplitNode): SplitNode {
    if (n.type === 'leaf') {
      const newId = crypto.randomUUID()
      idMap.set(n.id, newId)
      return { type: 'leaf', id: newId }
    }
    return { ...n, id: crypto.randomUUID(), first: walk(n.first), second: walk(n.second) }
  }
  return { root: walk(node), idMap }
}

export default function App() {
  // ─── Workspace state ────────────────────────────────────────────────────────
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => {
    const paneId = crypto.randomUUID()
    const tab: Tab = {
      id: crypto.randomUUID(),
      title: 'Terminal 1',
      bookmarked: false,
      hasActivity: false,
      createdAt: new Date(),
      splitRoot: { type: 'leaf', id: paneId },
      activePaneId: paneId,
    }
    return [{
      id: crypto.randomUUID(),
      name: 'Workspace 1',
      tabs: [tab],
      activeTabId: tab.id,
      createdAt: new Date(),
    }]
  })
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(workspaces[0].id)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [aiDockPosition, setAiDockPosition] = useState<DockPosition>('bottom')
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [commandMemoryOpen, setCommandMemoryOpen] = useState(false)
  const [historyEnabled, setHistoryEnabled] = useState<boolean>(
    () => localStorage.getItem('nimbus:prefs:history') !== 'false'
  )
  const [isFullscreen, setIsFullscreen] = useState(false)
  const renameTargetRef = useRef<string | null>(null)
  const initLoadedRef = useRef(false)

  // Load init data from main process (when this window was created with a tab/workspace)
  useEffect(() => {
    if (initLoadedRef.current) return
    initLoadedRef.current = true
    window.nimbus.window.getInitData().then((raw) => {
      const data = raw as WindowInitData | null
      if (!data) return

      // Register incoming migrations BEFORE setWorkspaces triggers Terminal mounts.
      // This populates migratingPanes + savedBuffers so Terminals reconnect to
      // existing PTYs instead of creating new ones.
      if (data.buffers) {
        for (const [paneId, buffer] of Object.entries(data.buffers)) {
          registerIncomingMigration(paneId, buffer)
        }
      }

      if (data.type === 'tab' && data.tab) {
        const tab = deserializeTab(data.tab)
        // Replace the default workspace's tab with the transferred one
        setWorkspaces(prev => {
          const ws = prev[0]
          // Kill the default empty tab's PTY
          findAllPaneIds(ws.tabs[0].splitRoot).forEach(killPane)
          return [{ ...ws, tabs: [tab], activeTabId: tab.id }]
        })
      }

      if (data.type === 'workspace' && data.workspace) {
        const ws = data.workspace
        const tabs = ws.tabs.map(deserializeTab)
        const newWs: Workspace = {
          id: crypto.randomUUID(),
          name: ws.name,
          tabs,
          activeTabId: ws.activeTabId,
          createdAt: new Date(),
        }
        // Replace default workspace with transferred one
        setWorkspaces(prev => {
          // Kill default empty tab's PTY
          findAllPaneIds(prev[0].tabs[0].splitRoot).forEach(killPane)
          return [newWs]
        })
        setActiveWorkspaceId(newWs.id)
      }
    })
  }, [])

  // ─── Fullscreen detection ──────────────────────────────────────────────────
  useEffect(() => {
    window.nimbus.window.isFullscreen().then(setIsFullscreen)
    return window.nimbus.window.onFullscreen(setIsFullscreen)
  }, [])

  // ─── History preference — sync with native menu ────────────────────────────
  useEffect(() => {
    // Tell main the current state on load so the menu checkmark is correct
    window.nimbus.ui.sendHistoryState(historyEnabled)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Listen for menu toggle
    const off = window.nimbus.ui.onToggleHistory((enabled) => {
      setHistoryEnabled(enabled)
      localStorage.setItem('nimbus:prefs:history', String(enabled))
    })
    return off
  }, [])

  // ─── File menu: Save / Open workspace snapshots ────────────────────────────
  const workspacesRef = useRef(workspaces)
  workspacesRef.current = workspaces
  const activeWorkspaceIdRef = useRef(activeWorkspaceId)
  activeWorkspaceIdRef.current = activeWorkspaceId

  useEffect(() => {
    const offSave = window.nimbus.workspace.onSaveRequest(() => {
      const allWs = workspacesRef.current
      const activeWsId = activeWorkspaceIdRef.current

      const snapshot: WorkspaceSnapshot = {
        nimbus: 'workspace-snapshot',
        version: 2,
        activeWorkspaceIndex: Math.max(0, allWs.findIndex(w => w.id === activeWsId)),
        workspaces: allWs.map(ws => {
          const buffers: Record<string, string> = {}
          const tabs: SnapshotTab[] = ws.tabs.map(t => {
            const paneIds = findAllPaneIds(t.splitRoot)
            const cwds: Record<string, string> = {}
            const cmdRecs: Record<string, CommandRecord[]> = {}

            paneIds.forEach(paneId => {
              const buf = getPaneBuffer(paneId)
              if (buf) buffers[paneId] = buf

              const cwd = getPaneCwd(paneId)
              if (cwd) cwds[paneId] = cwd

              const records = getPaneCommandRecords(paneId)
              if (records.length > 0) cmdRecs[paneId] = records
            })

            return {
              title: t.title,
              bookmarked: t.bookmarked,
              splitRoot: t.splitRoot,
              activePaneId: t.activePaneId,
              cwds: Object.keys(cwds).length > 0 ? cwds : undefined,
              commandRecords: Object.keys(cmdRecs).length > 0 ? cmdRecs : undefined,
            }
          })

          return {
            name: ws.name,
            activeTabIndex: Math.max(0, ws.tabs.findIndex(t => t.id === ws.activeTabId)),
            buffers,
            tabs,
          }
        }),
      }

      const saveName = allWs[0]?.name ?? 'workspace'
      window.nimbus.workspace.save(saveName, JSON.stringify(snapshot, null, 2))
    })

    const offOpen = window.nimbus.workspace.onOpenRequest((raw: string) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parsed = JSON.parse(raw) as any
        if (parsed.nimbus !== 'workspace-snapshot') return

        // Normalise v1 → v2 shape
        let wsDataList: WorkspaceData[]
        let activeWsIdx = 0
        if (parsed.version === 1) {
          wsDataList = [{ name: parsed.name, tabs: parsed.tabs, activeTabIndex: parsed.activeTabIndex ?? 0, buffers: parsed.buffers }]
        } else if (parsed.version === 2) {
          wsDataList = parsed.workspaces
          activeWsIdx = parsed.activeWorkspaceIndex ?? 0
        } else return

        if (!Array.isArray(wsDataList) || wsDataList.length === 0) return

        const newWorkspaces: Workspace[] = wsDataList.map(wsData => {
          if (!Array.isArray(wsData.tabs) || wsData.tabs.length === 0) return null

          const tabs: Tab[] = wsData.tabs.map((st: SnapshotTab) => {
            const { root: newRoot, idMap } = regenerateIds(st.splitRoot)
            const paneIds = findAllPaneIds(newRoot)

            for (const [oldId, newId] of idMap) {
              if (wsData.buffers?.[oldId])       preloadBuffer(newId, wsData.buffers[oldId])
              if (st.cwds?.[oldId])               preloadCwd(newId, st.cwds[oldId])
              if (st.commandRecords?.[oldId])     preloadCommandRecords(newId, st.commandRecords[oldId])
            }

            // Restore the exact pane that was focused, fall back to first
            const restoredActiveId = st.activePaneId ? idMap.get(st.activePaneId) : undefined
            const activePaneId = (restoredActiveId && paneIds.includes(restoredActiveId))
              ? restoredActiveId
              : paneIds[0]

            return {
              id: crypto.randomUUID(),
              title: st.title,
              bookmarked: st.bookmarked ?? false,
              hasActivity: false,
              createdAt: new Date(),
              splitRoot: newRoot,
              activePaneId,
            }
          }).filter(Boolean) as Tab[]

          if (tabs.length === 0) return null

          const activeIdx = Math.min(wsData.activeTabIndex ?? 0, tabs.length - 1)
          return {
            id: crypto.randomUUID(),
            name: wsData.name,
            tabs,
            activeTabId: tabs[activeIdx].id,
            createdAt: new Date(),
          } as Workspace
        }).filter(Boolean) as Workspace[]

        if (newWorkspaces.length === 0) return

        setWorkspaces(prev => [...prev, ...newWorkspaces])
        setActiveWorkspaceId(newWorkspaces[Math.min(activeWsIdx, newWorkspaces.length - 1)].id)
      } catch {
        // Invalid JSON or structure — ignore
      }
    })

    const offClose = window.nimbus.workspace.onCloseRequest(() => {
      const wsId = activeWorkspaceIdRef.current
      setWorkspaces(prev => {
        const ws = prev.find(w => w.id === wsId)
        if (ws) ws.tabs.forEach(tab => findAllPaneIds(tab.splitRoot).forEach(killPane))
        const next = prev.filter(w => w.id !== wsId)
        if (next.length === 0) {
          const fresh = createWorkspace('Workspace 1')
          workspaceCounter = 2
          setActiveWorkspaceId(fresh.id)
          return [fresh]
        }
        setActiveWorkspaceId(next[next.length - 1].id)
        return next
      })
    })

    return () => { offSave(); offOpen(); offClose() }
  }, [])

  // ─── Derived state ──────────────────────────────────────────────────────────
  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId)!
  const tabs = activeWorkspace.tabs
  const activeTabId = activeWorkspace.activeTabId

  // Helper: update only the active workspace
  const updateActiveWorkspace = useCallback((updater: (ws: Workspace) => Workspace) => {
    setWorkspaces(prev => prev.map(ws =>
      ws.id === activeWorkspaceId ? updater(ws) : ws
    ))
  }, [activeWorkspaceId])

  // Helper: set active tab within active workspace
  const setActiveTabId = useCallback((tabId: string) => {
    updateActiveWorkspace(ws => ({
      ...ws,
      activeTabId: tabId,
      tabs: ws.tabs.map(t => t.id === tabId ? { ...t, hasActivity: false } : t),
    }))
  }, [updateActiveWorkspace])

  // Called by Terminal when PTY data arrives on a background pane
  const handleActivity = useCallback((paneId: string) => {
    setWorkspaces(prev => prev.map(ws => ({
      ...ws,
      tabs: ws.tabs.map(tab => {
        const isVisible = ws.id === activeWorkspaceIdRef.current && tab.id === ws.activeTabId
        if (!isVisible && !tab.hasActivity && findAllPaneIds(tab.splitRoot).includes(paneId)) {
          return { ...tab, hasActivity: true }
        }
        return tab
      }),
    })))
  }, [])

  // ─── Keyboard shortcuts (ref-based to register once, not on every render) ───
  const stateRef = useRef({ tabs, activeTabId, commandPaletteOpen, commandMemoryOpen, workspaces, activeWorkspaceId })
  stateRef.current = { tabs, activeTabId, commandPaletteOpen, commandMemoryOpen, workspaces, activeWorkspaceId }
  // Actions ref — updated after callbacks are defined (below)
  const actionsRef = useRef<{
    splitActivePane: (d: 'vertical' | 'horizontal') => void
    closeActivePane: () => void
    detachActivePane: () => void
    setActiveTabId: (id: string) => void
    addWorkspace: () => void
  }>({
    splitActivePane: () => {},
    closeActivePane: () => {},
    detachActivePane: () => {},
    setActiveTabId: () => {},
    addWorkspace: () => {},
  })

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { tabs, activeTabId, commandPaletteOpen, workspaces, activeWorkspaceId } = stateRef.current
      const actions = actionsRef.current

      if (e.metaKey && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteOpen(prev => !prev)
        return
      }
      if (e.metaKey && e.key === 'm') {
        e.preventDefault()
        setCommandMemoryOpen(prev => !prev)
        return
      }

      if (commandPaletteOpen) return

      const target = e.target as HTMLElement
      const isXtermTextarea = target?.classList?.contains('xterm-helper-textarea')
      if ((target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') && !isXtermTextarea) return

      if (e.metaKey && e.key === 'j') {
        e.preventDefault()
        setAiPanelOpen(prev => !prev)
      }
      if (e.metaKey && !e.shiftKey && e.key === 'd') {
        e.preventDefault()
        actions.splitActivePane('vertical')
      }
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        actions.splitActivePane('horizontal')
      }
      if (e.metaKey && !e.shiftKey && e.key === 'w') {
        e.preventDefault()
        actions.closeActivePane()
      }
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault()
        actions.detachActivePane()
      }

      // Tab navigation: Cmd+1-9
      if (e.metaKey && !e.shiftKey && !e.altKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const idx = parseInt(e.key) - 1
        if (idx < tabs.length) actions.setActiveTabId(tabs[idx].id)
      }
      // Cmd+Shift+] / [ — next/prev tab
      if (e.metaKey && e.shiftKey && e.key === ']') {
        e.preventDefault()
        const idx = tabs.findIndex(t => t.id === activeTabId)
        if (idx < tabs.length - 1) actions.setActiveTabId(tabs[idx + 1].id)
      }
      if (e.metaKey && e.shiftKey && e.key === '[') {
        e.preventDefault()
        const idx = tabs.findIndex(t => t.id === activeTabId)
        if (idx > 0) actions.setActiveTabId(tabs[idx - 1].id)
      }

      // Workspace navigation: Cmd+Option+Right/Left
      if (e.metaKey && e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault()
        const idx = workspaces.findIndex(w => w.id === activeWorkspaceId)
        if (e.key === 'ArrowRight' && idx < workspaces.length - 1) {
          setActiveWorkspaceId(workspaces[idx + 1].id)
        }
        if (e.key === 'ArrowLeft' && idx > 0) {
          setActiveWorkspaceId(workspaces[idx - 1].id)
        }
      }
      // New workspace: Cmd+Option+N
      if (e.metaKey && e.altKey && e.key === 'n') {
        e.preventDefault()
        actions.addWorkspace()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Tab actions ────────────────────────────────────────────────────────────

  const MAX_TABS = 20

  const addTab = useCallback(() => {
    updateActiveWorkspace(ws => {
      if (ws.tabs.length >= MAX_TABS) return ws
      const tab = createTab(ws.tabs)
      return { ...ws, tabs: [...ws.tabs, tab], activeTabId: tab.id }
    })
  }, [updateActiveWorkspace])

  const closeTab = useCallback((id: string) => {
    updateActiveWorkspace(ws => {
      const tab = ws.tabs.find(t => t.id === id)
      if (tab) findAllPaneIds(tab.splitRoot).forEach(killPane)

      const next = ws.tabs.filter(t => t.id !== id)
      if (next.length === 0) {
        const newTab = createTab([])
        return { ...ws, tabs: [newTab], activeTabId: newTab.id }
      }
      const newActiveTabId = ws.activeTabId === id
        ? next[next.length - 1].id
        : ws.activeTabId
      return { ...ws, tabs: next, activeTabId: newActiveTabId }
    })
  }, [updateActiveWorkspace])

  const toggleBookmark = useCallback((id: string) => {
    updateActiveWorkspace(ws => ({
      ...ws,
      tabs: ws.tabs.map(t => t.id === id ? { ...t, bookmarked: !t.bookmarked } : t),
    }))
  }, [updateActiveWorkspace])

  const renameTab = useCallback((id: string, title: string) => {
    updateActiveWorkspace(ws => ({
      ...ws,
      tabs: ws.tabs.map(t => t.id === id ? { ...t, title } : t),
    }))
  }, [updateActiveWorkspace])

  const moveTabToNewWindow = useCallback((id: string) => {
    const tab = tabs.find(t => t.id === id)
    if (!tab) return

    const paneIds = findAllPaneIds(tab.splitRoot)

    // Collect buffer contents BEFORE marking as migrating (needs live xterm instances)
    const buffers: Record<string, string> = {}
    paneIds.forEach(paneId => { buffers[paneId] = getPaneBuffer(paneId) })

    // Mark all panes as migrating so PTYs survive Terminal component cleanup
    paneIds.forEach(paneId => prepareMigration(paneId))

    const initData: WindowInitData = { type: 'tab', tab: serializeTab(tab), buffers }
    window.nimbus.window.create(initData)

    // Remove tab from state WITHOUT killing PTYs (they're moving to the new window)
    updateActiveWorkspace(ws => {
      const next = ws.tabs.filter(t => t.id !== id)
      if (next.length === 0) {
        const newTab = createTab([])
        return { ...ws, tabs: [newTab], activeTabId: newTab.id }
      }
      const newActiveTabId = ws.activeTabId === id
        ? next[next.length - 1].id
        : ws.activeTabId
      return { ...ws, tabs: next, activeTabId: newActiveTabId }
    })
  }, [tabs, updateActiveWorkspace])

  // ─── Split pane actions ─────────────────────────────────────────────────────

  const splitActivePane = useCallback((direction: SplitDirection) => {
    updateActiveWorkspace(ws => ({
      ...ws,
      tabs: ws.tabs.map(tab => {
        if (tab.id !== ws.activeTabId) return tab
        const result = splitPane(tab.splitRoot, tab.activePaneId, direction)
        return { ...tab, splitRoot: result.root, activePaneId: result.newPaneId }
      }),
    }))
  }, [updateActiveWorkspace])

  const closeActivePane = useCallback(() => {
    updateActiveWorkspace(ws => {
      const tab = ws.tabs.find(t => t.id === ws.activeTabId)
      if (!tab) return ws

      const paneId = tab.activePaneId
      const newRoot = removePane(tab.splitRoot, paneId)
      killPane(paneId)

      if (newRoot === null) {
        // Last pane — close the tab
        const next = ws.tabs.filter(t => t.id !== ws.activeTabId)
        if (next.length === 0) {
          const newTab = createTab([])
          return { ...ws, tabs: [newTab], activeTabId: newTab.id }
        }
        return { ...ws, tabs: next, activeTabId: next[next.length - 1].id }
      }

      const allPanes = findAllPaneIds(newRoot)
      return {
        ...ws,
        tabs: ws.tabs.map(t => t.id === ws.activeTabId
          ? { ...t, splitRoot: newRoot, activePaneId: allPanes[0] }
          : t
        ),
      }
    })
  }, [updateActiveWorkspace])

  const detachPane = useCallback((paneId?: string) => {
    const currentTab = tabs.find(t => t.id === activeTabId)
    if (!currentTab || currentTab.splitRoot.type === 'leaf') return
    const targetPaneId = paneId ?? currentTab.activePaneId
    prepareMigration(targetPaneId)

    const newTabId = crypto.randomUUID()

    updateActiveWorkspace(ws => {
      const tab = ws.tabs.find(t => t.id === ws.activeTabId)
      if (!tab || tab.splitRoot.type === 'leaf') return ws

      const newRoot = removePane(tab.splitRoot, targetPaneId)
      if (newRoot === null) return ws

      const remainingPanes = findAllPaneIds(newRoot)
      const newTab: Tab = {
        id: newTabId,
        title: `Terminal ${nextTerminalNumber(ws.tabs)}`,
        bookmarked: false,
        hasActivity: false,
        createdAt: new Date(),
        splitRoot: { type: 'leaf', id: targetPaneId },
        activePaneId: targetPaneId,
      }

      const updated = ws.tabs.map(t =>
        t.id === ws.activeTabId
          ? { ...t, splitRoot: newRoot, activePaneId: remainingPanes[0] }
          : t
      )

      return { ...ws, tabs: [...updated, newTab], activeTabId: newTabId }
    })
  }, [activeTabId, tabs, updateActiveWorkspace])

  const detachActivePane = useCallback(() => {
    detachPane(undefined)
  }, [detachPane])

  const setActivePaneId = useCallback((paneId: string) => {
    updateActiveWorkspace(ws => ({
      ...ws,
      tabs: ws.tabs.map(t =>
        t.id === ws.activeTabId ? { ...t, activePaneId: paneId } : t
      ),
    }))
  }, [updateActiveWorkspace])

  const handleRatioChange = useCallback((branchId: string, ratio: number) => {
    updateActiveWorkspace(ws => ({
      ...ws,
      tabs: ws.tabs.map(t =>
        t.id === ws.activeTabId
          ? { ...t, splitRoot: setRatioAtBranch(t.splitRoot, branchId, ratio) }
          : t
      ),
    }))
  }, [updateActiveWorkspace])

  // ─── Workspace actions ──────────────────────────────────────────────────────

  const addWorkspace = useCallback(() => {
    const ws = createWorkspace()
    setWorkspaces(prev => [...prev, ws])
    setActiveWorkspaceId(ws.id)
  }, [])

  const deleteWorkspace = useCallback((id: string) => {
    setWorkspaces(prev => {
      const ws = prev.find(w => w.id === id)
      if (ws) {
        // Kill all PTYs in this workspace
        ws.tabs.forEach(tab => findAllPaneIds(tab.splitRoot).forEach(killPane))
      }
      const next = prev.filter(w => w.id !== id)
      if (next.length === 0) {
        const fresh = createWorkspace('Workspace 1')
        workspaceCounter = 2
        setActiveWorkspaceId(fresh.id)
        return [fresh]
      }
      if (activeWorkspaceId === id) {
        setActiveWorkspaceId(next[next.length - 1].id)
      }
      return next
    })
  }, [activeWorkspaceId])

  const renameWorkspace = useCallback((id: string, name: string) => {
    setWorkspaces(prev => prev.map(ws =>
      ws.id === id ? { ...ws, name } : ws
    ))
  }, [])

  const switchWorkspace = useCallback((id: string) => {
    setActiveWorkspaceId(id)
  }, [])

  const moveWorkspaceToNewWindow = useCallback((wsId: string) => {
    setWorkspaces(prev => {
      const ws = prev.find(w => w.id === wsId)
      if (!ws || prev.length <= 1) return prev // don't move the only workspace

      // Collect all pane IDs and their buffers
      const allPaneIds: string[] = []
      ws.tabs.forEach(tab => allPaneIds.push(...findAllPaneIds(tab.splitRoot)))

      const buffers: Record<string, string> = {}
      allPaneIds.forEach(paneId => { buffers[paneId] = getPaneBuffer(paneId) })

      // Mark all panes as migrating so PTYs survive
      allPaneIds.forEach(paneId => prepareMigration(paneId))

      const initData: WindowInitData = {
        type: 'workspace',
        workspace: {
          name: ws.name,
          tabs: ws.tabs.map(serializeTab),
          activeTabId: ws.activeTabId,
        },
        buffers,
      }
      window.nimbus.window.create(initData)

      // Remove workspace from this window
      const next = prev.filter(w => w.id !== wsId)
      if (activeWorkspaceId === wsId) {
        setActiveWorkspaceId(next[next.length - 1].id)
      }
      return next
    })
  }, [activeWorkspaceId])

  const moveTabToWorkspace = useCallback((tabId: string, targetWorkspaceId: string) => {
    setWorkspaces(prev => {
      // Find source workspace
      const sourceWs = prev.find(ws => ws.tabs.some(t => t.id === tabId))
      if (!sourceWs || sourceWs.id === targetWorkspaceId) return prev

      const tab = sourceWs.tabs.find(t => t.id === tabId)
      if (!tab) return prev

      return prev.map(ws => {
        if (ws.id === sourceWs.id) {
          // Remove tab from source
          const remaining = ws.tabs.filter(t => t.id !== tabId)
          if (remaining.length === 0) {
            const newTab = createTab([])
            return { ...ws, tabs: [newTab], activeTabId: newTab.id }
          }
          const newActiveTabId = ws.activeTabId === tabId
            ? remaining[remaining.length - 1].id
            : ws.activeTabId
          return { ...ws, tabs: remaining, activeTabId: newActiveTabId }
        }
        if (ws.id === targetWorkspaceId) {
          // Add tab to target and make it active
          return { ...ws, tabs: [...ws.tabs, tab], activeTabId: tab.id }
        }
        return ws
      })
    })
    // Follow the tab to its new workspace
    setActiveWorkspaceId(targetWorkspaceId)
  }, [])

  // ─── Derived values ─────────────────────────────────────────────────────────

  const activeTab = tabs.find(t => t.id === activeTabId)
  const canDetach = activeTab ? activeTab.splitRoot.type !== 'leaf' : false
  const activePaneId = activeTab?.activePaneId ?? ''
  const activeCwd = getPaneCwd(activePaneId) ?? ''

  // ─── Command Memory ─────────────────────────────────────────────────────────
  const commandMemory = useCommandMemory(activeCwd, activeWorkspaceId)

  const promptRename = useCallback((id: string) => {
    const tab = tabs.find(t => t.id === id)
    if (!tab) return
    const newTitle = window.prompt('Rename tab:', tab.title)
    if (newTitle && newTitle.trim()) renameTab(id, newTitle.trim())
  }, [tabs, renameTab])

  // All tabs across all workspaces — for keeping terminals alive when switching workspaces
  const allTabsWithVisibility = useMemo(() =>
    workspaces.flatMap(ws =>
      ws.tabs.map(tab => ({
        tab,
        isVisible: ws.id === activeWorkspaceId && tab.id === ws.activeTabId,
      }))
    ),
    [workspaces, activeWorkspaceId]
  )

  const commands = useCommands({
    tabs,
    activeTabId,
    addTab,
    closeTab,
    toggleBookmark,
    renameTab,
    setActiveTabId,
    splitActivePane,
    closeActivePane,
    detachActivePane,
    canDetach,
    toggleAiPanel: () => setAiPanelOpen(prev => !prev),
    toggleSidebar: () => setSidebarOpen(prev => !prev),
    setAiDockPosition,
    aiPanelOpen,
    sidebarOpen,
    activePaneId,
    promptRename,
    // Workspace actions
    workspaces,
    activeWorkspaceId,
    addWorkspace,
    deleteWorkspace,
    renameWorkspace,
    switchWorkspace,
  })

  // Keep actionsRef in sync for the keyboard shortcut handler (registered once)
  actionsRef.current = { splitActivePane, closeActivePane, detachActivePane, setActiveTabId, addWorkspace }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-base)' }}>
      {/* Unified bar — workspace switcher + tabs + controls, single row */}
      <div style={{
        height: 40,
        display: 'flex',
        alignItems: 'center',
        background: 'var(--bg-base)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}>

        {/* Left: traffic-light space + workspace switcher */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          paddingLeft: isFullscreen ? 12 : 80,
          paddingRight: 10,
          height: '100%',
          borderRight: '1px solid var(--border)',
          flexShrink: 0,
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}>
          <WorkspaceSwitcher
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            onSwitch={switchWorkspace}
            onAdd={addWorkspace}
            onRename={renameWorkspace}
            onDelete={deleteWorkspace}
            onMoveToNewWindow={moveWorkspaceToNewWindow}
          />
        </div>

        {/* Middle: tabs — crossfade on workspace switch */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeWorkspaceId}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1, ease: 'linear' }}
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              height: '100%',
              WebkitAppRegion: 'no-drag',
            } as React.CSSProperties}
          >
            <TabBar
              tabs={tabs}
              activeTabId={activeTabId}
              onSelect={setActiveTabId}
              onAdd={addTab}
              onClose={closeTab}
              onToggleBookmark={toggleBookmark}
              onRename={renameTab}
              onMoveToNewWindow={moveTabToNewWindow}
              workspaces={workspaces}
              currentWorkspaceId={activeWorkspaceId}
              onMoveTabToWorkspace={moveTabToWorkspace}
              embedded
            />
          </motion.div>
        </AnimatePresence>

        {/* Right: drag spacer + controls */}
        <div style={{ flex: '0 0 20px', WebkitAppRegion: 'drag' } as React.CSSProperties} />
        <div style={{
          display: 'flex',
          gap: 6,
          paddingRight: 12,
          flexShrink: 0,
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setAiPanelOpen(o => !o)}
            style={{
              background: aiPanelOpen ? 'var(--accent-glow)' : 'transparent',
              border: `1px solid ${aiPanelOpen ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 6,
              color: aiPanelOpen ? 'var(--accent)' : 'var(--text-secondary)',
              padding: '4px 10px',
              fontSize: 12,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            AI
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSidebarOpen(o => !o)}
            style={{
              background: sidebarOpen ? 'var(--accent-glow)' : 'transparent',
              border: `1px solid ${sidebarOpen ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 6,
              color: sidebarOpen ? 'var(--accent)' : 'var(--text-secondary)',
              padding: '4px 10px',
              fontSize: 12,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Panel
          </motion.button>
        </div>
      </div>

      {/* Main area */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <AnimatePresence>
            {aiPanelOpen && aiDockPosition === 'left' && (
              <AiPanel
                isOpen={aiPanelOpen}
                position={aiDockPosition}
                onPositionChange={setAiDockPosition}
                onClose={() => setAiPanelOpen(false)}
              />
            )}
          </AnimatePresence>

          {/* All terminals across ALL workspaces — hidden ones stay alive */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            {allTabsWithVisibility.map(({ tab, isVisible }) => (
              <div
                key={tab.id}
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: isVisible ? 'flex' : 'none',
                }}
              >
                <SplitPaneContainer
                  node={tab.splitRoot}
                  activePaneId={tab.activePaneId}
                  onPaneClick={setActivePaneId}
                  onRatioChange={handleRatioChange}
                  onDetachPane={canDetach && isVisible ? detachPane : undefined}
                  isTabActive={isVisible}
                  onActivity={!isVisible ? handleActivity : undefined}
                  onCommandRun={isVisible ? commandMemory.recordUsage : undefined}
                  historyEnabled={historyEnabled}
                  onSaveCommand={isVisible ? (cmd) => commandMemory.addCommand({
                    title: cmd.slice(0, 60),
                    command: cmd,
                    note: '',
                    tags: [],
                    scope: 'global',
                    pinned: false,
                  }) : undefined}
                />
              </div>
            ))}
          </div>

          <AnimatePresence>
            {aiPanelOpen && aiDockPosition === 'right' && (
              <AiPanel
                isOpen={aiPanelOpen}
                position={aiDockPosition}
                onPositionChange={setAiDockPosition}
                onClose={() => setAiPanelOpen(false)}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 300, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                style={{ overflow: 'hidden', flexShrink: 0 }}
              >
                <Sidebar
                  tabs={tabs}
                  onSelectTab={setActiveTabId}
                  memoryCommands={commandMemory.visibleCommands}
                  onAddMemoryCommand={commandMemory.addCommand}
                  onDeleteMemoryCommand={commandMemory.deleteCommand}
                  onTogglePinMemoryCommand={commandMemory.togglePin}
                  onRunCommand={(cmd) => {
                    if (activePaneId) {
                      window.nimbus.pty.write(activePaneId, '\x15' + cmd + '\r')
                      commandMemory.recordUsage(cmd, activeCwd)
                    }
                  }}
                  onInsertCommand={(cmd) => {
                    if (activePaneId) {
                      window.nimbus.pty.write(activePaneId, '\x15' + cmd)
                      commandMemory.recordUsage(cmd, activeCwd)
                    }
                  }}
                  activeWorkspaceId={activeWorkspaceId}
                  projectRoot={commandMemory.context.projectRoot}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {aiPanelOpen && aiDockPosition === 'bottom' && (
            <AiPanel
              isOpen={aiPanelOpen}
              position={aiDockPosition}
              onPositionChange={setAiDockPosition}
              onClose={() => setAiPanelOpen(false)}
            />
          )}
        </AnimatePresence>
      </div>

      <CommandPalette
        isOpen={commandPaletteOpen}
        commands={commands}
        onClose={() => setCommandPaletteOpen(false)}
      />

      <CommandMemoryPalette
        isOpen={commandMemoryOpen}
        commands={commandMemory.visibleCommands}
        suggestions={commandMemory.suggestions}
        context={commandMemory.context}
        activePaneId={activePaneId}
        onClose={() => setCommandMemoryOpen(false)}
        onSaveCommand={(command, title) => commandMemory.addCommand({
          title: title ?? command.slice(0, 60),
          command,
          note: '',
          tags: [],
          scope: 'global',
          pinned: false,
        })}
        onRecordUsage={(cmd) => commandMemory.recordUsage(cmd, activeCwd)}
      />
    </div>
  )
}
