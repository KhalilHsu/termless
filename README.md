# Termless

A macOS app for people who don't use the command line.

When a tutorial, a GitHub README, or an AI tells you to "open Terminal and type…", hand it to Termless instead. It explains in plain language what will happen, asks before changing anything, and gets it done for you — powered by the AI agent you already use (currently Codex CLI).

> Status: early planning. See [docs/product-notes.md](docs/product-notes.md) (in Chinese) for the product and technical plan.

## Development

Requirements: macOS, Node.js 20+.

```bash
npm install
npm run dev        # run with hot reload
npm run typecheck
npm run build      # production build into out/
npm start          # run the production build
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

### End-to-end test

`scripts/e2e.sh` launches the app with a throwaway data folder and drives it end to end: approval cards (accepted and declined), a question card, memory, History (titles, reopening and continuing a conversation, switching while a card is waiting), restarting the app to resume a real Codex thread, the fallback when a thread is gone, and deleting everything. It only creates small files inside the throwaway folder, and deletes every Codex thread it created.

### How the Assistant works

- Termless runs `codex app-server` and talks JSON-RPC to it (`src/main/codex/appServer.ts`).
- Each conversation is a Codex thread with approval policy `untrusted`: every command that isn't plainly read-only reaches the user as a confirmation card first. Threads live in Termless's own Codex home, so conversations in History can be continued (`thread/resume`, with a summary-based fallback); deleting a conversation deletes its thread.
- Termless's rules, facts about the Mac, remembered facts and recent changes are sent as developer instructions (`src/main/agent/instructions.ts`).
- Termless gives the agent its own tools — inventory, ask-the-user cards, remember/recall/forget, action log (`src/main/agent/tools.ts`) — so memory stays in the app and works with any agent.
- Conversations are saved as they happen (`conversations/*.json`). When the user leaves one, a separate read-only thread extracts lasting facts into memory (`memory.json`) and gives the conversation a short title.
- Changes made on the Mac are logged automatically at the end of each turn and fed back to the agent as context.

### Layout

- `src/main/` – Electron main process: window, IPC, Homebrew (`brew.ts`), setup checklist (`setup.ts`)
- `src/main/codex/` – finding Codex and the app-server client
- `src/main/agent/` – conversation session, saved conversations, instructions, tools, memory
- `src/preload/` – the only bridge the UI has to the system (`window.termless`)
- `src/shared/` – types shared by both sides
- `src/renderer/` – React UI; strings in English and Chinese live in `src/renderer/src/i18n.tsx`

## License

[MIT](LICENSE)
