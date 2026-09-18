import { homedir } from 'node:os'
import { join } from 'node:path'
import type { CodexStatus } from '../shared/types'
import { findExecutable, run } from './env'

const CODEX_CANDIDATES = [
  '/opt/homebrew/bin/codex',
  '/usr/local/bin/codex',
  join(homedir(), '.local', 'bin', 'codex'),
  join(homedir(), '.npm-global', 'bin', 'codex')
]

export async function getCodexStatus(): Promise<CodexStatus> {
  const path = findExecutable(CODEX_CANDIDATES)
  if (!path) {
    return { installed: false, path: null, version: null, error: null }
  }

  try {
    const out = await run(path, ['--version'], { timeoutMs: 10_000 })
    return { installed: true, path, version: out.trim().replace(/^codex-cli\s+/, ''), error: null }
  } catch (error) {
    // The launcher exists but the real binary is missing or broken.
    const message = error instanceof Error ? error.message : String(error)
    return { installed: true, path, version: null, error: message.split('\n')[0] }
  }
}
