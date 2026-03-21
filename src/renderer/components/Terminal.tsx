import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import 'xterm/css/xterm.css'

interface Props {
  tabId: string
  isActive: boolean
}

const nimbusTheme = {
  background: '#0f0f1a',
  foreground: '#e2e0ff',
  cursor: '#7c6af7',
  cursorAccent: '#0f0f1a',
  selectionBackground: '#7c6af730',
  black: '#1a1a2e',
  red: '#f76a6a',
  green: '#6af7a0',
  yellow: '#f7d06a',
  blue: '#6a9ff7',
  magenta: '#c56af7',
  cyan: '#6af7f0',
  white: '#e2e0ff',
  brightBlack: '#4a4870',
  brightRed: '#ff8585',
  brightGreen: '#85ffb5',
  brightYellow: '#ffe585',
  brightBlue: '#85b8ff',
  brightMagenta: '#d885ff',
  brightCyan: '#85fff8',
  brightWhite: '#ffffff',
}

declare global {
  interface Window {
    nimbus: {
      pty: {
        create: (opts: { id: string; cols: number; rows: number }) => Promise<void>
        write: (id: string, data: string) => Promise<void>
        resize: (id: string, cols: number, rows: number) => Promise<void>
        kill: (id: string) => Promise<void>
        onData: (id: string, cb: (data: string) => void) => () => void
        onExit: (id: string, cb: () => void) => () => void
      }
    }
  }
}

export default function Terminal({ tabId, isActive }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return
    initializedRef.current = true

    const xterm = new XTerm({
      theme: nimbusTheme,
      fontFamily: '"MapleMono NF", "Maple Mono NF", "JetBrains Mono", "Fira Code", monospace',
      fontSize: 14,
      lineHeight: 1.4,
      letterSpacing: 0.5,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowTransparency: true,
      scrollback: 5000,
      macOptionIsMeta: true,
    })

    const fitAddon = new FitAddon()
    const linksAddon = new WebLinksAddon()

    xterm.loadAddon(fitAddon)
    xterm.loadAddon(linksAddon)
    xterm.open(containerRef.current)
    fitAddon.fit()

    xtermRef.current = xterm
    fitAddonRef.current = fitAddon

    const { cols, rows } = xterm

    window.nimbus.pty.create({ id: tabId, cols, rows })

    const offData = window.nimbus.pty.onData(tabId, (data) => {
      xterm.write(data)
    })

    xterm.onData((data) => {
      window.nimbus.pty.write(tabId, data)
    })

    xterm.onResize(({ cols, rows }) => {
      window.nimbus.pty.resize(tabId, cols, rows)
    })

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      offData()
      resizeObserver.disconnect()
      window.nimbus.pty.kill(tabId)
      xterm.dispose()
      initializedRef.current = false
    }
  }, [tabId])

  useEffect(() => {
    if (isActive) {
      setTimeout(() => {
        fitAddonRef.current?.fit()
        xtermRef.current?.focus()
      }, 50)
    }
  }, [isActive])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        padding: '8px 12px',
        background: 'var(--bg-base)',
      }}
    />
  )
}
