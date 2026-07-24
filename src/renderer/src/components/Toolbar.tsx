import { TERMINAL_FONT_SIZE_MAX, TERMINAL_FONT_SIZE_MIN } from '@shared/types'
import type { PaneLayout } from '../types'
import { MinimizeIcon, PanelRightIcon, PlusIcon, SidebarIcon } from './Icons'

interface Props {
  /** macOS + collapsed sidebar: pad the row clear of the traffic lights. */
  reserveTrafficLights: boolean
  /** How many panes the centre currently shows. */
  layout: PaneLayout
  onSetLayout: (layout: PaneLayout) => void
  onToggleSidebar: () => void
  onTogglePanel: () => void
  /** Terminal font size in px — also scales the file/diff viewer's text. */
  fontSize: number
  onSetFontSize: (size: number) => void
}

/** The three window layouts, each drawn as a little map of its panes. */
const LAYOUTS: { value: PaneLayout; label: string }[] = [
  { value: 1, label: 'Single pane' },
  { value: 2, label: 'Two panes side by side' },
  { value: 4, label: 'Four panes' }
]

/**
 * The row above the panes. With no tab strip to hold anymore, it carries the
 * window-level controls: the sidebar/panel toggles, the layout switcher that
 * splits the centre into 1 / 2 / 4 panes, and the font-size stepper. "New
 * chat" lives per-project in the sidebar instead of here — see `Sidebar`'s
 * `project-new-chat` icon.
 */
export function Toolbar({
  reserveTrafficLights,
  layout,
  onSetLayout,
  onToggleSidebar,
  onTogglePanel,
  fontSize,
  onSetFontSize
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

      <div className="font-size-ctl" role="group" aria-label="Text size">
        <button
          title="Decrease text size"
          disabled={fontSize <= TERMINAL_FONT_SIZE_MIN}
          onClick={() => onSetFontSize(Math.max(TERMINAL_FONT_SIZE_MIN, fontSize - 1))}
        >
          <MinimizeIcon size={12} />
        </button>
        <span className="fs-value">{fontSize}</span>
        <button
          title="Increase text size"
          disabled={fontSize >= TERMINAL_FONT_SIZE_MAX}
          onClick={() => onSetFontSize(Math.min(TERMINAL_FONT_SIZE_MAX, fontSize + 1))}
        >
          <PlusIcon size={12} />
        </button>
      </div>

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
