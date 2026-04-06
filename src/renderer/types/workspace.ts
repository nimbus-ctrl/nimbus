import type { Tab } from '../App'

export interface Workspace {
  id: string
  name: string
  tabs: Tab[]
  activeTabId: string
  createdAt: Date
}
