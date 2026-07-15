import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel } from '@shared/ipc'
import type {
  AppConfig,
  FileContent,
  GitCommit,
  GitCommitDetail,
  GitStatus,
  PtyCreateOptions,
  PtyCreateResult,
  PtyDataEvent,
  PtyExitEvent,
  SessionContext,
  SessionSummary,
  TreeEntry
} from '@shared/types'

/**
 * The one and only surface the renderer can reach the OS through. Everything is
 * a narrow, typed wrapper over a named IPC channel — no `ipcRenderer`, no Node
 * built-ins, and no remote module are exposed, so a compromised renderer can
 * only do what these functions allow.
 */
const api = {
  platform: process.platform,

  config: {
    load: (): Promise<AppConfig> => ipcRenderer.invoke(IpcChannel.ConfigLoad),
    save: (config: AppConfig): Promise<void> => ipcRenderer.invoke(IpcChannel.ConfigSave, config)
  },

  dialog: {
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke(IpcChannel.DialogPickFolder)
  },

  history: {
    listSessions: (projectPath: string, claudeConfigDir?: string): Promise<SessionSummary[]> =>
      ipcRenderer.invoke(IpcChannel.HistoryListSessions, projectPath, claudeConfigDir),
    discoverProjects: (): Promise<string[]> =>
      ipcRenderer.invoke(IpcChannel.HistoryDiscoverProjects),
    sessionContext: (
      projectPath: string,
      sessionId: string,
      claudeConfigDir?: string
    ): Promise<SessionContext | null> =>
      ipcRenderer.invoke(IpcChannel.HistorySessionContext, projectPath, sessionId, claudeConfigDir),
    deleteSession: (
      projectPath: string,
      sessionId: string,
      claudeConfigDir?: string
    ): Promise<void> =>
      ipcRenderer.invoke(IpcChannel.HistoryDeleteSession, projectPath, sessionId, claudeConfigDir)
  },

  pty: {
    create: (opts: PtyCreateOptions): Promise<PtyCreateResult> =>
      ipcRenderer.invoke(IpcChannel.PtyCreate, opts),
    write: (ptyId: number, data: string): void =>
      ipcRenderer.send(IpcChannel.PtyWrite, ptyId, data),
    resize: (ptyId: number, cols: number, rows: number): void =>
      ipcRenderer.send(IpcChannel.PtyResize, ptyId, cols, rows),
    /** Sends `/exit` and resolves once the session is gone (killed if it won't). */
    close: (ptyId: number): Promise<void> => ipcRenderer.invoke(IpcChannel.PtyClose, ptyId),

    /** Subscribes to output for a single pty. Returns an unsubscribe function. */
    onData: (ptyId: number, cb: (data: string) => void): (() => void) => {
      const listener = (_e: unknown, payload: PtyDataEvent): void => {
        if (payload.ptyId === ptyId) cb(payload.data)
      }
      ipcRenderer.on(IpcChannel.PtyData, listener)
      return () => ipcRenderer.removeListener(IpcChannel.PtyData, listener)
    },

    /** Subscribes to the exit of a single pty. Returns an unsubscribe function. */
    onExit: (ptyId: number, cb: (exitCode: number) => void): (() => void) => {
      const listener = (_e: unknown, payload: PtyExitEvent): void => {
        if (payload.ptyId === ptyId) cb(payload.exitCode)
      }
      ipcRenderer.on(IpcChannel.PtyExit, listener)
      return () => ipcRenderer.removeListener(IpcChannel.PtyExit, listener)
    }
  },

  git: {
    status: (projectPath: string): Promise<GitStatus> =>
      ipcRenderer.invoke(IpcChannel.GitStatus, projectPath),
    diff: (projectPath: string, filePath: string, staged: boolean): Promise<string> =>
      ipcRenderer.invoke(IpcChannel.GitDiff, projectPath, filePath, staged),
    stage: (projectPath: string, filePath: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannel.GitStage, projectPath, filePath),
    unstage: (projectPath: string, filePath: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannel.GitUnstage, projectPath, filePath),
    commit: (projectPath: string, message: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannel.GitCommit, projectPath, message),
    push: (projectPath: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannel.GitPush, projectPath),
    log: (projectPath: string): Promise<GitCommit[]> =>
      ipcRenderer.invoke(IpcChannel.GitLog, projectPath),
    show: (projectPath: string, hash: string): Promise<GitCommitDetail> =>
      ipcRenderer.invoke(IpcChannel.GitShow, projectPath, hash),
    suggestMessage: (projectPath: string, claudeConfigDir?: string): Promise<string> =>
      ipcRenderer.invoke(IpcChannel.GitSuggestMessage, projectPath, claudeConfigDir)
  },

  fs: {
    list: (projectPath: string, relPath: string): Promise<TreeEntry[]> =>
      ipcRenderer.invoke(IpcChannel.FsList, projectPath, relPath),
    read: (projectPath: string, relPath: string): Promise<FileContent> =>
      ipcRenderer.invoke(IpcChannel.FsRead, projectPath, relPath),
    /** The project-relative path for a path-shaped token, or null if it isn't one. */
    resolve: (projectPath: string, candidate: string): Promise<string | null> =>
      ipcRenderer.invoke(IpcChannel.FsResolve, projectPath, candidate)
  },

  window: {
    minimize: (): void => ipcRenderer.send(IpcChannel.WindowMinimize),
    maximizeToggle: (): void => ipcRenderer.send(IpcChannel.WindowMaximizeToggle),
    close: (): void => ipcRenderer.send(IpcChannel.WindowClose)
  }
}

export type VibeBoxApi = typeof api

contextBridge.exposeInMainWorld('vibebox', api)
