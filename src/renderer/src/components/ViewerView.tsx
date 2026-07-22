import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FileContent, GitCommitDetail } from '@shared/types'
import type { Tab } from '../types'
import { relativeTime } from '../lib/format'
import { highlightLines, languageForPath } from '../lib/highlight'
import { CommitIcon, FileTextIcon, RefreshIcon } from './Icons'
import { StatusBadge } from './git-format'

interface Props {
  tab: Tab
  active: boolean
  onError: (message: string) => void
}

/** One parsed row of a unified diff, carrying its old/new line numbers. */
interface DiffRow {
  type: 'file' | 'hunk' | 'add' | 'del' | 'ctx'
  text: string
  oldNo?: number
  newNo?: number
}

/**
 * Parses `git`'s unified diff into rows the table renders directly. Purely
 * presentational lines (`index`, `---`, `+++`, mode/rename headers) are dropped;
 * a `diff --git a/… b/…` line becomes a file separator so a multi-file commit
 * patch reads as distinct sections.
 */
function parseDiff(diff: string): DiffRow[] {
  const rows: DiffRow[] = []
  let oldNo = 0
  let newNo = 0
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git')) {
      const m = line.match(/ b\/(.+)$/)
      rows.push({ type: 'file', text: m ? m[1] : line })
      continue
    }
    if (
      line.startsWith('index ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ') ||
      line.startsWith('new file') ||
      line.startsWith('deleted file') ||
      line.startsWith('old mode') ||
      line.startsWith('new mode') ||
      line.startsWith('similarity') ||
      line.startsWith('rename ') ||
      line.startsWith('copy ') ||
      line.startsWith('\\')
    ) {
      continue
    }
    if (line.startsWith('@@')) {
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (m) {
        oldNo = Number(m[1])
        newNo = Number(m[2])
      }
      rows.push({ type: 'hunk', text: line })
      continue
    }
    if (line.startsWith('+')) rows.push({ type: 'add', text: line.slice(1), newNo: newNo++ })
    else if (line.startsWith('-')) rows.push({ type: 'del', text: line.slice(1), oldNo: oldNo++ })
    else rows.push({ type: 'ctx', text: line.slice(1), oldNo: oldNo++, newNo: newNo++ })
  }
  // A trailing empty context row from the final newline reads as noise.
  if (rows.length && rows[rows.length - 1].type === 'ctx' && rows[rows.length - 1].text === '') {
    rows.pop()
  }
  return rows
}

/** The diff table — two line-number gutters (old / new) and the content. */
function DiffTable({ rows }: { rows: DiffRow[] }) {
  return (
    <table className="code">
      <tbody>
        {rows.map((r, i) =>
          r.type === 'file' ? (
            <tr key={i} className="file-sep">
              <td className="dln" />
              <td className="dln" />
              <td className="src">{r.text}</td>
            </tr>
          ) : r.type === 'hunk' ? (
            <tr key={i} className="hunk">
              <td className="dln" />
              <td className="dln" />
              <td className="src">{r.text}</td>
            </tr>
          ) : (
            <tr key={i} className={r.type}>
              <td className="dln">{r.oldNo != null ? r.oldNo : ''}</td>
              <td className="dln">{r.newNo != null ? r.newNo : ''}</td>
              <td className="src">
                <span className="sign">
                  {r.type === 'add' ? '+' : r.type === 'del' ? '-' : ' '}
                </span>
                {r.text || ' '}
              </td>
            </tr>
          )
        )}
      </tbody>
    </table>
  )
}

/** Small +N / −N stat chips shared by the diff and commit headers. */
function StatChips({ ins, del }: { ins: number; del: number }) {
  return (
    <>
      <span className="chip add">+{ins}</span>
      <span className="chip del">−{del}</span>
    </>
  )
}

/**
 * A read-only viewer tab: a working-tree diff, a project file, or a past
 * commit. It fetches once on mount (viewer tabs stay mounted for their whole
 * life, like terminals) and renders its own header — the model/context status
 * bar belongs to chat tabs, not these.
 */
export function ViewerView({ tab, active, onError }: Props) {
  const ref = tab.viewer
  const [diff, setDiff] = useState<string | null>(null)
  const [file, setFile] = useState<FileContent | null>(null)
  const [commit, setCommit] = useState<GitCommitDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const lineRef = useRef<HTMLTableRowElement>(null)

  // Highlighting the whole file once per load (rather than per row) is what
  // lets multi-line tokens — a block comment, a template literal — stay
  // colored correctly across the row split below.
  const fileLines = useMemo(() => {
    if (!ref || ref.kind !== 'file') return []
    return highlightLines(file?.content ?? '', languageForPath(ref.path ?? ''))
  }, [ref, file])

  const load = useCallback(async () => {
    if (!ref) return
    setLoading(true)
    try {
      if (ref.kind === 'diff' && ref.path != null) {
        setDiff(await window.inkshell.git.diff(ref.project, ref.path, ref.staged ?? false))
      } else if (ref.kind === 'file' && ref.path != null) {
        setFile(await window.inkshell.fs.read(ref.project, ref.path))
      } else if (ref.kind === 'commit' && ref.hash != null) {
        setCommit(await window.inkshell.git.show(ref.project, ref.hash))
      }
    } catch (err) {
      onError(`Couldn't open: ${err instanceof Error ? err.message : err}`)
    } finally {
      setLoading(false)
    }
  }, [ref, onError])

  useEffect(() => {
    load()
  }, [load])

  // Reveal the line a terminal link pointed at, once its row exists. A hidden
  // tab can't be scrolled meaningfully, so this waits for it to be shown.
  useEffect(() => {
    if (!active || loading || ref?.line == null) return
    lineRef.current?.scrollIntoView({ block: 'center' })
  }, [active, loading, ref?.line, file])

  if (!ref) return null

  const rows = diff != null ? parseDiff(diff) : []
  const ins = rows.filter((r) => r.type === 'add').length
  const del = rows.filter((r) => r.type === 'del').length

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
          </span>
          {ref.kind === 'diff' ? (
            <StatChips ins={ins} del={del} />
          ) : (
            <span className="chip ro">Read only</span>
          )}
          <span className="vw-spacer" />
          {ref.kind === 'diff' && (
            <button className="vw-btn" title="Reload" onClick={load}>
              <RefreshIcon size={13} />
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
            <table className="code">
              <tbody>
                {fileLines.map((html, i) => (
                  <tr
                    key={i}
                    ref={ref.line === i + 1 ? lineRef : undefined}
                    className={ref.line === i + 1 ? 'hl' : undefined}
                  >
                    <td className="dln">{i + 1}</td>
                    <td className="src" dangerouslySetInnerHTML={{ __html: html || ' ' }} />
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : ref.kind === 'diff' ? (
          rows.length === 0 ? (
            <div className="vw-note">No changes to show.</div>
          ) : (
            <DiffTable rows={rows} />
          )
        ) : (
          <>
            {commit && (
              <div className="commit-files">
                <div className="grp">
                  CHANGED FILES <span className="grp-n">{commit.files.length}</span>
                </div>
                {commit.files.map((f) => (
                  <div className="frow static" key={f.path}>
                    <StatusBadge status={f.status} />
                    <span className="fn">{f.path.split('/').pop()}</span>
                    <span className="fp">{f.path.split('/').slice(0, -1).join('/')}</span>
                  </div>
                ))}
              </div>
            )}
            <DiffTable rows={rows} />
          </>
        )}
      </div>
    </div>
  )
}
