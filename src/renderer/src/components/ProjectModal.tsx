import { useEffect, useState } from 'react'
import { PROJECT_PALETTE, type ProjectEntry } from '@shared/types'
import { CloseIcon, FolderIcon } from './Icons'

interface Props {
  /**
   * `new` collects a project before it exists in the config (the folder is
   * still editable); `edit` reconfigures one already there. Both render the
   * same form, so adding a project and configuring it look like one screen.
   */
  mode: 'new' | 'edit'
  /** Starting values — a draft in `new` mode, the saved entry in `edit`. */
  entry: ProjectEntry
  /** Paths already in the config, used to reject a duplicate in `new` mode. */
  existingPaths: string[]
  onSubmit: (entry: ProjectEntry) => void
  onCancel: () => void
}

/** Base name of a filesystem path, on either separator. */
function baseName(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path
}

/**
 * The project screen: everything `ProjectEntry` holds — folder, display name,
 * accent colour and the `CLAUDE_CONFIG_DIR` override — in one form, used both
 * to add a project and to reconfigure an existing one.
 *
 * The folder is the project's identity (it keys the config entry and picks the
 * transcript directory Claude Code reads), so it can only be chosen while the
 * project is new; afterwards it is shown read-only.
 */
export function ProjectModal({ mode, entry, existingPaths, onSubmit, onCancel }: Props) {
  const [path, setPath] = useState(entry.path)
  const [name, setName] = useState(entry.name)
  const [color, setColor] = useState(entry.color ?? PROJECT_PALETTE[0])
  const [configDir, setConfigDir] = useState(entry.claudeConfigDir ?? '')
  // Whether the name is still tracking the folder. Once the user types a name
  // of their own, re-picking the folder must not overwrite it.
  const [nameTouched, setNameTouched] = useState(mode === 'edit')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancel])

  const duplicate = mode === 'new' && path !== '' && existingPaths.includes(path)
  const valid = path.trim() !== '' && name.trim() !== '' && !duplicate

  const browseProject = async () => {
    const picked = await window.inkshell.dialog.pickFolder('Escolher a pasta do projeto')
    if (!picked) return
    setPath(picked)
    if (!nameTouched) setName(baseName(picked))
  }

  const browseConfigDir = async () => {
    const picked = await window.inkshell.dialog.pickFolder(
      'Escolher o diretório de config do Claude'
    )
    if (picked) setConfigDir(picked)
  }

  const submit = () => {
    if (!valid) return
    const trimmed = configDir.trim()
    onSubmit({
      ...entry,
      name: name.trim(),
      path,
      color,
      // An empty field means "use Claude Code's default" — drop the key rather
      // than persisting an empty string the main process would have to guard.
      claudeConfigDir: trimmed === '' ? undefined : trimmed
    })
  }

  return (
    <div className="overlay" onMouseDown={onCancel}>
      <div className="modal project-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">
            {mode === 'new' ? 'Novo projeto' : 'Configurações do projeto'}
          </span>
          <button className="del-btn" onClick={onCancel} title="Fechar">
            <CloseIcon size={13} />
          </button>
        </div>

        <div className="modal-body">
          <label className="form-field">
            <span className="form-label">Pasta</span>
            {mode === 'new' ? (
              <div className="form-row">
                <input
                  className="field"
                  placeholder="Nenhuma pasta escolhida"
                  value={path}
                  readOnly
                  onClick={browseProject}
                />
                <button className="btn" onClick={browseProject}>
                  <FolderIcon size={15} /> Escolher…
                </button>
              </div>
            ) : (
              <div className="form-static" title={path}>
                {path}
              </div>
            )}
            {duplicate && <span className="form-error">Este projeto já está na lista.</span>}
            {mode === 'edit' && (
              <span className="form-hint">
                A pasta identifica o projeto e o histórico que ele lê — para trocá-la, adicione
                outro projeto.
              </span>
            )}
          </label>

          <label className="form-field">
            <span className="form-label">Nome</span>
            <input
              className="field"
              placeholder={path ? baseName(path) : 'Nome do projeto'}
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setNameTouched(true)
              }}
            />
            <span className="form-hint">Como o projeto aparece na barra lateral e nas abas.</span>
          </label>

          <div className="form-field">
            <span className="form-label">Cor</span>
            <div className="form-row">
              <input
                type="color"
                className="color-input"
                value={color}
                title="Cor personalizada"
                onChange={(e) => setColor(e.target.value)}
              />
              <div className="swatches">
                {PROJECT_PALETTE.map((c) => (
                  <button
                    key={c}
                    className={`swatch ${c.toLowerCase() === color.toLowerCase() ? 'active' : ''}`}
                    style={{ background: c }}
                    title={c}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
            <span className="form-hint">
              Pinta as abas deste projeto e todo o cromo do app enquanto uma delas está ativa.
            </span>
          </div>

          <label className="form-field">
            <span className="form-label">Diretório de config (CLAUDE_CONFIG_DIR)</span>
            <div className="form-row">
              <input
                className="field"
                placeholder="~/.claude (padrão)"
                value={configDir}
                onChange={(e) => setConfigDir(e.target.value)}
              />
              <button className="btn" onClick={browseConfigDir}>
                <FolderIcon size={15} /> Escolher…
              </button>
            </div>
            <span className="form-hint">
              Aponte para um diretório separado para rodar este projeto em{' '}
              <strong>outra conta do Claude</strong> — o login e o histórico ficam nele.
            </span>
          </label>

          <div className="confirm-actions">
            <button className="btn" onClick={onCancel}>
              Cancelar
            </button>
            <button className="btn primary" onClick={submit} disabled={!valid}>
              {mode === 'new' ? 'Adicionar projeto' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
