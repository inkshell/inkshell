import { EFFORT_LEVELS, type AppConfig, type ModelConfig } from '@shared/types'
import { CloseIcon, PlusIcon } from './Icons'

interface Props {
  config: AppConfig
  onChange: (config: AppConfig) => void
  onClose: () => void
}

function blankModel(): ModelConfig {
  return { alias: '', display: '', idPrefix: 'claude-', color: '#a8978c', contextWindow: 200_000 }
}

/**
 * Settings, mirroring the desktop app: the model list shown in the toolbar
 * picker (editable so a newly released model is a config edit, not a release),
 * plus which model new chats start on. Every change is pushed up immediately and
 * persisted by the caller.
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
          <span className="modal-title">Configurações</span>
          <button className="del-btn" onClick={onClose} title="Fechar">
            <CloseIcon size={13} />
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-desc">
            A lista que aparece no seletor de modelo. Quando a Anthropic lançar ou renomear um
            modelo, edite aqui — sem recompilar.
          </p>

          <div className="model-table">
            <div className="model-row">
              <span className="col-head">Cor</span>
              <span className="col-head">Nome</span>
              <span className="col-head">Alias</span>
              <span className="col-head">Prefixo do ID</span>
              <span className="col-head">Janela</span>
              <span />
            </div>

            {config.models.map((m, i) => (
              <div className="model-row" key={i}>
                <input
                  type="color"
                  className="color-input"
                  value={m.color}
                  onChange={(e) => updateModel(i, { color: e.target.value })}
                />
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
                  title="Janela de contexto em tokens (denominador do medidor)"
                  min={1}
                  step={1000}
                  value={m.contextWindow}
                  onChange={(e) => updateModel(i, { contextWindow: Number(e.target.value) || 0 })}
                />
                <button className="del-btn" title="Remover modelo" onClick={() => removeModel(i)}>
                  <CloseIcon size={12} />
                </button>
              </div>
            ))}
          </div>

          <button className="btn add-model" onClick={addModel}>
            <PlusIcon size={14} /> Adicionar modelo
          </button>

          <div className="settings-divider" />

          <div className="setting-row">
            <span style={{ color: 'var(--text-muted)' }}>Modelo padrão de novos chats</span>
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
            <span style={{ color: 'var(--text-muted)' }}>Effort padrão de novos chats</span>
            <select
              className="select"
              value={config.defaultEffort}
              onChange={(e) => onChange({ ...config, defaultEffort: e.target.value })}
            >
              <option value="">Padrão do Claude Code</option>
              {EFFORT_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}
