import type { SplitNode, SplitDirection } from '../types/splitTree'

/** Count the number of leaf panes in a subtree. */
function countLeaves(node: SplitNode): number {
  if (node.type === 'leaf') return 1
  return countLeaves(node.first) + countLeaves(node.second)
}

/**
 * Recalculate every branch's ratio so all leaf panes occupy equal area.
 * Called after every split so new panes don't get squeezed into a corner.
 */
function equalizeRatios(node: SplitNode): SplitNode {
  if (node.type === 'leaf') return node
  const n1 = countLeaves(node.first)
  const n2 = countLeaves(node.second)
  return {
    ...node,
    ratio: n1 / (n1 + n2),
    first: equalizeRatios(node.first),
    second: equalizeRatios(node.second),
  }
}

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

  // Equalize all branch ratios so every pane gets equal screen space
  return { root: equalizeRatios(walk(root)), newPaneId }
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
