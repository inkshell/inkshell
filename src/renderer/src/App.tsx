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
  paletteColor,
  type AppConfig,
  type CliKind,
  type ProjectEntry,
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
import { ProjectPanel } from './components/ProjectPanel'
import { QuickOpen } from './components/QuickOpen'
import { EmptyState } from './components/EmptyState'
import { SettingsModal } from './components/SettingsModal'
import { ProjectModal } from './components/ProjectModal'
import { ConfirmModal } from './components/ConfirmModal'
import { AboutModal } from './components/AboutModal'
import {
  ClaudeIcon,
  CloseIcon,
  CommitIcon,
  DiffIcon,
  FileTextIcon,
  MaximizeIcon,
  MinimizeIcon,
  OpencodeIcon,
  PlusIcon,
  TerminalIcon
} from './components/Icons'

const isMac = window.inkshell.platform === 'darwin'
let tabSeq = 0

/** The glyph a chat pane wears where a viewer pane wears its own icon. */
function chatGlyph(cli: CliKind, size = 12) {
  return cli === 'opencode' ? <OpencodeIcon size={size} /> : <ClaudeIcon size={size} />
}

/** The glyph a viewer pane wears in its header where a chat wears its spark. */
function paneGlyph(kind: Tab['kind'], size = 12) {
  if (kind === 'diff') return <DiffIcon size={size} />
  if (kind === 'commit') return <CommitIcon size={size} />
  if (kind === 'shell') return <TerminalIcon size={size} />
  return <FileTextIcon size={size} />
}

/**
 * How the status bar names a focused pane that isn't a chat. The bar is drawn
 * at the same height for every pane kind, so this fills the row rather than
 * letting it read as a blank strip whenever a terminal or file has focus.
 */
const PANE_SUBJECT: Record<Exclude<Tab['kind'], 'terminal'>, string> = {
  shell: 'Terminal',
  file: 'File',
  diff: 'Diff',
  commit: 'Commit'
}

