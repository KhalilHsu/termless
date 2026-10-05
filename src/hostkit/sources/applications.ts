import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { hostPath } from '../environment.ts'
import { command, which } from '../exec.ts'
import type { CommandSpec, Exec, ItemDraft, PackageSource, SourceContext } from '../types.ts'

// Apps in /Applications and ~/Applications. App Store apps (they carry an
// App Store receipt) are their own source, so people can tell where an app
// came from and how it gets updated. Apps a Homebrew cask installed are
// claimed by Homebrew and dropped here (see inventory.ts).

interface AppBundle {
  path: string
  fromAppStore: boolean
}

interface InfoPlist {
  CFBundleName?: string
  CFBundleDisplayName?: string
  CFBundleShortVersionString?: string
  CFBundleVersion?: string
  CFBundleIdentifier?: string
  LSApplicationCategoryType?: string
}

const PLUTIL = '/usr/bin/plutil'
const MDLS = '/usr/bin/mdls'
const OSASCRIPT = '/usr/bin/osascript'
const BROWSER_WEB_APP_PREFIXES = ['com.google.Chrome.app.', 'com.microsoft.edgemac.app.', 'com.brave.Browser.app.']

export function applicationFolders(home: string): string[] {
  return ['/Applications', join(home, 'Applications')]
}

/** .app bundles in the folders, plus one level of sub-folders (e.g. /Applications/Utilities). */
export function findAppBundles(folders: string[]): AppBundle[] {
  const bundles: AppBundle[] = []
  const visit = (dir: string, depth: number) => {
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      return
    }
    for (const name of names) {
      if (name.startsWith('.')) continue
      const path = join(dir, name)
      if (name.endsWith('.app')) {
        bundles.push({ path, fromAppStore: existsSync(join(path, 'Contents', '_MASReceipt', 'receipt')) })
      } else if (depth === 0 && isDirectory(path)) {
        visit(path, 1)
      }
    }
  }
  for (const folder of folders) visit(folder, 0)
  return bundles
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

async function readInfo(exec: Exec, appPath: string): Promise<InfoPlist | null> {
  const result = await exec(PLUTIL, ['-convert', 'json', '-o', '-', join(appPath, 'Contents', 'Info.plist')], { timeoutMs: 10_000 })
  if (result.code !== 0) return null
  try {
    return JSON.parse(result.stdout) as InfoPlist
  } catch {
    return null
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export function appDraft(bundle: AppBundle, info: InfoPlist | null): ItemDraft | null {
  const id = info?.CFBundleIdentifier ?? ''
  // Apple's own apps that come with macOS can't be removed or updated on their own.
  if (id.startsWith('com.apple.') && !bundle.fromAppStore) return null
  // Web apps a browser created ("Install this site as an app") belong to that browser.
  if (BROWSER_WEB_APP_PREFIXES.some((prefix) => id.startsWith(prefix))) return null
  const fileName = bundle.path.split('/').pop()!.replace(/\.app$/, '')
  return {
    name: fileName,
    displayName: info?.CFBundleDisplayName || info?.CFBundleName || fileName,
    kind: 'app',
    version: info?.CFBundleShortVersionString || info?.CFBundleVersion || null,
    location: bundle.path,
    extra: {
      ...(id ? { bundleId: id } : {}),
      ...(info?.LSApplicationCategoryType ? { category: info.LSApplicationCategoryType.replace('public.app-category.', '') } : {})
    }
  }
}

async function listBundles(ctx: SourceContext, bundles: AppBundle[]): Promise<ItemDraft[]> {
  const drafts = await mapLimit(bundles, 8, async (bundle) => appDraft(bundle, await readInfo(ctx.exec, bundle.path)))
  return drafts.filter((d): d is ItemDraft => d !== null)
}

/** Moves the app to the Trash through Finder, so it can be put back. */
function moveToTrash(path: string): CommandSpec {
  return command([OSASCRIPT, '-e', `tell application "Finder" to delete POSIX file "${path.replace(/(["\\])/g, '\\$1')}"`])
}

export const applications: PackageSource = {
  id: 'apps',
  label: 'Applications',

  async detect() {
    return { path: '/Applications', version: null }
  },

  async list(ctx) {
    return listBundles(ctx, findAppBundles(applicationFolders(ctx.home)).filter((b) => !b.fromAppStore))
  },

  // Most apps update themselves; there is no common command for it.
  upgradeCommand: () => null,
  uninstallCommand: (item) => (item.location ? moveToTrash(item.location) : null)
}

// --- App Store ----------------------------------------------------------------

export const appStore: PackageSource = {
  id: 'appstore',
  label: 'App Store',

  async detect() {
    return { path: '/Applications', version: null }
  },

  async list(ctx) {
    const bundles = findAppBundles(applicationFolders(ctx.home)).filter((b) => b.fromAppStore)
    const drafts = await listBundles(ctx, bundles)
    if (drafts.length === 0) return drafts

    // The App Store id lets `mas` (an optional command-line App Store client) update an app.
    const ids = await ctx.exec(MDLS, ['-raw', '-name', 'kMDItemAppStoreAdamID', ...drafts.map((d) => d.location!)], { timeoutMs: 20_000 })
    if (ids.code === 0) {
      ids.stdout.split('\0').forEach((value, i) => {
        if (drafts[i] && /^\d+$/.test(value.trim())) drafts[i].extra = { ...drafts[i].extra, appStoreId: value.trim() }
      })
    }

    const mas = which('mas', ctx.env.PATH)
    if (mas && ctx.checkUpdates) {
      const outdated = await ctx.exec(mas, ['outdated'], { env: ctx.env, timeoutMs: 60_000 }).catch(() => null)
      const updates = parseMasOutdated(outdated?.code === 0 ? outdated.stdout : '')
      for (const draft of drafts) {
        const update = updates.find((u) => u.id === draft.extra?.appStoreId) ?? updates.find((u) => u.name === draft.displayName)
        if (update) {
          draft.latestVersion = update.latest
          draft.outdated = true
        }
      }
    }
    return drafts
  },

  upgradeCommand: (item) => {
    const mas = which('mas', hostPath())
    if (mas && item.extra.appStoreId) return command([mas, 'upgrade', item.extra.appStoreId])
    return command(['/usr/bin/open', 'macappstore://showUpdatesPage'])
  },
  uninstallCommand: (item) => (item.location ? moveToTrash(item.location) : null)
}

/** `mas outdated`: "497799835  Xcode  (15.3 -> 15.4)" */
export function parseMasOutdated(stdout: string): { id: string; name: string; latest: string }[] {
  const updates: { id: string; name: string; latest: string }[] = []
  for (const line of stdout.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(.+?)\s+\(\s*(.+?)\s*->\s*(.+?)\s*\)\s*$/)
    if (match) updates.push({ id: match[1], name: match[2], latest: match[4] })
  }
  return updates
}
