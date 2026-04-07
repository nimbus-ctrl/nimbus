import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export interface CommandRecord {
  id: string
  command: string
  cwd: string
  startTime: number
  endTime?: number
  exitCode?: number
  outputLines: string[]
}

interface Props {
  record: CommandRecord
  collapsed: boolean
  onToggle: () => void
  onSaveToMemory?: () => void
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return `${m}m ${s}s`
}

function baseName(p: string): string {
  return p.split('/').pop() || p
}

// ─── Status tokens ────────────────────────────────────────────────────────────
// Calm success, warm failure, soft running — never garish.

const STATUS = {
  success: {
    leftBorder: 'rgba(134, 239, 172, 0.35)',   // soft green
    icon: '✓',
    iconColor: 'rgba(134, 239, 172, 0.9)',
    cardBg: 'transparent',
  },
  failure: {
    leftBorder: 'rgba(252, 165, 165, 0.45)',   // muted rose, not alarm-red
    icon: '✕',
    iconColor: 'rgba(252, 165, 165, 0.85)',
    cardBg: 'rgba(252, 165, 165, 0.03)',
  },
  running: {
    leftBorder: 'rgba(124, 106, 247, 0.5)',    // accent
    icon: '…',
    iconColor: 'var(--accent)',
    cardBg: 'transparent',
  },
}

export default function CommandCard({ record, collapsed, onToggle, onSaveToMemory }: Props) {
  const isRunning  = record.endTime === undefined
  const isSuccess  = !isRunning && record.exitCode === 0
  const status     = isRunning ? STATUS.running : isSuccess ? STATUS.success : STATUS.failure
  const duration   = record.endTime ? formatDuration(record.endTime - record.startTime) : null
  const hasOutput  = record.outputLines.length > 0
  const exitLabel  = !isRunning && !isSuccess ? `exit ${record.exitCode}` : null
  const [hovered, setHovered] = useState(false)

  return (
    <motion.div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      style={{
        background: status.cardBg,
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${status.leftBorder}`,
        borderRadius: 7,
        overflow: 'hidden',
        flexShrink: 0,
        // Smoothly transition status colour when a command finishes
        transition: 'border-left-color 0.4s ease, background-color 0.4s ease',
      }}
    >
      {/* ── Header ── */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px 6px 8px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {/* Collapse chevron — very quiet */}
        <span style={{
          fontSize: 8,
          color: 'var(--text-muted)',
          opacity: 0.5,
          display: 'inline-block',
          transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s',
          flexShrink: 0,
          width: 8,
          lineHeight: 1,
        }}>▼</span>

        {/* $ prompt prefix — terminal-native feel */}
        <span style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          opacity: 0.5,
          fontFamily: '"MapleMono NF", "Maple Mono NF", "JetBrains Mono", monospace',
          flexShrink: 0,
        }}>$</span>

        {/* Command text — the visual anchor */}
        <span style={{
          flex: 1,
          fontFamily: '"MapleMono NF", "Maple Mono NF", "JetBrains Mono", monospace',
          fontSize: 12.5,
          fontWeight: 500,
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          letterSpacing: 0.1,
        }}>
          {record.command}
        </span>

        {/* Metadata — recedes behind the command */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
          opacity: 0.55,
        }}>
          <span style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            fontFamily: 'system-ui, sans-serif',
          }} title={record.cwd}>
            ~/{baseName(record.cwd)}
          </span>

          {duration && (
            <span style={{
              fontSize: 10,
              color: 'var(--text-muted)',
              fontFamily: 'system-ui, sans-serif',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {duration}
            </span>
          )}

          {/* Exit code — warm, not alarming */}
          {exitLabel && (
            <span style={{
              fontSize: 10,
              color: 'rgba(252, 165, 165, 0.8)',
              fontFamily: 'system-ui, sans-serif',
            }}>
              {exitLabel}
            </span>
          )}

          {/* Status icon — right-anchored, calm */}
          <span style={{
            fontSize: 11,
            color: status.iconColor,
            lineHeight: 1,
            fontFamily: 'system-ui, sans-serif',
          }}>
            {status.icon}
          </span>

          {/* Save to Memory — appears on hover */}
          {onSaveToMemory && hovered && !isRunning && (
            <button
              title="Save to Command Memory"
              onClick={e => { e.stopPropagation(); onSaveToMemory() }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--accent)',
                fontSize: 11,
                cursor: 'pointer',
                padding: '0 2px',
                lineHeight: 1,
                opacity: 0.7,
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              ⊕
            </button>
          )}
        </div>
      </div>

      {/* ── Output — animated expand / collapse ── */}
      <AnimatePresence initial={false}>
        {!collapsed && hasOutput && (
          <motion.div
            key="output"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.17, ease: [0.25, 0, 0, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              borderTop: '1px solid rgba(255,255,255,0.05)',
              background: 'rgba(0,0,0,0.18)',
              maxHeight: 200,
              overflowY: 'auto',
              padding: '7px 12px 8px 14px',
            }}>
              {record.outputLines.map((line, i) => (
                <div key={i} style={{
                  fontFamily: '"MapleMono NF", "Maple Mono NF", "JetBrains Mono", monospace',
                  fontSize: 11,
                  color: 'rgba(226, 224, 255, 0.55)',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}>
                  {line || '\u00a0'}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
