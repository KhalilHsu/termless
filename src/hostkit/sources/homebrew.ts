import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { command, expectSuccess, findExecutable } from '../exec.ts'
import type { ItemDraft, PackageSource } from '../types.ts'

export const HOMEBREW_CANDIDATES = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew']

export function findHomebrew(): string | null {
  return findExecutable(HOMEBREW_CANDIDATES)
}

interface FormulaJson {
  name: string
  desc: string | null
  homepage: string | null
  tap: string | null
  dependencies: string[]
  versions: { stable: string | null }
  linked_keg: string | null
  installed: { version: string; installed_on_request: boolean }[]
}

type Artifact = Record<string, unknown> & { target?: string }

interface CaskJson {
  token: string
  name: string[]
  desc: string | null
  homepage: string | null
  tap: string | null
  version: string
  installed: string | null
  depends_on: { formula?: string[]; cask?: string[] } | null
  artifacts?: Artifact[]
}

interface OutdatedJson {
  formulae: { name: string; current_version: string }[]
  casks: { name: string; current_version: string }[]
}

/** Homebrew formulae (command-line tools) and casks (apps). */
export const homebrew: PackageSource = {
  id: 'homebrew',
  label: 'Homebrew',

  async detect(ctx) {
    const path = findHomebrew()
    if (!path) return null
    const out = expectSuccess(await ctx.exec(path, ['--version'], { env: ctx.env, timeoutMs: 20_000 }), path)
    return { path, version: out.split('\n')[0].replace(/^Homebrew\s+/, '').trim() || null }
  },

  async list(ctx, probe) {
    const [info, outdated] = await Promise.all([
      ctx.exec(probe.path, ['info', '--json=v2', '--installed'], { env: ctx.env, timeoutMs: 120_000 }),
      ctx.checkUpdates
        ? ctx.exec(probe.path, ['outdated', '--json=v2'], { env: ctx.env, timeoutMs: 120_000 })
        : Promise.resolve(null)
    ])
    const parsed = JSON.parse(expectSuccess(info, probe.path)) as { formulae: FormulaJson[]; casks: CaskJson[] }
    // `brew outdated` exits 1 when something is outdated.
    const outdatedJson: OutdatedJson = outdated?.stdout.trim() ? JSON.parse(outdated.stdout) : { formulae: [], casks: [] }
    return parseHomebrew(parsed, outdatedJson, homebrewPrefix(probe.path))
  },

  installCommand: (name, probe) => command([probe.path, 'install', name]),
  // Homebrew can't install an older version on request; this installs the current one.
  reinstallCommand: (item, probe) =>
    command(item.extra.type === 'cask' ? [probe.path, 'install', '--cask', item.name] : [probe.path, 'install', item.name]),
  upgradeCommand: (item, probe) =>
    command(item.extra.type === 'cask' ? [probe.path, 'upgrade', '--cask', item.name] : [probe.path, 'upgrade', item.name]),
  uninstallCommand: (item, probe) =>
    command(item.extra.type === 'cask' ? [probe.path, 'uninstall', '--cask', item.name] : [probe.path, 'uninstall', item.name])
}

/** /opt/homebrew/bin/brew → /opt/homebrew */
export function homebrewPrefix(brewPath: string): string {
  return dirname(dirname(brewPath))
}

export function parseHomebrew(
  info: { formulae: FormulaJson[]; casks: CaskJson[] },
  outdated: OutdatedJson,
  prefix: string
): ItemDraft[] {
  const outdatedFormulae = new Map(outdated.formulae.map((f) => [f.name, f.current_version]))
  const outdatedCasks = new Map(outdated.casks.map((c) => [c.name, c.current_version]))
  const drafts: ItemDraft[] = []

  for (const f of info.formulae) {
    const keg = f.installed.find((k) => k.version === f.linked_keg) ?? f.installed[f.installed.length - 1]
    drafts.push({
      name: f.name,
      kind: 'cli',
      version: keg?.version ?? null,
      latestVersion: outdatedFormulae.get(f.name) ?? f.versions.stable,
      outdated: outdatedFormulae.has(f.name),
      description: f.desc,
      homepage: f.homepage,
      location: join(prefix, 'Cellar', f.name),
      executables: listDir(join(prefix, 'opt', f.name, 'bin')),
      dependencies: f.dependencies,
      installedOnRequest: keg?.installed_on_request ?? true,
      extra: { type: 'formula', ...(f.tap ? { tap: f.tap } : {}) }
    })
  }

  for (const c of info.casks) {
    const artifacts = c.artifacts ?? []
    const apps = artifacts.filter((a) => 'app' in a && typeof a.target === 'string').map((a) => a.target as string)
    const binaries = artifacts.filter((a) => 'binary' in a && typeof a.target === 'string').map((a) => a.target as string)
    drafts.push({
      name: c.token,
      displayName: c.name[0] ?? c.token,
      kind: apps.length ? 'app' : binaries.length ? 'cli' : 'other',
      version: c.installed,
      latestVersion: outdatedCasks.get(c.token) ?? c.version,
      outdated: outdatedCasks.has(c.token),
      description: c.desc,
      homepage: c.homepage,
      location: apps[0] ?? join(prefix, 'Caskroom', c.token),
      executables: binaries.map((b) => b.split('/').pop()!),
      dependencies: [...(c.depends_on?.formula ?? []), ...(c.depends_on?.cask ?? [])],
      extra: { type: 'cask', ...(c.tap ? { tap: c.tap } : {}) },
      claims: apps
    })
  }
  return drafts
}

function listDir(dir: string): string[] {
  try {
    return readdirSync(dir).filter((name) => !name.startsWith('.'))
  } catch {
    return []
  }
}
