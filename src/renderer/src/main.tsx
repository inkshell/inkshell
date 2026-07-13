import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import './styles/theme.css'
import { App } from './App'

// StrictMode is intentionally omitted: its dev-only double-invocation of effects
// would spawn (and immediately tear down) two `claude` child processes per tab.
createRoot(document.getElementById('root') as HTMLElement).render(<App />)
