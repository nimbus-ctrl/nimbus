import type { ContextIdentity } from '../hooks/useContextIdentity'
import type { EnvLabel } from '../types/workspace'

interface Props {
  context: ContextIdentity
  envLabel?: EnvLabel
}

const ENV_STYLE: Record<EnvLabel, { color: string; bg: string; dot: string }> = {
  local:   { color: 'var(--text-muted)',     bg: 'transparent',              dot: 'var(--text-muted)' },
  dev:     { color: 'var(--success)',        bg: 'rgba(106,247,160,0.07)',   dot: 'var(--success)' },
  staging: { color: 'var(--warning)',        bg: 'rgba(247,185,106,0.07)',   dot: 'var(--warning)' },
  prod:    { color: 'var(--danger)',         bg: 'rgba(247,106,106,0.08)',   dot: 'var(--danger)' },
}

export default function ContextBar({ context, envLabel }: Props) {
  const { shortCwd, branch, branchLoading } = context
  const env = envLabel ? ENV_STYLE[envLabel] : null
  const isProd = envLabel === 'prod'

  return (
    <div style={{
      height: 26,
      display: 'flex',
      alignItems: 'center',
      paddingLeft: 14,
      paddingRight: 14,
      gap: 16,
      background: isProd ? 'rgba(247,106,106,0.04)' : 'var(--bg-base)',
      borderBottom: `1px solid ${isProd ? 'rgba(247,106,106,0.18)' : 'var(--border)'}`,
      flexShrink: 0,
      overflow: 'hidden',
      fontFamily: 'system-ui, sans-serif',
    }}>

      {/* Git branch */}
      {(branch !== null || branchLoading) && (
        <span style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 11,
          color: 'var(--text-secondary)',
          flexShrink: 0,
        }}>
          <BranchIcon />
          {branchLoading && !branch
            ? <span style={{ opacity: 0.4 }}>…</span>
            : <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{branch}</span>
          }
        </span>
      )}

      {/* CWD */}
      {shortCwd && (
        <span style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          minWidth: 0,
          fontFamily: '"JetBrains Mono", monospace',
        }}>
          {shortCwd}
        </span>
      )}

      {/* Env label */}
      {env && envLabel && (
        <span style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.06em',
          color: env.color,
          background: env.bg,
          border: `1px solid ${env.color}35`,
          borderRadius: 4,
          padding: '1px 7px',
          flexShrink: 0,
          textTransform: 'uppercase',
        }}>
          <span style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: env.dot,
            flexShrink: 0,
          }} />
          {envLabel}
        </span>
      )}
    </div>
  )
}

function BranchIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.55 }}>
      <path d="M5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 6a4 4 0 0 1-4-4 4 4 0 0 1 4-4 4 4 0 0 1 4 4 4 4 0 0 1-4 4zm6-6a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm2 2a4 4 0 0 1-4 4 4 4 0 0 1-4-4M5 9v4M11 7v2a4 4 0 0 1-4 4H5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
