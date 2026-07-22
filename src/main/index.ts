import { app, BrowserWindow } from 'electron'
import { resolveClaudeBinary } from './claude-binary'
import { createMainWindow } from './window'
import { registerIpcHandlers, unregisterIpcHandlers } from './ipc'
import type { PtyManager } from './pty-manager'

let ptyManager: PtyManager | null = null

/**
 * True once the sessions have been asked to leave. Every close/quit path checks
 * it, so the graceful pass runs exactly once and the close it re-triggers on the
 * way out goes straight through. It also makes a second close click mean "go
 * now" — the pass is already running, so nothing holds the window any more.
 */
let sessionsDisposed = false

function disposeSessions(): Promise<void> {
  sessionsDisposed = true
  return ptyManager?.disposeAll() ?? Promise.resolve()
}

function bootWindow(): void {
  const window = createMainWindow()
  ptyManager = registerIpcHandlers(window)
  sessionsDisposed = false

  // Closing the window means every `claude` inside it is leaving. Hold the close
  // just long enough for each to `/exit` on its own terms, rather than pulling
  // the pty out from under a live process.
  window.on('close', (event) => {
    if (sessionsDisposed) return
    event.preventDefault()
    void disposeSessions().finally(() => window.close())
  })

  window.on('closed', () => {
    ptyManager?.killAll()
    ptyManager = null
    unregisterIpcHandlers()
  })
}

app.whenReady().then(() => {
  app.setName('InkShell')
  // Find the `claude` binary while the window is still loading: the lookup can
  // cost a login-shell spawn, and doing it here means the first chat rarely
  // waits for one. Failures are the spawn's to report, not this call's.
  void resolveClaudeBinary()
  bootWindow()

  // macOS: re-open a window when the dock icon is clicked and none are open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) bootWindow()
  })
})

app.on('window-all-closed', () => {
  // Standard macOS behavior is to stay resident until Cmd-Q; everywhere else the
  // app exits with its last window.
  if (process.platform !== 'darwin') app.quit()
})

// Cmd-Q (and the app menu) quit without ever firing the window's own `close`
// handler, so the same graceful pass has to guard the quit itself.
app.on('before-quit', (event) => {
  if (sessionsDisposed) return
  event.preventDefault()
  void disposeSessions().finally(() => app.quit())
})
