import type { SplitNode, SplitDirection } from '../types/splitTree'

export interface PaneLayout {
  paneId: string
  left: number   // 0–1 fraction of container
  top: number
  width: number
  height: number
}

export interface HandleLayout {
  branchId: string
  direction: SplitDirection
  // Handle position (fraction of container)
  left: number
  top: number
  // The parent branch's area (for computing ratio from mouse position)
  areaLeft: number
  areaTop: number
  areaWidth: number
  areaHeight: number
}

interface Rect { left: number; top: number; width: number; height: number }

export function computePaneLayouts(
  node: SplitNode,
  rect: Rect = { left: 0, top: 0, width: 1, height: 1 },
): PaneLayout[] {
  if (node.type === 'leaf') {
    return [{ paneId: node.id, ...rect }]
  }

  const { left, top, width, height } = rect

  if (node.direction === 'vertical') {
    const w1 = width * node.ratio
    const w2 = width - w1
    return [
      ...computePaneLayouts(node.first, { left, top, width: w1, height }),
      ...computePaneLayouts(node.second, { left: left + w1, top, width: w2, height }),
    ]
  } else {
    const h1 = height * node.ratio
    const h2 = height - h1
    return [
      ...computePaneLayouts(node.first, { left, top, width, height: h1 }),
      ...computePaneLayouts(node.second, { left, top: top + h1, width, height: h2 }),
    ]
  }
}

export function computeHandleLayouts(
  node: SplitNode,
  rect: Rect = { left: 0, top: 0, width: 1, height: 1 },
): HandleLayout[] {
  if (node.type === 'leaf') return []

  const { left, top, width, height } = rect
  const handles: HandleLayout[] = []

  if (node.direction === 'vertical') {
    const w1 = width * node.ratio
    const w2 = width - w1

    handles.push({
      branchId: node.id,
      direction: 'vertical',
      left: left + w1,
      top,
      areaLeft: left,
      areaTop: top,
      areaWidth: width,
      areaHeight: height,
    })

    handles.push(
      ...computeHandleLayouts(node.first, { left, top, width: w1, height }),
      ...computeHandleLayouts(node.second, { left: left + w1, top, width: w2, height }),
    )
  } else {
    const h1 = height * node.ratio
    const h2 = height - h1

    handles.push({
      branchId: node.id,
      direction: 'horizontal',
      left,
      top: top + h1,
      areaLeft: left,
      areaTop: top,
      areaWidth: width,
      areaHeight: height,
    })

    handles.push(
      ...computeHandleLayouts(node.first, { left, top, width, height: h1 }),
      ...computeHandleLayouts(node.second, { left, top: top + h1, width, height: h2 }),
    )
  }

  return handles
}
