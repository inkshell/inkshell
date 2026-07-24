import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { DiffContent, FileContent, GitCommitDetail } from '@shared/types'
import type { Tab, ViewerRef } from '../types'
import { relativeTime } from '../lib/format'
import { CommitIcon, EditIcon, FileTextIcon, RefreshIcon, SaveIcon } from './Icons'
import { StatusBadge } from './git-format'

// Monaco is ~8 MB — code-split so it's fetched only when a viewer tab first
// opens, keeping app startup (which imports this component eagerly) off that cost.
const CodeEditor = lazy(() => import('./CodeEditor').then((m) => ({ default: m.CodeEditor })))
const DiffView = lazy(() => import('./DiffView').then((m) => ({ default: m.DiffView })))

interface Props {
  tab: Tab
  active: boolean
  /** Editor font size (px), shared with the terminal's A−/A+ control. */
  fontSize: number
  onError: (message: string) => void
  /** Reports the file tab's unsaved-changes state up to `App` (pin + close guard). */
  onDirtyChange?: (dirty: boolean) => void
  /** Opens a viewer tab — used by the diff header's "open the editable file" button. */
  onOpenViewer?: (ref: ViewerRef) => void
}

/** Small +N / −N stat chips shown in the commit header. */
function StatChips({ ins, del }: { ins: number; del: number }) {
  return (
    <>
      <span className="chip add">+{ins}</span>
      <span className="chip del">−{del}</span>
    </>
  )
}

/** The Monaco diff editor, or a notice when a side is binary/oversized. */
function DiffBody({
  content,
  project,
  path,
  fontSize,
  active,
  revision
}: {
  content: DiffContent
  project: string
  path: string
  fontSize: number
  active: boolean
  revision?: string | number
}) {
  if (content.binary) {
    return <div className="vw-note">Binary file, or too large to display.</div>
  }
  return (
    <Suspense fallback={<div className="vw-note">Loading diff…</div>}>
      <DiffView
        original={content.original}
        modified={content.modified}
        project={project}
        path={path}
        fontSize={fontSize}
        active={active}
        revision={revision}
      />
    </Suspense>
  )
}

/**
 * A viewer tab: a working-tree diff, an editable project file, or a past commit.
 * It fetches once on mount (viewer tabs stay mounted for their whole life, like
 * terminals) and renders its own header — the model/context status bar belongs
 * to chat tabs, not these. File tabs are editable: edits live in the Monaco
 * buffer, ⌘S / the Save button writes them back through `fs.write`, and the
 * unsaved state is reported up so `App` can pin the tab and guard its close.
 * Diffs and commits use Monaco's diff editor over the before/after file text.
 */
