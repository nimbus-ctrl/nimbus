import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Tab } from '../App'

interface Props {
  tabs: Tab[]
  activeTabId: string
  onSelect: (id: string) => void
  onAdd: () => void
  onClose: (id: string) => void
  onToggleBookmark: (id: string) => void
  onRename: (id: string, title: string) => void
}

export default function TabBar({ tabs, activeTabId, onSelect, onAdd, onClose, onToggleBookmark, onRename }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const startEdit = (tab: Tab) => {
    setEditingId(tab.id)
    setEditValue(tab.title)
  }

  const commitEdit = (id: string) => {
    if (editValue.trim()) onRename(id, editValue.trim())
    setEditingId(null)
  }

  return (
    <div style={{
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
    }}>
      <AnimatePresence initial={false}>
        {tabs.map(tab => (
          <motion.div
            key={tab.id}
            layout
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 10px',
              height: 30,
              borderRadius: 6,
              background: tab.id === activeTabId ? 'var(--bg-tab-active)' : 'var(--bg-tab)',
              border: `1px solid ${tab.id === activeTabId ? 'var(--border-active)' : 'transparent'}`,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              minWidth: 100,
              maxWidth: 180,
              flexShrink: 0,
              boxShadow: tab.id === activeTabId ? '0 0 12px var(--accent-glow)' : 'none',
              transition: 'box-shadow 0.2s',
            }}
            onClick={() => onSelect(tab.id)}
          >
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
          </motion.div>
        ))}
      </AnimatePresence>

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
    </div>
  )
}
