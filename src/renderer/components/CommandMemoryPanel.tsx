import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { MemoryCommand, CommandScope } from '../types/commandMemory'

interface Props {
  commands: MemoryCommand[]
  onAdd: (cmd: Omit<MemoryCommand, 'id' | 'createdAt' | 'updatedAt' | 'useCount'>) => void
  onDelete: (id: string) => void
  onTogglePin: (id: string) => void
  onRun: (command: string) => void
  onInsert: (command: string) => void
  activeWorkspaceId: string
  projectRoot: string | null
}

export default function CommandMemoryPanel({
  commands,
  onAdd,
  onDelete,
  onTogglePin,
  onRun,
  onInsert,
  activeWorkspaceId,
  projectRoot,
}: Props) {
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // New command form state
  const [newCmd, setNewCmd] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newScope, setNewScope] = useState<CommandScope>('global')
  const cmdInputRef = useRef<HTMLInputElement>(null)

  const filteredCommands = commands.filter(c => {
    const q = query.toLowerCase()
    if (!q) return true
    return c.command.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)
  })

  const handleAdd = useCallback(() => {
    if (!newCmd.trim()) return
    const scope = newScope
    const scopeId = scope === 'workspace' ? activeWorkspaceId
      : scope === 'project' ? (projectRoot ?? undefined)
      : undefined
    const scopeLabel = scope === 'project' ? (projectRoot?.split('/').pop() ?? undefined) : undefined

    onAdd({
      title: newTitle.trim() || newCmd.trim().slice(0, 60),
      command: newCmd.trim(),
      note: '',
      tags: [],
      scope,
      scopeId,
      scopeLabel,
      pinned: false,
    })
    setNewCmd('')
    setNewTitle('')
    setNewScope('global')
    setAdding(false)
  }, [newCmd, newTitle, newScope, activeWorkspaceId, projectRoot, onAdd])

  const scopeColor: Record<CommandScope, string> = {
    global: 'var(--text-muted)',
    workspace: 'var(--accent)',
    project: '#6af7a0',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Search */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          background: 'var(--bg-overlay)',
          borderRadius: 6,
          padding: '5px 10px',
        }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.4, flexShrink: 0 }}>
            <circle cx="6.5" cy="6.5" r="5" stroke="var(--text-secondary)" strokeWidth="1.5" />
            <path d="M10.5 10.5L14 14" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filter commands..."
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit',
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: 12 }}
            >×</button>
          )}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflow: 'auto', padding: '6px 0' }}>
        {filteredCommands.length === 0 && !adding && (
          <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            {query ? 'No matches.' : 'No saved commands yet.'}
          </div>
        )}

        {filteredCommands.map(cmd => (
          <CommandItem
            key={cmd.id}
            cmd={cmd}
            isEditing={editingId === cmd.id}
            scopeColor={scopeColor[cmd.scope]}
            onRun={() => onRun(cmd.command)}
            onInsert={() => onInsert(cmd.command)}
            onPin={() => onTogglePin(cmd.id)}
            onDelete={() => onDelete(cmd.id)}
            onEditToggle={() => setEditingId(editingId === cmd.id ? null : cmd.id)}
          />
        ))}
      </div>

      {/* Add form */}
      <AnimatePresence>
        {adding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: 'hidden', flexShrink: 0 }}
          >
            <div style={{
              borderTop: '1px solid var(--border)',
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 7,
            }}>
              <input
                ref={cmdInputRef}
                value={newCmd}
                onChange={e => setNewCmd(e.target.value)}
                placeholder="Command..."
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false) }}
                style={inputStyle}
                autoFocus
              />
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Title (optional)..."
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false) }}
                style={inputStyle}
              />
              <select
                value={newScope}
                onChange={e => setNewScope(e.target.value as CommandScope)}
                style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
              >
                <option value="global">Global</option>
                <option value="workspace">This workspace</option>
                {projectRoot && <option value="project">This project ({projectRoot.split('/').pop()})</option>}
              </select>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={handleAdd} style={btnPrimary}>Save</button>
                <button onClick={() => setAdding(false)} style={btnSecondary}>Cancel</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add button */}
      {!adding && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button
            onClick={() => { setAdding(true) }}
            style={{
              width: '100%',
              background: 'transparent',
              border: '1px dashed var(--border)',
              borderRadius: 6,
              color: 'var(--text-muted)',
              fontSize: 12,
              padding: '6px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'color 0.15s, border-color 0.15s',
            }}
          >
            + add command
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Command item ─────────────────────────────────────────────────────────────

function CommandItem({
  cmd,
  isEditing,
  scopeColor,
  onRun,
  onInsert,
  onPin,
  onDelete,
  onEditToggle,
}: {
  cmd: MemoryCommand
  isEditing: boolean
  scopeColor: string
  onRun: () => void
  onInsert: () => void
  onPin: () => void
  onDelete: () => void
  onEditToggle: () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '7px 12px',
        borderLeft: cmd.pinned ? '2px solid var(--accent)' : '2px solid transparent',
        background: hovered ? 'rgba(124,106,247,0.04)' : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'monospace',
            fontSize: 11.5,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {cmd.command}
          </div>
          {cmd.title && cmd.title !== cmd.command && (
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 }}>
              {cmd.title}
            </div>
          )}
        </div>

        {/* Hover actions */}
        {(hovered || isEditing) && (
          <div style={{ display: 'flex', gap: 3, flexShrink: 0, alignItems: 'center' }}>
            <MiniBtn title="Insert" onClick={onInsert}>⤶</MiniBtn>
            <MiniBtn title="Run" onClick={onRun} accent>▶</MiniBtn>
            <MiniBtn title={cmd.pinned ? 'Unpin' : 'Pin'} onClick={onPin}>
              {cmd.pinned ? '◆' : '◇'}
            </MiniBtn>
            <MiniBtn title="Delete" onClick={onDelete} danger>×</MiniBtn>
          </div>
        )}
      </div>

      {/* Scope badge */}
      {cmd.scope !== 'global' && (
        <div style={{ marginTop: 3 }}>
          <span style={{
            fontSize: 9.5,
            color: scopeColor,
            background: `${scopeColor}18`,
            border: `1px solid ${scopeColor}30`,
            borderRadius: 3,
            padding: '1px 5px',
          }}>
            {cmd.scopeLabel ?? cmd.scope}
          </span>
        </div>
      )}
    </div>
  )
}

function MiniBtn({ title, onClick, accent, danger, children }: {
  title: string
  onClick: () => void
  accent?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  const color = danger ? 'var(--danger)' : accent ? 'var(--accent)' : 'var(--text-muted)'
  return (
    <button
      title={title}
      onClick={e => { e.stopPropagation(); onClick() }}
      style={{
        background: 'transparent', border: 'none',
        color, fontSize: 12, cursor: 'pointer',
        padding: '1px 4px', borderRadius: 3,
        lineHeight: 1, opacity: 0.75,
      }}
    >
      {children}
    </button>
  )
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-overlay)',
  border: '1px solid var(--border)',
  borderRadius: 5,
  color: 'var(--text-primary)',
  fontSize: 12,
  padding: '5px 8px',
  outline: 'none',
  fontFamily: 'inherit',
  width: '100%',
}

const btnPrimary: React.CSSProperties = {
  flex: 1, background: 'var(--accent)', border: 'none',
  borderRadius: 5, color: '#fff', fontSize: 12,
  padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit',
}

const btnSecondary: React.CSSProperties = {
  flex: 1, background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 5, color: 'var(--text-muted)', fontSize: 12,
  padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit',
}
