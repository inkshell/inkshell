import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IpcChannel } from '@shared/ipc'
import type { AppConfig, PtyCreateOptions } from '@shared/types'
import { loadConfig, saveConfig } from './config'
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
import { listAllFiles, listDir, readProjectFile, resolveProjectPath } from './project-files'
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
  // A plain folder picker with no side effects: adding a project is the
  // renderer's job now, since the project screen lets the user set its name,
  // colour and config dir before anything is written to disk. The same picker
  // also serves the `CLAUDE_CONFIG_DIR` field, hence the caller-supplied title.
  ipcMain.handle(IpcChannel.DialogPickFolder, async (_e, title?: string) => {
    const result = await dialog.showOpenDialog(window, {
      title: title || 'Open a project folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
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
  // `handle`, not `on`: callers need to await the child actually being gone —
  // deleting a chat has to wait out the session that still owns its transcript.
  ipcMain.handle(IpcChannel.PtyClose, (_e, ptyId: number) => ptyManager.close(ptyId))

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
    (_e, projectPath: string, claudeConfigDir?: string, model?: string) =>
      suggestCommitMessage(projectPath, claudeConfigDir, model)
  )
  ipcMain.handle(IpcChannel.FsList, (_e, projectPath: string, relPath: string) =>
    listDir(projectPath, relPath)
  )
  ipcMain.handle(IpcChannel.FsRead, (_e, projectPath: string, relPath: string) =>
    readProjectFile(projectPath, relPath)
  )
  ipcMain.handle(IpcChannel.FsResolve, (_e, projectPath: string, candidate: string) =>
    resolveProjectPath(projectPath, candidate)
  )
  ipcMain.handle(IpcChannel.FsListAllFiles, (_e, projectPath: string) => listAllFiles(projectPath))

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
