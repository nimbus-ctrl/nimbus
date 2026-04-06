export type SplitDirection = 'horizontal' | 'vertical'

export interface SplitLeaf {
  type: 'leaf'
  id: string // unique pane ID, doubles as PTY ID
}

export interface SplitBranch {
  type: 'split'
  id: string // unique branch ID (for resize targeting)
  direction: SplitDirection // 'vertical' = side-by-side, 'horizontal' = top/bottom
  ratio: number // 0–1, first child's share
  first: SplitNode
  second: SplitNode
}

export type SplitNode = SplitLeaf | SplitBranch
