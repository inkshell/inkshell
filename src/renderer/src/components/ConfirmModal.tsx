import { useEffect, type ReactNode } from 'react'

interface Props {
  title: string
  /** The body prompt; a string or richer markup (e.g. the chat's preview). */
  message: ReactNode
  /** Label of the confirming button (e.g. "Delete"). */
  confirmLabel: string
  /** Tints the confirm button as a destructive action. */
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * A small yes/no confirmation dialog, reusing the settings modal's overlay
 * chrome. Clicking the backdrop or pressing Escape cancels; Enter confirms —
 * so a destructive action always takes a deliberate second gesture.
 */
export function ConfirmModal({ title, message, confirmLabel, danger, onConfirm, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      else if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onConfirm, onCancel])

  return (
    <div className="overlay" onMouseDown={onCancel}>
      <div className="modal confirm-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">{title}</span>
        </div>
        <div className="modal-body">
          <p className="confirm-message">{message}</p>
          <div className="confirm-actions">
            <button className="btn" onClick={onCancel}>
              Cancel
            </button>
            <button
              className={`btn ${danger ? 'danger' : 'primary'}`}
              onClick={onConfirm}
              autoFocus
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
