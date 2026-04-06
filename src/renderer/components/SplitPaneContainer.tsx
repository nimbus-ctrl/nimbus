import { useRef, useCallback, useState, useMemo, memo } from 'react'
import type { SplitNode } from '../types/splitTree'
import type { HandleLayout } from '../utils/splitLayout'
import { computePaneLayouts, computeHandleLayouts } from '../utils/splitLayout'
import Terminal, { getXtermInstance } from './Terminal'

interface Props {
  node: SplitNode
  activePaneId: string
  onPaneClick: (paneId: string) => void
  onRatioChange: (branchId: string, ratio: number) => void
  onDetachPane?: (paneId: string) => void
  onActivity?: (paneId: string) => void
  isTabActive: boolean
}

export default function SplitPaneContainer({
  node,
  activePaneId,
  onPaneClick,
  onRatioChange,
  onDetachPane,
  onActivity,
  isTabActive,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const paneLayouts = useMemo(() => computePaneLayouts(node), [node])
  const handleLayouts = useMemo(() => computeHandleLayouts(node), [node])
  const canDetach = node.type !== 'leaf'

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', flex: 1, overflow: 'hidden' }}
    >
      {/* Panes — flat list, keyed by paneId. Never unmount during tree changes. */}
      {paneLayouts.map(layout => (
        <PaneLeaf
          key={layout.paneId}
          paneId={layout.paneId}
          left={layout.left}
          top={layout.top}
          width={layout.width}
          height={layout.height}
          isActive={isTabActive && layout.paneId === activePaneId}
          onPaneClick={onPaneClick}
          onDetachPane={canDetach ? onDetachPane : undefined}
          onActivity={onActivity}
        />
      ))}

      {/* Resize handles */}
      {handleLayouts.map(handle => (
        <FlatResizeHandle
          key={handle.branchId}
          handle={handle}
          containerRef={containerRef}
          onRatioChange={onRatioChange}
        />
      ))}
    </div>
  )
}

// ─── Pane leaf ───────────────────────────────────────────────────────────────

const PaneLeaf = memo(function PaneLeaf({
  paneId,
  left,
  top,
  width,
  height,
  isActive,
  onPaneClick,
  onDetachPane,
  onActivity,
}: {
  paneId: string
  left: number
  top: number
  width: number
  height: number
  isActive: boolean
  onPaneClick: (id: string) => void
  onDetachPane?: (id: string) => void
  onActivity?: (paneId: string) => void
}) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    onPaneClick(paneId)
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [onPaneClick, paneId])

  const closeMenu = useCallback(() => setContextMenu(null), [])

  const handleCopy = useCallback(() => {
    setContextMenu(null)
    const xterm = getXtermInstance(paneId)
    if (xterm) {
      const selection = xterm.getSelection()
      if (selection) navigator.clipboard.writeText(selection)
    }
  }, [paneId])

  const handlePaste = useCallback(() => {
    setContextMenu(null)
    navigator.clipboard.readText().then(text => {
      if (text) window.nimbus.pty.write(paneId, text)
    })
  }, [paneId])

  const handleClear = useCallback(() => {
    setContextMenu(null)
    const xterm = getXtermInstance(paneId)
    if (xterm) {
      xterm.clear()
      window.nimbus.pty.write(paneId, '\x0c')
    }
  }, [paneId])

  const handleDetach = useCallback(() => {
    setContextMenu(null)
    onDetachPane?.(paneId)
  }, [onDetachPane, paneId])

  return (
    <div
      onClick={() => onPaneClick(paneId)}
      onContextMenu={handleContextMenu}
      style={{
        position: 'absolute',
        left: `${left * 100}%`,
        top: `${top * 100}%`,
        width: `${width * 100}%`,
        height: `${height * 100}%`,
        boxShadow: isActive ? 'inset 0 0 0 1px var(--accent-glow)' : 'none',
        transition: 'box-shadow 0.15s',
        overflow: 'hidden',
      }}
    >
      <Terminal tabId={paneId} isActive={isActive} onActivity={onActivity ? () => onActivity(paneId) : undefined} />

      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={closeMenu}>
          <ContextMenuItem onClick={handleCopy}>Copy</ContextMenuItem>
          <ContextMenuItem onClick={handlePaste}>Paste</ContextMenuItem>
          <ContextMenuDivider />
          <ContextMenuItem onClick={handleClear}>Clear Terminal</ContextMenuItem>
          {onDetachPane && (
            <>
              <ContextMenuDivider />
              <ContextMenuItem onClick={handleDetach}>
                Move to New Tab
              </ContextMenuItem>
            </>
          )}
        </ContextMenu>
      )}
    </div>
  )
})

