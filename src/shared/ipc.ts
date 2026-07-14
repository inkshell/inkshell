/**
 * The single source of truth for IPC channel names. Keeping them here (rather
 * than as scattered string literals) means the preload bridge and the main
 * handlers can never drift apart on a typo.
 */
export const IpcChannel = {
  // Config
  ConfigLoad: 'config:load',
  ConfigSave: 'config:save',

  // Projects & history
  DialogPickFolder: 'dialog:pickFolder',
  HistoryListSessions: 'history:listSessions',
  HistoryDiscoverProjects: 'history:discoverProjects',
  HistorySessionContext: 'history:sessionContext',

  // Pseudo-terminal (request/response)
  PtyCreate: 'pty:create',
  PtyWrite: 'pty:write',
  PtyResize: 'pty:resize',
  PtyKill: 'pty:kill',

  // Pseudo-terminal (main -> renderer push)
  PtyData: 'pty:data',
  PtyExit: 'pty:exit',

  // Window controls (frameless custom chrome; dragging is done via CSS regions)
  WindowMinimize: 'window:minimize',
  WindowMaximizeToggle: 'window:maximizeToggle',
  WindowClose: 'window:close'
} as const

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel]
