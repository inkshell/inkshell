# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-08-21

### Added

- Opencode as a second driving CLI beside Claude Code: the locally-installed
  `opencode` binary is wrapped the same way `claude` is — a real child in a
  pty, never a reimplementation. Each project can carry per-CLI default
  models, the history list gets a Claude/Opencode toggle and per-CLI
  new-chat buttons, new opencode chats adopt their session id by polling,
  and the About screen shows the resolved opencode binary path. (#74)
- Sidebar project-row buttons wear their CLI's official mark: the new-chat
  button gets the Claude spark, and Opencode's blocky square-cornered 'O'
  replaces the old rounded play-arrow glyph. (#75)

### Changed

- The status bar is reduced to a quiet project + pane line: the model and
  effort switchers, the context meter and the analytics button are gone —
  model, effort, context and stats stay the CLI's own to manage from its
  prompt. (#76)
- The projects list is user-curated now: a first launch starts empty and
  opens the "New project" screen instead of importing every project found
  in the CLIs' own history stores; the discovery pipeline behind that
  import is removed. (#78)
- Settings is reworked around plain-text model fields passed verbatim to
  the CLIs: the editable model table is gone, Claude's default model and
  effort sit side by side, Opencode gets its own default model in
  provider/model form, and the commit-message generator (with its
  `git:suggestMessage` channel) is removed. (#79)
- README rewritten for the two-CLI workspace, with refreshed screenshots.
  (#80)

### Fixed

- opencode sessions close cleanly via `/exit`: its command palette opens
  asynchronously and swallowed the Enter sent in the same burst as the
  command, leaving a stuck exit dialog until the hard-kill timer fired.
  opencode now gets its own paced exit sequence, with late Enters that can
  only confirm, never corrupt. (#77)

## [0.3.0] - 2026-08-13

### Changed

- Sidebar tree items now wear real icons instead of text glyphs: chats get
  a new Claude spark icon tinted with the project colour (keeping the old
  dot's filled/hollow and spinner states), and shell, diff, commit and file
  items reuse the icons the pane header already draws. The pane header now
  shows the same Claude spark too, so the tree and the header agree. (#66)

### Fixed

- The git/files dock now follows the project selected in the sidebar rather
  than staying pinned to the active tab's project, and selection now moves in
  both directions — focusing a pane re-points the sidebar, and clicking a
  project row focuses its first on-screen instance. (#67)
- Global chrome (the main column's background wash and the layout switcher's
  active state) is no longer tinted with the focused pane's project colour;
  per-pane elements keep their own tint. (#68)
- On macOS, default to a UTF-8 locale when launched from Finder/Dock so pasted
  accented text is no longer mangled into mojibake. Only fires when none of
  `LANG`/`LC_ALL`/`LC_CTYPE` are set, leaving a deliberately configured locale
  alone. (#65)

## [0.2.0] - 2026-07-25

### Added

- A drag-and-drop pane workspace: the tab strip is replaced by a resizable
  1/2/4-pane grid backed by a project tree in the sidebar. Panes can be
  split, dragged into one another to swap tabs, and closed independently
  without ending the underlying chat. (#46, #49)
- Pane close now offers minimize (keep the session running, hide the pane)
  alongside maximize and full close. (#59)
- A plain per-project terminal pane, alongside Claude chat panes, for
  running shell commands next to a session. (#48)
- The read-only file viewer is now an editable Monaco editor with save
  support, plus a Monaco-based diff view. (#57)
- Empty panes get their own "New chat" action. (#51)
- A font-size control for terminal, file viewer, and diff panes, now living
  in Settings. (#54, #60)
- Tooltips on the toolbar's git actions. (#62)
- The app icon was redesigned to match the Midnight Ink brand badge. (#52)

### Changed

- Dropped the placeholder memory button from the toolbar (not yet
  implemented). (#62)
- Redesigned the settings gear icon, and the sidebar's git status list is
  now sorted by path. (#63)

### Fixed

- Dragging a tab from one pane onto another swaps tabs instead of merging
  them, and closing a pane no longer ends its chat session. (#49)
- Removed a stray white scrollbar-corner square. (#50)
- The sidebar's tree caret now only shows when a project has open items.
  (#47)
- Tab icons stay visible and reflow correctly at narrow sidebar widths.
  (#55)
- The terminal no longer clips its bottom row at some window heights. (#56)
- The status strip stays in place when the active pane isn't a chat. (#58)
- Added breathing room between a project's open-instance rows in the
  sidebar. (#53)
- Centered the X in the tab close button. (#61)
- macOS releases now build a single universal (arm64 + x64) zip on one
  `macos-latest` runner instead of one zip per architecture built on a
  dedicated runner per arch. GitHub retired its free Intel macOS runner
  (`macos-13`) without a free replacement, which left the Intel half of the
  v0.1.4 release stuck queued indefinitely. `install.sh` no longer needs to
  pick an asset by architecture, since there's only one build now.

## [0.1.4] - 2026-07-22

### Added

- An "About InkShell" screen, opened from a new info-icon button next to the
  sidebar's settings gear. It shows the app version, Electron/Chromium/Node
  versions, and the resolved `claude` binary path — all read live from the
  main process over a new `app:getInfo` IPC channel, plus links to the GitHub
  repo and issue tracker.
- `install.sh`: a one-line macOS installer
  (`curl -fsSL https://raw.githubusercontent.com/inkshell/inkshell/main/install.sh | sh`)
  that downloads the right build for the Mac's architecture into
  `/Applications` (or `~/Applications` when that isn't writable). Because the
  download happens through `curl`, macOS never quarantines it, so the unsigned
  app opens without the misleading "InkShell is damaged" dialog that a browser
  download runs into.
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

[Unreleased]: https://github.com/inkshell/inkshell/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/inkshell/inkshell/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/inkshell/inkshell/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/inkshell/inkshell/compare/v0.1.4...v0.2.0
[0.1.4]: https://github.com/inkshell/inkshell/compare/v0.1.1...v0.1.4
[0.1.1]: https://github.com/inkshell/inkshell/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/inkshell/inkshell/tree/v0.1.0
