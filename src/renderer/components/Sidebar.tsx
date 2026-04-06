import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import type { Tab } from '../App'

interface SavedCommand {
  id: string
  command: string
  description: string
  createdAt: Date
}

interface Note {
  id: string
  content: string
  createdAt: Date
}

interface Props {
  tabs: Tab[]
  onSelectTab: (id: string) => void
}

type Panel = 'bookmarks' | 'commands' | 'notes'

const COMMANDS_KEY = 'nimbus:sidebar:commands'
const NOTES_KEY = 'nimbus:sidebar:notes'

function loadCommands(): SavedCommand[] {
  try {
    const raw = localStorage.getItem(COMMANDS_KEY)
    if (!raw) return []
    return (JSON.parse(raw) as SavedCommand[]).map(c => ({ ...c, createdAt: new Date(c.createdAt) }))
  } catch { return [] }
}

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(NOTES_KEY)
    if (!raw) return []
    return (JSON.parse(raw) as Note[]).map(n => ({ ...n, createdAt: new Date(n.createdAt) }))
  } catch { return [] }
}

export default function Sidebar({ tabs, onSelectTab }: Props) {
  const [activePanel, setActivePanel] = useState<Panel>('bookmarks')
  const [commands, setCommands] = useState<SavedCommand[]>(loadCommands)
  const [notes, setNotes] = useState<Note[]>(loadNotes)
  const [newCommand, setNewCommand] = useState('')
  const [newCommandDesc, setNewCommandDesc] = useState('')
  const [newNote, setNewNote] = useState('')
  const [addingCommand, setAddingCommand] = useState(false)
  const [addingNote, setAddingNote] = useState(false)

  useEffect(() => { localStorage.setItem(COMMANDS_KEY, JSON.stringify(commands)) }, [commands])
  useEffect(() => { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)) }, [notes])

  const bookmarkedTabs = tabs.filter(t => t.bookmarked)

  const addCommand = () => {
    if (!newCommand.trim()) return
    setCommands(prev => [...prev, {
      id: crypto.randomUUID(),
      command: newCommand.trim(),
      description: newCommandDesc.trim(),
      createdAt: new Date(),
    }])
    setNewCommand('')
    setNewCommandDesc('')
    setAddingCommand(false)
  }

  const addNote = () => {
    if (!newNote.trim()) return
    setNotes(prev => [...prev, {
      id: crypto.randomUUID(),
      content: newNote.trim(),
      createdAt: new Date(),
    }])
    setNewNote('')
    setAddingNote(false)
  }

  const deleteCommand = (id: string) => setCommands(prev => prev.filter(c => c.id !== id))
  const deleteNote = (id: string) => setNotes(prev => prev.filter(n => n.id !== id))

  const panels: { id: Panel; label: string; emoji: string }[] = [
    { id: 'bookmarks', label: 'Bookmarks', emoji: '★' },
    { id: 'commands', label: 'Commands', emoji: '⌘' },
    { id: 'notes', label: 'Notes', emoji: '✎' },
  ]

  return (
    <div style={{
      width: 300,
      height: '100%',
      background: 'var(--bg-surface)',
      borderLeft: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Panel tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {panels.map(p => (
          <button
            key={p.id}
            onClick={() => setActivePanel(p.id)}
            style={{
              flex: 1,
              padding: '10px 4px',
              background: activePanel === p.id ? 'var(--bg-overlay)' : 'transparent',
              border: 'none',
              borderBottom: activePanel === p.id ? '2px solid var(--accent)' : '2px solid transparent',
              color: activePanel === p.id ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: 11,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {p.emoji} {p.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>

        {/* Bookmarks */}
        {activePanel === 'bookmarks' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {bookmarkedTabs.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', marginTop: 24 }}>
                No bookmarks yet.<br />Star a tab to save it here.
              </p>
            ) : bookmarkedTabs.map(tab => (
              <motion.button
                key={tab.id}
                whileHover={{ x: 3 }}
                onClick={() => onSelectTab(tab.id)}
                style={{
                  background: 'var(--bg-overlay)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ color: 'var(--accent)' }}>★</span>
                {tab.title}
              </motion.button>
            ))}
          </div>
        )}

        {/* Saved Commands */}
        {activePanel === 'commands' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {commands.map(cmd => (
              <motion.div
                key={cmd.id}
                whileHover={{ x: 3 }}
                style={{
                  background: 'var(--bg-overlay)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  position: 'relative',
                }}
              >
                <button
                  onClick={() => deleteCommand(cmd.id)}
                  style={deleteBtnStyle}
                  title="Delete"
                >×</button>
                <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)', marginBottom: 2, paddingRight: 16 }}>
                  $ {cmd.command}
                </div>
                {cmd.description && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{cmd.description}</div>
                )}
              </motion.div>
            ))}

            {addingCommand ? (
              <div style={{ background: 'var(--bg-overlay)', border: '1px solid var(--accent)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  autoFocus
                  placeholder="Command..."
                  value={newCommand}
                  onChange={e => setNewCommand(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCommand(); if (e.key === 'Escape') setAddingCommand(false) }}
                  style={inputStyle}
                />
                <input
                  placeholder="Description (optional)"
                  value={newCommandDesc}
                  onChange={e => setNewCommandDesc(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCommand(); if (e.key === 'Escape') setAddingCommand(false) }}
                  style={inputStyle}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={addCommand} style={btnPrimary}>Save</button>
                  <button onClick={() => setAddingCommand(false)} style={btnSecondary}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingCommand(true)} style={addBtnStyle}>+ Save command</button>
            )}
          </div>
        )}

        {/* Notes */}
        {activePanel === 'notes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {notes.map(note => (
              <div
                key={note.id}
                style={{
                  background: 'var(--bg-overlay)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 12,
                  color: 'var(--text-primary)',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  position: 'relative',
                }}
              >
                <button
                  onClick={() => deleteNote(note.id)}
                  style={deleteBtnStyle}
                  title="Delete"
                >×</button>
                <div style={{ paddingRight: 16 }}>{note.content}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                  {note.createdAt.toLocaleDateString()} {note.createdAt.toLocaleTimeString()}
                </div>
              </div>
            ))}

            {addingNote ? (
              <div style={{ background: 'var(--bg-overlay)', border: '1px solid var(--accent)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <textarea
                  autoFocus
                  placeholder="Write a note..."
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={addNote} style={btnPrimary}>Save</button>
                  <button onClick={() => setAddingNote(false)} style={btnSecondary}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingNote(true)} style={addBtnStyle}>+ Add note</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-base)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  fontSize: 12,
  padding: '6px 8px',
  outline: 'none',
  fontFamily: 'inherit',
  width: '100%',
}

const btnPrimary: React.CSSProperties = {
  background: 'var(--accent)',
  border: 'none',
  borderRadius: 6,
  color: '#fff',
  fontSize: 12,
  padding: '5px 12px',
  cursor: 'pointer',
  flex: 1,
}

const btnSecondary: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-muted)',
  fontSize: 12,
  padding: '5px 12px',
  cursor: 'pointer',
  flex: 1,
}

const addBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px dashed var(--border)',
  borderRadius: 8,
  color: 'var(--text-muted)',
  fontSize: 12,
  padding: '8px',
  cursor: 'pointer',
  width: '100%',
  transition: 'color 0.15s, border-color 0.15s',
}

const deleteBtnStyle: React.CSSProperties = {
  position: 'absolute',
  top: 6,
  right: 8,
  background: 'transparent',
  border: 'none',
  color: 'var(--text-muted)',
  fontSize: 14,
  cursor: 'pointer',
  lineHeight: 1,
  padding: 0,
  opacity: 0.6,
}
