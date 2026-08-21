import {
  EFFORT_LEVELS,
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_FONT_SIZE_MIN,
  type AppConfig
} from '@shared/types'
import { CloseIcon, MinimizeIcon, PlusIcon } from './Icons'

interface Props {
  config: AppConfig
  onChange: (config: AppConfig) => void
  onClose: () => void
}

/**
 * App-wide settings, grouped into captioned sections: the text size and which
 * model / effort new chats start on (per CLI). The model fields are plain text
 * — whatever lands here is passed straight to the CLI's `--model`, with no list
 * to keep in sync. Per-project settings live on their own screen, reached by
 * right-clicking the project in the sidebar. Every change is pushed up
 * immediately and persisted by the caller.
 */
export function SettingsModal({ config, onChange, onClose }: Props) {
  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal settings-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Settings</span>
          <button className="del-btn" onClick={onClose} title="Close">
            <CloseIcon size={13} />
          </button>
        </div>

        <div className="modal-body">
          <p className="settings-section">Appearance</p>

          <div className="form-field">
            <span className="form-label">Terminal &amp; editor text size</span>
            <div className="setting-inline">
              <div className="font-size-ctl" role="group" aria-label="Text size">
                <button
                  title="Decrease text size"
                  aria-label="Decrease text size"
                  disabled={config.terminalFontSize <= TERMINAL_FONT_SIZE_MIN}
                  onClick={() =>
                    onChange({
                      ...config,
                      terminalFontSize: Math.max(
                        TERMINAL_FONT_SIZE_MIN,
                        config.terminalFontSize - 1
                      )
                    })
                  }
                >
                  <MinimizeIcon size={12} />
                </button>
                <span className="fs-value">{config.terminalFontSize}</span>
                <button
                  title="Increase text size"
                  aria-label="Increase text size"
                  disabled={config.terminalFontSize >= TERMINAL_FONT_SIZE_MAX}
                  onClick={() =>
                    onChange({
                      ...config,
                      terminalFontSize: Math.min(
                        TERMINAL_FONT_SIZE_MAX,
                        config.terminalFontSize + 1
                      )
                    })
                  }
                >
                  <PlusIcon size={12} />
                </button>
              </div>
              <span className="fs-caption">{config.terminalFontSize} px</span>
            </div>
            <span className="form-hint">
              Sets xterm's font size for every terminal tab and scales the file/diff viewer's text
              by the same ratio.
            </span>
          </div>

          <p className="settings-section">New chats</p>

          <div className="setting-pair">
            <label className="form-field">
              <span className="form-label">Model — Claude Code</span>
              <input
                className="field mono"
                placeholder="sonnet"
                value={config.defaultModel}
                onChange={(e) => onChange({ ...config, defaultModel: e.target.value })}
              />
            </label>
            <label className="form-field">
              <span className="form-label">Effort — Claude Code</span>
              <input
                className="field mono"
                placeholder={EFFORT_LEVELS.join(' · ')}
                value={config.defaultEffort}
                onChange={(e) => onChange({ ...config, defaultEffort: e.target.value })}
              />
            </label>
          </div>
          <span className="form-hint">
            Passed as <strong>--model</strong> and <strong>--effort</strong> to every new Claude
            Code chat — a short model alias (e.g. <em>sonnet</em>) or a full id, and an effort
            level. Empty leaves each to Claude Code's own default.
          </span>

          <label className="form-field">
            <span className="form-label">Model — Opencode</span>
            <input
              className="field mono"
              placeholder="zai-coding-plan/glm-5.3"
              value={config.defaultOpencodeModel}
              onChange={(e) => onChange({ ...config, defaultOpencodeModel: e.target.value })}
            />
            <span className="form-hint">
              Passed as <strong>--model</strong> to every new Opencode chat, in opencode's own{' '}
              <em>provider/model</em> form. Empty leaves the choice to opencode's configured
              default.
            </span>
          </label>
        </div>
      </div>
    </div>
  )
}