// ─── Context menu ────────────────────────────────────────────────────────────

function ContextMenu({
  x,
  y,
  onClose,
  children,
}: {
  x: number
  y: number
  onClose: () => void
  children: React.ReactNode
}) {
  const handleBackdrop = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onClose()
  }, [onClose])

  return (
    <>
      <div
        onClick={handleBackdrop}
        onContextMenu={handleBackdrop}
        style={{ position: 'fixed', inset: 0, zIndex: 999 }}
      />
      <div
        style={{
          position: 'fixed',
          left: x,
          top: y,
          zIndex: 1000,
          background: 'var(--bg-overlay)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '4px 0',
          minWidth: 180,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {children}
      </div>
    </>
  )
}

function ContextMenuItem({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '8px 14px',
        fontSize: 13,
        color: 'var(--text-primary)',
        cursor: 'pointer',
        background: hovered ? 'var(--accent-glow)' : 'transparent',
        transition: 'background 0.1s',
        userSelect: 'none',
      }}
    >
      {children}
    </div>
  )
}

function ContextMenuDivider() {
  return <div style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />
}

// ─── Flat resize handle ─────────────────────────────────────────────────────

const FlatResizeHandle = memo(function FlatResizeHandle({
  handle,
  containerRef,
  onRatioChange,
}: {
  handle: HandleLayout
  containerRef: React.RefObject<HTMLDivElement | null>
  onRatioChange: (branchId: string, ratio: number) => void
}) {
  const [active, setActive] = useState(false)
  const isVertical = handle.direction === 'vertical'

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setActive(true)

    const overlay = document.createElement('div')
    overlay.style.cssText = `position:fixed;inset:0;z-index:9999;cursor:${
      isVertical ? 'col-resize' : 'row-resize'
    };`
    document.body.appendChild(overlay)

    const container = containerRef.current
    if (!container) return

    const handleMouseMove = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      if (isVertical) {
        const mouseX = (ev.clientX - rect.left) / rect.width
        const ratio = (mouseX - handle.areaLeft) / handle.areaWidth
        onRatioChange(handle.branchId, ratio)
      } else {
        const mouseY = (ev.clientY - rect.top) / rect.height
        const ratio = (mouseY - handle.areaTop) / handle.areaHeight
        onRatioChange(handle.branchId, ratio)
      }
    }

    const handleMouseUp = () => {
      setActive(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.removeChild(overlay)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [isVertical, handle, containerRef, onRatioChange])

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={(e) => {
        // Don't deactivate if dragging (button is pressed)
        if (e.buttons === 0) setActive(false)
      }}
      style={{
        position: 'absolute',
        left: isVertical ? `${handle.left * 100}%` : `${handle.areaLeft * 100}%`,
        top: isVertical ? `${handle.areaTop * 100}%` : `${handle.top * 100}%`,
        width: isVertical ? 12 : `${handle.areaWidth * 100}%`,
        height: isVertical ? `${handle.areaHeight * 100}%` : 12,
        transform: isVertical ? 'translateX(-6px)' : 'translateY(-6px)',
        cursor: isVertical ? 'col-resize' : 'row-resize',
        zIndex: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: isVertical ? 2 : '100%',
          height: isVertical ? '100%' : 2,
          borderRadius: 1,
          background: active ? 'var(--accent)' : 'var(--border)',
          transition: 'background 0.15s, transform 0.15s',
          transform: active
            ? (isVertical ? 'scaleX(2)' : 'scaleY(2)')
            : 'scale(1)',
        }}
      />
    </div>
  )
})
