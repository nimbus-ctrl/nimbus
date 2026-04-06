import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { RichBlock } from '../utils/contentDetectors'

export type OverlayBlock = RichBlock

interface Props {
  overlays: OverlayBlock[]
  onDismiss: (id: string) => void
  onOpenInPanel: (block: OverlayBlock) => void
}

export default function InlineOverlay({ overlays, onDismiss, onOpenInPanel }: Props) {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      zIndex: 10,
      overflow: 'hidden',
    }}>
      {overlays.map(block => (
        <DraggableCard
          key={block.id}
          block={block}
          onDismiss={onDismiss}
          onOpenInPanel={onOpenInPanel}
        />
      ))}
    </div>
  )
}

// ─── Draggable overlay card ─────────────────────────────────────────────────

function DraggableCard({
  block,
  onDismiss,
  onOpenInPanel,
}: {
  block: OverlayBlock
  onDismiss: (id: string) => void
  onOpenInPanel: (block: OverlayBlock) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [interacted, setInteracted] = useState(false)
  // Position as pixel offsets — null means "use default bottom-right"
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; origLeft: number; origTop: number } | null>(null)

  // Auto-dismiss after 10s if user hasn't interacted
  useEffect(() => {
    if (interacted) return
    const timer = setTimeout(() => onDismiss(block.id), 10000)
    return () => clearTimeout(timer)
  }, [interacted, block.id, onDismiss])

  const markInteracted = useCallback(() => setInteracted(true), [])

  const typeLabel = block.type === 'json' ? 'JSON' : block.type === 'table' ? 'Table' : 'Markdown'
  const typeColor = block.type === 'json' ? '#f7d06a' : block.type === 'table' ? '#6af7a0' : '#6a9ff7'

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const card = cardRef.current
    if (!card) return

    // If first drag, compute current position from bottom/right anchor
    let origLeft: number, origTop: number
    if (pos) {
      origLeft = pos.left
      origTop = pos.top
    } else {
      const cardRect = card.getBoundingClientRect()
      const parentRect = card.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 }
      origLeft = cardRect.left - parentRect.left
      origTop = cardRect.top - parentRect.top
    }

    dragRef.current = { startX: e.clientX, startY: e.clientY, origLeft, origTop }

    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;cursor:grabbing;'
    document.body.appendChild(overlay)

    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      setPos({ left: dragRef.current.origLeft + dx, top: dragRef.current.origTop + dy })
    }

    const handleUp = () => {
      dragRef.current = null
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
      document.body.removeChild(overlay)
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [pos])

  // Position styles: either explicit left/top from dragging, or default bottom-right
  const positionStyle: React.CSSProperties = pos
    ? { position: 'absolute', left: pos.left, top: pos.top }
    : { position: 'absolute', bottom: 8, right: 8 }

  return (
    <div
      ref={cardRef}
      onClick={markInteracted}
      style={{
        ...positionStyle,
        maxWidth: '55%',
        minWidth: 240,
        pointerEvents: 'auto',
        zIndex: 10,
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* Header — drag handle */}
        <div
          onMouseDown={handleDragStart}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 10px',
            borderBottom: expanded ? '1px solid var(--border)' : 'none',
            background: 'var(--bg-overlay)',
            cursor: 'grab',
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: typeColor }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
              {typeLabel}
            </span>
            {/* Drag hint dots */}
            <svg width="8" height="12" viewBox="0 0 8 12" style={{ opacity: 0.3, marginLeft: 2 }}>
              <circle cx="2" cy="2" r="1" fill="var(--text-muted)" />
              <circle cx="6" cy="2" r="1" fill="var(--text-muted)" />
              <circle cx="2" cy="6" r="1" fill="var(--text-muted)" />
              <circle cx="6" cy="6" r="1" fill="var(--text-muted)" />
              <circle cx="2" cy="10" r="1" fill="var(--text-muted)" />
              <circle cx="6" cy="10" r="1" fill="var(--text-muted)" />
            </svg>
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            <OverlayButton title="Open in panel" onClick={() => onOpenInPanel(block)}>
              ⧉
            </OverlayButton>
            <OverlayButton title={expanded ? 'Collapse' : 'Expand'} onClick={() => setExpanded(e => !e)}>
              {expanded ? '−' : '+'}
            </OverlayButton>
            <OverlayButton title="Dismiss" onClick={() => onDismiss(block.id)}>
              ✕
            </OverlayButton>
          </div>
        </div>

        {/* Content */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{ overflow: 'hidden' }}
            >
              <RichContent block={block} maxHeight={300} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

// ─── Rich panel (docked next to terminal) ───────────────────────────────────

export function RichPanel({ block, onClose }: { block: OverlayBlock; onClose: () => void }) {
  const [width, setWidth] = useState(360)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const typeLabel = block.type === 'json' ? 'JSON' : block.type === 'table' ? 'Table' : 'Markdown'
  const typeColor = block.type === 'json' ? '#f7d06a' : block.type === 'table' ? '#6af7a0' : '#6a9ff7'

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startWidth: width }

    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;cursor:col-resize;'
    document.body.appendChild(overlay)

    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const dx = dragRef.current.startX - ev.clientX // reversed — dragging left = wider
      setWidth(Math.max(240, Math.min(800, dragRef.current.startWidth + dx)))
    }

    const handleUp = () => {
      dragRef.current = null
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
      document.body.removeChild(overlay)
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [width])

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.18, ease: [0.25, 0, 0, 1] }}
      style={{
        height: '100%',
        background: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 6,
          cursor: 'col-resize',
          zIndex: 2,
        }}
      />

      {/* Panel header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-overlay)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: typeColor }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
            {typeLabel}
          </span>
        </div>
        <OverlayButton title="Close panel" onClick={onClose}>✕</OverlayButton>
      </div>

      {/* Panel content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <RichContent block={block} />
      </div>
    </motion.div>
  )
}

// ─── Shared content renderer ────────────────────────────────────────────────

function RichContent({ block, maxHeight }: { block: OverlayBlock; maxHeight?: number }) {
  return (
    <div style={{
      padding: '10px 12px',
      maxHeight,
      overflow: 'auto',
      fontSize: 13,
      lineHeight: 1.5,
      color: 'var(--text-primary)',
    }}>
      {block.type === 'json' && <JsonRenderer content={block.content} />}
      {block.type === 'table' && <TableRenderer content={block.content} />}
      {block.type === 'markdown' && <MarkdownRenderer content={block.content} />}
    </div>
  )
}

// ─── Button ─────────────────────────────────────────────────────────────────

function OverlayButton({ onClick, children, title }: { onClick: () => void; children: React.ReactNode; title?: string }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={title}
      style={{
        background: hovered ? 'var(--accent-glow)' : 'transparent',
        border: 'none',
        borderRadius: 4,
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        width: 22,
        height: 22,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        transition: 'background 0.1s',
      }}
    >
      {children}
    </button>
  )
}

// ─── Renderers ──────────────────────────────────────────────────────────────

function JsonRenderer({ content }: { content: string }) {
  let formatted: string
  try {
    formatted = JSON.stringify(JSON.parse(content), null, 2)
  } catch {
    formatted = content
  }

  return (
    <pre style={{
      margin: 0,
      fontFamily: '"MapleMono NF", "JetBrains Mono", "Fira Code", monospace',
      fontSize: 12,
      lineHeight: 1.5,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      color: '#f7d06a',
    }}>
      {formatted}
    </pre>
  )
}

function TableRenderer({ content }: { content: string }) {
  const lines = content.split('\n').filter(l => l.trim())

  const isPipeTable = lines.every(l => l.trim().startsWith('|'))
  if (isPipeTable) {
    return <PipeTable lines={lines} />
  }

  return (
    <pre style={{
      margin: 0,
      fontFamily: '"MapleMono NF", "JetBrains Mono", "Fira Code", monospace',
      fontSize: 12,
      lineHeight: 1.5,
      whiteSpace: 'pre',
      color: '#6af7a0',
    }}>
      {content}
    </pre>
  )
}

function PipeTable({ lines }: { lines: string[] }) {
  const parseLine = (line: string) =>
    line.split('|').slice(1, -1).map(cell => cell.trim())

  const isSeparator = (line: string) => /^\|[\s\-:]+\|$/.test(line.trim())
  const dataLines = lines.filter(l => !isSeparator(l))

  const header = dataLines[0] ? parseLine(dataLines[0]) : []
  const rows = dataLines.slice(1).map(parseLine)

  return (
    <table style={{
      borderCollapse: 'collapse',
      width: '100%',
      fontSize: 12,
      fontFamily: '"MapleMono NF", "JetBrains Mono", "Fira Code", monospace',
    }}>
      {header.length > 0 && (
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th key={i} style={{
                padding: '4px 8px',
                borderBottom: '2px solid var(--accent)',
                textAlign: 'left',
                color: 'var(--accent)',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}>
                {cell}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => (
              <td key={ci} style={{
                padding: '3px 8px',
                borderBottom: '1px solid var(--border)',
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
              }}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="nimbus-md" style={{ fontSize: 13 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--accent)' }}>{children}</h1>,
          h2: ({ children }) => <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>{children}</h2>,
          h3: ({ children }) => <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>{children}</h3>,
          p: ({ children }) => <p style={{ marginBottom: 8, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{children}</p>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
              {children}
            </a>
          ),
          code: ({ children, className }) => {
            const isBlock = className?.includes('language-')
            if (isBlock) {
              return (
                <pre style={{
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '8px 10px',
                  margin: '6px 0',
                  overflow: 'auto',
                  fontSize: 12,
                  fontFamily: '"MapleMono NF", "JetBrains Mono", monospace',
                  color: 'var(--text-primary)',
                }}>
                  <code>{children}</code>
                </pre>
              )
            }
            return (
              <code style={{
                background: 'var(--bg-base)',
                padding: '1px 5px',
                borderRadius: 3,
                fontSize: 12,
                fontFamily: '"MapleMono NF", "JetBrains Mono", monospace',
                color: '#c56af7',
              }}>
                {children}
              </code>
            )
          },
          ul: ({ children }) => <ul style={{ paddingLeft: 18, marginBottom: 8 }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ paddingLeft: 18, marginBottom: 8 }}>{children}</ol>,
          li: ({ children }) => <li style={{ color: 'var(--text-secondary)', marginBottom: 2 }}>{children}</li>,
          blockquote: ({ children }) => (
            <blockquote style={{
              borderLeft: '3px solid var(--accent)',
              paddingLeft: 10,
              margin: '6px 0',
              color: 'var(--text-muted)',
              fontStyle: 'italic',
            }}>
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
