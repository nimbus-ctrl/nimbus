import type { Tab } from '../App'

export type EnvLabel = 'local' | 'dev' | 'staging' | 'prod'

export interface Workspace {
  id: string
  name: string
  tabs: Tab[]
  activeTabId: string
  createdAt: Date
  envLabel?: EnvLabel
}
