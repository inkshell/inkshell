/** A single open Claude Code tab in the renderer. */
export interface Tab {
  /** Stable local id (assigned by the renderer, independent of the OS pty id). */
  id: string
  /** The OS pty handle, once the terminal has spawned; `null` while starting. */
  ptyId: number | null
  /** The Claude Code session id backing the tab (drives the context meter). */
  sessionId: string | null
  /** Session to `--resume`, or `null` for a fresh chat. */
  resumeSessionId: string | null
  /** Working directory for this tab's `claude` process. */
  cwd: string | null
  /** `CLAUDE_CONFIG_DIR` override inherited from the project, or `null`. */
  claudeConfigDir: string | null
  /** Model alias the tab launched on. */
  model: string | null
  /** Effort level the tab launched on (`--effort`), or `null` for the CLI's own default. */
  effort: string | null
  /**
   * Epoch ms this tab's `claude` process was started. A transcript reading
   * timestamped before this belongs to a previous run of the session (e.g. a
   * resume launched under a different `--model` than its prior history) and
   * must not be trusted as the tab's current model.
   */
  startedAtMs: number
  /** Tab label — the terminal title, updated as the CLI sets it. */
  title: string
}
