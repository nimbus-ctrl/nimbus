import { useMemo } from 'react'
import type { Command } from '../types/command'
import type { Tab } from '../App'
import type { Workspace } from '../types/workspace'
import { getXtermInstance } from '../components/Terminal'

interface CommandActions {
  tabs: Tab[]
  activeTabId: string
  addTab: () => void
  closeTab: (id: string) => void
  toggleBookmark: (id: string) => void
  renameTab: (id: string, title: string) => void
  setActiveTabId: (id: string) => void
  splitActivePane: (dir: 'vertical' | 'horizontal') => void
  closeActivePane: () => void
  detachActivePane: () => void
  canDetach: boolean
  toggleAiPanel: () => void
  toggleSidebar: () => void
  setAiDockPosition: (pos: 'bottom' | 'right' | 'left') => void
  aiPanelOpen: boolean
  sidebarOpen: boolean
  activePaneId: string
  promptRename: (id: string) => void
  // Workspace
  workspaces: Workspace[]
  activeWorkspaceId: string
  addWorkspace: () => void
  deleteWorkspace: (id: string) => void
  renameWorkspace: (id: string, name: string) => void
  switchWorkspace: (id: string) => void
}

export function useCommands(actions: CommandActions): Command[] {
  const {
    tabs, activeTabId, addTab, closeTab, toggleBookmark,
    setActiveTabId, splitActivePane, closeActivePane,
    detachActivePane, canDetach, toggleAiPanel, toggleSidebar,
    setAiDockPosition, aiPanelOpen, sidebarOpen, activePaneId,
    promptRename, workspaces, activeWorkspaceId, addWorkspace,
    deleteWorkspace, renameWorkspace, switchWorkspace,
  } = actions

  return useMemo(() => {
    const cmds: Command[] = [
      // ─── Tab ──────────────────────────────────────────
      {
        id: 'tab.new',
        label: 'New Tab',
        category: 'Tab',
        shortcut: '⌘T',
        keywords: ['create', 'open', 'add'],
        execute: addTab,
      },
      {
        id: 'tab.close',
        label: 'Close Tab',
        category: 'Tab',
        keywords: ['remove', 'delete'],
        execute: () => closeTab(activeTabId),
      },
      {
        id: 'tab.close-others',
        label: 'Close Other Tabs',
        category: 'Tab',
        keywords: ['close all', 'remove others'],
        execute: () => {
          tabs.filter(t => t.id !== activeTabId).forEach(t => closeTab(t.id))
        },
        when: () => tabs.length > 1,
      },
      {
        id: 'tab.rename',
        label: 'Rename Tab',
        category: 'Tab',
        keywords: ['title', 'name'],
        execute: () => promptRename(activeTabId),
      },
      {
        id: 'tab.bookmark',
        label: 'Toggle Bookmark',
        category: 'Tab',
        shortcut: '⌘B',
        keywords: ['pin', 'star', 'favorite'],
        execute: () => toggleBookmark(activeTabId),
      },
      {
        id: 'tab.next',
        label: 'Next Tab',
        category: 'Tab',
        shortcut: '⌘⇧]',
        keywords: ['right', 'forward'],
        execute: () => {
          const idx = tabs.findIndex(t => t.id === activeTabId)
          if (idx < tabs.length - 1) setActiveTabId(tabs[idx + 1].id)
        },
        when: () => {
          const idx = tabs.findIndex(t => t.id === activeTabId)
          return idx < tabs.length - 1
        },
      },
      {
        id: 'tab.prev',
        label: 'Previous Tab',
        category: 'Tab',
        shortcut: '⌘⇧[',
        keywords: ['left', 'back'],
        execute: () => {
          const idx = tabs.findIndex(t => t.id === activeTabId)
          if (idx > 0) setActiveTabId(tabs[idx - 1].id)
        },
        when: () => {
          const idx = tabs.findIndex(t => t.id === activeTabId)
          return idx > 0
        },
      },

      // ─── Pane ─────────────────────────────────────────
      {
        id: 'pane.split-vertical',
        label: 'Split Pane Right',
        category: 'Pane',
        shortcut: '⌘D',
        keywords: ['vertical', 'divide', 'split right'],
        execute: () => splitActivePane('vertical'),
      },
      {
        id: 'pane.split-horizontal',
        label: 'Split Pane Down',
        category: 'Pane',
        shortcut: '⌘⇧D',
        keywords: ['horizontal', 'divide', 'split down'],
        execute: () => splitActivePane('horizontal'),
      },
      {
        id: 'pane.close',
        label: 'Close Pane',
        category: 'Pane',
        shortcut: '⌘W',
        keywords: ['remove', 'delete'],
        execute: closeActivePane,
      },
      {
        id: 'pane.detach',
        label: 'Move Pane to New Tab',
        category: 'Pane',
        shortcut: '⌘⇧T',
        keywords: ['detach', 'extract', 'separate'],
        execute: detachActivePane,
        when: () => canDetach,
      },

      // ─── UI ───────────────────────────────────────────
      {
        id: 'ui.toggle-ai',
        label: aiPanelOpen ? 'Hide AI Panel' : 'Show AI Panel',
        category: 'UI',
        shortcut: '⌘J',
        keywords: ['ai', 'assistant', 'chat'],
        execute: toggleAiPanel,
      },
      {
        id: 'ui.toggle-sidebar',
        label: sidebarOpen ? 'Hide Sidebar' : 'Show Sidebar',
        category: 'UI',
        keywords: ['panel', 'side'],
        execute: toggleSidebar,
      },
      {
        id: 'ui.ai-dock-bottom',
        label: 'Dock AI Panel Bottom',
        category: 'UI',
        keywords: ['position', 'move'],
        execute: () => setAiDockPosition('bottom'),
      },
      {
        id: 'ui.ai-dock-right',
        label: 'Dock AI Panel Right',
        category: 'UI',
        keywords: ['position', 'move'],
        execute: () => setAiDockPosition('right'),
      },
      {
        id: 'ui.ai-dock-left',
        label: 'Dock AI Panel Left',
        category: 'UI',
        keywords: ['position', 'move'],
        execute: () => setAiDockPosition('left'),
      },

      // ─── Terminal ─────────────────────────────────────
      {
        id: 'terminal.clear',
        label: 'Clear Terminal',
        category: 'Terminal',
        shortcut: '⌘K',
        keywords: ['reset', 'clean'],
        execute: () => {
          const xterm = getXtermInstance(activePaneId)
          if (xterm) {
            xterm.clear()
            // Also send Ctrl+L to the shell
            window.nimbus.pty.write(activePaneId, '\x0c')
          }
        },
      },
      {
        id: 'terminal.reset',
        label: 'Reset Terminal',
        category: 'Terminal',
        keywords: ['restart', 'refresh'],
        execute: () => {
          const xterm = getXtermInstance(activePaneId)
          if (xterm) xterm.reset()
        },
      },

      // ─── Workspace ──────────────────────────────────────
      {
        id: 'workspace.new',
        label: 'New Workspace',
        category: 'Workspace',
        shortcut: '⌘⌥N',
        keywords: ['create', 'add', 'workspace'],
        execute: addWorkspace,
      },
      {
        id: 'workspace.delete',
        label: 'Delete Workspace',
        category: 'Workspace',
        keywords: ['remove', 'close', 'workspace'],
        execute: () => deleteWorkspace(activeWorkspaceId),
        when: () => workspaces.length > 1,
      },
      {
        id: 'workspace.rename',
        label: 'Rename Workspace',
        category: 'Workspace',
        keywords: ['name', 'title', 'workspace'],
        execute: () => {
          const ws = workspaces.find(w => w.id === activeWorkspaceId)
          if (!ws) return
          const name = window.prompt('Rename workspace:', ws.name)
          if (name && name.trim()) renameWorkspace(activeWorkspaceId, name.trim())
        },
      },
      {
        id: 'workspace.next',
        label: 'Next Workspace',
        category: 'Workspace',
        shortcut: '⌘⌥→',
        keywords: ['switch', 'right', 'forward'],
        execute: () => {
          const idx = workspaces.findIndex(w => w.id === activeWorkspaceId)
          if (idx < workspaces.length - 1) switchWorkspace(workspaces[idx + 1].id)
        },
        when: () => {
          const idx = workspaces.findIndex(w => w.id === activeWorkspaceId)
          return idx < workspaces.length - 1
        },
      },
      {
        id: 'workspace.prev',
        label: 'Previous Workspace',
        category: 'Workspace',
        shortcut: '⌘⌥←',
        keywords: ['switch', 'left', 'back'],
        execute: () => {
          const idx = workspaces.findIndex(w => w.id === activeWorkspaceId)
          if (idx > 0) switchWorkspace(workspaces[idx - 1].id)
        },
        when: () => {
          const idx = workspaces.findIndex(w => w.id === activeWorkspaceId)
          return idx > 0
        },
      },
    ]

    // ─── Dynamic: switch to tab N ───────────────────────
    tabs.forEach((tab, i) => {
      cmds.push({
        id: `tab.switch.${tab.id}`,
        label: `Switch to "${tab.title}"`,
        category: 'Tab',
        shortcut: i < 9 ? `⌘${i + 1}` : undefined,
        keywords: ['go', 'navigate', tab.title.toLowerCase()],
        execute: () => setActiveTabId(tab.id),
        when: () => tab.id !== activeTabId,
      })
    })

    // ─── Dynamic: switch to workspace N ─────────────────
    workspaces.forEach(ws => {
      cmds.push({
        id: `workspace.switch.${ws.id}`,
        label: `Switch to "${ws.name}"`,
        category: 'Workspace',
        keywords: ['go', 'navigate', 'workspace', ws.name.toLowerCase()],
        execute: () => switchWorkspace(ws.id),
        when: () => ws.id !== activeWorkspaceId,
      })
    })

    return cmds
  }, [
    tabs, activeTabId, addTab, closeTab, toggleBookmark,
    setActiveTabId, splitActivePane, closeActivePane,
    detachActivePane, canDetach, toggleAiPanel, toggleSidebar,
    setAiDockPosition, aiPanelOpen, sidebarOpen, activePaneId,
    promptRename, workspaces, activeWorkspaceId, addWorkspace,
    deleteWorkspace, renameWorkspace, switchWorkspace,
  ])
}
