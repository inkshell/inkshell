/**
 * Monaco set-up, done once for the whole renderer. The editor and its diff view
 * are the app's file surfaces (see `ViewerView`); everything visual here is bent
 * to the Midnight Ink palette so a code pane still reads as part of the app.
 *
 * Deliberately lean: the core editor plus `basic-languages` — Monarch grammars
 * that syntax-highlight ~85 languages entirely on the main thread, with no
 * language service behind them. The rich TS/JS service is left out on purpose:
 * with no view of the project's tsconfig / node_modules it would underline good
 * code with red "cannot find module" errors, and the intelligence in this app
 * is the `claude` CLI, not this editor. JSON is the one rich mode kept — it
 * isn't a basic-language, and its validation flags real syntax errors (no false
 * positives from a missing project). So only the editor and JSON workers exist.
 *
 * Import paths use the exports-map form (`monaco-editor/<area>/…`, no `esm/vs/`
 * prefix): monaco's `package.json` rewrites `./*` to `./esm/vs/*.js`, so the
 * classic `esm/vs/…` path resolves to a doubled, non-existent file and the
 * production Rollup build fails on it. Workers go through Vite's `?worker`
 * imports rather than Monaco's CDN loader, which the renderer's CSP forbids.
 */
import * as monaco from 'monaco-editor/editor/editor.api'
import 'monaco-editor/basic-languages/monaco.contribution'
import 'monaco-editor/language/json/monaco.contribution'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker?worker'

self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === 'json') return new JsonWorker()
    return new EditorWorker()
  }
}

/** The app's editor theme — the same cool, no-warm palette as the CSS viewer. */
export const INKSHELL_THEME = 'inkshell-dark'

let defined = false

/** Registers {@link INKSHELL_THEME} on first use (idempotent). */
export function ensureTheme(): void {
  if (defined) return
  defined = true
  monaco.editor.defineTheme(INKSHELL_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: '', foreground: 'e8ebf4' },
      { token: 'comment', foreground: '7c869e', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'a2acff', fontStyle: 'bold' },
      { token: 'keyword.flow', foreground: 'a2acff', fontStyle: 'bold' },
      { token: 'operator', foreground: '99a3b8' },
      { token: 'delimiter', foreground: '99a3b8' },
      { token: 'string', foreground: '5fd8a4' },
      { token: 'string.escape', foreground: '4fd8e2' },
      { token: 'regexp', foreground: '5fd8a4' },
      { token: 'number', foreground: '4fd8e2' },
      { token: 'constant', foreground: '4fd8e2' },
      { token: 'type', foreground: 'b98bff' },
      { token: 'type.identifier', foreground: 'b98bff' },
      { token: 'class', foreground: 'b98bff' },
      { token: 'namespace', foreground: 'b98bff' },
      { token: 'function', foreground: '6f9dff' },
      { token: 'identifier', foreground: 'e8ebf4' },
      { token: 'variable', foreground: '7c8cff' },
      { token: 'variable.predefined', foreground: '7c8cff' },
      { token: 'attribute.name', foreground: '7c8cff' },
      { token: 'attribute.value', foreground: '5fd8a4' },
      { token: 'tag', foreground: '7c8cff' },
      { token: 'metatag', foreground: '99a3b8' },
      { token: 'annotation', foreground: '99a3b8' },
      { token: 'meta', foreground: '99a3b8' }
    ],
    colors: {
      'editor.background': '#0c0e13',
      'editor.foreground': '#e8ebf4',
      'editorLineNumber.foreground': '#586178',
      'editorLineNumber.activeForeground': '#99a3b8',
      'editorCursor.foreground': '#a2acff',
      'editor.selectionBackground': '#2b3560',
      'editor.inactiveSelectionBackground': '#20263c',
      'editor.selectionHighlightBackground': '#7c8cff22',
      'editor.lineHighlightBackground': '#12151d',
      'editor.lineHighlightBorder': '#00000000',
      'editorGutter.background': '#0c0e13',
      'editorIndentGuide.background1': '#191e28',
      'editorIndentGuide.activeBackground1': '#313a4a',
      'editorWhitespace.foreground': '#232a37',
      'editorWidget.background': '#161a23',
      'editorWidget.border': '#232a37',
      'input.background': '#0f1117',
      'input.border': '#232a37',
      'editorBracketMatch.background': '#7c8cff22',
      'editorBracketMatch.border': '#31407a',
      'editor.findMatchBackground': '#4fd8e255',
      'editor.findMatchHighlightBackground': '#4fd8e233',
      'scrollbarSlider.background': '#232a3799',
      'scrollbarSlider.hoverBackground': '#313a4aaa',
      'scrollbarSlider.activeBackground': '#313a4a',
      'diffEditor.insertedTextBackground': '#5fd8a41f',
      'diffEditor.removedTextBackground': '#ff6b811f',
      'diffEditor.insertedLineBackground': '#5fd8a416',
      'diffEditor.removedLineBackground': '#ff6b8116',
      'diffEditor.border': '#191e28'
    }
  })
}

export { monaco }
