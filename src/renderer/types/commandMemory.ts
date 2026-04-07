export type CommandScope = 'global' | 'workspace' | 'project'

export interface MemoryCommand {
  id: string
  title: string
  command: string
  note: string
  tags: string[]
  scope: CommandScope
  scopeId?: string      // workspaceId for 'workspace', project root path for 'project'
  scopeLabel?: string   // human-readable: workspace name, repo directory name
  pinned: boolean
  createdAt: number
  updatedAt: number
  lastUsedAt?: number
  useCount: number
}

export interface CommandUsageRecord {
  command: string
  cwd: string
  workspaceId: string
  timestamp: number
}

export interface SuggestionContext {
  workspaceId: string
  projectRoot: string | null
}
