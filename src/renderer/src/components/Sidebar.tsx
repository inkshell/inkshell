import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from 'react-resizable-panels'
import type { ProjectEntry, SessionSummary } from '@shared/types'
import { SESSION_DRAG_TYPE, TAB_DRAG_TYPE, type PaneLayout, type Tab } from '../types'
import { relativeTime } from '../lib/format'
import {
  ChevronIcon,
  CloseIcon,
  FolderIcon,
  GearIcon,
  GripIcon,
  InfoIcon,
  PlusIcon,
  TerminalIcon,
  TrashIcon
} from './Icons'
import { TooltipHost, useTooltip } from './Tooltip'

interface Props {
  isMac: boolean
  currentProject: string | null
  projects: ProjectEntry[]
  sessions: SessionSummary[]
  /** Every open tab (chats + viewers), grouped into the tree by working dir. */
  tabs: Tab[]
  /** Which tab sits in each of the four panes (null = empty pane). */
  slots: (string | null)[]
  /** How many panes are on screen — a tab in slot < layout is "in a pane". */
  layout: PaneLayout
  /** The tab holding the focused pane; rendered as the active session. */
  activeTabId: string | null
  onNewProject: () => void
  onOpenSettings: () => void
  onOpenAbout: () => void
  onSelectProject: (path: string) => void
  onEditProject: (path: string) => void
  onReorderProjects: (projects: ProjectEntry[]) => void
  onOpenSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  /** Show an already-open tab in a pane (or focus the pane it's already in). */
  onFocusTab: (tabId: string) => void
  /** Close an open tab from the tree. */
  onCloseTab: (tabId: string) => void
  /** The project row's small "+" — starts a chat there without a trip through
   *  the toolbar (which no longer carries a "New chat" button). */
  onNewChat: (path: string) => void
  /** The project row's small terminal icon — opens a plain shell there. */
  onNewTerminal: (path: string) => void
}

/** `.project-row` height + `.project-list` gap (theme.css) — one vertical drag step. */
const ROW_STEP = 32

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** A viewer's glyph in the tree, where a chat wears its project-colour dot. */
function viewerGlyph(kind: Tab['kind']): string {
  if (kind === 'diff') return '±'
  if (kind === 'commit') return '◇'
  if (kind === 'shell') return '$'
  return '◧'
}

/**
 * The mini badge whose filled cell is the pane the item currently sits in.
 * Its shape follows the actual split — a 2×2 grid only reads as "which
 * quadrant" once there are four to choose from. At layout 2 it collapses to a
 * single left/right bar, and at layout 1 there's only one possible pane, so
 * the badge would carry no information and is omitted entirely.
 */
function QuadBadge({ slot, layout }: { slot: number; layout: PaneLayout }) {
  if (layout === 1) return null
  const cells = layout === 2 ? [0, 1] : [0, 1, 2, 3]
  return (
    <span className={`qbadge qbadge-${layout}`} aria-hidden>
      {cells.map((i) => (
        <i key={i} className={i === slot ? 'f' : ''} />
      ))}
    </span>
  )
}

/**
 * A right-click menu anchored at the cursor, over either a history card or a
 * project row — one piece of state, since only one can be open at a time.
 */
interface ContextMenu {
  x: number
  y: number
  sessionId?: string
  projectPath?: string
}

/** Height the header occupies when its section is collapsed to just the label. */
const HEAD_PX = 34

interface SectionProps {
  id: string
  title: string
  count: number
  defaultSize?: string
  children: ReactNode
}

/**
 * A resizable sidebar section that can also be collapsed to just its header.
 * The chevron drives `collapse()/expand()` on the panel; dragging its neighbour's
 * handle below the min size snaps it collapsed too, and `onResize` keeps the
 * chevron in sync with either path.
 */
function Section({ id, title, count, defaultSize, children }: SectionProps) {
  const ref = usePanelRef()
  const [open, setOpen] = useState(true)
  const toggle = () => {
    const p = ref.current
    if (!p) return
    if (p.isCollapsed()) p.expand()
    else p.collapse()
  }
  return (
    <Panel
      id={id}
      className="sb-pane"
      panelRef={ref}
      collapsible
      collapsedSize={HEAD_PX}
      minSize={96}
      defaultSize={defaultSize}
      onResize={() => setOpen(!ref.current?.isCollapsed())}
    >
      <button className={`sb-head ${open ? 'open' : ''}`} onClick={toggle}>
        <span className="caret">
          <ChevronIcon size={11} />
        </span>
        <span className="section-title">{title}</span>
        <span className="section-count">{count}</span>
      </button>
      {children}
    </Panel>
  )
}

