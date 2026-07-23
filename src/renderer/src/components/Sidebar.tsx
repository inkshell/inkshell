import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from 'react-resizable-panels'
import type { ProjectEntry, SessionSummary } from '@shared/types'
import { relativeTime } from '../lib/format'
import { ChevronIcon, FolderIcon, GearIcon, GripIcon, TrashIcon } from './Icons'

interface Props {
  isMac: boolean
  currentProject: string | null
  projects: ProjectEntry[]
  sessions: SessionSummary[]
  onNewProject: () => void
  onOpenSettings: () => void
  onSelectProject: (path: string) => void
  onEditProject: (path: string) => void
  onReorderProjects: (projects: ProjectEntry[]) => void
  onOpenSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
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
  onNewProject,
  onOpenSettings,
  onSelectProject,
  onEditProject,
  onReorderProjects,
  onOpenSession,
  onDeleteSession
}: Props) {
  // The projects / history split (and each section's collapsed state) is
  // remembered between launches.
  const layout = useDefaultLayout({ id: 'inkshell:sidebar-sections' })

  // The history belongs to the project selected *here* in the sidebar, so it
  // wears that project's colour rather than the active tab's (which is what the
  // app-wide --session carries).
  const currentColor = projects.find((p) => p.path === currentProject)?.color
  const historyStyle = currentColor
    ? ({ ['--session' as string]: currentColor } as CSSProperties)
    : undefined
  const [menu, setMenu] = useState<ContextMenu | null>(null)

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
  // eventual drop.
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragDeltaY, setDragDeltaY] = useState(0)
  const dragStartY = useRef(0)
  const overIndex =
    dragIndex === null
      ? null
      : clamp(dragIndex + Math.round(dragDeltaY / ROW_STEP), 0, projects.length - 1)

  // Pointer capture (rather than window mouse listeners) keeps the drag live
  // even if the pointer leaves the Electron window before it's released —
  // move/up/cancel keep targeting the grip that captured it.
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
      </div>

      <Group
        orientation="vertical"
        className="sidebar-groups"
        defaultLayout={layout.defaultLayout}
        onLayoutChanged={layout.onLayoutChanged}
      >
        <Section id="projects" title="PROJECTS" count={projects.length} defaultSize="42%">
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
              const rowStyle: CSSProperties = {
                ...(p.color ? { ['--session' as string]: p.color } : null),
                transform: isDragging
                  ? `translateY(${dragDeltaY}px)`
                  : shift
                    ? `translateY(${shift}px)`
                    : undefined
              }
              return (
                <button
                  key={p.path}
                  className={`project-row ${currentProject === p.path ? 'active' : ''} ${isDragging ? 'dragging' : ''}`}
                  style={rowStyle}
                  title={p.path}
                  onClick={() => onSelectProject(p.path)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setMenu({ x: e.clientX, y: e.clientY, projectPath: p.path })
                  }}
                >
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
                </button>
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
    </aside>
  )
}
