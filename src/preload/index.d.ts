import type { VibeBoxApi } from './index'

// Makes `window.vibebox` known to the renderer's TypeScript without importing
// anything at runtime.
declare global {
  interface Window {
    vibebox: VibeBoxApi
  }
}

export {}
