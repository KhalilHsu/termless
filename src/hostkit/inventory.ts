import { homedir } from 'node:os'
import { readOnlyEnv } from './environment.ts'
import { execFileResult } from './exec.ts'
import type {
  Exec,
  InstalledItem,
  Inventory,
  ItemDraft,
  PackageSource,
  SourceContext,
  SourceProbe,
  SourceReport
} from './types.ts'

export interface LoadOptions {
  sources: PackageSource[]
  exec?: Exec
  env?: NodeJS.ProcessEnv
  home?: string
  /** Also check for newer versions (may use the network). Default true. */
  checkUpdates?: boolean
  /** Per source. A slow source is reported as an error; the rest still load. */
  timeoutMs?: number
}

/** Lists everything every source installed. Sources load in parallel and fail independently. */
export async function loadInventory(options: LoadOptions): Promise<Inventory> {
  const ctx: SourceContext = {
    exec: options.exec ?? execFileResult,
    env: options.env ?? readOnlyEnv(),
    home: options.home ?? homedir(),
    checkUpdates: options.checkUpdates ?? true
  }
  const timeoutMs = options.timeoutMs ?? 180_000

  const loaded = await Promise.all(options.sources.map((source) => loadSource(source, ctx, timeoutMs)))
  const items = removeDuplicates(loaded.flatMap((l) => l.items))

  const counts = new Map<string, number>()
  for (const item of items) counts.set(item.source, (counts.get(item.source) ?? 0) + 1)

  return {
    items: items.sort((a, b) => a.displayName.localeCompare(b.displayName, 'en', { sensitivity: 'base' })),
    sources: loaded.map((l) => ({ ...l.report, count: counts.get(l.report.id) ?? 0 })),
    loadedAt: new Date().toISOString()
  }
}

/** Loads a single source, e.g. to refresh it after a change. */
export async function loadSource(
  source: PackageSource,
  ctx: SourceContext,
  timeoutMs = 180_000
): Promise<{ report: SourceReport; items: InstalledItem[] }> {
  const started = Date.now()
  const report = (status: SourceReport['status'], probe: SourceProbe | null, error: string | null): SourceReport => ({
    id: source.id,
    label: source.label,
    status,
    version: probe?.version ?? null,
    path: probe?.path ?? null,
    count: 0,
    error,
    durationMs: Date.now() - started
  })

  let probe: SourceProbe | null = null
  try {
    probe = await withTimeout(source.detect(ctx), timeoutMs, `${source.label} did not answer in time`)
    if (!probe) return { report: report('missing', null, null), items: [] }
    const drafts = await withTimeout(source.list(ctx, probe), timeoutMs, `${source.label} did not answer in time`)
    const items = linkDependents(uniqueIds(drafts.map((d) => finishItem(source, probe!, d))))
    return { report: report('ok', probe, null), items }
  } catch (error) {
    return { report: report('error', probe, error instanceof Error ? error.message : String(error)), items: [] }
  }
}

function finishItem(source: PackageSource, probe: SourceProbe, draft: ItemDraft): InstalledItem {
  const item: InstalledItem = {
    id: `${source.id}:${draft.name}`,
    source: source.id,
    sourceLabel: source.label,
    name: draft.name,
    displayName: draft.displayName || draft.name,
    kind: draft.kind,
    version: draft.version,
    latestVersion: draft.latestVersion ?? null,
    outdated: draft.outdated ?? false,
    description: draft.description ?? null,
    homepage: draft.homepage ?? null,
    location: draft.location ?? null,
    executables: draft.executables ?? [],
    dependencies: draft.dependencies ?? [],
    dependents: [],
    installedOnRequest: draft.installedOnRequest ?? true,
    extra: draft.extra ?? {},
    commands: { upgrade: null, uninstall: null, install: null },
    claims: draft.claims ?? []
  }
  item.commands = {
    upgrade: source.upgradeCommand?.(item, probe) ?? null,
    uninstall: source.uninstallCommand?.(item, probe) ?? null,
    install: source.reinstallCommand?.(item, probe) ?? source.installCommand?.(item.name, probe) ?? null
  }
  return item
}

/** Two things with the same name (e.g. an app in /Applications and in ~/Applications) still get distinct ids. */
function uniqueIds(items: InstalledItem[]): InstalledItem[] {
  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item.id)) item.id = `${item.id}@${item.location ?? seen.size}`
    seen.add(item.id)
  }
  return items
}

/** Reverses each source's dependency lists so every item knows who relies on it. */
function linkDependents(items: InstalledItem[]): InstalledItem[] {
  const byName = new Map(items.map((i) => [i.name, i]))
  for (const item of items) {
    for (const dep of item.dependencies) byName.get(dep)?.dependents.push(item.name)
  }
  return items
}

/**
 * The same app can show up twice: as a Homebrew cask and as a bundle in
 * /Applications. The item that claims the path wins; it is the one that knows
 * how to update and remove it.
 */
function removeDuplicates(items: InstalledItem[]): InstalledItem[] {
  const claimed = new Set(items.flatMap((i) => i.claims))
  return items.filter((i) => !(i.location && claimed.has(i.location) && !i.claims.includes(i.location)))
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms)
    })
  ]).finally(() => clearTimeout(timer))
}

/** Finds an item by id, or by name across sources. */
export function findItem(inventory: Inventory, idOrName: string): InstalledItem | undefined {
  return inventory.items.find((i) => i.id === idOrName) ?? inventory.items.find((i) => i.name === idOrName)
}
