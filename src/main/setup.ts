import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dialog, type BrowserWindow } from 'electron'
import {
  commandLineToolsInstalled,
  findExecutable,
  findHomebrew,
  homebrewInstallSupport,
  hostEnv,
  installHomebrew as installHomebrewPackage,
  openCommandLineToolsInstaller as openCltInstaller,
  readOnlyEnv,
  runText
} from '../hostkit'
import type { Lang, SetupActionResult, SetupProgress, SetupStatus } from '../shared/types'
import { codexEnv, getCodexHome, getCodexStatus } from './codex/detect'

// First-run checklist: Homebrew → Codex installed → signed in to Codex.

export async function getSetupStatus(): Promise<SetupStatus> {
  const brew = findHomebrew()
  const [brewVersion, codex, support, commandLineTools] = await Promise.all([
    brew
      ? runText(brew, ['--version'], { env: readOnlyEnv(), timeoutMs: 15_000 })
          .then((out) => out.split('\n')[0].replace(/^Homebrew\s+/, '').trim())
          .catch(() => null)
      : Promise.resolve(null),
    getCodexStatus(),
    homebrewInstallSupport().catch(() => null),
    commandLineToolsInstalled()
  ])

  let signedIn: boolean | null = null
  let accountLabel: string | null = null
  if (codex.installed && !codex.error && codex.path) {
    try {
      // `codex login status` prints e.g. "Logged in using ChatGPT" and exits 0.
      const out = await runText(codex.path, ['login', 'status'], { env: codexEnv(), timeoutMs: 15_000 })
      signedIn = true
      accountLabel = out.trim().replace(/^Logged in using\s+/i, '') || null
    } catch {
      signedIn = false
    }
  }

  const npm = findExecutable(['/opt/homebrew/bin/npm', '/usr/local/bin/npm'])
  return {
    homebrew: {
      installed: Boolean(brew),
      version: brewVersion,
      canInstall: !brew && support?.ok === true,
      cannotInstallReason: support && !support.ok && support.reason !== 'installed' ? support.reason : null
    },
    commandLineTools,
    codex,
    signedIn,
    accountLabel,
    codexInstallMethod: brew ? 'brew' : npm ? 'npm' : null
  }
}

/**
 * Installs Homebrew from its official package. Explains first; the only
 * password prompt is macOS's own, so Termless never sees the password.
 */
export async function installHomebrew(
  win: BrowserWindow | null,
  lang: Lang,
  onProgress: (progress: SetupProgress) => void
): Promise<SetupActionResult> {
  const zh = lang === 'zh'
  const needsClt = !(await commandLineToolsInstalled())
  const options = {
    type: 'question' as const,
    buttons: zh ? ['安装', '取消'] : ['Install', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    message: zh ? '安装 Homebrew？' : 'Install Homebrew?',
    detail: zh
      ? `Homebrew 是 Mac 上最常用的软件安装工具，教程里的大多数安装命令都要用到它。\n\nTermless 会从 Homebrew 在 GitHub 上的官方发布页下载它的安装包（约 150 MB），确认安装包经过 Apple 公证后再安装。${needsClt ? '\n\n这台 Mac 还缺少 Apple 的命令行开发工具（Homebrew 需要它），会一并安装，大约多花 5～15 分钟。' : ''}\n\n接下来 macOS 会弹出窗口请你输入 Mac 的登录密码。密码只交给 macOS，Termless 看不到。`
      : `Homebrew is the standard way to install software on a Mac; most install commands in tutorials use it.\n\nTermless will download its official installer (about 150 MB) from Homebrew's release page on GitHub and check that Apple has notarized it before installing.${needsClt ? "\n\nThis Mac also needs Apple's Command Line Tools, which Homebrew relies on. They will be installed too, which adds 5–15 minutes." : ''}\n\nmacOS will then ask for your Mac password in its own window. The password goes to macOS only; Termless never sees it.`
  }
  const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options)
  if (response !== 0) return { ok: false, message: '', cancelled: true }

  try {
    const result = await installHomebrewPackage({
      prompt: zh ? 'Termless 要安装 Homebrew。' : 'Termless wants to install Homebrew.',
      onProgress: (p) => onProgress({ task: 'homebrew', ...p })
    })
    if (result.status === 'ok') return { ok: true }
    if (result.status === 'cancelled') return { ok: false, message: '', cancelled: true }
    return { ok: false, message: result.message }
  } finally {
    onProgress(null)
  }
}

/** Opens Apple's installer for the Command Line Tools (no password needed). */
export async function openCommandLineToolsInstaller(): Promise<void> {
  await openCltInstaller().catch(() => {})
}

export async function installCodex(win: BrowserWindow | null, lang: Lang): Promise<SetupActionResult> {
  const brew = findHomebrew()
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
    await runText(file, args, { env: hostEnv({ HOMEBREW_NO_ENV_HINTS: '1' }), timeoutMs: 15 * 60_000 })
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
