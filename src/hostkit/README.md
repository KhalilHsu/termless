# hostkit

Find, describe and manage what is installed on a Mac: Homebrew formulae and casks, App Store apps, apps in `/Applications`, global npm / pnpm packages, pipx and uv tools, `cargo install` and `go install` binaries. It can also run a command as administrator through macOS's own password dialog, and install Homebrew from its official package.

It is Termless's module, but it doesn't depend on Termless or Electron. It uses only Node built-ins, so it can be copied into another project (or published as a package) as is.

- Node ≥ 23.6 runs the `.ts` files directly (type stripping). In a bundler, import `index.ts`.
- macOS only.
- Read-only by default. hostkit **never** installs, updates or removes anything on its own: it returns the commands (`CommandSpec`), and the host app decides whether and how to run them, ideally after asking the user. The only things that change the machine are `runAsAdmin` and `installHomebrew`, and both go through macOS's password dialog.

## Use

```ts
import { defaultSources, loadInventory, loadShellPath, measureSize } from './hostkit'

await loadShellPath() // optional: also use the login shell's PATH (nvm, asdf…)
const inventory = await loadInventory({ sources: defaultSources() })

for (const s of inventory.sources) console.log(s.label, s.status, s.count) // 'ok' | 'missing' | 'error'
for (const item of inventory.items) {
  console.log(item.displayName, item.sourceLabel, item.version, item.outdated ? `→ ${item.latestVersion}` : '')
  console.log('  update:', item.commands.upgrade?.display, ' remove:', item.commands.uninstall?.display)
}
await measureSize(inventory.items[0].location!) // bytes, on demand (big apps take a moment)
```

`loadInventory` runs all sources in parallel; each fails on its own (`status: 'error'`) without affecting the others. `checkUpdates: false` skips the checks for newer versions, which may need the network.

Each item carries `commands.upgrade`, `commands.uninstall` and `commands.install` (installs this item again, the same version where the tool allows it, to undo a removal). `diffInventories(before, after)` lists what was added, removed or updated between two inventories; sources that failed in either one are left out of the comparison.

An item that two sources both see (a Homebrew cask and its `.app` in `/Applications`) is listed once. The source that *claims* the path wins, because it knows how to update and remove it.

### Sources

