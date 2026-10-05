import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { adminCommandProblem, parseAdminError } from '../admin.ts'
import { command, shellQuote } from '../exec.ts'
import { loadInventory } from '../inventory.ts'
import { appDraft, parseMasOutdated } from '../sources/applications.ts'
import { parseCargoList, parseGoVersionM } from '../sources/compiled.ts'
import { parseHomebrew } from '../sources/homebrew.ts'
import { parsePnpmList } from '../sources/node.ts'
import { parsePipx, parseUvOutdated, parseUvToolList } from '../sources/python.ts'
import type { Exec, PackageSource } from '../types.ts'

// Recorded output of each tool, so the parsers are checked without the tools installed.

test('pipx list --json', () => {
  const drafts = parsePipx(
    {
      venvs: {
        'yt-dlp': {
          metadata: {
            main_package: { package: 'yt-dlp', package_version: '2025.9.26', apps: ['yt-dlp'] },
            python_version: 'Python 3.13.7'
          }
        }
      }
    },
    '/Users/me/.local/pipx/venvs'
  )
  assert.deepEqual(drafts, [
    {
      name: 'yt-dlp',
      displayName: 'yt-dlp',
      kind: 'cli',
      version: '2025.9.26',
      location: '/Users/me/.local/pipx/venvs/yt-dlp',
      executables: ['yt-dlp'],
      extra: { python: '3.13.7' }
    }
  ])
})

test('uv tool list --show-paths', () => {
  const out = [
    'black v24.2.0 (/Users/me/.local/share/uv/tools/black)',
    '- black (/Users/me/.local/bin/black)',
    '- blackd (/Users/me/.local/bin/blackd)',
    'ruff v0.6.0 (/Users/me/.local/share/uv/tools/ruff)',
    '- ruff (/Users/me/.local/bin/ruff)'
  ].join('\n')
  const drafts = parseUvToolList(out)
  assert.equal(drafts.length, 2)
  assert.deepEqual(drafts[0], {
    name: 'black',
    kind: 'cli',
    version: '24.2.0',
    location: '/Users/me/.local/share/uv/tools/black',
    executables: ['black', 'blackd']
  })
  assert.equal(drafts[1].version, '0.6.0')
  assert.deepEqual(parseUvToolList('No tools installed\n'), [])
  assert.deepEqual([...parseUvOutdated('black v24.2.0 [latest: 25.1.0]\n- black\n')], [['black', '25.1.0']])
})

test('cargo install --list', () => {
  const out = 'ripgrep v14.1.0:\n    rg\nmytool v0.1.0 (/Users/me/src/mytool):\n    mytool\n    mytool-helper\n'
  const drafts = parseCargoList(out, '/Users/me/.cargo/bin')
  assert.deepEqual(drafts[0], { name: 'ripgrep', kind: 'cli', version: '14.1.0', executables: ['rg'], extra: {}, location: '/Users/me/.cargo/bin/rg' })
  assert.deepEqual(drafts[1].executables, ['mytool', 'mytool-helper'])
  assert.deepEqual(drafts[1].extra, { origin: '/Users/me/src/mytool' })
})

test('go version -m', () => {
  const out = [
    '/Users/me/go/bin/gopls: go1.22.0',
    '\tpath\tgolang.org/x/tools/gopls',
    '\tmod\tgolang.org/x/tools/gopls\tv0.15.0\th1:abc=',
    '\tdep\tgolang.org/x/mod\tv0.15.0\th1:def=',
    '/Users/me/go/bin/hello: go1.22.0',
    '\tpath\texample.com/hello',
    '\tmod\texample.com/hello\t(devel)\t'
  ].join('\n')
  const drafts = parseGoVersionM(out)
  assert.equal(drafts.length, 2)
  assert.deepEqual(drafts[0], {
    name: 'gopls',
    kind: 'cli',
    version: 'v0.15.0',
    location: '/Users/me/go/bin/gopls',
    executables: ['gopls'],
    extra: { module: 'golang.org/x/tools/gopls' }
  })
  assert.equal(drafts[1].version, '(devel)')
})

