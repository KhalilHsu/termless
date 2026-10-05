// hostkit: find, describe and manage what is installed on a Mac.
// Independent of Termless and Electron (Node built-ins only); see README.md.

export * from './types.ts'
export { loadInventory, loadSource, findItem, type LoadOptions } from './inventory.ts'
export { execFileResult, runText, expectSuccess, ExecError, findExecutable, which, isExecutable, shellQuote, command } from './exec.ts'
export { standardPaths, loadShellPath, shellEnvironment, hostPath, hostEnv, readOnlyEnv } from './environment.ts'
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
export {
  detectRemoteScript,
  describeSource,
  analyzeScript,
  inspectRemoteScript,
  type InspectOptions
} from './remoteScript.ts'
export {
  diagnoseNetwork,
  summarizeNetwork,
  readProxySettings,
  parseScutilProxy,
  looksLikeNetworkError,
  formatSpeed,
  DEFAULT_TARGETS,
  CAPTIVE_CHECK_URL,
  SPEED_TEST_URL,
  SLOW_BYTES_PER_SECOND,
  type DiagnoseOptions
} from './network.ts'
export { diffInventories, isEmptyDiff, type InventoryDiff } from './diff.ts'
