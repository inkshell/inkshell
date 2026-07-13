# Architecture

VibeBox is a standard three-process Electron application. This page is the map;
the code comments are the territory.

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Electron main process                         │
│                                                                        │
│   window.ts        BrowserWindow + frameless chrome                    │
│   pty-manager.ts   spawns `claude` in node-pty, streams bytes          │
│   config.ts        ~/.vibebox/config.json load / save                  │
│   claude-history.ts reads ~/.claude/projects (sessions, context)       │
│   ipc.ts           registers every IpcChannel handler                  │
└───────────────▲───────────────────────────────────────┬───────────────┘
                │ ipcMain.handle / .on                   │ webContents.send
                │                                         ▼
┌───────────────┴───────────────────────────────────────────────────────┐
│                    preload  (contextBridge, sandboxed)                  │
│   exposes a single typed object: window.vibebox = { pty, config, … }   │
└───────────────▲───────────────────────────────────────────────────────┘
                │ window.vibebox.*
                ▼
┌───────────────────────────────────────────────────────────────────────┐
│                       renderer (React + xterm.js)                       │
│   App.tsx        state & orchestration (tabs, project, meter)          │
│   components/     Sidebar · TabBar · Toolbar · TerminalView · Settings │
└───────────────────────────────────────────────────────────────────────┘
```

## The processes

### main (`src/main`)

Owns everything privileged. The most important piece is **`PtyManager`**: one
instance per window, holding a `Map` of live `claude` child processes. Each new
chat is `claude --session-id <uuid>`; a resume is `claude --resume <id>`; both
take an optional `--model`. Bytes from the child are pushed to the renderer over
the `pty:data` channel; the child's exit is pushed over `pty:exit`.

`claude-history.ts` is a read-only reflection of Claude Code's own transcript
store under `~/.claude/projects/<encoded-path>/*.jsonl`. It powers the history
list (first user message + creation time) and the context meter (the newest
assistant turn's `input + cache_creation + cache_read` tokens).

### preload (`src/preload`)

The **only** bridge between renderer and OS. It exposes `window.vibebox`, a
narrow, fully-typed object. There is no `ipcRenderer`, no `require`, and no
remote module in the renderer — a compromised page can do exactly what these
functions allow and nothing more. Channel names come from `src/shared/ipc.ts` so
the two sides can never drift on a typo.

### renderer (`src/renderer`)

A React app. `App.tsx` holds the state that the original desktop app kept in its
`ClaudeUiApp` struct: the config, current project, session list, open tabs, and
the active tab. Each tab renders a **`TerminalView`** that owns one `xterm.js`
instance for its whole lifetime — inactive tabs stay mounted (just hidden) so
their scrollback and process keep running.

## Data flow: opening a new chat

1. User clicks **New Chat** (or presses `⌘T`). `App` pushes a `Tab` with a local
   id and no `ptyId` yet.
2. The tab's `TerminalView` mounts, fits its grid, and calls
   `window.vibebox.pty.create({ cwd, model, cols, rows })`.
3. `main` spawns `claude`, returns `{ ptyId, sessionId }`, and starts streaming.
4. `TerminalView` reports the ids back via `onReady`; `App` records them on the
   tab. From here, keystrokes flow `xterm → pty.write → claude`, and output
   flows `claude → pty:data → xterm`.
5. A 2-second poll asks `main` for the session's context tokens to update the
   meter.

## Where state lives

| State                     | Home                                             |
| ------------------------- | ------------------------------------------------ |
| Model list, default model | `~/.vibebox/config.json` (via `config.ts`)       |
| Recent projects           | same file                                        |
| Session transcripts       | `~/.claude/projects/` (owned by Claude Code)     |
| Open tabs / UI state      | in-memory React state (not persisted)            |

## Why these choices

- **node-pty + xterm.js** instead of parsing CLI output: VibeBox runs the *real*
  `claude` in a real PTY, so behavior is identical to a terminal.
- **A typed IPC contract** (`shared/`) keeps the security boundary honest and
  refactors safe.
- **CSS-variable theming** makes the whole look a single-file edit.
