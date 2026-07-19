import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { terminalTheme } from '../lib/xterm-theme'
import { createFileLinkProvider, type FileLinkTarget } from '../lib/file-links'
import type { Tab } from '../types'

export interface TerminalViewHandle {
  /** True when the CLI's input box is on screen and verifiably empty. */
  promptIsEmpty: () => boolean
  /** Puts the keyboard back in the terminal (the status bar steals it). */
  focus: () => void
}

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
 * Whether the CLI's input box is verifiably empty.
 *
 * A half-written draft lives inside the `claude` process, which never reports
 * it anywhere — its only observable trace is the screen itself. So this reads
 * the input box the CLI draws at the bottom of the buffer: a `❯` marker line
 * between two `───` border lines. Callers use it to decide whether typing a
 * `/command` into the pty is safe; anything already in the box would swallow
 * the command into the draft and submit the two as one prompt.
 *
 * It deliberately errs toward "not empty". Every state it cannot positively
 * recognize as an empty prompt counts as a draft: no box on screen (CLI still
 * booting, or a redesigned layout), a box taller than one row (the draft holds
 * a line break, even if no cell in it is visible), a marker other than `❯`
 * (the `!` bash and `#` memory modes only ever engage by typing), or any text
 * it can't classify. The failure mode is a needlessly disabled switcher —
 * never a corrupted prompt. The one text tolerated is the CLI's own
 * placeholder (`Try "…"`), which renders dim and only appears while the input
 * is empty; dim text that isn't the placeholder (a paste chip, ghost text)
 * still counts as content.
 */
function promptBoxIsEmpty(term: Terminal): boolean {
  const buffer = term.buffer.active
  const last = buffer.length - 1
  const first = Math.max(0, buffer.length - term.rows)
  const borderAt = (y: number): boolean =>
    /^\s*─{8,}\s*$/.test(buffer.getLine(y)?.translateToString(true) ?? '')

  let bottom = -1
  for (let y = last; y >= first; y--) {
    if (borderAt(y)) {
      bottom = y
      break
    }
  }
  let top = -1
  for (let y = bottom - 1; y >= first; y--) {
    if (borderAt(y)) {
      top = y
      break
    }
  }
  if (top < 0) return false

  // An empty prompt is exactly one row tall. A taller box means the draft
  // already holds a line break even when every visible cell in it is blank —
  // a draft may well *start* with a blank line, or be nothing but newlines.
  if (bottom - top !== 2) return false

  const line = buffer.getLine(top + 1)
  if (!line) return false
  if (!line.translateToString(true).startsWith('❯')) return false
  let dimText = ''
  for (let x = 1; x < line.length; x++) {
    const cell = line.getCell(x)
    const chars = cell?.getChars() ?? ''
    if (!chars.trim()) continue
    if (!cell!.isDim()) return false
    dimText += chars
  }
  return dimText === '' || dimText.startsWith('Try')
}

/**
 * One live terminal, bound to one `claude` child process. Owns its xterm
 * instance for the tab's whole lifetime — inactive tabs stay mounted (just
 * hidden) so their scrollback and process keep running in the background.
 */
export const TerminalView = forwardRef<TerminalViewHandle, Props>(function TerminalView(
  { tab, active, onReady, onOpenFile, onTitle, onExit, onError }: Props,
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
      promptIsEmpty: () => (termRef.current ? promptBoxIsEmpty(termRef.current) : false),
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

    window.inkshell.pty
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
          void window.inkshell.pty.close(ptyId)
          return
        }
        ptyIdRef.current = ptyId
        cbRef.current.onReady(tab.id, ptyId, sessionId)

        unsubscribers.push(window.inkshell.pty.onData(ptyId, (data) => term.write(data)))
        unsubscribers.push(window.inkshell.pty.onExit(ptyId, () => cbRef.current.onExit(tab.id)))
        term.onData((data) => window.inkshell.pty.write(ptyId, data))
        term.onResize(({ cols, rows }) => window.inkshell.pty.resize(ptyId, cols, rows))
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
      if (ptyIdRef.current !== null) void window.inkshell.pty.close(ptyIdRef.current)
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
})
