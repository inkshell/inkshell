<div align="center">

# ◈ InkShell

**A tabbed desktop workspace for [Claude Code](https://docs.claude.com/en/docs/claude-code) — the CLI, with style.**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-7c8cff.svg)](./LICENSE)
[![Built with Electron](https://img.shields.io/badge/built%20with-Electron-47848F.svg)](https://www.electronjs.org/)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-98c379.svg)](./CONTRIBUTING.md)

</div>

---

InkShell wraps the `claude` command-line agent in a cool, modern GUI: open
multiple sessions in **tabs**, browse your **projects and history**, switch
**models** on the fly, and watch your **context window** fill up — all without
leaving a single, beautiful window.

It is a thin, respectful shell around the real thing. InkShell never reimplements
Claude Code; it launches your own locally-installed `claude` binary inside a
pseudo-terminal, so every prompt, color, and `/`-command behaves exactly as it
does in your terminal — just nicer to look at.

> InkShell is a community project and is **not affiliated with Anthropic**.
> "Claude" and "Claude Code" are trademarks of Anthropic.

## ✨ Features

- **Tabbed sessions** — run several Claude Code chats side by side, each its own
  process, with `⌘T` / `⌘W` to open and close.
- **Projects & history** — pick any folder as a working directory; InkShell reads
  Claude Code's own transcript store (`~/.claude/projects`) to list and resume
  past sessions.
- **Live model switcher** — one tap types `/model <alias>` into the session.
  The model list is fully editable in Settings, so a newly released model is a
  config edit, not a new release.
- **Context meter** — a fuel gauge that mirrors the CLI's context indicator,
  reading the live token count from the active session's transcript.
- **Git panel** — stage, unstage, commit, and push without leaving the window;
  browse branch history and open any diff, file, or commit as a viewer tab.
  Commit messages can be drafted by Claude with one click.
- **File browser** — the project's tree in the same dock, with modified files
  marked, so you can open a file next to the session that's editing it.
- **Analytics & memory shortcuts** — quick access to `/stats` and (soon) a
  memory viewer.
- **Seamless, frameless UI** — floating traffic lights on macOS, custom window
  controls elsewhere, and the "Midnight Ink" dark theme throughout: cool graphite
  chrome, an iris accent, and a per-model hue so you always know which Claude
  you're talking to.

## 📦 Requirements

- **[Claude Code](https://docs.claude.com/en/docs/claude-code)** installed and
  on your `PATH` (the `claude` command must run from a terminal).
- **Node.js ≥ 20** and npm to build from source.

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
npm run pack:mac     # .dmg + .zip
npm run pack:win     # NSIS installer
npm run pack:linux   # AppImage + .deb
```

## 🧠 How it works

InkShell is a standard three-process Electron app:

| Process      | Responsibility                                                                 |
| ------------ | ------------------------------------------------------------------------------ |
| **main**     | Spawns `claude` in a pseudo-terminal (`node-pty`), reads config & history, owns the window. |
| **preload**  | A tiny `contextBridge` exposing a typed, sandboxed `window.inkshell` API.        |
| **renderer** | React UI: tabs, sidebar, toolbar, and an `xterm.js` view per session.          |

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full picture.

## 🎨 Theming

Every color, radius, and glow lives in CSS variables at the top of
[`src/renderer/src/styles/theme.css`](./src/renderer/src/styles/theme.css).
Re-theming InkShell is a one-file edit.

## 🤝 Contributing

Contributions are very welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) and our
[Code of Conduct](./CODE_OF_CONDUCT.md). Good first issues are labeled
[`good first issue`](https://github.com/inkshell/inkshell/labels/good%20first%20issue).

## 📄 License

Licensed under the [Apache License 2.0](./LICENSE). See [NOTICE](./NOTICE) for
attribution and trademark details.
