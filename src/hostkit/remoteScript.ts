import { createHash } from 'node:crypto'
import type { FindingSeverity, RemoteScriptCommand, ScriptFinding, ScriptFindingId, ScriptReport, ScriptSource } from './types.ts'

// Commands that run a script straight from the internet (`curl … | sh`,
// `bash -c "$(curl …)"`, `bash <(curl …)`, base64-encoded payloads…). Such a
// script can do anything, and the command line shows none of it. This
// module recognises the patterns, downloads the script *without running it*,
// says where it comes from, and flags what it would do. Nothing here
// executes the script.

// --- Recognising the command --------------------------------------------------

const SHELLS = '(?:ba|z|da|k|fi)?sh'
const INTERPRETERS = `(?:${SHELLS}|python3?|node|ruby|perl|php)`
const PIPE_TO_INTERPRETER = new RegExp(`\\|\\s*(?:sudo\\s+(?:-\\S+\\s+)*)?(?:\\S*/)?(${INTERPRETERS})\\b`)
const FETCHER = /\b(?:curl|wget)\b/
const URL_RE = /https?:\/\/[^\s'"|)<>;`]+/

/** Recognises a command that runs a downloaded or embedded script. */
export function detectRemoteScript(command: string): RemoteScriptCommand | null {
  const c = command.trim()

  // curl … | sh   /   wget -qO- … | python3 -
  for (const segment of splitPipelines(c)) {
    const pipe = segment.match(PIPE_TO_INTERPRETER)
    const before = pipe ? segment.slice(0, pipe.index) : ''
    if (pipe && FETCHER.test(before)) {
      return { url: before.match(URL_RE)?.[0] ?? null, inline: null, interpreter: pipe[1] }
    }
  }

  // sh -c "$(curl …)"   /   eval "$(curl …)"
  const subshell = c.match(new RegExp(`(?:\\b(${SHELLS})\\s+-c|\\beval)\\s+["']?\\$\\(\\s*(?:curl|wget)\\b([^)]*)\\)`))
  if (subshell) return { url: subshell[2].match(URL_RE)?.[0] ?? null, inline: null, interpreter: subshell[1] ?? 'sh' }

  // bash <(curl …)   /   source <(curl …)
  const substitution = c.match(new RegExp(`(?:\\b(${SHELLS})|\\bsource|(?:^|\\s)\\.)\\s+<\\(\\s*(?:curl|wget)\\b([^)]*)\\)`))
  if (substitution) return { url: substitution[2].match(URL_RE)?.[0] ?? null, inline: null, interpreter: substitution[1] ?? 'sh' }

  // echo <base64> | base64 -d | sh
  const encoded = c.match(new RegExp(`base64\\s+(?:-d|-D|--decode)\\b[^|]*${PIPE_TO_INTERPRETER.source}`))
  if (encoded) {
    const payload = c.match(/([A-Za-z0-9+/]{16,}={0,2})/)?.[1]
    let inline: string | null = null
    if (payload) {
      try {
        inline = Buffer.from(payload, 'base64').toString('utf8')
      } catch {
        inline = null
      }
    }
    return { url: null, inline, interpreter: encoded[1] }
  }
  return null
}

/** Splits on ; && || but keeps single pipes together. */
function splitPipelines(command: string): string[] {
  return command.split(/;|&&|\|\|/).map((s) => s.trim()).filter(Boolean)
}

// --- Where it comes from --------------------------------------------------------

/** Well-known publishers of install scripts. Host → name; GitHub entries are owners. */
const KNOWN_HOSTS: Record<string, string> = {
  'brew.sh': 'Homebrew',
  'sh.rustup.rs': 'Rust (rustup)',
  'static.rust-lang.org': 'Rust',
  'astral.sh': 'Astral (uv, ruff)',
  'bun.sh': 'Bun',
  'deno.land': 'Deno',
  'get.pnpm.io': 'pnpm',
  'install.python-poetry.org': 'Poetry',
  'ollama.com': 'Ollama',
  'get.docker.com': 'Docker',
  'tailscale.com': 'Tailscale',
  'get.volta.sh': 'Volta',
  'fnm.vercel.app': 'fnm',
  'starship.rs': 'Starship',
  'install.ohmyz.sh': 'Oh My Zsh',
  'claude.ai': 'Anthropic (Claude Code)',
  'opencode.ai': 'opencode',
  'cli.github.com': 'GitHub',
  'raw.githubusercontent.com': 'GitHub',
  'github.com': 'GitHub',
  'sdk.cloud.google.com': 'Google Cloud',
  'awscli.amazonaws.com': 'Amazon Web Services',
  'nodejs.org': 'Node.js',
  'pyenv.run': 'pyenv',
  'mise.run': 'mise',
  'get.jetify.com': 'Jetify (devbox)',
  'nixos.org': 'Nix',
  'install.determinate.systems': 'Determinate Systems (Nix)'
}

/** GitHub accounts whose install scripts are well known. */
const KNOWN_GITHUB_OWNERS: Record<string, string> = {
  homebrew: 'Homebrew',
  'nvm-sh': 'nvm',
  ohmyzsh: 'Oh My Zsh',
  'rust-lang': 'Rust',
  'astral-sh': 'Astral (uv, ruff)',
  'oven-sh': 'Bun',
  denoland: 'Deno',
  'pnpm': 'pnpm',
  ollama: 'Ollama',
  'docker': 'Docker',
  'pyenv': 'pyenv',
  'starship': 'Starship',
  'jdx': 'mise',
  'schniz': 'fnm',
  'volta-cli': 'Volta',
  'cli': 'GitHub CLI'
}

export function describeSource(url: string): ScriptSource | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const host = parsed.hostname.toLowerCase()
  const https = parsed.protocol === 'https:'
  if (host === 'raw.githubusercontent.com' || host === 'github.com' || host === 'gist.githubusercontent.com') {
    const owner = parsed.pathname.split('/')[1]?.toLowerCase() ?? ''
    const repo = parsed.pathname.split('/')[2] ?? ''
    const known = KNOWN_GITHUB_OWNERS[owner]
    return { host: `${host}/${owner}${repo ? `/${repo}` : ''}`, https, knownAs: known ? `${known} (GitHub)` : null }
  }
  const knownHost = Object.keys(KNOWN_HOSTS).find((k) => host === k || host.endsWith(`.${k}`))
  return { host, https, knownAs: knownHost && knownHost !== 'github.com' && knownHost !== 'raw.githubusercontent.com' ? KNOWN_HOSTS[knownHost] : null }
}