export function Sidebar({
  isMac,
  currentProject,
  projects,
  sessions,
  tabs,
  slots,
  layout,
  activeTabId,
  onNewProject,
  onOpenSettings,
  onOpenAbout,
  onSelectProject,
  onEditProject,
  onReorderProjects,
  onOpenSession,
  onDeleteSession,
  onFocusTab,
  onCloseTab,
  onNewChat,
  onNewTerminal
}: Props) {
  // The projects / history split (and each section's collapsed state) is
  // remembered between launches.
  const layout2 = useDefaultLayout({ id: 'inkshell:sidebar-sections' })

  // The history belongs to the project selected *here* in the sidebar, so it
  // wears that project's colour rather than the active tab's (which is what the
  // app-wide --session carries).
  const currentColor = projects.find((p) => p.path === currentProject)?.color
  const historyStyle = currentColor
    ? ({ ['--session' as string]: currentColor } as CSSProperties)
    : undefined
  const [menu, setMenu] = useState<ContextMenu | null>(null)
  const { tip, bind } = useTooltip()

  // Which project nodes are collapsed in the tree (default: all expanded).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggleExpand = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  // Escape dismisses the context menu (clicks land on the overlay instead).
  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [menu])

  // Vertical-only drag reorder of the project list: `dragIndex` is the row
  // being lifted, `dragDeltaY` its raw offset from the mouse-down point. The
  // target slot is derived from those two on every render rather than kept as
  // its own state, so there's one number driving both the row shift and the
  // eventual drop. While a drag is live the open-item children are hidden, so
  // every row is a uniform `ROW_STEP` tall and the step maths stays exact.
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragDeltaY, setDragDeltaY] = useState(0)
  const dragStartY = useRef(0)
  const overIndex =
    dragIndex === null
      ? null
      : clamp(dragIndex + Math.round(dragDeltaY / ROW_STEP), 0, projects.length - 1)

  const startDrag = (index: number) => (e: React.PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStartY.current = e.clientY
    setDragDeltaY(0)
    setDragIndex(index)
  }

  const dragMove = (index: number) => (e: React.PointerEvent<HTMLSpanElement>) => {
    if (dragIndex !== index) return
    setDragDeltaY(e.clientY - dragStartY.current)
  }

  const dropDrag = (index: number) => (e: React.PointerEvent<HTMLSpanElement>) => {
    if (dragIndex !== index) return
    const deltaY = e.clientY - dragStartY.current
    const target = clamp(index + Math.round(deltaY / ROW_STEP), 0, projects.length - 1)
    if (target !== index) onReorderProjects(moveItem(projects, index, target))
    setDragIndex(null)
    setDragDeltaY(0)
  }

  const cancelDrag = (index: number) => () => {
    if (dragIndex !== index) return
    setDragIndex(null)
    setDragDeltaY(0)
  }

  return (
    <aside className="sidebar">
      {isMac && <div className="mac-drag-inset drag" />}
      <div className="brand drag">
        <div className="brand-badge">◈</div>
        <div>
          <div className="brand-name">InkShell</div>
          <div className="brand-tag">Claude Code, with style</div>
        </div>
      </div>

      <div className="sidebar-actions">
        <button className="btn grow" onClick={onNewProject}>
          <FolderIcon size={15} /> New project…
        </button>
        <button className="btn square" onClick={onOpenSettings} title="Settings">
          <GearIcon size={16} />
        </button>
        <button className="btn square" onClick={onOpenAbout} title="About InkShell">
          <InfoIcon size={16} />
        </button>
      </div>

      <Group
        orientation="vertical"
        className="sidebar-groups"
        defaultLayout={layout2.defaultLayout}
        onLayoutChanged={layout2.onLayoutChanged}
      >
        <Section id="projects" title="PROJECTS" count={projects.length} defaultSize="52%">
          <div className={`project-list ${dragIndex !== null ? 'dragging' : ''}`}>
            {projects.map((p, i) => {
              const isDragging = dragIndex === i
              // Rows the lifted one is currently passing over slide aside by one
              // step to open its landing slot; the lifted row itself tracks the
              // cursor's raw Y offset (never X, so the drag stays vertical-only).
              let shift = 0
              if (dragIndex !== null && overIndex !== null && !isDragging) {
                if (dragIndex < overIndex && i > dragIndex && i <= overIndex) shift = -ROW_STEP
                else if (dragIndex > overIndex && i >= overIndex && i < dragIndex) shift = ROW_STEP
              }
              const wrapStyle: CSSProperties = {
                ...(p.color ? { ['--session' as string]: p.color } : null),
                transform: isDragging
                  ? `translateY(${dragDeltaY}px)`
                  : shift
                    ? `translateY(${shift}px)`
                    : undefined
              }
              const items = tabs.filter((t) => t.cwd === p.path)
              const caretOpen = !collapsed.has(p.path)
              const showKids = caretOpen && dragIndex === null && items.length > 0
              return (
                <div
                  key={p.path}
                  className={`tree-project ${isDragging ? 'dragging' : ''}`}
                  style={wrapStyle}
                >
                  <div
                    className={`project-row ${currentProject === p.path ? 'active' : ''} ${isDragging ? 'dragging' : ''}`}
                    title={p.path}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectProject(p.path)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return
                      e.preventDefault()
                      onSelectProject(p.path)
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setMenu({ x: e.clientX, y: e.clientY, projectPath: p.path })
                    }}
                  >
                    <button
                      type="button"
                      className={`tree-caret ${caretOpen ? 'open' : ''} ${items.length === 0 ? 'empty' : ''}`}
                      title={items.length === 0 ? undefined : caretOpen ? 'Collapse' : 'Expand'}
                      aria-label={
                        items.length === 0 ? undefined : caretOpen ? 'Collapse' : 'Expand'
                      }
                      aria-hidden={items.length === 0}
                      tabIndex={items.length === 0 ? -1 : 0}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (items.length > 0) toggleExpand(p.path)
                      }}
                    >
                      <ChevronIcon size={11} />
                    </button>
                    <span
                      className="project-grip"
                      title="Drag to reorder"
                      onPointerDown={startDrag(i)}
                      onPointerMove={dragMove(i)}
                      onPointerUp={dropDrag(i)}
                      onPointerCancel={cancelDrag(i)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <GripIcon size={12} />
                    </span>
                    <span className="name">{p.name}</span>
                    <button
                      type="button"
                      className="project-new-chat"
                      aria-label={`New chat in ${p.name}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onNewChat(p.path)
                      }}
                      {...bind('New chat')}
                    >
                      <PlusIcon size={13} />
                    </button>
                    <button
                      type="button"
                      className="project-new-terminal"
                      aria-label={`New terminal in ${p.name}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onNewTerminal(p.path)
                      }}
                      {...bind('New terminal')}
                    >
                      <TerminalIcon size={13} />
                    </button>
                    {items.length > 0 && <span className="open-count">{items.length}</span>}
                  </div>

                  {showKids && (
                    <div className="kids">
                      {items.map((t) => {
                        const slot = slots.indexOf(t.id)
                        const inPane = slot !== -1 && slot < layout
                        const isActive = t.id === activeTabId
                        const isChat = t.kind === 'terminal'
                        return (
                          <div
                            key={t.id}
                            className={`knode ${isActive ? 'on' : ''} ${inPane ? 'in-pane' : ''}`}
                            title={t.title}
                            role="button"
                            tabIndex={0}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData(TAB_DRAG_TYPE, t.id)
                              e.dataTransfer.effectAllowed = 'move'
                            }}
                            onClick={() => onFocusTab(t.id)}
                            onKeyDown={(e) => {
                              if (e.key !== 'Enter' && e.key !== ' ') return
                              e.preventDefault()
                              onFocusTab(t.id)
                            }}
                            onMouseDown={(e) => {
                              // Middle click closes, same idiom as the pane header.
                              if (e.button !== 1) return
                              e.preventDefault()
                              onCloseTab(t.id)
                            }}
                          >
                            {isChat ? (
                              <span
                                className={`kd ${t.processing ? 'proc' : ''} ${!inPane ? 'idle' : ''}`}
                              />
                            ) : (
                              <span className="gl">{viewerGlyph(t.kind)}</span>
                            )}
                            <span className="t">{t.title}</span>
                            {inPane && <QuadBadge slot={slot} layout={layout} />}
                            <button
                              className="knode-close"
                              title="Close"
                              onClick={(e) => {
                                e.stopPropagation()
                                onCloseTab(t.id)
                              }}
                            >
                              <CloseIcon size={11} />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Section>

        <Separator className="sep sep-v" />

        <Section id="history" title="HISTORY" count={currentProject === null ? 0 : sessions.length}>
          {currentProject === null ? (
            <div className="empty-note">Select a project to see its history.</div>
          ) : sessions.length === 0 ? (
            <div className="empty-note">No conversations in this project yet.</div>
          ) : (
            <div className="history-list" style={historyStyle}>
              {sessions.map((s) => (
                <button
                  key={s.sessionId}
                  className="history-card"
                  title={s.preview}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(SESSION_DRAG_TYPE, s.sessionId)
                    // Matches the drop target's fixed `dropEffect: 'move'` — a
                    // mismatched effect (e.g. 'copy' here) makes the browser treat
                    // the drag as disallowed and the pane's `drop` never fires.
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onClick={() => onOpenSession(s.sessionId)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setMenu({ x: e.clientX, y: e.clientY, sessionId: s.sessionId })
                  }}
                >
                  <div className="history-preview">{s.preview}</div>
                  <div className="history-time">{relativeTime(s.createdMs)}</div>
                </button>
              ))}
            </div>
          )}
        </Section>
      </Group>

      {menu && (
        <div
          className="ctx-overlay"
          onMouseDown={() => setMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault()
            setMenu(null)
          }}
        >
          <div
            className="ctx-menu"
            style={{
              left: Math.min(menu.x, window.innerWidth - 230),
              top: Math.min(menu.y, window.innerHeight - 52)
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {menu.projectPath !== undefined ? (
              <button
                className="ctx-item"
                onClick={() => {
                  onEditProject(menu.projectPath!)
                  setMenu(null)
                }}
              >
                <GearIcon size={14} />
                Project settings
              </button>
            ) : (
              <button
                className="ctx-item danger"
                onClick={() => {
                  onDeleteSession(menu.sessionId!)
                  setMenu(null)
                }}
              >
                <TrashIcon size={14} />
                Delete chat
              </button>
            )}
          </div>
        </div>
      )}

      <TooltipHost tip={tip} />
    </aside>
  )
}
