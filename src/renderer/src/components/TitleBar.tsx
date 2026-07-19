import { CloseIcon, MaximizeIcon, MinimizeIcon } from './Icons'

/**
 * A slim draggable strip carrying the custom window controls, shown on Windows
 * and Linux where the OS frame is dropped. On macOS the native traffic lights
 * float over the sidebar instead, so this bar is not rendered.
 */
export function TitleBar() {
  return (
    <div className="titlebar drag">
      <div className="win-controls no-drag">
        <button
          className="win-btn"
          title="Minimize"
          onClick={() => window.inkshell.window.minimize()}
        >
          <MinimizeIcon size={14} />
        </button>
        <button
          className="win-btn"
          title="Maximize"
          onClick={() => window.inkshell.window.maximizeToggle()}
        >
          <MaximizeIcon size={11} />
        </button>
        <button
          className="win-btn close"
          title="Close"
          onClick={() => window.inkshell.window.close()}
        >
          <CloseIcon size={13} />
        </button>
      </div>
    </div>
  )
}
