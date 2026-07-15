import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { terminalTheme } from '../lib/xterm-theme'
import type { Tab } from '../types'

interface Props {
  tab: Tab
  active: boolean
  /** Reports the spawned pty + session id back so the tab can be tracked. */
  onReady: (tabId: string, ptyId: number, sessionId: string) => void
  /** The terminal title changed (CLI set it via an OSC sequence). */
  onTitle: (tabId: string, title: string) => void
  /** The child process exited; the tab should close. */
  onExit: (tabId: string) => void
  /** The `claude` process could not be started (e.g. not on PATH). */
  onError: (tabId: string, message: string) => void
}

/**
 * One live terminal, bound to one `claude` child process. Owns its xterm
 * instance for the tab's whole lifetime — inactive tabs stay mounted (just
 * hidden) so their scrollback and process keep running in the background.
 */
export function TerminalView({ tab, active, onReady, onTitle, onExit, onError }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const ptyIdRef = useRef<number | null>(null)

  // Latest callbacks, read from a ref so the setup effect can stay [] and never
  // re-run (which would respawn the process).
  const cbRef = useRef({ onReady, onTitle, onExit, onError })
  cbRef.current = { onReady, onTitle, onExit, onError }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const term = new Terminal({
      theme: terminalTheme,
      fontFamily:
        "'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, 'Liberation Mono', monospace",
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 10_000
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(host)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    let disposed = false
    const unsubscribers: Array<() => void> = []

    window.vibebox.pty
      .create({
        cwd: tab.cwd ?? undefined,
        resumeSessionId: tab.resumeSessionId ?? undefined,
        model: tab.model ?? undefined,
        effort: tab.effort ?? undefined,
        claudeConfigDir: tab.claudeConfigDir ?? undefined,
        cols: term.cols,
        rows: term.rows
      })
      .then(({ ptyId, sessionId }) => {
        // The tab may have been closed while the pty was starting.
        if (disposed) {
          void window.vibebox.pty.close(ptyId)
          return
        }
        ptyIdRef.current = ptyId
        cbRef.current.onReady(tab.id, ptyId, sessionId)

        unsubscribers.push(window.vibebox.pty.onData(ptyId, (data) => term.write(data)))
        unsubscribers.push(window.vibebox.pty.onExit(ptyId, () => cbRef.current.onExit(tab.id)))
        term.onData((data) => window.vibebox.pty.write(ptyId, data))
        term.onResize(({ cols, rows }) => window.vibebox.pty.resize(ptyId, cols, rows))
      })
      .catch((err) => {
        if (disposed) return
        cbRef.current.onError(
          tab.id,
          `Não foi possível iniciar o Claude Code (binário "claude" no PATH?): ${err?.message ?? err}`
        )
      })

    term.onTitleChange((title) => cbRef.current.onTitle(tab.id, title))

    // Keep the terminal grid matched to its container.
    const observer = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        // Fitting a not-yet-laid-out host throws; the next tick retries.
      }
    })
    observer.observe(host)

    return () => {
      disposed = true
      observer.disconnect()
      unsubscribers.forEach((u) => u())
      // The tab is going away now; the `claude` behind it exits on its own time.
      if (ptyIdRef.current !== null) void window.vibebox.pty.close(ptyIdRef.current)
      term.dispose()
    }
    // Deliberately run once per tab; the tab's identity/config never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refit and grab focus whenever this tab becomes the active one.
  useEffect(() => {
    if (!active) return
    const id = requestAnimationFrame(() => {
      try {
        fitRef.current?.fit()
      } catch {
        /* ignore */
      }
      termRef.current?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [active])

  return <div ref={hostRef} className="term-host" hidden={!active} />
}
