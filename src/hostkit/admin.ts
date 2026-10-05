import { execFileResult, shellQuote } from './exec.ts'
import type { Exec } from './types.ts'

// Running something as administrator without ever touching the password:
// macOS shows its own authorization dialog (the same one System Settings
// uses) and runs the command as root once the user approves.

export type AdminResult =
  | { status: 'ok'; output: string }
  /** The user closed the macOS password dialog. */
  | { status: 'cancelled' }
  | { status: 'failed'; output: string; code: number | null }

export interface AdminOptions {
  /** Shown in the macOS dialog, e.g. "Termless wants to install Homebrew." */
  prompt: string
  /** Long installs can take a while. Default 30 minutes. */
  timeoutMs?: number
  exec?: Exec
}

// The command travels as an argument, never spliced into AppleScript source.
const SCRIPT = [
  'on run argv',
  'do shell script (item 1 of argv) with prompt (item 2 of argv) with administrator privileges without altering line endings',
  'end run'
]

/** Runs a bash script as root after the user approves in the macOS dialog. stderr is merged into the output. */
export async function runAsAdmin(script: string, options: AdminOptions): Promise<AdminResult> {
  const exec = options.exec ?? execFileResult
  const shellLine = `/bin/bash -c ${shellQuote(script)} 2>&1`
  const args = [...SCRIPT.flatMap((line) => ['-e', line]), shellLine, options.prompt]
  const result = await exec('/usr/bin/osascript', args, { timeoutMs: options.timeoutMs ?? 30 * 60_000 })
  if (result.code === 0) return { status: 'ok', output: result.stdout }
  return parseAdminError(result.stderr)
}

/** osascript reports failures as "…execution error: <output> (<code>)". */
export function parseAdminError(stderr: string): AdminResult {
  const match = stderr.match(/execution error: ([\s\S]*)\((-?\d+)\)\s*$/)
  const code = match ? Number(match[2]) : null
  if (code === -128) return { status: 'cancelled' }
  return { status: 'failed', output: (match ? match[1] : stderr).trim(), code }
}

/**
 * Commands that must not run as root, with the reason. Package managers that
 * install into the user's own folders break when run as root, and system
 * security settings are off limits.
 */
export function adminCommandProblem(command: string): string | null {
  const c = command.trim()
  if (/(^|[\s;&|/])brew(\s|$)/.test(c)) return 'Homebrew refuses to run as administrator; run brew commands normally.'
  if (/(^|[\s;&|/])(pipx|uv|cargo|rustup|mas)\s/.test(c)) return 'This tool installs into the user’s own folders; run it normally.'
  if (/\bcsrutil\b|\bspctl\s+(--master-disable|--global-disable)|socketfilterfw|\bfdesetup\b|\bsecurity\s+(delete|unlock)-/.test(c)) {
    return 'Changing macOS security settings is not allowed.'
  }
  if (/\brm\s+(-\w*\s+)*-?\w*[rR]\w*\s+(-\w+\s+)*\/(\s|$|\*)/.test(c)) return 'Refusing to delete the whole disk.'
  return null
}
