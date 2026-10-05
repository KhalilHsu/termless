import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { CAPTIVE_CHECK_URL, DEFAULT_TARGETS, diagnoseNetwork, looksLikeNetworkError, parseScutilProxy, SPEED_TEST_URL } from '../network.ts'
import type { Exec, ExecResult } from '../types.ts'

// Fake curl: per URL, either an HTTP status or a curl exit code with its message.
type Behaviour = { status: number } | { code: number; stderr: string }
function fakeCurl(behaviour: (url: string) => Behaviour, options: { captive?: string; speed?: string; scutil?: string } = {}): Exec {
  return async (file, args): Promise<ExecResult> => {
    if (file === '/usr/sbin/scutil') return { stdout: options.scutil ?? '<dictionary> {\n}\n', stderr: '', code: 0 }
    const url = args[args.length - 1]
    if (url === CAPTIVE_CHECK_URL) return { stdout: options.captive ?? '<HTML><BODY>Success</BODY></HTML>', stderr: '', code: 0 }
    if (url === SPEED_TEST_URL) return { stdout: options.speed ?? '5000000 4194304', stderr: '', code: 0 }
    const b = behaviour(url)
    return 'status' in b ? { stdout: String(b.status), stderr: '', code: 0 } : { stdout: '000', stderr: b.stderr, code: b.code }
  }
}

test('everything reachable and fast', async () => {
  const report = await diagnoseNetwork({ exec: fakeCurl(() => ({ status: 200 })) })
  assert.equal(report.verdict, 'ok')
  assert.equal(report.probes.length, DEFAULT_TARGETS.length)
  assert.equal(report.bytesPerSecond, 5000000)
  assert.match(report.summary, /looks fine/)
})

test('offline: nothing resolves', async () => {
  const report = await diagnoseNetwork({ exec: fakeCurl(() => ({ code: 6, stderr: 'curl: (6) Could not resolve host: github.com' })) })
  assert.equal(report.verdict, 'offline')
  assert.ok(report.probes.every((p) => p.problem === 'dns'))
  assert.equal(report.bytesPerSecond, null)
  assert.match(report.summary, /offline/)
})

test('one service blocked', async () => {
  const report = await diagnoseNetwork({
    exec: fakeCurl((url) => (url.includes('github.com') ? { code: 28, stderr: 'curl: (28) Connection timed out after 8001 milliseconds' } : { status: 200 }))
  })
  assert.equal(report.verdict, 'partial')
  assert.deepEqual(report.probes.filter((p) => !p.ok).map((p) => [p.id, p.problem]), [['github', 'timeout']])
  assert.match(report.summary, /cannot be reached: GitHub/)
  assert.match(report.summary, /no answer in time/)
})

test('slow downloads', async () => {
  const report = await diagnoseNetwork({ exec: fakeCurl(() => ({ status: 200 }), { speed: '40000 480000' }) })
  assert.equal(report.verdict, 'slow')
  assert.match(report.summary, /very slow \(39 KB\/s\)/)
})

test('Wi-Fi login page in the way', async () => {
  const report = await diagnoseNetwork({ exec: fakeCurl(() => ({ status: 200 }), { captive: '<html>Please log in to Hotel WiFi</html>' }) })
  assert.equal(report.verdict, 'captive-portal')
})

test('proxy configured but not running', async () => {
  const report = await diagnoseNetwork({
    exec: fakeCurl(() => ({ code: 7, stderr: 'curl: (7) Failed to connect to 127.0.0.1 port 7890 after 0 ms: Could not connect to server (proxy)' })),
    env: { https_proxy: 'http://127.0.0.1:7890' }
  })
  assert.equal(report.verdict, 'proxy-broken')
  assert.deepEqual(report.proxy.environment, ['https_proxy = http://127.0.0.1:7890'])
})

test('system proxy set, command-line tools not using it', async () => {
  const scutil = '<dictionary> {\n  HTTPEnable : 1\n  HTTPPort : 7890\n  HTTPProxy : 127.0.0.1\n  HTTPSEnable : 1\n  HTTPSPort : 7890\n  HTTPSProxy : 127.0.0.1\n  ProxyAutoConfigEnable : 0\n  SOCKSEnable : 0\n}\n'
  assert.deepEqual(parseScutilProxy(scutil), ['HTTP 127.0.0.1:7890', 'HTTPS 127.0.0.1:7890'])
  const report = await diagnoseNetwork({
    exec: fakeCurl((url) => (url.includes('github') || url.includes('openai') ? { code: 28, stderr: 'curl: (28) timed out' } : { status: 200 }), { scutil }),
    env: {},
    shellEnv: { https_proxy: 'http://127.0.0.1:7890' }
  })
  assert.equal(report.verdict, 'partial')
  assert.match(report.summary, /do NOT use the system proxy/)
  assert.match(report.summary, /terminal setup also defines: https_proxy/)
})

test('recognises network errors in command output', () => {
  for (const output of [
    'curl: (6) Could not resolve host: github.com',
    "fatal: unable to access 'https://github.com/x/y.git/': Failed to connect to github.com port 443",
    'npm error code ENOTFOUND',
    'npm ERR! network request to https://registry.npmjs.org/x failed, reason: connect ETIMEDOUT 104.16.0.35:443',
    "pip: Max retries exceeded with url: /simple/requests/ (Caused by NewConnectionError('…: Failed to establish a new connection'))",
    'Error: Failed to download resource "wget (bottle manifest)"\nDownload failed: https://ghcr.io/v2/homebrew/core/wget/manifests/1.25.0'
  ]) {
    assert.ok(looksLikeNetworkError(output), output)
  }
  for (const output of ['Error: No available formula with the name "wgett"', 'permission denied', 'npm error code E404']) {
    assert.ok(!looksLikeNetworkError(output), output)
  }
})

test('real curl against local servers: refused, timeout, ok', async () => {
  const ok: Server = createServer((_req, res) => res.end('ok'))
  // Accepts the connection and never answers.
  const silent: Server = createServer(() => {})
  await Promise.all([ok, silent].map((s) => new Promise<void>((resolve) => s.listen(0, '127.0.0.1', resolve))))
  const port = (s: Server) => (s.address() as AddressInfo).port
  try {
    const report = await diagnoseNetwork({
      targets: [
        { id: 'ok', label: 'OK', url: `http://127.0.0.1:${port(ok)}/` },
        { id: 'silent', label: 'Silent', url: `http://127.0.0.1:${port(silent)}/` },
        { id: 'closed', label: 'Closed', url: 'http://127.0.0.1:9/' },
        { id: 'nodns', label: 'No DNS', url: 'http://nothing.invalid/' }
      ],
      captiveUrl: null,
      speedUrl: null,
      timeoutMs: 2000,
      env: {}
    })
    assert.equal(report.verdict, 'partial')
    assert.deepEqual(
      report.probes.slice(0, 3).map((p) => [p.id, p.ok, p.problem]),
      [
        ['ok', true, null],
        ['silent', false, 'timeout'],
        ['closed', false, 'refused']
      ]
    )
    // Proxy apps in "TUN / fake-IP" mode answer every name, so a missing
    // host shows up as a cut connection instead of a DNS failure.
    const nodns = report.probes[3]
    assert.ok(!nodns.ok && (nodns.problem === 'dns' || nodns.problem === 'reset'), String(nodns.problem))
  } finally {
    ok.close()
    silent.closeAllConnections()
    silent.close()
  }
})
