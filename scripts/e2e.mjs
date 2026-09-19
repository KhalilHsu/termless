// End-to-end test for the Assistant and History, driven over the Chrome
// DevTools Protocol. Only harmless actions: files are created inside
// Termless's own scratch workspace (under the test data folder), one change is
// declined on purpose, and every conversation (with its Codex thread) is
// deleted at the end.
// Usage: node scripts/e2e.mjs <outDir> <dataDir>   (see scripts/e2e.sh)
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [outDir, dataDir] = process.argv.slice(2)
const PORT = 9333
// The real Electron binary, not the node_modules/.bin wrapper: killing the
// wrapper would leave the app running.
const ELECTRON = createRequire(import.meta.url)('electron')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let app = null
let ws = null
let msgId = 0
const pending = new Map()

async function launch() {
  app = spawn(ELECTRON, ['.', `--remote-debugging-port=${PORT}`], {
    env: { ...process.env, TERMLESS_USER_DATA: dataDir },
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

const cdp = (method, params = {}) =>
  new Promise((r) => {
    const i = ++msgId
    pending.set(i, r)
    ws.send(JSON.stringify({ id: i, method, params }))
  })
const js = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400))
  return r.result.result.value
}
const shot = async (name) => {
  const r = await cdp('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${outDir}/${name}.png`, Buffer.from(r.result.data, 'base64'))
  console.log('  screenshot', name)
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
const finishTurn = async (label, decision = 'Allow') => {
  for (;;) {
    const s = await waitFor(label, (s) => s.phase === 'ready' || s.timeline.some((i) => i.kind === 'command' && i.status === 'awaiting-approval'))
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
const check = (label, ok) => console.log(`  ${ok ? 'PASS' : 'FAIL'} ${label}`)

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
const writeThreads = () => writeFileSync(join(outDir, 'threads.json'), JSON.stringify([...knownThreads]))
const abort = (error) => {
  console.log('ERROR', error?.message ?? error)
  rememberThreads()
  writeThreads()
  app?.kill('SIGKILL')
  process.exit(1)
}
process.on('uncaughtException', abort)
process.on('unhandledRejection', abort)

// ---------------------------------------------------------------------------
await launch()

console.log('1. Setup')
await shot('01-setup')
check('setup complete', await clickText('Start using Termless'))

console.log('2. Conversation A: approval + memory + question')
await typeAndSend('Create a file named termless-test.txt in the current folder that contains the word hello. Also remember that I prefer short answers.')
let s = await finishTurn('A1')
check('file created', existsSync(join(dataDir, 'workspace', 'termless-test.txt')))
await typeAndSend('Use a choice card to ask me which of two colors I like more: red or blue. Then reply with just my answer.')
s = await waitFor('question', (s) => s.timeline.some((i) => i.kind === 'question' && i.answer === null))
await waitForDom('.question-card .option')
await js(`document.querySelector('.question-card .option').click()`)
s = await finishTurn('A2')
await shot('02-conversation-a')
const idA = s.conversationId

console.log('3. Conversation B: declined change')
await clickText('New conversation')
await sleep(800)
await typeAndSend('Create a file named decline-test.txt in the current folder.')
s = await finishTurn('B1', "Don't allow")
check('declined file absent', !existsSync(join(dataDir, 'workspace', 'decline-test.txt')))
const idB = s.conversationId

console.log('4. History list and titles')
await clickText('New conversation')
s = await waitFor('titles', () => true)
for (let i = 0; i < 90; i++) {
  const list = await conversations()
  if (list.length === 2 && !(await state()).savingMemory) break
  await sleep(1000)
}
await sleep(1500)
let list = await conversations()
console.log('  conversations:', JSON.stringify(list.map((c) => c.title)))
check('two conversations listed', list.length === 2)
await nav('History')
await sleep(600)
await shot('03-history')

console.log('5. Continue A from History (thread still loaded)')
const titleA = list.find((c) => c.id === idA).title
check('opened A', await openFromHistory(titleA))
s = await state()
check('assistant shows A', s.conversationId === idA && s.timeline.length > 3)
await typeAndSend('What was the name of the file you created earlier in this conversation? Answer with just the file name, no commands.')
s = await finishTurn('A3')
console.log('  answer:', lastAgentText(s))
check('remembers context', /termless-test\.txt/.test(lastAgentText(s)))

console.log('6. Switch away while a card is waiting')
await typeAndSend('Create a file named switch-test.txt in the current folder.')
s = await waitFor('switch approval', (s) => s.timeline.some((i) => i.kind === 'command' && i.status === 'awaiting-approval'))
const titleB = list.find((c) => c.id === idB).title
check('opened B while busy', await openFromHistory(titleB))
s = await waitFor('B shown', (s) => s.conversationId === idB && s.phase !== 'working')
check('switch file not created', !existsSync(join(dataDir, 'workspace', 'switch-test.txt')))
await openFromHistory(titleA)
s = await state()
check('A card marked stopped', s.timeline.some((i) => i.kind === 'command' && i.status === 'stopped'))
await shot('04-stopped-card')

console.log('7. Restart: real resume for A, fallback for B')
// Break B's saved thread id so the fallback path is exercised.
rememberThreads()
await quit()
const fileB = join(convDir, `${idB}.json`)
const b = JSON.parse(readFileSync(fileB, 'utf8'))
b.threadId = '01a0b000-0000-7000-8000-000000000000'
writeFileSync(fileB, JSON.stringify(b))
await launch()
list = await conversations()
check('history survives restart', list.length === 2)
await openFromHistory(titleA)
await typeAndSend('Remind me: what file did you create for me earlier? Just the file name, no commands.')
s = await finishTurn('A4')
console.log('  answer:', lastAgentText(s))
check('resumed thread remembers', /termless-test\.txt/.test(lastAgentText(s)))
check('no fallback notice in A', !s.timeline.some((i) => i.kind === 'notice' && /summary|摘要|之前的内容/.test(i.text)))
await openFromHistory(titleB)
await typeAndSend('What file did I ask you to create earlier in this conversation? Just the file name, no commands.')
s = await finishTurn('B2')
console.log('  answer:', lastAgentText(s))
check('fallback notice shown in B', s.timeline.some((i) => i.kind === 'notice' && /summary/.test(i.text)))
check('fallback still knows context', /decline-test\.txt/.test(lastAgentText(s)))
await shot('05-fallback')

console.log('8. Chinese History')
await js(`[...document.querySelectorAll('.lang-switch button')].find(b => b.textContent === '中文').click()`)
await nav('历史')
await sleep(600)
await shot('06-history-zh')
await js(`[...document.querySelectorAll('.lang-switch button')].find(b => b.textContent === 'EN').click()`)

console.log('9. Delete everything (conversations and their Codex threads)')
rememberThreads()
await nav('History')
await sleep(400)
await clickText('Delete all')
for (let i = 0; i < 30 && (await conversations()).length > 0; i++) await sleep(500)
check('history empty', (await conversations()).length === 0)
check('conversation files removed', readdirSync(convDir).length === 0)
await shot('07-history-empty')
await quit()

// B's real thread was orphaned on purpose above; e2e.sh deletes it too.
writeThreads()
console.log('  threads used:', knownThreads.size)
console.log('DONE')
process.exit(0)
