import { useState, useCallback, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; wsId: string } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const startEdit = (ws: Workspace) => {
    setEditingId(ws.id)
    setEditValue(ws.name)
  }

  const commitEdit = (id: string) => {
    if (editValue.trim()) onRename(id, editValue.trim())
    setEditingId(null)
  }

  const handleContextMenu = useCallback((e: React.MouseEvent, wsId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, wsId })
  }, [])

  const closeMenu = useCallback(() => setContextMenu(null), [])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {workspaces.map((ws) => {
        const isActive = ws.id === activeWorkspaceId
        const isEditing = editingId === ws.id

        if (isEditing) {
          return (
            <InlineEdit
              key={ws.id}
              value={editValue}
              onChange={setEditValue}
              onCommit={() => commitEdit(ws.id)}
              onCancel={() => setEditingId(null)}
            />
          )
        }

        return (
          <motion.button
            key={ws.id}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onSwitch(ws.id)}
            onDoubleClick={() => startEdit(ws)}
            onContextMenu={(e) => handleContextMenu(e, ws.id)}
            title={ws.name}
            style={{
              background: isActive ? 'var(--accent-glow)' : 'transparent',
              border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 6,
              color: isActive ? 'var(--accent)' : 'var(--text-muted)',
              padding: '3px 8px',
              fontSize: 11,
              fontWeight: isActive ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.15s',
              maxWidth: 120,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {ws.name}
          </motion.button>
        )
      })}

      {/* Add workspace button */}
      <motion.button
        whileHover={{ scale: 1.1, color: 'var(--accent)' }}
        whileTap={{ scale: 0.9 }}
        onClick={onAdd}
        title="New workspace (⌘⌥N)"
        style={{
          background: 'none',
          border: '1px dashed var(--border)',
          borderRadius: 6,
          color: 'var(--text-muted)',
          width: 22,
          height: 22,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: 13,
          transition: 'color 0.15s',
        }}
      >
        +
      </motion.button>

      {/* Context menu */}
      {contextMenu && (
        <WsContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          wsId={contextMenu.wsId}
          wsName={workspaces.find(w => w.id === contextMenu.wsId)?.name ?? ''}
          wsCount={workspaces.length}
          onClose={closeMenu}
          onRename={() => {
            closeMenu()
            const ws = workspaces.find(w => w.id === contextMenu.wsId)
            if (ws) startEdit(ws)
          }}
          onDelete={() => { closeMenu(); onDelete(contextMenu.wsId) }}
          onMoveToNewWindow={() => { closeMenu(); onMoveToNewWindow(contextMenu.wsId) }}
        />
      )}
    </div>
  )
}

function InlineEdit({
  value, onChange, onCommit, onCancel,
}: {
  value: string; onChange: (v: string) => void; onCommit: () => void; onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit()
        if (e.key === 'Escape') onCancel()
      }}
      style={{
        background: 'var(--accent-glow)',
        border: '1px solid var(--accent)',
        borderRadius: 6,
        color: 'var(--accent)',
        padding: '3px 8px',
        fontSize: 11,
        fontWeight: 600,
        maxWidth: 120,
        outline: 'none',
        fontFamily: 'inherit',
      }}
    />
  )
}

function WsContextMenu({
  x, y, wsCount, onClose, onRename, onDelete, onMoveToNewWindow,
}: {
  x: number; y: number; wsId: string; wsName: string; wsCount: number
  onClose: () => void; onRename: () => void; onDelete: () => void
  onMoveToNewWindow: () => void
}) {
  const [hovered, setHovered] = useState<string | null>(null)

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
        minWidth: 180,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(12px)',
      }}>
        <MenuItem hovered={hovered === 'rename'} onHover={() => setHovered('rename')} onLeave={() => setHovered(null)} onClick={onRename}>
          Rename Workspace
        </MenuItem>
        {wsCount > 1 && (
          <>
            <MenuItem hovered={hovered === 'move'} onHover={() => setHovered('move')} onLeave={() => setHovered(null)} onClick={onMoveToNewWindow}>
              Move to New Window
            </MenuItem>
            <MenuItem hovered={hovered === 'delete'} onHover={() => setHovered('delete')} onLeave={() => setHovered(null)} onClick={onDelete}>
              Delete Workspace
            </MenuItem>
          </>
        )}
      </div>
    </>
  )
}

function MenuItem({
  onClick, children, hovered, onHover, onLeave,
}: {
  onClick: () => void; children: React.ReactNode
  hovered: boolean; onHover: () => void; onLeave: () => void
}) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick() }}
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
