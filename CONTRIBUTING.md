# Contributing to VibeBox

First off — thank you! VibeBox is built by its community, and every issue, idea,
and pull request helps. This guide gets you productive quickly.

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). By
participating, you agree to uphold it. Please report unacceptable behavior via
the channels listed there.

## Ways to contribute

- 🐛 **Report a bug** — open a [bug report](https://github.com/your-org/vibebox/issues/new/choose).
- 💡 **Request a feature** — open a feature request and describe the use case.
- 📝 **Improve the docs** — typos, clarifications, and examples are all welcome.
- 🔧 **Send a pull request** — see below.

## Development setup

```bash
git clone https://github.com/your-org/vibebox.git
cd vibebox
npm install      # rebuilds node-pty for Electron via the postinstall hook
npm run dev      # launches the app with hot reload
```

You will need **Node.js ≥ 20** and a working **`claude`** binary on your `PATH`
(VibeBox spawns it directly).

### Useful scripts

| Command              | What it does                                    |
| -------------------- | ----------------------------------------------- |
| `npm run dev`        | Run the app in development with hot reload.     |
| `npm run build`      | Type-check and build all three processes.       |
| `npm run typecheck`  | Type-check main/preload and renderer.           |
| `npm run lint`       | Run ESLint over the whole codebase.             |
| `npm run format`     | Format sources with Prettier.                   |
| `npm run pack:*`     | Build a distributable for mac/win/linux.        |

### Screenshots for docs / CI

The app has a dev-only capture hook. Set `VIBEBOX_SCREENSHOT` to a target path
and it writes a PNG of the window (via `capturePage`, so no screen-recording
permission is needed) then quits:

```bash
npm run build
VIBEBOX_SCREENSHOT=/tmp/vibebox.png ./node_modules/.bin/electron .
# optional: VIBEBOX_SCREENSHOT_DELAY=6000 to wait longer before capturing
```

## Project layout

```
src/
├── main/        Electron main process (pty, config, history, IPC, window)
├── preload/     contextBridge API surface (the only main↔renderer door)
├── renderer/    React UI (components, hooks, styles)
└── shared/      Types & IPC channel names shared across all three processes
```

A one-page tour lives in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Pull request checklist

Before opening a PR, please make sure:

- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run format` has been run (CI checks formatting).
- [ ] Your change is described clearly, with screenshots for UI changes.
- [ ] Commits are focused and have meaningful messages.

We use [Conventional Commits](https://www.conventionalcommits.org/) for commit
messages (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:` …). It keeps the
changelog readable.

## Design principles

VibeBox stays a **thin, honest shell** around Claude Code:

1. **Never reimplement the CLI.** We drive the real `claude` binary; we don't
   parse or fake its behavior.
2. **Read, don't write, Claude's data.** History and context come from
   `~/.claude/`, which VibeBox only ever reads.
3. **Keep the main↔renderer boundary narrow.** New capabilities go through a
   typed IPC channel in `src/shared/ipc.ts`, never by loosening the sandbox.

## Questions?

Open a [discussion](https://github.com/your-org/vibebox/discussions) or a draft
PR — we're happy to help you find your footing.