// --- What it would do ------------------------------------------------------------

interface Rule {
  id: ScriptFindingId
  severity: FindingSeverity
  test: RegExp
}

const SENSITIVE_PATHS = String.raw`(?:~|\$HOME|/Users/[^/\s]+)/(?:\.ssh|\.aws|\.gnupg|\.kube|Library/Keychains|Library/Cookies|Library/Application Support/(?:Google/Chrome|BraveSoftware|Firefox|Arc)|Library/Messages|\.config/gh)`

const RULES: Rule[] = [
  // Clearly malicious: never run.
  { id: 'keychain', severity: 'block', test: /\bsecurity\s+(?:find-generic-password|find-internet-password|dump-keychain|export)\b/ },
  { id: 'uploads-private-files', severity: 'block', test: new RegExp(String.raw`\b(?:curl|wget)\b.*(?:-d\s*@|--data(?:-binary)?\s*@|-F\s*\S*=@|-T\s|--upload-file|--post-file).*` + SENSITIVE_PATHS) },
  { id: 'uploads-private-files', severity: 'block', test: new RegExp(String.raw`\b(?:tar|zip)\b.*` + SENSITIVE_PATHS + String.raw`.*\|\s*(?:curl|nc)\b`) },
  { id: 'remote-shell', severity: 'block', test: /\/dev\/tcp\/|\bnc\b[^\n]*\s-e\s|\bbash\s+-i\s*>&|\bmkfifo\b[^\n]*\bnc\b/ },
  { id: 'password-prompt', severity: 'block', test: /osascript\b.*display dialog.*(?:hidden answer|password)/i },
  { id: 'disables-protection', severity: 'block', test: /\bcsrutil\s+disable\b|\bspctl\s+--(?:master|global)-disable\b|\bsocketfilterfw\b.*--setglobalstate\s+off/ },
  { id: 'delete-home', severity: 'block', test: /\brm\s+(?:-\w+\s+)*-\w*[rR]\w*\s+(?:-\w+\s+)*(?:"?(?:~|\$HOME|\/Users\/[^/\s"]+)"?\/?\*?|\/)(?:\s|$|;)/ },
  // Worth a careful look.
  { id: 'admin', severity: 'warn', test: /(?:^|[\s;&|(])sudo\s|with administrator privileges/ },
  { id: 'background-service', severity: 'warn', test: /\blaunchctl\s+(?:load|bootstrap|submit)\b|\/LaunchAgents\/|\/LaunchDaemons\/|\bcrontab\b/ },
  { id: 'removes-quarantine', severity: 'warn', test: /\bxattr\b.*(?:-d|-c|-r).*(?:com\.apple\.quarantine|-c)/ },
  { id: 'uploads-data', severity: 'warn', test: /\bcurl\b.*(?:\s-d\s|--data|\s-F\s|-T\s|--upload-file|-X\s*(?:POST|PUT))/ },
  { id: 'obfuscated', severity: 'warn', test: /base64\s+(?:-d|-D|--decode)\b.*\|\s*(?:ba|z)?sh\b|\beval\s+"?\$\(\s*echo\b.*base64/ },
  { id: 'hosts-file', severity: 'warn', test: /\/etc\/hosts\b/ },
  { id: 'delete-files', severity: 'warn', test: /\brm\s+(?:-\w+\s+)*-\w*[rR]\w*\s/ },
  // Good to know.
  { id: 'shell-profile', severity: 'info', test: /(?:>>?|tee\s+-a)\s*"?(?:~|\$HOME|\$\{HOME\}|\$\{ZDOTDIR[^}]*\})\/\.(?:zshrc|zprofile|bashrc|bash_profile|profile|zshenv)\b|\$(?:PROFILE|SHELL_PROFILE)\b/ },
  { id: 'downloads-more', severity: 'info', test: /\b(?:curl|wget)\b\s+[^\n|]*https?:\/\// }
]

/** Static checks over the script text. Each kind of finding is reported once, with its first match. */
export function analyzeScript(text: string): ScriptFinding[] {
  const findings = new Map<ScriptFindingId, ScriptFinding>()
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  for (const line of lines) {
    for (const rule of RULES) {
      if (findings.has(rule.id) || !rule.test.test(line)) continue
      findings.set(rule.id, { id: rule.id, severity: rule.severity, evidence: line.length > 160 ? `${line.slice(0, 157)}…` : line })
    }
  }
  const order: FindingSeverity[] = ['block', 'warn', 'info']
  return [...findings.values()].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))
}

// --- Putting it together ---------------------------------------------------------

export interface InspectOptions {
  /** Default 512 KB; larger scripts are analysed up to this size. */
  maxBytes?: number
  timeoutMs?: number
  fetch?: typeof fetch
}

const MAX_TEXT_CHARS = 40_000

/** Downloads (never runs) the script a command would run, and reports on it. Accepts a command or a URL. */
export async function inspectRemoteScript(commandOrUrl: string, options: InspectOptions = {}): Promise<ScriptReport | null> {
  const detected = /^https?:\/\/\S+$/.test(commandOrUrl.trim())
    ? { url: commandOrUrl.trim(), inline: null, interpreter: 'sh' }
    : detectRemoteScript(commandOrUrl)
  if (!detected) return null

  const report: ScriptReport = {
    url: detected.url,
    finalUrl: null,
    source: detected.url ? describeSource(detected.url) : null,
    redirectedTo: null,
    interpreter: detected.interpreter,
    bytes: 0,
    sha256: null,
    findings: [],
    verdict: 'ok',
    text: '',
    truncated: false,
    error: null
  }

  let text: string | null = detected.inline
  if (detected.url) {
    try {
      const fetched = await download(detected.url, options)
      text = fetched.text
      report.finalUrl = fetched.finalUrl
      report.bytes = fetched.bytes
      report.truncated = fetched.truncated
      const finalSource = describeSource(fetched.finalUrl)
      if (finalSource && finalSource.host !== report.source?.host) report.redirectedTo = finalSource
    } catch (error) {
      report.error = error instanceof Error ? error.message : String(error)
    }
  } else if (text === null) {
    report.error = 'The embedded script could not be decoded.'
  }

  if (text !== null) {
    report.sha256 = createHash('sha256').update(text).digest('hex')
    report.bytes ||= Buffer.byteLength(text)
    report.findings = analyzeScript(text)
    report.text = text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)}\n…` : text
    report.truncated ||= text.length > MAX_TEXT_CHARS
  }
  if (detected.inline !== null) report.findings.unshift({ id: 'obfuscated', severity: 'warn', evidence: 'The script is hidden in base64 inside the command.' })
  if ((report.source && !report.source.https) || (report.redirectedTo && !report.redirectedTo.https)) {
    report.findings.unshift({ id: 'insecure-download', severity: 'warn', evidence: report.finalUrl ?? report.url ?? '' })
  }
  report.findings = dedupe(report.findings)
  report.verdict = report.findings.some((f) => f.severity === 'block')
    ? 'blocked'
    : report.findings.some((f) => f.severity === 'warn') || report.error || !report.source?.knownAs
      ? 'caution'
      : 'ok'
  return report
}

function dedupe(findings: ScriptFinding[]): ScriptFinding[] {
  const seen = new Set<string>()
  return findings.filter((f) => !seen.has(f.id) && seen.add(f.id))
}

async function download(url: string, options: InspectOptions): Promise<{ text: string; finalUrl: string; bytes: number; truncated: boolean }> {
  const maxBytes = options.maxBytes ?? 512 * 1024
  const response = await (options.fetch ?? fetch)(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    headers: { 'User-Agent': 'curl/8.7.1' }
  })
  if (!response.ok) throw new Error(`The server answered ${response.status}.`)
  const chunks: Uint8Array[] = []
  let bytes = 0
  let truncated = false
  if (response.body) {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      chunks.push(chunk)
      bytes += chunk.length
      if (bytes >= maxBytes) {
        truncated = true
        break
      }
    }
  }
  return { text: Buffer.concat(chunks).toString('utf8'), finalUrl: response.url || url, bytes, truncated }
}