test('pnpm list --global --json', () => {
  const out = JSON.stringify([
    { path: '/Users/me/Library/pnpm/global/5', dependencies: { typescript: { version: '5.9.2', path: '/nonexistent/typescript' } } }
  ])
  const drafts = parsePnpmList(out, { typescript: { current: '5.9.2', latest: '6.0.1' } })
  assert.equal(drafts[0].name, 'typescript')
  assert.equal(drafts[0].latestVersion, '6.0.1')
  assert.equal(drafts[0].outdated, true)
  assert.deepEqual(parsePnpmList('[{"path":"/x"}]', {}), [])
})

test('mas outdated', () => {
  const out = '497799835  Xcode         (15.3 -> 15.4)\n1630034110 Bob (1.21.0 -> 1.22.0)\n'
  assert.deepEqual(parseMasOutdated(out), [
    { id: '497799835', name: 'Xcode', latest: '15.4' },
    { id: '1630034110', name: 'Bob', latest: '1.22.0' }
  ])
})

test('apps: system apps are skipped, App Store apps kept', () => {
  assert.equal(appDraft({ path: '/Applications/Safari.app', fromAppStore: false }, { CFBundleIdentifier: 'com.apple.Safari' }), null)
  const xcode = appDraft({ path: '/Applications/Xcode.app', fromAppStore: true }, { CFBundleIdentifier: 'com.apple.dt.Xcode', CFBundleShortVersionString: '26.0' })
  assert.equal(xcode?.version, '26.0')
  assert.equal(appDraft({ path: '/Applications/Foo.app', fromAppStore: false }, null)?.displayName, 'Foo')
  assert.equal(appDraft({ path: '/Users/me/Applications/Chrome Apps.localized/Claude.app', fromAppStore: false }, { CFBundleIdentifier: 'com.google.Chrome.app.fmpnliohjhemenmnlpbfagaolkdacoja' }), null)
})

test('homebrew: casks claim their app, formulae list dependencies', () => {
  const drafts = parseHomebrew(
    {
      formulae: [
        {
          name: 'wget',
          desc: 'Internet file retriever',
          homepage: 'https://www.gnu.org/software/wget/',
          tap: 'homebrew/core',
          dependencies: ['openssl@3'],
          versions: { stable: '1.25.0' },
          linked_keg: '1.24.5',
          installed: [{ version: '1.24.5', installed_on_request: true }]
        }
      ],
      casks: [
        {
          token: 'visual-studio-code',
          name: ['Microsoft Visual Studio Code'],
          desc: 'Open-source code editor',
          homepage: 'https://code.visualstudio.com/',
          tap: 'homebrew/cask',
          version: '1.104.0',
          installed: '1.104.0',
          depends_on: null,
          artifacts: [
            { app: ['Visual Studio Code.app'], target: '/Applications/Visual Studio Code.app' },
            { binary: ['code'], target: '/opt/homebrew/bin/code' }
          ]
        }
      ]
    },
    { formulae: [{ name: 'wget', current_version: '1.25.0' }], casks: [] },
    '/opt/homebrew'
  )
  assert.equal(drafts[0].outdated, true)
  assert.equal(drafts[0].latestVersion, '1.25.0')
  assert.deepEqual(drafts[0].dependencies, ['openssl@3'])
  assert.equal(drafts[1].kind, 'app')
  assert.deepEqual(drafts[1].claims, ['/Applications/Visual Studio Code.app'])
  assert.deepEqual(drafts[1].executables, ['code'])
})

