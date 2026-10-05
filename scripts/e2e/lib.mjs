// Shared harness for the end-to-end suites: launches Termless with a
// throwaway data folder, drives it over the Chrome DevTools Protocol, and
// keeps track of the Codex threads it created so e2e.sh can delete them.
// Suites run as: node scripts/e2e/<suite>.mjs <outDir> <dataDir>
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const [outDir, dataDir] = process.argv.slice(2)
const PORT = 9333
// The real Electron binary, not the node_modules/.bin wrapper: killing the
// wrapper would leave the app running.
const ELECTRON = createRequire(import.meta.url)('electron')
const ROOT = new URL('../..', import.meta.url).pathname
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let app = null
let ws = null
let msgId = 0
const pending = new Map()

async function launch(extraEnv = {}) {
  app = spawn(ELECTRON, ['.', `--remote-debugging-port=${PORT}`], {
    cwd: ROOT,
    env: { ...process.env, TERMLESS_USER_DATA: dataDir, ...extraEnv },
    stdio: 'ignore'
  })
  let targets = []
  for (let i = 0; i < 60; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      if (targets.some((t) => t.type === 'page')) break
    } catch {}
    await sleep(500)
  }
  ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r))
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m)
      pending.delete(m.id)
    }
  })
  await cdp('Runtime.enable')
  await cdp('Page.enable')
  await sleep(3000)
  // Confirmation dialogs would block the page; answer "yes" to all of them.
  await js('window.confirm = () => true')
}

async function quit() {
  ws.close()
  const exited = new Promise((r) => app.once('exit', () => r(true)))
  app.kill('SIGTERM')
  // Quitting saves memories first (bounded at 20s by the app itself).
  const ok = await Promise.race([exited, sleep(30000).then(() => false)])
  check('app quits cleanly', ok)
  if (!ok) app.kill('SIGKILL')
  await sleep(1000)
}

// Every call gives up after a while, so a stuck page fails the run instead of hanging it.
const cdp = (method, params = {}, timeoutMs = 60_000) =>
  new Promise((resolve, reject) => {
    const i = ++msgId
    const timer = setTimeout(() => {
      pending.delete(i)
      reject(new Error(`${method} did not answer within ${timeoutMs / 1000}s`))
    }, timeoutMs)
    pending.set(i, (m) => {
      clearTimeout(timer)
      resolve(m)
    })
    ws.send(JSON.stringify({ id: i, method, params }))
  })
const js = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400))
  return r.result.result.value
}
// Screenshots need the window to be painted; with the display asleep they
// never arrive. They are a nice-to-have, so skip them rather than block.
const shot = async (name) => {
  try {
    const r = await cdp('Page.captureScreenshot', { format: 'png' }, 10_000)
    writeFileSync(`${outDir}/${name}.png`, Buffer.from(r.result.data, 'base64'))
    console.log('  screenshot', name)
  } catch (error) {
    console.log('  screenshot', name, 'skipped:', error.message)
  }
}
const state = () => js('window.termless.getAgentState()')
const conversations = () => js('window.termless.listConversations()')
const waitFor = async (label, pred, timeout = 180000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const s = await state()
    if (pred(s)) return s
    await sleep(700)
  }
  console.log('TIMEOUT waiting for', label, JSON.stringify(await state()).slice(-1500))
  throw new Error('timeout ' + label)
}
const clickText = (text, scope = 'document') =>
  js(`(() => { const b = [...${scope}.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)} && !b.disabled); if (!b) return false; b.click(); return true })()`)
const nav = (label) => js(`[...document.querySelectorAll('.nav-item')].find(b => b.textContent.includes(${JSON.stringify(label)})).click()`)
const typeAndSend = (text) =>
  js(`(() => {
    const ta = document.querySelector('.composer textarea');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, ${JSON.stringify(text)}); ta.dispatchEvent(new Event('input', { bubbles: true }));
    return new Promise(r => setTimeout(() => { document.querySelector('.composer button[type=submit]').click(); r(true) }, 100)) })()`)
const openFromHistory = async (title) => {
  await nav('History')
  await sleep(500)
  const ok = await js(`(() => { const b = [...document.querySelectorAll('.history-open')].find(b => b.textContent.includes(${JSON.stringify(title)})); if (!b) return false; b.click(); return true })()`)
  await sleep(800)
  return ok
}
const lastAgentText = (s) => [...s.timeline].reverse().find((i) => i.kind === 'agent')?.text ?? ''
const planWaiting = (s) => s.timeline.find((i) => i.kind === 'plan' && i.decision === null && !i.expired)
// Answers every card until the turn ends: commands get `decision`; a plan
// card gets Start when commands are being allowed, Not now otherwise.
const finishTurn = async (label, decision = 'Allow') => {
  for (;;) {
    const s = await waitFor(label, (s) => s.phase === 'ready' || s.timeline.some((i) => i.kind === 'command' && i.status === 'awaiting-approval') || Boolean(planWaiting(s)))
    const plan = planWaiting(s)
    if (plan) {
      const answer = decision === 'Allow' ? 'Start' : 'Not now'
      console.log('  plan:', plan.title, '→', answer)
      await waitForDom('.plan-card .card-actions')
      await clickText(answer)
      await sleep(800)
      continue
    }
    const card = s.timeline.find((i) => i.kind === 'command' && i.status === 'awaiting-approval')
    if (!card) return s
    console.log('  card:', card.risk, '|', card.command, '→', decision)
    await waitForDom('.card-actions')
    await clickText(decision)
    await sleep(800)
  }
}
const waitForDom = async (selector, timeout = 15000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await js(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return true
    await sleep(300)
  }
  throw new Error('no element ' + selector)
}
let failures = 0
const check = (label, ok) => {
  if (!ok) failures++
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`)
}
/** Records the threads for cleanup and exits non-zero if any check failed. */
const finish = () => {
  rememberThreads()
  writeThreads()
  console.log(failures ? `DONE with ${failures} failed check(s)` : 'DONE')
  process.exit(failures ? 1 : 0)
}

const convDir = join(dataDir, 'conversations')
const knownThreads = new Set()
const rememberThreads = () => {
  if (!existsSync(convDir)) return
  for (const f of readdirSync(convDir)) {
    try {
      const id = JSON.parse(readFileSync(join(convDir, f), 'utf8')).threadId
      if (id) knownThreads.add(id)
    } catch {}
  }
}
// Each suite appends to the same list, so e2e.sh can clean up after all of them.
const writeThreads = () => {
  const file = join(outDir, 'threads.json')
  const earlier = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []
  writeFileSync(file, JSON.stringify([...new Set([...earlier, ...knownThreads])]))
}
const abort = (error) => {
  console.log('ERROR', error?.message ?? error)
  rememberThreads()
  writeThreads()
  app?.kill('SIGKILL')
  process.exit(1)
}
process.on('uncaughtException', abort)
process.on('unhandledRejection', abort)
// Stopped from outside (Ctrl+C, a timeout): still record the threads and close the app.
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => abort(new Error(`stopped by ${signal}`)))

export {
  sleep,
  launch,
  quit,
  cdp,
  js,
  shot,
  state,
  conversations,
  waitFor,
  clickText,
  nav,
  typeAndSend,
  openFromHistory,
  lastAgentText,
  finishTurn,
  waitForDom,
  check,
  finish,
  rememberThreads,
  convDir
}
