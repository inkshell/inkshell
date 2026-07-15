import { app, BrowserWindow, shell } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const isMac = process.platform === 'darwin'

/**
 * Dev/CI hook: with VIBEBOX_SCREENSHOT=<path.png> set, captures the window a
 * moment after it renders, writes the PNG, and quits. Uses `capturePage`, so it
 * needs no screen-recording permission — the app reads its own framebuffer.
 */
function maybeCaptureScreenshot(window: BrowserWindow): void {
  const path = process.env['VIBEBOX_SCREENSHOT']
  if (!path) return
  const delay = Number(process.env['VIBEBOX_SCREENSHOT_DELAY'] ?? 1400)
  window.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const image = await window.webContents.capturePage()
        await writeFile(path, image.toPNG())
      } catch (err) {
        console.error('[vibebox] screenshot failed:', err)
      } finally {
        app.quit()
      }
    }, delay)
  })
}

/**
 * Creates the main window with a frameless, seamless look: on macOS the traffic
 * lights float over the sidebar (`hiddenInset`); elsewhere the frame is dropped
 * entirely and the renderer paints its own window controls. The title bar area
 * is made draggable in CSS via `-webkit-app-region`.
 */
export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 820,
    minHeight: 520,
    show: false,
    backgroundColor: '#0c0e13',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 18, y: 20 } : undefined,
    frame: isMac,
    webPreferences: {
      // electron-vite emits the preload as ESM (`.mjs`) because the package is
      // `"type": "module"`; Electron loads it as an ESM preload (sandbox off).
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  window.on('ready-to-show', () => window.show())
  maybeCaptureScreenshot(window)

  // Open target=_blank / external links in the user's browser, never in-app.
  // Only web URLs are forwarded: `openExternal` hands whatever it's given to the
  // OS, and a scheme with no app behind it (`about:blank`, say) surfaces as a
  // system modal offering the App Store — so anything else is dropped here
  // rather than shown to the user. It also rejects on failure, and an unhandled
  // rejection in main is a crash risk, so the promise is always caught.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch((err) => {
        console.error(`Failed to open ${url} externally:`, err)
      })
    }
    return { action: 'deny' }
  })

  // electron-vite injects the dev server URL in development; production loads the
  // built renderer from disk.
  if (process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}
