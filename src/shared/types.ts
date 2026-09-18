// Types shared by the main process, the preload bridge and the renderer.

export type PackageKind = 'formula' | 'cask'

export interface InstalledPackage {
  /** Unique id: `formula:<name>` or `cask:<token>`. */
  id: string
  kind: PackageKind
  /** Homebrew name (formula name or cask token). */
  name: string
  /** Human-friendly name (casks often have one, e.g. "1Password CLI"). */
  displayName: string
  description: string | null
  installedVersion: string
  latestVersion: string | null
  outdated: boolean
  tap: string | null
  homepage: string | null
  dependencies: string[]
  /** Installed packages that depend on this one. */
  dependents: string[]
  /** False when Homebrew pulled it in only as a dependency. */
  installedOnRequest: boolean
}

export type BrewInventory =
  | { ok: true; brewPath: string; brewVersion: string; packages: InstalledPackage[]; loadedAt: string }
  | { ok: false; reason: 'not-installed' | 'failed'; message: string }

export interface CodexStatus {
  installed: boolean
  path: string | null
  version: string | null
  /** Set when a codex binary exists but could not be run. */
  error: string | null
}

export interface TermlessApi {
  getInventory(): Promise<BrewInventory>
  getCodexStatus(): Promise<CodexStatus>
  openExternal(url: string): Promise<void>
}
