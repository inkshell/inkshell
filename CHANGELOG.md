# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial public release of VibeBox, an Electron desktop front-end for Claude Code.
- Tabbed Claude Code sessions, each backed by its own `node-pty` process and an
  `xterm.js` view.
- Sidebar with recent projects and resumable session history read from
  `~/.claude/projects`.
- Toolbar model switcher that types `/model <alias>` into the active session.
- Live context meter mirroring the CLI's context-window indicator.
- `/stats` shortcut and a placeholder memory viewer.
- Editable model list and default model, persisted to `~/.vibebox/config.json`.
- Frameless, coral-accented dark UI with per-platform window chrome.

[Unreleased]: https://github.com/your-org/vibebox/commits/main
