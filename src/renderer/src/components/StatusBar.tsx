import { EFFORT_LEVELS, type ModelConfig } from '@shared/types'
import { ContextMeter } from './ContextMeter'
import { BarsIcon, BookmarkIcon, FolderIcon, GaugeIcon, SwapIcon } from './Icons'

interface Props {
  /** Basename of the selected project, or null when none is chosen. */
  project: string | null
  /** Whether a chat tab is currently active (drives the model + context row). */
  active: boolean
  models: ModelConfig[]
  /** Alias of the model actually backing the session, read off its transcript. */
  currentModel: string | null
  /** Effort last requested for this tab — optimistic only, never confirmed. */
  currentEffort: string | null
  contextTokens: number | null
  /** The active model's context window — the meter's denominator. */
  contextWindow: number
  onPickModel: (alias: string) => void
  onPickEffort: (effort: string) => void
  onViewMemory: () => void
  onAnalytics: () => void
}

/**
 * The bottom status bar — the app's ground line, in the spirit of an editor's
 * status strip. The left side always names the working directory; when a tab is
 * live it also carries the model switcher (a select always showing the model
 * that's really backing the session, per its transcript) and the effort switcher
 * (a select that can only ever show its own last-clicked guess — Claude Code
 * never records effort anywhere, so there's no ground truth to confirm it
 * against). Picking either types the matching `/model` or `/effort` command
 * into the session. The right side holds the context meter and secondary tools.
 *
 * The switchers stay enabled at all times. Typing into the pty is only safe
 * while the session's input box is empty — but that is checked at the moment of
 * the pick, by the handler that does the writing, which then explains itself in
 * a banner. Reflecting the same condition here as a disabled state would mean
 * reading the CLI's screen on a timer to grey out a control the user hasn't
 * reached for yet, and being wrong about it in both directions.
 */
export function StatusBar({
  project,
  active,
  models,
  currentModel,
  currentEffort,
  contextTokens,
  contextWindow,
  onPickModel,
  onPickEffort,
  onViewMemory,
  onAnalytics
}: Props) {
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

      {active && (
        <>
          <span className="status-divider" />
          <span className="swap-hint" title="Switch the Claude Code model">
            <SwapIcon size={15} />
          </span>
          <span className="switchers">
            <select
              className="pill-select"
              value={currentModel ?? ''}
              title="Switch the Claude Code model"
              onChange={(e) => e.target.value && onPickModel(e.target.value)}
            >
              {!currentModel && (
                <option value="" disabled>
                  Model…
                </option>
              )}
              {models
                .filter((m) => m.alias)
                .map((m) => (
                  <option key={m.alias} value={m.alias}>
                    {m.display || m.alias}
                  </option>
                ))}
            </select>

            <span
              className="swap-hint"
              title="Effort — only reflects the last pick, never confirmed"
            >
              <GaugeIcon size={15} />
            </span>
            <select
              className="pill-select"
              value={currentEffort ?? ''}
              title="Switch the Claude Code effort (not confirmed by Claude Code)"
              onChange={(e) => e.target.value && onPickEffort(e.target.value)}
            >
              {!currentEffort && (
                <option value="" disabled>
                  Effort…
                </option>
              )}
              {EFFORT_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </span>
        </>
      )}

      <span className="status-spacer" />

      {active ? (
        <div className="status-right">
          <ContextMeter tokens={contextTokens} contextWindow={contextWindow} />
          <button className="icon-btn" title="View memory" onClick={onViewMemory}>
            <BookmarkIcon size={14} />
          </button>
          <button className="icon-btn" title="Analytics (/stats)" onClick={onAnalytics}>
            <BarsIcon size={14} />
          </button>
        </div>
      ) : (
        <div className="status-hint">
          <span className="kbd">⌘T</span> open a new chat
        </div>
      )}
    </div>
  )
}
