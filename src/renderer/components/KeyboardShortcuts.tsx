import { useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ShortcutRow {
  keys: string[]
  label: string
}

interface Section {
  title: string
  rows: ShortcutRow[]
}

const SECTIONS: Section[] = [
  {
    title: 'Panes',
    rows: [
      { keys: ['⌘', 'D'],       label: 'Split pane vertically' },
      { keys: ['⌘', '⇧', 'D'],  label: 'Split pane horizontally' },
      { keys: ['⌘', 'W'],       label: 'Close active pane' },
      { keys: ['⌘', '⇧', 'T'],  label: 'Detach pane to new tab' },
    ],
  },
  {
    title: 'Tabs',
    rows: [
      { keys: ['⌘', '1–9'],     label: 'Jump to tab by position' },
      { keys: ['⌘', '⇧', ']'],  label: 'Next tab' },
      { keys: ['⌘', '⇧', '['],  label: 'Previous tab' },
    ],
  },
  {
    title: 'Workspaces',
    rows: [
      { keys: ['⌘', '⌥', '→'],  label: 'Next workspace' },
      { keys: ['⌘', '⌥', '←'],  label: 'Previous workspace' },
      { keys: ['⌘', '⌥', 'N'],  label: 'New workspace' },
    ],
  },
  {
    title: 'Panels',
    rows: [
      { keys: ['⌘', 'J'],       label: 'Toggle AI panel' },
      { keys: ['⌘', 'K'],       label: 'Toggle command palette' },
      { keys: ['⌘', 'M'],       label: 'Toggle command memory' },
      { keys: ['⌘', '/'],       label: 'Show keyboard shortcuts' },
    ],
  },
]

interface Props {
  open: boolean
  onClose: () => void
}

export default function KeyboardShortcuts({ open, onClose }: Props) {
  const handleBackdrop = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onClick={handleBackdrop}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            style={{
              background: 'var(--bg-overlay)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,106,247,0.1)',
              width: 520,
              maxHeight: '80vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px 14px',
              borderBottom: '1px solid var(--border)',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                Keyboard Shortcuts
              </span>
              <button
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: 18,
                  cursor: 'pointer',
                  lineHeight: 1,
                  padding: '0 2px',
                  opacity: 0.6,
                }}
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div style={{ overflowY: 'auto', padding: '12px 20px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 32px' }}>
                {SECTIONS.map(section => (
                  <div key={section.title}>
                    <div style={{
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--accent)',
                      marginBottom: 10,
                      opacity: 0.8,
                    }}>
                      {section.title}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {section.rows.map((row, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {row.label}
                          </span>
                          <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                            {row.keys.map((key, ki) => (
                              <kbd key={ki} style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minWidth: 22,
                                height: 20,
                                padding: '0 5px',
                                background: 'var(--bg-base)',
                                border: '1px solid var(--border)',
                                borderRadius: 4,
                                fontSize: 11,
                                color: 'var(--text-primary)',
                                fontFamily: 'inherit',
                                boxShadow: '0 1px 0 var(--border)',
                              }}>
                                {key}
                              </kbd>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '10px 20px',
              borderTop: '1px solid var(--border)',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}>
              <kbd style={{
                background: 'var(--bg-base)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                fontSize: 11,
                color: 'var(--text-muted)',
                padding: '1px 6px',
                fontFamily: 'inherit',
              }}>
                Esc
              </kbd>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.6 }}>to close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
