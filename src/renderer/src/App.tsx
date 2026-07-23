import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from 'react-resizable-panels'
import {
  CONTEXT_WINDOW,
  paletteColor,
  type AppConfig,
  type ProjectEntry,
  type SessionContext,
  type SessionSummary
} from '@shared/types'
import { type Tab, type ViewerRef, viewerKey } from './types'
import type { FileLinkTarget } from './lib/file-links'
import { Sidebar } from './components/Sidebar'
import { TabBar } from './components/TabBar'
import { TitleBar } from './components/TitleBar'
import { StatusBar } from './components/StatusBar'
import { TerminalView, type TerminalViewHandle } from './components/TerminalView'
import { ViewerView } from './components/ViewerView'
import { ProjectPanel } from './components/ProjectPanel'
import { QuickOpen } from './components/QuickOpen'
import { EmptyState } from './components/EmptyState'
import { SettingsModal } from './components/SettingsModal'
import { ProjectModal } from './components/ProjectModal'
import { ConfirmModal } from './components/ConfirmModal'
import { AboutModal } from './components/AboutModal'
import { CloseIcon } from './components/Icons'

const isMac = window.inkshell.platform === 'darwin'
let tabSeq = 0

/**
 * Why a pick in the status bar was refused. The switchers type `/commands` into
 * the session, and bytes written to the pty land wherever the CLI's cursor is —
 * appended to a half-written prompt, the command would be submitted as part of
 * it rather than run. Shown only after the user actually picks, so it names
 * what didn't happen and what to do about it.
 */
