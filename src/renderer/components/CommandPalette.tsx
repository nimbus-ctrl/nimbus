import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Command, CommandCategory } from '../types/command'
import { fuzzyMatch } from '../utils/fuzzyMatch'

interface Props {
  isOpen: boolean
  commands: Command[]
  onClose: () => void
}

const categoryOrder: CommandCategory[] = ['Workspace', 'Tab', 'Pane', 'Terminal', 'UI']

export default function CommandPalette({ isOpen, commands, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Filter and score commands
  const filtered = useMemo(() => {
    const visible = commands.filter(cmd => !cmd.when || cmd.when())

    if (!query.trim()) return visible

    return visible
      .map(cmd => {
        // Match against label (primary)
        const labelMatch = fuzzyMatch(query, cmd.label)
        // Match against keywords (secondary — boost label score if keyword matches)
        const keywordScores = (cmd.keywords ?? []).map(k => fuzzyMatch(query, k))
        const bestKeyword = keywordScores.reduce(
          (best, m) => (m.score > best.score ? m : best),
          { match: false, score: 0 },
        )

        // Must match label OR a keyword
        const matched = labelMatch.match || bestKeyword.match
        // Label match is authoritative; keyword match acts as a boost
        const score = labelMatch.match
          ? labelMatch.score + (bestKeyword.match ? 5 : 0)
          : bestKeyword.score * 0.8

        return { cmd, matched, score }
      })
      .filter(r => r.matched)
      .sort((a, b) => b.score - a.score)
      .map(r => r.cmd)
  }, [commands, query])

  // Group by category only when not searching — search shows flat ranked results
  const hasQuery = query.trim().length > 0

  const grouped = useMemo(() => {
    if (hasQuery) {
      // Flat relevance-ranked list, no category grouping
      return filtered.length > 0
        ? [{ category: null as CommandCategory | null, items: filtered }]
        : []
    }

    const groups: { category: CommandCategory | null; items: Command[] }[] = []
    const byCategory = new Map<CommandCategory, Command[]>()

    for (const cmd of filtered) {
      const list = byCategory.get(cmd.category) ?? []
      list.push(cmd)
      byCategory.set(cmd.category, list)
    }

    for (const cat of categoryOrder) {
      const items = byCategory.get(cat)
      if (items && items.length > 0) {
        groups.push({ category: cat, items })
      }
    }

    return groups
  }, [filtered, hasQuery])

  // Flat list for keyboard navigation
  const flatItems = useMemo(() => grouped.flatMap(g => g.items), [grouped])

  // Reset on open/close
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen])

  // Clamp selection
  useEffect(() => {
    if (selectedIndex >= flatItems.length) {
      setSelectedIndex(Math.max(0, flatItems.length - 1))
    }
  }, [flatItems.length, selectedIndex])

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const executeSelected = useCallback(() => {
    const cmd = flatItems[selectedIndex]
    if (cmd) {
      onClose()
      // Defer execution so the palette unmounts first
      requestAnimationFrame(() => cmd.execute())
    }
  }, [flatItems, selectedIndex, onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, flatItems.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        executeSelected()
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
      case 'Tab':
        e.preventDefault()
        if (e.shiftKey) {
          setSelectedIndex(i => Math.max(i - 1, 0))
        } else {
          setSelectedIndex(i => Math.min(i + 1, flatItems.length - 1))
        }
        break
    }
  }, [flatItems.length, executeSelected, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(4px)',
              zIndex: 9998,
            }}
          />

          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'fixed',
              top: 80,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 560,
              maxHeight: 'min(480px, calc(100vh - 160px))',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              boxShadow: '0 16px 64px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(124, 106, 247, 0.1)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              zIndex: 9999,
            }}
            onKeyDown={handleKeyDown}
          >
            {/* Search input */}
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}>
                <circle cx="6.5" cy="6.5" r="5" stroke="var(--text-secondary)" strokeWidth="1.5" />
                <path d="M10.5 10.5L14 14" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={e => { setQuery(e.target.value); setSelectedIndex(0) }}
                placeholder="Type a command..."
                spellCheck={false}
                autoComplete="off"
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}
              />
              <kbd style={{
                padding: '2px 6px',
                fontSize: 11,
                fontFamily: 'Inter, system-ui, sans-serif',
                color: 'var(--text-muted)',
                background: 'var(--bg-base)',
                border: '1px solid var(--border)',
                borderRadius: 4,
              }}>
                ESC
              </kbd>
            </div>

            {/* Results */}
            <div
              ref={listRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '6px 0',
              }}
            >
              {flatItems.length === 0 && (
                <div style={{
                  padding: '24px 16px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: 13,
                }}>
                  No commands found
                </div>
              )}

              {grouped.map(group => {
                // Compute the starting flat index for this group
                let groupStartIndex = 0
                for (const g of grouped) {
                  if (g === group) break
                  groupStartIndex += g.items.length
                }

                return (
                  <div key={group.category ?? '_flat'}>
                    {group.category && (
                      <div style={{
                        padding: '8px 16px 4px',
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}>
                        {group.category}
                      </div>
                    )}
                    {group.items.map((cmd, i) => {
                      const flatIndex = groupStartIndex + i
                      const isSelected = flatIndex === selectedIndex

                      return (
                        <CommandRow
                          key={cmd.id}
                          cmd={cmd}
                          isSelected={isSelected}
                          dataIndex={flatIndex}
                          onClick={() => {
                            setSelectedIndex(flatIndex)
                            onClose()
                            requestAnimationFrame(() => cmd.execute())
                          }}
                          onHover={() => setSelectedIndex(flatIndex)}
                        />
                      )
                    })}
                  </div>
                )
              })}
            </div>

            {/* Footer hint */}
            <div style={{
              padding: '8px 16px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              gap: 16,
              fontSize: 11,
              color: 'var(--text-muted)',
            }}>
              <span><kbd style={kbdStyle}>↑↓</kbd> navigate</span>
              <span><kbd style={kbdStyle}>↵</kbd> run</span>
              <span><kbd style={kbdStyle}>esc</kbd> close</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ─── Command row ──────────────────────────────────────────────────────────────

function CommandRow({
  cmd,
  isSelected,
  dataIndex,
  onClick,
  onHover,
}: {
  cmd: Command
  isSelected: boolean
  dataIndex: number
  onClick: () => void
  onHover: () => void
}) {
  return (
    <div
      data-index={dataIndex}
      onClick={onClick}
      onMouseEnter={onHover}
      style={{
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        cursor: 'pointer',
        background: isSelected ? 'var(--accent-glow)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'background 0.08s, border-color 0.08s',
      }}
    >
      <span style={{
        fontSize: 13,
        color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
        transition: 'color 0.08s',
      }}>
        {cmd.label}
      </span>
      {cmd.shortcut && (
        <span style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          fontFamily: 'Inter, system-ui, sans-serif',
          display: 'flex',
          gap: 3,
        }}>
          {cmd.shortcut.split('').map((char, i) => (
            <kbd key={i} style={kbdStyle}>{char}</kbd>
          ))}
        </span>
      )}
    </div>
  )
}

const kbdStyle: React.CSSProperties = {
  padding: '1px 5px',
  fontSize: 11,
  fontFamily: 'Inter, system-ui, sans-serif',
  color: 'var(--text-muted)',
  background: 'var(--bg-base)',
  border: '1px solid var(--border)',
  borderRadius: 3,
  lineHeight: '16px',
}
