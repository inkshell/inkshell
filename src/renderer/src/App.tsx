import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent
} from 'react'
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from 'react-resizable-panels'
import {
  CONTEXT_WINDOW,
  paletteColor,
  type AppConfig,
  type ProjectEntry,
  type SessionContext,
  type SessionSummary
} from '@shared/types'
import {
  SESSION_DRAG_TYPE,
  TAB_DRAG_TYPE,
  type PaneLayout,
  type Tab,
  type ViewerRef,
  viewerKey
} from './types'
import type { FileLinkTarget } from './lib/file-links'
import { Sidebar } from './components/Sidebar'
import { Toolbar } from './components/Toolbar'
import { TitleBar } from './components/TitleBar'
import { StatusBar } from './components/StatusBar'
import { TerminalView, type TerminalViewHandle } from './components/TerminalView'
import { ViewerView } from './components/ViewerView'
import { ContextPct } from './components/ContextMeter'
import { ProjectPanel } from './components/ProjectPanel'
import { QuickOpen } from './components/QuickOpen'
import { EmptyState } from './components/EmptyState'
import { SettingsModal } from './components/SettingsModal'
import { ProjectModal } from './components/ProjectModal'
import { ConfirmModal } from './components/ConfirmModal'
import { AboutModal } from './components/AboutModal'
import {
  CloseIcon,
  CommitIcon,
  DiffIcon,
  FileTextIcon,
  MaximizeIcon,
  MinimizeIcon,
  PlusIcon,
  TerminalIcon
} from './components/Icons'

const isMac = window.inkshell.platform === 'darwin'
let tabSeq = 0

/** The glyph a viewer pane wears in its header where a chat wears its dot. */
function paneGlyph(kind: Tab['kind'], size = 12) {
  if (kind === 'diff') return <DiffIcon size={size} />
  if (kind === 'commit') return <CommitIcon size={size} />
  if (kind === 'shell') return <TerminalIcon size={size} />
  return <FileTextIcon size={size} />
}

/**
 * How the status bar names a focused pane that isn't a chat. The bar is drawn
 * for every pane kind so its height never moves with focus, which leaves the
 * room the model/effort switchers would have taken — this fills it, rather than
 * letting the row read as a blank strip whenever a terminal or file has focus.
 */
const PANE_SUBJECT: Record<Exclude<Tab['kind'], 'terminal'>, string> = {
  shell: 'Terminal',
  file: 'File',
  diff: 'Diff',
  commit: 'Commit'
}

/**
 * A pane's own context-window usage, polled independently of every other
 * pane — the app-wide `liveSession` effect below only ever tracks the
 * focused tab, but with 2 or 4 panes on screen each quadrant needs its own
 * reading in its title bar. Mirrors the model-resolution rule `activeModelAlias`
 * uses (a stale transcript line predating this tab's own launch doesn't count),
 * just scoped to one tab instead of the app's single active one.
 */
