// End-to-end test for the Assistant, driven over the Chrome DevTools Protocol.
// Only harmless actions: files are created inside Termless's own scratch
// workspace (under the test data folder); one change is declined on purpose.
// Usage: see scripts/e2e.sh
import { writeFileSync, existsSync, readFileSync } from 'node:fs'
const [port, outDir, dataDir] = process.argv.slice(2)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let targets
for (let i = 0; i < 60; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.some(t => t.type === 'page')) break } catch {}
  await sleep(500)
}
const page = targets.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0; const pending = new Map()
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } })
const cdp = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const js = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result.result.value }
const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${outDir}/${name}.png`, Buffer.from(r.result.data, 'base64')); console.log('  screenshot', name) }
const state = () => js('window.termless.getAgentState()')
const waitFor = async (label, pred, timeout = 180000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) { const s = await state(); if (pred(s)) return s; await sleep(700) }
  const s = await state(); console.log('TIMEOUT waiting for', label, JSON.stringify(s).slice(-1500)); throw new Error('timeout ' + label)
}
const clickText = (text) => js(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)} && !b.disabled); if (!b) return false; b.click(); return true })()`)
const typeAndSend = (text) => js(`(() => {
  const ta = document.querySelector('.composer textarea');
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, ${JSON.stringify(text)}); ta.dispatchEvent(new Event('input', { bubbles: true }));
  return new Promise(r => setTimeout(() => { document.querySelector('.composer button[type=submit]').click(); r(true) }, 100)) })()`)
const summary = (s) => s.timeline.map((i) => i.kind === 'command' ? `[command ${i.status} ${i.risk}] ${i.command}` : i.kind === 'activity' ? `[activity ${i.status}] ${i.summary}` : i.kind === 'question' ? `[question] ${i.question} -> ${i.answer}` : `[${i.kind}] ${(i.text ?? '').slice(0, 160)}`).join('\n    ')

const finishTurn = async (label, decision = 'Allow') => {
  let clicks = 0
  for (;;) {
    const s = await waitFor(label, (s) => s.phase === 'ready' || s.timeline.some((i) => i.kind === 'command' && i.status === 'awaiting-approval'))
    const pendingCard = s.timeline.find((i) => i.kind === 'command' && i.status === 'awaiting-approval')
    if (!pendingCard) return { s, clicks }
    console.log('  card:', pendingCard.risk, '|', pendingCard.command, '→', decision)
    await sleep(300); await clickText(decision); clicks++
    await sleep(800)
  }
}
await cdp('Runtime.enable'); await cdp('Page.enable')
await sleep(2500)

console.log('1. Setup panel')
await sleep(3000)
await shot('01-setup')
console.log('  start clicked:', await clickText('Start using Termless'))
await sleep(500)
await shot('02-welcome')

console.log('2. Approval card (accept)')
await typeAndSend('Create a file named termless-test.txt in the current folder that contains the word hello. Also remember that I prefer short answers.')
let s = await waitFor('approval', (s) => s.timeline.some((i) => i.kind === 'command' && i.status === 'awaiting-approval'))
await sleep(400); await shot('03-approval')
s = (await finishTurn('turn 1')).s
await sleep(400); await shot('04-after-accept')
console.log('    ' + summary(s))
const f1 = `${dataDir}/workspace/termless-test.txt`
console.log('  file created:', existsSync(f1), existsSync(f1) ? JSON.stringify(readFileSync(f1, 'utf8')) : '')

console.log('3. Question card')
await typeAndSend('Use a choice card to ask me which of two colors I like more: red or blue. Then reply with just my answer.')
s = await waitFor('question', (s) => s.timeline.some((i) => i.kind === 'question' && i.answer === null))
await sleep(400); await shot('05-question')
const q = s.timeline.find((i) => i.kind === 'question' && i.answer === null)
console.log('  question:', q.question, q.options.map((o) => o.label))
console.log('  option clicked:', await js(`(() => { const b = document.querySelector('.question-card .option'); b.click(); return b.textContent })()`))
s = (await finishTurn('turn 2')).s
await sleep(400); await shot('06-after-question')
console.log('    ' + summary(s).split('\n').slice(-3).join('\n'))

console.log('4. Decline')
await typeAndSend('Create another file named decline-test.txt in the current folder.')
s = (await finishTurn('turn 3', "Don't allow")).s
await sleep(400); await shot('07-after-decline')
console.log('    ' + summary(s).split('\n').slice(-3).join('\n'))
console.log('  decline file exists (should be false):', existsSync(`${dataDir}/workspace/decline-test.txt`))

console.log('5. New conversation → memory extraction')
console.log('  new clicked:', await clickText('New conversation'))
await sleep(1500)
s = await waitFor('memory saved', (s) => !s.savingMemory, 150000)
const mem = JSON.parse(readFileSync(`${dataDir}/memory.json`, 'utf8'))
console.log('  facts:', JSON.stringify(mem.facts.map((f) => `${f.source}: ${f.text}`), null, 1))
console.log('  actions:', JSON.stringify(mem.actions.map((a) => a.summary)))
await clickText('Memory'); await sleep(600); await shot('08-memory'); await clickText('Close')

console.log('6. Memory is injected into a new conversation')
await typeAndSend('Without using any tools, what do you already know about my preferences? One sentence.')
s = await waitFor('turn 4 done', (s) => s.phase === 'ready' && s.timeline.some((i) => i.kind === 'agent' && !i.streaming))
await sleep(400); await shot('09-memory-recall')
console.log('    ' + summary(s))

console.log('7. Chinese UI')
await js(`[...document.querySelectorAll('.lang-switch button')].find(b => b.textContent === '中文').click()`)
await typeAndSend('用一句话告诉我这台 Mac 的系统版本和芯片类型，不要运行命令。')
s = await waitFor('turn 5 done', (s) => s.phase === 'ready' && s.timeline.filter((i) => i.kind === 'agent').length >= 2)
await sleep(400); await shot('10-chinese')
console.log('    ' + summary(s).split('\n').slice(-2).join('\n'))
await js(`[...document.querySelectorAll('.lang-switch button')].find(b => b.textContent === 'EN').click()`)
console.log('DONE')
ws.close()
