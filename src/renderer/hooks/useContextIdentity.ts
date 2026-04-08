import { useState, useEffect, useRef, useCallback } from 'react'
import { getPaneCwd, subscribeCwd } from '../components/Terminal'

export interface ContextIdentity {
  cwd: string
  shortCwd: string    // ~/Dev/nimbus style
  branch: string | null
  branchLoading: boolean
}

const DEBOUNCE_MS = 400

/** Shorten a path: replace home dir with ~, keep last 3 segments max */
function shortenPath(p: string): string {
  if (!p) return ''
  const home = '~'  // we can't know the real home in renderer, but shell sends ~ already
  // If starts with /Users/... or /home/..., truncate to last 3 segments
  const parts = p.split('/').filter(Boolean)
  if (parts.length <= 3) return '/' + parts.join('/')
  return '…/' + parts.slice(-3).join('/')
}

// Cache branches by directory to avoid redundant git calls
const branchCache = new Map<string, { branch: string | null; ts: number }>()
const CACHE_TTL = 10_000 // 10s

async function fetchBranch(cwd: string): Promise<string | null> {
  const cached = branchCache.get(cwd)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.branch

  try {
    const result = await window.nimbus.context.gitBranch(cwd)
    branchCache.set(cwd, { branch: result.branch, ts: Date.now() })
    return result.branch
  } catch {
    return null
  }
}

export function useContextIdentity(activePaneId: string): ContextIdentity {
  const [cwd, setCwd] = useState(() => getPaneCwd(activePaneId) ?? '')
  const [branch, setBranch] = useState<string | null>(null)
  const [branchLoading, setBranchLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadBranch = useCallback((dir: string) => {
    if (!dir) { setBranch(null); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setBranchLoading(true)
      const b = await fetchBranch(dir)
      setBranch(b)
      setBranchLoading(false)
    }, DEBOUNCE_MS)
  }, [])

  // When active pane changes: read current CWD immediately, then fetch branch
  useEffect(() => {
    const initial = getPaneCwd(activePaneId) ?? ''
    setCwd(initial)
    loadBranch(initial)

    // Subscribe to future CWD changes from this pane
    const unsub = subscribeCwd(activePaneId, (newCwd: string) => {
      setCwd(newCwd)
      loadBranch(newCwd)
    })
    return () => {
      unsub()
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [activePaneId, loadBranch])

  const shortCwd = cwd.startsWith(window.__nimbusHome ?? '') && window.__nimbusHome
    ? '~' + cwd.slice(window.__nimbusHome.length)
    : shortenPath(cwd)

  return { cwd, shortCwd: shortCwd || cwd, branch, branchLoading }
}

// Augment window for the home dir hint (set by App.tsx on first CWD update)
declare global {
  interface Window {
    __nimbusHome?: string
  }
}