function PaneContext({ tab, visible, config }: { tab: Tab; visible: boolean; config: AppConfig }) {
  const [ctx, setCtx] = useState<SessionContext | null>(null)
  useEffect(() => {
    if (!visible || tab.kind !== 'terminal' || !tab.cwd || !tab.sessionId) {
      setCtx(null)
      return
    }
    const cwd = tab.cwd
    const sessionId = tab.sessionId
    const configDir = tab.claudeConfigDir ?? undefined
    let cancelled = false
    const read = async () => {
      const c = await window.inkshell.history.sessionContext(cwd, sessionId, configDir)
      if (!cancelled) setCtx(c)
    }
    read()
    const timer = setInterval(read, 2000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [visible, tab.kind, tab.cwd, tab.sessionId, tab.claudeConfigDir])

  if (!ctx) return null
  const isFresh = ctx.timestampMs != null && ctx.timestampMs >= tab.startedAtMs
  const modelId = isFresh ? ctx.model : null
  const alias =
    (modelId && config.models.find((m) => m.idPrefix && modelId.startsWith(m.idPrefix))?.alias) ??
    tab.model ??
    null
  const contextWindow =
    config.models.find((m) => m.alias === alias)?.contextWindow ?? CONTEXT_WINDOW
  return <ContextPct tokens={ctx.tokens} contextWindow={contextWindow} />
}

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
  // Split-view state: `slots` places up to four tabs into the panes, `layout`
  // is how many of those panes show at once (1 / 2 / 4), and `focusedSlot` is
  // the pane driving the status bar, project dock and keyboard. The active tab
  // is simply whatever sits in the focused slot — there is no separate state.
  const [layout, setLayout] = useState<PaneLayout>(1)
  const [slots, setSlots] = useState<(string | null)[]>([null, null, null, null])
  const [focusedSlot, setFocusedSlot] = useState(0)
  // The empty pane currently under a drag, for its hover highlight — cleared
  // on drop/leave and never persisted beyond the gesture.
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null)
  // A maximized pane's tab id — while set, that pane alone fills the stage.
  // `slots`/`layout` are left untouched underneath, so restoring is just
  // clearing this back to null. See the sync effect below for how it's kept
  // from going stale when focus moves elsewhere.
  const [maximizedTabId, setMaximizedTabId] = useState<string | null>(null)
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

  const activeTabId = slots[focusedSlot] ?? null
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null

  // Latest split-view state, read from refs so the placement helpers below can
  // stay stable ([]-dep) and never go stale between a click and its setState.
  const slotsRef = useRef(slots)
  slotsRef.current = slots
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const focusedSlotRef = useRef(focusedSlot)
  focusedSlotRef.current = focusedSlot

  // A maximized pane only makes sense while its tab still sits in the focused
  // slot — the moment focus moves elsewhere (a sidebar click, its pane
  // closing, its tab closing) it should fall back to the normal split view
  // instead of keeping some other pane hidden behind a stale fullscreen tab.
  // `useLayoutEffect` so that fallback lands before paint, not as a flash.
  useLayoutEffect(() => {
    if (maximizedTabId !== null && slots[focusedSlot] !== maximizedTabId) {
      setMaximizedTabId(null)
    }
  }, [slots, focusedSlot, maximizedTabId])

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

  // --- Panes: placing tabs into the split layout ---------------------------
  /**
   * Ensures a tab is showing in a visible pane and focuses that pane. With no
   * `slot`, reuses the pane it already sits in; otherwise takes the first empty
   * visible pane, and failing that replaces the focused one — the displaced tab
   * stays open (and listed in the sidebar), just off-screen. An explicit `slot`
   * (a drop onto a specific pane) lands the tab there; if that pane already held
   * another tab and the dragged one came from a *visible* pane of its own, the
   * two swap places instead of the target's tab vanishing off-screen. A tab
   * dragged in from off-screen (still open, but beyond the current layout)
   * has no visible slot to swap into, so it falls back to the old behavior.
   */
  const showTab = useCallback((id: string, slot?: number) => {
    const cur = slotsRef.current
    const lay = layoutRef.current
    const existing = cur.indexOf(id)
    if (slot === undefined && existing !== -1 && existing < lay) {
      setFocusedSlot(existing)
      return
    }
    let target = slot
    if (target === undefined) {
      // Prefer the focused pane when it's free, then any empty pane, then
      // replace the focused one (its tab stays open, just off-screen).
      const focused = Math.min(focusedSlotRef.current, lay - 1)
      target = cur[focused] === null ? focused : -1
      if (target === -1) {
        for (let i = 0; i < lay; i++) {
          if (cur[i] === null) {
            target = i
            break
          }
        }
      }
      if (target === -1) target = focused
    }
    const next = cur.slice()
    if (existing !== -1) {
      // A drop onto a pane that already holds a different tab swaps the two
      // (the target's tab takes the dragged tab's old slot) rather than
      // leaving the source slot empty and the target's tab orphaned off-screen.
      // Only when the source slot is itself visible, though — swapping into a
      // hidden slot would just orphan the target's tab under a new name.
      const canSwap = slot !== undefined && existing < lay && target < lay
      next[existing] = canSwap && cur[target] !== null && cur[target] !== id ? cur[target] : null
    }
    next[target] = id
    setSlots(next)
    setFocusedSlot(target)
  }, [])

  const focusSlot = useCallback((i: number) => setFocusedSlot(i), [])

  // The layout buttons. Growing reveals panes that already hold off-screen tabs;
  // shrinking keeps the focused tab in view by sliding it into the first pane.
  const changeLayout = useCallback((n: PaneLayout) => {
    setMaximizedTabId(null)
    setLayout(n)
    if (focusedSlotRef.current >= n) {
      const next = slotsRef.current.slice()
      const held = next[focusedSlotRef.current]
      next[focusedSlotRef.current] = next[0]
      next[0] = held
      setSlots(next)
      setFocusedSlot(0)
    }
  }, [])

  // --- Tab lifecycle -------------------------------------------------------
  /** `project` defaults to the sidebar's current selection — pass it explicitly
   *  to start a chat in a project without first selecting it (the sidebar's
   *  per-project "new chat" icon does this). */
  const openNewChat = useCallback(
    (slot?: number, project?: string) => {
      const cwd = project ?? currentProject
      const tab: Tab = {
        id: `tab-${tabSeq++}`,
        kind: 'terminal',
        ptyId: null,
        sessionId: null,
        resumeSessionId: null,
        cwd,
        claudeConfigDir: claudeConfigDirFor(cwd) ?? null,
        model: defaultModel() ?? null,
        effort: defaultEffort() ?? null,
        startedAtMs: Date.now(),
        title: 'New chat',
        processing: false
      }
      setTabs((prev) => [...prev, tab])
      showTab(tab.id, slot)
    },
    [currentProject, defaultModel, defaultEffort, claudeConfigDirFor, showTab]
  )

  /** The sidebar's per-project "new chat" icon: selects the project (so the
   *  history section and highlight follow it, same as clicking the row) and
   *  starts a chat there, regardless of whatever project was current before. */
  const newChatForProject = useCallback(
    (path: string) => {
      selectProject(path)
      openNewChat(undefined, path)
    },
    [selectProject, openNewChat]
  )

  /**
   * A plain terminal in the project directory — no `claude` process behind it,
   * so no session id, model or effort. Otherwise placed exactly like a new
   * chat: same pane-picking rules, same per-project entry point.
   */
  const openNewTerminal = useCallback(
    (slot?: number, project?: string) => {
      const cwd = project ?? currentProject
      const tab: Tab = {
        id: `tab-${tabSeq++}`,
        kind: 'shell',
        ptyId: null,
        sessionId: null,
        resumeSessionId: null,
        cwd,
        claudeConfigDir: claudeConfigDirFor(cwd) ?? null,
        model: null,
        effort: null,
        startedAtMs: Date.now(),
        title: 'Terminal',
        processing: false
      }
      setTabs((prev) => [...prev, tab])
      showTab(tab.id, slot)
    },
    [currentProject, claudeConfigDirFor, showTab]
  )

  const newTerminalForProject = useCallback(
    (path: string) => {
      selectProject(path)
      openNewTerminal(undefined, path)
    },
    [selectProject, openNewTerminal]
  )

  // A diff / file / commit opened from the project panel. Re-opening the same
  // one focuses its existing tab instead of stacking a duplicate. A `preview`
  // open (a single click in the file tree) reuses the one preview tab's slot
  // instead of stacking a new tab; any non-preview open pins it in place.
  const openViewerTab = useCallback(
    (ref: ViewerRef, opts?: { preview?: boolean }) => {
      const preview = opts?.preview ?? false
      setTabs((prev) => {
        const key = viewerKey(ref)
        const existing = prev.find((t) => t.viewer && viewerKey(t.viewer) === key)
        if (existing) {
          showTab(existing.id)
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

        // A preview open reuses the existing preview tab's slot — but only one
        // of the same kind, so peeking a diff or commit doesn't repurpose (and
        // visibly close) the file you were just looking at. Browsing files still
        // reuses a single "just looked at" slot, as does browsing diffs.
        const previewTab = preview ? prev.find((t) => t.preview && t.kind === ref.kind) : undefined
        if (previewTab) {
          showTab(previewTab.id)
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
        showTab(tab.id)
        return [...prev, tab]
      })
    },
    [showTab]
  )

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
    (sessionId: string, slot?: number) => {
      // Focus an already-open tab for this session instead of duplicating it.
      const existing = tabs.find((t) => t.sessionId === sessionId)
      if (existing) {
        showTab(existing.id, slot)
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
      showTab(tab.id, slot)
    },
    [tabs, sessions, currentProject, defaultModel, defaultEffort, claudeConfigDirFor, showTab]
  )

  /**
   * Drag-and-drop props shared by every pane tile (empty or occupied): dropping
   * a sidebar tab or history card here always lands it in this exact slot,
   * displacing whatever tab already sat there (it stays open, just off-screen —
   * same as any other `showTab`/`openResume` placement).
   */
  const paneDropTarget = useCallback(
    (slot: number) => ({
      onDragOver: (e: DragEvent<HTMLElement>) => {
        const types = e.dataTransfer.types
        if (!types.includes(TAB_DRAG_TYPE) && !types.includes(SESSION_DRAG_TYPE)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDragOverSlot(slot)
      },
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        // `dragleave` also fires when the pointer moves onto a child (the
        // pane head, body, close button…) — only clear the highlight once
        // it's actually left the pane, or it flickers on every inner move.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        setDragOverSlot((s) => (s === slot ? null : s))
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        e.preventDefault()
        setDragOverSlot(null)
        const tabId = e.dataTransfer.getData(TAB_DRAG_TYPE)
        if (tabId) {
          showTab(tabId, slot)
          return
        }
        const sessionId = e.dataTransfer.getData(SESSION_DRAG_TYPE)
        if (sessionId) openResume(sessionId, slot)
      }
    }),
    [showTab, openResume]
  )

  /**
   * Removes a tab from whichever pane shows it, without touching the tab
   * itself — it stays alive (and listed in the sidebar), just off-screen.
   * This is what the pane header's own minimize button (and middle click) do:
   * they close the *pane*, not the chat/terminal behind it. Only the pane's
   * own close button and the sidebar's close controls (`closeTab` below) end
   * the instance.
   */
  const closePane = useCallback((id: string) => {
    const cur = slotsRef.current
    const at = cur.indexOf(id)
    if (at === -1) return
    const next = cur.slice()
    next[at] = null
    setSlots(next)
    // If the pane held focus, move it to another pane that still has
    // something in it (otherwise the now-empty pane stays focused).
    if (at === focusedSlotRef.current) {
      let nf = focusedSlotRef.current
      for (let i = 0; i < layoutRef.current; i++) {
        if (next[i] !== null) {
          nf = i
          break
        }
      }
      setFocusedSlot(nf)
    }
  }, [])

  /**
   * Toggles whether a pane fills the whole stage. `slots`/`layout` never
   * change — the sync effect above (keyed on `focusedSlot`) is what drops
   * back to the split view once focus moves away, so restoring is implicit.
   * Also focuses the pane's slot, so maximizing one that wasn't already
   * focused hands it the keyboard too.
   */
  const toggleMaximize = useCallback((id: string) => {
    setMaximizedTabId((cur) => (cur === id ? null : id))
    const at = slotsRef.current.indexOf(id)
    if (at !== -1) setFocusedSlot(at)
  }, [])

  // Viewer tabs with unsaved edits. Tracked in a ref (not state) since it only
  // gates the close guard below and pinning — neither needs a re-render.
  const dirtyTabsRef = useRef<Set<string>>(new Set())
  const onViewerDirtyChange = useCallback((tabId: string, dirty: boolean) => {
    if (dirty) {
      dirtyTabsRef.current.add(tabId)
      // A file the user is editing must not have its slot silently reused by the
      // next preview open — pin it the moment it goes dirty.
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId && t.preview ? { ...t, preview: false } : t))
      )
    } else {
      dirtyTabsRef.current.delete(tabId)
    }
  }, [])

  const closeTab = useCallback((id: string) => {
    // A dirty file tab is the one close that loses work (a pane close keeps the
    // tab mounted); confirm before discarding its unsaved edits.
    if (dirtyTabsRef.current.has(id)) {
      const ok = window.confirm('Discard unsaved changes to this file?')
      if (!ok) return
    }
    dirtyTabsRef.current.delete(id)
    setTabs((prev) => prev.filter((t) => t.id !== id))
    const cur = slotsRef.current
    const at = cur.indexOf(id)
    if (at === -1) return
    const next = cur.slice()
    next[at] = null
    setSlots(next)
    // If the closed tab held the focused pane, move focus to another pane that
    // still has something in it (otherwise the now-empty pane stays focused).
    if (at === focusedSlotRef.current) {
      let nf = focusedSlotRef.current
      for (let i = 0; i < layoutRef.current; i++) {
        if (next[i] !== null) {
          nf = i
          break
        }
      }
      setFocusedSlot(nf)
    }
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
      if (tab && tab.kind === 'terminal' && tab.sessionId === null && tab.cwd === currentProject)
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

  // Maximizing is usually a click on the pane's own header button, which
  // steals DOM focus from the terminal on the way — and when that pane was
  // already the focused one, `TerminalView`'s own `[focused]` effect never
  // re-fires to claim it back (the prop didn't change). Hand the keyboard
  // back explicitly so maximizing and typing is one motion, not two.
  useEffect(() => {
    if (maximizedTabId === null) return
    const id = requestAnimationFrame(() => terminalRefs.current.get(maximizedTabId)?.focus())
    return () => cancelAnimationFrame(id)
  }, [maximizedTabId])

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
  const shortcutRef = useRef({ openNewChat, closePane, activeTabId, activeProject })
  shortcutRef.current = { openNewChat, closePane, activeTabId, activeProject }
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
        // Same action as the pane's own minimize button — hides the pane,
        // the chat/terminal behind it stays alive off-screen.
        const { activeTabId: id, closePane: close } = shortcutRef.current
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
  const colLayout = useDefaultLayout({ id: 'inkshell:layout-3col' })
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
  // The file/diff viewer's code table is intentionally denser than the
  // terminal by default (11.5px vs. 13px); scaling it by that same ratio
  // keeps the relationship at every size instead of just the shipped default.
  const codeFontSize = (config.terminalFontSize * (11.5 / 13)).toFixed(2)
  const appStyle = {
    ...(sessionAccent ? { '--session': sessionAccent } : {}),
    '--code-font-size': `${codeFontSize}px`
  } as CSSProperties

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

  // What the status bar says about the focused pane. A chat drives the model +
  // effort + context row; anything else is simply named. Null for a chat (the
  // switchers stand there instead) and for an empty pane, which already says
  // what it is in the middle of its own tile.
  const chatFocused = activeTab?.kind === 'terminal'
  const statusSubject =
    activeTab && activeTab.kind !== 'terminal'
      ? { glyph: paneGlyph(activeTab.kind, 13), label: PANE_SUBJECT[activeTab.kind] }
      : null

  return (
    <>
      <Group
        orientation="horizontal"
        className="app"
        style={appStyle}
        defaultLayout={colLayout.defaultLayout}
        onLayoutChanged={colLayout.onLayoutChanged}
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
            tabs={tabs}
            slots={slots}
            layout={layout}
            activeTabId={activeTabId}
            onNewProject={newProject}
            onOpenSettings={() => setShowSettings(true)}
            onOpenAbout={() => setShowAbout(true)}
            onSelectProject={selectProject}
            onEditProject={editProject}
            onReorderProjects={reorderProjects}
            onOpenSession={openResume}
            onDeleteSession={requestDelete}
            onFocusTab={showTab}
            onCloseTab={closeTab}
            onNewChat={newChatForProject}
            onNewTerminal={newTerminalForProject}
          />
        </Panel>

        <Separator className="sep sep-h" />

        <Panel id="main" className="pane" minSize={360}>
          <div className="main">
            {!isMac && <TitleBar />}

            <Toolbar
              reserveTrafficLights={isMac && sidebarCollapsed}
              layout={layout}
              onSetLayout={changeLayout}
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
              {tabs.length === 0 ? (
                <EmptyState />
              ) : (
                <>
                  {/* Unconditional on purpose: gating this on a chat being
                      focused made the strip come and go as focus moved between
                      panes, and every terminal on screen re-fitted to the
                      height it gave back. It now stays put and swaps its
                      contents instead. */}
                  <StatusBar
                    project={projectName}
                    active={chatFocused}
                    subject={statusSubject}
                    models={config.models}
                    currentModel={activeModelAlias()}
                    currentEffort={activeTab?.effort ?? null}
                    contextTokens={liveSession?.tokens ?? null}
                    contextWindow={activeContextWindow()}
                    onPickModel={requestModel}
                    onPickEffort={requestEffort}
                    onViewMemory={() => setNotice('Memory viewing is coming soon.')}
                    onAnalytics={requestStats}
                  />

                  <div className="pane-grid" data-layout={layout}>
                    {tabs.map((tab) => {
                      // A tab keeps a stable wrapper keyed by its id, so moving it
                      // between panes only changes CSS `order` — the terminal's DOM
                      // node (and its pty/scrollback) is never reparented or torn
                      // down. Off-screen tabs stay mounted but hidden.
                      const slot = slots.indexOf(tab.id)
                      const isMaximized = maximizedTabId === tab.id
                      const visible = slot !== -1 && slot < layout
                      const isFocused = visible && slot === focusedSlot
                      const accent = projectColor(tab.cwd)
                      const paneStyle: CSSProperties = {
                        order: slot === -1 ? 99 : slot,
                        display: visible ? undefined : 'none',
                        ...(accent ? ({ ['--session']: accent } as CSSProperties) : {})
                      }
                      return (
                        <div
                          key={tab.id}
                          className={`pane ${isFocused ? 'focused' : ''} ${isMaximized ? 'maximized' : ''} ${tab.processing ? 'processing' : ''} ${dragOverSlot === slot ? 'drag-over' : ''}`}
                          style={paneStyle}
                          onMouseDown={(e) => {
                            // Middle click minimizes the pane — same idiom as a
                            // browser tab — without also focusing the pane it sat
                            // in. The tab itself stays open; only the pane's own
                            // close button (or the sidebar's) ends it.
                            if (e.button === 1) {
                              e.preventDefault()
                              closePane(tab.id)
                              return
                            }
                            if (e.button === 0 && slot !== -1) focusSlot(slot)
                          }}
                          {...(visible ? paneDropTarget(slot) : {})}
                        >
                          <div
                            className="pane-head"
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData(TAB_DRAG_TYPE, tab.id)
                              e.dataTransfer.effectAllowed = 'move'
                            }}
                          >
                            {tab.kind === 'terminal' ? (
                              <span className="pane-dot" />
                            ) : (
                              <span className="pane-glyph">{paneGlyph(tab.kind)}</span>
                            )}
                            <span className="pane-title">{tab.title}</span>
                            <PaneContext tab={tab} visible={visible} config={config} />
                            <button
                              type="button"
                              className="pane-btn pane-minimize"
                              title={isMac ? 'Minimize pane (⌘W)' : 'Minimize pane (Ctrl+W)'}
                              aria-label={isMac ? 'Minimize pane (⌘W)' : 'Minimize pane (Ctrl+W)'}
                              onClick={(e) => {
                                e.stopPropagation()
                                closePane(tab.id)
                              }}
                            >
                              <MinimizeIcon size={12} />
                            </button>
                            <button
                              type="button"
                              className={`pane-btn pane-maximize ${isMaximized ? 'active' : ''}`}
                              title={isMaximized ? 'Restore pane' : 'Maximize pane'}
                              aria-label={isMaximized ? 'Restore pane' : 'Maximize pane'}
                              aria-pressed={isMaximized}
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleMaximize(tab.id)
                              }}
                            >
                              <MaximizeIcon size={11} />
                            </button>
                            <button
                              type="button"
                              className="pane-btn pane-close"
                              title="Close tab"
                              aria-label="Close tab"
                              onClick={(e) => {
                                e.stopPropagation()
                                closeTab(tab.id)
                              }}
                            >
                              <CloseIcon size={12} />
                            </button>
                          </div>
                          <div className="pane-body">
                            {tab.kind === 'terminal' || tab.kind === 'shell' ? (
                              <TerminalView
                                ref={(handle) => {
                                  if (handle) terminalRefs.current.set(tab.id, handle)
                                  else terminalRefs.current.delete(tab.id)
                                }}
                                tab={tab}
                                active={visible}
                                focused={isFocused}
                                fontSize={config.terminalFontSize}
                                onReady={onTabReady}
                                onOpenFile={openFileFromTerminal}
                                onTitle={onTabTitle}
                                onExit={closeTab}
                                onError={onTabError}
                              />
                            ) : (
                              <ViewerView
                                // A preview tab mutates `viewer` in place to peek at
                                // a new target, so the key must include it — else it
                                // stays mounted across the swap and shows the previous
                                // target's stale state until its own fetch resolves.
                                key={tab.viewer ? `${tab.id}:${viewerKey(tab.viewer)}` : tab.id}
                                tab={tab}
                                active={visible}
                                fontSize={config.terminalFontSize}
                                onError={setError}
                                onDirtyChange={(dirty) => onViewerDirtyChange(tab.id, dirty)}
                                onOpenViewer={openViewerTab}
                              />
                            )}
                          </div>
                        </div>
                      )
                    })}
                    {Array.from({ length: layout }).map((_, i) =>
                      slots[i] === null ? (
                        <div
                          key={`empty-${i}`}
                          className={`pane empty ${i === focusedSlot ? 'focused' : ''} ${dragOverSlot === i ? 'drag-over' : ''}`}
                          style={{ order: i }}
                          onClick={() => focusSlot(i)}
                          {...paneDropTarget(i)}
                        >
                          <span className="empty-pane-plus">＋</span>
                          <span>Empty pane</span>
                          <div className="empty-pane-actions">
                            <button
                              type="button"
                              className="empty-pane-action"
                              title="Start a new chat here"
                              onClick={(e) => {
                                e.stopPropagation()
                                openNewChat(i)
                              }}
                            >
                              <PlusIcon size={12} />
                              New chat
                            </button>
                            <button
                              type="button"
                              className="empty-pane-action"
                              title="Open a terminal here"
                              onClick={(e) => {
                                e.stopPropagation()
                                openNewTerminal(i)
                              }}
                            >
                              <TerminalIcon size={12} />
                              New terminal
                            </button>
                          </div>
                          <span className="empty-pane-hint">or drag a chat here</span>
                        </div>
                      ) : null
                    )}
                  </div>
                </>
              )}
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

      {/* A maximized pane is `position: fixed` on its own pane-grid tile (see
          the `.pane.maximized` rule) — this backdrop just dims everything
          else and gives the click-outside-to-restore affordance a modal
          normally has. No Escape shortcut on purpose: it's too easily hit
          while typing in the chat/terminal input to double as "exit fullscreen". */}
      {maximizedTabId && (
        <div className="maximize-backdrop" onClick={() => setMaximizedTabId(null)} />
      )}

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
