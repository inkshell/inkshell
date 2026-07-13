import type { ModelConfig } from '@shared/types'
import { ContextMeter } from './ContextMeter'
import { BarsIcon, BookmarkIcon, FolderIcon, SwapIcon } from './Icons'

interface Props {
  /** Basename of the selected project, or null when none is chosen. */
  project: string | null
  /** Whether a chat tab is currently active (drives the model + context row). */
  active: boolean
  models: ModelConfig[]
  contextTokens: number | null
  onPickModel: (alias: string) => void
  onViewMemory: () => void
  onAnalytics: () => void
}

/**
 * The bottom status bar — the app's ground line, in the spirit of an editor's
 * status strip. The left side always names the working directory; when a tab is
 * live it also carries the model switcher. Every model pill is an equal action
 * that types `/model <alias>` into the session, so the bar only ever *changes*
 * the model, never claims to know the current one. The right side holds the
 * context meter and secondary tools.
 */
export function StatusBar({
  project,
  active,
  models,
  contextTokens,
  onPickModel,
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
          <div className="model-pills">
            {models
              .filter((m) => m.alias)
              .map((m) => (
                <button
                  key={m.alias}
                  className="model-pill"
                  style={{ ['--pill' as string]: m.color }}
                  title={`Trocar para ${m.display || m.alias}`}
                  onClick={() => onPickModel(m.alias)}
                >
                  <span className="pdot" />
                  {m.display || m.alias}
                </button>
              ))}
          </div>
        </>
      )}

      <span className="status-spacer" />

      {active ? (
        <div className="status-right">
          <ContextMeter tokens={contextTokens} />
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
