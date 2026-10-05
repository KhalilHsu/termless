import { DEFAULT_TARGETS, diagnoseNetwork, hostEnv, shellEnvironment, type DiagnoseOptions } from '../hostkit'
import type { NetworkReport } from '../shared/types'

// Network diagnosis as Termless runs it: with the environment the agent's
// commands get, and the user's Terminal setup for comparison.
//
// Testing: TERMLESS_NETWORK_TEST_BASE=http://127.0.0.1:<port>/net points
// every probe at a local server (<base>/github, <base>/captive, <base>/speed…)
// so tests can simulate being offline, a blocked service or a slow line
// without touching the real network.

function options(quick: boolean): DiagnoseOptions {
  const base = process.env.TERMLESS_NETWORK_TEST_BASE
  const common: DiagnoseOptions = { env: hostEnv(), shellEnv: shellEnvironment(), timeoutMs: quick ? 4000 : 8000 }
  if (!base) return { ...common, speedUrl: quick ? null : undefined }
  return {
    ...common,
    targets: DEFAULT_TARGETS.map((t) => ({ ...t, url: `${base}/${t.id}` })),
    captiveUrl: `${base}/captive`,
    speedUrl: quick ? null : `${base}/speed`
  }
}

/** Full check, including download speed (takes up to ~20 seconds). */
export function checkNetwork(): Promise<NetworkReport> {
  return diagnoseNetwork(options(false))
}

/** Fast check without the speed test, for the facts given to the agent at the start of a conversation. */
export function quickNetworkCheck(): Promise<NetworkReport> {
  return diagnoseNetwork(options(true))
}
