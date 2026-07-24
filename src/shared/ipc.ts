/**
 * The single source of truth for IPC channel names. Keeping them here (rather
 * than as scattered string literals) means the preload bridge and the main
 * handlers can never drift apart on a typo.
 */
export const IpcChannel = {
  // App
  AppGetInfo: 'app:getInfo',

  // Config
  ConfigLoad: 'config:load',
  ConfigSave: 'config:save',

  // Projects & history
  DialogPickFolder: 'dialog:pickFolder',
  HistoryListSessions: 'history:listSessions',
  HistoryDiscoverProjects: 'history:discoverProjects',
  HistorySessionContext: 'history:sessionContext',
  HistoryDeleteSession: 'history:deleteSession',

  // Pseudo-terminal (request/response)
  PtyCreate: 'pty:create',
  PtyWrite: 'pty:write',
  PtyResize: 'pty:resize',
  PtyClose: 'pty:close',

  // Pseudo-terminal (main -> renderer push)
  PtyData: 'pty:data',
  PtyExit: 'pty:exit',

  // Project panel — git (main drives the real `git` binary) & files
  GitStatus: 'git:status',
  GitStage: 'git:stage',
  GitUnstage: 'git:unstage',
  GitCommit: 'git:commit',
  GitPush: 'git:push',
  GitLog: 'git:log',
  GitShow: 'git:show',
  GitFileDiff: 'git:fileDiff',
  GitCommitFileDiff: 'git:commitFileDiff',
  GitSuggestMessage: 'git:suggestMessage',
  FsList: 'fs:list',
  FsRead: 'fs:read',
  FsWrite: 'fs:write',
  FsResolve: 'fs:resolve',
  FsListAllFiles: 'fs:listAllFiles',

  // Window controls (frameless custom chrome; dragging is done via CSS regions)
  WindowMinimize: 'window:minimize',
  WindowMaximizeToggle: 'window:maximizeToggle',
  WindowClose: 'window:close'
} as const

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel]
