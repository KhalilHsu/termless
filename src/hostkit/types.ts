// Public types of hostkit. Plain data only, so an inventory can be sent over
// IPC, saved as JSON or shown in any UI.

/** What an installed thing is, in terms a person understands. */
export type ItemKind = 'app' | 'cli' | 'other'

/** A command a host app may run (after asking the user). Never run by hostkit itself. */
export interface CommandSpec {
  /** Program and arguments; argv[0] is an absolute path when hostkit knows it. */
  argv: string[]
  /** The same command as one shell-quoted line, for showing and copying. */
  display: string
  /** Needs administrator rights (see runAsAdmin). */
  needsAdmin?: boolean
}

export interface InstalledItem {
  /** Unique across sources: `<source>:<name>`. */
  id: string
  /** Id of the source that installed it, e.g. 'homebrew', 'npm', 'apps'. */
  source: string
  /** Human name of that source, e.g. 'Homebrew'. */
  sourceLabel: string
  /** The name the package manager knows it by. */
  name: string
  /** Friendlier name when there is one (e.g. "Visual Studio Code"). */
  displayName: string
  kind: ItemKind
  version: string | null
  /** Known only when the source can check for updates. */
  latestVersion: string | null
  outdated: boolean
  description: string | null
  homepage: string | null
  /** Folder or bundle on disk, used to measure its size. */
  location: string | null
  /** Commands it puts on the PATH. */
  executables: string[]
  /** Names of other items from the same source that it relies on. */
  dependencies: string[]
  /** Names of items from the same source that rely on it. */
  dependents: string[]
  /** False when it was only pulled in as someone else's dependency. */
  installedOnRequest: boolean
  /** Source-specific facts, e.g. { tap: 'homebrew/core' } or { bundleId: '…' }. */
  extra: Record<string, string>
  /** How to update or remove it with the tool that installed it, and how to install this version again after removing it. */
  commands: { upgrade: CommandSpec | null; uninstall: CommandSpec | null; install: CommandSpec | null }
  /**
   * Paths on disk this item put there (e.g. the .app a Homebrew cask
   * installed). An item from another source at one of these paths is the
   * same thing and is dropped, so nothing is listed twice.
   */
  claims: string[]
}

/** Result of looking for a package manager. */
export interface SourceProbe {
  /** The executable (or folder) that was found. */
  path: string
  version: string | null
}

export interface SourceReport {
  id: string
  label: string
  /** 'missing': the tool isn't on this machine. 'error': it is, but listing failed. */
  status: 'ok' | 'missing' | 'error'
  version: string | null
  path: string | null
  count: number
  error: string | null
  durationMs: number
}

export interface Inventory {
  items: InstalledItem[]
  sources: SourceReport[]
  loadedAt: string
}

// ---------------------------------------------------------------------------
// Running programs

/** Environment variables (compatible with process.env). */
export type Env = Record<string, string | undefined>

export interface ExecOptions {
  env?: Env
  timeoutMs?: number
  cwd?: string
}

export interface ExecResult {
  stdout: string
  stderr: string
  /** Exit code; non-zero is *not* an error by itself (e.g. `npm outdated` exits 1). */
  code: number
}

/**
 * Runs a program. Resolves with its output whatever the exit code; rejects
 * only when it could not be started or timed out. Injectable, so sources can
 * be tested with recorded output.
 */
export type Exec = (file: string, args: string[], options?: ExecOptions) => Promise<ExecResult>

// ---------------------------------------------------------------------------
// Sources

export interface SourceContext {
  exec: Exec
  /** Environment for read-only calls (PATH extended, auto-updates off). */
  env: Env
  home: string
  /** Also ask whether newer versions exist (may use the network). */
  checkUpdates: boolean
}

/** Everything a source fills in; hostkit adds id, labels, commands and dependents. */
export type ItemDraft = Pick<InstalledItem, 'name' | 'kind' | 'version'> &
  Partial<Omit<InstalledItem, 'id' | 'source' | 'sourceLabel' | 'commands' | 'dependents' | 'name' | 'kind' | 'version'>>

/**
 * One way software gets installed on a Mac. Adding a package manager means
 * writing one of these (see README.md).
 */
