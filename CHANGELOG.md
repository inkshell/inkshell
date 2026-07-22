# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.3] - 2026-07-22

### Added

- `install.sh`: a one-line macOS installer
  (`curl -fsSL https://raw.githubusercontent.com/inkshell/inkshell/main/install.sh | bash`)
  that downloads the right build for the Mac's architecture into
  `/Applications`. Because the download happens through `curl`, macOS never
  quarantines it, so the unsigned app opens without the misleading
  "InkShell is damaged" dialog that a browser download runs into.
- Intel builds: releases now ship an `x64` zip alongside the `arm64` one,
  built on a dedicated Intel runner.

### Changed

- The zip is now the only macOS release artifact. An unsigned `.dmg` only
  offered a drag-install path that ends at Gatekeeper's "damaged" dialog; it
  will return once builds are signed and notarized. Auto-update metadata
  (`latest-mac.yml`) is no longer published either — the app has no
  auto-updater.

## [0.1.1] - 2026-07-22

### Fixed

- Resolve the `claude` binary to an absolute path instead of spawning it by bare
  name. Launched from the Finder, InkShell inherits launchd's PATH — usually
  just `/usr/bin:/bin:/usr/sbin:/sbin` — so an install under `~/.local/bin`,
  Homebrew or bun was invisible and every new tab closed the instant it opened.
  The lookup searches the process PATH, then the login shell's own PATH, then
  the usual install locations, with `INKSHELL_CLAUDE_BIN` as an escape hatch.
  (#19, closes #18)
- A pty that dies without printing a byte now reports the failure instead of
  silently closing its tab, and main-process errors reach the banner without
  Electron's IPC wrapper around them. (#19)

### Changed

- Upgrade Electron from 33 to 43. (#20)
- Publish GitHub Releases directly instead of leaving them as drafts.

## [0.1.0] - 2026-07-20

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

[Unreleased]: https://github.com/inkshell/inkshell/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/inkshell/inkshell/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/inkshell/inkshell/tree/v0.1.0
