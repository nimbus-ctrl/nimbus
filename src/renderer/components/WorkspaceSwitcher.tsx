import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Workspace } from '../types/workspace'

interface Props {
  workspaces: Workspace[]
  activeWorkspaceId: string
  onSwitch: (id: string) => void
  onAdd: () => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onMoveToNewWindow: (id: string) => void
}

export default function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  onSwitch,
  onAdd,
  onRename,
  onDelete,
  onMoveToNewWindow,
}: Props) {
  const [open, setOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; wsId: string } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Sync focused index to active workspace when opening
  useEffect(() => {
    if (open) {
      const idx = workspaces.findIndex(w => w.id === activeWorkspaceId)
      setFocusedIndex(idx >= 0 ? idx : 0)
    }
  }, [open, activeWorkspaceId, workspaces])

  const handleTriggerKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setOpen(o => !o)
    }
    if (e.key === 'Escape') setOpen(false)
  }, [])

  const handleListKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setFocusedIndex(i => Math.min(i + 1, workspaces.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusedIndex(i => Math.max(i - 1, 0))
        break
      case 'Enter': {
        e.preventDefault()
        const ws = workspaces[focusedIndex]
        if (ws) { onSwitch(ws.id); setOpen(false) }
        break
      }
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        break
    }
  }, [workspaces, focusedIndex, onSwitch])

  const handleContextMenu = useCallback((e: React.MouseEvent, wsId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, wsId })
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        onKeyDown={handleTriggerKeyDown}
        title="Switch workspace"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          background: open ? 'var(--accent-glow)' : 'transparent',
          border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 6,
          color: open ? 'var(--accent)' : 'var(--text-secondary)',
          padding: '4px 9px',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'all 0.15s',
          maxWidth: 180,
          fontFamily: 'inherit',
          outline: 'none',
        }}
      >
        <span style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: 140,
        }}>
          {activeWorkspace?.name ?? 'Workspace'}
        </span>
        <span style={{
          fontSize: 8,
          opacity: 0.6,
          flexShrink: 0,
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.15s',
          lineHeight: 1,
        }}>
          ▼
        </span>
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
            onKeyDown={handleListKeyDown}
            tabIndex={-1}
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              minWidth: 220,
              background: 'var(--bg-overlay)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              boxShadow: '0 12px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(124,106,247,0.08)',
              padding: '5px 0',
              zIndex: 9000,
              outline: 'none',
            }}
            // Steal focus so key events land here
            ref={el => el?.focus()}
          >
            {workspaces.map((ws, i) => {
              const isActive = ws.id === activeWorkspaceId
              const isFocused = i === focusedIndex

              return (
                <div
                  key={ws.id}
                  onMouseEnter={() => setFocusedIndex(i)}
                  onContextMenu={(e) => handleContextMenu(e, ws.id)}
                >
                  <div
                    onClick={() => { onSwitch(ws.id); setOpen(false) }}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '7px 12px',
                        cursor: 'pointer',
                        background: isFocused ? 'rgba(124,106,247,0.1)' : 'transparent',
                        borderLeft: isFocused ? '2px solid var(--accent)' : '2px solid transparent',
                        transition: 'background 0.07s',
                        userSelect: 'none',
                      }}
                    >
                      {/* Checkmark column */}
                      <span style={{
                        width: 14,
                        fontSize: 11,
                        color: 'var(--accent)',
                        flexShrink: 0,
                        opacity: isActive ? 1 : 0,
                      }}>
                        ✓
                      </span>

                      {/* Name */}
                      <span style={{
                        flex: 1,
                        fontSize: 13,
                        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                        fontWeight: isActive ? 500 : 400,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {ws.name}
                      </span>

                      {/* Active dot */}
                      {isActive && (
                        <span style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          background: 'var(--accent)',
                          flexShrink: 0,
                          opacity: 0.6,
                        }} />
                      )}
                    </div>
                </div>
              )
            })}

            {/* Divider */}
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />

            {/* New Workspace */}
            <div
              onClick={() => { onAdd(); setOpen(false) }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 12px',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                fontSize: 12,
                transition: 'color 0.1s',
                userSelect: 'none',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              <span style={{ width: 14, textAlign: 'center', fontSize: 13, flexShrink: 0 }}>+</span>
              <span style={{ flex: 1 }}>New Workspace</span>
              <span style={{ fontSize: 10, opacity: 0.45, letterSpacing: '0.02em' }}>⌘⌥N</span>
            </div>

            {/* Footer hint */}
            <div style={{
              padding: '4px 12px 3px',
              fontSize: 10,
              color: 'var(--text-muted)',
              opacity: 0.45,
              borderTop: '1px solid var(--border)',
              marginTop: 2,
              display: 'flex',
              gap: 10,
            }}>
              <span>↑↓ navigate</span>
              <span>↵ switch</span>
              <span>right-click rename</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Right-click context menu for workspace row */}
      {contextMenu && (
        <WsContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          wsId={contextMenu.wsId}
          wsCount={workspaces.length}
          onClose={() => setContextMenu(null)}
          onRename={() => {
            const id = contextMenu.wsId
            setContextMenu(null)
            setOpen(false)
            const current = workspaces.find(w => w.id === id)
            const newName = window.prompt('Rename workspace:', current?.name ?? '')
            if (newName && newName.trim()) onRename(id, newName.trim())
          }}
          onDelete={() => { setContextMenu(null); onDelete(contextMenu.wsId) }}
          onMoveToNewWindow={() => { setContextMenu(null); onMoveToNewWindow(contextMenu.wsId) }}
        />
      )}
    </div>
  )
}

// ─── Right-click context menu ─────────────────────────────────────────────────

function WsContextMenu({
  x, y, wsCount, onClose, onRename, onDelete, onMoveToNewWindow,
}: {
  x: number; y: number; wsId: string; wsCount: number
  onClose: () => void; onRename: () => void; onDelete: () => void
  onMoveToNewWindow: () => void
}) {
  const [hovered, setHovered] = useState<string | null>(null)

  return (
    <>
      <div
        onClick={onClose}
        onContextMenu={e => { e.preventDefault(); onClose() }}
        style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
      />
      <div style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 9999,
        background: 'var(--bg-overlay)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '4px 0',
        minWidth: 180,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(12px)',
      }}>
        <CMenuItem hovered={hovered === 'rename'} onHover={() => setHovered('rename')} onLeave={() => setHovered(null)} onClick={onRename}>
          Rename Workspace
        </CMenuItem>
        {wsCount > 1 && (
          <>
            <CMenuItem hovered={hovered === 'move'} onHover={() => setHovered('move')} onLeave={() => setHovered(null)} onClick={onMoveToNewWindow}>
              Move to New Window
            </CMenuItem>
            <CMenuItem hovered={hovered === 'delete'} onHover={() => setHovered('delete')} onLeave={() => setHovered(null)} onClick={onDelete}>
              Delete Workspace
            </CMenuItem>
          </>
        )}
      </div>
    </>
  )
}

function CMenuItem({ onClick, children, hovered, onHover, onLeave }: {
  onClick: () => void; children: React.ReactNode
  hovered: boolean; onHover: () => void; onLeave: () => void
}) {
  return (
    <div
      onClick={e => { e.stopPropagation(); onClick() }}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
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
