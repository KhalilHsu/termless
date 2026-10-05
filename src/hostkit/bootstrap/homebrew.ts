import { createWriteStream } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { arch, tmpdir } from 'node:os'
import { join } from 'node:path'
import { runAsAdmin } from '../admin.ts'
import { execFileResult, shellQuote } from '../exec.ts'
import { findHomebrew } from '../sources/homebrew.ts'
import type { Exec, HomebrewInstallProgress, HomebrewInstallResult, HomebrewInstallStep, HomebrewSupport } from '../types.ts'
import { commandLineToolsInstalled, INSTALL_COMMAND_LINE_TOOLS_SCRIPT } from './commandLineTools.ts'

// Installs Homebrew from its official, notarized macOS package (published
// with every Homebrew release on GitHub). One macOS password dialog covers
// everything that needs administrator rights: Apple's Command Line Tools (if
// missing) and the package itself. The package sets Homebrew up for the
// logged-in user and adds it to the system PATH (/etc/paths.d/homebrew).

const LATEST_RELEASE_URL = 'https://api.github.com/repos/Homebrew/brew/releases/latest'
const DOWNLOAD_PREFIX = 'https://github.com/Homebrew/brew/releases/download/'

/**
 * Developer ID teams that have signed Homebrew's package. Checked in
 * addition to Apple's notarization; pass `allowedTeamIds` if Homebrew
 * starts signing with another team.
 */
export const HOMEBREW_TEAM_IDS = ['927JGANW46']

export interface HomebrewInstallOptions {
  /** Shown in the macOS password dialog. */
  prompt: string
  onProgress?: (progress: HomebrewInstallProgress) => void
  signal?: AbortSignal
  allowedTeamIds?: string[]
  exec?: Exec
}

/** Whether installHomebrew() can work on this Mac. The package is for Apple silicon and macOS 15 or later. */
export async function homebrewInstallSupport(exec: Exec = execFileResult): Promise<HomebrewSupport> {
  if (findHomebrew()) return { ok: false, reason: 'installed' }
  if (arch() !== 'arm64') return { ok: false, reason: 'intel' }
  const { stdout } = await exec('/usr/bin/sw_vers', ['-productVersion'], { timeoutMs: 5000 })
  const major = Number(stdout.trim().split('.')[0])
  if (!(major >= 15)) return { ok: false, reason: 'macos-too-old', detail: stdout.trim() }
  return { ok: true }
}

