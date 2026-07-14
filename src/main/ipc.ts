import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IpcChannel } from '@shared/ipc'
import type { AppConfig, PtyCreateOptions } from '@shared/types'
import { addRecentProject, loadConfig, saveConfig } from './config'
import {
  deleteSession,
  discoverKnownProjects,
  listSessions,
  sessionContext
} from './claude-history'
import {
  gitCommit,
  gitDiff,
  gitLog,
  gitPush,
  gitShow,
  gitStage,
  gitStatus,
  gitUnstage,
  suggestCommitMessage
} from './git'
import { listDir, readProjectFile } from './project-files'
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
  ipcMain.handle(
    IpcChannel.HistoryDeleteSession,
    (_e, projectPath: string, sessionId: string, claudeConfigDir?: string) =>
      deleteSession(projectPath, sessionId, claudeConfigDir)
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

  // --- Project panel: git + files -----------------------------------------
  // Every handler drives the real `git` binary in the project directory; the
  // renderer only ever renders what comes back (the sandbox is never widened).
  ipcMain.handle(IpcChannel.GitStatus, (_e, projectPath: string) => gitStatus(projectPath))
  ipcMain.handle(IpcChannel.GitDiff, (_e, projectPath: string, filePath: string, staged: boolean) =>
    gitDiff(projectPath, filePath, staged)
  )
  ipcMain.handle(IpcChannel.GitStage, (_e, projectPath: string, filePath: string) =>
    gitStage(projectPath, filePath)
  )
  ipcMain.handle(IpcChannel.GitUnstage, (_e, projectPath: string, filePath: string) =>
    gitUnstage(projectPath, filePath)
  )
  ipcMain.handle(IpcChannel.GitCommit, (_e, projectPath: string, message: string) =>
    gitCommit(projectPath, message)
  )
  ipcMain.handle(IpcChannel.GitPush, (_e, projectPath: string) => gitPush(projectPath))
  ipcMain.handle(IpcChannel.GitLog, (_e, projectPath: string) => gitLog(projectPath))
  ipcMain.handle(IpcChannel.GitShow, (_e, projectPath: string, hash: string) =>
    gitShow(projectPath, hash)
  )
  ipcMain.handle(
    IpcChannel.GitSuggestMessage,
    (_e, projectPath: string, claudeConfigDir?: string) =>
      suggestCommitMessage(projectPath, claudeConfigDir)
  )
  ipcMain.handle(IpcChannel.FsList, (_e, projectPath: string, relPath: string) =>
    listDir(projectPath, relPath)
  )
  ipcMain.handle(IpcChannel.FsRead, (_e, projectPath: string, relPath: string) =>
    readProjectFile(projectPath, relPath)
  )

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
