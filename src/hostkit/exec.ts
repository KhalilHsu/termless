import { execFile } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { delimiter, join } from 'node:path'
import type { CommandSpec, Exec, ExecOptions, ExecResult } from './types.ts'

const DEFAULT_TIMEOUT_MS = 60_000

/** The default Exec: `execFile` without a shell. */
export const execFileResult: Exec = (file, args, options = {}) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        env: options.env ?? process.env,
        cwd: options.cwd,
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxBuffer: 64 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (error) {
          // A numeric code means the program ran and exited non-zero.
          const code = (error as NodeJS.ErrnoException & { code?: unknown }).code
          if (typeof code === 'number' && !error.killed) {
            resolve({ stdout, stderr, code })
            return
          }
          reject(new ExecError(error.killed ? `${basename(file)} timed out` : error.message, { stdout, stderr, code: -1 }))
          return
        }
        resolve({ stdout, stderr, code: 0 })
      }
    )
  })

export class ExecError extends Error {
  readonly result: ExecResult
  constructor(message: string, result: ExecResult) {
    super(message)
    this.name = 'ExecError'
    this.result = result
  }
}

/** Runs a program and returns stdout; rejects on a non-zero exit with its stderr. */
export async function runText(file: string, args: string[], options: ExecOptions & { exec?: Exec } = {}): Promise<string> {
  const result = await (options.exec ?? execFileResult)(file, args, options)
  return expectSuccess(result, file)
}

export function expectSuccess(result: ExecResult, file: string): string {
  if (result.code !== 0) {
    const detail = (result.stderr.trim() || result.stdout.trim()).split('\n').slice(-6).join('\n')
    throw new ExecError(detail || `${basename(file)} exited with code ${result.code}`, result)
  }
  return result.stdout
}

/** First candidate that exists and is executable. */
export function findExecutable(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (isExecutable(candidate)) return candidate
  }
  return null
}

/** Looks a command up on a PATH (default: the process's). */
export function which(name: string, path = process.env.PATH ?? ''): string | null {
  return findExecutable(path.split(delimiter).filter(Boolean).map((dir) => join(dir, name)))
}

export function isExecutable(file: string): boolean {
  try {
    accessSync(file, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** Quotes one argument for a POSIX shell. */
export function shellQuote(arg: string): string {
  if (arg === '') return "''"
  if (/^[\w@%+=:,./-]+$/.test(arg)) return arg
  return `'${arg.replace(/'/g, `'\\''`)}'`
}

/**
 * Builds a CommandSpec. The display line uses the program's short name
 * (`brew upgrade wget`), which is what people see in tutorials.
 */
export function command(argv: string[], options: { needsAdmin?: boolean } = {}): CommandSpec {
  const [program, ...rest] = argv
  const display = [basename(program), ...rest].map(shellQuote).join(' ')
  return options.needsAdmin ? { argv, display, needsAdmin: true } : { argv, display }
}

export function basename(path: string): string {
  return path.split('/').pop() || path
}