export interface PackageSource {
  id: string
  label: string
  /** Finds the tool. null when it isn't installed. */
  detect(ctx: SourceContext): Promise<SourceProbe | null>
  /** Lists what it installed. Throw on failure; other sources still load. */
  list(ctx: SourceContext, probe: SourceProbe): Promise<ItemDraft[]>
  installCommand?(name: string, probe: SourceProbe): CommandSpec | null
  /** Installs this item again, ideally the same version (used to undo a removal). Defaults to installCommand(name). */
  reinstallCommand?(item: InstalledItem, probe: SourceProbe): CommandSpec | null
  upgradeCommand?(item: InstalledItem, probe: SourceProbe): CommandSpec | null
  uninstallCommand?(item: InstalledItem, probe: SourceProbe): CommandSpec | null
}

// ---------------------------------------------------------------------------
// Installing Homebrew (bootstrap/homebrew.ts)

export type HomebrewSupport =
  | { ok: true }
  | { ok: false; reason: 'installed' | 'intel' | 'macos-too-old'; detail?: string }

export type HomebrewInstallStep =
  | 'downloading'
  | 'verifying'
  | 'waiting-for-password'
  | 'installing-command-line-tools'
  | 'installing-homebrew'

export interface HomebrewInstallProgress {
  step: HomebrewInstallStep
  /** 0…1 while downloading. */
  fraction?: number
}

export type HomebrewInstallResult =
  | { status: 'ok'; brewPath: string; commandLineTools: boolean }
  | { status: 'cancelled' }
  | { status: 'failed'; step: HomebrewInstallStep | 'checking'; message: string }

// ---------------------------------------------------------------------------
// Scripts from the internet (remoteScript.ts)

export type ScriptFindingId =
  | 'admin'
  | 'delete-files'
  | 'delete-home'
  | 'shell-profile'
  | 'background-service'
  | 'downloads-more'
  | 'keychain'
  | 'uploads-private-files'
  | 'uploads-data'
  | 'disables-protection'
  | 'removes-quarantine'
  | 'password-prompt'
  | 'remote-shell'
  | 'obfuscated'
  | 'hosts-file'
  | 'insecure-download'

/** info: worth knowing. warn: the user should think twice. block: clearly malicious; never run. */
export type FindingSeverity = 'info' | 'warn' | 'block'

export interface ScriptFinding {
  id: ScriptFindingId
  severity: FindingSeverity
  /** The line that triggered it, shortened. */
  evidence: string
}

export interface RemoteScriptCommand {
  /** Where the script is downloaded from; null when it is embedded (base64). */
  url: string | null
  /** Decoded script text for embedded payloads. */
  inline: string | null
  /** Program that would run it: sh, bash, python3… */
  interpreter: string
}

export interface ScriptSource {
  host: string
  https: boolean
  /** Name of a well-known publisher, e.g. "Homebrew", or null when unknown. */
  knownAs: string | null
}

export interface ScriptReport {
  url: string | null
  /** After redirects. */
  finalUrl: string | null
  source: ScriptSource | null
  /** Source of the final URL, when a redirect led somewhere else. */
  redirectedTo: ScriptSource | null
  interpreter: string
  bytes: number
  sha256: string | null
  findings: ScriptFinding[]
  /** blocked: at least one finding with severity 'block'. */
  verdict: 'ok' | 'caution' | 'blocked'
  /** The script (possibly shortened), for people who want to read it. */
  text: string
  truncated: boolean
  /** Why the script could not be downloaded. */
  error: string | null
}

// ---------------------------------------------------------------------------
// Network diagnosis (network.ts)

export interface NetworkTarget {
  id: string
  /** Human name, e.g. "GitHub". */
  label: string
  url: string
}

/** dns: name lookup failed; refused / timeout / reset: connection problems; tls: secure connection broken; proxy: the configured proxy is unreachable. */
export type NetworkProblem = 'dns' | 'refused' | 'timeout' | 'tls' | 'reset' | 'proxy' | 'other'

export interface NetworkProbe extends NetworkTarget {
  ok: boolean
  status: number | null
  problem: NetworkProblem | null
  ms: number
  /** curl's own words, when it failed. */
  detail: string | null
}

export interface ProxySettings {
  /** From System Settings (used by browsers, not by command-line tools). */
  system: string[]
  /** Proxy variables command-line tools here would use. */
  environment: string[]
  /** Proxy variables from the user's shell setup (Terminal windows). */
  shell: string[]
}

export interface NetworkReport {
  verdict: 'ok' | 'offline' | 'captive-portal' | 'proxy-broken' | 'partial' | 'slow'
  probes: NetworkProbe[]
  /** true: a Wi-Fi login page is in the way. null: couldn't tell. */
  captivePortal: boolean | null
  /** Measured download speed from GitHub, when it could be measured. */
  bytesPerSecond: number | null
  proxy: ProxySettings
  /** Plain English for an agent. */
  summary: string
}
