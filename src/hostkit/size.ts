import { execFileResult } from './exec.ts'
import type { Exec } from './types.ts'

/**
 * Disk space used by a file or folder, in bytes; null when it can't be
 * measured. Large apps take a moment, so measure on demand, not for the
 * whole inventory.
 */
export async function measureSize(path: string, exec: Exec = execFileResult): Promise<number | null> {
  try {
    // -s: total only, -k: kibibytes. du exits 1 when some files are unreadable but still prints a total.
    const { stdout } = await exec('/usr/bin/du', ['-sk', path], { timeoutMs: 60_000 })
    const kib = Number(stdout.trim().split(/\s+/)[0])
    return Number.isFinite(kib) && stdout.trim() ? kib * 1024 : null
  } catch {
    return null
  }
}
