import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IpcChannel } from '@shared/ipc'
import type { AppConfig, PtyCreateOptions } from '@shared/types'
import { addRecentProject, loadConfig, saveConfig } from './config'
import { discoverKnownProjects, listSessions, sessionContext } from './claude-history'
import { PtyManager } from './pty-manager'

/**
 * Wires every renderer request to its main-process implementation. One
 * `PtyManager` is created per window so a session's data pushes reach the right
 * renderer, and every handler is a thin, typed shell over the modules above.
 */
export function registerIpcHandlers(window: BrowserWindow): PtyManager {
  const ptyManager = new PtyManager(window.webContents)

  // --- Config -------------------------------------------------------------
  ipcMain.handle(IpcChannel.ConfigLoad, () => loadConfig())
  ipcMain.handle(IpcChannel.ConfigSave, (_e, config: AppConfig) => saveConfig(config))

  // --- Projects & history -------------------------------------------------
  ipcMain.handle(IpcChannel.DialogPickFolder, async () => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Open a project folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const path = result.filePaths[0]
    // Persist it as a recent project right away, mirroring the desktop app.
    addRecentProject(loadConfig(), path)
    return path
  })

  ipcMain.handle(
    IpcChannel.HistoryListSessions,
    (_e, projectPath: string, claudeConfigDir?: string) =>
      listSessions(projectPath, claudeConfigDir)
  )
  ipcMain.handle(IpcChannel.HistoryDiscoverProjects, () => discoverKnownProjects())
  ipcMain.handle(
    IpcChannel.HistorySessionContext,
    (_e, projectPath: string, sessionId: string, claudeConfigDir?: string) =>
      sessionContext(projectPath, sessionId, claudeConfigDir)
  )

  // --- Pseudo-terminal ----------------------------------------------------
  ipcMain.handle(IpcChannel.PtyCreate, (_e, opts: PtyCreateOptions) => ptyManager.create(opts))
  ipcMain.on(IpcChannel.PtyWrite, (_e, ptyId: number, data: string) =>
    ptyManager.write(ptyId, data)
  )
  ipcMain.on(IpcChannel.PtyResize, (_e, ptyId: number, cols: number, rows: number) =>
    ptyManager.resize(ptyId, cols, rows)
  )
  ipcMain.on(IpcChannel.PtyKill, (_e, ptyId: number) => ptyManager.kill(ptyId))

  // --- Window controls ----------------------------------------------------
  ipcMain.on(IpcChannel.WindowMinimize, () => window.minimize())
  ipcMain.on(IpcChannel.WindowMaximizeToggle, () =>
    window.isMaximized() ? window.unmaximize() : window.maximize()
  )
  ipcMain.on(IpcChannel.WindowClose, () => window.close())

  return ptyManager
}

/** Removes every handler registered above, so a re-created window starts clean. */
export function unregisterIpcHandlers(): void {
  for (const channel of Object.values(IpcChannel)) {
    ipcMain.removeHandler(channel)
    ipcMain.removeAllListeners(channel)
  }
}