test('inventory: sources fail independently, duplicates are merged, commands are built', async () => {
  const exec: Exec = async () => ({ stdout: '', stderr: '', code: 0 })
  const brewLike: PackageSource = {
    id: 'brew',
    label: 'Brew',
    detect: async () => ({ path: '/x/brew', version: '1' }),
    list: async () => [
      { name: 'code', kind: 'app', version: '1', location: '/Applications/Code.app', claims: ['/Applications/Code.app'], dependencies: ['lib'] },
      { name: 'lib', kind: 'cli', version: '2' }
    ],
    uninstallCommand: (item, probe) => command([probe.path, 'uninstall', item.name])
  }
  const apps: PackageSource = {
    id: 'apps',
    label: 'Apps',
    detect: async () => ({ path: '/Applications', version: null }),
    list: async () => [
      { name: 'Code', kind: 'app', version: '1', location: '/Applications/Code.app' },
      { name: 'Other', kind: 'app', version: '3', location: '/Applications/Other.app' },
      { name: 'Other', kind: 'app', version: '3', location: '/Users/me/Applications/Other.app' }
    ]
  }
  const broken: PackageSource = {
    id: 'broken',
    label: 'Broken',
    detect: async () => ({ path: '/x/broken', version: null }),
    list: async () => {
      throw new Error('boom')
    }
  }
  const missing: PackageSource = { id: 'none', label: 'None', detect: async () => null, list: async () => [] }

  const inventory = await loadInventory({ sources: [brewLike, apps, broken, missing], exec })
  assert.deepEqual(inventory.items.map((i) => i.id).sort(), ['apps:Other', 'apps:Other@/Users/me/Applications/Other.app', 'brew:code', 'brew:lib'])
  assert.deepEqual(
    inventory.sources.map((s) => [s.id, s.status, s.count, s.error]),
    [
      ['brew', 'ok', 2, null],
      ['apps', 'ok', 2, null],
      ['broken', 'error', 0, 'boom'],
      ['none', 'missing', 0, null]
    ]
  )
  const lib = inventory.items.find((i) => i.id === 'brew:lib')!
  assert.deepEqual(lib.dependents, ['code'])
  assert.equal(lib.commands.uninstall?.display, 'brew uninstall lib')
  assert.equal(inventory.items.find((i) => i.id === 'apps:Other')!.commands.uninstall, null)
})

test('npm source reads package.json for description and commands', async () => {
  const { npm } = await import('../sources/node.ts')
  const root = mkdtempSync(join(tmpdir(), 'hostkit-npm-'))
  const pkgDir = join(root, 'cowsay')
  const { mkdirSync } = await import('node:fs')
  mkdirSync(pkgDir)
  writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ description: 'cows', bin: { cowsay: 'cli.js', cowthink: 'cli.js' } }))
  const exec: Exec = async (_file, args) => {
    if (args[0] === 'ls') return { stdout: JSON.stringify({ dependencies: { cowsay: { version: '1.5.0' } } }), stderr: '', code: 0 }
    if (args[0] === 'root') return { stdout: root + '\n', stderr: '', code: 0 }
    if (args[0] === 'outdated') return { stdout: JSON.stringify({ cowsay: { current: '1.5.0', latest: '1.6.0' } }), stderr: '', code: 1 }
    return { stdout: '11.0.0\n', stderr: '', code: 0 }
  }
  const [cowsay] = await npm.list({ exec, env: {}, home: '/Users/me', checkUpdates: true }, { path: '/x/npm', version: '11' })
  assert.equal(cowsay.description, 'cows')
  assert.deepEqual(cowsay.executables, ['cowsay', 'cowthink'])
  assert.equal(cowsay.latestVersion, '1.6.0')
  assert.equal(cowsay.outdated, true)
})

test('admin: cancelled dialog, failures and refused commands', () => {
  assert.deepEqual(parseAdminError('0:120: execution error: User canceled. (-128)'), { status: 'cancelled' })
  assert.deepEqual(parseAdminError('0:120: execution error: mkdir: /x: File exists (1)'), {
    status: 'failed',
    output: 'mkdir: /x: File exists',
    code: 1
  })
  assert.match(adminCommandProblem('brew install wget') ?? '', /Homebrew/)
  assert.match(adminCommandProblem('/opt/homebrew/bin/brew upgrade') ?? '', /Homebrew/)
  assert.match(adminCommandProblem('csrutil disable') ?? '', /security/)
  assert.match(adminCommandProblem('rm -rf /') ?? '', /disk/)
  assert.equal(adminCommandProblem('installer -pkg /tmp/x.pkg -target /'), null)
  assert.equal(adminCommandProblem('npm install --global cowsay'), null)
})

test('shell quoting', () => {
  assert.equal(shellQuote('wget'), 'wget')
  assert.equal(shellQuote("it's"), `'it'\\''s'`)
  assert.equal(command(['/opt/homebrew/bin/brew', 'install', 'a b']).display, "brew install 'a b'")
})
