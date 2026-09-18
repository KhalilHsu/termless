import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dialog, type BrowserWindow } from 'electron'
import type { Lang, SetupActionResult, SetupStatus } from '../shared/types'
import { findBrew } from './brew'
import { codexEnv, getCodexHome, getCodexStatus } from './codex/detect'
import { findExecutable, run, toolEnv } from './env'

// First-run checklist: Homebrew → Codex installed → signed in to Codex.

export async function getSetupStatus(): Promise<SetupStatus> {
  const brew = findBrew()
  const [brewVersion, codex] = await Promise.all([
    brew
      ? run(brew, ['--version'], { env: toolEnv({ HOMEBREW_NO_AUTO_UPDATE: '1' }), timeoutMs: 15_000 })
          .then((out) => out.split('\n')[0].replace(/^Homebrew\s+/, '').trim())
          .catch(() => null)
      : Promise.resolve(null),
    getCodexStatus()
  ])

  let signedIn: boolean | null = null
  let accountLabel: string | null = null
  if (codex.installed && !codex.error && codex.path) {
    try {
      // `codex login status` prints e.g. "Logged in using ChatGPT" and exits 0.
      const out = await run(codex.path, ['login', 'status'], { env: codexEnv(), timeoutMs: 15_000 })
      signedIn = true
      accountLabel = out.trim().replace(/^Logged in using\s+/i, '') || null
    } catch {
      signedIn = false
    }
  }

  const npm = findExecutable(['/opt/homebrew/bin/npm', '/usr/local/bin/npm'])
  return {
    homebrew: { installed: Boolean(brew), version: brewVersion },
    codex,
    signedIn,
    accountLabel,
    codexInstallMethod: brew ? 'brew' : npm ? 'npm' : null
  }
}

export async function installCodex(win: BrowserWindow | null, lang: Lang): Promise<SetupActionResult> {
  const brew = findBrew()
  const npm = findExecutable(['/opt/homebrew/bin/npm', '/usr/local/bin/npm'])
  const zh = lang === 'zh'

  let file: string
  let args: string[]
  if (brew) {
    file = brew
    args = ['install', '--cask', 'codex']
  } else if (npm) {
    file = npm
    args = ['install', '--global', '@openai/codex']
  } else {
    return { ok: false, message: zh ? '需要先安装 Homebrew。' : 'Homebrew needs to be installed first.' }
  }

  // Principle: say what will happen and ask before changing anything.
  const options = {
    type: 'question' as const,
    buttons: zh ? ['安装', '取消'] : ['Install', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    message: zh ? '安装 Codex？' : 'Install Codex?',
    detail: zh
      ? `Codex 是 OpenAI 的 AI 助手，Termless 用它来帮你完成命令行里的事。将通过${brew ? ' Homebrew' : ' npm'} 下载并安装，大约需要一两分钟。\n\n将要运行：${file.split('/').pop()} ${args.join(' ')}`
      : `Codex is OpenAI's AI agent. Termless uses it to do command-line work for you. It will be downloaded and installed with ${brew ? 'Homebrew' : 'npm'}, which takes a minute or two.\n\nCommand: ${file.split('/').pop()} ${args.join(' ')}`
  }
  const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options)
  if (response !== 0) return { ok: false, message: '', cancelled: true }

  try {
    await run(file, args, { env: toolEnv({ HOMEBREW_NO_ENV_HINTS: '1' }), timeoutMs: 15 * 60_000 })
    return { ok: true }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? lastLines(error.message) : String(error) }
  }
}

/**
 * Runs Codex's own sign-in (`codex login`), which opens OpenAI's page in the
 * browser. Termless never sees the credentials.
 */
export async function signInToCodex(): Promise<SetupActionResult> {
  const codex = await getCodexStatus()
  if (!codex.path || codex.error) return { ok: false, message: 'Codex is not installed.' }

  const home = getCodexHome()
  if (home) mkdirSync(home, { recursive: true })

  return new Promise((resolve) => {
    const proc = spawn(codex.path!, ['login'], { env: codexEnv(), stdio: 'ignore' })
    const timer = setTimeout(() => {
      proc.kill()
      resolve({ ok: false, message: 'Sign-in timed out.' })
    }, 10 * 60_000)
    proc.on('error', (error) => {
      clearTimeout(timer)
      resolve({ ok: false, message: error.message })
    })
    proc.on('exit', (code) => {
      clearTimeout(timer)
      resolve(code === 0 ? { ok: true } : { ok: false, message: `codex login exited with code ${code}` })
    })
  })
}

function lastLines(text: string): string {
  return text.trim().split('\n').slice(-4).join('\n')
}
