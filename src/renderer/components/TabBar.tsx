import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence, Reorder } from 'framer-motion'
import type { Tab } from '../App'
import type { Workspace } from '../types/workspace'

interface Props {
  tabs: Tab[]
  activeTabId: string
  onSelect: (id: string) => void
  onAdd: () => void
  onClose: (id: string) => void
  onToggleBookmark: (id: string) => void
  onRename: (id: string, title: string) => void
  onMoveToNewWindow: (id: string) => void
  workspaces: Workspace[]
  currentWorkspaceId: string
  onMoveTabToWorkspace: (tabId: string, workspaceId: string) => void
  onReorder: (tabs: Tab[]) => void
  /** When true, renders without its own background/border/height container — parent provides those */
  embedded?: boolean
}

export default function TabBar({ tabs, activeTabId, onSelect, onAdd, onClose, onToggleBookmark, onRename, onMoveToNewWindow, workspaces, currentWorkspaceId, onMoveTabToWorkspace, onReorder, embedded }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevTabCountRef = useRef(tabs.length)

  // Scroll to end when a new tab is added
  useEffect(() => {
    if (tabs.length > prevTabCountRef.current && scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
    }
    prevTabCountRef.current = tabs.length
  }, [tabs.length])

  // Redirect vertical mouse-wheel to horizontal scroll
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.deltaX !== 0) return // already horizontal (trackpad), let it pass
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const startEdit = (tab: Tab) => {
    setEditingId(tab.id)
    setEditValue(tab.title)
  }

  const commitEdit = (id: string) => {
    if (editValue.trim()) onRename(id, editValue.trim())
    setEditingId(null)
  }

  const handleContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, tabId })
  }, [])

  const closeMenu = useCallback(() => setContextMenu(null), [])

  return (
    <div ref={scrollRef} className="tab-bar-scroll" style={embedded ? {
      display: 'flex',
      alignItems: 'center',
      overflowX: 'auto',
      overflowY: 'hidden',
      flex: 1,
      height: '100%',
      gap: 2,
      padding: '0 8px',
      scrollbarWidth: 'none',
    } : {
      display: 'flex',
      alignItems: 'center',
      background: 'var(--bg-base)',
      borderBottom: '1px solid var(--border)',
      overflowX: 'auto',
      overflowY: 'hidden',
      flexShrink: 0,
      height: 38,
      gap: 2,
      padding: '0 8px',
      scrollbarWidth: 'none',
    }}>
      <Reorder.Group
        axis="x"
        values={tabs}
        onReorder={onReorder}
        style={{ display: 'flex', gap: 2, alignItems: 'center', listStyle: 'none', padding: 0, margin: 0 }}
      >
        <AnimatePresence initial={false}>
        {tabs.map(tab => (
          <Reorder.Item
            key={tab.id}
            value={tab}
            initial={{ opacity: 0, scaleX: 0.7 }}
            animate={{ opacity: 1, scaleX: 1 }}
            exit={{ opacity: 0, scaleX: 0.7 }}
            transition={{ duration: 0.08, ease: 'easeOut' }}
            onContextMenu={(e) => handleContextMenu(e, tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 10px',
              height: 30,
              borderRadius: 6,
              background: tab.id === activeTabId ? 'var(--bg-tab-active)' : 'var(--bg-tab)',
              border: `1px solid ${tab.id === activeTabId ? 'var(--border-active)' : 'transparent'}`,
              cursor: 'grab',
              whiteSpace: 'nowrap',
              minWidth: 100,
              maxWidth: 180,
              flexShrink: 0,
              boxShadow: tab.id === activeTabId ? '0 0 12px var(--accent-glow)' : 'none',
            }}
            onClick={() => onSelect(tab.id)}
          >
            {/* Activity dot — pulses when tab has unseen output */}
            {tab.hasActivity && tab.id !== activeTabId && (
              <motion.div
                animate={{ opacity: [1, 0.35, 1] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                style={{ width: 6, height: 6, borderRadius: '50%', background: '#6af7a0', flexShrink: 0 }}
              />
            )}

            {/* Bookmark dot */}
            {tab.bookmarked && (
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
            )}

            {/* Title */}
            {editingId === tab.id ? (
              <input
                autoFocus
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={() => commitEdit(tab.id)}
                onKeyDown={e => { if (e.key === 'Enter') commitEdit(tab.id); if (e.key === 'Escape') setEditingId(null) }}
                onClick={e => e.stopPropagation()}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  width: 90,
                  fontFamily: 'inherit',
                }}
              />
            ) : (
              <span
                style={{ fontSize: 12, color: tab.id === activeTabId ? 'var(--text-primary)' : 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}
                onDoubleClick={() => startEdit(tab)}
              >
                {tab.title}
              </span>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 3, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
              <button
                onClick={() => onToggleBookmark(tab.id)}
                title={tab.bookmarked ? 'Remove bookmark' : 'Bookmark'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: tab.bookmarked ? 'var(--accent)' : 'var(--text-muted)', fontSize: 10, padding: 2, lineHeight: 1 }}
              >
                {tab.bookmarked ? '★' : '☆'}
              </button>
              <button
                onClick={() => onClose(tab.id)}
                title="Close tab"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11, padding: 2, lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          </Reorder.Item>
        ))}
        </AnimatePresence>
      </Reorder.Group>

      {/* Add tab */}
      <motion.button
        whileHover={{ scale: 1.1, color: 'var(--accent)' }}
        whileTap={{ scale: 0.9 }}
        onClick={onAdd}
        style={{
          background: 'none',
          border: '1px dashed var(--border)',
          borderRadius: 6,
          color: 'var(--text-muted)',
          width: 28,
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: 16,
          flexShrink: 0,
          transition: 'color 0.2s',
        }}
      >
        +
      </motion.button>

      {/* Tab context menu */}
      {contextMenu && (
        <TabContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          tabId={contextMenu.tabId}
          tabCount={tabs.length}
          onClose={closeMenu}
          onCloseTab={() => { closeMenu(); onClose(contextMenu.tabId) }}
          onCloseOtherTabs={() => {
            closeMenu()
            tabs.filter(t => t.id !== contextMenu.tabId).forEach(t => onClose(t.id))
          }}
          onRename={() => {
            closeMenu()
            const tab = tabs.find(t => t.id === contextMenu.tabId)
            if (tab) startEdit(tab)
          }}
          onToggleBookmark={() => { closeMenu(); onToggleBookmark(contextMenu.tabId) }}
          onMoveToNewWindow={() => { closeMenu(); onMoveToNewWindow(contextMenu.tabId) }}
          isBookmarked={tabs.find(t => t.id === contextMenu.tabId)?.bookmarked ?? false}
          otherWorkspaces={workspaces.filter(w => w.id !== currentWorkspaceId)}
          onMoveToWorkspace={(wsId) => { closeMenu(); onMoveTabToWorkspace(contextMenu.tabId, wsId) }}
        />
      )}
    </div>
  )
}

// ─── Tab context menu ─────────────────────────────────────────────────────────

function TabContextMenu({
  x,
  y,
  tabId,
  tabCount,
  onClose,
  onCloseTab,
  onCloseOtherTabs,
  onRename,
  onToggleBookmark,
  onMoveToNewWindow,
  isBookmarked,
  otherWorkspaces,
  onMoveToWorkspace,
}: {
  x: number
  y: number
  tabId: string
  tabCount: number
  onClose: () => void
  onCloseTab: () => void
  onCloseOtherTabs: () => void
  onRename: () => void
  onToggleBookmark: () => void
  onMoveToNewWindow: () => void
  isBookmarked: boolean
  otherWorkspaces: Workspace[]
  onMoveToWorkspace: (wsId: string) => void
}) {
  return (
    <>
      <div
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose() }}
        style={{ position: 'fixed', inset: 0, zIndex: 999 }}
      />
      <div style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 1000,
        background: 'var(--bg-overlay)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '4px 0',
        minWidth: 200,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(12px)',
      }}>
        <MenuItem onClick={onRename}>Rename Tab</MenuItem>
        <MenuItem onClick={onToggleBookmark}>
          {isBookmarked ? 'Remove Bookmark' : 'Bookmark Tab'}
        </MenuItem>
        <MenuDivider />
        <MenuItem onClick={onCloseTab}>Close Tab</MenuItem>
        {tabCount > 1 && (
          <MenuItem onClick={onCloseOtherTabs}>Close Other Tabs</MenuItem>
        )}
        <MenuDivider />
        <MenuItem onClick={onMoveToNewWindow}>Move to New Window</MenuItem>
        {otherWorkspaces.length > 0 && (
          <>
            <MenuDivider />
            {otherWorkspaces.map(ws => (
              <MenuItem key={ws.id} onClick={() => onMoveToWorkspace(ws.id)}>
                Move to "{ws.name}"
              </MenuItem>
            ))}
          </>
        )}
      </div>
    </>
  )
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '6px 14px',
        fontSize: 13,
        color: 'var(--text-primary)',
        cursor: 'pointer',
        background: hovered ? 'var(--accent-glow)' : 'transparent',
        transition: 'background 0.1s',
        userSelect: 'none',
      }}
    >
      {children}
    </div>
  )
}

function MenuDivider() {
  return <div style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />
}
