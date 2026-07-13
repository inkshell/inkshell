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
  /** Hex accent color (e.g. "#e8825c") shown next to the model in the picker. */
  color: string
}

/** The persisted application configuration (`~/.vibebox/config.json`). */
export interface AppConfig {
  projects: ProjectEntry[]
  /** `/model` alias (or full id) passed via `--model` to new chats. */
  defaultModel: string
  /** The user's model list, shown in the toolbar picker. */
  models: ModelConfig[]
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

/** The default context window the toolbar meter is drawn against. */
export const CONTEXT_WINDOW = 200_000
