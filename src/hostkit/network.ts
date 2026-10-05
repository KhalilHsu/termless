import { execFileResult } from './exec.ts'
import type { Env, Exec, NetworkProblem, NetworkProbe, NetworkReport, NetworkTarget, ProxySettings } from './types.ts'

// Why can't this Mac download things? Probes the services installs depend
// on with curl — the same way command-line tools connect, honouring the
// proxy environment variables they honour — and sorts the result into
// "offline", "these services can't be reached" or "too slow", in terms a
// person can act on.

const CURL = '/usr/bin/curl'

export const DEFAULT_TARGETS: NetworkTarget[] = [
  { id: 'github', label: 'GitHub', url: 'https://github.com' },
  { id: 'homebrew', label: 'Homebrew', url: 'https://formulae.brew.sh' },
  { id: 'homebrew-downloads', label: 'Homebrew downloads', url: 'https://ghcr.io' },
  { id: 'npm', label: 'npm', url: 'https://registry.npmjs.org' },
  { id: 'pypi', label: 'PyPI (Python packages)', url: 'https://pypi.org' },
  { id: 'openai', label: 'OpenAI (the AI service)', url: 'https://api.openai.com' }
]

/** Apple's captive-portal check: answers "Success" unless a Wi-Fi login page is in the way. */
export const CAPTIVE_CHECK_URL = 'http://captive.apple.com/hotspot-detect.html'
/** A large file on GitHub (where most installs download from); only the first few MB are fetched. */
export const SPEED_TEST_URL = 'https://github.com/Homebrew/brew/releases/latest/download/Homebrew.pkg'
/** Below this, big downloads (Homebrew bottles, Python wheels…) tend to time out. */
export const SLOW_BYTES_PER_SECOND = 150 * 1024

export interface DiagnoseOptions {
  targets?: NetworkTarget[]
  captiveUrl?: string | null
  /** null skips the speed test. */
  speedUrl?: string | null
  /** Per probe. */
  timeoutMs?: number
  /** Environment the probes run with (decides which proxy curl uses). */
  env?: Env
  /** Login-shell environment, to tell the user about proxies set only there. */
  shellEnv?: Env | null
  exec?: Exec
}

/** curl exit codes that matter here (see `man curl`). */
function problemFromCurl(code: number, stderr: string): NetworkProblem {
  if (code === 5 || /resolve proxy/i.test(stderr)) return 'proxy'
  if (code === 6) return 'dns'
  if (code === 7) return /proxy/i.test(stderr) ? 'proxy' : 'refused'
  if (code === 28) return 'timeout'
  if (code === 35 || code === 51 || code === 58 || code === 60 || code === 77 || code === 90 || code === 91) return 'tls'
  if (code === 52 || code === 55 || code === 56) return 'reset'
  return 'other'
}

async function probe(exec: Exec, target: NetworkTarget, env: Env | undefined, timeoutMs: number): Promise<NetworkProbe> {
  const seconds = String(Math.max(1, Math.round(timeoutMs / 1000)))
  const started = Date.now()
  try {
    const result = await exec(
      CURL,
      ['-sS', '-I', '-L', '--max-redirs', '3', '-o', '/dev/null', '--connect-timeout', seconds, '--max-time', seconds, '-w', '%{http_code}', target.url],
      { env, timeoutMs: timeoutMs + 3000 }
    )
    const status = Number(result.stdout.trim()) || null
    // Any HTTP answer means the service is reachable (even 403/404 for a HEAD request).
    if (result.code === 0 && status) return { ...target, ok: true, status, problem: null, ms: Date.now() - started, detail: null }
    return {
      ...target,
      ok: false,
      status,
      problem: result.code === 0 ? 'other' : problemFromCurl(result.code, result.stderr),
      ms: Date.now() - started,
      detail: result.stderr.trim().split('\n').pop()?.replace(/^curl: \(\d+\)\s*/, '') || null
    }
  } catch (error) {
    return { ...target, ok: false, status: null, problem: 'timeout', ms: Date.now() - started, detail: error instanceof Error ? error.message : String(error) }
  }
}

