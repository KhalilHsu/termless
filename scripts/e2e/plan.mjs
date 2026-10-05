// Plan suite (P1): a GitHub link or tutorial becomes a plan card first; the
// user starts it (or not), and the card follows the progress. Nothing gets
// installed: the one command reached is declined, and the real GitHub
// repositories are only read, then the plan is turned down.
import { createServer } from 'node:http'
import { check, clickText, finishTurn, finish, lastAgentText, launch, quit, shot, sleep, state, typeAndSend, waitFor, waitForDom } from './lib.mjs'

const README = `# PixelShrink

Shrink photos from the command line.

## Install

1. Install Python 3.12 with Homebrew:

   \`\`\`
   brew install python@3.12
   \`\`\`

2. Install PixelShrink with pipx:

   \`\`\`
   brew install pipx
   pipx install pixelshrink
   \`\`\`

3. Check it works:

   \`\`\`
   pixelshrink --help
   \`\`\`
`
const server = createServer((req, res) => {
  if (req.url === '/project/README.md') {
    res.writeHead(200, { 'Content-Type': 'text/markdown' })
    res.end(README)
    return
  }
  res.writeHead(404)
  res.end()
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`

const planOf = (s) => s.timeline.find((i) => i.kind === 'plan')
const firstCommandIndex = (s) => s.timeline.findIndex((i) => i.kind === 'command' && i.status !== 'done')
// Stops early when a change is asked for before any plan (that is a failure, and the card is declined below).
const waitForPlan = (label) =>
  waitFor(label, (s) => (planOf(s) && planOf(s).decision === null) || s.phase === 'ready' || s.timeline.some((i) => i.kind === 'command' && i.status === 'awaiting-approval'), 240_000)

await launch()
check('setup complete', await clickText('Start using Termless'))

console.log('1. A tutorial link becomes a plan; started, then stopped at a declined step')
await typeAndSend(`I want to use this project: ${base}/project/README.md — can you set it up for me?`)
let s = await waitForPlan('plan card')
let plan = planOf(s)
console.log('  plan:', plan?.title, '|', plan?.steps.map((step) => step.title).join(' → '))
check('read the page without a card', s.timeline.some((i) => i.kind === 'activity' && i.tool === 'termless_read_page'))
check('plan card with several steps', (plan?.steps.length ?? 0) >= 2)
check('no change was asked for before the plan', firstCommandIndex(s) === -1 || firstCommandIndex(s) > s.timeline.indexOf(plan))
if (plan) {
  await waitForDom('.plan-card .card-actions')
  await shot('plan-01-proposed')
  await clickText('Start')
}
s = await finishTurn('plan run', "Don't allow")
plan = planOf(s)
console.log('  steps:', plan?.steps.map((step) => step.status).join(', '), '| stopped at:', plan?.stoppedAt, '|', lastAgentText(s).slice(0, 140).replace(/\n/g, ' '))
check('plan was accepted', plan?.decision === 'accepted')
check('a step was started', Boolean(plan?.steps.some((step) => step.status !== 'pending')))
check('card shows where it stopped', typeof plan?.stoppedAt === 'number' && plan.steps.some((step) => step.status !== 'done'))
check('nothing was installed (the command was declined)', s.timeline.filter((i) => i.kind === 'command').every((i) => i.status !== 'done' || !/\b(brew|pipx)\s+install\b/.test(i.command)))
await waitForDom('.plan-card')
await shot('plan-02-stopped')

console.log('2. Real GitHub projects: a plan for each, turned down')
for (const repo of ['yt-dlp/yt-dlp', 'simonw/llm', 'comfyanonymous/ComfyUI']) {
  await clickText('New conversation')
  await sleep(800)
  await typeAndSend(`I'd like to try https://github.com/${repo} on my Mac. Can you set it up for me?`)
  s = await waitForPlan(`plan for ${repo}`)
  plan = planOf(s)
  console.log(`  ${repo}: ${plan ? plan.steps.length + ' steps: ' + plan.steps.map((step) => step.title).join(' → ') : 'no plan — ' + lastAgentText(s).slice(0, 120)}`)
  check(`${repo}: read from GitHub`, s.timeline.some((i) => i.kind === 'activity' && i.tool === 'termless_read_page'))
  check(`${repo}: plan with several steps`, (plan?.steps.length ?? 0) >= 2)
  if (plan) {
    await waitForDom('.plan-card .card-actions')
    if (repo === 'comfyanonymous/ComfyUI') await shot('plan-03-comfyui')
    await clickText('Not now')
  }
  s = await finishTurn(`after declining ${repo}`, "Don't allow")
  // Read-only look-arounds before the plan are fine; nothing may run after it was turned down.
  const after = s.timeline.slice(s.timeline.indexOf(planOf(s)) + 1)
  check(`${repo}: nothing ran after "Not now"`, planOf(s)?.decision === 'declined' && after.every((i) => i.kind !== 'command' || i.status !== 'done'))
}

await quit()
server.close()
finish()
