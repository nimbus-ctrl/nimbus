import { useState, useRef, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'

export type DockPosition = 'bottom' | 'right' | 'left'

interface Props {
  isOpen: boolean
  position: DockPosition
  onPositionChange: (pos: DockPosition) => void
  onClose: () => void
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const DOCK_ICONS: Record<DockPosition, string> = {
  bottom: '⬓',
  right: '⬔',
  left: '◨',
}

const POSITION_CYCLE: DockPosition[] = ['bottom', 'right', 'left']

const MODELS = [
  { id: 'claude-sonnet-4-20250514', label: 'Sonnet 4', tag: 'fast' },
  { id: 'claude-opus-4-20250514', label: 'Opus 4', tag: 'smart' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', tag: 'instant' },
] as const

export default function AiPanel({ isOpen, position, onPositionChange, onClose }: Props) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [mode, setMode] = useState<'chat' | 'generate'>('chat')
  const [showSettings, setShowSettings] = useState(false)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeyStatus, setApiKeyStatus] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [selectedModel, setSelectedModel] = useState<string>(MODELS[0].id)
  const [elapsed, setElapsed] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Check for stored API key on mount
  useEffect(() => {
    window.nimbus.apiKey.retrieve()
      .then(({ key }) => setHasApiKey(key !== null))
      .catch(() => setHasApiKey(false))
  }, [])

  // Elapsed timer while streaming
  useEffect(() => {
    if (isStreaming) {
      setElapsed(0)
      elapsedRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    } else {
      if (elapsedRef.current) clearInterval(elapsedRef.current)
      elapsedRef.current = null
    }
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current) }
  }, [isStreaming])

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && !showSettings) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, position, showSettings])

  // Auto-scroll to latest message (throttled to once per frame)
  const scrollRafRef = useRef(0)
  useEffect(() => {
    if (scrollRafRef.current) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    })
  }, [messages])

  const cyclePosition = useCallback(() => {
    const idx = POSITION_CYCLE.indexOf(position)
    onPositionChange(POSITION_CYCLE[(idx + 1) % POSITION_CYCLE.length])
  }, [position, onPositionChange])

  const handleStoreKey = useCallback(async () => {
    const key = apiKeyInput.trim()
    if (!key) return
    try {
      await window.nimbus.apiKey.store(key)
      setHasApiKey(true)
      setApiKeyInput('')
      setApiKeyStatus('Key saved to macOS Keychain')
      setTimeout(() => setApiKeyStatus(null), 3000)
    } catch {
      setApiKeyStatus('Failed to store key')
    }
  }, [apiKeyInput])

  const handleDeleteKey = useCallback(async () => {
    try {
      await window.nimbus.apiKey.delete()
      setHasApiKey(false)
      setApiKeyStatus('Key removed')
      setTimeout(() => setApiKeyStatus(null), 3000)
    } catch {
      setApiKeyStatus('Failed to remove key')
    }
  }, [])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || isStreaming) return

    if (!hasApiKey) {
      setMessages(prev => [...prev,
        { id: crypto.randomUUID(), role: 'user', content: text },
        { id: crypto.randomUUID(), role: 'assistant', content: 'No API key configured. Click the key icon to add your Claude API key.' },
      ])
      setInput('')
      return
    }

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text }
    const aiMsgId = crypto.randomUUID()
    const requestId = crypto.randomUUID()

    // Add user message + empty AI message that we'll stream into
    setMessages(prev => [...prev, userMsg, { id: aiMsgId, role: 'assistant', content: '' }])
    setInput('')
    setIsStreaming(true)

    // Build conversation history for context (only send last 20 messages to stay within limits)
    const history = [...messages, userMsg]
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content }))

    // Batch token updates — accumulate tokens and flush once per animation frame
    let tokenBuffer = ''
    let tokenRafId = 0
    const offToken = window.nimbus.ai.onToken(requestId, (token) => {
      tokenBuffer += token
      if (!tokenRafId) {
        tokenRafId = requestAnimationFrame(() => {
          tokenRafId = 0
          const chunk = tokenBuffer
          tokenBuffer = ''
          setMessages(prev => prev.map(m =>
            m.id === aiMsgId ? { ...m, content: m.content + chunk } : m
          ))
        })
      }
    })

    const flushTokens = () => {
      if (tokenRafId) { cancelAnimationFrame(tokenRafId); tokenRafId = 0 }
      if (tokenBuffer) {
        const chunk = tokenBuffer
        tokenBuffer = ''
        setMessages(prev => prev.map(m =>
          m.id === aiMsgId ? { ...m, content: m.content + chunk } : m
        ))
      }
    }

    const offDone = window.nimbus.ai.onDone(requestId, () => {
      flushTokens()
      setIsStreaming(false)
      cleanup()
    })

    const offError = window.nimbus.ai.onError(requestId, (error) => {
      if (tokenRafId) { cancelAnimationFrame(tokenRafId); tokenRafId = 0 }
      tokenBuffer = ''
      setMessages(prev => prev.map(m =>
        m.id === aiMsgId ? { ...m, content: `Error: ${error}` } : m
      ))
      setIsStreaming(false)
      cleanup()
    })

    function cleanup() {
      offToken()
      offDone()
      offError()
    }

    // Fire the request — main process handles the API call
    window.nimbus.ai.chat(history, requestId, selectedModel)
  }, [input, hasApiKey, isStreaming, messages, selectedModel])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape') {
      onClose()
    }
  }, [handleSend, onClose])

  const isHorizontal = position === 'bottom'

  // Animation variants based on dock position
  const variants = {
    bottom: {
      initial: { height: 0, opacity: 0 },
      animate: { height: 'auto', opacity: 1 },
      exit: { height: 0, opacity: 0 },
    },
    right: {
      initial: { width: 0, opacity: 0 },
      animate: { width: 400, opacity: 1 },
      exit: { width: 0, opacity: 0 },
    },
    left: {
      initial: { width: 0, opacity: 0 },
      animate: { width: 400, opacity: 1 },
      exit: { width: 0, opacity: 0 },
    },
  }

  const v = variants[position]

  return (
    <motion.div
      initial={v.initial}
      animate={v.animate}
      exit={v.exit}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      style={{
        background: '#0a0a14',
        borderTop: isHorizontal ? '1px solid var(--border)' : 'none',
        borderLeft: position === 'right' ? '1px solid var(--border)' : 'none',
        borderRight: position === 'left' ? '1px solid var(--border)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
        ...(isHorizontal
          ? { maxHeight: '50vh', minHeight: 48 }
          : { height: '100%', minWidth: 48 }),
      }}
    >
      {/* Input row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 14px',
        gap: 10,
        flexShrink: 0,
      }}>
        {/* Nimbus icon */}
        <div style={{
          width: 24,
          height: 24,
          borderRadius: 8,
          background: 'linear-gradient(135deg, var(--accent), #c56af7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 700,
          flexShrink: 0,
          boxShadow: '0 0 12px rgba(124, 106, 247, 0.3)',
          color: '#0f0f1a',
        }}>
          N
        </div>

        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Nimbus anything..."
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontFamily: "'JetBrains Mono', 'MapleMono NF', monospace",
            fontSize: 13,
          }}
        />

        {/* Model selector */}
        <div style={{
          display: 'flex',
          background: '#12122a',
          borderRadius: 6,
          overflow: 'hidden',
          border: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          {MODELS.map(m => (
            <button
              key={m.id}
              onClick={() => setSelectedModel(m.id)}
              title={`${m.label} (${m.tag})`}
              style={{
                fontSize: 10,
                fontFamily: 'inherit',
                padding: '4px 8px',
                background: selectedModel === m.id ? 'rgba(124, 106, 247, 0.15)' : 'transparent',
                border: 'none',
                color: selectedModel === m.id ? 'var(--accent)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* API key settings button */}
        <button
          onClick={() => setShowSettings(s => !s)}
          title={hasApiKey ? 'API key configured' : 'Set API key'}
          style={{
            background: showSettings ? 'rgba(124, 106, 247, 0.15)' : 'transparent',
            border: `1px solid ${showSettings ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 5,
            color: hasApiKey ? 'var(--success)' : (showSettings ? 'var(--accent)' : 'var(--text-muted)'),
            padding: '3px 7px',
            fontSize: 11,
            cursor: 'pointer',
            flexShrink: 0,
            lineHeight: 1,
            transition: 'all 0.15s',
          }}
        >
          {hasApiKey ? '🔑' : '🔒'}
        </button>

        {/* Dock position button */}
        <button
          onClick={cyclePosition}
          title={`Dock: ${position} (click to cycle)`}
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 5,
            color: 'var(--text-muted)',
            padding: '3px 7px',
            fontSize: 12,
            cursor: 'pointer',
            flexShrink: 0,
            lineHeight: 1,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--accent)'
            e.currentTarget.style.color = 'var(--accent)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
        >
          {DOCK_ICONS[position]}
        </button>

        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 5,
            color: 'var(--text-muted)',
            padding: '3px 7px',
            fontSize: 11,
            cursor: 'pointer',
            flexShrink: 0,
            lineHeight: 1,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--danger)'
            e.currentTarget.style.color = 'var(--danger)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
        >
          ✕
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div style={{
          padding: '16px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
            API Key
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Stored in macOS Keychain via Electron safeStorage. Never saved as plaintext.
          </div>

          {hasApiKey ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                flex: 1,
                fontSize: 12,
                color: 'var(--success)',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                sk-ant-•••••••••••••
              </div>
              <button
                onClick={async () => {
                  setApiKeyStatus('Testing connection...')
                  const result = await window.nimbus.ai.test()
                  setApiKeyStatus(result.success
                    ? `Connected! (${result.model})`
                    : `Failed: ${result.error}`
                  )
                  setTimeout(() => setApiKeyStatus(null), 5000)
                }}
                style={{
                  fontSize: 10,
                  fontFamily: 'inherit',
                  background: 'rgba(106, 247, 160, 0.08)',
                  border: '1px solid rgba(106, 247, 160, 0.2)',
                  borderRadius: 4,
                  padding: '4px 10px',
                  color: 'var(--success)',
                  cursor: 'pointer',
                }}
              >
                Test
              </button>
              <button
                onClick={handleDeleteKey}
                style={{
                  fontSize: 10,
                  fontFamily: 'inherit',
                  background: 'rgba(247, 106, 106, 0.08)',
                  border: '1px solid rgba(247, 106, 106, 0.2)',
                  borderRadius: 4,
                  padding: '4px 10px',
                  color: 'var(--danger)',
                  cursor: 'pointer',
                }}
              >
                Remove
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="password"
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleStoreKey() }}
                placeholder="sk-ant-..."
                style={{
                  flex: 1,
                  background: '#12122a',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '6px 10px',
                  color: 'var(--text-primary)',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12,
                  outline: 'none',
                }}
              />
              <button
                onClick={handleStoreKey}
                style={{
                  fontSize: 11,
                  fontFamily: 'inherit',
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 14px',
                  color: '#0f0f1a',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Save
              </button>
            </div>
          )}

          {apiKeyStatus && (
            <div style={{
              fontSize: 10,
              color: apiKeyStatus.includes('Failed') ? 'var(--danger)' : 'var(--success)',
            }}>
              {apiKeyStatus}
            </div>
          )}
        </div>
      )}

      {/* Messages area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0 14px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        ...(isHorizontal
          ? { maxHeight: 'calc(50vh - 100px)' }
          : {}),
      }}>
        {messages.length === 0 && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: '24px 16px',
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 11, lineHeight: 1.6 }}>
              Ask questions, get commands, debug errors.
              <br />
              Nimbus AI can see your terminal output.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {['Explain last error', 'Find large files', 'Git undo last commit', 'Show disk usage'].map(q => (
                <button
                  key={q}
                  onClick={() => { setInput(q); inputRef.current?.focus() }}
                  style={{
                    fontSize: 10,
                    fontFamily: 'inherit',
                    background: '#12122a',
                    border: '1px solid var(--border)',
                    borderRadius: 20,
                    padding: '4px 12px',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--accent)'
                    e.currentTarget.style.color = 'var(--accent)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.color = 'var(--text-secondary)'
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            {/* Avatar */}
            <div style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 600,
              flexShrink: 0,
              marginTop: 2,
              background: msg.role === 'user' ? '#1a1a2e' : 'rgba(124, 106, 247, 0.15)',
              color: msg.role === 'user' ? 'var(--success)' : 'var(--accent)',
            }}>
              {msg.role === 'user' ? 'K' : 'N'}
            </div>

            {/* Bubble */}
            <div style={{
              fontSize: 12,
              lineHeight: 1.6,
              color: msg.role === 'user' ? 'var(--text-primary)' : '#c8c6e0',
              fontFamily: "'JetBrains Mono', 'MapleMono NF', monospace",
              ...(msg.role === 'assistant' ? {
                background: 'rgba(124, 106, 247, 0.04)',
                border: '1px solid rgba(124, 106, 247, 0.1)',
                borderRadius: 8,
                padding: '8px 12px',
              } : {}),
            }}>
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Status bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 14px',
        borderTop: '1px solid var(--border)',
        fontSize: 10,
        color: 'var(--text-muted)',
        flexShrink: 0,
        fontFamily: "'JetBrains Mono', 'MapleMono NF', monospace",
      }}>
        <span>
          <Kbd>Enter</Kbd> send
          {' · '}
          <Kbd>Esc</Kbd> close
          {' · '}
          <Kbd>Cmd+J</Kbd> toggle
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: isStreaming ? 'var(--accent)' : (hasApiKey ? 'var(--success)' : 'var(--danger)'),
            boxShadow: `0 0 4px ${isStreaming ? 'var(--accent)' : (hasApiKey ? 'var(--success)' : 'var(--danger)')}`,
            display: 'inline-block',
          }} />
          {isStreaming
            ? `streaming · ${elapsed}s`
            : (hasApiKey
              ? MODELS.find(m => m.id === selectedModel)?.label ?? 'Sonnet 4'
              : 'no key'
            )
          }
        </span>
      </div>
    </motion.div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      background: '#1a1a2e',
      border: '1px solid var(--border)',
      borderRadius: 3,
      padding: '1px 5px',
      fontFamily: 'inherit',
      fontSize: 10,
    }}>
      {children}
    </span>
  )
}
