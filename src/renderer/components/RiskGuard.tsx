import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { RiskResult, RiskLevel } from '../utils/commandRisk'
import { RISK_DISPLAY } from '../utils/commandRisk'
import type { PreviewResult } from '../utils/commandPreview'

// ─── Blocking confirmation (destructive commands) ─────────────────────────────

interface ConfirmProps {
  command: string
  risk: RiskResult
  preview: PreviewResult | null
  previewLoading: boolean
  onConfirm: () => void
  onCancel: () => void
  onFitTerminal?: () => void
}

export function RiskConfirmation({ command, risk, preview, previewLoading, onConfirm, onCancel, onFitTerminal }: ConfirmProps) {
  const display = RISK_DISPLAY[risk.level]

  // Keyboard: Enter = confirm, Escape = cancel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onConfirm() }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel() }
    }
    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [onConfirm, onCancel])

  // Refit the terminal when this panel mounts/unmounts so xterm fills available space
  useEffect(() => {
    onFitTerminal?.()
    return () => { onFitTerminal?.() }
  }, [onFitTerminal])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
      style={{
        flexShrink: 0,
        background: 'var(--bg-overlay)',
        borderTop: `1px solid ${display.color}40`,
        backdropFilter: 'blur(8px)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Top accent line */}
      <div style={{ height: 2, background: `linear-gradient(90deg, ${display.color}, transparent)` }} />

      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* Header: risk badge + reasons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.07em',
            color: display.color,
            background: `${display.color}18`,
            border: `1px solid ${display.color}40`,
            borderRadius: 4,
            padding: '2px 7px',
            flexShrink: 0,
          }}>
            ◆ {display.label}
          </span>
          {risk.reasons.map((r, i) => (
            <span key={i} style={{
              fontSize: 11,
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}>
              {i > 0 && <span style={{ opacity: 0.35 }}>·</span>}
              {r}
            </span>
          ))}
        </div>

        {/* Command preview */}
        <div style={{
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          fontSize: 12,
          color: 'var(--text-primary)',
          background: 'rgba(0,0,0,0.25)',
          border: '1px solid var(--border)',
          borderRadius: 5,
          padding: '5px 10px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          <span style={{ color: 'var(--text-muted)', marginRight: 7 }}>$</span>
          {command}
        </div>

        {/* Preview section */}
        {(previewLoading || preview) && (
          <PreviewSection preview={preview} loading={previewLoading} />
        )}

        {/* Action row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <ActionButton
            onClick={onConfirm}
            color={display.color}
            primary
          >
            Run anyway <Kbd>↵</Kbd>
          </ActionButton>
          <ActionButton onClick={onCancel} color="var(--text-muted)">
            Cancel <Kbd>Esc</Kbd>
          </ActionButton>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Non-blocking toast (elevated / network) ──────────────────────────────────

interface ToastProps {
  level: RiskLevel
  reasons: string[]
}

export function RiskToast({ level, reasons }: ToastProps) {
  const display = RISK_DISPLAY[level]
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 2500)
    return () => clearTimeout(t)
  }, [])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.96 }}
          transition={{ duration: 0.12 }}
          style={{
            position: 'absolute',
            bottom: 8,
            left: 10,
            zIndex: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            background: 'var(--bg-overlay)',
            border: `1px solid ${display.color}35`,
            borderRadius: 6,
            padding: '5px 10px',
            backdropFilter: 'blur(8px)',
            pointerEvents: 'none',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.06em',
            color: display.color,
          }}>
            ▲ {display.label}
          </span>
          {reasons.slice(0, 2).map((r, i) => (
            <span key={i} style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {i > 0 ? '·' : ''} {r}
            </span>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ─── Preview section inside the confirmation panel ───────────────────────────

function PreviewSection({ preview, loading }: { preview: PreviewResult | null; loading: boolean }) {
  if (loading && !preview) {
    return (
      <div style={{
        fontSize: 11,
        color: 'var(--text-muted)',
        padding: '5px 0',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <LoadingDot />
        Generating preview…
      </div>
    )
  }

  if (!preview) return null

  if (preview.error) {
    return (
      <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '3px 0', opacity: 0.7 }}>
        Preview unavailable: {preview.error}
      </div>
    )
  }

  return (
    <div style={{
      background: 'rgba(0,0,0,0.2)',
      border: '1px solid var(--border)',
      borderRadius: 5,
      overflow: 'hidden',
    }}>
      {/* Label */}
      <div style={{
        padding: '4px 10px',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.06em',
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        <span>{preview.label}</span>
        {preview.totalCount !== undefined && (
          <span>{preview.totalCount} total</span>
        )}
      </div>
      {/* Lines */}
      <div style={{
        maxHeight: 120,
        overflowY: 'auto',
        padding: '5px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}>
        {preview.lines.length === 0 ? (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Nothing would be affected
          </span>
        ) : (
          preview.lines.map((line, i) => (
            <span key={i} style={{
              fontSize: 11,
              fontFamily: '"JetBrains Mono", monospace',
              color: 'var(--text-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {line}
            </span>
          ))
        )}
      </div>
    </div>
  )
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function ActionButton({
  onClick, color, primary, children,
}: {
  onClick: () => void
  color: string
  primary?: boolean
  children: React.ReactNode
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        background: primary && hovered ? `${color}20` : 'transparent',
        border: `1px solid ${hovered ? color : color + '50'}`,
        borderRadius: 5,
        color: hovered ? color : primary ? color + 'cc' : 'var(--text-muted)',
        fontSize: 11,
        fontWeight: 500,
        padding: '4px 10px',
        cursor: 'pointer',
        transition: 'all 0.1s',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 10,
      opacity: 0.65,
      background: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 3,
      padding: '1px 4px',
      lineHeight: 1.4,
    }}>
      {children}
    </span>
  )
}

function LoadingDot() {
  return (
    <motion.span
      animate={{ opacity: [0.3, 1, 0.3] }}
      transition={{ duration: 1.2, repeat: Infinity }}
      style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--text-muted)', display: 'inline-block' }}
    />
  )
}
