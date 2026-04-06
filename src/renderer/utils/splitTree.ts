import type { SplitNode, SplitDirection } from '../types/splitTree'

/** Split a leaf pane into two. Returns the new tree and the new pane's ID. */
export function splitPane(
  root: SplitNode,
  paneId: string,
  direction: SplitDirection,
): { root: SplitNode; newPaneId: string } {
  const newPaneId = crypto.randomUUID()

  function walk(node: SplitNode): SplitNode {
    if (node.type === 'leaf') {
      if (node.id === paneId) {
        return {
          type: 'split',
          id: crypto.randomUUID(),
          direction,
          ratio: 0.5,
          first: node,
          second: { type: 'leaf', id: newPaneId },
        }
      }
      return node
    }
    return {
      ...node,
      first: walk(node.first),
      second: walk(node.second),
    }
  }

  return { root: walk(root), newPaneId }
}

/** Remove a pane. Returns null if the tree is now empty. */
export function removePane(root: SplitNode, paneId: string): SplitNode | null {
  if (root.type === 'leaf') {
    return root.id === paneId ? null : root
  }

  // If either child is the target leaf, promote the sibling
  if (root.first.type === 'leaf' && root.first.id === paneId) return root.second
  if (root.second.type === 'leaf' && root.second.id === paneId) return root.first

  // Recurse
  const newFirst = removePane(root.first, paneId)
  const newSecond = removePane(root.second, paneId)

  if (newFirst === null) return newSecond
  if (newSecond === null) return newFirst

  return { ...root, first: newFirst, second: newSecond }
}

/** Collect all leaf pane IDs in the tree. */
export function findAllPaneIds(root: SplitNode): string[] {
  if (root.type === 'leaf') return [root.id]
  return [...findAllPaneIds(root.first), ...findAllPaneIds(root.second)]
}

/** Update the ratio of a specific branch by its branch ID. */
export function setRatioAtBranch(
  root: SplitNode,
  branchId: string,
  ratio: number,
): SplitNode {
  const clamped = Math.max(0.15, Math.min(0.85, ratio))

  if (root.type === 'leaf') return root

  if (root.id === branchId) {
    return { ...root, ratio: clamped }
  }

  return {
    ...root,
    first: setRatioAtBranch(root.first, branchId, ratio),
    second: setRatioAtBranch(root.second, branchId, ratio),
  }
}
