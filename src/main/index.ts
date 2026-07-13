import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './window'
import { registerIpcHandlers, unregisterIpcHandlers } from './ipc'
import type { PtyManager } from './pty-manager'

let ptyManager: PtyManager | null = null

function bootWindow(): void {
  const window = createMainWindow()
  ptyManager = registerIpcHandlers(window)

  window.on('closed', () => {
    ptyManager?.disposeAll()
    ptyManager = null
    unregisterIpcHandlers()
  })
}

app.whenReady().then(() => {
  app.setName('VibeBox')
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

app.on('before-quit', () => ptyManager?.disposeAll())
