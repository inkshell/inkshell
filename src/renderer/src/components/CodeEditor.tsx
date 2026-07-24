import { useEffect, useRef } from 'react'
import { ensureTheme, INKSHELL_THEME, monaco } from '../lib/monaco'

interface Props {
  /** Initial text. The Monaco model owns the buffer after mount — later `value`
   *  changes are ignored (remount via a React `key` to load a different file). */
  value: string
  /** Project dir + project-relative path, together the model's unique identity
   *  and the hint Monaco reads the language off of. */
  project: string
  path: string
  readOnly: boolean
  fontSize: number
  /** Whether this tab is the visible one — drives the layout pass Monaco needs
   *  after being unhidden, since hidden tabs render at zero size. */
  active: boolean
  /** 1-based line to reveal + place the cursor on once shown (a terminal link). */
  revealLine?: number
  onChange?: (value: string) => void
  /** ⌘S / Ctrl+S inside the editor. */
  onSave?: () => void
}

/**
 * A Monaco editor bound to one file for its whole life. Everything is driven
 * imperatively (Monaco owns its own DOM and buffer); React only mounts the host
 * node and forwards prop changes — font size, visibility-triggered layout — onto
 * the live instance.
 */
export function CodeEditor({
  value,
  project,
  path,
  readOnly,
  fontSize,
  active,
  revealLine,
  onChange,
  onSave
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  // Latest callbacks, so the editor's commands/listeners always see current
  // props without being torn down and rebuilt on every render.
  const onSaveRef = useRef(onSave)
  const onChangeRef = useRef(onChange)
  onSaveRef.current = onSave
  onChangeRef.current = onChange

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    ensureTheme()

    // One model per project+path, so the same relative path in two projects
    // can't collide. A stale model of the exact same file (a remount) is ours
    // to replace — only one viewer tab per file ever exists.
    const uri = monaco.Uri.file(`${project}/${path}`)
    monaco.editor.getModel(uri)?.dispose()
    const model = monaco.editor.createModel(value, undefined, uri)

    const editor = monaco.editor.create(host, {
      model,
      theme: INKSHELL_THEME,
      readOnly,
      fontSize,
      fontFamily:
        "'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, 'Liberation Mono', monospace",
      lineNumbersMinChars: 4,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      renderLineHighlight: 'all',
      automaticLayout: false,
      padding: { top: 8, bottom: 8 },
      tabSize: 2,
      wordWrap: 'off',
      scrollbar: { verticalScrollbarSize: 11, horizontalScrollbarSize: 11 }
    })
    editorRef.current = editor

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onSaveRef.current?.())
    const sub = model.onDidChangeContent(() => onChangeRef.current?.(model.getValue()))

    // Monaco doesn't reflow itself here (automaticLayout is off, which uses a
    // polling loop); a ResizeObserver relays both container resizes and the
    // hidden→shown transition into an explicit layout.
    const ro = new ResizeObserver(() => editor.layout())
    ro.observe(host)

    return () => {
      ro.disconnect()
      sub.dispose()
      editor.dispose()
      model.dispose()
      editorRef.current = null
    }
    // Mount once for this file; `value`/callbacks are handled via refs above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, path, readOnly])

  useEffect(() => {
    editorRef.current?.updateOptions({ fontSize })
  }, [fontSize])

  // Lay out + reveal the target line when this tab becomes the visible one — a
  // hidden editor can't measure itself or scroll meaningfully.
  useEffect(() => {
    if (!active) return
    const editor = editorRef.current
    if (!editor) return
    editor.layout()
    if (revealLine != null) {
      editor.revealLineInCenter(revealLine)
      editor.setPosition({ lineNumber: revealLine, column: 1 })
    }
  }, [active, revealLine])

  return <div className="code-editor" ref={hostRef} />
}
