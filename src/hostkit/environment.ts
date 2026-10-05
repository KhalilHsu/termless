import { execFile } from 'node:child_process'
import { homedir, userInfo } from 'node:os'
import { delimiter, join } from 'node:path'

// Apps launched from Finder don't inherit the user's shell PATH, so tools
// installed by Homebrew, npm, pipx, cargo… are invisible unless we look in
// their usual places ourselves, and ideally ask the login shell.

/** Where package managers usually put commands on a Mac. */
export function standardPaths(home = homedir()): string[] {
  return [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    join(home, '.local', 'bin'), // pipx, uv, Claude-style installers
    join(home, '.cargo', 'bin'),
    join(home, 'go', 'bin'),
    join(home, '.bun', 'bin'),
    join(home, 'Library', 'pnpm'),
    join(home, '.volta', 'bin'),
    join(home, '.npm-global', 'bin')
  ]
}

const SYSTEM_PATHS = ['/usr/bin', '/bin', '/usr/sbin', '/sbin']

let shellPath: string[] = []

/**
 * Asks the user's login shell for its PATH (so version managers such as nvm
 * or asdf are found too) and remembers it for hostEnv(). Safe to skip: the
 * standard paths still apply. Call once at startup.
 */
export async function loadShellPath(timeoutMs = 5000): Promise<string[]> {
  const shell = userInfo().shell || process.env.SHELL || '/bin/zsh'
  const marker = '__HOSTKIT_PATH__'
  const output = await new Promise<string>((resolve) => {
    execFile(
      shell,
      ['-ilc', `printf '${marker}%s${marker}' "$PATH"`],
      {
        timeout: timeoutMs,
        // Keep interactive setups quiet and non-blocking (oh-my-zsh update prompt etc.).
        env: { ...process.env, DISABLE_AUTO_UPDATE: 'true', ZSH_DISABLE_COMPFIX: 'true' }
      },
      (_error, stdout) => resolve(typeof stdout === 'string' ? stdout : '')
    ).stdin?.end()
  })
  const match = output.match(new RegExp(`${marker}(.*)${marker}`, 's'))
  shellPath = match ? match[1].split(delimiter).filter((p) => p.startsWith('/')) : []
  return shellPath
}

/** PATH with the standard places, the login shell's PATH and the system folders. */
export function hostPath(current = process.env.PATH ?? ''): string {
  const parts = [...standardPaths(), ...shellPath, ...current.split(delimiter), ...SYSTEM_PATHS].filter(Boolean)
  return [...new Set(parts)].join(delimiter)
}

/** Environment for running package managers. */
export function hostEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ...process.env, PATH: hostPath(), ...extra }
}

/**
 * Environment for read-only queries: they must never update or change
 * anything as a side effect.
 */
export function readOnlyEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return hostEnv({
    HOMEBREW_NO_AUTO_UPDATE: '1',
    HOMEBREW_NO_ENV_HINTS: '1',
    HOMEBREW_NO_ANALYTICS: '1',
    NO_UPDATE_NOTIFIER: '1',
    NPM_CONFIG_UPDATE_NOTIFIER: 'false',
    NO_COLOR: '1',
    ...extra
  })
}
