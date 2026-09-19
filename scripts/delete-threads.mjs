// Deletes Codex threads by id (used by the e2e test to leave nothing behind).
// Usage: node scripts/delete-threads.mjs <file with JSON array of thread ids>
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import readline from 'node:readline'

const ids = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const env = { ...process.env }
if (process.env.TERMLESS_CODEX_HOME) env.CODEX_HOME = process.env.TERMLESS_CODEX_HOME
const codex = spawn('codex', ['app-server'], { stdio: ['pipe', 'pipe', 'ignore'], env })
let next = 0
const pending = new Map()
readline.createInterface({ input: codex.stdout }).on('line', (line) => {
  const m = JSON.parse(line)
  if (m.id !== undefined && !m.method && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
})
const request = (method, params) =>
  new Promise((resolve) => {
    const id = ++next
    pending.set(id, resolve)
    codex.stdin.write(JSON.stringify({ id, method, params }) + '\n')
  })

await request('initialize', { clientInfo: { name: 'termless-cleanup', title: null, version: '0' }, capabilities: null })
codex.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n')
let deleted = 0
for (const threadId of ids) {
  const r = await request('thread/delete', { threadId })
  if (!r.error) deleted++
  else console.log(`  ${threadId}: ${r.error.message}`)
}
console.log(`cleanup: deleted ${deleted} of ${ids.length} leftover threads (the rest were already gone)`)
codex.kill()
process.exit(0)
