# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial public release of InkShell, an Electron desktop front-end for Claude Code.
- Tabbed Claude Code sessions, each backed by its own `node-pty` process and an
  `xterm.js` view.
- Sidebar with recent projects and resumable session history read from
  `~/.claude/projects`.
- Toolbar model switcher that types `/model <alias>` into the active session.
- Live context meter mirroring the CLI's context-window indicator.
- Project dock with a **Git** panel (stage, unstage, commit, push, branch
  history, diff/file/commit viewer tabs, Claude-drafted commit messages) and a
  **Files** tree.
- `/stats` shortcut in the toolbar. (A memory viewer is stubbed but not yet
  implemented.)
- Editable model list and default model, persisted to `~/.inkshell/config.json`.
- Frameless "Midnight Ink" dark UI — cool graphite surfaces, iris accent, and a
  per-model hue — with per-platform window chrome.

[Unreleased]: https://github.com/inkshell/inkshell/commits/main
