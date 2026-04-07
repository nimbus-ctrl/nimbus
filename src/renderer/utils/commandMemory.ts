import type { MemoryCommand, CommandUsageRecord, SuggestionContext } from '../types/commandMemory'

// ─── Storage keys ─────────────────────────────────────────────────────────────

export const MEMORY_COMMANDS_KEY = 'nimbus:memory:commands'
export const MEMORY_USAGE_KEY = 'nimbus:memory:usage'
const OLD_SIDEBAR_COMMANDS_KEY = 'nimbus:sidebar:commands'
const MAX_USAGE_RECORDS = 2000

// ─── Persistence ─────────────────────────────────────────────────────────────

export function loadMemoryCommands(): MemoryCommand[] {
  try {
    const raw = localStorage.getItem(MEMORY_COMMANDS_KEY)
    return raw ? (JSON.parse(raw) as MemoryCommand[]) : []
  } catch {
    return []
  }
}

export function saveMemoryCommands(commands: MemoryCommand[]): void {
  try {
    localStorage.setItem(MEMORY_COMMANDS_KEY, JSON.stringify(commands))
  } catch { /* storage quota exceeded */ }
}

export function loadUsageRecords(): CommandUsageRecord[] {
  try {
    const raw = localStorage.getItem(MEMORY_USAGE_KEY)
    return raw ? (JSON.parse(raw) as CommandUsageRecord[]) : []
  } catch {
    return []
  }
}

export function appendUsageRecord(record: CommandUsageRecord): void {
  try {
    const existing = loadUsageRecords()
    const next = [record, ...existing].slice(0, MAX_USAGE_RECORDS)
    localStorage.setItem(MEMORY_USAGE_KEY, JSON.stringify(next))
  } catch { /* quota exceeded, silently skip */ }
}

// ─── One-time migration from old sidebar commands ─────────────────────────────

export function migrateFromSidebar(): void {
  try {
    const raw = localStorage.getItem(OLD_SIDEBAR_COMMANDS_KEY)
    if (!raw) return

    const oldCmds = JSON.parse(raw) as Array<{
      id: string; command: string; description: string; createdAt: string
    }>
    if (!Array.isArray(oldCmds) || oldCmds.length === 0) return

    const existing = loadMemoryCommands()
    const existingSet = new Set(existing.map(c => c.command))

    const migrated: MemoryCommand[] = oldCmds
      .filter(c => c.command && !existingSet.has(c.command))
      .map(c => ({
        id: c.id ?? crypto.randomUUID(),
        title: c.description?.trim() || c.command.slice(0, 50),
        command: c.command,
        note: '',
        tags: [],
        scope: 'global',
        pinned: false,
        createdAt: new Date(c.createdAt).getTime() || Date.now(),
        updatedAt: Date.now(),
        useCount: 0,
      }))

    if (migrated.length > 0) {
      saveMemoryCommands([...existing, ...migrated])
    }
    localStorage.removeItem(OLD_SIDEBAR_COMMANDS_KEY)
  } catch { /* ignore migration errors */ }
}

// ─── Scope filtering ──────────────────────────────────────────────────────────

export function filterCommandsByScope(
  commands: MemoryCommand[],
  context: SuggestionContext,
): MemoryCommand[] {
  return commands.filter(cmd => {
    if (cmd.scope === 'global') return true
    if (cmd.scope === 'workspace') return cmd.scopeId === context.workspaceId
    if (cmd.scope === 'project') {
      if (!context.projectRoot) return false
      return cmd.scopeId === context.projectRoot
    }
    return false
  })
}

// ─── Suggestion scoring ───────────────────────────────────────────────────────
// Pure local heuristics: recency × frequency × context relevance.

export function getSuggestedCommands(
  context: SuggestionContext,
  savedCommands: MemoryCommand[],
  limit = 8,
): string[] {
  const usage = loadUsageRecords()
  if (usage.length === 0) return []

  const savedSet = new Set(savedCommands.map(c => c.command))
  const now = Date.now()
  const scores = new Map<string, number>()

  for (const record of usage) {
    // Skip internal/trivial commands
    if (!record.command || record.command.length < 2) continue
    if (/^(ls|cd|pwd|exit|clear|history)$/.test(record.command.trim())) continue

    const inWorkspace = record.workspaceId === context.workspaceId
    const inProject =
      context.projectRoot != null &&
      record.cwd.startsWith(context.projectRoot)

    // Only suggest commands from this workspace or this project.
    // Cross-workspace records are not relevant suggestions.
    if (!inWorkspace && !inProject) continue

    // Context multiplier: project > workspace
    const contextMult = inProject ? 2.5 : 1.5

    // Recency: exponential decay — half-life of ~3 days
    const hoursSince = (now - record.timestamp) / 3_600_000
    const recency = Math.exp(-hoursSince / 72)

    scores.set(
      record.command,
      (scores.get(record.command) ?? 0) + contextMult * (0.4 + 0.6 * recency),
    )
  }

  return Array.from(scores.entries())
    .filter(([cmd]) => !savedSet.has(cmd))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([cmd]) => cmd)
}

// ─── Project root detection (cached) ─────────────────────────────────────────

const projectRootCache = new Map<string, string | null>()

export async function detectProjectRoot(cwd: string): Promise<string | null> {
  if (!cwd || cwd === '~') return null
  if (projectRootCache.has(cwd)) return projectRootCache.get(cwd)!

  try {
    const result = await window.nimbus.project.detectRoot(cwd)
    projectRootCache.set(cwd, result.root)
    return result.root
  } catch {
    projectRootCache.set(cwd, null)
    return null
  }
}

// ─── Sort helpers ─────────────────────────────────────────────────────────────

export function sortCommands(commands: MemoryCommand[]): MemoryCommand[] {
  return [...commands].sort((a, b) => {
    // Pinned always first
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    // Then by last used (most recent first)
    const aUsed = a.lastUsedAt ?? a.createdAt
    const bUsed = b.lastUsedAt ?? b.createdAt
    return bUsed - aUsed
  })
}
