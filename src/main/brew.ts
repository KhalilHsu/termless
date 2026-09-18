import type { BrewInventory, InstalledPackage } from '../shared/types'
import { findExecutable, run, toolEnv } from './env'

const BREW_CANDIDATES = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew']

// Read-only queries must never trigger Homebrew's auto-update: it is slow and
// changes the user's machine without asking.
const READ_ONLY_ENV = toolEnv({ HOMEBREW_NO_AUTO_UPDATE: '1', HOMEBREW_NO_ENV_HINTS: '1' })

interface BrewFormulaJson {
  name: string
  desc: string | null
  homepage: string | null
  tap: string | null
  dependencies: string[]
  versions: { stable: string | null }
  linked_keg: string | null
  installed: { version: string; installed_on_request: boolean }[]
}

interface BrewCaskJson {
  token: string
  name: string[]
  desc: string | null
  homepage: string | null
  tap: string | null
  version: string
  installed: string | null
  depends_on: { formula?: string[]; cask?: string[] } | null
}

interface BrewOutdatedJson {
  formulae: { name: string; current_version: string }[]
  casks: { name: string; current_version: string }[]
}

export function findBrew(): string | null {
  return findExecutable(BREW_CANDIDATES)
}

export async function loadInventory(): Promise<BrewInventory> {
  const brew = findBrew()
  if (!brew) {
    return { ok: false, reason: 'not-installed', message: 'Homebrew is not installed.' }
  }

  try {
    const [versionOut, infoOut, outdatedOut] = await Promise.all([
      run(brew, ['--version'], { env: READ_ONLY_ENV }),
      run(brew, ['info', '--json=v2', '--installed'], { env: READ_ONLY_ENV, timeoutMs: 120_000 }),
      run(brew, ['outdated', '--json=v2'], { env: READ_ONLY_ENV, timeoutMs: 120_000 })
    ])

    const info = JSON.parse(infoOut) as { formulae: BrewFormulaJson[]; casks: BrewCaskJson[] }
    const outdated = JSON.parse(outdatedOut) as BrewOutdatedJson

    return {
      ok: true,
      brewPath: brew,
      brewVersion: versionOut.split('\n')[0].replace(/^Homebrew\s+/, '').trim(),
      packages: toPackages(info.formulae, info.casks, outdated),
      loadedAt: new Date().toISOString()
    }
  } catch (error) {
    return { ok: false, reason: 'failed', message: error instanceof Error ? error.message : String(error) }
  }
}

function toPackages(
  formulae: BrewFormulaJson[],
  casks: BrewCaskJson[],
  outdated: BrewOutdatedJson
): InstalledPackage[] {
  const outdatedFormulae = new Map(outdated.formulae.map((f) => [f.name, f.current_version]))
  const outdatedCasks = new Map(outdated.casks.map((c) => [c.name, c.current_version]))

  const packages: InstalledPackage[] = []

  for (const f of formulae) {
    const keg = f.installed.find((k) => k.version === f.linked_keg) ?? f.installed[f.installed.length - 1]
    packages.push({
      id: `formula:${f.name}`,
      kind: 'formula',
      name: f.name,
      displayName: f.name,
      description: f.desc,
      installedVersion: keg?.version ?? 'unknown',
      latestVersion: outdatedFormulae.get(f.name) ?? f.versions.stable,
      outdated: outdatedFormulae.has(f.name),
      tap: f.tap,
      homepage: f.homepage,
      dependencies: f.dependencies,
      dependents: [],
      installedOnRequest: keg?.installed_on_request ?? true
    })
  }

  for (const c of casks) {
    const dependencies = [...(c.depends_on?.formula ?? []), ...(c.depends_on?.cask ?? [])]
    packages.push({
      id: `cask:${c.token}`,
      kind: 'cask',
      name: c.token,
      displayName: c.name[0] ?? c.token,
      description: c.desc,
      installedVersion: c.installed ?? 'unknown',
      latestVersion: outdatedCasks.get(c.token) ?? c.version,
      outdated: outdatedCasks.has(c.token),
      tap: c.tap,
      homepage: c.homepage,
      dependencies,
      dependents: [],
      installedOnRequest: true
    })
  }

  // Reverse the dependency graph so each package knows who relies on it.
  const byName = new Map(packages.map((p) => [p.name, p]))
  for (const p of packages) {
    for (const dep of p.dependencies) {
      byName.get(dep)?.dependents.push(p.name)
    }
  }

  return packages.sort((a, b) => a.displayName.localeCompare(b.displayName, 'en', { sensitivity: 'base' }))
}
