import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { command, expectSuccess, which } from '../exec.ts'
import type { ItemDraft, PackageSource } from '../types.ts'

// Tools built from source by a language toolchain: `cargo install` and `go install`.

// --- cargo --------------------------------------------------------------------

export const cargo: PackageSource = {
  id: 'cargo',
  label: 'Cargo',

  async detect(ctx) {
    const path = which('cargo', ctx.env.PATH)
    if (!path) return null
    const out = expectSuccess(await ctx.exec(path, ['--version'], { env: ctx.env, timeoutMs: 20_000 }), path)
    return { path, version: out.trim().split(/\s+/)[1] ?? null }
  },

  async list(ctx, probe) {
    const out = expectSuccess(await ctx.exec(probe.path, ['install', '--list'], { env: ctx.env, timeoutMs: 60_000 }), probe.path)
    const binDir = join(ctx.env.CARGO_HOME || join(ctx.home, '.cargo'), 'bin')
    return parseCargoList(out, binDir)
  },

  installCommand: (name, probe) => command([probe.path, 'install', name]),
  // Installing again replaces it with the newest version.
  upgradeCommand: (item, probe) => (item.extra.origin ? null : command([probe.path, 'install', item.name])),
  uninstallCommand: (item, probe) => command([probe.path, 'uninstall', item.name])
}

/**
 * `cargo install --list`:
 *   ripgrep v14.1.0:
 *       rg
 *   mytool v0.1.0 (/Users/me/src/mytool):
 *       mytool
 */
export function parseCargoList(stdout: string, binDir: string): ItemDraft[] {
  const drafts: ItemDraft[] = []
  for (const line of stdout.split('\n')) {
    const crate = line.match(/^(\S+)\s+v(\S+?)(?:\s+\((.+)\))?:\s*$/)
    if (crate) {
      drafts.push({
        name: crate[1],
        kind: 'cli',
        version: crate[2],
        executables: [],
        extra: crate[3] ? { origin: crate[3] } : {}
      })
      continue
    }
    const current = drafts[drafts.length - 1]
    const exe = line.match(/^\s+(\S+)\s*$/)
    if (exe && current) {
      current.executables = [...(current.executables ?? []), exe[1]]
      current.location ??= join(binDir, exe[1])
    }
  }
  return drafts
}

// --- go -----------------------------------------------------------------------

export const goInstall: PackageSource = {
  id: 'go',
  label: 'Go',

  async detect(ctx) {
    const path = which('go', ctx.env.PATH)
    if (!path) return null
    const out = expectSuccess(await ctx.exec(path, ['version'], { env: ctx.env, timeoutMs: 20_000 }), path)
    return { path, version: out.match(/go(\d+(?:\.\d+)+)/)?.[1] ?? null }
  },

  async list(ctx, probe) {
    const [gobin, gopath] = expectSuccess(
      await ctx.exec(probe.path, ['env', 'GOBIN', 'GOPATH'], { env: ctx.env, timeoutMs: 20_000 }),
      probe.path
    ).split('\n')
    const binDir = gobin?.trim() || join((gopath?.trim() || join(ctx.home, 'go')).split(':')[0], 'bin')
    let files: string[]
    try {
      files = readdirSync(binDir).filter((f) => !f.startsWith('.')).map((f) => join(binDir, f))
    } catch {
      return []
    }
    if (files.length === 0) return []
    const out = await ctx.exec(probe.path, ['version', '-m', ...files], { env: ctx.env, timeoutMs: 60_000 })
    return parseGoVersionM(out.stdout)
  },

  installCommand: (name, probe) => command([probe.path, 'install', name.includes('@') ? name : `${name}@latest`]),
  upgradeCommand: (item, probe) => (item.extra.module ? command([probe.path, 'install', `${item.extra.module}@latest`]) : null),
  // `go install` has no uninstall; the tool is a single file.
  uninstallCommand: (item) => (item.location ? command(['/bin/rm', item.location]) : null)
}

/**
 * `go version -m <files>`:
 *   /Users/me/go/bin/gopls: go1.22.0
 *   	path	golang.org/x/tools/gopls
 *   	mod	golang.org/x/tools/gopls	v0.15.0	h1:…
 */
export function parseGoVersionM(stdout: string): ItemDraft[] {
  const drafts: ItemDraft[] = []
  for (const line of stdout.split('\n')) {
    const head = line.match(/^(\/.+?):\s+go\S+\s*$/)
    if (head) {
      const name = head[1].split('/').pop()!
      drafts.push({ name, kind: 'cli', version: null, location: head[1], executables: [name], extra: {} })
      continue
    }
    const current = drafts[drafts.length - 1]
    if (!current) continue
    const [, key, value, version] = line.split('\t')
    if (key === 'path' && value) current.extra = { ...current.extra, module: value }
    if (key === 'mod' && version) current.version = version
  }
  return drafts
}
