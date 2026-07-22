import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { fuzzyMatch } from '../lib/fuzzy'
import { FileTextIcon, SearchIcon } from './Icons'
import { TooltipHost, useTooltip } from './Tooltip'

interface Props {
  /** The active tab's project directory — the same scope the Files panel reads. */
  project: string
  /** Display name, for the empty-state hint. */
  projectName: string
  /** This project's accent colour, tinting the picker like its tabs and sidebar row. */
  accent: string | null
  onOpenFile: (path: string) => void
  onClose: () => void
}

interface FileHit {
  path: string
  indices: number[]
  score: number
}

/** Past this many matches the list stops growing — plenty to scroll, cheap to render. */
const MAX_RESULTS = 60

/** One path split into its directory and base name, for the two-tone row. */
function splitPath(path: string): { dir: string; base: string; baseStart: number } {
  const slash = path.lastIndexOf('/')
  if (slash === -1) return { dir: '', base: path, baseStart: 0 }
  return { dir: path.slice(0, slash), base: path.slice(slash + 1), baseStart: slash + 1 }
}

/** Renders `text` with the characters at `indices` (offset by `from`) marked. */
function renderMarked(text: string, indices: number[], from: number): ReactNode {
  const marked = new Set(indices)
  return text.split('').map((ch, i) => (marked.has(from + i) ? <mark key={i}>{ch}</mark> : ch))
}

/**
 * ⌘P / Ctrl+P — a floating fuzzy file finder over the active project. It opens
 * the same viewer tabs the project panel's Files tab does; this is just a
 * keyboard-reachable shortcut to the same place, not a second file system.
 */
export function QuickOpen({ project, projectName, accent, onOpenFile, onClose }: Props) {
  const [files, setFiles] = useState<string[] | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { tip, bind } = useTooltip()

  useEffect(() => {
    let cancelled = false
    setFiles(null)
    window.inkshell.fs.listAllFiles(project).then((list) => {
      if (!cancelled) setFiles(list)
    })
    return () => {
      cancelled = true
    }
  }, [project])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Capture phase, matching the app's other modal Escape handlers — it must
  // beat xterm's own key handling in the terminal underneath.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const hits = useMemo<FileHit[]>(() => {
    if (!files || !query.trim()) return []
    const q = query.trim()
    const out: FileHit[] = []
    for (const path of files) {
      const m = fuzzyMatch(q, path)
      if (m.matched) out.push({ path, indices: m.indices, score: m.score })
    }
    out.sort((a, b) => a.score - b.score)
    return out.slice(0, MAX_RESULTS)
  }, [files, query])

  useEffect(() => setSelected(0), [query])
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${selected}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const openAt = (i: number) => {
    const hit = hits[i]
    if (hit) onOpenFile(hit.path)
  }

  const style = { ['--session' as string]: accent ?? 'var(--accent)' } as CSSProperties

  return (
    <div className="overlay qopen-overlay" onMouseDown={onClose}>
      <div
        className="modal qopen-modal"
        style={style}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Quick open"
      >
        <div className="qopen-input">
          <SearchIcon size={15} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                if (hits.length) setSelected((s) => (s + 1) % hits.length)
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                if (hits.length) setSelected((s) => (s - 1 + hits.length) % hits.length)
              } else if (e.key === 'Enter') {
                e.preventDefault()
                openAt(selected)
              }
            }}
            placeholder={`Search files in ${projectName}…`}
            aria-label="Search files"
            autoComplete="off"
            spellCheck={false}
          />
          <span className="kbd">esc</span>
        </div>

        <div className="qopen-list" ref={listRef}>
          {files === null ? (
            <div className="qopen-empty">Loading…</div>
          ) : !query.trim() ? (
            <div className="qopen-empty">
              Type to search files in <strong>{projectName}</strong>
            </div>
          ) : hits.length === 0 ? (
            <div className="qopen-empty">No files match “{query.trim()}”.</div>
          ) : (
            hits.map((hit, i) => {
              const { dir, base, baseStart } = splitPath(hit.path)
              const tipHandlers = bind(hit.path)
              return (
                <button
                  key={hit.path}
                  data-idx={i}
                  className={`frow ${i === selected ? 'sel' : ''}`}
                  onMouseEnter={(e) => {
                    setSelected(i)
                    tipHandlers.onMouseEnter(e)
                  }}
                  onMouseLeave={tipHandlers.onMouseLeave}
                  onClick={() => openAt(i)}
                >
                  <span className="fi2">
                    <FileTextIcon size={13} />
                  </span>
                  <span className="fn">{renderMarked(base, hit.indices, baseStart)}</span>
                  {dir && <span className="fp">{renderMarked(dir, hit.indices, 0)}</span>}
                </button>
              )
            })
          )}
        </div>

        <div className="empty-keys qopen-foot">
          <span className="kbd">↑</span>
          <span className="kbd">↓</span>
          <span>Navigate</span>
          <span className="kbd">↵</span>
          <span>Open</span>
          <span className="kbd">esc</span>
          <span>Close</span>
          {hits.length > 0 && (
            <span className="cnt">
              {hits.length}
              {hits.length === MAX_RESULTS ? '+' : ''} match{hits.length === 1 ? '' : 'es'}
            </span>
          )}
        </div>
      </div>

      <TooltipHost tip={tip} />
    </div>
  )
}
