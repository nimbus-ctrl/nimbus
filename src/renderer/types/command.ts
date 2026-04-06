export type CommandCategory = 'Workspace' | 'Tab' | 'Pane' | 'UI' | 'Terminal'

export interface Command {
  id: string
  label: string
  category: CommandCategory
  shortcut?: string
  keywords?: string[]
  execute: () => void
  when?: () => boolean
}
