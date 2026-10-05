# Termless

A macOS app for people who don't use the command line.

When a tutorial, a GitHub README, or an AI tells you to "open Terminal and type…", hand it to Termless instead. It explains in plain language what will happen, asks before changing anything, and gets it done for you — powered by the AI agent you already use (currently Codex CLI).

> Status: MVP complete, not yet released. See [docs/product-notes.md](docs/product-notes.md) (in Chinese) for the product and technical plan and what comes next.

## Development

Requirements: macOS, Node.js 20+.

```bash
npm install
npm run dev        # run with hot reload
npm run typecheck
npm test           # hostkit unit tests
npm run build      # production build into out/
npm start          # run the production build
npm run install:mac  # package, ad-hoc sign and install to /Applications (this Mac only)
```

If Electron fails to start after `npm install` with a missing-binary error, run `node node_modules/electron/install.js`.

Screenshot a view without clicking around (the window opens briefly, then quits):

```bash
npm run build
TERMLESS_VIEW=installed TERMLESS_CAPTURE=/tmp/termless.png npx electron .
```

`TERMLESS_VIEW` is one of `assistant`, `installed`, `discover`, `history`.

### Environment variables for development

| Variable | Effect |
|---|---|
| `TERMLESS_USER_DATA` | Use another data folder (memory, workspace, Codex home) instead of `~/Library/Application Support/Termless` |
| `TERMLESS_CODEX_HOME` | Use another Codex home. By default Termless keeps its own, isolated from `~/.codex`; set to `~/.codex` to reuse an existing sign-in |
| `TERMLESS_MODEL` / `TERMLESS_EFFORT` | Override the model (default `gpt-5.6-terra`) and reasoning effort (default `low`) |
| `TERMLESS_EPHEMERAL_THREADS=1` | Don't let Codex keep conversation threads (they can't be resumed after a restart) |
| `TERMLESS_NETWORK_TEST_BASE` | Tests only: point the network checks at a local server (`<base>/github`, `<base>/captive`, `<base>/speed`…) |

### End-to-end test

`scripts/e2e.sh [core|safety]` launches the app with a throwaway data folder and drives it end to end (all suites by default; it exits non-zero if any check fails). The **core** suite covers approval cards (accepted and declined), a question card, memory, the inventory from every source, the administrator card (declined only, so no password dialog appears) and a refused administrator command, History (titles, reopening and continuing a conversation, switching while a card is waiting), restarting the app to resume a real Codex thread, the fallback when a thread is gone, and deleting everything. The **safety** suite serves scripts from a local web server to check that scripts from the internet are inspected before they run, that malicious ones are refused, and that a script swapped after the agent looked at it is blocked by Termless itself; it also simulates being offline, a blocked service and a slow line (`TERMLESS_NETWORK_TEST_BASE` points Termless's network checks at the local server) and checks the network card and the agent's explanation. The suites only create small files inside the throwaway folder, decline every risky card, and delete every Codex thread they created.

### How the Assistant works

- Termless runs `codex app-server` and talks JSON-RPC to it (`src/main/codex/appServer.ts`).
- Each conversation is a Codex thread with approval policy `untrusted`: every command that isn't plainly read-only reaches the user as a confirmation card first. Threads live in Termless's own Codex home, so conversations in History can be continued (`thread/resume`, with a summary-based fallback); deleting a conversation deletes its thread.
- Termless's rules, facts about the Mac, remembered facts and recent changes are sent as developer instructions (`src/main/agent/instructions.ts`).
- Termless gives the agent its own tools — inventory of everything installed, ask-the-user cards, remember/recall/forget, action log, and run-as-administrator (`src/main/agent/tools.ts`) — so memory stays in the app and works with any agent.
- Administrator rights: the agent never types `sudo`. It calls `termless_run_as_admin`; the user approves a card, then macOS asks for the password in its own dialog (Termless never sees it).
- Conversations are saved as they happen (`conversations/*.json`). When the user leaves one, a separate read-only thread extracts lasting facts into memory (`memory.json`) and gives the conversation a short title.
- Changes made on the Mac are logged automatically at the end of each turn and fed back to the agent as context.

### Layout

- `src/hostkit/` – standalone module (no Electron, Node built-ins only) that finds and describes what is installed on a Mac — Homebrew, App Store, apps, npm, pnpm, pipx, uv, cargo, go — and builds the commands to update or remove it; also runs commands as administrator and installs Homebrew. Reusable in other projects; see [its README](src/hostkit/README.md)
- `src/main/` – Electron main process: window, IPC, inventory cache (`inventory.ts`), setup checklist (`setup.ts`)
- `src/main/codex/` – finding Codex and the app-server client
- `src/main/agent/` – conversation session, saved conversations, instructions, tools, memory
- `src/preload/` – the only bridge the UI has to the system (`window.termless`)
- `src/shared/` – types shared by both sides
- `src/renderer/` – React UI; strings in English and Chinese live in `src/renderer/src/i18n.tsx`

## License

[MIT](LICENSE)
