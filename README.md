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

### Layout

- `src/main/` – Electron main process: window, IPC, Homebrew (`brew.ts`) and Codex (`codex.ts`) detection
- `src/preload/` – the only bridge the UI has to the system (`window.termless`)
- `src/shared/` – types shared by both sides
- `src/renderer/` – React UI; strings in English and Chinese live in `src/renderer/src/i18n.tsx`

## License

[MIT](LICENSE)
