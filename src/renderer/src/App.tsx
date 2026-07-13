import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from 'react-resizable-panels'
import type { AppConfig, SessionSummary } from '@shared/types'
import type { Tab } from './types'
import { Sidebar } from './components/Sidebar'
import { TabBar } from './components/TabBar'
import { TitleBar } from './components/TitleBar'
import { StatusBar } from './components/StatusBar'
import { TerminalView } from './components/TerminalView'
import { EmptyState } from './components/EmptyState'
import { SettingsModal } from './components/SettingsModal'
import { CloseIcon } from './components/Icons'

const isMac = window.vibebox.platform === 'darwin'
let tabSeq = 0

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [currentProject, setCurrentProject] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [contextTokens, setContextTokens] = useState<number | null>(null)

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null

  // The `CLAUDE_CONFIG_DIR` override for a project path, read from a ref so the
  // lookup helper stays stable and doesn't need to be in every dependency list.
  const configRef = useRef(config)
  configRef.current = config
  const claudeConfigDirFor = useCallback(
    (path: string | null): string | undefined =>
      (path ? configRef.current?.projects.find((p) => p.path === path)?.claudeConfigDir : null) ??
      undefined,
    []
  )

  // --- Init: load config, discover projects, select the first one ----------
  useEffect(() => {
    ;(async () => {
      let cfg = await window.vibebox.config.load()
      if (cfg.projects.length === 0) {
        const discovered = await window.vibebox.history.discoverProjects()
        const seen = new Set<string>()
        const projects = discovered
          .filter((p) => (seen.has(p) ? false : (seen.add(p), true)))
          .map((p) => ({ name: p.split(/[/\\]/).pop() || p, path: p }))
        cfg = { ...cfg, projects }
        await window.vibebox.config.save(cfg)
      }
      setConfig(cfg)
      const first = cfg.projects[0] ?? null
      setCurrentProject(first?.path ?? null)
      if (first)
        setSessions(await window.vibebox.history.listSessions(first.path, first.claudeConfigDir))
    })()
  }, [])

  const reloadSessions = useCallback(
    async (path: string | null) => {
      setSessions(
        path ? await window.vibebox.history.listSessions(path, claudeConfigDirFor(path)) : []
      )
    },
    [claudeConfigDirFor]
  )

  const selectProject = useCallback(
    (path: string) => {
      setCurrentProject(path)
      reloadSessions(path)
    },
    [reloadSessions]
  )

  const browse = useCallback(async () => {
    const path = await window.vibebox.dialog.pickFolder()
    if (!path) return
    // Main persisted it as a recent project; reload config to pick that up.
    setConfig(await window.vibebox.config.load())
    selectProject(path)
  }, [selectProject])

  const defaultModel = useCallback((): string | undefined => {
    const m = config?.defaultModel.trim()
    return m ? m : undefined
  }, [config])

  // --- Tab lifecycle -------------------------------------------------------
  const openNewChat = useCallback(() => {
    const tab: Tab = {
      id: `tab-${tabSeq++}`,
      ptyId: null,
      sessionId: null,
      resumeSessionId: null,
      cwd: currentProject,
      claudeConfigDir: claudeConfigDirFor(currentProject) ?? null,
      model: defaultModel() ?? null,
      title: 'Novo chat'
    }
    setTabs((prev) => [...prev, tab])
    setActiveTabId(tab.id)
  }, [currentProject, defaultModel, claudeConfigDirFor])

  const openResume = useCallback(
    (sessionId: string) => {
      // Focus an already-open tab for this session instead of duplicating it.
      const existing = tabs.find((t) => t.sessionId === sessionId)
      if (existing) {
        setActiveTabId(existing.id)
        return
      }
      const tab: Tab = {
        id: `tab-${tabSeq++}`,
        ptyId: null,
        sessionId,
        resumeSessionId: sessionId,
        cwd: currentProject,
        claudeConfigDir: claudeConfigDirFor(currentProject) ?? null,
        model: defaultModel() ?? null,
        title: 'Resumindo…'
      }
      setTabs((prev) => [...prev, tab])
      setActiveTabId(tab.id)
    },
    [tabs, currentProject, defaultModel, claudeConfigDirFor]
  )

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id)
      setActiveTabId((active) => (active === id ? (next[next.length - 1]?.id ?? null) : active))
      return next
    })
  }, [])

  // Callbacks from TerminalView.
  const onTabReady = useCallback((tabId: string, ptyId: number, sessionId: string) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, ptyId, sessionId } : t)))
  }, [])
  const onTabTitle = useCallback((tabId: string, title: string) => {
    const clean = title.trim()
    if (clean) setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, title: clean } : t)))
  }, [])
  const onTabError = useCallback(
    (tabId: string, message: string) => {
      setError(message)
      closeTab(tabId)
    },
    [closeTab]
  )

  // --- Toolbar actions -----------------------------------------------------
  const writeToActive = useCallback(
    (text: string) => {
      if (activeTab?.ptyId != null) window.vibebox.pty.write(activeTab.ptyId, text)
    },
    [activeTab]
  )
  const requestModel = useCallback(
    (alias: string) => {
      writeToActive(`/model ${alias}\r`)
      // Reflect the switch in the tab so the session tint follows the model.
      if (activeTabId)
        setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, model: alias } : t)))
    },
    [writeToActive, activeTabId]
  )
  const requestStats = useCallback(() => writeToActive('/stats\r'), [writeToActive])

  // --- Context meter: poll the active session's transcript -----------------
  useEffect(() => {
    if (!currentProject || !activeTab?.sessionId) {
      setContextTokens(null)
      return
    }
    const project = currentProject
    const sessionId = activeTab.sessionId
    let cancelled = false
    const read = async () => {
      const tokens = await window.vibebox.history.contextTokens(
        project,
        sessionId,
        claudeConfigDirFor(project)
      )
      if (!cancelled) setContextTokens(tokens)
    }
    read()
    const timer = setInterval(read, 2000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [currentProject, activeTab?.sessionId, claudeConfigDirFor])

  // --- Keyboard shortcuts (capture phase, to beat xterm's key handling) -----
  const shortcutRef = useRef({ openNewChat, closeTab, activeTabId })
  shortcutRef.current = { openNewChat, closeTab, activeTabId }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (!mod) return
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault()
        e.stopPropagation()
        shortcutRef.current.openNewChat()
      } else if (e.key === 'w' || e.key === 'W') {
        e.preventDefault()
        e.stopPropagation()
        const { activeTabId: id, closeTab: close } = shortcutRef.current
        if (id) close(id)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const persistConfig = useCallback((next: AppConfig) => {
    setConfig(next)
    window.vibebox.config.save(next)
  }, [])

  // Resizable layout: the sidebar width is remembered between launches, and its
  // panel ref lets the toolbar toggle collapse/expand it.
  const sidebarPanel = usePanelRef()
  const layout = useDefaultLayout({ id: 'vibebox:layout' })
  const toggleSidebar = useCallback(() => {
    const p = sidebarPanel.current
    if (!p) return
    if (p.isCollapsed()) p.expand()
    else p.collapse()
  }, [sidebarPanel])

  if (!config) return null

  // The active session's model colour tints the whole chrome (falls back to the
  // iris brand accent via CSS when there's no live tab).
  const sessionAlias = activeTab?.model ?? config.defaultModel
  const sessionAccent =
    config.models.find((m) => m.alias && m.alias === sessionAlias)?.color ?? null
  const appStyle = sessionAccent ? ({ '--session': sessionAccent } as CSSProperties) : undefined

  // The toolbar belongs to the active tab's content, so it names *that* tab's
  // working directory. With no live tab, fall back to the sidebar selection —
  // the directory a new chat would open in.
  const nameForPath = (path: string | null): string | null =>
    path == null
      ? null
      : (config.projects.find((p) => p.path === path)?.name ?? path.split(/[/\\]/).pop() ?? path)
  const projectName = nameForPath(activeTab?.cwd ?? currentProject)

  return (
    <>
      <Group
        orientation="horizontal"
        className="app"
        style={appStyle}
        defaultLayout={layout.defaultLayout}
        onLayoutChanged={layout.onLayoutChanged}
      >
        <Panel
          id="sidebar"
          className="pane"
          panelRef={sidebarPanel}
          collapsible
          collapsedSize={0}
          minSize={210}
          maxSize={460}
          defaultSize={272}
          groupResizeBehavior="preserve-pixel-size"
        >
          <Sidebar
            isMac={isMac}
            currentProject={currentProject}
            projects={config.projects}
            sessions={sessions}
            onBrowse={browse}
            onOpenSettings={() => setShowSettings(true)}
            onSelectProject={selectProject}
            onOpenSession={openResume}
          />
        </Panel>

        <Separator className="sep sep-h" />

        <Panel id="main" className="pane" minSize={360}>
          <div className="main">
            {!isMac && <TitleBar />}

            <TabBar
              tabs={tabs}
              activeTabId={activeTabId}
              onNewChat={openNewChat}
              onSelectTab={setActiveTabId}
              onCloseTab={closeTab}
              onToggleSidebar={toggleSidebar}
            />

            {activeTab && (
              <StatusBar
                project={projectName}
                active
                models={config.models}
                contextTokens={contextTokens}
                onPickModel={requestModel}
                onViewMemory={() => setNotice('A visualização da memória chega em breve.')}
                onAnalytics={requestStats}
              />
            )}

            {error && (
              <div className="banner error">
                <span className="glyph">⚠</span>
                <span>{error}</span>
                <span className="spacer" />
                <button className="banner-close" onClick={() => setError(null)}>
                  <CloseIcon size={13} />
                </button>
              </div>
            )}

            <div className="stage">
              <div className="terminals">
                {tabs.map((tab) => (
                  <TerminalView
                    key={tab.id}
                    tab={tab}
                    active={tab.id === activeTabId}
                    onReady={onTabReady}
                    onTitle={onTabTitle}
                    onExit={closeTab}
                    onError={onTabError}
                  />
                ))}
                {tabs.length === 0 && <EmptyState />}
              </div>
            </div>

            {notice && (
              <div className="banner notice">
                <span className="glyph">◈</span>
                <span>{notice}</span>
                <span className="spacer" />
                <button className="banner-close" onClick={() => setNotice(null)}>
                  <CloseIcon size={13} />
                </button>
              </div>
            )}
          </div>
        </Panel>
      </Group>

      {showSettings && (
        <SettingsModal
          config={config}
          onChange={persistConfig}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  )
}