const DRAFT_BLOCKED_NOTICE =
  "Couldn't switch: the chat input has text in it. Send or clear the text and try again."

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [currentProject, setCurrentProject] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showQuickOpen, setShowQuickOpen] = useState(false)
  // The project screen, open either on a folder just picked (`new`) or on a
  // project being reconfigured (`edit`). Nothing is written until it's saved.
  const [projectModal, setProjectModal] = useState<{
    mode: 'new' | 'edit'
    entry: ProjectEntry
  } | null>(null)
  // The session a right-click asked to delete, held until the user confirms
  // (or dismisses) the modal. Carries the summary so the prompt can quote it.
  const [pendingDelete, setPendingDelete] = useState<SessionSummary | null>(null)
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

  // Writes the config through to disk. The ref is updated here as well as on
  // render, so a caller that reads it right after saving (e.g. reloading the
  // history under a project's new config dir) sees the new values.
  const persistConfig = useCallback((next: AppConfig) => {
    configRef.current = next
    setConfig(next)
    window.inkshell.config.save(next)
  }, [])

  // --- Init: load config, discover projects, select the first one ----------
  useEffect(() => {
    ;(async () => {
      let cfg = await window.inkshell.config.load()
      if (cfg.projects.length === 0) {
        const discovered = await window.inkshell.history.discoverProjects()
        const seen = new Set<string>()
        const projects = discovered
          .filter((p) => (seen.has(p) ? false : (seen.add(p), true)))
          .map((p, i) => ({ name: p.split(/[/\\]/).pop() || p, path: p, color: paletteColor(i) }))
        cfg = { ...cfg, projects }
        await window.inkshell.config.save(cfg)
      }
      setConfig(cfg)
      const first = cfg.projects[0] ?? null
      setCurrentProject(first?.path ?? null)
      if (first)
        setSessions(await window.inkshell.history.listSessions(first.path, first.claudeConfigDir))
    })()
  }, [])

  const reloadSessions = useCallback(
    async (path: string | null) => {
      setSessions(
        path ? await window.inkshell.history.listSessions(path, claudeConfigDirFor(path)) : []
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

  /**
   * "New project…": opens the project screen straight away, with the folder as
   * one of its fields. Same screen as configuring an existing project, so the
   * name, colour and config dir are set in one place before anything is saved.
   */
  const newProject = useCallback(() => {
    setProjectModal({
      mode: 'new',
      entry: { name: '', path: '', color: paletteColor(configRef.current?.projects.length ?? 0) }
    })
  }, [])

  const editProject = useCallback((path: string) => {
    const entry = configRef.current?.projects.find((p) => p.path === path)
    if (entry) setProjectModal({ mode: 'edit', entry })
  }, [])

  /** Saves the project screen: adds a new project, or updates one in place. */
  const saveProject = useCallback(
    (entry: ProjectEntry) => {
      const cfg = configRef.current
      if (!cfg) return
      const known = cfg.projects.some((p) => p.path === entry.path)
      persistConfig({
        ...cfg,
        projects: known
          ? cfg.projects.map((p) => (p.path === entry.path ? entry : p))
          : [entry, ...cfg.projects]
      })
      setProjectModal(null)
      // A new project is selected right away; an edited one may have changed
      // config dir, which is the directory its history is read from.
      if (!known) selectProject(entry.path)
      else if (currentProject === entry.path) reloadSessions(entry.path)
    },
    [persistConfig, selectProject, reloadSessions, currentProject]
  )

  /** Persists a drag-drop reorder of the sidebar's project list. */
  const reorderProjects = useCallback(
    (projects: ProjectEntry[]) => {
      const cfg = configRef.current
      if (!cfg) return
      persistConfig({ ...cfg, projects })
    },
    [persistConfig]
  )

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
      kind: 'terminal',
      ptyId: null,
      sessionId: null,
      resumeSessionId: null,
      cwd: currentProject,
      claudeConfigDir: claudeConfigDirFor(currentProject) ?? null,
      model: defaultModel() ?? null,
      effort: defaultEffort() ?? null,
      startedAtMs: Date.now(),
      title: 'New chat',
      processing: false
    }
    setTabs((prev) => [...prev, tab])
    setActiveTabId(tab.id)
  }, [currentProject, defaultModel, defaultEffort, claudeConfigDirFor])

  // A diff / file / commit opened from the project panel. Re-opening the same
  // one focuses its existing tab instead of stacking a duplicate. A `preview`
  // open (a single click in the file tree) reuses the one preview tab's slot
  // instead of stacking a new tab; any non-preview open pins it in place.
  const openViewerTab = useCallback((ref: ViewerRef, opts?: { preview?: boolean }) => {
    const preview = opts?.preview ?? false
    setTabs((prev) => {
      const key = viewerKey(ref)
      const existing = prev.find((t) => t.viewer && viewerKey(t.viewer) === key)
      if (existing) {
        setActiveTabId(existing.id)
        const pinning = existing.preview && !preview
        // Same file, new line (a second click in the terminal): keep the tab and
        // let the viewer move to it. A non-preview open also pins a preview tab.
        if (existing.viewer!.line !== ref.line || pinning) {
          return prev.map((t) =>
            t.id === existing.id ? { ...t, viewer: ref, preview: pinning ? false : t.preview } : t
          )
        }
        return prev
      }

      // A preview open reuses the existing preview tab's slot — only one
      // "just looked at" file is ever open at a time.
      const previewTab = preview ? prev.find((t) => t.preview) : undefined
      if (previewTab) {
        setActiveTabId(previewTab.id)
        return prev.map((t) =>
          t.id === previewTab.id
            ? {
                ...t,
                kind: ref.kind,
                viewer: ref,
                cwd: ref.project,
                claudeConfigDir: ref.claudeConfigDir,
                title: ref.label
              }
            : t
        )
      }

      const tab: Tab = {
        id: `tab-${tabSeq++}`,
        kind: ref.kind,
        viewer: ref,
        preview,
        ptyId: null,
        sessionId: null,
        resumeSessionId: null,
        cwd: ref.project,
        claudeConfigDir: ref.claudeConfigDir,
        model: null,
        effort: null,
        startedAtMs: Date.now(),
        title: ref.label,
        processing: false
      }
      setActiveTabId(tab.id)
      return [...prev, tab]
    })
  }, [])

  // A file path clicked in a terminal's output. The path arrives already
  // resolved against the project, so this only has to name the tab.
  const openFileFromTerminal = useCallback(
    (target: FileLinkTarget, project: string) => {
      openViewerTab({
        kind: 'file',
        project,
        claudeConfigDir: claudeConfigDirFor(project) ?? null,
        path: target.path,
        line: target.line ?? undefined,
        label: target.path.split('/').pop() ?? target.path,
        dir: target.path.split('/').slice(0, -1).join('/') || undefined
      })
    },
    [openViewerTab, claudeConfigDirFor]
  )

  // A file picked in Quick Open (⌘P). `path` is already project-relative —
  // the picker read it straight off the same file list the project panel does.
  const openFileFromQuickOpen = useCallback(
    (project: string, path: string) => {
      openViewerTab({
        kind: 'file',
        project,
        claudeConfigDir: claudeConfigDirFor(project) ?? null,
        path,
        label: path.split('/').pop() ?? path,
        dir: path.split('/').slice(0, -1).join('/') || undefined
      })
    },
    [openViewerTab, claudeConfigDirFor]
  )

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
        kind: 'terminal',
        ptyId: null,
        sessionId,
        resumeSessionId: sessionId,
        cwd: currentProject,
        claudeConfigDir: claudeConfigDirFor(currentProject) ?? null,
        model: defaultModel() ?? null,
        effort: defaultEffort() ?? null,
        startedAtMs: Date.now(),
        // The history card's name for this chat carries over as the tab title,
        // so a resume opens already named instead of sitting on a placeholder
        // until the CLI re-emits its own (identical) title over OSC.
        title: sessions.find((s) => s.sessionId === sessionId)?.preview ?? 'Resuming…',
        processing: false
      }
      setTabs((prev) => [...prev, tab])
      setActiveTabId(tab.id)
    },
    [tabs, sessions, currentProject, defaultModel, defaultEffort, claudeConfigDirFor]
  )

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id)
      setActiveTabId((active) => (active === id ? (next[next.length - 1]?.id ?? null) : active))
      return next
    })
  }, [])

  // Drag-to-reorder: move `tabId` to final position `toIndex` in the list.
  const reorderTab = useCallback((tabId: string, toIndex: number) => {
    setTabs((prev) => {
      const from = prev.findIndex((t) => t.id === tabId)
      if (from === -1) return prev
      const to = Math.max(0, Math.min(toIndex, prev.length - 1))
      if (to === from) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  // Right-click "Delete chat" only opens the confirmation modal; the actual
  // deletion waits for `confirmDelete` below.
  const requestDelete = useCallback(
    (sessionId: string) => {
      setPendingDelete(sessions.find((s) => s.sessionId === sessionId) ?? null)
    },
    [sessions]
  )

  const confirmDelete = useCallback(async () => {
    const sessionId = pendingDelete?.sessionId
    setPendingDelete(null)
    if (!currentProject || !sessionId) return
    // A deleted chat can't stay open. Wait out its `claude` before removing the
    // transcript: a session still running writes its own on the way out, which
    // would resurrect the file we're about to delete.
    const open = tabs.find((t) => t.sessionId === sessionId)
    if (open) {
      if (open.ptyId !== null) await window.inkshell.pty.close(open.ptyId)
      closeTab(open.id)
    }
    try {
      await window.inkshell.history.deleteSession(
        currentProject,
        sessionId,
        claudeConfigDirFor(currentProject)
      )
    } catch (err) {
      setError(`Couldn't delete the chat: ${err instanceof Error ? err.message : err}`)
    }
    reloadSessions(currentProject)
  }, [pendingDelete, currentProject, tabs, closeTab, claudeConfigDirFor, reloadSessions])

  // Callbacks from TerminalView.
  const onTabReady = useCallback(
    (tabId: string, ptyId: number, sessionId: string) => {
      setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, ptyId, sessionId } : t)))
      // A brand-new chat's session only exists in history from this point on
      // (a resume already had its sessionId set at tab creation, so it's
      // already in the sidebar and doesn't need this). Refresh the sidebar so
      // it shows up without a project switch — but only if it belongs to the
      // project currently on screen.
      const tab = tabs.find((t) => t.id === tabId)
      if (tab && tab.sessionId === null && tab.cwd === currentProject)
        reloadSessions(currentProject)
    },
    [tabs, currentProject, reloadSessions]
  )
  const onTabTitle = useCallback((tabId: string, title: string) => {
    // The CLI prefixes its OSC title with a status glyph: its "✳" brand mark
    // while idle, or a Braille spinner frame (U+2800–28FF) while it's working
    // on a turn. Both are redundant with the tab's own project-colour dot, so
    // they're stripped for display only — the rest of the title is theirs
    // verbatim. The spinner prefix doubles as our only local "is it thinking"
    // signal, which drives the spinning ring drawn around that same dot.
    const processing = /^[⠀-⣿]/.test(title)
    const clean = title.replace(/^[✳✻✽✢✶⠀-⣿]\s*/, '').trim()
    if (clean)
      setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, title: clean, processing } : t)))
  }, [])
  const onTabError = useCallback(
    (tabId: string, message: string) => {
      setError(message)
      closeTab(tabId)
    },
    [closeTab]
  )

  // --- Toolbar actions -----------------------------------------------------
  // Imperative handles into the live terminals, for asking the active one
  // whether its input box is empty (the draft exists only on the CLI's screen).
  const terminalRefs = useRef(new Map<string, TerminalViewHandle>())
  /**
   * Types a slash command into the active session — only when its input box is
   * verifiably empty. Bytes written to the pty append to whatever is
   * half-written in the box, so a `/command` typed over a draft would submit
   * the two as one prompt.
   *
   * This is the *only* place the condition is evaluated, and it runs at the
   * moment of the pick: the switchers stay enabled and explain themselves in a
   * banner when a draft turns out to be in the way. Returns whether the command
   * was actually sent — the switchers are controlled by state that only moves
   * on success, so a refused pick snaps back on its own.
   */
  const writeCommandToActive = useCallback(
    (command: string): boolean => {
      const handle = activeTabId ? terminalRefs.current.get(activeTabId) : undefined
      if (activeTab?.ptyId == null || !handle?.promptIsEmpty()) {
        setNotice(DRAFT_BLOCKED_NOTICE)
        return false
      }
      window.inkshell.pty.write(activeTab.ptyId, `${command}\r`)
      // The control that triggered this (a status-bar select or button) still
      // holds the keyboard; hand it straight back to the terminal, on the next
      // frame so the native picker has finished closing first.
      requestAnimationFrame(() => handle.focus())
      return true
    },
    [activeTab, activeTabId]
  )
  const requestModel = useCallback(
    (alias: string) => {
      if (!writeCommandToActive(`/model ${alias}`)) return
      // Optimistic guess so the tint updates instantly; the next transcript
      // poll below confirms it (or corrects it) against real usage.
      if (activeTabId)
        setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, model: alias } : t)))
    },
    [writeCommandToActive, activeTabId]
  )
  const requestEffort = useCallback(
    (effort: string) => {
      if (!writeCommandToActive(`/effort ${effort}`)) return
      // Purely optimistic — unlike the model, effort is never recorded in the
      // transcript, so there's no way to confirm or correct this later.
      if (activeTabId)
        setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, effort } : t)))
    },
    [writeCommandToActive, activeTabId]
  )
  const requestStats = useCallback(
    () => void writeCommandToActive('/stats'),
    [writeCommandToActive]
  )

  // --- Live session: poll the active transcript for token usage + model ----
  // Keyed off the tab's own project, not the sidebar selection: a tab keeps its
  // transcript wherever it was launched, so browsing to another project in the
  // sidebar must not blank out the meter of the tab still on screen.
  const activeProject = activeTab?.cwd ?? currentProject
  const activeConfigDir = activeTab?.claudeConfigDir ?? claudeConfigDirFor(activeProject)
  useEffect(() => {
    if (!activeProject || !activeTab?.sessionId) {
      setLiveSession(null)
      return
    }
    const project = activeProject
    const configDir = activeConfigDir
    const sessionId = activeTab.sessionId
    let cancelled = false
    const read = async () => {
      const ctx = await window.inkshell.history.sessionContext(project, sessionId, configDir)
      if (!cancelled) setLiveSession(ctx)
    }
    read()
    const timer = setInterval(read, 2000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [activeProject, activeConfigDir, activeTab?.sessionId])

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
  const shortcutRef = useRef({ openNewChat, closeTab, activeTabId, activeProject })
  shortcutRef.current = { openNewChat, closeTab, activeTabId, activeProject }
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
      } else if (e.key === 'p' || e.key === 'P') {
        // Nothing to search without a project — leave the shortcut alone.
        if (!shortcutRef.current.activeProject) return
        e.preventDefault()
        e.stopPropagation()
        setShowQuickOpen(true)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // Resizable layout: the sidebar and the project panel each remember their
  // width between launches, and a panel ref lets a toolbar button toggle each.
  // (Layout id bumped to `-3col` so a saved two-panel layout can't misapply.)
  const sidebarPanel = usePanelRef()
  const projectPanel = usePanelRef()
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const layout = useDefaultLayout({ id: 'inkshell:layout-3col' })
  const toggleSidebar = useCallback(() => {
    const p = sidebarPanel.current
    if (!p) return
    if (p.isCollapsed()) p.expand()
    else p.collapse()
  }, [sidebarPanel])
  const togglePanel = useCallback(() => {
    const p = projectPanel.current
    if (!p) return
    if (p.isCollapsed()) p.expand()
    else p.collapse()
  }, [projectPanel])

  if (!config) return null

  // Each project's chosen colour. A tab wears its project's colour, and the
  // active tab's colour tints the whole chrome (falls back to the brand accent
  // via CSS when the tab has no project or the project has no colour set).
  const projectColor = (path: string | null): string | null =>
    (path ? config.projects.find((p) => p.path === path)?.color : null) ?? null
  const sessionAccent = projectColor(activeProject)
  const appStyle = sessionAccent ? ({ '--session': sessionAccent } as CSSProperties) : undefined

  // The toolbar belongs to the active tab's content, so it names *that* tab's
  // working directory. With no live tab, fall back to the sidebar selection —
  // the directory a new chat would open in.
  const nameForPath = (path: string | null): string | null =>
    path == null
      ? null
      : (config.projects.find((p) => p.path === path)?.name ?? path.split(/[/\\]/).pop() ?? path)
  const projectName = nameForPath(activeProject)

  // The project panel follows the active tab's directory (a viewer tab's cwd is
  // the project it was opened from), falling back to the sidebar selection.
  const panelProject = activeProject
  const panelConfigDir = activeConfigDir ?? null

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
            onNewProject={newProject}
            onOpenSettings={() => setShowSettings(true)}
            onOpenAbout={() => setShowAbout(true)}
            onSelectProject={selectProject}
            onEditProject={editProject}
            onReorderProjects={reorderProjects}
            onOpenSession={openResume}
            onDeleteSession={requestDelete}
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
              onReorderTab={reorderTab}
              onToggleSidebar={toggleSidebar}
              onTogglePanel={togglePanel}
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
                {activeTab && activeTab.kind === 'terminal' && (
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
                    onViewMemory={() => setNotice('Memory viewing is coming soon.')}
                    onAnalytics={requestStats}
                  />
                )}
                <div className="terminals">
                  {tabs.map((tab) =>
                    tab.kind === 'terminal' ? (
                      <TerminalView
                        key={tab.id}
                        ref={(handle) => {
                          if (handle) terminalRefs.current.set(tab.id, handle)
                          else terminalRefs.current.delete(tab.id)
                        }}
                        tab={tab}
                        active={tab.id === activeTabId}
                        onReady={onTabReady}
                        onOpenFile={openFileFromTerminal}
                        onTitle={onTabTitle}
                        onExit={closeTab}
                        onError={onTabError}
                      />
                    ) : (
                      <ViewerView
                        // A preview tab mutates `viewer` in place to peek at a new
                        // target, so the key must include it — otherwise this stays
                        // mounted across the swap and shows the previous target's
                        // stale diff/file/commit state until its own fetch resolves.
                        key={tab.viewer ? `${tab.id}:${viewerKey(tab.viewer)}` : tab.id}
                        tab={tab}
                        active={tab.id === activeTabId}
                        onError={setError}
                      />
                    )
                  )}
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

        <Separator className="sep sep-h" />

        <Panel
          id="panel"
          className="pane"
          panelRef={projectPanel}
          collapsible
          collapsedSize={0}
          minSize={248}
          maxSize={520}
          defaultSize={312}
          groupResizeBehavior="preserve-pixel-size"
          onResize={(size) => setPanelCollapsed(size.inPixels === 0)}
        >
          <ProjectPanel
            project={panelProject}
            claudeConfigDir={panelConfigDir}
            commitMessageModel={config.commitMessageModel}
            visible={!panelCollapsed}
            onOpenViewer={openViewerTab}
            onError={setError}
          />
        </Panel>
      </Group>

      {showSettings && (
        <SettingsModal
          config={config}
          onChange={persistConfig}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}

      {showQuickOpen && activeProject && (
        <QuickOpen
          project={activeProject}
          projectName={projectName ?? activeProject}
          accent={projectColor(activeProject)}
          onOpenFile={(path) => {
            openFileFromQuickOpen(activeProject, path)
            setShowQuickOpen(false)
          }}
          onClose={() => setShowQuickOpen(false)}
          onError={setError}
        />
      )}

      {projectModal && (
        <ProjectModal
          mode={projectModal.mode}
          entry={projectModal.entry}
          existingPaths={config.projects.map((p) => p.path)}
          onSubmit={saveProject}
          onCancel={() => setProjectModal(null)}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          title="Delete chat"
          message={
            <>
              This permanently removes the history of <strong>“{pendingDelete.preview}”</strong>. It
              can't be undone.
            </>
          }
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  )
}
