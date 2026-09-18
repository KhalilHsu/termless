import { execFile } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Apps launched from Finder don't inherit the user's shell PATH, so tools
// installed by Homebrew, npm or pipx are invisible unless we add their
// usual locations ourselves.
const EXTRA_PATHS = [
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/usr/local/bin',
  '/usr/local/sbin',
  join(homedir(), '.local', 'bin')
]

export function toolEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const current = (process.env.PATH ?? '').split(':').filter(Boolean)
  const path = [...new Set([...EXTRA_PATHS, ...current, '/usr/bin', '/bin', '/usr/sbin', '/sbin'])]
  return { ...process.env, PATH: path.join(':'), ...extra }
}

export function findExecutable(candidates: string[]): string | null {
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      // try the next one
    }
  }
  return null
}

export function run(
  file: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { env: options.env ?? toolEnv(), timeout: options.timeoutMs ?? 60_000, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message))
          return
        }
        resolve(stdout)
      }
    )
  })
}
