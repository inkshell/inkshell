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
          title="Minimizar"
          onClick={() => window.vibebox.window.minimize()}
        >
          <MinimizeIcon size={14} />
        </button>
        <button
          className="win-btn"
          title="Maximizar"
          onClick={() => window.vibebox.window.maximizeToggle()}
        >
          <MaximizeIcon size={11} />
        </button>
        <button
          className="win-btn close"
          title="Fechar"
          onClick={() => window.vibebox.window.close()}
        >
          <CloseIcon size={13} />
        </button>
      </div>
    </div>
  )
}
