// Undo suite (P1): Termless records what a conversation changed and can undo
// it from History. Nothing outside the throwaway data folder is touched:
// npm's global folder points into it (NPM_CONFIG_PREFIX), and the only
// "settings file" Termless watches is a file inside it (TERMLESS_WATCHED_FILES).
// Installing the small "cowsay" package needs the npm registry.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { check, clickText, conversations, dataDir, finish, finishTurn, js, lastAgentText, launch, nav, quit, shot, sleep, state, typeAndSend, waitFor, waitForDom } from './lib.mjs'

const npmPrefix = join(dataDir, 'npm-global')
const settings = join(dataDir, 'home', '.zshrc')
const ORIGINAL = '# Termless e2e test settings file\nexport EDITOR=nano\n'
mkdirSync(npmPrefix, { recursive: true })
mkdirSync(join(dataDir, 'home'), { recursive: true })
writeFileSync(settings, ORIGINAL)
const cowsayDir = join(npmPrefix, 'lib', 'node_modules', 'cowsay')

await launch({ NPM_CONFIG_PREFIX: npmPrefix, TERMLESS_WATCHED_FILES: settings })
check('setup complete', await clickText('Start using Termless'))

console.log('1. Make two changes: install a tool, edit a settings file')
await typeAndSend('Please install the "cowsay" command-line tool globally with npm. Just install it, nothing else.')
let s = await finishTurn('install', 'Allow')
check('cowsay installed (into the test folder)', existsSync(cowsayDir))
await typeAndSend(`Please add the line "export TERMLESS_E2E=1" at the end of the file ${settings}. Nothing else.`)
s = await finishTurn('edit', 'Allow')
check('settings file changed', readFileSync(settings, 'utf8').includes('TERMLESS_E2E=1'))
const conversationId = s.conversationId

// Changes are recorded when each turn ends (after a fresh look at what is installed).
let summary = null
for (let i = 0; i < 30; i++) {
  summary = (await conversations()).find((c) => c.id === conversationId)
  if (summary?.changes >= 2) break
  await sleep(1000)
}
console.log('  recorded changes:', summary?.changes, '| undoable:', summary?.undoable)
check('two changes recorded', summary?.changes === 2 && summary?.undoable === 2)

console.log('2. Undo them from History')
await clickText('New conversation')
await sleep(1500)
await nav('History')
await waitForDom('.history-undo')
await shot('undo-01-history')
await js(`[...document.querySelectorAll('.history-row')].find(r => r.querySelector('.history-undo'))?.querySelector('.history-undo').click()`)
s = await waitFor('undo conversation', (s) => s.conversationId === conversationId && s.phase !== 'idle' && s.phase !== 'ready')
s = await finishTurn('undo', 'Allow')
if (existsSync(cowsayDir) && !s.timeline.some((i) => i.kind === 'command' && /uninstall/.test(i.command))) {
  // It explained first and is waiting for a go-ahead.
  console.log('  agent asked first:', lastAgentText(s).slice(0, 160).replace(/\n/g, ' '))
  await typeAndSend('Yes, please go ahead.')
  s = await finishTurn('undo (go ahead)', 'Allow')
}
console.log('  answer:', lastAgentText(s).slice(0, 200).replace(/\n/g, ' '))
check('agent listed the changes', s.timeline.some((i) => i.kind === 'activity' && i.tool === 'termless_list_changes'))
check('cowsay removed again', !existsSync(cowsayDir))
check('settings file restored exactly', readFileSync(settings, 'utf8') === ORIGINAL)
for (let i = 0; i < 30; i++) {
  summary = (await conversations()).find((c) => c.id === conversationId)
  if (summary?.undoable === 0) break
  await sleep(1000)
}
check('both changes marked as undone', summary?.changes === 2 && summary?.undoable === 0)
await nav('History')
await sleep(800)
await shot('undo-02-history-after')

await quit()
finish()
