/**
 * What a viewer tab (diff / file / commit) renders. Viewer tabs live in the
 * same tab strip as chat tabs but hold no `claude` process — they show git
 * content the project panel opened, in the wide central area a 300px panel
 * can't give a diff.
 */
export interface ViewerRef {
  kind: 'diff' | 'file' | 'commit'
  /** Project (repo) directory every git/fs read runs against. */
  project: string
  /** `CLAUDE_CONFIG_DIR` override inherited from the project, or null. */
  claudeConfigDir: string | null
  /** File/diff path (project-relative), for `diff` and `file`. */
  path?: string
  /**
   * Line to reveal and highlight, for `file` — set when the path came from the
   * terminal carrying one (`ipc.ts:82`). Deliberately outside `viewerKey`, so
   * clicking the same file at a new line re-uses its tab and just moves.
   */
  line?: number
  /** Diff against the index (staged) vs the working tree. */
  staged?: boolean
  /** Commit hash, for `commit`. */
  hash?: string
  /** Short label shown on the tab and in the viewer header. */
  label: string
  /** Parent directory shown faint before the label in the header. */
  dir?: string
}

/** A stable key identifying a viewer, so re-opening one focuses its tab. */
export function viewerKey(ref: ViewerRef): string {
  if (ref.kind === 'commit') return `commit:${ref.project}:${ref.hash}`
  if (ref.kind === 'diff') return `diff:${ref.project}:${ref.staged ? 's' : 'w'}:${ref.path}`
  return `file:${ref.project}:${ref.path}`
}

/**
 * How many panes the centre shows at once. The renderer keeps a fixed array of
 * four slots and this decides how many of them are on screen — 1 (single),
 * 2 (side by side) or 4 (quadrant).
 */
export type PaneLayout = 1 | 2 | 4

/**
 * `DataTransfer` payload types for dragging a sidebar item onto an empty pane:
 * an open tab (`Sidebar`'s tree node) or a history session. Shared between
 * `Sidebar` (drag source) and `App` (drop target) so the two can't drift.
 */
export const TAB_DRAG_TYPE = 'application/x-inkshell-tab'
export const SESSION_DRAG_TYPE = 'application/x-inkshell-session'

/** A single open tab in the renderer: a live Claude chat, a plain shell, or a git viewer. */
export interface Tab {
  /** Stable local id (assigned by the renderer, independent of the OS pty id). */
  id: string
  /** A live `claude` terminal, a plain shell (no Claude process behind it), or a read-only git viewer. */
  kind: 'terminal' | 'shell' | 'diff' | 'file' | 'commit'
  /** What a viewer tab renders; absent for terminal tabs. */
  viewer?: ViewerRef
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
  /** Whether the CLI's title currently carries its Braille "thinking" spinner. */
  processing: boolean
  /**
   * A single-click "peek" from the file tree: reuses this tab's slot for the
   * next preview open instead of stacking a new one, until a double-click (or
   * any other open of the same file) pins it. Only ever set on viewer tabs.
   */
  preview?: boolean
}
