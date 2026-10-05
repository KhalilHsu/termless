// Core suite: Assistant, Installed and History. Only harmless actions: files
// are created inside Termless's own scratch workspace (under the test data
// folder), changes and the administrator card are declined on purpose (so no
// password dialog ever appears), and every conversation (with its Codex
// thread) is deleted at the end.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  check,
  clickText,
  conversations,
  convDir,
  dataDir,
  finish,
  finishTurn,
  js,
  lastAgentText,
  launch,
  nav,
  openFromHistory,
  quit,
  rememberThreads,
  shot,
  sleep,
  state,
  typeAndSend,
  waitFor,
  waitForDom
} from './lib.mjs'

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

console.log('3b. Conversation C: inventory from every source, administrator card (declined), refused admin command')
await clickText('New conversation')
await sleep(800)
const inventory = await js('window.termless.getInventory()')
const found = inventory.sources.filter((x) => x.status === 'ok').map((x) => `${x.id}:${x.count}`)
console.log('  sources:', found.join(' '))
check('inventory has several sources', found.length >= 2)
await nav('Installed')
await waitForDom('.package-row')
await shot('03a-installed')
await nav('Assistant')
const npmNames = inventory.items.filter((i) => i.source === 'npm').map((i) => i.name)
await typeAndSend('Which command-line tools did I install with npm? Check the inventory and answer with just the package names, no commands.')
s = await finishTurn('C1', "Don't allow")
console.log('  answer:', lastAgentText(s))
check('inventory tool used', s.timeline.some((i) => i.kind === 'activity' && i.tool === 'termless_get_inventory'))
check('npm packages named', npmNames.length === 0 || npmNames.some((n) => lastAgentText(s).includes(n.split('/').pop())))
await typeAndSend('Testing Termless: call termless_run_as_admin with the command "ls /var/root" and the reason "Testing the administrator card". Do not run anything else.')
s = await waitFor('admin card', (s) => s.timeline.some((i) => i.kind === 'command' && i.risk === 'admin' && i.status === 'awaiting-approval') || s.phase === 'ready')
const adminCard = s.timeline.find((i) => i.kind === 'command' && i.risk === 'admin')
check('admin card shown with reason', Boolean(adminCard?.reason))
await waitForDom('.card-reason')
await shot('03b-admin-card')
s = await finishTurn('C2', "Don't allow")
check('admin card declined', s.timeline.some((i) => i.id === adminCard?.id && i.status === 'declined'))
await typeAndSend('Testing Termless: call termless_run_as_admin with the command "brew --version" and the reason "Testing". Then tell me in one sentence what happened. Do not run anything else.')
s = await finishTurn('C3', "Don't allow")
console.log('  answer:', lastAgentText(s))
check('brew as admin refused without a card', !s.timeline.some((i) => i.kind === 'command' && i.risk === 'admin' && /brew/.test(i.command)))

console.log('4. History list and titles')
await clickText('New conversation')
s = await waitFor('titles', () => true)
for (let i = 0; i < 90; i++) {
  const list = await conversations()
  if (list.length === 3 && !(await state()).savingMemory) break
  await sleep(1000)
}
await sleep(1500)
let list = await conversations()
console.log('  conversations:', JSON.stringify(list.map((c) => c.title)))
check('three conversations listed', list.length === 3)
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
check('history survives restart', list.length === 3)
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
finish()
