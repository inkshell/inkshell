/**
 * Data models shared across the main, preload, and renderer processes.
 *
 * These mirror the concepts of the original Rust app: a config file listing
 * recent projects and selectable models, plus session summaries read out of
 * Claude Code's own transcript store under `~/.claude/projects/`.
 */

/** A folder the user has opened as a working directory for Claude Code. */
export interface ProjectEntry {
  name: string
  path: string
  /**
   * Hex accent color (e.g. "#6f9dff") for this project. It tints the app chrome
   * while one of this project's tabs is active and marks every tab that belongs
   * to it, so tabs from different projects stay visually distinct. Assigned from
   * a palette when a project is first added, editable in Settings. Omitted means
   * fall back to the brand accent.
   */
  color?: string
  /**
   * Overrides Claude Code's config directory (`CLAUDE_CONFIG_DIR`, default
   * `~/.claude`) for this project. When set, the tab's `claude` process runs
   * with that env var, and this project's history + context meter read from
   * `<dir>/projects/` instead of `~/.claude/projects/`. A leading `~` is
   * expanded to the home directory. Omitted means the default config dir.
   */
  claudeConfigDir?: string
}

/**
 * A model the user can pick from the toolbar. The whole list lives in the
 * config file and is editable from Settings, so a newly released (or renamed)
 * Claude model is a config edit, not a new release.
 */
export interface ModelConfig {
  /** Argument passed to `/model` and `--model` (a short alias like "opus", or a full model id). */
  alias: string
  /** Human name shown in the picker. */
  display: string
  /** Prefix of the model ids recorded in transcripts, e.g. "claude-opus-4-8". */
  idPrefix: string
  /**
   * Context window in tokens, used as the denominator for this model's
   * context meter reading instead of a flat guess. Config-edited like the
   * rest of `ModelConfig` — there's no API to read it off the model itself,
   * and a session recorded on a beta context variant (e.g. Sonnet's 1M mode)
   * is indistinguishable from the regular one by transcript id alone, so this
   * is necessarily one fixed number per model, not per-session truth.
   */
  contextWindow: number
}

/** The persisted application configuration (`~/.vibebox/config.json`). */
export interface AppConfig {
  projects: ProjectEntry[]
  /** `/model` alias (or full id) passed via `--model` to new chats. */
  defaultModel: string
  /** The user's model list, shown in the toolbar picker. */
  models: ModelConfig[]
  /**
   * Passed via `--effort` to every chat this app opens (`low`, `medium`,
   * `high`, `xhigh`, `max`), or `''` to leave it up to Claude Code's own
   * default. Unlike the model, effort is never recorded in a transcript, so
   * there's no live picker for it — only this launch-time default.
   */
  defaultEffort: string
}

/** A summary of a recorded Claude Code session, for the history list. */
export interface SessionSummary {
  sessionId: string
  /** First real user message, one line, truncated. */
  preview: string
  /** Creation time in epoch milliseconds (first timestamped event, else file mtime). */
  createdMs: number
}

/** Options for spawning a Claude Code session in a pseudo-terminal. */
export interface PtyCreateOptions {
  /** Working directory for the `claude` process, if a project is selected. */
  cwd?: string
  /** Session id to `--resume`; when omitted a fresh `--session-id` is generated. */
  resumeSessionId?: string
  /** Model alias passed via `--model`, if any. */
  model?: string
  /** Effort level passed via `--effort`, if any. */
  effort?: string
  /** Overrides `CLAUDE_CONFIG_DIR` for this session (default `~/.claude`). */
  claudeConfigDir?: string
  cols: number
  rows: number
}

/** What `pty.create` returns: the OS-level pty handle id and the session id in use. */
export interface PtyCreateResult {
  ptyId: number
  sessionId: string
}

/** Payload for the `pty:data` push channel. */
export interface PtyDataEvent {
  ptyId: number
  data: string
}

/** Payload for the `pty:exit` push channel. */
export interface PtyExitEvent {
  ptyId: number
  exitCode: number
}

/* =========================================================================
   Project panel — git + files. These back a read-mostly panel on the right of
   the window: the main process drives the real `git` binary (never a
   reimplementation) via `execFile` in the project directory and returns typed
   results; the renderer only renders them. The one write path is git itself
   (stage / commit / push) and it always goes through these channels.
   ========================================================================= */

/** A single changed path in `git status`, staged or unstaged. */
export interface GitFileChange {
  /** Repo-root-relative path (POSIX separators, exactly as git reports it). */
  path: string
  /**
   * Git's one-letter status for this path in this list: 'M' modified, 'A'
   * added, 'D' deleted, 'R' renamed, 'C' copied, '?' untracked, 'U' unmerged.
   */
  status: string
  /** For a rename/copy, the original path; otherwise omitted. */
  origPath?: string
}

/** The working tree's git state, as read for the project panel. */
export interface GitStatus {
  /** False when the project directory is not inside a git work tree. */
  isRepo: boolean
  /** Current branch name, or null on a detached HEAD / unknown. */
  branch: string | null
  /** Upstream ref (e.g. "origin/main"), or null when the branch has none. */
  upstream: string | null
  /** Commits ahead of / behind the upstream (0 when there is no upstream). */
  ahead: number
  behind: number
  /** Paths staged in the index. */
  staged: GitFileChange[]
  /** Paths changed in the working tree, including untracked ones. */
  unstaged: GitFileChange[]
}

/** One entry in the branch history (`git log`). */
export interface GitCommit {
  hash: string
  shortHash: string
  subject: string
  author: string
  /** Author date, epoch ms. */
  dateMs: number
  /** True when this commit is not yet on the branch's upstream. */
  unpushed: boolean
}

/** A commit opened in the viewer: metadata, file list and the full patch. */
export interface GitCommitDetail {
  hash: string
  shortHash: string
  subject: string
  author: string
  dateMs: number
  insertions: number
  deletions: number
  files: GitFileChange[]
  /** Raw unified diff text of the whole commit. */
  diff: string
}

/** One entry in a project directory listing (the files-panel tree). */
export interface TreeEntry {
  /** Base name. */
  name: string
  /** Project-relative path (POSIX separators). */
  path: string
  isDir: boolean
}

/** A file opened in the read-only viewer. */
export interface FileContent {
  path: string
  content: string
  /** True when the file exceeded the read cap or is binary — content is empty. */
  tooLarge: boolean
}

/** The default context window the toolbar meter is drawn against. */
export const CONTEXT_WINDOW = 200_000

/** The levels `--effort` / `/effort` accept, in ascending order. */
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

/**
 * The live state of a session, read off the most recent `assistant` line in its
 * transcript. `model` is the full model id Claude Code recorded for that turn
 * (e.g. `"claude-opus-4-8-..."`) — the transcript is the only place a session's
 * active model is ever recorded, so this is how the toolbar knows which model
 * is really selected instead of just guessing from the last `/model` sent.
 */
export interface SessionContext {
  /** input + cache_creation + cache_read for that turn (output excluded). */
  tokens: number
  /** Model id for that turn, or `null` when the transcript has no assistant reply yet. */
  model: string | null
  /**
   * Epoch ms of that turn's own `timestamp` line, or `null` if absent. Lets a
   * caller tell a fresh reading from a stale one — e.g. a resumed session's
   * newest transcript line can predate the current run, when the CLI was
   * launched with a different `--model` than that history was recorded under.
   */
  timestampMs: number | null
}
