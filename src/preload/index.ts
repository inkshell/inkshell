import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel } from '@shared/ipc'
import type {
  AppConfig,
  PtyCreateOptions,
  PtyCreateResult,
  PtyDataEvent,
  PtyExitEvent,
  SessionSummary
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
    contextTokens: (
      projectPath: string,
      sessionId: string,
      claudeConfigDir?: string
    ): Promise<number | null> =>
      ipcRenderer.invoke(IpcChannel.HistoryContextTokens, projectPath, sessionId, claudeConfigDir)
  },

  pty: {
    create: (opts: PtyCreateOptions): Promise<PtyCreateResult> =>
      ipcRenderer.invoke(IpcChannel.PtyCreate, opts),
    write: (ptyId: number, data: string): void =>
      ipcRenderer.send(IpcChannel.PtyWrite, ptyId, data),
    resize: (ptyId: number, cols: number, rows: number): void =>
      ipcRenderer.send(IpcChannel.PtyResize, ptyId, cols, rows),
    kill: (ptyId: number): void => ipcRenderer.send(IpcChannel.PtyKill, ptyId),

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

  window: {
    minimize: (): void => ipcRenderer.send(IpcChannel.WindowMinimize),
    maximizeToggle: (): void => ipcRenderer.send(IpcChannel.WindowMaximizeToggle),
    close: (): void => ipcRenderer.send(IpcChannel.WindowClose)
  }
}

export type VibeBoxApi = typeof api

contextBridge.exposeInMainWorld('vibebox', api)
