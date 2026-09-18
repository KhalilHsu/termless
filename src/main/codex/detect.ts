import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { CodexStatus } from '../../shared/types'
import { findExecutable, run, toolEnv } from '../env'

const CODEX_CANDIDATES = [
  '/opt/homebrew/bin/codex',
  '/usr/local/bin/codex',
  join(homedir(), '.local', 'bin', 'codex'),
  join(homedir(), '.npm-global', 'bin', 'codex')
]

// Termless gives Codex its own home folder, so the user's personal Codex
// setup (global AGENTS.md, MCP servers, skills, history) neither leaks into
// Termless conversations nor gets touched by them. Signing in once inside
// Termless stores Codex's credentials there — Termless never reads them.
// For development, TERMLESS_CODEX_HOME can point at another folder
// (e.g. ~/.codex to reuse an existing sign-in).
let codexHome: string | null = null

export function setCodexHome(dir: string): void {
  codexHome = process.env.TERMLESS_CODEX_HOME || dir
  mkdirSync(codexHome, { recursive: true })
}

export function codexEnv(): NodeJS.ProcessEnv {
  return codexHome ? toolEnv({ CODEX_HOME: codexHome }) : toolEnv()
}

export function getCodexHome(): string | null {
  return codexHome
}

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
