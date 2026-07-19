import { EFFORT_LEVELS, type AppConfig, type ModelConfig } from '@shared/types'
import { CloseIcon, PlusIcon } from './Icons'

interface Props {
  config: AppConfig
  onChange: (config: AppConfig) => void
  onClose: () => void
}

function blankModel(): ModelConfig {
  return { alias: '', display: '', idPrefix: 'claude-', contextWindow: 200_000 }
}

/**
 * App-wide settings: the model list shown in the toolbar picker (editable so a
 * newly released model is a config edit, not a release) and which model /
 * effort new chats start on. Per-project settings live on their own screen,
 * reached by right-clicking the project in the sidebar. Every change is pushed
 * up immediately and persisted by the caller.
 */
export function SettingsModal({ config, onChange, onClose }: Props) {
  const updateModel = (i: number, patch: Partial<ModelConfig>) => {
    const models = config.models.map((m, idx) => (idx === i ? { ...m, ...patch } : m))
    onChange({ ...config, models })
  }
  const removeModel = (i: number) => {
    onChange({ ...config, models: config.models.filter((_, idx) => idx !== i) })
  }
  const addModel = () => {
    onChange({ ...config, models: [...config.models, blankModel()] })
  }
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Settings</span>
          <button className="del-btn" onClick={onClose} title="Close">
            <CloseIcon size={13} />
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-desc">
            The list that shows up in the model picker. When Anthropic ships or renames a model,
            edit it here — no rebuild needed.
          </p>

          <div className="model-table">
            <div className="model-row">
              <span className="col-head">Name</span>
              <span className="col-head">Alias</span>
              <span className="col-head">ID prefix</span>
              <span className="col-head">Window</span>
              <span />
            </div>

            {config.models.map((m, i) => (
              <div className="model-row" key={i}>
                <input
                  className="field"
                  placeholder="Opus 4.8"
                  value={m.display}
                  onChange={(e) => updateModel(i, { display: e.target.value })}
                />
                <input
                  className="field"
                  placeholder="opus"
                  value={m.alias}
                  onChange={(e) => updateModel(i, { alias: e.target.value })}
                />
                <input
                  className="field"
                  placeholder="claude-opus-4-8"
                  value={m.idPrefix}
                  onChange={(e) => updateModel(i, { idPrefix: e.target.value })}
                />
                <input
                  type="number"
                  className="field"
                  title="Context window in tokens (the meter's denominator)"
                  min={1}
                  step={1000}
                  value={m.contextWindow}
                  onChange={(e) => updateModel(i, { contextWindow: Number(e.target.value) || 0 })}
                />
                <button className="del-btn" title="Remove model" onClick={() => removeModel(i)}>
                  <CloseIcon size={12} />
                </button>
              </div>
            ))}
          </div>

          <button className="btn add-model" onClick={addModel}>
            <PlusIcon size={14} /> Add model
          </button>

          <div className="settings-divider" />

          <div className="setting-row">
            <span style={{ color: 'var(--text-muted)' }}>Default model for new chats</span>
            <select
              className="select"
              value={config.defaultModel}
              onChange={(e) => onChange({ ...config, defaultModel: e.target.value })}
            >
              {config.models
                .filter((m) => m.alias)
                .map((m) => (
                  <option key={m.alias} value={m.alias}>
                    {m.display || m.alias} ({m.alias})
                  </option>
                ))}
            </select>
          </div>

          <div className="setting-row">
            <span style={{ color: 'var(--text-muted)' }}>Default effort for new chats</span>
            <select
              className="select"
              value={config.defaultEffort}
              onChange={(e) => onChange({ ...config, defaultEffort: e.target.value })}
            >
              <option value="">Claude Code default</option>
              {EFFORT_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>

          <div className="settings-divider" />

          <div className="setting-row">
            <span style={{ color: 'var(--text-muted)' }}>Commit message model</span>
            <select
              className="select"
              value={config.commitMessageModel}
              onChange={(e) => onChange({ ...config, commitMessageModel: e.target.value })}
            >
              <option value="">Claude Code default</option>
              {config.models
                .filter((m) => m.alias)
                .map((m) => (
                  <option key={m.alias} value={m.alias}>
                    {m.display || m.alias} ({m.alias})
                  </option>
                ))}
            </select>
          </div>
          <span className="form-hint">
            The <strong>Generate message with Claude</strong> button, in the git panel, runs{' '}
            <code>claude -p</code> over the staged diff — outside the chat, without spending the
            tab's context.
          </span>
        </div>
      </div>
    </div>
  )
}
