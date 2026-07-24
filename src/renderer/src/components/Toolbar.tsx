import type { PaneLayout } from '../types'
import { PanelRightIcon, SidebarIcon } from './Icons'

interface Props {
  /** macOS + collapsed sidebar: pad the row clear of the traffic lights. */
  reserveTrafficLights: boolean
  /** How many panes the centre currently shows. */
  layout: PaneLayout
  onSetLayout: (layout: PaneLayout) => void
  onToggleSidebar: () => void
  onTogglePanel: () => void
}

/** The three window layouts, each drawn as a little map of its panes. */
const LAYOUTS: { value: PaneLayout; label: string }[] = [
  { value: 1, label: 'Single pane' },
  { value: 2, label: 'Two panes side by side' },
  { value: 4, label: 'Four panes' }
]

/**
 * The row above the panes. With no tab strip to hold anymore, it carries the
 * window-level controls: the sidebar/panel toggles and the layout switcher
 * that splits the centre into 1 / 2 / 4 panes. "New chat" lives per-project
 * in the sidebar instead of here — see `Sidebar`'s `project-new-chat` icon.
 * The text-size stepper lives in Settings instead of here.
 */
export function Toolbar({
  reserveTrafficLights,
  layout,
  onSetLayout,
  onToggleSidebar,
  onTogglePanel
}: Props) {
  return (
    <div className={`tabbar ${reserveTrafficLights ? 'mac-inset' : ''}`}>
      <div className="tabbar-drag drag" />

      <button className="sidebar-toggle" title="Show/hide the sidebar" onClick={onToggleSidebar}>
        <SidebarIcon size={16} />
      </button>

      <div className="tb-spacer" />

      <div className="layout-switcher" role="group" aria-label="Window layout">
        {LAYOUTS.map(({ value, label }) => (
          <button
            key={value}
            className={`lay lay-${value} ${layout === value ? 'on' : ''}`}
            title={label}
            aria-label={label}
            aria-pressed={layout === value}
            onClick={() => onSetLayout(value)}
          >
            {Array.from({ length: value }).map((_, i) => (
              <i key={i} />
            ))}
          </button>
        ))}
      </div>

      <div className="tb-spacer" />

      <button
        className="sidebar-toggle"
        title="Show/hide the project panel"
        onClick={onTogglePanel}
      >
        <PanelRightIcon size={16} />
      </button>
    </div>
  )
}
