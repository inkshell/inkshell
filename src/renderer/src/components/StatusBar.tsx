import { EFFORT_LEVELS, type ModelConfig } from '@shared/types'
import { ContextMeter } from './ContextMeter'
import { BarsIcon, BookmarkIcon, FolderIcon, GaugeIcon, InfoIcon, SwapIcon } from './Icons'

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
  /**
   * Whether the session's input box is verifiably empty. The switchers type
   * `/commands` into the pty, which appends to whatever is half-written there —
   * so while a draft is visible they are disabled instead.
   */
  promptEmpty: boolean
  onPickModel: (alias: string) => void
  onPickEffort: (effort: string) => void
  /** A switcher was reached for while the chat holds a draft; explain why not. */
  onDraftBlocked: () => void
  onViewMemory: () => void
  onAnalytics: () => void
}

const draftHint = 'Chat com texto escrito: envie ou apague para trocar'

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
  promptEmpty,
  onPickModel,
  onPickEffort,
  onDraftBlocked,
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
          {/* Takes the swap glyph's own slot — that glyph meaning exactly the
              thing now suspended — so the explanation costs the strip no width
              it hasn't got, and says as much of itself as fits. It sits outside
              `.switchers` on purpose: only a direct child of the bar can be
              shrunk past the sentence it holds. */}
          {promptEmpty ? (
            <span className="swap-hint" title="Trocar o modelo do Claude Code">
              <SwapIcon size={15} />
            </span>
          ) : (
            <button className="draft-note" title={draftHint} onClick={onDraftBlocked}>
              <InfoIcon size={14} />
              <span>{draftHint}</span>
            </button>
          )}
          {/* Wraps the pills so a click still lands somewhere while they are
              disabled: a disabled control swallows the event instead of
              bubbling it, which would leave the greyed pill mute to the very
              user asking it why. */}
          <span
            className={`switchers${promptEmpty ? '' : ' blocked'}`}
            onClick={promptEmpty ? undefined : onDraftBlocked}
          >
            <select
              className="pill-select"
              value={currentModel ?? ''}
              disabled={!promptEmpty}
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
              disabled={!promptEmpty}
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
          </span>
        </>
      )}

      <span className="status-spacer" />

      {active ? (
        <div className="status-right">
          <ContextMeter tokens={contextTokens} contextWindow={contextWindow} />
          <button className="icon-btn" title="Visualizar a memória" onClick={onViewMemory}>
            <BookmarkIcon size={14} />
          </button>
          <span
            className={promptEmpty ? undefined : 'blocked'}
            onClick={promptEmpty ? undefined : onDraftBlocked}
          >
            <button
              className="icon-btn"
              disabled={!promptEmpty}
              title="Analytics (/stats)"
              onClick={onAnalytics}
            >
              <BarsIcon size={14} />
            </button>
          </span>
        </div>
      ) : (
        <div className="status-hint">
          <span className="kbd">⌘T</span> abrir um novo chat
        </div>
      )}
    </div>
  )
}
