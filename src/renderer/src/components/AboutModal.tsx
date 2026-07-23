import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/types'
import { CloseIcon } from './Icons'

interface Props {
  onClose: () => void
}

/**
 * Version and environment facts, read live from the main process rather than
 * baked in at build time — so this can never drift from what's actually
 * running. Blank until the one IPC round-trip resolves.
 */
export function AboutModal({ onClose }: Props) {
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    window.inkshell.app
      .getInfo()
      .then((i) => {
        if (!cancelled) setInfo(i)
      })
      .catch((err) => {
        if (!cancelled) console.error('Failed to load app info:', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal about-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">About InkShell</span>
          <button className="del-btn" onClick={onClose} title="Close">
            <CloseIcon size={13} />
          </button>
        </div>

        <div className="modal-body">
          <div className="about-hero">
            <div className="about-badge">◈</div>
            <div className="about-name">InkShell</div>
            <div className="about-version">{info ? `Version ${info.version}` : ' '}</div>
            <p className="about-tagline">
              A tabbed desktop workspace for Claude Code — the CLI, with style.
            </p>
          </div>

          <div className="about-divider" />

          <div className="about-rows">
            <div className="about-row">
              <span>Electron</span>
              <span>{info?.electron ?? '—'}</span>
            </div>
            <div className="about-row">
              <span>Chromium</span>
              <span>{info?.chrome ?? '—'}</span>
            </div>
            <div className="about-row">
              <span>Node</span>
              <span>{info?.node ?? '—'}</span>
            </div>
            <div className="about-row">
              <span>claude binary</span>
              <span className="about-mono" title={info?.claudePath ?? undefined}>
                {info ? (info.claudePath ?? 'Not found on PATH') : '—'}
              </span>
            </div>
          </div>

          <div className="about-divider" />

          <div className="about-links">
            <a href="https://github.com/inkshell/inkshell" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href="https://github.com/inkshell/inkshell/issues" target="_blank" rel="noreferrer">
              Report an issue
            </a>
            <span className="about-license">Apache-2.0</span>
          </div>
        </div>
      </div>
    </div>
  )
}
