import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from 'react-resizable-panels'
import type { ProjectEntry, SessionSummary } from '@shared/types'
import { relativeTime } from '../lib/format'
import { ChevronIcon, FolderIcon, GearIcon, TrashIcon } from './Icons'

interface Props {
  isMac: boolean
  currentProject: string | null
  projects: ProjectEntry[]
  sessions: SessionSummary[]
  onBrowse: () => void
  onOpenSettings: () => void
  onSelectProject: (path: string) => void
  onOpenSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
}

/** The right-click menu open over a history card, anchored at the cursor. */
interface SessionMenu {
  x: number
  y: number
  sessionId: string
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
  onBrowse,
  onOpenSettings,
  onSelectProject,
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
  const [menu, setMenu] = useState<SessionMenu | null>(null)

  // Escape dismisses the context menu (clicks land on the overlay instead).
  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [menu])

  return (
    <aside className="sidebar">
      {isMac && <div className="mac-drag-inset drag" />}
      <div className="brand drag">
        <div className="brand-badge">◈</div>
        <div>
          <div className="brand-name">InkShell</div>
          <div className="brand-tag">Claude Code, com estilo</div>
        </div>
      </div>

      <div className="sidebar-actions">
        <button className="btn grow" onClick={onBrowse}>
          <FolderIcon size={15} /> Abrir projeto…
        </button>
        <button className="btn square" onClick={onOpenSettings} title="Configurações">
          <GearIcon size={16} />
        </button>
      </div>

      <Group
        orientation="vertical"
        className="sidebar-groups"
        defaultLayout={layout.defaultLayout}
        onLayoutChanged={layout.onLayoutChanged}
      >
        <Section id="projects" title="PROJETOS" count={projects.length} defaultSize="42%">
          <div className="project-list">
            {projects.map((p) => {
              const rowStyle = p.color
                ? ({ ['--session' as string]: p.color } as CSSProperties)
                : undefined
              return (
                <button
                  key={p.path}
                  className={`project-row ${currentProject === p.path ? 'active' : ''}`}
                  style={rowStyle}
                  title={p.path}
                  onClick={() => onSelectProject(p.path)}
                >
                  <span className="name">{p.name}</span>
                </button>
              )
            })}
          </div>
        </Section>

        <Separator className="sep sep-v" />

        <Section
          id="history"
          title="HISTÓRICO"
          count={currentProject === null ? 0 : sessions.length}
        >
          {currentProject === null ? (
            <div className="empty-note">Selecione um projeto para ver o histórico.</div>
          ) : sessions.length === 0 ? (
            <div className="empty-note">Nenhuma conversa ainda neste projeto.</div>
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
              left: Math.min(menu.x, window.innerWidth - 190),
              top: Math.min(menu.y, window.innerHeight - 52)
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className="ctx-item danger"
              onClick={() => {
                onDeleteSession(menu.sessionId)
                setMenu(null)
              }}
            >
              <TrashIcon size={14} />
              Apagar chat
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
