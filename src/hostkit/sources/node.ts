import { accessSync, constants, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { command, expectSuccess, which } from '../exec.ts'
import type { ItemDraft, PackageSource, SourceContext } from '../types.ts'

// Global JavaScript packages: `npm install -g` and `pnpm add -g`.

interface PackageJson {
  description?: string
  homepage?: string
  bin?: string | Record<string, string>
}

interface Outdated {
  [name: string]: { current?: string; latest?: string }
}

async function versionOf(ctx: SourceContext, path: string): Promise<string | null> {
  const out = expectSuccess(await ctx.exec(path, ['--version'], { env: ctx.env, timeoutMs: 20_000 }), path)
  return out.trim() || null
}

/** Reads `npm outdated --json`-style output. Exit code 1 just means "something is outdated". */
function parseOutdated(stdout: string): Outdated {
  if (!stdout.trim()) return {}
  try {
    const parsed = JSON.parse(stdout)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function nodePackageDraft(name: string, version: string | null, dir: string, outdated: Outdated): ItemDraft {
  let pkg: PackageJson = {}
  try {
    pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  } catch {
    // keep what the package manager told us
  }
  const executables = typeof pkg.bin === 'string' ? [name.split('/').pop()!] : Object.keys(pkg.bin ?? {})
  const latest = outdated[name]?.latest ?? null
  return {
    name,
    kind: executables.length ? 'cli' : 'other',
    version,
    latestVersion: latest,
    outdated: Boolean(latest && version && latest !== version),
    description: pkg.description ?? null,
    homepage: pkg.homepage ?? null,
    location: dir,
    executables
  }
}

function isWritable(dir: string): boolean {
  try {
    accessSync(dir, constants.W_OK)
    return true
  } catch {
    return false
  }
}

// --- npm ----------------------------------------------------------------------

/** Cached per probe path: the global folder (`npm root -g`). */
const npmRoots = new Map<string, string>()

export const npm: PackageSource = {
  id: 'npm',
  label: 'npm',

  async detect(ctx) {
    const path = which('npm', ctx.env.PATH)
    return path ? { path, version: await versionOf(ctx, path) } : null
  },

  async list(ctx, probe) {
    const [ls, root, outdated] = await Promise.all([
      ctx.exec(probe.path, ['ls', '--global', '--depth=0', '--json'], { env: ctx.env, timeoutMs: 60_000 }),
      ctx.exec(probe.path, ['root', '--global'], { env: ctx.env, timeoutMs: 20_000 }),
      ctx.checkUpdates ? ctx.exec(probe.path, ['outdated', '--global', '--json'], { env: ctx.env, timeoutMs: 90_000 }) : null
    ])
    const rootDir = expectSuccess(root, probe.path).trim()
    npmRoots.set(probe.path, rootDir)
    // `npm ls` exits 1 on problems such as missing peers but still prints the list.
    const tree = JSON.parse(ls.stdout || '{}') as { dependencies?: Record<string, { version?: string }> }
    const updates = parseOutdated(outdated?.stdout ?? '')
    return Object.entries(tree.dependencies ?? {}).map(([name, dep]) =>
      nodePackageDraft(name, dep.version ?? null, join(rootDir, name), updates)
    )
  },

  installCommand: (name, probe) => npmCommand(probe.path, ['install', '--global', name]),
  upgradeCommand: (item, probe) => npmCommand(probe.path, ['install', '--global', `${item.name}@latest`]),
  uninstallCommand: (item, probe) => npmCommand(probe.path, ['uninstall', '--global', item.name])
}

/** npm installed with the official Node installer keeps global packages in a folder only an administrator can write to. */
function npmCommand(npmPath: string, args: string[]) {
  const root = npmRoots.get(npmPath)
  return command([npmPath, ...args], { needsAdmin: root ? !isWritable(root) : false })
}

// --- pnpm ---------------------------------------------------------------------

export const pnpm: PackageSource = {
  id: 'pnpm',
  label: 'pnpm',

  async detect(ctx) {
    const path = which('pnpm', ctx.env.PATH)
    return path ? { path, version: await versionOf(ctx, path) } : null
  },

  async list(ctx, probe) {
    const [ls, outdated] = await Promise.all([
      ctx.exec(probe.path, ['list', '--global', '--depth=0', '--json'], { env: ctx.env, timeoutMs: 60_000 }),
      ctx.checkUpdates
        ? ctx.exec(probe.path, ['outdated', '--global', '--format', 'json'], { env: ctx.env, timeoutMs: 90_000 })
        : null
    ])
    return parsePnpmList(expectSuccess(ls, probe.path), parseOutdated(outdated?.stdout ?? ''))
  },

  installCommand: (name, probe) => command([probe.path, 'add', '--global', name]),
  upgradeCommand: (item, probe) => command([probe.path, 'add', '--global', `${item.name}@latest`]),
  uninstallCommand: (item, probe) => command([probe.path, 'remove', '--global', item.name])
}

export function parsePnpmList(stdout: string, outdated: Outdated): ItemDraft[] {
  const projects = JSON.parse(stdout || '[]') as {
    path: string
    dependencies?: Record<string, { version?: string; path?: string }>
  }[]
  return projects.flatMap((project) =>
    Object.entries(project.dependencies ?? {}).map(([name, dep]) =>
      nodePackageDraft(name, dep.version ?? null, dep.path ?? join(project.path, 'node_modules', name), outdated)
    )
  )
}
