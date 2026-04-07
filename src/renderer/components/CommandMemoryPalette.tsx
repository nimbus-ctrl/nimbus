import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { MemoryCommand, SuggestionContext } from '../types/commandMemory'
import { fuzzyMatch } from '../utils/fuzzyMatch'

interface Props {
  isOpen: boolean
  commands: MemoryCommand[]
  suggestions: string[]
  context: SuggestionContext
  activePaneId: string
  onClose: () => void
  onSaveCommand: (command: string, title?: string) => void
  onRecordUsage: (command: string) => void
}

type ResultItem =
  | { kind: 'saved'; cmd: MemoryCommand }
  | { kind: 'suggestion'; command: string }

export default function CommandMemoryPalette({
  isOpen,
  commands,
  suggestions,
  activePaneId,
  onClose,
  onSaveCommand,
  onRecordUsage,
}: Props) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [saveMode, setSaveMode] = useState(false)
  const [saveTitle, setSaveTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Build flat result list
  const flatResults = useMemo((): ResultItem[] => {
    const q = query.trim()

    if (!q) {
      // No query: show suggestions first, then saved (pinned first)
      const items: ResultItem[] = []
      for (const cmd of suggestions) {
        items.push({ kind: 'suggestion', command: cmd })
      }
      for (const cmd of commands) {
        items.push({ kind: 'saved', cmd })
      }
      return items
    }

    // Fuzzy search across saved commands (title + command text)
    const savedMatches = commands
      .map(cmd => {
        const titleMatch = fuzzyMatch(q, cmd.title)
        const cmdMatch = fuzzyMatch(q, cmd.command)
        const matched = titleMatch.match || cmdMatch.match
        const score = Math.max(titleMatch.score, cmdMatch.score * 0.9)
        return { cmd, matched, score }
      })
      .filter(r => r.matched)
      .sort((a, b) => b.score - a.score)
      .map(r => ({ kind: 'saved' as const, cmd: r.cmd }))

    // Also match suggestions
    const suggestionMatches = suggestions
      .filter(s => fuzzyMatch(q, s).match)
      .map(s => ({ kind: 'suggestion' as const, command: s }))

    return [...savedMatches, ...suggestionMatches]
  }, [query, commands, suggestions])

  // Section headers for display
  const sections = useMemo(() => {
    const q = query.trim()
    if (q) {
      // Flat results — no sections
      return [{ label: null, items: flatResults }]
    }

    const saved = flatResults.filter(r => r.kind === 'saved')
    const sugg = flatResults.filter(r => r.kind === 'suggestion')

    const out: { label: string | null; items: ResultItem[] }[] = []
    if (sugg.length > 0) out.push({ label: 'Suggestions', items: sugg })
    if (saved.length > 0) out.push({ label: 'Saved', items: saved })
    return out
  }, [flatResults, query])

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setSaveMode(false)
      setSaveTitle('')
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen])

  // Clamp selection
  useEffect(() => {
    setSelectedIndex(i => Math.min(i, Math.max(0, flatResults.length - 1)))
  }, [flatResults.length])

  // Scroll selected into view
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${selectedIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // Focus save title when save mode opens
  useEffect(() => {
    if (saveMode) {
      requestAnimationFrame(() => titleInputRef.current?.focus())
    }
  }, [saveMode])

  const insertCommand = useCallback((command: string) => {
    if (!activePaneId) return
    // Ctrl+U clears the current line, then paste the command
    window.nimbus.pty.write(activePaneId, '\x15' + command)
    onRecordUsage(command)
    onClose()
  }, [activePaneId, onRecordUsage, onClose])

  const runCommand = useCallback((command: string) => {
    if (!activePaneId) return
    window.nimbus.pty.write(activePaneId, '\x15' + command + '\r')
    onRecordUsage(command)
    onClose()
  }, [activePaneId, onRecordUsage, onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (saveMode) {
      if (e.key === 'Escape') { e.preventDefault(); setSaveMode(false) }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, flatResults.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
        break
      case 'Enter': {
        e.preventDefault()
        const item = flatResults[selectedIndex]
        if (item) {
          const cmd = item.kind === 'saved' ? item.cmd.command : item.command
          if (e.metaKey || e.shiftKey) {
            insertCommand(cmd)
          } else {
            runCommand(cmd)
          }
        } else if (query.trim()) {
          // No match — offer to save or run raw
          runCommand(query.trim())
        }
        break
      }
      case 'Tab': {
        e.preventDefault()
        const item = flatResults[selectedIndex]
        if (item) {
          const cmd = item.kind === 'saved' ? item.cmd.command : item.command
          insertCommand(cmd)
        }
        break
      }
      case 's':
        if (e.metaKey) {
          e.preventDefault()
          const item = flatResults[selectedIndex]
          const cmd = item ? (item.kind === 'saved' ? item.cmd.command : item.command) : query.trim()
          if (cmd && item?.kind !== 'saved') {
            setSaveTitle(cmd.slice(0, 60))
            setSaveMode(true)
          }
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }, [saveMode, flatResults, selectedIndex, query, insertCommand, runCommand, onClose])

  const handleSave = useCallback(() => {
    const item = flatResults[selectedIndex]
    const cmd = item ? (item.kind === 'saved' ? item.cmd.command : item.command) : query.trim()
    if (!cmd) return
    onSaveCommand(cmd, saveTitle.trim() || undefined)
    setSaveMode(false)
    onClose()
  }, [flatResults, selectedIndex, query, saveTitle, onSaveCommand, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(4px)',
              zIndex: 9998,
            }}
          />

          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            onKeyDown={handleKeyDown}
            style={{
              position: 'fixed',
              top: 80,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 580,
              maxHeight: 'min(520px, calc(100vh - 160px))',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              boxShadow: '0 20px 64px rgba(0,0,0,0.65), 0 0 0 1px rgba(124,106,247,0.12)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              zIndex: 9999,
            }}
          >
            {/* Search row */}
            <div style={{
              padding: '11px 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.4 }}>
                <circle cx="6.5" cy="6.5" r="5" stroke="var(--text-secondary)" strokeWidth="1.5" />
                <path d="M10.5 10.5L14 14" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={e => { setQuery(e.target.value); setSelectedIndex(0) }}
                placeholder="Search saved commands..."
                spellCheck={false}
                autoComplete="off"
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--text-primary)', fontSize: 14,
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.7 }}>⌘M</span>
            </div>

            {/* Results */}
            <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
              {flatResults.length === 0 && !query.trim() && (
                <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No saved commands yet.<br />
                  <span style={{ fontSize: 12, opacity: 0.7 }}>Commands you run often will appear here.</span>
                </div>
              )}

              {flatResults.length === 0 && query.trim() && (
                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No saved matches — run it directly:</div>
                  <CommandRow
                    label={query.trim()}
                    sublabel={null}
                    isSelected={false}
                    dataIndex={0}
                    isSuggestion={false}
                    onClick={() => runCommand(query.trim())}
                    onHover={() => {}}
                    onInsert={() => insertCommand(query.trim())}
                    onRun={() => runCommand(query.trim())}
                    onSave={null}
                  />
                </div>
              )}

              {sections.map(section => {
                let sectionStart = 0
                for (const s of sections) {
                  if (s === section) break
                  sectionStart += s.items.length
                }

                return (
                  <div key={section.label ?? '_flat'}>
                    {section.label && (
                      <div style={{
                        padding: '8px 16px 3px',
                        fontSize: 10,
                        fontWeight: 600,
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                      }}>
                        {section.label}
                      </div>
                    )}
                    {section.items.map((item, i) => {
                      const flatIdx = sectionStart + i
                      const command = item.kind === 'saved' ? item.cmd.command : item.command
                      const sublabel = item.kind === 'saved' && item.cmd.title !== item.cmd.command
                        ? item.cmd.title
                        : null
                      const canSave = item.kind !== 'saved'

                      return (
                        <CommandRow
                          key={item.kind === 'saved' ? item.cmd.id : `s-${item.command}`}
                          label={command}
                          sublabel={sublabel}
                          isSelected={flatIdx === selectedIndex}
                          dataIndex={flatIdx}
                          isSuggestion={item.kind === 'suggestion'}
                          isPinned={item.kind === 'saved' && item.cmd.pinned}
                          onClick={() => { setSelectedIndex(flatIdx); runCommand(command) }}
                          onHover={() => setSelectedIndex(flatIdx)}
                          onInsert={() => insertCommand(command)}
                          onRun={() => runCommand(command)}
                          onSave={canSave ? () => { setSaveTitle(command.slice(0, 60)); setSaveMode(true) } : null}
                        />
                      )
                    })}
                  </div>
                )
              })}
            </div>

            {/* Save mode overlay */}
            <AnimatePresence>
              {saveMode && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.12 }}
                  style={{
                    position: 'absolute', inset: 0,
                    background: 'var(--bg-surface)',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: 20,
                    gap: 12,
                    zIndex: 1,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                    Save to Command Memory
                  </div>
                  <div style={{
                    fontFamily: 'monospace',
                    fontSize: 12,
                    color: 'var(--accent)',
                    background: 'var(--bg-overlay)',
                    padding: '6px 10px',
                    borderRadius: 6,
                    wordBreak: 'break-all',
                  }}>
                    {query.trim() || (flatResults[selectedIndex]?.kind === 'suggestion'
                      ? flatResults[selectedIndex].command
                      : '')}
                  </div>
                  <input
                    ref={titleInputRef}
                    value={saveTitle}
                    onChange={e => setSaveTitle(e.target.value)}
                    placeholder="Title (optional)..."
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSave()
                      if (e.key === 'Escape') setSaveMode(false)
                    }}
                    style={{
                      background: 'var(--bg-overlay)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      color: 'var(--text-primary)',
                      fontSize: 13,
                      padding: '7px 10px',
                      outline: 'none',
                      fontFamily: 'Inter, system-ui, sans-serif',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={handleSave}
                      style={{
                        flex: 1, background: 'var(--accent)', border: 'none',
                        borderRadius: 6, color: '#fff', fontSize: 12,
                        padding: '7px 12px', cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setSaveMode(false)}
                      style={{
                        flex: 1, background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: 6, color: 'var(--text-muted)', fontSize: 12,
                        padding: '7px 12px', cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Footer hints */}
            <div style={{
              padding: '7px 16px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              gap: 14,
              fontSize: 11,
              color: 'var(--text-muted)',
              flexShrink: 0,
            }}>
              <span><Kbd>↵</Kbd> run</span>
              <span><Kbd>tab</Kbd> insert</span>
              <span><Kbd>⌘↵</Kbd> insert</span>
              <span><Kbd>⌘S</Kbd> save</span>
              <span><Kbd>esc</Kbd> close</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ─── Row ───────────────────────────────────────────────────────────────────────

function CommandRow({
  label,
  sublabel,
  isSelected,
  dataIndex,
  isSuggestion,
  isPinned,
  onClick,
  onHover,
  onInsert,
  onRun,
  onSave,
}: {
  label: string
  sublabel: string | null
  isSelected: boolean
  dataIndex: number
  isSuggestion: boolean
  isPinned?: boolean
  onClick: () => void
  onHover: () => void
  onInsert: () => void
  onRun: () => void
  onSave: (() => void) | null
}) {
  return (
    <div
      data-index={dataIndex}
      onClick={onClick}
      onMouseEnter={onHover}
      style={{
        padding: '7px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        cursor: 'pointer',
        background: isSelected ? 'var(--accent-glow)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'background 0.06s',
        minHeight: 36,
      }}
    >
      {/* Left icon */}
      <span style={{ fontSize: 11, opacity: 0.4, flexShrink: 0, width: 12, textAlign: 'center' }}>
        {isPinned ? '◆' : isSuggestion ? '↺' : '$'}
      </span>

      {/* Command + optional sublabel */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'monospace',
          fontSize: 12.5,
          color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          transition: 'color 0.06s',
        }}>
          {label}
        </div>
        {sublabel && (
          <div style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginTop: 1,
          }}>
            {sublabel}
          </div>
        )}
      </div>

      {/* Action hints — only when selected */}
      {isSelected && (
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {onSave && (
            <ActionBtn label="save" onClick={onSave} />
          )}
          <ActionBtn label="insert" onClick={onInsert} />
          <ActionBtn label="run" onClick={onRun} accent />
        </div>
      )}
    </div>
  )
}

function ActionBtn({ label, onClick, accent }: { label: string; onClick: () => void; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: accent ? 'var(--accent)' : 'var(--bg-overlay)',
        border: `1px solid ${accent ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 4,
        color: accent ? '#fff' : 'var(--text-muted)',
        fontSize: 10,
        padding: '2px 7px',
        cursor: 'pointer',
        fontFamily: 'Inter, system-ui, sans-serif',
        lineHeight: '16px',
      }}
    >
      {label}
    </button>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{
      padding: '1px 5px',
      fontSize: 10,
      fontFamily: 'Inter, system-ui, sans-serif',
      color: 'var(--text-muted)',
      background: 'var(--bg-base)',
      border: '1px solid var(--border)',
      borderRadius: 3,
      lineHeight: '15px',
    }}>
      {children}
    </kbd>
  )
}
