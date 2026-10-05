import { defaultSources, loadInventory, measureSize } from '../hostkit'
import type { Inventory } from '../shared/types'

// What is installed on this Mac, shared by the Installed tab and the agent's
// tools. Loading runs every package manager, so results are cached briefly.

const TTL_MS = 60_000

let cache: { at: number; value: Promise<Inventory> } | null = null

export function getInventory(fresh = false): Promise<Inventory> {
  if (fresh || !cache || Date.now() - cache.at > TTL_MS) {
    cache = { at: Date.now(), value: loadInventory({ sources: defaultSources() }) }
  }
  return cache.value
}

export function invalidateInventory(): void {
  cache = null
}

/**
 * Where an item from the last inventory lives on disk. The UI only ever
 * passes ids, so it can't make Termless touch arbitrary paths.
 */
export async function getItemLocation(id: string): Promise<string | null> {
  const inventory = await (cache?.value ?? getInventory())
  return inventory.items.find((i) => i.id === id)?.location ?? null
}

export async function getItemSize(id: string): Promise<number | null> {
  const location = await getItemLocation(id)
  return location ? measureSize(location) : null
}