export function App() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [currentProject, setCurrentProject] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  // Which CLI's history the sidebar lists. The choice is per-listing (and so
  // per-resume): every session summary carries its own `cli`, and a chat tab
  // remembers which CLI it drives for the rest of its life.
  const [historyCli, setHistoryCli] = useState<CliKind>('claude')
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
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const currentProjectRef = useRef(currentProject)
  currentProjectRef.current = currentProject
  const historyCliRef = useRef(historyCli)
  historyCliRef.current = historyCli

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

  // --- Init: load config, select the first project -------------------------
  // A first launch starts empty on purpose: nothing is ever imported from the
  // CLIs' own history stores — the user adds each project explicitly. With no
  // saved projects, the project screen opens so that's the first thing they do.
  useEffect(() => {
    ;(async () => {
      const cfg = await window.inkshell.config.load()
      setConfig(cfg)
      const first = cfg.projects[0] ?? null
      if (first) {
        setCurrentProject(first.path)
        setSessions(await window.inkshell.history.listSessions(first.path, first.claudeConfigDir))
      } else {
        setProjectModal({
          mode: 'new',
          entry: { name: '', path: '', color: paletteColor(0) }
        })
      }
    })()
  }, [])

  const reloadSessions = useCallback(
    async (path: string | null, cli?: CliKind) => {
      const which = cli ?? historyCliRef.current
      setSessions(
        path
          ? await window.inkshell.history.listSessions(
              path,
              which === 'claude' ? claudeConfigDirFor(path) : undefined,
              which
            )
          : []
      )
    },
    [claudeConfigDirFor]
  )

  /** Switches the sidebar's history list between the two CLIs. */
  const switchHistoryCli = useCallback(
    (cli: CliKind) => {
      setHistoryCli(cli)
      reloadSessions(currentProjectRef.current, cli)
    },
    [reloadSessions]
  )

  /** Points the sidebar (highlight, history list, git/files dock) at a project.
   *  Never moves pane focus — see `selectProjectFromSidebar` for that. */
  const selectProject = useCallback(
    (path: string) => {
      setCurrentProject(path)
      reloadSessions(path)
    },
    [reloadSessions]
  )
  const selectProjectRef = useRef(selectProject)
  selectProjectRef.current = selectProject

  /**
   * Re-points the sidebar at the project of the tab that just took focus.
   *
   * Called from every site that moves the focused slot rather than from an
   * effect on the active tab, because the two states this has to reconcile are
   * *events*, not values: focus moving between two panes of the **same**
   * project — or landing back on the pane that already had it — leaves the
   * active tab's `cwd` (and often `activeTabId` itself) untouched, so an effect
   * keyed on either would never re-run and the sidebar would stay stranded on
   * whatever project was clicked in between.
   *
   * A slot holding no tab carries no project, so it leaves the selection alone.
   * A tab that isn't in `tabsRef` yet is one being created this very tick
   * (`openNewChat` and friends); those already own their selection, either
   * because they launch into `currentProject` or because the sidebar's
   * per-project buttons call `selectProject` themselves.
   *
   * Selecting re-reads the project's transcript directory (`listSessions` walks
   * every `.jsonl` in it), so a focus move that lands on the project already
   * selected — clicking between two panes of one project, or back onto the pane
   * that already had focus — skips out rather than paying that walk per click.
   */
  const syncSelectionToTab = useCallback((id: string | null) => {
    const cwd = id ? tabsRef.current.find((t) => t.id === id)?.cwd : null
    if (cwd && cwd !== currentProjectRef.current) selectProjectRef.current(cwd)
  }, [])

  /**
   * The sidebar's project row: selects the project and, when it already has an
   * instance on screen, hands that pane the focus too (focus ring, keyboard,
   * and the pane a new chat would default into).
   *
   * A tab parked in a hidden slot beyond the current layout doesn't count —
   * only a pane actually on screen can be "selected". With no visible pane to
   * match, focus stays exactly where it was instead of guessing: `isFocused`
   * and the tree's `isActive` are gated on the project too (see the pane-grid
   * and Sidebar.tsx), so the pane that no longer belongs to the selection just
   * stops *looking* selected, without disturbing what's still running in it.
   */
  const selectProjectFromSidebar = useCallback(
    (path: string) => {
      selectProject(path)
      const match = slotsRef.current
        .slice(0, layoutRef.current)
        .findIndex((id) => id !== null && tabsRef.current.find((t) => t.id === id)?.cwd === path)
      if (match !== -1) setFocusedSlot(match)
    },
    [selectProject]
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
  const defaultOpencodeModel = useCallback((): string | undefined => {
    const m = config?.defaultOpencodeModel.trim()
    return m ? m : undefined
  }, [config])
  const defaultEffort = useCallback((): string | undefined => {
    const e = config?.defaultEffort.trim()
    return e ? e : undefined
  }, [config])
  /**
   * The model a new chat in `cwd` launches on: the project's own default for
   * that CLI wins over the global one, each in its own form — an alias or id
   * for claude, opencode's `provider/model` for opencode.
   */
  const modelFor = useCallback(
    (cli: CliKind, cwd: string | null): string | undefined => {
      const project = cwd ? configRef.current?.projects.find((p) => p.path === cwd) : undefined
      const override = (cli === 'claude' ? project?.claudeModel : project?.opencodeModel)?.trim()
      if (override) return override
      return cli === 'claude' ? defaultModel() : defaultOpencodeModel()
    },
    [defaultModel, defaultOpencodeModel]
  )

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
  const showTab = useCallback(
    (id: string, slot?: number) => {
      const cur = slotsRef.current
      const lay = layoutRef.current
      const existing = cur.indexOf(id)
      if (slot === undefined && existing !== -1 && existing < lay) {
        setFocusedSlot(existing)
        syncSelectionToTab(id)
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
      syncSelectionToTab(id)
    },
    [syncSelectionToTab]
  )

  const focusSlot = useCallback(
    (i: number) => {
      setFocusedSlot(i)
      syncSelectionToTab(slotsRef.current[i])
    },
    [syncSelectionToTab]
  )

  // The layout buttons. Growing reveals panes that already hold off-screen tabs;
  // shrinking keeps the focused tab in view by sliding it into the first pane.
  const changeLayout = useCallback(
    (n: PaneLayout) => {
      setMaximizedTabId(null)
      setLayout(n)
      if (focusedSlotRef.current >= n) {
        const next = slotsRef.current.slice()
        const held = next[focusedSlotRef.current]
        next[focusedSlotRef.current] = next[0]
        next[0] = held
        setSlots(next)
        setFocusedSlot(0)
        syncSelectionToTab(held)
      }
    },
    [syncSelectionToTab]
  )

  // --- Tab lifecycle -------------------------------------------------------
  /** `project` defaults to the sidebar's current selection — pass it explicitly
   *  to start a chat in a project without first selecting it (the sidebar's
   *  per-project "new chat" icons do this). `cli` picks which agent runs. */
  const openNewChat = useCallback(
    (slot?: number, project?: string, cli: CliKind = 'claude') => {
      const cwd = project ?? currentProject
      const tab: Tab = {
        id: `tab-${tabSeq++}`,
        cli,
        kind: 'terminal',
        ptyId: null,
        sessionId: null,
        resumeSessionId: null,
        cwd,
        claudeConfigDir: claudeConfigDirFor(cwd) ?? null,
        // A project (or the global config, for claude) may pin the model a new
        // chat launches on; opencode falls back to its own default when unset.
        model: modelFor(cli, cwd) ?? null,
        effort: cli === 'claude' ? (defaultEffort() ?? null) : null,
        startedAtMs: Date.now(),
        title: 'New chat',
        processing: false
      }
      setTabs((prev) => [...prev, tab])
      showTab(tab.id, slot)
    },
    [currentProject, modelFor, defaultEffort, claudeConfigDirFor, showTab]
  )

  /** The sidebar's per-project "new chat" icons: selects the project (so the
   *  history section and highlight follow it, same as clicking the row) and
   *  starts a chat there, regardless of whatever project was current before. */
  const newChatForProject = useCallback(
    (path: string, cli: CliKind = 'claude') => {
      selectProject(path)
      openNewChat(undefined, path, cli)
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
        cli: 'claude',
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
          cli: 'claude',
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
      // Which CLI recorded this session decides which binary the tab spawns —
      // the history card it came from knows, and its summary carries it here.
      const summary = sessions.find((s) => s.sessionId === sessionId)
      const cli: CliKind = summary?.cli ?? 'claude'
      // Focus an already-open tab for this session instead of duplicating it.
      const existing = tabs.find((t) => t.sessionId === sessionId)
      if (existing) {
        showTab(existing.id, slot)
        return
      }
      const tab: Tab = {
        id: `tab-${tabSeq++}`,
        cli,
        kind: 'terminal',
        ptyId: null,
        sessionId,
        resumeSessionId: sessionId,
        cwd: currentProject,
        claudeConfigDir: cli === 'claude' ? (claudeConfigDirFor(currentProject) ?? null) : null,
        model: modelFor(cli, currentProject) ?? null,
        effort: cli === 'claude' ? (defaultEffort() ?? null) : null,
        startedAtMs: Date.now(),
        // The history card's name for this chat carries over as the tab title,
        // so a resume opens already named instead of sitting on a placeholder
        // until the CLI re-emits its own (identical) title over OSC.
        title: summary?.preview ?? 'Resuming…',
        processing: false
      }
      setTabs((prev) => [...prev, tab])
      showTab(tab.id, slot)
    },
    [tabs, sessions, currentProject, modelFor, defaultEffort, claudeConfigDirFor, showTab]
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
  const closePane = useCallback(
    (id: string) => {
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
        syncSelectionToTab(next[nf])
      }
    },
    [syncSelectionToTab]
  )

  /**
   * Toggles whether a pane fills the whole stage. `slots`/`layout` never
   * change — the sync effect above (keyed on `focusedSlot`) is what drops
   * back to the split view once focus moves away, so restoring is implicit.
   * Also focuses the pane's slot, so maximizing one that wasn't already
   * focused hands it the keyboard too.
   */
  const toggleMaximize = useCallback(
    (id: string) => {
      setMaximizedTabId((cur) => (cur === id ? null : id))
      const at = slotsRef.current.indexOf(id)
      if (at !== -1) {
        setFocusedSlot(at)
        syncSelectionToTab(id)
      }
    },
    [syncSelectionToTab]
  )

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

  const closeTab = useCallback(
    (id: string) => {
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
        syncSelectionToTab(next[nf])
      }
    },
    [syncSelectionToTab]
  )

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
    const cli = pendingDelete?.cli ?? 'claude'
    setPendingDelete(null)
    if (!currentProject || !sessionId) return
    // A deleted chat can't stay open. Wait out its CLI before removing the
    // session record: a session still running writes its own on the way out,
    // which would resurrect the record we're about to delete.
    const open = tabs.find((t) => t.sessionId === sessionId)
    if (open) {
      if (open.ptyId !== null) await window.inkshell.pty.close(open.ptyId)
      closeTab(open.id)
    }
    try {
      await window.inkshell.history.deleteSession(
        currentProject,
        sessionId,
        cli === 'claude' ? claudeConfigDirFor(currentProject) : undefined,
        cli
      )
    } catch (err) {
      setError(`Couldn't delete the chat: ${err instanceof Error ? err.message : err}`)
    }
    reloadSessions(currentProject, cli)
  }, [pendingDelete, currentProject, tabs, closeTab, claudeConfigDirFor, reloadSessions])

  // Callbacks from TerminalView.
  const onTabReady = useCallback(
    (tabId: string, ptyId: number, sessionId: string) => {
      // `''` (a shell, or an opencode new chat whose id the TUI hasn't
      // recorded yet) normalizes to null so every "has a session?" check in
      // the renderer can stay `!== null`.
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, ptyId, sessionId: sessionId || null } : t))
      )
      // A brand-new chat's session only exists in history from this point on
      // (a resume already had its sessionId set at tab creation, so it's
      // already in the sidebar and doesn't need this). Refresh the sidebar so
      // it shows up without a project switch — but only if it belongs to the
      // project currently on screen and the CLI whose history is listed.
      const tab = tabs.find((t) => t.id === tabId)
      if (
        tab &&
        tab.kind === 'terminal' &&
        tab.sessionId === null &&
        tab.cwd === currentProject &&
        tab.cli === historyCliRef.current
      )
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

  // --- Pane handles ----------------------------------------------------------
  // Imperative handles into the live terminals, used to hand the keyboard back
  // to a pane after a click elsewhere stole its DOM focus.
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

  // The project the active tab drives (its own cwd, not the sidebar selection:
  // a tab keeps its records wherever it was launched) — feeds the status bar's
  // project readout and the keyboard shortcuts.
  const activeProject = activeTab?.cwd ?? currentProject

  // --- Opencode session adoption --------------------------------------------
  // A new opencode chat has no session id at spawn — the TUI assigns one and
  // records it in its own store, so the only way to learn it is to watch that
  // store. Poll for sessions created in the tab's directory at or after the
  // tab itself started, oldest-session-to-oldest-tab (two new chats racing in
  // one directory each adopt their own), and stop once nothing is pending.
  // The id is what makes resume-dedup, tab naming and deletion work for the
  // chat later on.
  const pendingAdoption = tabs
    .filter((t) => t.kind === 'terminal' && t.cli === 'opencode' && t.sessionId === null && t.cwd)
    .map((t) => ({ id: t.id, cwd: t.cwd as string, startedAtMs: t.startedAtMs }))
  const adoptionKey = pendingAdoption.map((p) => p.id).join('|')
  useEffect(() => {
    if (!adoptionKey) return
    const pending = pendingAdoption
    let cancelled = false
    const adopt = async () => {
      const byCwd = new Map<string, typeof pending>()
      for (const p of pending) {
        const group = byCwd.get(p.cwd) ?? []
        group.push(p)
        byCwd.set(p.cwd, group)
      }
      for (const [cwd, group] of byCwd) {
        let listed: SessionSummary[]
        try {
          listed = await window.inkshell.history.listSessions(cwd, undefined, 'opencode')
        } catch {
          continue
        }
        if (cancelled) return
        // Clock skew between process start and the store's own timestamps is
        // absorbed by a small window; sessions older than every pending tab
        // belong to earlier chats and must not be adopted.
        const candidates = listed
          .filter((s) => group.some((p) => s.createdMs >= p.startedAtMs - 2000))
          .sort((a, b) => a.createdMs - b.createdMs)
        const queue = [...group].sort((a, b) => a.startedAtMs - b.startedAtMs)
        let adopted = 0
        for (const session of candidates) {
          const p = queue.shift()
          if (!p) break
          adopted++
          setTabs((prev) =>
            prev.map((t) =>
              t.id === p.id && t.sessionId === null
                ? {
                    ...t,
                    sessionId: session.sessionId,
                    title: t.title === 'New chat' ? session.preview : t.title
                  }
                : t
            )
          )
        }
        // A newly recorded session should also show up in the history list —
        // when that list is the one for this directory's CLI and project.
        if (
          adopted > 0 &&
          cwd === currentProjectRef.current &&
          historyCliRef.current === 'opencode'
        )
          reloadSessions(cwd, 'opencode')
      }
    }
    void adopt()
    const timer = setInterval(adopt, 2000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
    // `pendingAdoption` is derived from `tabs`; the key is what it is keyed on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adoptionKey])

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

  // `--no-panel`: override the saved layout for this launch only and start
  // with the project dock collapsed. Once, on mount — a later expand (toolbar
  // toggle) is the user's own choice for the session and nothing here fights
  // it; the collapse itself updates `panelCollapsed` through the panel's own
  // onResize, same as the toolbar toggle does.
  useEffect(() => {
    if (!window.inkshell.launch.panelHidden) return
    const id = requestAnimationFrame(() => projectPanel.current?.collapse())
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // The project panel always follows the sidebar selection, not the active
  // tab: it's a repo browser, and the sidebar's own highlight + history list
  // already track `currentProject`, so the git/files dock must agree with
  // what the sidebar shows as selected even while a tab from another project
  // sits on screen. Same reasoning as the sidebar's own history section
  // (Sidebar.tsx `historyStyle`): it wears the sidebar-selected project's
  // colour, not the app-wide --session the active tab carries.
  const panelProject = currentProject
  const panelConfigDir = claudeConfigDirFor(currentProject) ?? null
  const panelAccent = projectColor(currentProject)

  // What the status bar says about the focused pane. A chat names its CLI
  // (claude and opencode alike — a clean label, the way the opencode bar
  // always read); anything else is simply named. Null for an empty pane,
  // which already says what it is in the middle of its own tile.
  const statusSubject = !activeTab
    ? null
    : activeTab.kind !== 'terminal'
      ? { glyph: paneGlyph(activeTab.kind, 13), label: PANE_SUBJECT[activeTab.kind] }
      : activeTab.cli === 'opencode'
        ? { glyph: <OpencodeIcon size={13} />, label: 'Opencode' }
        : { glyph: <ClaudeIcon size={13} />, label: 'Claude Code' }

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
            historyCli={historyCli}
            onSetHistoryCli={switchHistoryCli}
            tabs={tabs}
            slots={slots}
            layout={layout}
            activeTabId={activeTabId}
            onNewProject={newProject}
            onOpenSettings={() => setShowSettings(true)}
            onOpenAbout={() => setShowAbout(true)}
            onSelectProject={selectProjectFromSidebar}
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
                  <StatusBar project={projectName} subject={statusSubject} />

                  <div className="pane-grid" data-layout={layout}>
                    {tabs.map((tab) => {
                      // A tab keeps a stable wrapper keyed by its id, so moving it
                      // between panes only changes CSS `order` — the terminal's DOM
                      // node (and its pty/scrollback) is never reparented or torn
                      // down. Off-screen tabs stay mounted but hidden.
                      const slot = slots.indexOf(tab.id)
                      const isMaximized = maximizedTabId === tab.id
                      const visible = slot !== -1 && slot < layout
                      // Gated on the project too: the pane the user is literally
                      // typing into keeps driving the meter/toolbar/keyboard
                      // regardless (see `activeProject` below), but its focus ring
                      // only shows once the sidebar selection agrees with it — a
                      // sidebar click on a project with no open instance here must
                      // not leave a stale pane looking selected.
                      const isFocused =
                        visible && slot === focusedSlot && tab.cwd === currentProject
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
                              <span className="pane-dot">{chatGlyph(tab.cli, 12)}</span>
                            ) : (
                              <span className="pane-glyph">{paneGlyph(tab.kind)}</span>
                            )}
                            <span className="pane-title">{tab.title}</span>
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
                              title="Start a new Claude Code chat here"
                              onClick={(e) => {
                                e.stopPropagation()
                                openNewChat(i)
                              }}
                            >
                              <PlusIcon size={12} />
                              Claude chat
                            </button>
                            <button
                              type="button"
                              className="empty-pane-action"
                              title="Start a new Opencode chat here"
                              onClick={(e) => {
                                e.stopPropagation()
                                openNewChat(i, undefined, 'opencode')
                              }}
                            >
                              <OpencodeIcon size={12} />
                              Opencode chat
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
          style={panelAccent ? ({ '--session': panelAccent } as CSSProperties) : undefined}
        >
          <ProjectPanel
            project={panelProject}
            claudeConfigDir={panelConfigDir}
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
