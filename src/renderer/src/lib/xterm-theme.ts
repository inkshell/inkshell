import type { ITheme } from '@xterm/xterm'

/**
 * Cool "midnight ink" terminal palette matching the app chrome. Kept in sync
 * with `--bg-terminal` in theme.css so the terminal blends into its card.
 */
export const terminalTheme: ITheme = {
  foreground: '#e2e6f0',
  background: '#090b10',
  cursor: '#7c8cff',
  cursorAccent: '#090b10',
  selectionBackground: '#2a3350',
  black: '#090b10',
  red: '#ff6b81',
  green: '#5fd8a4',
  yellow: '#f5c366',
  blue: '#6f9dff',
  magenta: '#b98bff',
  cyan: '#4fd8e2',
  white: '#c7cdda',
  /* The CLI paints its dim text (paths, hints, box rules) in bright black, so
     this tracks `--text-faint` and must stay legible, not decorative. */
  brightBlack: '#7c869e',
  brightRed: '#ff8a9b',
  brightGreen: '#84e6bd',
  brightYellow: '#ffd68a',
  brightBlue: '#95b7ff',
  brightMagenta: '#cfa8ff',
  brightCyan: '#7fe8ef',
  brightWhite: '#f3f5fa'
}
