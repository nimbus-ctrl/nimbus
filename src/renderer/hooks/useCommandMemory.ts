import { useState, useEffect, useCallback, useRef } from 'react'
import type { MemoryCommand, CommandUsageRecord, SuggestionContext } from '../types/commandMemory'
import {
  loadMemoryCommands,
  saveMemoryCommands,
  appendUsageRecord,
  migrateFromSidebar,
  filterCommandsByScope,
  getSuggestedCommands,
  sortCommands,
  detectProjectRoot,
} from '../utils/commandMemory'

export interface UseCommandMemoryReturn {
  // Commands
  commands: MemoryCommand[]
  visibleCommands: MemoryCommand[]
  suggestions: string[]
  context: SuggestionContext

  // Mutations
  addCommand: (cmd: Omit<MemoryCommand, 'id' | 'createdAt' | 'updatedAt' | 'useCount'>) => MemoryCommand
  updateCommand: (id: string, patch: Partial<MemoryCommand>) => void
  deleteCommand: (id: string) => void
  togglePin: (id: string) => void
  recordUsage: (command: string, cwd: string) => void
}

export function useCommandMemory(
  activeCwd: string,
  activeWorkspaceId: string,
): UseCommandMemoryReturn {
  const [commands, setCommands] = useState<MemoryCommand[]>(() => {
    migrateFromSidebar()
    return loadMemoryCommands()
  })

  const [projectRoot, setProjectRoot] = useState<string | null>(null)
  const lastCwd = useRef<string>('')

  // Detect project root when CWD changes
  useEffect(() => {
    if (!activeCwd || activeCwd === lastCwd.current) return
    lastCwd.current = activeCwd
    detectProjectRoot(activeCwd).then(setProjectRoot)
  }, [activeCwd])

  const context: SuggestionContext = {
    workspaceId: activeWorkspaceId,
    projectRoot,
  }

  const visibleCommands = sortCommands(filterCommandsByScope(commands, context))

  const suggestions = getSuggestedCommands(context, commands)

  // Persist whenever commands change
  useEffect(() => {
    saveMemoryCommands(commands)
  }, [commands])

  const addCommand = useCallback(
    (cmd: Omit<MemoryCommand, 'id' | 'createdAt' | 'updatedAt' | 'useCount'>): MemoryCommand => {
      const now = Date.now()
      const newCmd: MemoryCommand = {
        ...cmd,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        useCount: 0,
      }
      setCommands(prev => [...prev, newCmd])
      return newCmd
    },
    [],
  )

  const updateCommand = useCallback((id: string, patch: Partial<MemoryCommand>) => {
    setCommands(prev =>
      prev.map(c => (c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c)),
    )
  }, [])

  const deleteCommand = useCallback((id: string) => {
    setCommands(prev => prev.filter(c => c.id !== id))
  }, [])

  const togglePin = useCallback((id: string) => {
    setCommands(prev =>
      prev.map(c =>
        c.id === id ? { ...c, pinned: !c.pinned, updatedAt: Date.now() } : c,
      ),
    )
  }, [])

  const recordUsage = useCallback(
    (command: string, cwd: string) => {
      const record: CommandUsageRecord = {
        command,
        cwd,
        workspaceId: activeWorkspaceId,
        timestamp: Date.now(),
      }
      appendUsageRecord(record)

      // If this command is saved, bump its useCount + lastUsedAt
      setCommands(prev => {
        const idx = prev.findIndex(c => c.command === command)
        if (idx === -1) return prev
        const updated = [...prev]
        updated[idx] = {
          ...updated[idx],
          useCount: updated[idx].useCount + 1,
          lastUsedAt: Date.now(),
          updatedAt: Date.now(),
        }
        return updated
      })
    },
    [activeWorkspaceId],
  )

  return {
    commands,
    visibleCommands,
    suggestions,
    context,
    addCommand,
    updateCommand,
    deleteCommand,
    togglePin,
    recordUsage,
  }
}
