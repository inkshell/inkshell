import type { InkShellApi } from './index'

// Makes `window.inkshell` known to the renderer's TypeScript without importing
// anything at runtime.
declare global {
  interface Window {
    inkshell: InkShellApi
  }
}

export {}
