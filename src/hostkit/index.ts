// hostkit: find, describe and manage what is installed on a Mac.
// Independent of Termless and Electron (Node built-ins only); see README.md.

export * from './types.ts'
export { loadInventory, loadSource, findItem, type LoadOptions } from './inventory.ts'
export { execFileResult, runText, expectSuccess, ExecError, findExecutable, which, isExecutable, shellQuote, command } from './exec.ts'
export { standardPaths, loadShellPath, hostPath, hostEnv, readOnlyEnv } from './environment.ts'
export { measureSize } from './size.ts'
export { runAsAdmin, parseAdminError, adminCommandProblem, type AdminResult, type AdminOptions } from './admin.ts'
export * from './sources/index.ts'
export {
  commandLineToolsInstalled,
  openCommandLineToolsInstaller,
  INSTALL_COMMAND_LINE_TOOLS_SCRIPT
} from './bootstrap/commandLineTools.ts'
export {
  installHomebrew,
  homebrewInstallSupport,
  downloadLatestPackage,
  verifyPackage,
  HOMEBREW_TEAM_IDS,
  type HomebrewInstallOptions
} from './bootstrap/homebrew.ts'
