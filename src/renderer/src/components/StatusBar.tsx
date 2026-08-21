import type { ReactNode } from 'react'
import { FolderIcon } from './Icons'

interface Props {
  /** Basename of the selected project, or null when none is chosen. */
  project: string | null
  /**
   * Names the focused pane — a chat names its CLI, a terminal, file or diff
   * names itself. Null for an empty pane, which says what it is in the middle
   * of its own tile.
   */
  subject: { glyph: ReactNode; label: string } | null
}

/**
 * The bottom status bar — the app's ground line, in the spirit of an editor's
 * status strip, kept deliberately quiet: it names the working directory and
 * the focused pane, and nothing else. Model, effort, context and stats are
 * the CLI's own to manage from its prompt.
 *
 * The bar is drawn for *every* pane kind, chat or not, and swaps its contents
 * rather than being mounted and unmounted with the focus. The 36px it occupies
 * is height the pane grid never gets, so a bar that came and went as focus
 * moved between quadrants resized every terminal on screen along with it —
 * `App` renders this unconditionally.
 */
export function StatusBar({ project, subject }: Props) {
  return (
    <div className="statusbar no-drag">
      <div className="status-project" title={project ?? undefined}>
        <span className="glyph">
          <FolderIcon size={14} />
        </span>
        {project ? (
          <span className="name">{project}</span>
        ) : (
          <span className="none">No project</span>
        )}
      </div>

      {subject && (
        <>
          <span className="status-divider" />
          <span className="status-subject">
            <span className="glyph">{subject.glyph}</span>
            {subject.label}
          </span>
        </>
      )}
    </div>
  )
}