| id | Tool | Lists | Updates known | Update / remove |
|---|---|---|---|---|
| `homebrew` | `brew` | formulae (with dependencies, commands) and casks | yes (`brew outdated`) | `brew upgrade` / `brew uninstall` |
| `appstore` | — (`mas` optional) | apps with an App Store receipt | with `mas` | `mas upgrade`, else opens App Store updates / move to Trash |
| `apps` | — | other `.app` bundles in `/Applications`, `~/Applications` (one sub-folder deep) | no (apps update themselves) | — / move to Trash (Finder, so it can be put back) |
| `npm` | `npm` | `npm -g` packages | yes | `npm install -g x@latest` / `npm uninstall -g` (marked `needsAdmin` when the global folder isn't writable) |
| `pnpm` | `pnpm` | `pnpm add -g` packages | yes | `pnpm add -g x@latest` / `pnpm remove -g` |
| `pipx` | `pipx` | pipx tools | no | `pipx upgrade` / `pipx uninstall` |
| `uv` | `uv` | `uv tool` tools | newer uv only | `uv tool upgrade` / `uv tool uninstall` |
| `cargo` | `cargo` | `cargo install` crates | no | `cargo install` again / `cargo uninstall` |
| `go` | `go` | binaries in `GOBIN` / `GOPATH/bin` | no | `go install <module>@latest` / delete the file |

Skipped on purpose: Apple's own apps that come with macOS, and web apps that a browser created ("Install this site as an app"), which belong to that browser.

### Adding a source

Write a `PackageSource` (see `types.ts`) and add it to the list you pass to `loadInventory` (or to `defaultSources()`):

```ts
import { command, expectSuccess, which, type PackageSource } from './hostkit'

export const bun: PackageSource = {
  id: 'bun',
  label: 'Bun',
  async detect(ctx) {
    const path = which('bun', ctx.env.PATH)
    if (!path) return null
    const out = expectSuccess(await ctx.exec(path, ['--version'], { env: ctx.env }), path)
    return { path, version: out.trim() }
  },
  async list(ctx, probe) {
    // run the tool through ctx.exec and return ItemDrafts: { name, kind, version, … }
    return []
  },
  upgradeCommand: (item, probe) => command([probe.path, 'add', '--global', `${item.name}@latest`]),
  uninstallCommand: (item, probe) => command([probe.path, 'remove', '--global', item.name])
}
```

Rules for sources:

- Only **read** in `detect` and `list`, and run programs through `ctx.exec` with `ctx.env`. That environment turns off auto-updates (`HOMEBREW_NO_AUTO_UPDATE`, update notifiers), and tests can swap in recorded output.
- Keep the parsing in a pure exported function (`parseXxx(stdout)`) and test it with recorded output in `test/`.
- If the source knows which paths on disk an item installed, set `claims`, so duplicates are merged.

### Network diagnosis

```ts
import { diagnoseNetwork } from './hostkit'

const report = await diagnoseNetwork({ env: hostEnv() })
// report.verdict: 'ok' | 'offline' | 'captive-portal' | 'proxy-broken' | 'partial' | 'slow'
// report.probes: [{ id: 'github', ok, status, problem: 'dns' | 'refused' | 'timeout' | 'tls' | 'reset' | 'proxy' | 'other' | null }]
// report.proxy: { system, environment, shell }; report.summary: plain English
```

Probes go through `/usr/bin/curl` on purpose: it honours the same proxy variables as brew, git, npm and pip, so the result is what those tools experience. It also checks Apple's captive-portal URL, measures download speed on a large GitHub file (first 4 MB), and compares the System Settings proxy with the one command-line tools use. `looksLikeNetworkError(output)` recognises network failures in the output of curl, git, Homebrew, npm and pip. Pass `targets`, `captiveUrl` and `speedUrl` to point it elsewhere (tests do).

### Scripts from the internet

```ts
import { detectRemoteScript, inspectRemoteScript } from './hostkit'

detectRemoteScript('curl -fsSL https://sh.rustup.rs | sh') // { url, inline: null, interpreter: 'sh' }
const report = await inspectRemoteScript('bash -c "$(curl -fsSL https://example.com/x.sh)"')
// { source: { host, https, knownAs }, findings: [{ id, severity, evidence }], verdict: 'ok' | 'caution' | 'blocked', text, sha256, … }
```

It recognises `curl … | sh`, `bash -c "$(curl …)"`, `bash <(curl …)`, pipes into python / node / ruby / perl, and base64 payloads piped into a shell. It **downloads the script without running it** (512 KB cap, follows redirects and reports the final host), names well-known publishers, and checks the text statically: `info` (edits shell profile, downloads more), `warn` (sudo, deletes files, background services, removes quarantine, uploads data, obfuscation, /etc/hosts, plain http) and `block` (reads the keychain, uploads private files, remote shell, fake password dialog, disables macOS protections, deletes the home folder). It is a quick screen, not a sandbox: a clean report doesn't prove a script is safe.

### Administrator commands

```ts
import { adminCommandProblem, runAsAdmin } from './hostkit'

const problem = adminCommandProblem(cmd) // refuses brew/pipx/uv/cargo as root, security settings, rm -rf /
const result = await runAsAdmin(cmd, { prompt: 'MyApp needs administrator rights to install X.' })
// { status: 'ok', output } | { status: 'cancelled' } | { status: 'failed', output, code }
```

The command goes to `osascript … with administrator privileges` as an argument (it is never spliced into AppleScript source). macOS shows the system authorization dialog; the app never sees the password.

### Installing Homebrew

```ts
import { homebrewInstallSupport, installHomebrew } from './hostkit'

await homebrewInstallSupport() // { ok: true } | { ok: false, reason: 'installed' | 'intel' | 'macos-too-old' }
await installHomebrew({ prompt: 'MyApp wants to install Homebrew.', onProgress: (p) => console.log(p.step, p.fraction) })
```

This downloads `Homebrew.pkg` from the latest release of github.com/Homebrew/brew. It then checks the package: it must be signed with a Developer ID from `HOMEBREW_TEAM_IDS` (pass `allowedTeamIds` if Homebrew changes signers), and `spctl` must accept it as notarized. Only then is it installed, under **one** password prompt that also installs Apple's Command Line Tools if they are missing. The package needs Apple silicon and macOS 15 or later. On other Macs, `homebrewInstallSupport` says so, and the user installs Homebrew by hand.

## Tests

```bash
cd src/hostkit && npm test        # or: node --test "src/hostkit/test/*.test.ts"
```
