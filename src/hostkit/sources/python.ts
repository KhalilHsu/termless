import { join } from 'node:path'
import { command, expectSuccess, which } from '../exec.ts'
import type { ItemDraft, PackageSource, SourceContext } from '../types.ts'

// Python command-line tools, each in its own environment: pipx and `uv tool`.

async function versionOf(ctx: SourceContext, path: string): Promise<string | null> {
  const out = expectSuccess(await ctx.exec(path, ['--version'], { env: ctx.env, timeoutMs: 20_000 }), path)
  return out.trim().replace(/^\S+\s+/, '').split(/\s/)[0] || null
}

// --- pipx ---------------------------------------------------------------------

interface PipxJson {
  venvs: Record<
    string,
    {
      metadata: {
        main_package: { package: string; package_version: string; apps?: string[] }
        python_version?: string
      }
    }
  >
}

export const pipx: PackageSource = {
  id: 'pipx',
  label: 'pipx',

  async detect(ctx) {
    const path = which('pipx', ctx.env.PATH)
    return path ? { path, version: await versionOf(ctx, path) } : null
  },

  async list(ctx, probe) {
    const [list, venvs] = await Promise.all([
      ctx.exec(probe.path, ['list', '--json'], { env: ctx.env, timeoutMs: 60_000 }),
      ctx.exec(probe.path, ['environment', '--value', 'PIPX_LOCAL_VENVS'], { env: ctx.env, timeoutMs: 20_000 })
    ])
    const venvDir = venvs.code === 0 ? venvs.stdout.trim() : join(ctx.home, '.local', 'pipx', 'venvs')
    return parsePipx(JSON.parse(expectSuccess(list, probe.path)) as PipxJson, venvDir)
  },

  installCommand: (name, probe) => command([probe.path, 'install', name]),
  upgradeCommand: (item, probe) => command([probe.path, 'upgrade', item.name]),
  uninstallCommand: (item, probe) => command([probe.path, 'uninstall', item.name])
}

export function parsePipx(json: PipxJson, venvDir: string): ItemDraft[] {
  return Object.entries(json.venvs ?? {}).map(([venv, { metadata }]): ItemDraft => {
    const pkg = metadata.main_package
    const python = metadata.python_version?.replace(/^Python\s+/, '')
    return {
      name: venv,
      displayName: pkg.package || venv,
      kind: pkg.apps?.length ? 'cli' : 'other',
      version: pkg.package_version || null,
      location: join(venvDir, venv),
      executables: pkg.apps ?? [],
      extra: python ? { python } : {}
    }
  })
}

// --- uv -----------------------------------------------------------------------

export const uvTool: PackageSource = {
  id: 'uv',
  label: 'uv',

  async detect(ctx) {
    const path = which('uv', ctx.env.PATH)
    return path ? { path, version: await versionOf(ctx, path) } : null
  },

  async list(ctx, probe) {
    const [list, outdated] = await Promise.all([
      ctx.exec(probe.path, ['tool', 'list', '--show-paths'], { env: ctx.env, timeoutMs: 60_000 }),
      // Newer uv versions only; older ones reject the flag and we skip updates.
      ctx.checkUpdates ? ctx.exec(probe.path, ['tool', 'list', '--outdated'], { env: ctx.env, timeoutMs: 90_000 }) : null
    ])
    const latest = outdated?.code === 0 ? parseUvOutdated(outdated.stdout) : new Map<string, string>()
    return parseUvToolList(expectSuccess(list, probe.path)).map((draft) => {
      const newer = latest.get(draft.name)
      return newer ? { ...draft, latestVersion: newer, outdated: true } : draft
    })
  },

  installCommand: (name, probe) => command([probe.path, 'tool', 'install', name]),
  upgradeCommand: (item, probe) => command([probe.path, 'tool', 'upgrade', item.name]),
  uninstallCommand: (item, probe) => command([probe.path, 'tool', 'uninstall', item.name])
}

/**
 * `uv tool list --show-paths`:
 *   black v24.2.0 (/Users/me/.local/share/uv/tools/black)
 *   - black (/Users/me/.local/bin/black)
 */
export function parseUvToolList(stdout: string): ItemDraft[] {
  const drafts: ItemDraft[] = []
  for (const line of stdout.split('\n')) {
    const tool = line.match(/^([^\s-][^\s]*)\s+v(\S+)(?:.*?\((\/[^)]*)\))?/)
    if (tool) {
      drafts.push({ name: tool[1], kind: 'other', version: tool[2], location: tool[3] ?? null, executables: [] })
      continue
    }
    const exe = line.match(/^-\s+(\S+)/)
    const current = drafts[drafts.length - 1]
    if (exe && current) {
      current.executables = [...(current.executables ?? []), exe[1]]
      current.kind = 'cli'
    }
  }
  return drafts
}

/** `uv tool list --outdated`: "black v24.2.0 [latest: 25.1.0]" */
export function parseUvOutdated(stdout: string): Map<string, string> {
  const latest = new Map<string, string>()
  for (const line of stdout.split('\n')) {
    const match = line.match(/^(\S+)\s+v\S+.*\[latest:\s*v?([^\]\s]+)\]/)
    if (match) latest.set(match[1], match[2])
  }
  return latest
}
