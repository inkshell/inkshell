import { useState, type ReactNode } from 'react'
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from 'react-resizable-panels'
import type { ProjectEntry, SessionSummary } from '@shared/types'
import { relativeTime } from '../lib/format'
import { ChevronIcon, FolderIcon, GearIcon } from './Icons'

interface Props {
  isMac: boolean
  currentProject: string | null
  projects: ProjectEntry[]
  sessions: SessionSummary[]
  onBrowse: () => void
  onOpenSettings: () => void
  onSelectProject: (path: string) => void
  onOpenSession: (sessionId: string) => void
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
  onOpenSession
}: Props) {
  // The projects / history split (and each section's collapsed state) is
  // remembered between launches.
  const layout = useDefaultLayout({ id: 'vibebox:sidebar-sections' })

  return (
    <aside className="sidebar">
      {isMac && <div className="mac-drag-inset drag" />}
      <div className="brand drag">
        <div className="brand-badge">◈</div>
        <div>
          <div className="brand-name">VibeBox</div>
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
            {projects.map((p) => (
              <button
                key={p.path}
                className={`project-row ${currentProject === p.path ? 'active' : ''}`}
                title={p.path}
                onClick={() => onSelectProject(p.path)}
              >
                <span className="name">{p.name}</span>
              </button>
            ))}
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
            <div className="history-list">
              {sessions.map((s) => (
                <button
                  key={s.sessionId}
                  className="history-card"
                  title={s.preview}
                  onClick={() => onOpenSession(s.sessionId)}
                >
                  <div className="history-preview">{s.preview}</div>
                  <div className="history-time">{relativeTime(s.createdMs)}</div>
                </button>
              ))}
            </div>
          )}
        </Section>
      </Group>
    </aside>
  )
}
