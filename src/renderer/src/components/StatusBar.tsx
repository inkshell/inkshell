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
          <span className="none">Nenhum projeto</span>
        )}
      </div>

      {active && (
        <>
          <span className="status-divider" />
          <span className="swap-hint" title="Trocar o modelo do Claude Code">
            <SwapIcon size={15} />
          </span>
          <select
            className="pill-select"
            value={currentModel ?? ''}
            title="Trocar o modelo do Claude Code"
            onChange={(e) => e.target.value && onPickModel(e.target.value)}
          >
            {!currentModel && (
              <option value="" disabled>
                Modelo…
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
            title="Effort — só reflete a última escolha, nunca confirmado"
          >
            <GaugeIcon size={15} />
          </span>
          <select
            className="pill-select"
            value={currentEffort ?? ''}
            title="Trocar o effort do Claude Code (não confirmado pelo Claude Code)"
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
        </>
      )}

      <span className="status-spacer" />

      {active ? (
        <div className="status-right">
          <ContextMeter tokens={contextTokens} contextWindow={contextWindow} />
          <button className="icon-btn" title="Visualizar a memória" onClick={onViewMemory}>
            <BookmarkIcon size={14} />
          </button>
          <button className="icon-btn" title="Analytics (/stats)" onClick={onAnalytics}>
            <BarsIcon size={14} />
          </button>
        </div>
      ) : (
        <div className="status-hint">
          <span className="kbd">⌘T</span> abrir um novo chat
        </div>
      )}
    </div>
  )
}
