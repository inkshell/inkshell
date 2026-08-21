<div align="center">

# ◈ InkShell

**A tabbed desktop workspace for [Claude Code](https://docs.claude.com/en/docs/claude-code) and [Opencode](https://opencode.ai). The CLIs, with style.**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-7c8cff.svg)](./LICENSE)
[![Built with Electron](https://img.shields.io/badge/built%20with-Electron-47848F.svg)](https://www.electronjs.org/)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-98c379.svg)](./CONTRIBUTING.md)

<img src="./docs/images/session.png" alt="A Claude Code session running in an InkShell pane, with the project tree and history on the left and the Git panel on the right" width="100%">

</div>

---

InkShell is for people who already live in a coding-agent CLI — `claude`, `opencode`,
maybe both — and have no intention of leaving it, but who juggle several projects
at once and want a desktop around them. Every session in a pane, every project in
one window, each with its own configuration, so work and personal never share
credentials or history and switching between them costs nothing.

It stays a thin shell around the real thing. InkShell never reimplements either
CLI: it spawns your own locally-installed binary inside a pseudo-terminal, so you
are always running the **original, stable CLI**, and a feature reaches you the day
it ships to the terminal rather than whenever we catch up. No fork, no
repackaged binary, no version lag. Close InkShell and your CLI is exactly where
you left it.

> InkShell is a community project and is **not affiliated with Anthropic**.
> "Claude" and "Claude Code" are trademarks of Anthropic.

## ✨ Features

- **A split workspace, not a tab strip**: show **1, 2 or 4 panes** at once and
  drag a chat from the sidebar — or from another pane — into any of them. Panes
  minimize and maximize without touching the process behind them, so a session you
  push off-screen keeps running and comes back exactly as you left it.
- **Every project in one window**: the sidebar is a tree — each project, with its
  open chats, terminals and files nested underneath, a badge showing which pane
  each one currently sits in, and drag-to-reorder for the list itself. Every
  project row carries one-click buttons — in the CLI's own mark — to start a
  Claude Code chat, an Opencode chat, or a plain terminal **in that project**,
  whether or not it's the one currently selected. The list is yours alone:
  nothing is imported from the CLIs on a first launch, which opens straight on
  the New project screen.
- **Two CLIs, one window**: Claude Code and Opencode run side by side, each chat
  driving the real binary with its own flags, session store and history. Pick the
  agent per chat — a repo migration might call for one, a quick script for the
  other — without leaving the window.
- **History that is the CLIs' own**: InkShell reads Claude Code's transcript
  store (`~/.claude/projects`) and Opencode's session database to list past
  sessions — a toggle above the list picks which CLI's history you're browsing.
  Claude sessions are named with the same `ai-title` the CLI uses; a click
  resumes one in a pane, a right-click deletes it from the list.
- **Per-project configuration**: each project carries an accent color that marks
  every tab belonging to it, its own Claude config directory
  (`CLAUDE_CONFIG_DIR`) — point a project at a separate config dir and its
  sessions, history and login all follow it; no shell aliases, no `.envrc`
  juggling — and a default model for each CLI.
- **Plain terminals, same window**: open your own `$SHELL` in the project
  directory as just another pane — for the `git rebase` or the dev server you
  didn't want to spend a chat on.
- **Launch defaults, not switchers**: the model new chats start on — and Claude
  Code's effort level — are plain settings, global in Settings and overridable
  per project, passed straight to the CLI's `--model` / `--effort` at spawn.
  What a session runs on after that is the CLI's own to manage from its prompt:
  the status bar stays a quiet working-directory line, and model, context and
  effort live where the CLI itself shows them.
- **Git panel**: stage, unstage, commit, and push without leaving the window;
  browse the branch history with unpushed commits marked, and open any diff, file
  or commit as a pane of its own.
- **Files, diffs, and a real editor**: the project's tree with modified files
  marked, files opening in a **Monaco** editor you can actually edit and save, and
  diffs and commits rendered as Monaco diffs. A single click peeks at a file, a
  double click pins it. File paths Claude mentions in its output are clickable —
  verified against the disk, so only real files light up.
- **Quick Open**: fuzzy-search every file in the active project and open it
  straight into the editor.

## 🖼️ A look around

<img src="./docs/images/panes.png" alt="Four panes at once: a Claude Code chat, an Opencode chat, a terminal, and a file open in the editor" width="100%">

<sub><b>Four panes, one window</b> — a Claude Code chat and an Opencode chat on the same project, a terminal, and a file in the editor. Drag any of them between panes; what you push off-screen keeps running.</sub>

<table>
  <tr>
    <td width="50%">
      <img src="./docs/images/projects.png" alt="The InkShell sidebar showing projects with their open chats, terminals and files nested underneath, and the session history below with its Claude/Opencode toggle">
      <sub><b>Projects &amp; history</b> — every project in one tree, its open items nested underneath, and the past sessions of whichever one is selected — Claude Code's or Opencode's, picked by the toggle.</sub>
    </td>
    <td width="50%">
      <img src="./docs/images/diff.png" alt="A diff of src/cart/total.ts open as its own pane next to a Claude Code session and the git panel">
      <sub><b>Diffs as panes</b> — open any changed file, commit, or diff from the git panel and read it beside the session that wrote it.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="./docs/images/project-settings.png" alt="The project settings screen showing folder, name, accent color, Claude config directory and per-CLI default model fields">
      <sub><b>Per-project settings</b> — name, accent color, the Claude config directory this project runs against, and a default model for each CLI.</sub>
    </td>
    <td width="50%">
      <img src="./docs/images/settings.png" alt="The InkShell settings screen showing the text size control and the model and effort defaults for each CLI">
      <sub><b>Settings</b> — text size, and the model / effort defaults new chats start on. Plain text fields passed verbatim to the CLIs, so a newly released model is a config edit rather than a new release.</sub>
    </td>
  </tr>
</table>

## ⌨️ Shortcuts

| Keys                | Action                                                         |
| ------------------- | -------------------------------------------------------------- |
| `⌘T` / `Ctrl+T`     | New chat in the selected project                                |
| `⌘W` / `Ctrl+W`     | Minimize the focused pane (the session keeps running)           |
| `⌘P` / `Ctrl+P`     | Quick Open — fuzzy file search in the active project            |
| `⌘S` / `Ctrl+S`     | Save the file open in the editor                                |
| Middle click        | On a pane: minimize it · on a sidebar item: close it            |
| Right click         | On a project: its settings · on a history card: delete the chat |

## 📦 Requirements

- **[Claude Code](https://docs.claude.com/en/docs/claude-code)** and/or
  **[Opencode](https://opencode.ai)** installed (the `claude` / `opencode`
  commands must run in your terminal) — each chat drives whichever of the two
  you pick. InkShell asks your login shell where they are and also checks the
  usual install locations, so it still finds the CLIs when the app is opened
  from the Finder with a truncated `PATH`. A non-standard install can be pointed
  at directly with `INKSHELL_CLAUDE_BIN` / `INKSHELL_OPENCODE_BIN`.
- **Node.js ≥ 20** and npm to build from source.

## 📥 Install (macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/inkshell/inkshell/main/install.sh | sh
```

That downloads the [latest release](https://github.com/inkshell/inkshell/releases/latest)
— a universal build that runs on Apple Silicon or Intel — and installs it into
`/Applications` (or `~/Applications` when that isn't writable).

> A **Windows version is coming soon.** Until it lands, Windows and Linux users
> can run InkShell from source — see [Getting started](#-getting-started) below.

Why a script and not a plain download? InkShell builds aren't code-signed yet,
and macOS quarantines anything a **browser** downloads, so opening the app that
way greets you with a misleading *"InkShell is damaged and can't be opened"*
dialog. `curl` downloads are never quarantined, so the script installs an app
that just opens. (You can [read the script](./install.sh) first — it's ~70
lines of `sh`.)

<details>
<summary>Installing by hand instead</summary>

Download the `.zip` from the
[Releases page](https://github.com/inkshell/inkshell/releases/latest), unzip it,
move `InkShell.app` to `/Applications`, then clear the quarantine flag your
browser attached to the download:

```bash
xattr -dr com.apple.quarantine /Applications/InkShell.app
```

Without that last step, macOS shows the "damaged" dialog above — the file is
fine; the message is Gatekeeper's way of saying "unsigned and quarantined".

</details>

## 🚀 Getting started

```bash
# 1. Clone
git clone https://github.com/inkshell/inkshell.git
cd inkshell

# 2. Install (also rebuilds the native node-pty module for Electron)
npm install

# 3. Run in development (hot reload)
npm run dev
```

To produce a distributable app for your platform:

```bash
npm run pack:mac     # .zip
npm run pack:win     # NSIS installer
npm run pack:linux   # AppImage + .deb
```

macOS is the only target that ships today. The Windows and Linux builds are
wired up but **haven't been tested yet** — if you try one, an issue (or a PR)
telling us how it went is very welcome.

## 🧠 How it works

InkShell is a standard three-process Electron app:

| Process      | Responsibility                                                                              |
| ------------ | ------------------------------------------------------------------------------------------- |
| **main**     | Spawns `claude` / `opencode` (or your `$SHELL`) in a pseudo-terminal (`node-pty`), reads config & both CLIs' histories, drives git, owns the window. |
| **preload**  | A tiny `contextBridge` exposing a typed, sandboxed `window.inkshell` API.                     |
| **renderer** | React UI: the pane grid, sidebar tree, git/files dock, an `xterm.js` view per session and a Monaco editor per file. |

Two rules the code holds to: the renderer never touches the OS except through
the typed IPC contract in `src/shared`, and the CLIs' own data is **read, never
written** — `~/.claude/projects` and Opencode's store belong to the CLIs;
InkShell keeps its own config in `~/.inkshell/config.json`.

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full picture.

## 🎨 Theming

Every color, radius, and glow lives in CSS variables at the top of
[`src/renderer/src/styles/theme.css`](./src/renderer/src/styles/theme.css).
Re-theming InkShell is a one-file edit.

## 🗺️ Roadmap

Today InkShell speaks **Claude Code** and **Opencode**. The design doesn't
depend on either, though: the app drives a real CLI agent inside a pseudo-terminal
and reads the transcripts that agent already writes, which is a shape more than
one tool fits.

**Codex** and **GitHub Copilot** are the next targets. The goal isn't a lowest
common denominator across all of them, but one window where each project opens
the agent it actually calls for.

## 🤝 Contributing

Contributions are very welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) and our
[Code of Conduct](./CODE_OF_CONDUCT.md). Good first issues are labeled
[`good first issue`](https://github.com/inkshell/inkshell/labels/good%20first%20issue).

## 📄 License

Licensed under the [Apache License 2.0](./LICENSE). See [NOTICE](./NOTICE) for
attribution and trademark details.
