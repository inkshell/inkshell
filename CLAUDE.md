# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

InkShell is an Electron desktop app that wraps the locally-installed `claude` CLI
in a tabbed GUI. It **drives the real binary in a pseudo-terminal** — it never
reimplements, parses, or fakes Claude Code's behavior. Running the app therefore
requires a working `claude` on `PATH`.

## Commands

```bash
npm run dev          # run with hot reload (electron-vite dev)
npm run build        # typecheck + build all three processes
npm run typecheck    # both scopes below (this is what CI runs)
npm run lint         # eslint over .ts/.tsx
npm run format       # prettier --write; format:check verifies (CI gate)
make check           # typecheck + lint + format:check in one go
npm run pack:mac     # (or pack:win / pack:linux) build a distributable
```

- **Typecheck is split into two `tsc` runs** because each process has a different
  lib/type surface: `typecheck:node` covers `main` + `preload` + `shared`
  (`tsconfig.node.json`), `typecheck:web` covers `renderer` + `shared`
  (`tsconfig.web.json`). A change under `src/shared` must satisfy both.
- **There is no test framework** in this project — no `npm test`, no test files.
  Don't hunt for one; verify changes by running the app (`npm run dev`).
- **Headless screenshot** (dev/CI): `INKSHELL_SCREENSHOT=/path.png ./node_modules/.bin/electron .`
  after a build renders the window, writes a PNG via `capturePage`, and quits.
  `INKSHELL_SCREENSHOT_DELAY` (ms) tunes the wait.

## Architecture

Three Electron processes plus a shared contract, each built independently by
electron-vite (`electron.vite.config.ts`):

- **`src/main`** — privileged. `PtyManager` (`pty-manager.ts`) holds a `Map` of
  live `claude` children, one per tab: a new chat is `claude --session-id <uuid>`,
  a resume is `claude --resume <id>`, both with an optional `--model`. `window.ts`
  owns the frameless `BrowserWindow`. `ipc.ts` registers every handler.
- **`src/preload`** — the **only** door between renderer and OS. Exposes one typed
  object, `window.inkshell`, via `contextBridge`. The renderer has no `ipcRenderer`,
  no `require`, no remote module. Compiled to `.mjs` (package is `"type":
  "module"`) and loaded with `sandbox: false`, `contextIsolation: true`.
- **`src/renderer`** — React + xterm.js. `App.tsx` holds all UI state (config,
  current project, sessions, tabs, active tab — none of it persisted). Each `Tab`
  renders a `TerminalView` that owns one xterm instance for the tab's whole life;
  inactive tabs stay **mounted but hidden** so their scrollback and process keep
  running.
- **`src/shared`** — `types.ts` (data models) and `ipc.ts` (channel-name
  constants) imported by all three via the `@shared` alias.

### The IPC contract is the security boundary — respect it

`src/shared/ipc.ts` is the single source of truth for channel names; main and
preload both import from it so they can't drift on a typo. **Adding a
renderer→main capability means touching four files in lockstep**, never widening
the sandbox: (1) a channel name in `shared/ipc.ts`, (2) a handler in
`main/ipc.ts`, (3) a typed wrapper in `preload/index.ts`, (4) any payload types
in `shared/types.ts`.

### Reads Claude Code's data, never writes it

`main/claude-history.ts` is a read-only reflection of the CLI's own transcript
store at `~/.claude/projects/<encoded-path>/<sessionId>.jsonl`. Two things to
know before touching it:

- The directory name encodes the project path by replacing **every
  non-alphanumeric character with `-`** (`encodeProjectDir`). This is lossy, so a
  path can't be decoded back from the directory name — real paths are instead
  recovered from the `cwd` field inside a transcript (`discoverKnownProjects`).
- The **context meter** reads the newest `assistant` line's usage as
  `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` (output
  excluded), mirroring the CLI's own indicator, against a `CONTEXT_WINDOW` of
  200k. `App.tsx` polls this every 2s for the active tab.

InkShell's own config lives separately at `~/.inkshell/config.json` (`main/config.ts`)
— the recent-projects list, default model, and the editable model picker list.

## Conventions

- **Prettier + ESLint are CI gates.** Run `npm run format` and `npm run lint`
  before finishing; `.prettierrc` (no semicolons, single quotes) governs style.
- **Commits use Conventional Commits** (`feat:`, `fix:`, `docs:`, `refactor:`,
  `chore:`) — this drives the changelog.
- **The renderer UI strings are in Portuguese** (`Novo chat`, `Resumindo…`,
  `(sem mensagens)`, error banners). This is intentional, not a bug — don't
  "correct" them to English unless asked.
