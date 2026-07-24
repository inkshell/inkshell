import { useEffect, useRef } from 'react'
import { ensureTheme, INKSHELL_THEME, monaco } from '../lib/monaco'

// A monotonic id woven into every model URI so no two ever collide — not across
// diff tabs showing the same path, nor across a single view's rebuilds (a
// Reload, a commit-file switch). The filename still ends the path, so Monaco
// reads the language off it.
let modelSeq = 0

interface Props {
  original: string
  modified: string
  /** Project dir + path, together the models' unique identity and language hint. */
  project: string
  path: string
  fontSize: number
  /** Whether this tab is visible — drives the layout pass Monaco needs when shown. */
  active: boolean
  /** Bumped by the caller to force a fresh diff (e.g. selecting another commit file). */
  revision?: string | number
}

/**
 * A read-only Monaco diff editor bound to one before/after pair. Monaco computes
 * the diff itself from the two texts, so this replaces the app's hand-rolled
 * unified-diff parser. Driven imperatively like {@link CodeEditor}; the models
 * are swapped in place when `revision` changes rather than the editor rebuilt.
 */
export function DiffView({ original, modified, project, path, fontSize, active, revision }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    ensureTheme()
    const editor = monaco.editor.createDiffEditor(host, {
      theme: INKSHELL_THEME,
      readOnly: true,
      originalEditable: false,
      automaticLayout: false,
      renderSideBySide: true,
      useInlineViewWhenSpaceIsLimited: true,
      fontSize,
      fontFamily:
        "'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, 'Liberation Mono', monospace",
      lineNumbersMinChars: 4,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderOverviewRuler: true,
      scrollbar: { verticalScrollbarSize: 11, horizontalScrollbarSize: 11 }
    })
    editorRef.current = editor

    const ro = new ResizeObserver(() => editor.layout())
    ro.observe(host)

    return () => {
      ro.disconnect()
      const model = editor.getModel()
      editor.dispose()
      model?.original.dispose()
      model?.modified.dispose()
      editorRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // (Re)build the two models whenever the content or target changes. Each pair
  // gets a fresh, globally unique URI, so the new models never clash with the
  // outgoing ones (disposed only after the swap) or with another diff tab.
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const prev = editor.getModel()
    const n = ++modelSeq
    const diffScheme = 'inkshell-diff'
    const originalModel = monaco.editor.createModel(
      original,
      undefined,
      monaco.Uri.from({ scheme: diffScheme, path: `/${n}/original/${path}` })
    )
    const modifiedModel = monaco.editor.createModel(
      modified,
      undefined,
      monaco.Uri.from({ scheme: diffScheme, path: `/${n}/modified/${path}` })
    )
    editor.setModel({ original: originalModel, modified: modifiedModel })
    prev?.original.dispose()
    prev?.modified.dispose()
  }, [original, modified, project, path, revision])

  useEffect(() => {
    editorRef.current?.updateOptions({ fontSize })
  }, [fontSize])

  useEffect(() => {
    if (active) editorRef.current?.layout()
  }, [active])

  return <div className="code-editor" ref={hostRef} />
}
