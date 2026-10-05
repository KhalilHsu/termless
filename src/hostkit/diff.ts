import type { InstalledItem, Inventory } from './types.ts'

// What changed between two inventories: the basis for "what did that
// command install / remove / update?" and for undoing it.

export interface InventoryDiff {
  added: InstalledItem[]
  removed: InstalledItem[]
  updated: { before: InstalledItem; after: InstalledItem }[]
}

/**
 * Compares two inventories by item id. Sources that failed to load in
 * either one are left out, so a flaky source never looks like everything was
 * removed.
 */
export function diffInventories(before: Inventory, after: Inventory): InventoryDiff {
  const usable = (inv: Inventory) => new Set(inv.sources.filter((s) => s.status === 'ok').map((s) => s.id))
  const okBefore = usable(before)
  const okAfter = usable(after)
  const comparable = (item: InstalledItem) => okBefore.has(item.source) && okAfter.has(item.source)

  const beforeById = new Map(before.items.filter(comparable).map((i) => [i.id, i]))
  const afterById = new Map(after.items.filter(comparable).map((i) => [i.id, i]))

  const added = [...afterById.values()].filter((i) => !beforeById.has(i.id))
  const removed = [...beforeById.values()].filter((i) => !afterById.has(i.id))
  const updated = [...afterById.values()]
    .filter((i) => beforeById.has(i.id) && beforeById.get(i.id)!.version !== i.version)
    .map((after) => ({ before: beforeById.get(after.id)!, after }))
  return { added, removed, updated }
}

export function isEmptyDiff(diff: InventoryDiff): boolean {
  return diff.added.length === 0 && diff.removed.length === 0 && diff.updated.length === 0
}
