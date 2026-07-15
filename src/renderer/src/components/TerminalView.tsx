import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { terminalTheme } from '../lib/xterm-theme'
import { createFileLinkProvider, type FileLinkTarget } from '../lib/file-links'
import type { Tab } from '../types'

interface Props {
  tab: Tab
  active: boolean
  /** Reports the spawned pty + session id back so the tab can be tracked. */
  onReady: (tabId: string, ptyId: number, sessionId: string) => void
  /** A file path in the output was clicked; it opens as a viewer tab. */
  onOpenFile: (target: FileLinkTarget, project: string) => void
  /** The terminal title changed (CLI set it via an OSC sequence). */
  onTitle: (tabId: string, title: string) => void
  /** The child process exited; the tab should close. */
  onExit: (tabId: string) => void
  /** The `claude` process could not be started (e.g. not on PATH). */
  onError: (tabId: string, message: string) => void
}

/**
 * Hands a clicked link to main, which passes it to the user's browser.
 *
 * The URL must go into `window.open` up front. Both of xterm's own defaults —
 * the OSC 8 one and `WebLinksAddon`'s — instead open a blank window and only
 * then assign `location`, which cannot work here: main denies every popup (see
 * `setWindowOpenHandler`), so they get back `null` and drop the click, having
 * told main nothing but `about:blank`.
 */
function openUrl(uri: string): void {
  window.open(uri, '_blank', 'noopener')
}

/**
 * One live terminal, bound to one `claude` child process. Owns its xterm
 * instance for the tab's whole lifetime — inactive tabs stay mounted (just
 * hidden) so their scrollback and process keep running in the background.
 */
export function TerminalView({
  tab,
  active,
  onReady,
  onOpenFile,
  onTitle,
  onExit,
  onError
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const ptyIdRef = useRef<number | null>(null)

  // Latest callbacks, read from a ref so the setup effect can stay [] and never
  // re-run (which would respawn the process).
  const cbRef = useRef({ onReady, onOpenFile, onTitle, onExit, onError })
  cbRef.current = { onReady, onOpenFile, onTitle, onExit, onError }

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
      scrollback: 10_000,
      // Claude Code marks up its URLs as OSC 8 hyperlinks, which xterm resolves
      // itself rather than through `WebLinksAddon` — so both need `openUrl`.
      // Left unset, xterm prompts ("this link could potentially be dangerous")
      // and then drops the click, the same way the addon's default does.
      linkHandler: { activate: (_event, uri) => openUrl(uri) }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    // Order matters: URLs are claimed first, so a path inside one never steals
    // the click from the real link.
    term.loadAddon(new WebLinksAddon((_event, uri) => openUrl(uri)))
    const links = term.registerLinkProvider(
      createFileLinkProvider(
        term,
        () => tab.cwd,
        (target) => {
          if (tab.cwd) cbRef.current.onOpenFile(target, tab.cwd)
        }
      )
    )
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
      links.dispose()
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