async function captivePortal(exec: Exec, url: string, env: Env | undefined, timeoutMs: number): Promise<boolean | null> {
  const seconds = String(Math.max(1, Math.round(timeoutMs / 1000)))
  try {
    const result = await exec(CURL, ['-sS', '--max-time', seconds, url], { env, timeoutMs: timeoutMs + 3000 })
    if (result.code !== 0) return null
    return !/Success/i.test(result.stdout)
  } catch {
    return null
  }
}

async function measureSpeed(exec: Exec, url: string, env: Env | undefined): Promise<number | null> {
  try {
    // A 4 MB range of a big file, at most 12 seconds.
    const result = await exec(
      CURL,
      ['-sS', '-L', '-r', '0-4194303', '-o', '/dev/null', '--connect-timeout', '8', '--max-time', '12', '-w', '%{speed_download} %{size_download}', url],
      { env, timeoutMs: 16_000 }
    )
    const [speed, size] = result.stdout.trim().split(/\s+/).map(Number)
    // A timeout still tells us the speed, as long as something arrived.
    if (!(size > 0)) return null
    return Math.round(speed)
  } catch {
    return null
  }
}

/** Proxy settings from macOS (System Settings) and from environment variables. */
export async function readProxySettings(exec: Exec = execFileResult, env: Env = process.env, shellEnv: Env | null = null): Promise<ProxySettings> {
  const system: string[] = []
  try {
    const { stdout, code } = await exec('/usr/sbin/scutil', ['--proxy'], { timeoutMs: 5000 })
    if (code === 0) system.push(...parseScutilProxy(stdout))
  } catch {
    // not fatal
  }
  return { system, environment: proxyVariables(env), shell: shellEnv ? proxyVariables(shellEnv) : [] }
}

/** "HTTPS 127.0.0.1:7890", "SOCKS …", "automatic (PAC) http://…" from `scutil --proxy`. */
export function parseScutilProxy(stdout: string): string[] {
  const value = (key: string) => stdout.match(new RegExp(`\\b${key}\\s*:\\s*(\\S+)`))?.[1]
  const proxies: string[] = []
  for (const [kind, prefix] of [['HTTP', 'HTTP'], ['HTTPS', 'HTTPS'], ['SOCKS', 'SOCKS']] as const) {
    if (value(`${prefix}Enable`) === '1' && value(`${prefix}Proxy`)) proxies.push(`${kind} ${value(`${prefix}Proxy`)}:${value(`${prefix}Port`) ?? '?'}`)
  }
  if (value('ProxyAutoConfigEnable') === '1') proxies.push(`automatic (PAC)${value('ProxyAutoConfigURLString') ? ` ${value('ProxyAutoConfigURLString')}` : ''}`)
  return proxies
}

/** "https_proxy, HTTPS_PROXY = http://127.0.0.1:7890": variables with the same value on one line. */
function proxyVariables(env: Env): string[] {
  const byValue = new Map<string, string[]>()
  for (const k of ['https_proxy', 'HTTPS_PROXY', 'http_proxy', 'HTTP_PROXY', 'all_proxy', 'ALL_PROXY']) {
    const value = env[k]
    if (value) byValue.set(value, [...(byValue.get(value) ?? []), k])
  }
  return [...byValue].map(([value, names]) => `${names.join(', ')} = ${value}`)
}

export async function diagnoseNetwork(options: DiagnoseOptions = {}): Promise<NetworkReport> {
  const exec = options.exec ?? execFileResult
  const timeoutMs = options.timeoutMs ?? 8000
  const env = options.env
  const targets = options.targets ?? DEFAULT_TARGETS

  const [probes, captive, proxy] = await Promise.all([
    Promise.all(targets.map((t) => probe(exec, t, env, timeoutMs))),
    options.captiveUrl === null ? Promise.resolve(null) : captivePortal(exec, options.captiveUrl ?? CAPTIVE_CHECK_URL, env, timeoutMs),
    readProxySettings(exec, env ?? process.env, options.shellEnv ?? null)
  ])
  const reachable = probes.filter((p) => p.ok)
  // Only worth measuring when downloads can start at all.
  const speed = reachable.length && options.speedUrl !== null ? await measureSpeed(exec, options.speedUrl ?? SPEED_TEST_URL, env) : null

  let verdict: NetworkReport['verdict']
  if (captive === true) verdict = 'captive-portal'
  else if (reachable.length === 0) verdict = probes.some((p) => p.problem === 'proxy') ? 'proxy-broken' : 'offline'
  else if (reachable.length < probes.length) verdict = 'partial'
  else if (speed !== null && speed < SLOW_BYTES_PER_SECOND) verdict = 'slow'
  else verdict = 'ok'

  const report: NetworkReport = { verdict, probes, captivePortal: captive, bytesPerSecond: speed, proxy, summary: '' }
  report.summary = summarizeNetwork(report)
  return report
}

