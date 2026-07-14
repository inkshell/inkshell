import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from 'react-resizable-panels'
import {
  CONTEXT_WINDOW,
  type AppConfig,
  type SessionContext,
  type SessionSummary
} from '@shared/types'
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
  const [liveSession, setLiveSession] = useState<SessionContext | null>(null)
  // Tracks whether the sidebar is collapsed (button or drag) so the tab row can
  // reserve space for the macOS traffic lights it would otherwise slide under.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

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
  const defaultEffort = useCallback((): string | undefined => {
    const e = config?.defaultEffort.trim()
    return e ? e : undefined
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
      effort: defaultEffort() ?? null,
      startedAtMs: Date.now(),
      title: 'Novo chat'
    }
    setTabs((prev) => [...prev, tab])
    setActiveTabId(tab.id)
  }, [currentProject, defaultModel, defaultEffort, claudeConfigDirFor])

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
        effort: defaultEffort() ?? null,
        startedAtMs: Date.now(),
        title: 'Resumindo…'
      }
      setTabs((prev) => [...prev, tab])
      setActiveTabId(tab.id)
    },
    [tabs, currentProject, defaultModel, defaultEffort, claudeConfigDirFor]
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
    // The CLI prefixes its OSC title with its own "✳" brand glyph (e.g.
    // "✳ Claude Code") — redundant with the tab's own project-colour dot, so
    // it's stripped for display only; the title itself is still theirs verbatim.
    const clean = title.replace(/^[✳✻✽✢✶]\s*/, '').trim()
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
      // Optimistic guess so the tint updates instantly; the next transcript
      // poll below confirms it (or corrects it) against real usage.
      if (activeTabId)
        setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, model: alias } : t)))
    },
    [writeToActive, activeTabId]
  )
  const requestEffort = useCallback(
    (effort: string) => {
      writeToActive(`/effort ${effort}\r`)
      // Purely optimistic — unlike the model, effort is never recorded in the
      // transcript, so there's no way to confirm or correct this later.
      if (activeTabId)
        setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, effort } : t)))
    },
    [writeToActive, activeTabId]
  )
  const requestStats = useCallback(() => writeToActive('/stats\r'), [writeToActive])

  // --- Live session: poll the active transcript for token usage + model ----
  useEffect(() => {
    if (!currentProject || !activeTab?.sessionId) {
      setLiveSession(null)
      return
    }
    const project = currentProject
    const sessionId = activeTab.sessionId
    let cancelled = false
    const read = async () => {
      const ctx = await window.vibebox.history.sessionContext(
        project,
        sessionId,
        claudeConfigDirFor(project)
      )
      if (!cancelled) setLiveSession(ctx)
    }
    read()
    const timer = setInterval(read, 2000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [currentProject, activeTab?.sessionId, claudeConfigDirFor])

  // The model alias actually backing the active session: the transcript's
  // recorded model id, matched against each config model's `idPrefix` (the
  // only ground truth there is — Claude Code never exposes this any other
  // way). Discarded if it predates this tab's own run — a resumed session's
  // last transcript line can be older than the current process, e.g. when
  // resuming launches under a different `--model` than that history was on —
  // in which case the tab's launch model (the actual `--model` argument) is
  // the correct answer until a fresh turn lands.
  const activeModelAlias = useCallback((): string | null => {
    const isFresh =
      liveSession?.timestampMs != null &&
      activeTab != null &&
      liveSession.timestampMs >= activeTab.startedAtMs
    const modelId = isFresh ? liveSession.model : null
    const match = modelId
      ? config?.models.find((m) => m.idPrefix && modelId.startsWith(m.idPrefix))
      : undefined
    return match?.alias ?? activeTab?.model ?? null
  }, [liveSession, config, activeTab])

  // The context meter's denominator: the resolved model's own window (config
  // edited per `ModelConfig.contextWindow`), falling back to a flat guess
  // before any model is known at all (e.g. a brand-new chat).
  const activeContextWindow = useCallback((): number => {
    const alias = activeModelAlias()
    return config?.models.find((m) => m.alias === alias)?.contextWindow ?? CONTEXT_WINDOW
  }, [activeModelAlias, config])

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

  // Each project's chosen colour. A tab wears its project's colour, and the
  // active tab's colour tints the whole chrome (falls back to the brand accent
  // via CSS when the tab has no project or the project has no colour set).
  const projectColor = (path: string | null): string | null =>
    (path ? config.projects.find((p) => p.path === path)?.color : null) ?? null
  const sessionAccent = projectColor(activeTab?.cwd ?? currentProject)
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
          onResize={(size) => setSidebarCollapsed(size.inPixels === 0)}
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
              projectColor={projectColor}
              reserveTrafficLights={isMac && sidebarCollapsed}
              onNewChat={openNewChat}
              onSelectTab={setActiveTabId}
              onCloseTab={closeTab}
              onToggleSidebar={toggleSidebar}
            />

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
              <div className="workspace">
                {activeTab && (
                  <StatusBar
                    project={projectName}
                    active
                    models={config.models}
                    currentModel={activeModelAlias()}
                    currentEffort={activeTab.effort}
                    contextTokens={liveSession?.tokens ?? null}
                    contextWindow={activeContextWindow()}
                    onPickModel={requestModel}
                    onPickEffort={requestEffort}
                    onViewMemory={() => setNotice('A visualização da memória chega em breve.')}
                    onAnalytics={requestStats}
                  />
                )}
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
