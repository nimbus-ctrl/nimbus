import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import TabBar from './components/TabBar'
import Terminal from './components/Terminal'
import Sidebar from './components/Sidebar'

export interface Tab {
  id: string
  title: string
  bookmarked: boolean
  createdAt: Date
}

let tabCounter = 1

function createTab(): Tab {
  return {
    id: crypto.randomUUID(),
    title: `Terminal ${tabCounter++}`,
    bookmarked: false,
    createdAt: new Date(),
  }
}

export default function App() {
  const [tabs, setTabs] = useState<Tab[]>([createTab()])
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const addTab = useCallback(() => {
    const tab = createTab()
    setTabs(prev => [...prev, tab])
    setActiveTabId(tab.id)
  }, [])

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id)
      if (next.length === 0) {
        const tab = createTab()
        setActiveTabId(tab.id)
        return [tab]
      }
      if (activeTabId === id) {
        setActiveTabId(next[next.length - 1].id)
      }
      return next
    })
  }, [activeTabId])

  const toggleBookmark = useCallback((id: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, bookmarked: !t.bookmarked } : t))
  }, [])

  const renameTab = useCallback((id: string, title: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, title } : t))
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-base)' }}>
      {/* Title bar drag region */}
      <div style={{
        height: 40,
        WebkitAppRegion: 'drag',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 80,
        paddingRight: 12,
        background: 'var(--bg-base)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      } as React.CSSProperties}>
        <div style={{ flex: 1, WebkitAppRegion: 'drag' } as React.CSSProperties} />
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setSidebarOpen(o => !o)}
          style={{
            WebkitAppRegion: 'no-drag',
            background: sidebarOpen ? 'var(--accent-glow)' : 'transparent',
            border: `1px solid ${sidebarOpen ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 6,
            color: sidebarOpen ? 'var(--accent)' : 'var(--text-secondary)',
            padding: '4px 10px',
            fontSize: 12,
            cursor: 'pointer',
            transition: 'all 0.2s',
          } as React.CSSProperties}
        >
          ☰ Panel
        </motion.button>
      </div>

      {/* Tab bar */}
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={setActiveTabId}
        onAdd={addTab}
        onClose={closeTab}
        onToggleBookmark={toggleBookmark}
        onRename={renameTab}
      />

      {/* Main area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Terminals */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {tabs.map(tab => (
            <div
              key={tab.id}
              style={{
                position: 'absolute',
                inset: 0,
                display: tab.id === activeTabId ? 'block' : 'none',
              }}
            >
              <Terminal tabId={tab.id} isActive={tab.id === activeTabId} />
            </div>
          ))}
        </div>

        {/* Sidebar */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 300, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              style={{ overflow: 'hidden', flexShrink: 0 }}
            >
              <Sidebar tabs={tabs} onSelectTab={setActiveTabId} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