/** Plain English, for an agent to explain in the user's language. */
export function summarizeNetwork(report: NetworkReport): string {
  const failed = report.probes.filter((p) => !p.ok)
  const why: Record<NetworkProblem, string> = {
    dns: 'its name could not be looked up (DNS)',
    refused: 'the connection was refused',
    timeout: 'no answer in time',
    tls: 'the secure connection failed (often a proxy or firewall interfering)',
    reset: 'the connection was cut off (a proxy app or firewall may be interfering)',
    proxy: 'the configured proxy could not be reached',
    other: 'it failed'
  }
  const lines: string[] = []
  switch (report.verdict) {
    case 'ok':
      lines.push('The network looks fine: every service answered.')
      break
    case 'captive-portal':
      lines.push('The Wi-Fi seems to need a login page first (like in hotels, airports or cafés). Open a web page in the browser to log in.')
      break
    case 'offline':
      lines.push('This Mac appears to be offline: none of the services could be reached.')
      break
    case 'proxy-broken':
      lines.push('Command-line tools are set to use a proxy that is not responding, so nothing can be downloaded. The proxy app may be closed.')
      break
    case 'partial':
      lines.push(`Online, but these cannot be reached: ${failed.map((p) => p.label).join(', ')}.`)
      break
    case 'slow':
      lines.push(`Online, but downloads are very slow (${formatSpeed(report.bytesPerSecond ?? 0)}), so large downloads may time out.`)
      break
  }
  for (const p of failed) lines.push(`- ${p.label} (${new URL(p.url).host}): ${why[p.problem ?? 'other']}${p.detail ? ` — ${p.detail}` : ''}`)
  if (report.bytesPerSecond !== null && report.verdict !== 'slow') lines.push(`Download speed from GitHub: ${formatSpeed(report.bytesPerSecond)}.`)

  const { system, environment, shell } = report.proxy
  if (system.length) lines.push(`System proxy (System Settings): ${system.join(', ')}.`)
  if (environment.length) lines.push(`Proxy used by command-line tools here: ${environment.join(', ')}.`)
  else if (system.length) {
    lines.push(
      'Command-line tools (brew, git, npm, pip, curl) do NOT use the system proxy automatically, and no proxy is set for them. If websites only work through that proxy, set https_proxy / http_proxy (with the user’s permission).'
    )
  }
  if (shell.length && !environment.length) lines.push(`The user's terminal setup also defines: ${shell.join(', ')} (only applies in Terminal windows).`)
  return lines.join('\n')
}

export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond >= 1024 * 1024) return `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`
  return `${Math.round(bytesPerSecond / 1024)} KB/s`
}

/**
 * Does this command output look like a network failure? Recognises curl,
 * git, Homebrew, npm, pip and generic socket errors.
 */
export function looksLikeNetworkError(output: string): boolean {
  return /Could not resolve (host|proxy)|Failed to connect to|Connection (timed out|refused|reset)|Operation timed out|timed out after|getaddrinfo|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED|ECONNRESET|ENETUNREACH|Network is unreachable|Temporary failure in name resolution|Max retries exceeded|NewConnectionError|SSL_ERROR_SYSCALL|SSL certificate problem|unable to access 'https?:|Failed to download resource|Download failed|curl: \((6|7|28|35|52|56)\)/i.test(
    output
  )
}
