import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { terminalTheme } from '../lib/xterm-theme'
import { createFileLinkProvider, type FileLinkTarget } from '../lib/file-links'
import type { Tab } from '../types'

export interface TerminalViewHandle {
  /** Puts the keyboard back in the terminal (a click elsewhere steals it). */
  focus: () => void
}

interface Props {
  tab: Tab
  /** Whether this tab is placed in a visible pane (drives show/hide + refit). */
  active: boolean
  /** Whether this tab holds the focused pane (drives the keyboard focus). */
  focused: boolean
  /** xterm font size in px, from the toolbar's A−/A+ control. Live-updated. */
  fontSize: number
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
 * One live terminal, bound to one CLI child process (`claude` or `opencode`).
 * Owns its xterm instance for the tab's whole lifetime — inactive tabs stay
 * mounted (just hidden) so their scrollback and process keep running in the
 * background.
 */
export const TerminalView = forwardRef<TerminalViewHandle, Props>(function TerminalView(
  { tab, active, focused, fontSize, onReady, onOpenFile, onTitle, onExit, onError }: Props,
  ref
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const ptyIdRef = useRef<number | null>(null)

  // Latest callbacks, read from a ref so the setup effect can stay [] and never
  // re-run (which would respawn the process).
  const cbRef = useRef({ onReady, onOpenFile, onTitle, onExit, onError })
  cbRef.current = { onReady, onOpenFile, onTitle, onExit, onError }

  useImperativeHandle(
    ref,
    () => ({
      focus: () => termRef.current?.focus()
    }),
    []
  )

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const term = new Terminal({
      theme: terminalTheme,
      fontFamily:
        "'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, 'Liberation Mono', monospace",
      fontSize,
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

    window.inkshell.pty
      .create({
        cwd: tab.cwd ?? undefined,
        shell: tab.kind === 'shell',
        cli: tab.cli,
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
          void window.inkshell.pty.close(ptyId)
          return
        }
        ptyIdRef.current = ptyId
        cbRef.current.onReady(tab.id, ptyId, sessionId)

        let sawOutput = false
        unsubscribers.push(
          window.inkshell.pty.onData(ptyId, (data) => {
            sawOutput = true
            term.write(data)
          })
        )
        unsubscribers.push(
          window.inkshell.pty.onExit(ptyId, (exitCode) => {
            // A session that dies without printing a single byte never really
            // started — closing its tab would look like the click did nothing.
            // Say so instead; a session that ran and then left just closes.
            if (!sawOutput && exitCode !== 0) {
              cbRef.current.onError(
                tab.id,
                tab.kind === 'shell'
                  ? `The terminal exited immediately (code ${exitCode}) without starting.`
                  : tab.cli === 'opencode'
                    ? `Opencode exited immediately (code ${exitCode}) without starting. Check that \`opencode\` runs in your terminal.`
                    : `Claude Code exited immediately (code ${exitCode}) without starting. Check that \`claude\` runs in your terminal.`
              )
              return
            }
            cbRef.current.onExit(tab.id)
          })
        )
        term.onData((data) => window.inkshell.pty.write(ptyId, data))
        term.onResize(({ cols, rows }) => window.inkshell.pty.resize(ptyId, cols, rows))
      })
      .catch((err) => {
        if (disposed) return
        // Electron wraps a main-process throw as "Error invoking remote method
        // '<channel>': Error: <message>" — only the tail was written for a
        // person to read, so the plumbing is stripped off it here.
        const raw = String(err?.message ?? err)
        const message = raw.replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, '')
        if (tab.kind === 'shell') {
          cbRef.current.onError(tab.id, `Couldn't open a terminal: ${message}`)
          return
        }
        // The spawn errors name their own CLI ("Claude Code was not found…",
        // "Opencode was not found…"); anything else gets the prefix.
        const named =
          tab.cli === 'opencode' ? message.includes('Opencode') : message.includes('Claude Code')
        cbRef.current.onError(
          tab.id,
          named
            ? message
            : `Couldn't start ${tab.cli === 'opencode' ? 'Opencode' : 'Claude Code'}: ${message}`
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
      if (ptyIdRef.current !== null) void window.inkshell.pty.close(ptyIdRef.current)
      term.dispose()
    }
    // Deliberately run once per tab; the tab's identity/config never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Push a live font-size change into the already-open terminal — xterm reads
  // `options.fontSize` lazily, but never re-measures on its own, so a refit is
  // what actually resizes the cell grid (and, via `onResize`, the pty) to it.
  useEffect(() => {
    const term = termRef.current
    if (!term || term.options.fontSize === fontSize) return
    term.options.fontSize = fontSize
    try {
      fitRef.current?.fit()
    } catch {
      /* host not laid out yet; the ResizeObserver will catch up */
    }
  }, [fontSize])

  // Refit whenever this tab becomes visible — its pane may have been hidden (so
  // zero-sized) or just resized by a layout change, and xterm needs remeasuring.
  useEffect(() => {
    if (!active) return
    const id = requestAnimationFrame(() => {
      try {
        fitRef.current?.fit()
      } catch {
        /* ignore */
      }
    })
    return () => cancelAnimationFrame(id)
  }, [active])

  // Grab the keyboard when this tab's pane becomes the focused one.
  useEffect(() => {
    if (!focused) return
    const id = requestAnimationFrame(() => termRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [focused])

  return <div ref={hostRef} className="term-host" hidden={!active} />
})