export async function installHomebrew(options: HomebrewInstallOptions): Promise<HomebrewInstallResult> {
  const exec = options.exec ?? execFileResult
  const report = options.onProgress ?? (() => {})

  const support = await homebrewInstallSupport(exec)
  if (!support.ok) {
    if (support.reason === 'installed') return { status: 'ok', brewPath: findHomebrew()!, commandLineTools: await commandLineToolsInstalled(exec) }
    return { status: 'failed', step: 'checking', message: support.reason }
  }

  const dir = await mkdtemp(join(tmpdir(), 'hostkit-homebrew-'))
  let step: HomebrewInstallStep = 'downloading'
  try {
    report({ step, fraction: 0 })
    const pkg = join(dir, 'Homebrew.pkg')
    await downloadLatestPackage(pkg, (fraction) => report({ step: 'downloading', fraction }), options.signal)

    step = 'verifying'
    report({ step })
    await verifyPackage(pkg, options.allowedTeamIds ?? HOMEBREW_TEAM_IDS, exec)
    options.signal?.throwIfAborted()

    step = 'waiting-for-password'
    report({ step })
    const log = join(dir, 'progress.log')
    await writeFile(log, '')
    const script = [
      'set -e',
      `log=${shellQuote(log)}`,
      'echo installing-command-line-tools >> "$log"',
      INSTALL_COMMAND_LINE_TOOLS_SCRIPT,
      'echo installing-homebrew >> "$log"',
      `/usr/sbin/installer -pkg ${shellQuote(pkg)} -target /`
    ].join('\n')

    // The admin script writes each step it starts to the log.
    let seen = ''
    const poll = setInterval(async () => {
      const lines = (await readFile(log, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean)
      const latest = lines[lines.length - 1]
      if (latest && latest !== seen) {
        seen = latest
        step = latest as HomebrewInstallStep
        report({ step })
      }
    }, 1000)
    let result
    try {
      result = await runAsAdmin(script, { prompt: options.prompt, timeoutMs: 90 * 60_000, exec })
    } finally {
      clearInterval(poll)
    }
    if (result.status === 'cancelled') return { status: 'cancelled' }
    if (result.status === 'failed') return { status: 'failed', step, message: lastLines(result.output) }

    const brewPath = findHomebrew()
    if (!brewPath) return { status: 'failed', step: 'installing-homebrew', message: 'The installer finished, but brew was not found.' }
    return { status: 'ok', brewPath, commandLineTools: await commandLineToolsInstalled(exec) }
  } catch (error) {
    if (options.signal?.aborted) return { status: 'cancelled' }
    return { status: 'failed', step, message: error instanceof Error ? error.message : String(error) }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** Downloads the .pkg attached to Homebrew's latest GitHub release. */
export async function downloadLatestPackage(target: string, onFraction: (f: number) => void, signal?: AbortSignal): Promise<string> {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'hostkit' }
  const release = await fetch(LATEST_RELEASE_URL, { headers, signal })
  if (!release.ok) throw new Error(`GitHub answered ${release.status} when asked for the latest Homebrew release.`)
  const json = (await release.json()) as { tag_name?: string; assets?: { name: string; browser_download_url: string }[] }
  const asset = json.assets?.find((a) => a.name.endsWith('.pkg') && a.browser_download_url.startsWith(DOWNLOAD_PREFIX))
  if (!asset) throw new Error(`Homebrew ${json.tag_name ?? ''} has no installer package.`)

  const response = await fetch(asset.browser_download_url, { signal, headers: { 'User-Agent': 'hostkit' } })
  if (!response.ok || !response.body) throw new Error(`Downloading Homebrew failed (${response.status}).`)
  const total = Number(response.headers.get('content-length')) || 0
  const file = createWriteStream(target)
  let received = 0
  let lastReported = 0
  try {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      received += chunk.length
      if (!file.write(chunk)) await new Promise((resolve) => file.once('drain', resolve))
      if (total && received / total - lastReported >= 0.01) {
        lastReported = received / total
        onFraction(lastReported)
      }
    }
  } finally {
    await new Promise((resolve) => file.end(resolve))
  }
  onFraction(1)
  return json.tag_name ?? ''
}

/** Requires Apple's notarization and a Developer ID from one of the allowed teams. */
export async function verifyPackage(pkg: string, allowedTeamIds: string[], exec: Exec = execFileResult): Promise<void> {
  const signature = await exec('/usr/sbin/pkgutil', ['--check-signature', pkg], { timeoutMs: 60_000 })
  const text = signature.stdout
  const team = text.match(/Developer ID Installer: .*\((\w+)\)/)?.[1]
  if (signature.code !== 0 || !/Status: signed by a developer certificate issued by Apple/.test(text)) {
    throw new Error('The downloaded Homebrew package is not properly signed.')
  }
  if (!team || !allowedTeamIds.includes(team)) {
    throw new Error(`The downloaded Homebrew package is signed by an unexpected developer (${team ?? 'unknown'}).`)
  }
  const assessment = await exec('/usr/sbin/spctl', ['--assess', '-vv', '--type', 'install', pkg], { timeoutMs: 60_000 })
  if (assessment.code !== 0 || !/source=Notarized Developer ID/.test(assessment.stderr + assessment.stdout)) {
    throw new Error('macOS did not accept the downloaded Homebrew package.')
  }
}

function lastLines(text: string): string {
  return text.trim().split('\n').slice(-6).join('\n')
}