export function ViewerView({ tab, active, fontSize, onError, onDirtyChange, onOpenViewer }: Props) {
  const ref = tab.viewer
  const [fileDiff, setFileDiff] = useState<DiffContent | null>(null)
  const [file, setFile] = useState<FileContent | null>(null)
  const [commit, setCommit] = useState<GitCommitDetail | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [commitDiff, setCommitDiff] = useState<DiffContent | null>(null)
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  // The Monaco buffer's current text (the draft) and the last-saved text; their
  // difference is the dirty flag. Kept in refs so a save reads the latest text
  // without this component re-rendering on every keystroke.
  const draftRef = useRef('')
  const savedRef = useRef('')
  // Guards `save` against re-entry: ⌘S can fire again while a write is still in
  // flight, which would start a concurrent write and flicker the saving state.
  const savingRef = useRef(false)

  // The parent's callbacks, held in refs. `onDirtyChange` in particular arrives
  // as a fresh inline closure on every parent render; if the loader below
  // depended on it, it would re-run — and momentarily unmount the editor,
  // discarding in-progress edits — on every keystroke. Refs keep the loader
  // keyed only to the file it shows.
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const onDirtyChangeRef = useRef(onDirtyChange)
  onDirtyChangeRef.current = onDirtyChange

  // Only surface a dirty transition (not every keystroke) to the parent. Stable
  // across renders so it never destabilises the loader.
  const setDirtyState = useCallback((next: boolean) => {
    setDirty((prev) => {
      if (prev !== next) onDirtyChangeRef.current?.(next)
      return next
    })
  }, [])

  // The identity of what's being shown — the loader keys off these primitives,
  // not the `ref` object or a callback, so it fires once per target, not on
  // every render.
  const kind = ref?.kind
  const project = ref?.project
  const path = ref?.path
  const hash = ref?.hash
  const staged = ref?.staged

  const load = useCallback(async () => {
    if (kind == null || project == null) return
    setLoading(true)
    try {
      if (kind === 'diff' && path != null) {
        setFileDiff(await window.inkshell.git.fileDiff(project, path, staged ?? false))
      } else if (kind === 'file' && path != null) {
        const f = await window.inkshell.fs.read(project, path)
        draftRef.current = f.content
        savedRef.current = f.content
        setDirtyState(false)
        setFile(f)
      } else if (kind === 'commit' && hash != null) {
        const c = await window.inkshell.git.show(project, hash)
        setCommit(c)
        setSelectedFile(c.files[0]?.path ?? null)
      }
    } catch (err) {
      onErrorRef.current(`Couldn't open: ${err instanceof Error ? err.message : err}`)
    } finally {
      setLoading(false)
    }
  }, [kind, project, path, hash, staged, setDirtyState])

  useEffect(() => {
    load()
  }, [load])

  // The selected commit file's before/after, fetched whenever the selection
  // (or the commit) changes.
  useEffect(() => {
    if (!project || !hash || !commit || !selectedFile) return
    const f = commit.files.find((x) => x.path === selectedFile)
    if (!f) return
    let cancelled = false
    setCommitDiff(null)
    window.inkshell.git
      .commitFileDiff(project, hash, f.path, f.origPath)
      .then((d) => {
        if (!cancelled) setCommitDiff(d)
      })
      .catch((err) =>
        onErrorRef.current(`Couldn't open: ${err instanceof Error ? err.message : err}`)
      )
    return () => {
      cancelled = true
    }
  }, [project, hash, commit, selectedFile])

  const onEditorChange = useCallback(
    (text: string) => {
      draftRef.current = text
      setDirtyState(text !== savedRef.current)
    },
    [setDirtyState]
  )

  const save = useCallback(async () => {
    if (kind !== 'file' || project == null || path == null) return
    if (savingRef.current) return
    if (draftRef.current === savedRef.current) return
    savingRef.current = true
    setSaving(true)
    // Snapshot the text being written, so `savedRef` records exactly what landed
    // on disk rather than whatever the buffer holds by the time the write ends.
    const pending = draftRef.current
    try {
      await window.inkshell.fs.write(project, path, pending)
      savedRef.current = pending
      setDirtyState(draftRef.current !== pending)
    } catch (err) {
      onErrorRef.current(`Couldn't save: ${err instanceof Error ? err.message : err}`)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [kind, project, path, setDirtyState])

  // Jump from a diff to the editable file it's diffing — same project + path,
  // opened as a real (non-preview) file tab.
  const openFile = useCallback(() => {
    if (project == null || path == null) return
    onOpenViewer?.({
      kind: 'file',
      project,
      claudeConfigDir: ref?.claudeConfigDir ?? null,
      path,
      label: ref?.label ?? path.split('/').pop() ?? path,
      dir: ref?.dir
    })
  }, [project, path, ref, onOpenViewer])

  if (!ref) return null

  return (
    <div className="viewer" hidden={!active}>
      {ref.kind === 'commit' ? (
        <div className="vw-head">
          <span className="vw-glyph">
            <CommitIcon size={13} />
          </span>
          {commit && <span className="chip hash">{commit.shortHash}</span>}
          <span className="vw-path" title={commit?.subject}>
            {commit?.subject ?? ref.label}
          </span>
          {commit && <StatChips ins={commit.insertions} del={commit.deletions} />}
          <span className="vw-spacer" />
          {commit && (
            <span className="vw-meta">
              {commit.author} · {relativeTime(commit.dateMs)}
            </span>
          )}
          <button className="vw-btn" title="Reload" onClick={load}>
            <RefreshIcon size={13} />
          </button>
        </div>
      ) : (
        <div className="vw-head">
          <span className="vw-glyph">
            <FileTextIcon size={13} />
          </span>
          <span className="vw-path" title={ref.path}>
            {ref.dir && <span className="dir">{ref.dir}/</span>}
            {ref.label}
            {ref.kind === 'file' && dirty && <span className="vw-dirty" title="Unsaved changes" />}
          </span>
          <span className="vw-spacer" />
          {ref.kind === 'diff' ? (
            <>
              <button className="vw-btn" title="Open the editable file" onClick={openFile}>
                <EditIcon size={13} />
              </button>
              <button className="vw-btn" title="Reload" onClick={load}>
                <RefreshIcon size={13} />
              </button>
            </>
          ) : (
            <button
              className="vw-btn save"
              title="Save (⌘S)"
              onClick={save}
              disabled={!dirty || saving}
            >
              <SaveIcon size={13} />
            </button>
          )}
        </div>
      )}

      <div className="vw-body">
        {loading ? (
          <div className="vw-note">Loading…</div>
        ) : ref.kind === 'file' ? (
          file?.tooLarge ? (
            <div className="vw-note">Binary file, or too large to display.</div>
          ) : (
            <Suspense fallback={<div className="vw-note">Loading editor…</div>}>
              <CodeEditor
                value={file?.content ?? ''}
                project={ref.project}
                path={ref.path ?? ''}
                readOnly={false}
                fontSize={fontSize}
                active={active}
                revealLine={ref.line}
                onChange={onEditorChange}
                onSave={save}
              />
            </Suspense>
          )
        ) : ref.kind === 'diff' ? (
          fileDiff && ref.path != null ? (
            <DiffBody
              content={fileDiff}
              project={ref.project}
              path={ref.path}
              fontSize={fontSize}
              active={active}
            />
          ) : (
            <div className="vw-note">No changes to show.</div>
          )
        ) : (
          <div className="commit-body">
            {commit && (
              <div className="commit-files">
                <div className="grp">
                  CHANGED FILES <span className="grp-n">{commit.files.length}</span>
                </div>
                {commit.files.map((f) => (
                  <button
                    key={f.path}
                    className={`frow${f.path === selectedFile ? ' sel' : ''}`}
                    onClick={() => setSelectedFile(f.path)}
                  >
                    <StatusBadge status={f.status} />
                    <span className="fn">{f.path.split('/').pop()}</span>
                    <span className="fp">{f.path.split('/').slice(0, -1).join('/')}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="cf-diff">
              {commitDiff && selectedFile ? (
                <DiffBody
                  content={commitDiff}
                  project={ref.project}
                  path={selectedFile}
                  fontSize={fontSize}
                  active={active}
                  revision={selectedFile}
                />
              ) : (
                <div className="vw-note">
                  {commit?.files.length ? 'Loading diff…' : 'No changes.'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
